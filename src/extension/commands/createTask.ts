import { CommandHandler } from './CommandHandler';
import { WBSTreeProvider } from '../views/explorer/wbsTree';
import { TaskDetailPanel } from '../views/panels/taskDetailPanel';

/**
 * CreateTaskHandler は wbsTree.createTask コマンドのハンドラで、
 * WBSTreeProvider を使ってタスクを作成し、必要なら TaskDetailPanel を表示します。
 */
export class CreateTaskHandler extends CommandHandler {
  /**
   * WBSTreeProvider のシングルトンインスタンス（タスク作成に使用）
   */
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();

 /**
 * wbsTree.createTask のハンドラ
 * @param context
 * @param treeView
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

