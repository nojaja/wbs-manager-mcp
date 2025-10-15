/**
 * JSON-RPC request shape
 */
export interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

/**
 * JSON-RPC response shape
 */
export interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  result?: any;
  error?: { code: number; message: string };
}

/**
 * JSON-RPC notification shape
 */
export interface JsonRpcNotification {
  jsonrpc: string;
  method: string;
  params?: any;
}

/**
 * Parse a single-line JSON-RPC payload and perform basic validation.
 * @param {string} line
 * @returns {JsonRpcRequest | JsonRpcNotification} parsed message
 */
export function parseJsonRpc(line: string): JsonRpcRequest | JsonRpcNotification {
  const trimmed = line.trim();
  if (!trimmed) throw new Error('empty line');
  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch (err) {
    throw new Error('invalid json');
  }
  if (typeof obj !== 'object' || obj === null) throw new Error('not an object');
  if (obj.jsonrpc !== '2.0') throw new Error('unsupported jsonrpc version');
  if (typeof obj.method !== 'string') throw new Error('missing method');
  // it's either request (has id) or notification
  if ('id' in obj) {
    return obj as JsonRpcRequest;
  }
  return obj as JsonRpcNotification;
}
