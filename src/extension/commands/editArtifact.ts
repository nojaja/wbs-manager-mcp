import { CommandHandler } from './CommandHandler';

/**
 * EditArtifactHandler
 * artifact 編集用ハンドラ（ArtifactDetailPanel を表示）。
 */
export class EditArtifactHandler extends CommandHandler {

  /**
   * Handle edit artifact command
   * @param context Extension context
   * @param artifactTreeView Artifact TreeView instance
   * @param item 対象アイテム（未指定時は現在の selection を使う）
   * @returns void
   */
  async handle(context: any, artifactTreeView: any, item?: any) {
    const target = item ?? this.pickTarget(undefined, artifactTreeView);
    if (target) {
      const ArtifactDetailPanel = (await import('../views/panels/artifactDetailPanel')).ArtifactDetailPanel;
      ArtifactDetailPanel.createOrShow(context.extensionUri, target.artifact.id);
    }
  }
}
