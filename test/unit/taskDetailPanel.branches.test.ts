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
    const fakeService: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't2', title: 'T2', version: 1 }),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn()
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);

    const spyLoad = jest.spyOn(panel as any, 'loadTask');
    await (panel as any).updateTask('t2');

    expect((panel as any)._taskId).toBe('t2');
    expect(spyLoad).toHaveBeenCalled();
  });

  test('loadTask shows error when getTask throws', async () => {
    const fakeService: any = {
      getTaskApi: jest.fn().mockRejectedValue(new Error('fail')),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn()
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panel as any).loadTask();
    expect(errSpy).toHaveBeenCalled();
  });

  test('saveTask success triggers load and executeCommand', async () => {
    const fakeService: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn().mockResolvedValue({ success: true })
    };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);

    const loadSpy = jest.spyOn(panel as any, 'loadTask').mockImplementation(async () => {});
    const execSpy = jest.spyOn(vscode.commands, 'executeCommand');
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

    await (panel as any).saveTask({ title: 'New' });

    expect(fakeService.updateTaskApi).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Task updated successfully');
    expect(loadSpy).toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith('wbsTree.refresh');
  });

  test('saveTask conflict and Reload choice triggers loadTask', async () => {
    const fakeServiceConflictReload: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };
    const panelReload = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeServiceConflictReload);

  const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Reload' as any);
  const loadSpy = jest.spyOn(panelReload as any, 'loadTask').mockImplementation(async () => {});

    await (panelReload as any).saveTask({ title: 'New' });

    expect(fakeServiceConflictReload.updateTaskApi).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
  });

  test('saveTask conflict and Cancel choice does not reload', async () => {
    const fakeServiceConflictCancel: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };
    const panelCancel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeServiceConflictCancel);

  const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cancel' as any);
  const loadSpy = jest.spyOn(panelCancel as any, 'loadTask').mockImplementation(async () => {});

    await (panelCancel as any).saveTask({ title: 'New' });

    expect(fakeServiceConflictCancel.updateTaskApi).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  test('saveTask shows error when updateTask throws', async () => {
    const fakeServiceError: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      listArtifactsApi: jest.fn().mockResolvedValue([]),
      updateTaskApi: jest.fn().mockRejectedValue(new Error('boom'))
    };
    const panelError = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeServiceError);

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panelError as any).saveTask({ title: 'New' });
    expect(errSpy).toHaveBeenCalled();
  });

});
