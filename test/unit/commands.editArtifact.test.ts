describe('editArtifactCommandHandler', () => {
  it('calls ArtifactDetailPanel.createOrShow when target exists', async () => {
    const artifactTreeView: any = { selection: [{ artifact: { id: 'a1' } }] };
    const artifactProvider: any = {};
    const context: any = { extensionUri: {} };
    const artifactClient: any = {};

    // dynamic import path inside handler refers to ../views/panels/artifactDetailPanel
    // the real module exists; we spy by importing and wrapping
    const modPanel = await import('../../src/extension/views/panels/artifactDetailPanel');
    const orig = modPanel.ArtifactDetailPanel;
    modPanel.ArtifactDetailPanel = { createOrShow: jest.fn() } as any;

    const mod = await import('../../src/extension/commands/editArtifact');
    await mod.editArtifactCommandHandler(artifactTreeView, artifactProvider, context, artifactClient);

    expect((modPanel.ArtifactDetailPanel as any).createOrShow).toHaveBeenCalledWith(context.extensionUri, 'a1', { artifactClient });

    modPanel.ArtifactDetailPanel = orig;
  });
});
