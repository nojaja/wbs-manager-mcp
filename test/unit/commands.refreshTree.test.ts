import { jest } from '@jest/globals';

describe('refreshTreeCommandHandler', () => {
  it('starts server if not running and refreshes provider', async () => {
    const server = { getServerProcess: jest.fn().mockReturnValue(null), startLocalServer: jest.fn() };
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;
    const clients = [ {}, {} ];

  const mod = await import('../../src/extension/commands/refreshWbsTree');
  const { RefreshWbsTreeHandler } = mod;
  const handler = new RefreshWbsTreeHandler();
  // Spy the ServerService startLocalServer to verify it's invoked when no process
  const serverService = (await import('../../src/extension/server/ServerService')).ServerService.getInstance();
  const spy = jest.spyOn(serverService, 'startLocalServer').mockResolvedValue(undefined as any);
  await handler.handle(ctx as any);
  expect(spy).toHaveBeenCalled();
  expect(wbsProvider.refresh).toHaveBeenCalled();
  });

  it('does not start server if already running but still refreshes', async () => {
    const server = { getServerProcess: jest.fn().mockReturnValue({ pid: 123 }), startLocalServer: jest.fn() };
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;

  const mod = await import('../../src/extension/commands/refreshWbsTree');
  const { RefreshWbsTreeHandler } = mod;
  const handler = new RefreshWbsTreeHandler();
  await handler.handle(ctx as any);
  expect(wbsProvider.refresh).toHaveBeenCalled();
  });
});
