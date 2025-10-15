/**
 * artifactTree.deleteArtifact のハンドラ
 * @param artifactProvider
 * @param target (optional) ArtifactTreeItem
 * @returns 削除結果（プロミス）
 */
export async function deleteArtifactCommandHandler(artifactProvider: any, target?: any) {
  return artifactProvider.deleteArtifact(target);
}
