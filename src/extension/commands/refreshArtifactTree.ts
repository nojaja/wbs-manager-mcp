import { CommandHandler } from './CommandHandler';
import { ArtifactTreeProvider} from '../views/explorer/artifactTree';

/**
 * Command handler to refresh the WBS tree view.
 *
 * @class RefreshArtifactTreeHandler
 * @extends {CommandHandler}
 */
export class RefreshArtifactTreeHandler extends CommandHandler {
  /**
   * Handle artifact tree refresh
   * @param context Extension context (optional)
   */
  async handle(context: any) {
    const artifactProvider = ArtifactTreeProvider.getInstance();
    artifactProvider.refresh();
  }
}

