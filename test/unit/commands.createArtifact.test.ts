import { jest } from '@jest/globals';

describe('createArtifactCommandHandler', () => {
  it('calls artifactProvider.createArtifact and returns its result', async () => {
    const result = { artifactId: '123' };
    let called = false;
    const artifactProvider: any = { createArtifact: async () => { called = true; return result; } };
    const mod = await import('../../src/extension/commands/createArtifact');
  const { CreateArtifactHandler } = mod;
  const handler = new CreateArtifactHandler();
  const res = await handler.handle(undefined, artifactProvider);
    expect(called).toBe(true);
    expect(res).toBe(result);
  });
});
