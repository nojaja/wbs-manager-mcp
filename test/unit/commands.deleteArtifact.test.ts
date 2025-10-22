import { jest } from '@jest/globals';

describe('deleteArtifactCommandHandler', () => {
  it('calls artifactProvider.deleteArtifact with provided target', async () => {
    const calledWith: any[] = [];
    const fakeProvider: any = { deleteArtifact: async (t: any) => { calledWith.push(t); return true; } };
    const target = { id: 'a1' };

    const { DeleteArtifactHandler } = require('../../src/extension/commands/deleteArtifact');
    const ArtifactTreeProvider = require('../../src/extension/views/explorer/artifactTree').ArtifactTreeProvider;
    jest.spyOn(ArtifactTreeProvider as any, 'getInstance').mockReturnValue(fakeProvider);

    const handler = new DeleteArtifactHandler();
    const res = await handler.handle({ selection: [target] } as any, target);
    expect(calledWith[0]).toBe(target);
    expect(res).toBe(true);
  });
});
