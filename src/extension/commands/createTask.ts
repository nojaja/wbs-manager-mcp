import { CommandHandler } from './CommandHandler';
import { WBSTreeProvider } from '../views/explorer/wbsTree';
import { TaskDetailPanel } from '../views/panels/taskDetailPanel';


/**
 * CreateTaskHandler
 * wbsTree.createTask コマンドのハンドラ（タスク作成と詳細パネル表示）。
 */
export class CreateTaskHandler extends CommandHandler {
  /**
   * WBSTreeProvider のシングルトンインスタンス（タスク作成に使用）
   */
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();

  /**
   * Handle create task command
   * @param context Extension context
   * @param treeView TreeView instance
   * @returns 作成されたタスク情報または undefined
   */
  async handle(context: any, treeView: any) {
    const selected = this.pickTarget(undefined, treeView);
    const result = await this.wbsProvider.createTask(selected as any);
    if (result?.taskId) {
      await TaskDetailPanel.createOrShow(context.extensionUri, result.taskId);
    }
    return result;
  }
}
