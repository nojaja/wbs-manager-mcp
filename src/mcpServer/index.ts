//console.errorでPIDを返す
console.error('[MCP Server] Starting stdio MCP server... PID:', process.pid);
import { initializeDatabase, WBSRepository } from './db-simple';
import { ToolRegistry } from './tools/ToolRegistry';
import { StdioTransport } from './transport/StdioTransport';
import { parseJsonRpc, JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from './parser/Parser';
import { Dispatcher } from './dispatcher/Dispatcher';

// Create a global registry instance for tools
const toolRegistry = new ToolRegistry();
// Create shared repository instance to inject into tools
const sharedRepo = new WBSRepository();
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