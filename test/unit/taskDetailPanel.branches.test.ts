import { TaskDetailPanel } from '../../src/extension/panels/taskDetailPanel';
import * as vscode from 'vscode';

describe('TaskDetailPanel branches', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })),
      postMessage: jest.fn()
    },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    dispose: jest.fn(),
    webviewOptions: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updateTask calls loadTask with new id', async () => {
    const fakeMcp: any = { getTask: jest.fn().mockResolvedValue({ id: 't2', title: 'T2', version: 1 }) };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const spyLoad = jest.spyOn(panel as any, 'loadTask');
    await (panel as any).updateTask('t2');

    expect((panel as any)._taskId).toBe('t2');
    expect(spyLoad).toHaveBeenCalled();
  });

  test('loadTask shows error when getTask throws', async () => {
    const fakeMcp: any = { getTask: jest.fn().mockRejectedValue(new Error('fail')) };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panel as any).loadTask();
    expect(errSpy).toHaveBeenCalled();
  });

  test('saveTask success triggers load and executeCommand', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: true })
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const loadSpy = jest.spyOn(panel as any, 'loadTask').mockImplementation(async () => {});
    const execSpy = jest.spyOn(vscode.commands, 'executeCommand');
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Task updated successfully');
    expect(loadSpy).toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith('wbsTree.refresh');
  });

  test('saveTask conflict and Reload choice triggers loadTask', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Reload' as any);
    const loadSpy = jest.spyOn(panel as any, 'loadTask').mockImplementation(async () => {});

    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
  });

  test('saveTask conflict and Cancel choice does not reload', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cancel' as any);
    const loadSpy = jest.spyOn(panel as any, 'loadTask').mockImplementation(async () => {});

    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  test('saveTask shows error when updateTask throws', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockRejectedValue(new Error('boom'))
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panel as any).saveTask({ title: 'New' });
    expect(errSpy).toHaveBeenCalled();
  });

});
