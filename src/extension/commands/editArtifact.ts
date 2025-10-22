import { CommandHandler } from './CommandHandler';

/**
 * artifactTree.editArtifact のハンドラ
 * @param context
 * @param artifactTreeView
 * @param item 対象アイテム（未指定時は現在の selection を使う）
 * @returns void
 */
export class EditArtifactHandler extends CommandHandler {
  async handle(context: any, artifactTreeView: any, item?: any) {
    const target = item ?? this.pickTarget(undefined, artifactTreeView);
    if (target) {
      const ArtifactDetailPanel = (await import('../views/panels/artifactDetailPanel')).ArtifactDetailPanel;
      ArtifactDetailPanel.createOrShow(context.extensionUri, target.artifact.id);
    }
  }
}


