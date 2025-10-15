import { ToolRegistry } from '../tools/ToolRegistry';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../parser/Parser';
import { RpcError } from '../tools/Tool';

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
   * Handle tools/call requests. Extracted from handleRequest to reduce complexity.
   * @param {string|undefined} name tool name
   * @param {any} args arguments to the tool
  * @param {string|number|null} id request id
  * @returns {Promise<any>} JSON-RPC response object
   */
  private async handleToolsCall(name: string | undefined, args: any, id: string | number | undefined): Promise<JsonRpcResponse> {
    if (!name) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: missing tool name' } };
    }
    const tool = this.toolRegistry.get(name);
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } };

    // Validation
    try {
      await this.validateToolInput(tool, args);
    } catch (e: any) {
      if (e instanceof RpcError) {
        return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message, data: e.data } };
      }
      return { jsonrpc: '2.0', id, error: { code: -32602, message: e instanceof Error ? e.message : String(e) } };
    }
    // Execute tool (delegated to reduce complexity)
    return await this.executeTool(name, args, id);
  }

  /**
   * Execute the named tool and format the JSON-RPC response. Extracted to reduce complexity.
   * @param {string} name
   * @param {any} args
   * @param {string|number|null} id
  * @returns {Promise<any>} JSON-RPC response object
   */
  private async executeTool(name: string, args: any, id: string | number | undefined): Promise<JsonRpcResponse> {
    try {
      const toolResult = await this.toolRegistry.execute(name, args);
      return { jsonrpc: '2.0', id, result: toolResult };
    } catch (err: any) {
      if (err instanceof RpcError) {
        return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } };
      }
      console.error('[MCP Server] Unexpected tool error:', name, err);
      return { jsonrpc: '2.0', id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
  }

  /**
   * Validate tool input according to tool.meta.inputSchema.
   * Supports: validator function (sync/async) or schema.validate (Joi-like).
   * @param {any} tool tool instance
   * @param {any} args arguments passed to tool
   * @returns {Promise<void>} resolves when valid or throws RpcError
   */
  private async validateToolInput(tool: any, args: any) {
    const schema = tool?.meta?.inputSchema;
    if (!schema) return;
    try {
      if (typeof schema === 'function') {
        await this.validateWithFunctionSchema(schema, args);
      } else if (typeof schema.validate === 'function') {
        await this.validateWithValidateMethod(schema, args);
      }
    } catch (e) {
      if (e instanceof RpcError) throw e;
      throw new RpcError(-32602, 'Invalid params', (e instanceof Error) ? e.message : e);
    }
  }

  /**
   * Validate using a function-style schema/validator. Supports sync and async validators.
   * @param {Function} schemaFn
   * @param {any} args
   */
  private async validateWithFunctionSchema(schemaFn: Function, args: any) {
    const res = schemaFn(args);
    if (res && typeof (res as any).then === 'function') {
      const awaited = await res;
      if (awaited && awaited.valid === false) {
        throw new RpcError(-32602, 'Invalid params', awaited.errors || awaited);
      }
    } else if (res && (res as any).valid === false) {
      throw new RpcError(-32602, 'Invalid params', (res as any).errors || res);
    }
  }

  /**
   * Validate using a schema object that exposes validate(args).
   * @param {any} schema
   * @param {any} args
   */
  private async validateWithValidateMethod(schema: any, args: any) {
    const maybe = schema.validate(args);
    if (maybe && typeof (maybe as any).then === 'function') {
      const awaited = await maybe;
      if (awaited && awaited.error) throw new RpcError(-32602, 'Invalid params', awaited.error);
    } else if (maybe && (maybe as any).error) {
      throw new RpcError(-32602, 'Invalid params', (maybe as any).error);
    }
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
          const name = params?.name as string | undefined;
          const args = params?.arguments ?? {};
          return await this.handleToolsCall(name, args, id);
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
