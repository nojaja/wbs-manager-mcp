import { WBSTreeProvider} from '../views/explorer/wbsTree';

/**
 * wbsTree.refresh 用のコマンドハンドラ
 * @param context ExtensionContext
 * @param clients MCP clients 配列
 */
import { CommandHandler } from './CommandHandler';

/**
 * Command handler to refresh the WBS tree view.
 *
 * @class RefreshWbsTreeHandler
 * @extends {CommandHandler}
 */
export class RefreshWbsTreeHandler extends CommandHandler {
  /**
   * Handle the refreshTree command.
   *
   * @param {any} context Extension context (not used)
   */
  async handle(context: any) {
    const wbsProvider = WBSTreeProvider.getInstance();
    wbsProvider.refresh();
  }
}

