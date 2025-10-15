/**
 * wbsTree.createTask のハンドラ
 * @param wbsProvider
 * @param treeView
 * @param showDetail callback to open task detail: async (taskId:string)=>void
 * @returns 作成されたタスク情報または undefined
 */
export async function createTaskCommandHandler(wbsProvider: any, treeView: any, showDetail?: (taskId: string) => Promise<void>) {
  const selected = treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined;
  const result = await wbsProvider.createTask(selected as any);
  if (result?.taskId && showDetail) {
    await showDetail(result.taskId);
  }
  return result;
}
