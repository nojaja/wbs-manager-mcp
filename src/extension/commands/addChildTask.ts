import { CommandHandler } from './CommandHandler';
import { WBSTreeProvider } from '../views/explorer/wbsTree';
import { TaskDetailPanel } from '../views/panels/taskDetailPanel';


/**
 * AddChildTaskHandler
 * WBSツリーに子タスクを追加するコマンドのハンドラです。
 * 作成されたタスクがある場合はタスク詳細パネルを表示します。
 */
export class AddChildTaskHandler extends CommandHandler {
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();

  /**
   * wbsTree.addChildTask ハンドラ
   * @param context
   * @param item
   * @param treeView
   * @returns 作成されたタスク情報または undefined
   */
  /**
   * Handle add child task command
   * @param context Extension context
   * @param item 可選のターゲットアイテム
   * @param treeView TreeView instance
   * @returns 作成されたタスク情報または undefined
   */
  async handle(context: any, item: any, treeView: any) {
    const target = this.pickTarget(item, treeView);
    const result = await this.wbsProvider.createTask(target as any);
    if (result?.taskId) {
      await TaskDetailPanel.createOrShow(context.extensionUri, result.taskId);
    }
    return result;
  }
}
