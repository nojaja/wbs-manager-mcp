/**
 * 処理名: JSON-RPC リクエスト型定義
 * 処理概要: JSON-RPC 2.0 に準拠したリクエスト（要求）メッセージの型定義。
 * 実装理由: 受信したメッセージを型として明確に扱うことで、メソッド名や id の有無による
 *           リクエスト/通知の振り分けを安全に行うために必要。
 */
export interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

/**
 * 処理名: JSON-RPC レスポンス型定義
 * 処理概要: JSON-RPC 2.0 に準拠したレスポンス（応答）メッセージの型定義。
 * 実装理由: サーバー/クライアント間で送受信される結果やエラーを一貫して扱い、
 *           応答処理やエラー表示に利用するために必要。
 */
export interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/**
 * 処理名: JSON-RPC 通知型定義
 * 処理概要: JSON-RPC 2.0 に準拠した通知（notification）メッセージの型定義。通知は応答を期待しない。
 * 実装理由: 応答を返さない一方向メッセージを区別して処理するために必要。通知はサーバー状態の更新などに使われる。
 */
export interface JsonRpcNotification {
  jsonrpc: string;
  method: string;
  params?: any;
}

/**
 * 処理名: JSON-RPC メッセージ解析
 * 処理概要: 単一行の文字列として渡された JSON-RPC ペイロードをパースし、基本的な検証を行う。
 *           成功時は `JsonRpcRequest`（id を含む）か `JsonRpcNotification`（id を含まない）のいずれかを返す。
 * 実装理由: 標準化された JSON-RPC メッセージとして正しい形式かを早期に検証してから
 *           上位ロジックに渡すことで、安全なメッセージ処理とエラーの早期検出を実現するために必要。
 * @param {string} line パース対象の1行 JSON 文字列
 * @returns {JsonRpcRequest | JsonRpcNotification} 解析されたメッセージオブジェクト
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
