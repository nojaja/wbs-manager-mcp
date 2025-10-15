import { WBSTreeProvider } from '../../src/extension/views/explorer/wbsTree';
import * as vscode from 'vscode';

const fakeTaskClient: any = {
  listTasks: jest.fn(),
  createTask: jest.fn(),
  deleteTask: jest.fn(),
  getTask: jest.fn(),
  moveTask: jest.fn()
};

describe('WBSTreeProvider', () => {
  let provider: WBSTreeProvider;

  beforeEach(() => {
  provider = new WBSTreeProvider(fakeTaskClient);
    jest.clearAllMocks();
  });



  test('getTasks returns tasks', async () => {
    fakeTaskClient.listTasks.mockResolvedValue([{ id: 't1', title: 'T1', status: 'pending' }]);
    const items = await (provider as any).getTasks();
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
    fakeTaskClient.createTask.mockResolvedValue({ success: true, taskId: 'new-id' });
    const projectItem: any = { contextValue: 'project', itemId: 'p1' };
  const result = await provider.createTask(projectItem);
  expect(fakeTaskClient.createTask).toHaveBeenCalledWith({
    title: 'New Task',
    description: '',
    parentId: null,
    assignee: null,
    estimate: null
  });
    expect(result).toEqual({ success: true, taskId: 'new-id' });
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });




  test('handleTaskDrop moves task when valid', async () => {
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    fakeTaskClient.getTask.mockImplementation(async (id: string) => {
      if (id === 't1') return { id: 't1', parent_id: 'old', childCount: 0 };
      if (id === 'parentB') return { id: 'parentB', parent_id: null, childCount: 0 };
      return undefined;
    });
    fakeTaskClient.moveTask.mockResolvedValue({ success: true });

    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 'parentB', childCount: 0 } } as any);

    expect(fakeTaskClient.moveTask).toHaveBeenCalledWith('t1', 'parentB');
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('handleTaskDrop prevents moving under descendant', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    // Setup chain: child -> parent -> t1 (dragged), so moving t1 under child should be prevented
    fakeTaskClient.getTask.mockImplementation(async (id: string) => {
      if (id === 't1') return { id: 't1', parent_id: 'old', childCount: 1 };
      if (id === 'child') return { id: 'child', parent_id: 'parent', childCount: 0 };
      if (id === 'parent') return { id: 'parent', parent_id: 't1', childCount: 0 };
      return undefined;
    });

    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 'child', childCount: 0 } } as any);

    // Should be prevented and show warning; moveTask must NOT be called
    expect(fakeTaskClient.moveTask).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('handleTaskDrop moves task to project root', async () => {
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    fakeTaskClient.getTask.mockResolvedValue({
      id: 't1',
      parent_id: 'parentA',
      childCount: 0
    });
    fakeTaskClient.moveTask.mockResolvedValue({ success: true });

    await provider.handleTaskDrop('t1', { contextValue: 'project', itemId: 'p1' } as any);

    expect(fakeTaskClient.moveTask).toHaveBeenCalledWith('t1', null);
    expect(refreshSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    refreshSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('handleTaskDrop prevents moving task to different project root', async () => {
    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    fakeTaskClient.getTask.mockResolvedValue({
      id: 't1',
      parent_id: 'parentA',
      childCount: 0
    });

    await provider.handleTaskDrop('t1', { contextValue: 'project', itemId: 'p2' } as any);

    // Projects are no longer isolated; moving to workspace root is allowed
    expect(fakeTaskClient.moveTask).toHaveBeenCalledWith('t1', null);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('deleteTask warns when no selection', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    const result = await provider.deleteTask();
    expect(result.success).toBe(false);
  expect(warningSpy).toHaveBeenCalledWith('削除するタスクを選択してください。');
    warningSpy.mockRestore();
  });

  test('deleteTask warns when invalid selection', async () => {
    const warningSpy = jest.spyOn(vscode.window, 'showWarningMessage');
    const result = await provider.deleteTask({ contextValue: 'project' } as any);
    expect(result.success).toBe(false);
  expect(warningSpy).toHaveBeenCalledWith('削除するタスクを選択してください。');
    warningSpy.mockRestore();
  });

  test('deleteTask cancels when user does not confirm', async () => {
    const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
    const taskItem: any = { 
      contextValue: 'task', 
      task: { id: 't1', title: 'Test Task' } 
    };
    
    const result = await provider.deleteTask(taskItem);
    
    expect(result.success).toBe(false);
    expect(warningMessageSpy).toHaveBeenCalledWith(
      '選択したタスクとその子タスクを削除します。よろしいですか？',
      { modal: true },
      '削除'
    );
    warningMessageSpy.mockRestore();
  });

  test('deleteTask executes deletion when confirmed', async () => {
    const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('削除' as any);
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');
    const refreshSpy = jest.spyOn(provider, 'refresh').mockImplementation(() => {});
    
  fakeTaskClient.deleteTask.mockResolvedValue({ success: true });
    
    const taskItem: any = { 
      contextValue: 'task', 
      task: { id: 't1', title: 'Test Task' } 
    };
    
    const result = await provider.deleteTask(taskItem);
    
    expect(result.success).toBe(true);
  expect(fakeTaskClient.deleteTask).toHaveBeenCalledWith('t1');
    expect(refreshSpy).toHaveBeenCalled();
  expect(infoSpy).toHaveBeenCalledWith('タスクを削除しました。');
    
    warningMessageSpy.mockRestore();
    infoSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  test('deleteTask handles API error', async () => {
    const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('削除' as any);
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    
  fakeTaskClient.deleteTask.mockResolvedValue({ success: false, error: 'Task not found' });
    
    const taskItem: any = { 
      contextValue: 'task', 
      task: { id: 't1', title: 'Test Task' } 
    };
    
    const result = await provider.deleteTask(taskItem);
    
    expect(result.success).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('タスクの削除に失敗しました: Task not found');
    
    warningMessageSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('deleteTask handles exception', async () => {
    const warningMessageSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('削除' as any);
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    
  fakeTaskClient.deleteTask.mockRejectedValue(new Error('Network error'));
    
    const taskItem: any = { 
      contextValue: 'task', 
      task: { id: 't1', title: 'Test Task' } 
    };
    
    const result = await provider.deleteTask(taskItem);
    
    expect(result.success).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('タスクの削除中にエラーが発生しました: Network error');
    
    warningMessageSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('handleTaskDrop does nothing when no target', async () => {
  await provider.handleTaskDrop('t1', undefined as any);
  expect(fakeTaskClient.getTask).not.toHaveBeenCalled();
  });

  test('handleTaskDrop handles getTask error', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
  fakeTaskClient.getTask.mockResolvedValue(null);
    
    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 't2' } } as any);
    
  expect(errorSpy).toHaveBeenCalledWith('移動対象のタスクを取得できませんでした。');
    errorSpy.mockRestore();
  });

  test('handleTaskDrop handles move task API error', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    fakeTaskClient.getTask.mockImplementation(async (id: string) => {
      if (id === 't1') return { id: 't1', parent_id: 'old', childCount: 0 };
      if (id === 't2') return { id: 't2', parent_id: null, childCount: 0 };
      return undefined;
    });
    fakeTaskClient.moveTask.mockResolvedValue({ success: false, error: 'Move failed' });

    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 't2', childCount: 0 } } as any);

    expect(errorSpy).toHaveBeenCalledWith('タスクの移動に失敗しました: Move failed');
    errorSpy.mockRestore();
  });

  test('handleTaskDrop handles exception during move', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
  fakeTaskClient.getTask.mockRejectedValue(new Error('Connection error'));
    
    await provider.handleTaskDrop('t1', { contextValue: 'task', task: { id: 't2' } } as any);
    
    expect(errorSpy).toHaveBeenCalledWith('タスクの移動中にエラーが発生しました: Connection error');
    errorSpy.mockRestore();
  });

  test('getChildren returns tasks for root', async () => {
    fakeTaskClient.listTasks.mockResolvedValue([
      { id: 't1', title: 'Task 1', status: 'pending', childCount: 0 },
      { id: 't2', title: 'Task 2', status: 'in-progress', childCount: 1 }
    ]);
    
    const children = await provider.getChildren();
    
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Task 1');
    expect(children[1].label).toBe('Task 2');
  expect(fakeTaskClient.listTasks).toHaveBeenCalledWith(null);
  });

  test('getChildren returns child tasks for task element', async () => {
    const parentTask = { id: 'parent', title: 'Parent', childCount: 2 };
    const parentElement: any = { 
      contextValue: 'task', 
      task: parentTask 
    };
    
    fakeTaskClient.listTasks.mockResolvedValue([
      { id: 'child1', title: 'Child 1', status: 'pending', childCount: 0 },
      { id: 'child2', title: 'Child 2', status: 'completed', childCount: 0 }
    ]);
    
    const children = await provider.getChildren(parentElement);
    
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Child 1');
    expect(children[1].label).toBe('Child 2');
  expect(fakeTaskClient.listTasks).toHaveBeenCalledWith('parent');
  });

  test('getChildren returns empty array for non-task element', async () => {
    const projectElement: any = { contextValue: 'project', itemId: 'p1' };
    
    const children = await provider.getChildren(projectElement);
    
    expect(children).toHaveLength(0);
  });

  test('getTasks handles API error', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
  fakeTaskClient.listTasks.mockRejectedValue(new Error('API Error'));
    
    const tasks = await (provider as any).getTasks();
    
    expect(tasks).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith('Failed to fetch tasks: Error: API Error');
    errorSpy.mockRestore();
  });

  test('createTask handles API error response', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
  fakeTaskClient.createTask.mockResolvedValue({ success: false, error: 'Creation failed' });
    
    const projectItem: any = { contextValue: 'project', itemId: 'p1' };
    const result = await provider.createTask(projectItem);
    
    expect(result.success).toBe(false);
  expect(errorSpy).toHaveBeenCalledWith('タスクの作成に失敗しました: Creation failed');
    errorSpy.mockRestore();
  });

  test('createTask handles exception', async () => {
    const errorSpy = jest.spyOn(vscode.window, 'showErrorMessage');
  fakeTaskClient.createTask.mockRejectedValue(new Error('Network error'));
    
    const projectItem: any = { contextValue: 'project', itemId: 'p1' };
    const result = await provider.createTask(projectItem);
    
    expect(result.success).toBe(false);
  expect(errorSpy).toHaveBeenCalledWith('タスクの作成中にエラーが発生しました: Network error');
    errorSpy.mockRestore();
  });
});
