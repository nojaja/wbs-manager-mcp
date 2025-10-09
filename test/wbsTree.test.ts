import { WBSTreeProvider } from '../src/views/wbsTree';

const fakeClient: any = {
  listProjects: jest.fn(),
  listTasks: jest.fn()
};

describe('WBSTreeProvider', () => {
  let provider: WBSTreeProvider;

  beforeEach(() => {
    provider = new WBSTreeProvider(fakeClient);
    jest.clearAllMocks();
  });

  test('getProjects returns TreeItem array', async () => {
    fakeClient.listProjects.mockResolvedValue([{ id: 'p1', title: 'P1', description: 'D' }]);
    const items = await (provider as any).getProjects();
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('P1');
  });

  test('getTasksForProject returns tasks', async () => {
    fakeClient.listTasks.mockResolvedValue([{ id: 't1', title: 'T1', status: 'pending' }]);
    const items = await (provider as any).getTasksForProject('p1');
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('T1');
  });

  test('getTaskDescription builds description', () => {
    const desc = (provider as any).getTaskDescription({ status: 'in-progress', assignee: 'alice', estimate: '3d' });
    expect(desc).toContain('@alice');
    expect(desc).toContain('3d');
  });
});
