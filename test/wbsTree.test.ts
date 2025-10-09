import { WBSTreeProvider } from '../src/views/wbsTree';
import * as vscode from 'vscode';

const fakeClient: any = {
  listProjects: jest.fn(),
  listTasks: jest.fn(),
  createTask: jest.fn()
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

  test('getTaskLabel falls back to id when title empty', () => {
    const label = (provider as any).getTaskLabel({ id: 't1', title: '', status: 'pending' });
    expect(label).toBe('t1');
  });

  test('getTaskDescription builds description', () => {
    const desc = (provider as any).getTaskDescription({ status: 'in-progress', assignee: 'alice', estimate: '3d' });
    expect(desc).toContain('@alice');
    expect(desc).toContain('3d');
  });

  test('createTask warns when no selection', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    const result = await provider.createTask();
    expect(result.success).toBe(false);
    expect(warningSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
  });

  test('createTask delegates to client and refreshes', async () => {
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    fakeClient.createTask.mockResolvedValue({ success: true, taskId: 'new-id' });
    const projectItem: any = { contextValue: 'project', itemId: 'p1' };
    const result = await provider.createTask(projectItem);
    expect(fakeClient.createTask).toHaveBeenCalledWith({ projectId: 'p1', parentId: null, title: 'New Task' });
    expect(result).toEqual({ success: true, taskId: 'new-id' });
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('createTask propagates parent id and reports errors', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    fakeClient.createTask.mockResolvedValue({ success: false, error: 'failed' });
    const taskItem: any = { contextValue: 'task', task: { project_id: 'p2', id: 't99' } };
    const result = await provider.createTask(taskItem);
    expect(fakeClient.createTask).toHaveBeenCalledWith({ projectId: 'p2', parentId: 't99', title: 'New Task' });
    expect(result.success).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
