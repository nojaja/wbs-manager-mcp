import { jest } from '@jest/globals';

describe('deleteArtifactCommandHandler', () => {
  it('calls artifactProvider.deleteArtifact with provided target', async () => {
    const calledWith: any[] = [];
    const artifactProvider: any = { deleteArtifact: async (t: any) => { calledWith.push(t); return true; } };
    const target = { id: 'a1' };
    const mod = await import('../../src/extension/commands/deleteArtifact');
    const res = await mod.deleteArtifactCommandHandler(artifactProvider, target);
    expect(calledWith[0]).toBe(target);
    expect(res).toBe(true);
  });
});
