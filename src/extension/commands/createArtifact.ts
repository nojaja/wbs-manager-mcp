/**
 * artifactTree.createArtifact のハンドラ
 * @param artifactProvider
 * @returns 新規作成されたアーティファクト or undefined
 */
export async function createArtifactCommandHandler(artifactProvider: any) {
  return artifactProvider.createArtifact();
}
