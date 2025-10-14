
import { WBSTreeProvider } from '../../src/extension/views/wbsTree';

describe('WBSTreeProvider extra tests', () => {
  const fakeClient: any = {
    listTasks: jest.fn(),
    getWorkspaceProject: jest.fn().mockResolvedValue({ id: 'p1', title: 'P1' })
  };
  let provider: WBSTreeProvider;

  beforeEach(() => {
    provider = new WBSTreeProvider(fakeClient);
    jest.clearAllMocks();
  });

  test('getChildren root lists tasks', async () => {
    fakeClient.listTasks.mockResolvedValue([{ id: 't1', title: 'T1', status: 'pending', childCount: 0 }]);
    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(fakeClient.listTasks).toHaveBeenCalledWith(null);
  });

  test('getChildren for task with children returns child nodes', async () => {
    const task = { id: 't1', title: 'T1', status: 'pending', childCount: 1 };
    const taskItem: any = { contextValue: 'task', task };
    fakeClient.listTasks.mockResolvedValue([{ id: 't1-1', title: 'Child', status: 'pending', childCount: 0 }]);
    const children = await provider.getChildren(taskItem);
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('Child');
  });
});
