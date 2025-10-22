import { WBSTreeProvider} from '../views/explorer/wbsTree';

/**
 * wbsTree.deleteTask のハンドラ
 * @param wbsProvider
 * @param treeView
 * @param item
 * @returns 削除結果（プロミス）
 */
import { CommandHandler } from './CommandHandler';

export class DeleteTaskHandler extends CommandHandler {
  private wbsProvider: WBSTreeProvider = WBSTreeProvider.getInstance();

  async handle(treeView: any, item?: any) {
    const target = item ?? this.pickTarget(undefined, treeView);
    return this.wbsProvider.deleteTask(target as any);
  }
}
