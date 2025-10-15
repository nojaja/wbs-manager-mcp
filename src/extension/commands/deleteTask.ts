/**
 * wbsTree.deleteTask のハンドラ
 * @param wbsProvider
 * @param treeView
 * @param item
 * @returns 削除結果（プロミス）
 */
export async function deleteTaskCommandHandler(wbsProvider: any, treeView: any, item?: any) {
  const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
  return wbsProvider.deleteTask(target as any);
}
