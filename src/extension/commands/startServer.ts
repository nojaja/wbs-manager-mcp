import * as vscode from 'vscode';

/**
 * startLocalServer を呼び出すコマンドハンドラ
 * @param serverService サーバサービスインスタンス
 * @param context ExtensionContext
 * @param clients MCP クライアント配列
 */
export async function startServerCommandHandler(serverService: any, context: vscode.ExtensionContext, clients: any[] = []) {
  await serverService.startLocalServer(context, clients);
}
