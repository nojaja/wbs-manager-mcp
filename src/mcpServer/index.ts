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
 * 標準入出力MCPサーバクラス
 * 標準入出力経由でリクエスト受付・DB操作・レスポンス返却を行う
 * なぜ必要か: VSCode拡張とサーバ間をシンプルなプロトコルで接続し、DB操作を分離するため
 */
class StdioMCPServer {
    private repo: WBSRepository;

    /**
     * コンストラクタ
     * WBSリポジトリ初期化・標準入出力ハンドラ設定を行う
     * なぜ必要か: DB操作・リクエスト受付を一元管理するため
     */
    constructor() {
        this.repo = new WBSRepository();
        this.setupStdioHandlers();
    }

    /**
     * 標準入出力ハンドラ設定処理
     * stdinからのデータ受信・パース・メッセージ分岐処理を行う
    * なぜ必要か: VSCode拡張からのリクエストをリアルタイムで受信・処理するため（標準入出力を通信チャネルとして利用）
     */
    private setupStdioHandlers() {
        process.stdin.setEncoding('utf8');
        let buffer = '';

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            // 1行ずつJSON-RPCメッセージとして処理
            // 処理概要: 受信した行をJSONとしてパースし、通知/リクエストへ振り分け
            // 実装理由: ストリーム分割の境界問題（途中受信）を避け、確実に1行単位で扱う
            for (const line of lines) {
                // 空行はスキップ
                if (line.trim()) {
                    // 理由: サーバへの不正リクエストやパース失敗時も安全にエラー通知
                    try {
                        const message = JSON.parse(line.trim());
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('[MCP Server] Failed to parse message:', error);
                    }
                }
            }
        });

        process.stdin.on('end', () => {
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
     * メッセージ受信処理
     * JSON-RPCリクエスト/通知を受信し、リクエストはhandleRequest、通知はhandleNotificationへ振り分ける
     * なぜ必要か: クライアントからの各種操作要求を正しく分岐・処理するため
     * @param message 受信メッセージ
     */
    private async handleMessage(message: JsonRpcRequest | JsonRpcNotification) {
        try {
            console.error(`[MCP Server] Received: ${message.method}`, message.params);

            // idプロパティの有無でリクエスト/通知を分岐
            // 理由: JSON-RPC仕様に従い、応答要否を正しく判定するため
            if ('id' in message) {
                // Request - needs response
                const response = await this.handleRequest(message as JsonRpcRequest);
                this.sendResponse(message.method, response);
            } else {
                // Notification - no response needed
                await this.handleNotification(message as JsonRpcNotification);
            }
        } catch (error) {
            console.error('[MCP Server] Error handling message:', error);
            // idプロパティがある場合のみエラー応答を返す
            // 理由: 通知には応答不要、リクエストのみエラー返却
            if ('id' in message) {
                this.sendResponse(message.method,{
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
     * リクエスト処理
     * JSON-RPCリクエストのメソッドごとにDB操作やツール呼び出しを行い、レスポンスを返す
     * なぜ必要か: クライアントからのAPI呼び出しをDB操作やツール呼び出しにマッピングするため
     * @param request リクエストオブジェクト
     * @returns レスポンスオブジェクト
     */
    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { method, params, id } = request;

        // メソッド名ごとに処理を分岐
        // 理由: JSON-RPC仕様に従い、APIごとに適切なレスポンスを返すため
        switch (method) {
            case 'initialize':
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
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: toolRegistry.list()
                    }
                };

            case 'tools/call':
                {
                    const toolResult = await toolRegistry.execute(params?.name, params?.arguments ?? {});
                    return { jsonrpc: '2.0', id, result: toolResult };
                }

            case 'ping':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };

            case 'resources/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: []
                    }
                };

            case 'prompts/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        prompts: []
                    }
                };

            default:
                // 未知のメソッドはエラー応答
                // 理由: 仕様外の呼び出しを明示的に拒否し、クライアントの誤実装に気づけるようにする
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
     * 通知処理
     * JSON-RPC通知のメソッドごとにログ出力等を行う
     * なぜ必要か: クライアントからの状態通知やイベントを受けてサーバ側で処理するため（応答不要の一方向通信）
     * @param notification 通知オブジェクト
     */
    private async handleNotification(notification: JsonRpcNotification) {
        const { method } = notification;
        // 通知はログ出力のみで受け流す（必要なら将来拡張する）
        console.error(`[MCP Server] Notification received: ${method}`);
        return;
    }


    /**
     * レスポンス送信処理
     * JSON-RPCレスポンスを標準出力へ送信する
     * なぜ必要か: クライアントへAPI応答を返し、UIを更新させるため
     * @param method メソッド名
     * @param response レスポンスオブジェクト
     */
    private sendResponse(method: string, response: JsonRpcResponse) {
        const responseStr = JSON.stringify(response);
        console.error(`[MCP Server] Sending: ${responseStr}`);
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