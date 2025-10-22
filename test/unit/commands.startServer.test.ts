import { jest } from '@jest/globals';

describe('startServerCommandHandler', () => {
  it('calls startLocalServer with given clients and context', async () => {
    const ctx = { subscriptions: [] } as any;

    const { StartServerHandler } = require('../../src/extension/commands/startServer');
    const ServerService = require('../../src/extension/server/ServerService').ServerService;
    const MCPInitializeClient = require('../../src/extension/repositories/mcp/initializeClient').MCPInitializeClient;
    const MCPTaskClient = require('../../src/extension/repositories/mcp/taskClient').MCPTaskClient;
    const MCPArtifactClient = require('../../src/extension/repositories/mcp/artifactClient').MCPArtifactClient;

  // cast mock to any to avoid strict TypeScript issues in test environment
  const fakeServer: any = { startLocalServer: (jest.fn() as any).mockResolvedValue(undefined) };
    jest.spyOn(ServerService as any, 'getInstance').mockReturnValue(fakeServer);
    // mock clients returned by getInstance
    jest.spyOn(MCPInitializeClient as any, 'getInstance').mockReturnValue({} as any);
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue({} as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue({} as any);

    const handler = new StartServerHandler();
    await handler.handle(ctx as any);
    expect(fakeServer.startLocalServer).toHaveBeenCalled();
  });
});
