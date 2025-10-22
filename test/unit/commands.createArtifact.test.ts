import { CreateArtifactHandler } from '../../src/extension/commands/createArtifact';
import { ArtifactTreeProvider } from '../../src/extension/views/explorer/artifactTree';

describe('createArtifactCommandHandler', () => {
  it('calls artifactProvider.createArtifact and returns its result', async () => {
    const result = { artifactId: '123' };
    const fakeProvider: any = { createArtifact: jest.fn().mockResolvedValue(result) };
    jest.spyOn(ArtifactTreeProvider as any, 'getInstance').mockReturnValue(fakeProvider);

    const handler = new CreateArtifactHandler();
    const res = await handler.handle();

    expect(fakeProvider.createArtifact).toHaveBeenCalled();
    expect(res).toBe(result);
  });
});
