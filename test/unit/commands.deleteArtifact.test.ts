import { jest } from '@jest/globals';

describe('deleteArtifactCommandHandler', () => {
  it('calls artifactProvider.deleteArtifact with provided target', async () => {
    const calledWith: any[] = [];
    const artifactProvider: any = { deleteArtifact: async (t: any) => { calledWith.push(t); return true; } };
    const target = { id: 'a1' };
    const mod = await import('../../src/extension/commands/deleteArtifact');
  const { DeleteArtifactHandler } = mod;
  const handler = new DeleteArtifactHandler();
  const res = await handler.handle(artifactProvider, target);
    expect(calledWith[0]).toBe(target);
    expect(res).toBe(true);
  });
});
