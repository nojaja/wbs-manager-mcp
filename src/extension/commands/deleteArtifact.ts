import { CommandHandler } from './CommandHandler';
import { ArtifactTreeProvider } from '../views/explorer/artifactTree';

/**
 * artifactTree.deleteArtifact のハンドラ
 * @param artifactProvider
 * @param target (optional) ArtifactTreeItem
 * @returns 削除結果（プロミス）
 */
export class DeleteArtifactHandler extends CommandHandler {

  async handle(artifactTreeView: any,item?: any) {
    this.outputChannel.log(`artifactTree.deleteArtifact: ${item ? item.label : 'no item'}`);
    const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
      ? artifactTreeView.selection[0]
      : undefined);

    const artifactProvider = ArtifactTreeProvider.getInstance();
    return artifactProvider.deleteArtifact(target);
  }
}
