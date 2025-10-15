/**
 * artifactTree.editArtifact のハンドラ
 * @param artifactTreeView
 * @param artifactProvider
 * @param context
 * @param artifactClient
 * @param item 対象アイテム（未指定時は現在の selection を使う）
 * @returns void
 */
export async function editArtifactCommandHandler(artifactTreeView: any, artifactProvider: any, context: any, artifactClient: any, item?: any) {
  const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
    ? artifactTreeView.selection[0]
    : undefined);
  if (target) {
    const ArtifactDetailPanel = (await import('../views/panels/artifactDetailPanel')).ArtifactDetailPanel;
    ArtifactDetailPanel.createOrShow(context.extensionUri, target.artifact.id, { artifactClient });
  }
}
