import { CommandHandler } from './CommandHandler';
import { WBSTreeProvider} from '../views/explorer/wbsTree';

/**
 * wbsTree.refresh 用のコマンドハンドラ
 *
 * @class RefreshWbsTreeHandler
 * @extends {CommandHandler}
 */
export class RefreshWbsTreeHandler extends CommandHandler {
  /**
   * Handle wbs tree refresh
   * @param context Extension context (optional)
   */
  async handle(context: any) {
    const wbsProvider = WBSTreeProvider.getInstance();
    wbsProvider.refresh();
  }
}

