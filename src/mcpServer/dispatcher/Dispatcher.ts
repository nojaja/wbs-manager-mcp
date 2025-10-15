import { ToolRegistry } from '../tools/ToolRegistry';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../parser/Parser';

/**
 * Dispatcher routes parsed JSON-RPC messages to the appropriate handlers and
 * delegates tool calls to the ToolRegistry.
 */
export class Dispatcher {
  private toolRegistry: ToolRegistry;

  /**
   * Create a Dispatcher bound to a ToolRegistry instance.
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Handle a parsed JSON-RPC message. Returns a response object for requests,
   * or undefined for notifications.
  * @param {JsonRpcRequest|JsonRpcNotification} message
  * @returns {Promise<JsonRpcResponse|undefined>} response or undefined
   */
  async handle(message: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | undefined> {
    if ('id' in message) {
      return this.handleRequest(message as JsonRpcRequest);
    } else {
      await this.handleNotification(message as JsonRpcNotification);
      return undefined;
    }
  }

  /**
   * Handle a JSON-RPC request and return a response object.
  * @param {JsonRpcRequest} request
  * @returns {Promise<JsonRpcResponse>} response
   */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params, id } = request;
    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'wbs-mcp-server', version: '0.1.0' }
            }
          };
        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: this.toolRegistry.list() } };
        case 'tools/call': {
          const toolResult = await this.toolRegistry.execute(params?.name, params?.arguments ?? {});
          return { jsonrpc: '2.0', id, result: toolResult };
        }
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };
        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: [] } };
        case 'prompts/list':
          return { jsonrpc: '2.0', id, result: { prompts: [] } };
        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
  }

  /**
   * Handle a notification (no response expected).
  * @param {JsonRpcNotification} notification
   */
  private async handleNotification(notification: JsonRpcNotification) {
    console.error('[MCP Server] Notification received:', notification.method);
    // no-op for now
  }
}
