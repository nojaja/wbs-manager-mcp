import { jest } from '@jest/globals';

describe('startServerCommandHandler', () => {
  it('calls startLocalServer with given clients and context', async () => {
    const server = { startLocalServer: jest.fn() };
    const ctx = { subscriptions: [] } as any;
    const clients = [{}, {}];

    const mod = await import('../../src/extension/commands/startServer');
    await mod.startServerCommandHandler(server, ctx, clients);

    expect(server.startLocalServer).toHaveBeenCalledWith(ctx, clients);
  });
});
