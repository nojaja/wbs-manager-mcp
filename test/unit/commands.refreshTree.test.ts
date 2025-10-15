import { jest } from '@jest/globals';

describe('refreshTreeCommandHandler', () => {
  it('starts server if not running and refreshes provider', async () => {
    const server = { getServerProcess: jest.fn().mockReturnValue(null), startLocalServer: jest.fn() };
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;
    const clients = [ {}, {} ];

    const mod = await import('../../src/extension/commands/refreshTree');
    await mod.refreshTreeCommandHandler(server, wbsProvider, ctx, clients);

    expect(server.startLocalServer).toHaveBeenCalledWith(ctx, clients);
    expect(wbsProvider.refresh).toHaveBeenCalled();
  });

  it('does not start server if already running but still refreshes', async () => {
    const server = { getServerProcess: jest.fn().mockReturnValue({ pid: 123 }), startLocalServer: jest.fn() };
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;

    const mod = await import('../../src/extension/commands/refreshTree');
    await mod.refreshTreeCommandHandler(server, wbsProvider, ctx, []);

    expect(server.startLocalServer).not.toHaveBeenCalled();
    expect(wbsProvider.refresh).toHaveBeenCalled();
  });
});
