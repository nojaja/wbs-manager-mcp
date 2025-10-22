import { ArtifactTreeProvider} from '../views/explorer/artifactTree';

/**
 * artifactTree.refresh 用のコマンドハンドラ
 * @param context ExtensionContext
 * @param clients MCP clients 配列
 */
import { CommandHandler } from './CommandHandler';

/**
 * Command handler to refresh the WBS tree view.
 *
 * @class RefreshArtifactTreeHandler
 * @extends {CommandHandler}
 */
export class RefreshArtifactTreeHandler extends CommandHandler {
  /**
   * Handle the refreshTree command.
   *
   * @param {any} context Extension context (not used)
   */
  async handle(context: any) {
    const artifactProvider = ArtifactTreeProvider.getInstance();
    artifactProvider.refresh();
  }
}

