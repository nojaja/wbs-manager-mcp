import { WBSTreeProvider } from '../src/views/wbsTree';
import * as vscode from 'vscode';

const fakeClient: any = {
  listProjects: jest.fn(),
  listTasks: jest.fn(),
  createTask: jest.fn(),
  deleteTask: jest.fn(),
  deleteProject: jest.fn(),
  getTask: jest.fn(),
  moveTask: jest.fn()
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

  test('deleteTask warns when target missing', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    const result = await provider.deleteTask();
    expect(result.success).toBe(false);
    expect(warningSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
  });

  test('deleteTask aborts when user cancels', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce(undefined as any);
    const result = await provider.deleteTask({ contextValue: 'task', task: { id: 't1' } } as any);
    expect(result.success).toBe(false);
    expect(fakeClient.deleteTask).not.toHaveBeenCalled();
    warningSpy.mockRestore();
  });

  test('deleteTask delegates to client and refreshes', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    warningSpy.mockResolvedValueOnce('削除' as never);
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    fakeClient.deleteTask.mockResolvedValue({ success: true });
    const result = await provider.deleteTask({ contextValue: 'task', task: { id: 't5' } } as any);
    expect(fakeClient.deleteTask).toHaveBeenCalledWith('t5');
    expect(result).toEqual({ success: true });
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test('deleteProject warns when target missing', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    const result = await provider.deleteProject();
    expect(result.success).toBe(false);
    expect(warningSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
  });

  test('deleteProject aborts when user cancels', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce(undefined as never);
    const result = await provider.deleteProject({ contextValue: 'project', itemId: 'p1' } as any);
    expect(result.success).toBe(false);
    expect(fakeClient.deleteProject).not.toHaveBeenCalled();
    warningSpy.mockRestore();
  });

  test('deleteProject delegates to client and refreshes', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    warningSpy.mockResolvedValueOnce('削除' as never);
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    fakeClient.deleteProject.mockResolvedValue({ success: true });
    const result = await provider.deleteProject({ contextValue: 'project', itemId: 'p7' } as any);
    expect(fakeClient.deleteProject).toHaveBeenCalledWith('p7');
    expect(result).toEqual({ success: true });
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    warningSpy.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test('handleTaskDrop moves task when valid', async () => {
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    fakeClient.getTask.mockResolvedValue({
      id: 't1',
      project_id: 'p1',
      parent_id: 'old',
      children: []
    });
    fakeClient.moveTask.mockResolvedValue({ success: true });

    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 'parentB', project_id: 'p1' } } as any);

    expect(fakeClient.moveTask).toHaveBeenCalledWith('t1', 'parentB');
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('handleTaskDrop prevents moving under descendant', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    fakeClient.getTask.mockResolvedValue({
      id: 't1',
      project_id: 'p1',
      parent_id: 'old',
      children: [
        { id: 'child', project_id: 'p1', children: [] }
      ]
    });

    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 'child', project_id: 'p1' } } as any);

    expect(fakeClient.moveTask).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('handleTaskDrop moves task to project root', async () => {
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    fakeClient.getTask.mockResolvedValue({
      id: 't1',
      project_id: 'p1',
      parent_id: 'parentA',
      children: []
    });
    fakeClient.moveTask.mockResolvedValue({ success: true });

    await provider.handleTaskDrop('t1', { contextValue: 'project', itemId: 'p1' } as any);

    expect(fakeClient.moveTask).toHaveBeenCalledWith('t1', null);
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('handleTaskDrop prevents moving task to different project root', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    fakeClient.getTask.mockResolvedValue({
      id: 't1',
      project_id: 'p1',
      parent_id: 'parentA',
      children: []
    });

    await provider.handleTaskDrop('t1', { contextValue: 'project', itemId: 'p2' } as any);

    expect(fakeClient.moveTask).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
