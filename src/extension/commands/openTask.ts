/**
 * wbsTree.openTask ハンドラ
 * @param context
 * @param item
 * @param taskClient
 * @param artifactClient
 */
export function openTaskCommandHandler(context: any, item: any, taskClient: any, artifactClient: any) {
  if (item) {
    const TaskDetailPanel = require('../views/panels/taskDetailPanel').TaskDetailPanel;
    TaskDetailPanel.createOrShow(context.extensionUri, item.itemId, { taskClient, artifactClient });
  }
}
