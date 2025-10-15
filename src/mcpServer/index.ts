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
 * Create a task (wrapper for db-simple.createTask)
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
 * Import multiple tasks
 * @param {Array<any>} tasks
 * @returns {Promise<any>} result of importTasks
 */
async function sharedImportTasks(tasks: any[]) {
    return importTasks(tasks);
}

/**
 * List artifacts
 * @returns {Promise<any[]>}
 */
async function sharedListArtifacts() { return listArtifacts(); }

/**
 * Get artifact by id
 * @param {string} artifactId
 * @returns {Promise<any|null>}
 */
async function sharedGetArtifact(artifactId: string) { return getArtifact(artifactId); }

/**
 * Create artifact
 * @param {string} title
 * @param {string|undefined} uri
 * @param {string|undefined} description
 * @returns {Promise<any>}
 */
async function sharedCreateArtifact(title: string, uri?: string, description?: string) { return createArtifact(title, uri, description); }

/**
 * Update artifact
 * @param {string} artifactId
 * @param {any} updates
 * @returns {Promise<any>}
 */
async function sharedUpdateArtifact(artifactId: string, updates: any) { return updateArtifact(artifactId, updates); }

/**
 * Delete artifact
 * @param {string} artifactId
 * @returns {Promise<boolean>}
 */
async function sharedDeleteArtifact(artifactId: string) { return deleteArtifact(artifactId); }

/**
 * List tasks
 * @param {string|null|undefined} parentId
 * @returns {Promise<any[]>}
 */
async function sharedListTasks(parentId?: string | null) { return listTasks(parentId); }

/**
 * Get task
 * @param {string} taskId
 * @returns {Promise<any|null>}
 */
async function sharedGetTask(taskId: string) { return getTask(taskId); }

/**
 * Update task
 * @param {string} taskId
 * @param {any} updates
 * @returns {Promise<any>}
 */
async function sharedUpdateTask(taskId: string, updates: any) { return updateTask(taskId, updates); }

/**
 * Move task
 * @param {string} taskId
 * @param {string|null} newParentId
 * @returns {Promise<any>}
 */
async function sharedMoveTask(taskId: string, newParentId: string | null) { return moveTask(taskId, newParentId); }

/**
 * Delete task
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
 * Register built-in tools by dynamic imports and registering their instances.
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
     * Import a module path and register its exported tool instance if present.
     * @param {string} p Module path to import
     * @returns {Promise<void>}
     */
    async function importAndRegister(p: string) {
        try {
            const mod = await import(p);
            const instance = mod.instance || mod.default || mod.tool;
            if (!instance) return;
            try {
                await toolRegistry.register(instance);
            } catch (err) {
                Logger.error('[MCP Server] failed to register tool', null, { tool: instance?.meta?.name, err: err instanceof Error ? err.message : String(err) });
            }
        } catch (err) {
            Logger.error('[MCP Server] Failed to load tool:', null, { path: p, err: err instanceof Error ? err.message : String(err) });
        }
    }

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
        await initializeDatabase();
        await toolRegistry.setDeps({ repo: sharedRepo });
        await registerBuiltInTools();

        // Install graceful shutdown handlers that dispose tools before exit
        /**
         * Graceful shutdown helper that disposes all tools and exits.
         * @param {string|undefined} signal Optional signal name for logging
         * @returns {Promise<void>}
         */
        const shutdown = async (signal?: string) => {
            Logger.info('[MCP Server] Shutting down server ' + (signal || ''));
            try {
                await toolRegistry.disposeAll();
            } catch (err) {
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
     * Handle a single incoming line from transport.
     * @param {string} line Raw JSON-RPC request/notification line
     * @returns {Promise<void>}
     */
    async function handleLine(line: string) {
            try {
                const msg = parseJsonRpc(line);
                Logger.debug('[MCP Server] Received: ' + String((msg as any).method), null, { params: (msg as any).params });
                const response = await dispatcher.handle(msg as JsonRpcRequest | JsonRpcNotification);
                if (response) {
                    transport.send(response as JsonRpcResponse);
                }
            } catch (err) {
                Logger.error('[MCP Server] Failed to handle message:', null, { err: err instanceof Error ? err.message : String(err) });
                try {
                    const maybe = JSON.parse(line);
                    if (maybe && 'id' in maybe) {
                        transport.send({ jsonrpc: '2.0', id: maybe.id, error: { code: -32600, message: 'Invalid Request' } });
                    }
                } catch (_) {
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