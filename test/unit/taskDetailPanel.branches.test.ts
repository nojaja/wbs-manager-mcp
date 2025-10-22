import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import * as vscode from 'vscode';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

const createDeps = (overrides: {
  taskClient?: Partial<{ getTask: jest.Mock; updateTask: jest.Mock }>;
  artifactClient?: Partial<{ listArtifacts: jest.Mock }>;
} = {}) => {
  const taskClient = {
    getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
    updateTask: jest.fn().mockResolvedValue({ success: true }),
    ...(overrides.taskClient ?? {})
  };

  const artifactClient = {
    listArtifacts: jest.fn().mockResolvedValue([]),
    ...(overrides.artifactClient ?? {})
  };

  return { taskClient, artifactClient };
};

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
  const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't2', title: 'T2', version: 1 }) };
  const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

    const spyLoad = jest.spyOn(panel as any, 'loadTask');
    await (panel as any).updateTask('t2');

    expect((panel as any)._taskId).toBe('t2');
    expect(spyLoad).toHaveBeenCalled();
  });

  test('loadTask shows error when getTask throws', async () => {
  const taskClientMock = { getTask: jest.fn().mockRejectedValue(new Error('fail')) };
  const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panel as any).loadTask();
    expect(errSpy).toHaveBeenCalled();
  });

  test('saveTask success triggers load and executeCommand', async () => {
  const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: true }) };
  const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

    const loadSpy = jest.spyOn(panel as any, 'loadTask').mockImplementation(async () => {});
    const execSpy = jest.spyOn(vscode.commands, 'executeCommand');
    const infoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Task updated successfully');
    expect(loadSpy).toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith('wbsTree.refresh');
  });

  test('saveTask conflict and Reload choice triggers loadTask', async () => {
  const taskClientMockReload = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true }) };
  const artifactClientMockReload = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMockReload as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMockReload as any);
  const panelReload = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

  const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Reload' as any);
  const loadSpy = jest.spyOn(panelReload as any, 'loadTask').mockImplementation(async () => {});

    await (panelReload as any).saveTask({ title: 'New' });

  expect(depsReload.taskClient.updateTask).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
  });

  test('saveTask conflict and Cancel choice does not reload', async () => {
  const taskClientMockCancel = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true }) };
  const artifactClientMockCancel = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMockCancel as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMockCancel as any);
  const panelCancel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

  const warnSpy = jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cancel' as any);
  const loadSpy = jest.spyOn(panelCancel as any, 'loadTask').mockImplementation(async () => {});

    await (panelCancel as any).saveTask({ title: 'New' });

  expect(depsCancel.taskClient.updateTask).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  test('saveTask shows error when updateTask throws', async () => {
  const taskClientMockError = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockRejectedValue(new Error('boom')) };
  const artifactClientMockError = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMockError as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMockError as any);
  const panelError = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage');
    await (panelError as any).saveTask({ title: 'New' });
    expect(errSpy).toHaveBeenCalled();
  });

});
