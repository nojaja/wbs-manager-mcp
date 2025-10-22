import { CommandHandler } from './CommandHandler';
import { WBSTreeProvider} from '../views/explorer/wbsTree';

/**
 * DeleteTaskHandler
 * wbsTree.deleteTask のハンドラ（タスク削除）。
 */
export class DeleteTaskHandler extends CommandHandler {
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();

  /**
   * Handle delete task command
   * @param treeView TreeView instance
   * @param item optional target item
   * @returns 削除結果
   */
  async handle(treeView: any, item?: any) {
    const target = item ?? this.pickTarget(undefined, treeView);
    return this.wbsProvider.deleteTask(target as any);
  }
}
