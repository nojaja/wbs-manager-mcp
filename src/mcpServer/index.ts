//console.errorでPIDを返す
console.error('[MCP Server] Starting stdio MCP server... PID:', process.pid);
import { ToolRegistry } from './tools/ToolRegistry';
import { StdioTransport } from './transport/StdioTransport';
import { parseJsonRpc, JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from './parser/Parser';
import { Dispatcher } from './dispatcher/Dispatcher';

Logger.info('[MCP Server] Starting stdio MCP server... PID: ' + process.pid);

// Create a global registry instance for tools
const toolRegistry = new ToolRegistry();
// Note: we'll load tools dynamically from ./tools in a later step

/**
 * 処理名: タスク作成ラッパー (sharedCreateTask)
 * 処理概要: DB 層の `createTask` を呼び出して新しいタスクを作成するラッパー関数です。
 * 実装理由: サーバ内の他コンポーネントから呼び出す際に引数のデフォルト処理や型整形を集約し、直接 DB モジュールに渡す前の一貫したインターフェースを提供するため。
 * @param {string} title
 * @param {string} [description]
 * @param {string|null} [parentId]
 * @param {string|null} [assignee]
 * @param {string|null} [estimate]
 * @param {any} [options]
 * @returns {Promise<any>}
 */
async function sharedCreateTask(title: string, description?: string, parentId?: string | null, assignee?: string | null, estimate?: string | null, options?: any) {
    return createTask(title, description ?? '', parentId ?? null, assignee ?? null, estimate ?? null, options);
}

/**
 * 処理名: Stdio MCP サーバ（クラス）
 * 処理概要: 標準入出力を使って JSON-RPC 形式のメッセージを受信し、DB 操作／ツール呼び出しを仲介して応答を返すサーバ実装。
 * 実装理由: VSCode 拡張側と分離してサーバ側の DB やツールを独立して扱うため。標準入出力でのやり取りにより拡張とプロセス間通信を簡潔に保つ。
 * @class
 */
class StdioMCPServer {

    /**
     * 処理名: モジュール読み込みと登録 (importAndRegister)
     * 処理概要: 指定されたモジュールパスを動的 import し、モジュールが提供するツールインスタンスを抽出して `toolRegistry.register` を呼び出します。
     * 実装理由: 各ツールモジュールのエクスポート形式（instance/default/tool）に柔軟に対応し、個別のロード失敗をログ出力してサーバ全体の起動失敗を防ぐため。
     * @param {string} p Module path to import
     * @returns {Promise<void>}
     */
    constructor() {
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
            const mod = await import(p);
            const instance = mod.instance || mod.default || mod.tool;
            // 処理概要: エクスポートからインスタンスを判定し、存在しなければ登録をスキップ
            // 実装理由: モジュールによってエクスポート形式が異なるため柔軟に対応するため
            if (!instance) return;
            try {
                // 処理概要: インスタンスをレジストリに登録
                // 実装理由: レジストリはツール実行の中心であり、登録時に名前やメタ情報を検査するため
                await toolRegistry.register(instance);
            } catch (err) {
                // 処理概要: 登録失敗時はエラーログを出力して処理を継続
                // 実装理由: 一つのツール登録失敗で全体が止まらないようにするため
                Logger.error('[MCP Server] failed to register tool', null, { tool: instance?.meta?.name, err: err instanceof Error ? err.message : String(err) });
            }
        } catch (err) {
            // 処理概要: import が失敗した場合はエラーログを出力
            // 実装理由: モジュールロードエラーの原因追跡と、起動継続のために詳細をログに残す必要があるため
            Logger.error('[MCP Server] Failed to load tool:', null, { path: p, err: err instanceof Error ? err.message : String(err) });
        }
    }

    // 処理概要: 定義済みのツールパスを逐次取り出して importAndRegister を呼び出す
    // 実装理由: 各ツールを順に読み込み登録することで起動時の初期化を行うため
    for (const p of paths) {
        await importAndRegister(p);
    }
    Logger.info('[MCP Server] Built-in tools registered: ' + JSON.stringify(toolRegistry.list().map(t => t.name)));
}

/**
 * Start the MCP server: initialize DB, set deps, register tools and start transport/dispatcher.
 * @returns {Promise<void>}
 */
async function startServer() {
    try {
    // 処理概要: DB 初期化、依存注入、及び組み込みツールの登録を順に実行
    // 実装理由: サーバ起動前に必須の基盤（DB とツールレジストリ）を確実に準備するため
    await initializeDatabase();
    await toolRegistry.setDeps({ repo: sharedRepo });
    await registerBuiltInTools();

    // Install graceful shutdown handlers that dispose tools before exit
    /**
     * 処理名: 優雅なシャットダウン (shutdown)
     * 処理概要: 登録されたツールをすべて破棄（dispose）してからプロセスを終了します。オプションでシグナル名をログに出力します。
     * 実装理由: プロセス終了時にツールのリソース（タイマー、ファイルハンドラ等）を確実に解放し、整合性を保つために必要です。
     * @param {string|undefined} signal Optional signal name for logging
     * @returns {Promise<void>}
     */
    const shutdown = async (signal?: string) => {
            Logger.info('[MCP Server] Shutting down server ' + (signal || ''));
            // 処理概要: 登録済みツールの dispose を呼び出してリソース解放を行う
            // 実装理由: ツールが保持するリソース（タイマーやハンドル）を明示的に解放し、
            //           プロセス終了時の副作用やデータ不整合を防ぐため
            try {
                await toolRegistry.disposeAll();
            } catch (err) {
                // 処理概要: dispose 中にエラーが起きた場合はログを残し終了処理を続行
                // 実装理由: dispose の失敗でシャットダウンが阻害されないようにするため
                Logger.error('[MCP Server] Error during disposeAll', null, { err: err instanceof Error ? err.message : String(err) });
            }
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // create transport + dispatcher
        const transport = new StdioTransport();
        const dispatcher = new Dispatcher(toolRegistry);

    /**
     * 処理名: 受信メッセージ処理 (handleLine)
     * 処理概要: トランスポートから受け取った1行分の JSON-RPC メッセージを解析し、Dispatcher に処理を委譲、必要に応じて応答を送信します。解析エラー時はエラーレスポンスを返す試みを行います。
     * 実装理由: JSON-RPC の受信→解析→ディスパッチ→応答というメッセージ処理の中心的な役割を担い、単一責任でエラーハンドリングを一元化するため。
     * @param {string} line Raw JSON-RPC request/notification line
     * @returns {Promise<void>}
     */
    async function handleLine(line: string) {
            // 処理概要: 受信文字列を JSON-RPC として解析し、Dispatcher に処理を委譲
            // 実装理由: メッセージ単位の解析と処理を一箇所に集約してエラーハンドリングを統一するため
            try {
                const msg = parseJsonRpc(line);
                Logger.debug('[MCP Server] Received: ' + String((msg as any).method), null, { params: (msg as any).params });
                const response = await dispatcher.handle(msg as JsonRpcRequest | JsonRpcNotification);
                // 処理概要: Dispatcher の返すレスポンスがあればトランスポート経由で返信
                // 実装理由: JSON-RPC のリクエスト/レスポンスモデルに従い適切に応答を返すため
                if (response) {
                    transport.send(response as JsonRpcResponse);
                }
            } catch (err) {
                // 処理概要: メッセージ処理で例外が発生した場合はエラーログを出力
                // 実装理由: 不正なメッセージや内部エラーの原因追跡のために情報を残す必要があるため
                Logger.error('[MCP Server] Failed to handle message:', null, { err: err instanceof Error ? err.message : String(err) });
                try {
                    // 処理概要: 受信文字列が JSON で特定の id を含む場合はエラーレスポンスを返す試み
                    // 実装理由: JSON-RPC 規約に従い、リクエストに対しては適切なエラー応答を返してクライアントに通知するため
                    const maybe = JSON.parse(line);
                    if (maybe && 'id' in maybe) {
                        transport.send({ jsonrpc: '2.0', id: maybe.id, error: { code: -32600, message: 'Invalid Request' } });
                    }
                } catch (_) {
                    // 処理概要: JSON パースも失敗した場合は何もしない（受信フォーマットが完全に不正）
                    // 実装理由: パース不能なメッセージに対しては返信できないため静かに無視する
                    // ignore
                }
            }
        }

        transport.onMessage(handleLine);

        transport.start();
    } catch (error) {
        Logger.error('[MCP Server] Failed to start server:', null, { err: error instanceof Error ? error.message : String(error) });
        process.exit(1);
    }
}

// Start the MCP server once the database is ready
// NOTE: when running under Jest (JEST_WORKER_ID is set) we skip auto-start to avoid DB contention in tests.
if (!process.env.JEST_WORKER_ID) {
    (async () => {
        // 理由: DB初期化・サーバ起動失敗時もエラー通知し、異常終了させる
        try {
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
