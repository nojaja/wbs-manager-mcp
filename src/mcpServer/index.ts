//console.errorでPIDを返す
console.error('[MCP Server] Starting stdio MCP server... PID:', process.pid);
import { initializeDatabase, WBSRepository } from './db-simple';
import { ToolRegistry } from './tools/ToolRegistry';

// Create a global registry instance for tools
const toolRegistry = new ToolRegistry();
// Create shared repository instance to inject into tools
const sharedRepo = new WBSRepository();
toolRegistry.setDeps({ repo: sharedRepo });
// Note: we'll load tools dynamically from ./tools in a later step

interface JsonRpcRequest {
    jsonrpc: string;
    id?: number | string;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: string;
    id?: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

interface JsonRpcNotification {
    jsonrpc: string;
    method: string;
    params?: any;
}

/**
 * 処理名: Stdio MCP サーバ（クラス）
 * 処理概要: 標準入出力を使って JSON-RPC 形式のメッセージを受信し、DB 操作／ツール呼び出しを仲介して応答を返すサーバ実装。
 * 実装理由: VSCode 拡張側と分離してサーバ側の DB やツールを独立して扱うため。標準入出力でのやり取りにより拡張とプロセス間通信を簡潔に保つ。
 */
class StdioMCPServer {
    private repo: WBSRepository;

    /**
     * 処理名: コンストラクタ
     * 処理概要: WBSRepository のインスタンスを作成し、標準入出力の受信ハンドラを設定する
     * 実装理由: サーバが扱うデータ層（リポジトリ）と通信ハンドラを初期化して、以降のメッセージ処理を一元的に行うため
     */
    constructor() {
        this.repo = new WBSRepository();
        this.setupStdioHandlers();
    }

    /**
     * 処理名: 標準入出力ハンドラ設定
     * 処理概要: process.stdin に対してデータイベントと end イベントを登録し、受信したバイト列を行単位で分割して JSON-RPC メッセージとして処理する
     * 実装理由: ストリームは任意の境界で切れるためバッファリングして行単位で安全にパースし、途中受信や複数メッセージの同時到着を扱うため
     */
    private setupStdioHandlers() {
        process.stdin.setEncoding('utf8');
        let buffer = '';

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            // 1行ずつ JSON-RPC メッセージとして処理するループ
            // 処理概要: split によって得た各行を順にパースして handleMessage に渡す
            // 実装理由: ストリームがメッセージの途中で切れることや複数メッセージが単一チャンクで来るケースに対応するため
            for (const line of lines) {
                // 空行は意図せぬノイズなので無視する
                if (!line.trim()) continue;

                // JSON パースは例外を投げる可能性があるため個別に try/catch で保護する
                // 処理概要: パース成功で handleMessage を呼ぶ。失敗時はログに記録して次の行へ進む
                // 実装理由: 不正な入力によりサーバ全体が停止するのを防ぎ、問題の行だけを無害化するため
                try {
                    const message = JSON.parse(line.trim());
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[MCP Server] Failed to parse message:', error);
                }
            }
        });

        process.stdin.on('end', () => {
            // 処理概要: stdin の終了を受けてプロセスを終了する
            // 実装理由: 親プロセス側の入力が終了した場合、サーバ側もクリーンに終了する必要があるため
            console.error('[MCP Server] Stdin ended, exiting...');
            process.exit(0);
        });

        // Handle process termination
        process.on('SIGINT', () => {
            console.error('[MCP Server] Received SIGINT, exiting...');
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            console.error('[MCP Server] Received SIGTERM, exiting...');
            process.exit(0)
        });
    }

    /**
     * 処理名: メッセージ受信ハンドラ
     * 処理概要: 受信した JSON-RPC メッセージをログ出力し、リクエストか通知かで処理を分岐する
     * 実装理由: JSON-RPC の仕様に従い、id の有無でレスポンスが必要か判定し適切に handleRequest / handleNotification を呼び出すため
     * @param message 受信メッセージ
     */
    private async handleMessage(message: JsonRpcRequest | JsonRpcNotification) {
        try {
            console.error(`[MCP Server] Received: ${message.method}`, message.params);

            // id プロパティの有無でリクエスト/通知を判定
            // 処理概要: リクエストはレスポンスを返す必要があるため handleRequest を呼び、通知は handleNotification に委譲する
            // 実装理由: クライアントとサーバ間での同期的な呼び出し/非同期通知を正しく扱うため
            if ('id' in message) {
                // Request - needs response
                const response = await this.handleRequest(message as JsonRpcRequest);
                this.sendResponse(message.method, response);
            } else {
                // Notification - no response needed
                await this.handleNotification(message as JsonRpcNotification);
            }
        } catch (error) {
            // 処理概要: message 処理中の例外はログに出力し、リクエストの場合はエラー応答を返す
            // 実装理由: 通知は一方向通信なので応答しないが、リクエストは呼び出し元が結果を待っているためエラーを返却する必要がある
            console.error('[MCP Server] Error handling message:', error);
            if ('id' in message) {
                this.sendResponse(message.method, {
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : String(error)
                    }
                });
            }
        }
    }

    /**
     * 処理名: リクエストハンドラ
     * 処理概要: JSON-RPC リクエストのメソッド名に応じて適切なレスポンスを返す。内部的にはツール呼び出しやリソース情報の返却を行う
     * 実装理由: クライアント API をサーバの機能（ツール実行やリソース提供）にマッピングするため
     * @param request リクエストオブジェクト
     * @returns レスポンスオブジェクト
     */
    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { method, params, id } = request;

        // メソッド名ごとに処理を分岐する switch ブロック
        // 処理概要: 各 API 名に対応したレスポンス/副作用を実行する
        // 実装理由: 単一エンドポイント（JSON-RPC）で複数機能を提供するため、明示的に分岐して処理を管理する
        switch (method) {
            case 'initialize':
                // 処理概要: サーバの基本情報・機能一覧を返す
                // 実装理由: クライアントがサーバの能力やバージョンを把握するため必要
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'wbs-mcp-server',
                            version: '0.1.0'
                        }
                    }
                };

            case 'tools/list':
                // 処理概要: 登録済みツール一覧を返す
                // 実装理由: クライアントが利用可能なツールを列挙して UI 等で表示するため
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: toolRegistry.list()
                    }
                };

            case 'tools/call':
                {
                    // 処理概要: 指定されたツール名でツールを実行し結果を返す
                    // 実装理由: 拡張から具体的な処理（タスク作成/取得等）をリクエストできるようにするため
                    const toolResult = await toolRegistry.execute(params?.name, params?.arguments ?? {});
                    return { jsonrpc: '2.0', id, result: toolResult };
                }

            case 'ping':
                // 処理概要: 単純な疎通確認（空の結果を返す）
                // 実装理由: クライアントがサーバとの接続状態を確認するため
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };

            case 'resources/list':
                // 処理概要: リソース一覧を返す（現状未実装で空配列）
                // 実装理由: 将来的に外部リソースを列挙する API のプレースホルダ
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: []
                    }
                };

            case 'prompts/list':
                // 処理概要: プロンプト一覧を返す（現状未実装で空配列）
                // 実装理由: 将来の拡張でプロンプトを提供するためのプレースホルダ
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        prompts: []
                    }
                };

            default:
                // 未知のメソッドは明示的にエラー応答を返す
                // 処理概要: サポート外のメソッド呼び出しに対して Method not found エラーを返す
                // 実装理由: クライアント側の誤実装やタイプミスを早期に検出できるようにするため
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
        }
    }

    /**
     * 処理名: 通知ハンドラ
     * 処理概要: JSON-RPC の通知メッセージを受け取り、現状はログ出力のみを行う
     * 実装理由: 通知は応答不要の一方向メッセージであり、将来的にイベント処理を追加するための受け口を確保する
     * @param notification 通知オブジェクト
     */
    private async handleNotification(notification: JsonRpcNotification) {
        const { method } = notification;
        // 処理概要: 通知を受けてログに記録する（軽量な受け流し実装）
        // 実装理由: 通知の多数到着や非同期イベントを簡潔に扱うため、現状はログに残すだけにする
        console.error(`[MCP Server] Notification received: ${method}`);
        return;
    }


    /**
     * 処理名: レスポンス送信
     * 処理概要: JSON-RPC レスポンスオブジェクトを文字列化して標準出力に書き出す
     * 実装理由: 拡張クライアントは標準出力の各行を JSON-RPC レスポンスとして読み取るため、正確に一行ずつ出力する必要がある
     * @param method メソッド名
     * @param response レスポンスオブジェクト
     */
    private sendResponse(method: string, response: JsonRpcResponse) {
        const responseStr = JSON.stringify(response);
        const debuggingStr = JSON.stringify(response, null, 2); // for easier debugging
        console.error(`[MCP Server] Sending: ${debuggingStr}`);
        process.stdout.write(responseStr + '\n');
    }
}

// Start the MCP server once the database is ready
// NOTE: when running under Jest (JEST_WORKER_ID is set) we skip auto-start to avoid DB contention in tests.
if (!process.env.JEST_WORKER_ID) {
    (async () => {
        // 理由: DB初期化・サーバ起動失敗時もエラー通知し、異常終了させる
        try {
            await initializeDatabase();
            // register built-in tools explicitly (dynamic loading disabled)
            try {
                // 明示的に組み込みツールを登録します。動的ロードは不要のため使用しません。
                // 追加するツールはここに import して register してください。
                const wbsCreate = await import('./tools/wbsCreateTaskTool');
                const wbsGet = await import('./tools/wbsGetTaskTool');
                const wbsUpdate = await import('./tools/wbsUpdateTaskTool');
                const wbsList = await import('./tools/wbsListTasksTool');
                const wbsDelete = await import('./tools/wbsDeleteTaskTool');
                const wbsMove = await import('./tools/wbsMoveTaskTool');
                const wbsImpot = await import('./tools/wbsImpotTaskTool');
                const artList = await import('./tools/artifactsListArtifactsTool');
                const artGet = await import('./tools/artifactsGetArtifactTool');
                const artCreate = await import('./tools/artifactsCreateArtifactTool');
                const artUpdate = await import('./tools/artifactsUpdateArtifactTool');
                const artDelete = await import('./tools/artifactsDeleteArtifactTool');
                const candidates = [
                    wbsCreate, wbsGet, wbsUpdate, wbsList, wbsDelete, wbsMove, wbsImpot,
                    artList, artGet, artCreate, artUpdate, artDelete
                ];
                for (const mod of candidates) {
                    if (mod && mod.instance) toolRegistry.register(mod.instance);
                }
                console.error('[MCP Server] Built-in tools registered:', toolRegistry.list().map(t => t.name));
            } catch (err) {
                console.error('[MCP Server] Failed to register built-in tools:', err);
            }
            new StdioMCPServer();
        } catch (error) {
            console.error('[MCP Server] Failed to start server:', error);
            process.exit(1);
        }
    })();
}