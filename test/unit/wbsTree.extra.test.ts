
import { WBSTreeProvider } from '../../src/extension/views/explorer/wbsTree';

describe('WBSTreeProvider extra tests', () => {
  const fakeTaskClient: any = {
    listTasks: jest.fn()
  };
  let provider: WBSTreeProvider;

  beforeEach(() => {
  provider = new (await import('../../src/extension/views/explorer/wbsTree')).WBSTreeProvider(fakeTaskClient);
    jest.clearAllMocks();
  });

  test('getChildren root lists tasks', async () => {
    fakeTaskClient.listTasks.mockResolvedValue([{ id: 't1', title: 'T1', status: 'pending', childCount: 0 }]);
    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(fakeTaskClient.listTasks).toHaveBeenCalledWith(null);
  });

  test('getChildren for task with children returns child nodes', async () => {
    const task = { id: 't1', title: 'T1', status: 'pending', childCount: 1 };
    const taskItem: any = { contextValue: 'task', task };
    fakeTaskClient.listTasks.mockResolvedValue([{ id: 't1-1', title: 'Child', status: 'pending', childCount: 0 }]);
    const children = await provider.getChildren(taskItem);
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('Child');
  });
});
