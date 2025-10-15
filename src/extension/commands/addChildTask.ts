/**
 * wbsTree.addChildTask ハンドラ
 * @param wbsProvider
 * @param treeView
 * @param showDetail callback
 * @returns 作成されたタスク情報または undefined
 */
export async function addChildTaskCommandHandler(wbsProvider: any, treeView: any, showDetail?: (taskId: string) => Promise<void>) {
  const target = treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined;
  const result = await wbsProvider.createTask(target as any);
  if (result?.taskId && showDetail) {
    await showDetail(result.taskId);
  }
  return result;
}
