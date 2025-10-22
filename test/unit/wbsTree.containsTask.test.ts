import { jest } from '@jest/globals';
import { WBSTreeProvider } from '../../src/extension/views/explorer/wbsTree';

function makeMockClient(chainMap: any) {
  return {
    getTask: jest.fn(async (id: string) => {
      const entry = chainMap[id];
      if (!entry) return undefined;
      return entry;
    }),
    listTasks: jest.fn(async () => []),
    createTask: jest.fn(),
    deleteTask: jest.fn(),
    moveTask: jest.fn()
  } as any;
}

describe('WBSTreeProvider.containsTask (via private access)', () => {
  it('returns true when target is descendant (parent chain contains dragged id)', async () => {
    const chain = {
      'child': { id: 'child', parent_id: 'parent' },
      'parent': { id: 'parent', parent_id: 'grand' },
      'grand': { id: 'grand', parent_id: null }
    };

    const client = makeMockClient(chain);
  const provider = new (await import('../../src/extension/views/explorer/wbsTree')).WBSTreeProvider(client);

    const dragged = { id: 'grand', parent_id: null } as any;

    const result = await (provider as any)['containsTask'](dragged, 'child');
    expect(result).toBe(true);
    expect(client.getTask).toHaveBeenCalled();
  });

  it('returns false when no ancestor reaches dragged', async () => {
    const chain = {
      'a': { id: 'a', parent_id: 'b' },
      'b': { id: 'b', parent_id: null }
    };

    const client = makeMockClient(chain);
  const provider = new (await import('../../src/extension/views/explorer/wbsTree')).WBSTreeProvider(client);

    const dragged = { id: 'x', parent_id: null } as any;
    const result = await (provider as any)['containsTask'](dragged, 'a');
    expect(result).toBe(false);
  });
});
