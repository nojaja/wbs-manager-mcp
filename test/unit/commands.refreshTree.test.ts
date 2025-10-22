import { jest } from '@jest/globals';

describe('refreshTreeCommandHandler', () => {
  it('starts server if not running and refreshes provider', async () => {
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;

    const { RefreshWbsTreeHandler } = require('../../src/extension/commands/refreshWbsTree');
    // mock provider singleton
    const WBSTreeProvider = require('../../src/extension/views/explorer/wbsTree').WBSTreeProvider;
    jest.spyOn(WBSTreeProvider as any, 'getInstance').mockReturnValue(wbsProvider);

    const handler = new RefreshWbsTreeHandler();
    await handler.handle(ctx as any);
    expect(wbsProvider.refresh).toHaveBeenCalled();
  });

  it('refreshes provider', async () => {
    const wbsProvider = { refresh: jest.fn() };
    const ctx = { subscriptions: [] } as any;

    const { RefreshWbsTreeHandler } = require('../../src/extension/commands/refreshWbsTree');
    const WBSTreeProvider = require('../../src/extension/views/explorer/wbsTree').WBSTreeProvider;
    jest.spyOn(WBSTreeProvider as any, 'getInstance').mockReturnValue(wbsProvider);

    const handler = new RefreshWbsTreeHandler();
    await handler.handle(ctx as any);
    expect(wbsProvider.refresh).toHaveBeenCalled();
  });
});
