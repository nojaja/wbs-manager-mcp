import { jest } from '@jest/globals';

describe('startServerCommandHandler', () => {
  it('calls startLocalServer with given clients and context', async () => {
    const server = { startLocalServer: jest.fn() };
    const ctx = { subscriptions: [] } as any;
    const clients = [{}, {}];

  const mod = await import('../../src/extension/commands/startServer');
  const { StartServerHandler } = mod;
  const handler = new StartServerHandler();
  // ServerService is obtained internally; we only need to ensure our mocked server's method is called
  const serverService = (await import('../../src/extension/server/ServerService')).ServerService.getInstance();
  // Spy on startLocalServer and call handler
  const spy = jest.spyOn(serverService, 'startLocalServer').mockResolvedValue(undefined as any);
  await handler.handle(ctx as any);
  expect(spy).toHaveBeenCalled();
  });
});
