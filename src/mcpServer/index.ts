/**
 * MCP server entrypoint (stdio transport)
 * Logs startup information and initializes tools and transport.
 */
import Logger from './logger';
import { initializeDatabase, createTask, importTasks, listArtifacts, getArtifact, createArtifact, updateArtifact, deleteArtifact, listTasks, getTask, updateTask, moveTask, deleteTask } from './db-simple';
import { ToolRegistry } from './tools/ToolRegistry';
import { StdioTransport } from './transport/StdioTransport';
import { parseJsonRpc, JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from './parser/Parser';
import { Dispatcher } from './dispatcher/Dispatcher';

Logger.info('[MCP Server] Starting stdio MCP server... PID: ' + process.pid);

// Create a global registry instance for tools
const toolRegistry = new ToolRegistry();

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
 * 処理名: 複数タスクのインポート (sharedImportTasks)
 * 処理概要: 複数のタスクデータをまとめて DB に取り込む `importTasks` を呼び出す薄いラッパーです。
 * 実装理由: 外部からの一括インポート要求を受け取った際に、内部の DB 処理とインターフェースを分離して責務を明確にするため。
 * @param {Array<any>} tasks
 * @returns {Promise<any>} result of importTasks
 */
async function sharedImportTasks(tasks: any[]) {
    return importTasks(tasks);
}

/**
 * 処理名: アーティファクト一覧取得 (sharedListArtifacts)
 * 処理概要: DB からアーティファクトの一覧を取得する `listArtifacts` を呼び出します。
 * 実装理由: 呼び出し元が直接 DB モジュールに依存しないようにすることで、将来的な実装差し替えやテスト用モックの注入を容易にするため。
 * @returns {Promise<any[]>}
 */
async function sharedListArtifacts() { return listArtifacts(); }

/**
 * 処理名: アーティファクト取得 (sharedGetArtifact)
 * 処理概要: 指定した ID のアーティファクトを DB から取得する `getArtifact` を呼び出します。
 * 実装理由: ID 検索の責務を集約して呼び出し側の実装を単純化し、共通のエラーハンドリングやログ付与のフックを入れやすくするため。
 * @param {string} artifactId
 * @returns {Promise<any|null>}
 */
async function sharedGetArtifact(artifactId: string) { return getArtifact(artifactId); }

/**
 * 処理名: アーティファクト作成 (sharedCreateArtifact)
 * 処理概要: タイトルや URI、説明を受け取り DB の `createArtifact` を実行して新しいアーティファクトを作成します。
 * 実装理由: アーティファクト作成処理を一箇所にまとめ、入力のデフォルト化や将来的な前処理（バリデーション等）を追加しやすくするため。
 * @param {string} title
 * @param {string|undefined} uri
 * @param {string|undefined} description
 * @returns {Promise<any>}
 */
async function sharedCreateArtifact(title: string, uri?: string, description?: string) { return createArtifact(title, uri, description); }

/**
 * 処理名: アーティファクト更新 (sharedUpdateArtifact)
 * 処理概要: 指定したアーティファクト ID に対して更新データを適用する `updateArtifact` を呼び出します。
 * 実装理由: 更新処理をラップすることで入力整形や共通の前後処理（ログ、サニタイズ等）を集中させられるため。
 * @param {string} artifactId
 * @param {any} updates
 * @returns {Promise<any>}
 */
async function sharedUpdateArtifact(artifactId: string, updates: any) { return updateArtifact(artifactId, updates); }

/**
 * 処理名: アーティファクト削除 (sharedDeleteArtifact)
 * 処理概要: 指定したアーティファクト ID を削除する `deleteArtifact` を呼び出します。
 * 実装理由: 削除の責務を集中させ、安全確認や監査ログの仕組みを入れやすくするためのラッパーです。
 * @param {string} artifactId
 * @returns {Promise<boolean>}
 */
async function sharedDeleteArtifact(artifactId: string) { return deleteArtifact(artifactId); }

/**
 * 処理名: タスク一覧取得 (sharedListTasks)
 * 処理概要: 指定された親 ID に紐づくタスク一覧、またはルートのタスク一覧を DB から取得する `listTasks` を呼び出します。
 * 実装理由: 一覧取得ロジックをラップして呼び出し側の依存を減らし、将来のフィルタ追加やページング導入を容易にするため。
 * @param {string|null|undefined} parentId
 * @returns {Promise<any[]>}
 */
async function sharedListTasks(parentId?: string | null) { return listTasks(parentId); }

/**
 * 処理名: タスク取得 (sharedGetTask)
 * 処理概要: 指定したタスク ID を DB から取得する `getTask` を呼び出します。
 * 実装理由: 取得処理を一箇所にまとめることで、将来的なキャッシュやアクセス制御の追加を容易にするため。
 * @param {string} taskId
 * @returns {Promise<any|null>}
 */
async function sharedGetTask(taskId: string) { return getTask(taskId); }

/**
 * 処理名: タスク更新 (sharedUpdateTask)
 * 処理概要: タスク ID に対して更新データを適用する `updateTask` を呼び出すラッパーです。
 * 実装理由: 更新処理を集中管理することで、更新前バリデーションや変更履歴の記録といった共通処理を追加しやすくするため。
 * @param {string} taskId
 * @param {any} updates
 * @returns {Promise<any>}
 */
async function sharedUpdateTask(taskId: string, updates: any) { return updateTask(taskId, updates); }

/**
 * 処理名: タスク移動 (sharedMoveTask)
 * 処理概要: タスクを別の親タスクの下へ移動する `moveTask` を呼び出します。
 * 実装理由: 階層移動に伴う副作用（整合性チェック、順序付け等）を集中管理し、移動処理の一貫性を保つためのラッパーです。
 * @param {string} taskId
 * @param {string|null} newParentId
 * @returns {Promise<any>}
 */
async function sharedMoveTask(taskId: string, newParentId: string | null) { return moveTask(taskId, newParentId); }

/**
 * 処理名: タスク削除 (sharedDeleteTask)
 * 処理概要: 指定したタスク ID を削除する `deleteTask` を呼び出します。
 * 実装理由: 削除処理をラップすることで、関連データのクリーンアップや監査ログの挿入といった共通処理を後から追加しやすくするため。
 * @param {string} taskId
 * @returns {Promise<boolean>}
 */
async function sharedDeleteTask(taskId: string) { return deleteTask(taskId); }

const sharedRepo = {
    createTask: sharedCreateTask,
    importTasks: sharedImportTasks,
    listArtifacts: sharedListArtifacts,
    getArtifact: sharedGetArtifact,
    createArtifact: sharedCreateArtifact,
    updateArtifact: sharedUpdateArtifact,
    deleteArtifact: sharedDeleteArtifact,
    listTasks: sharedListTasks,
    getTask: sharedGetTask,
    updateTask: sharedUpdateTask,
    moveTask: sharedMoveTask,
    deleteTask: sharedDeleteTask,
};
// setDeps is now async and may initialize tools, so ensure we await it during startup
/**
 * 処理名: 組み込みツール登録 (registerBuiltInTools)
 * 処理概要: 多数のツールモジュールを動的に import し、それらがエクスポートするツールインスタンスを `toolRegistry` に登録します。
 * 実装理由: 実行時にツールを動的に読み込んで登録することで、ツールの追加・削除をモジュール単位で管理でき、サーバ起動時の拡張性を高めるため。
 * @returns {Promise<void>}
 */
async function registerBuiltInTools() {
    const paths = [
        './tools/wbsCreateTaskTool',
        './tools/wbsGetTaskTool',
        './tools/wbsUpdateTaskTool',
        './tools/wbsListTasksTool',
        './tools/wbsDeleteTaskTool',
        './tools/wbsMoveTaskTool',
        './tools/wbsImpotTaskTool',
        './tools/artifactsListArtifactsTool',
        './tools/artifactsGetArtifactTool',
        './tools/artifactsCreateArtifactTool',
        './tools/artifactsUpdateArtifactTool',
        './tools/artifactsDeleteArtifactTool'
    ];

    /**
     * 処理名: モジュール読み込みと登録 (importAndRegister)
     * 処理概要: 指定されたモジュールパスを動的 import し、モジュールが提供するツールインスタンスを抽出して `toolRegistry.register` を呼び出します。
     * 実装理由: 各ツールモジュールのエクスポート形式（instance/default/tool）に柔軟に対応し、個別のロード失敗をログ出力してサーバ全体の起動失敗を防ぐため。
     * @param {string} p Module path to import
     * @returns {Promise<void>}
     */
    async function importAndRegister(p: string) {
        // 処理概要: 指定モジュールを動的に import してツールインスタンスを抽出
        // 実装理由: 動的インポートによりツールを柔軟に追加でき、個別の読み込み失敗を許容して
        //           サーバ全体の起動を妨げないために個別 try/catch を用いる
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

(async () => {
    // NOTE: when running under Jest (JEST_WORKER_ID is set) we skip auto-start to avoid DB contention in tests.
    if (!process.env.JEST_WORKER_ID) {
        await startServer();
    }
})();
// Note: tools may be loaded dynamically in future; startup flow implemented via startServer()