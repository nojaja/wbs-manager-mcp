import { CommandHandler } from './CommandHandler';
import { ArtifactTreeProvider } from '../views/explorer/artifactTree';

/**
 * DeleteArtifactHandler
 * artifactTree.deleteArtifact のハンドラ（選択アイテムの削除）。
 */
export class DeleteArtifactHandler extends CommandHandler {

  /**
   * Handle delete artifact command
   * @param artifactTreeView Artifact TreeView instance
   * @param item optional target item
   * @returns 削除結果
   */
  async handle(artifactTreeView: any,item?: any) {
    this.outputChannel.log(`artifactTree.deleteArtifact: ${item ? item.label : 'no item'}`);
    const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
      ? artifactTreeView.selection[0]
      : undefined);

    const artifactProvider = ArtifactTreeProvider.getInstance();
    return artifactProvider.deleteArtifact(target);
  }
}
