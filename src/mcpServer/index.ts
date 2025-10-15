// console.errorでPIDを返す
/**
 * MCP server entrypoint (stdio transport)
 * Logs startup information and initializes tools and transport.
 */
console.error('[MCP Server] Starting stdio MCP server... PID:', process.pid);
import { initializeDatabase, createTask, importTasks, listArtifacts, getArtifact, createArtifact, updateArtifact, deleteArtifact, listTasks, getTask, updateTask, moveTask, deleteTask } from './db-simple';
import { ToolRegistry } from './tools/ToolRegistry';
import { StdioTransport } from './transport/StdioTransport';
import { parseJsonRpc, JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from './parser/Parser';
import { Dispatcher } from './dispatcher/Dispatcher';

// Create a global registry instance for tools
const toolRegistry = new ToolRegistry();
/**
 * Create shared repository-like object to inject into tools.
 * This object exposes the minimal API expected by tools and forwards to the exported functions.
 * It intentionally mirrors the previous WBSRepository surface to avoid changes in tool implementations.
 */
const sharedRepo = {
    /**
     * Create a task (for tools compatibility)
     * @param {string} title
     * @param {string} [description]
     * @param {string|null} [parentId]
     * @param {string|null} [assignee]
     * @param {string|null} [estimate]
     * @param {Object} [options]
     * @returns {Promise<Object>} created task
     */
    createTask: async (title: string, description?: string, parentId?: string | null, assignee?: string | null, estimate?: string | null, options?: any) => createTask(title, description ?? '', parentId ?? null, assignee ?? null, estimate ?? null, options),
    /**
     * Import multiple tasks
     * @param {Array<any>} tasks
     * @returns {Promise<Array<Object>>}
     */
    importTasks: async (tasks: any[]) => importTasks(tasks),
    /**
     * List artifacts
     * @returns {Promise<Array<Object>>}
     */
    listArtifacts: async () => listArtifacts(),
    /**
     * Get artifact by id
     * @param {string} artifactId
     * @returns {Promise<Object|null>}
     */
    getArtifact: async (artifactId: string) => getArtifact(artifactId),
    /**
     * Create artifact
     * @param {string} title
     * @param {string} [uri]
     * @param {string} [description]
     * @returns {Promise<Object>}
     */
    createArtifact: async (title: string, uri?: string, description?: string) => createArtifact(title, uri, description),
    /**
     * Update artifact
     * @param {string} artifactId
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    updateArtifact: async (artifactId: string, updates: any) => updateArtifact(artifactId, updates),
    /**
     * Delete artifact
     * @param {string} artifactId
     * @returns {Promise<boolean>}
     */
    deleteArtifact: async (artifactId: string) => deleteArtifact(artifactId),
    /**
     * List tasks
     * @param {string|null} [parentId]
     * @returns {Promise<Array<Object>>}
     */
    listTasks: async (parentId?: string | null) => listTasks(parentId),
    /**
     * Get task
     * @param {string} taskId
     * @returns {Promise<Object|null>}
     */
    getTask: async (taskId: string) => getTask(taskId),
    /**
     * Update task
     * @param {string} taskId
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    updateTask: async (taskId: string, updates: any) => updateTask(taskId, updates),
    /**
     * Move task
     * @param {string} taskId
     * @param {string|null} newParentId
     * @returns {Promise<Object>}
     */
    moveTask: async (taskId: string, newParentId: string | null) => moveTask(taskId, newParentId),
    /**
     * Delete task
     * @param {string} taskId
     * @returns {Promise<boolean>}
     */
    deleteTask: async (taskId: string) => deleteTask(taskId),
};
// setDeps is now async and may initialize tools, so ensure we await it during startup
(async () => {
    try {
        await toolRegistry.setDeps({ repo: sharedRepo });
    } catch (err) {
        console.error('[MCP Server] toolRegistry.setDeps failed during module init', err);
    }
})();
// Note: we'll load tools dynamically from ./tools in a later step

// Transport/Parser/Dispatcher wiring will handle message flow

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
                    if (mod && mod.instance) {
                        try {
                            await toolRegistry.register(mod.instance);
                        } catch (err) {
                            console.error('[MCP Server] failed to register tool', mod.instance?.meta?.name, err);
                        }
                    }
                }
                console.error('[MCP Server] Built-in tools registered:', toolRegistry.list().map(t => t.name));
            } catch (err) {
                console.error('[MCP Server] Failed to register built-in tools:', err);
            }
            // Install graceful shutdown handlers that dispose tools before exit
            /**
             * Graceful shutdown helper.
             * @param {string} [signal] Optional signal name for logging
             */
            const shutdown = async (signal?: string) => {
                console.error('[MCP Server] Shutting down server', signal || '');
                try {
                    await toolRegistry.disposeAll();
                } catch (err) {
                    console.error('[MCP Server] Error during disposeAll', err);
                }
                process.exit(0);
            };
            process.on('SIGINT', () => shutdown('SIGINT'));
            process.on('SIGTERM', () => shutdown('SIGTERM'));

            // create transport + dispatcher
            const transport = new StdioTransport();
            const dispatcher = new Dispatcher(toolRegistry);

            transport.onMessage(async (line: string) => {
                try {
                    const msg = parseJsonRpc(line);
                    console.error('[MCP Server] Received:', (msg as any).method, (msg as any).params);
                    const response = await dispatcher.handle(msg as JsonRpcRequest | JsonRpcNotification);
                    if (response) {
                        // send via transport
                        transport.send(response as JsonRpcResponse);
                    }
                } catch (err) {
                    console.error('[MCP Server] Failed to handle message:', err);
                    // best-effort: if parse succeeded partially and we have id, send error
                    try {
                        const maybe = JSON.parse(line);
                        if (maybe && 'id' in maybe) {
                            transport.send({ jsonrpc: '2.0', id: maybe.id, error: { code: -32600, message: 'Invalid Request' } });
                        }
                    } catch (_) {
                        // ignore
                    }
                }
            });

            transport.start();
        } catch (error) {
            console.error('[MCP Server] Failed to start server:', error);
            process.exit(1);
        }
    })();
}