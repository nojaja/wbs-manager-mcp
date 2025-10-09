
import { WBSTreeProvider } from '../src/views/wbsTree';

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

  test('getChildren root calls getWorkspaceProject and lists tasks', async () => {
    fakeClient.getWorkspaceProject.mockResolvedValue({ id: 'p1', title: 'P1' });
    fakeClient.listTasks.mockResolvedValue([{ id: 't1', title: 'T1', status: 'pending' }]);
    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(fakeClient.getWorkspaceProject).toHaveBeenCalled();
    expect(fakeClient.listTasks).toHaveBeenCalledWith('p1');
  });

  test('getChildren for task with children returns child nodes', async () => {
    const task = { id: 't1', title: 'T1', status: 'pending', children: [{ id: 't1-1', title: 'Child', status: 'pending' }] };
    const taskItem: any = { contextValue: 'task', task };
    const children = await provider.getChildren(taskItem);
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('Child');
  });
});
