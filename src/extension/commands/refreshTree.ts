/**
 * wbsTree.refresh 用のコマンドハンドラ
 * @param serverService サーバサービス
 * @param wbsProvider WBS Tree Provider
 * @param context ExtensionContext
 * @param clients MCP clients 配列
 */
export async function refreshTreeCommandHandler(serverService: any, wbsProvider: any, context: any, clients: any[] = []) {
  if (!serverService.getServerProcess()) {
    await serverService.startLocalServer(context, clients);
  }
  wbsProvider.refresh();
}
