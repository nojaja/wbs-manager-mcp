import * as vscode from 'vscode';
import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

describe('TaskDetailPanel constructor and dispose', () => {
  afterEach(() => {
    jest.clearAllMocks();
    (TaskDetailPanel as any).currentPanel = undefined;
  });

  test('createOrShow uses existing panel and calls updateTask', () => {
    const fakePanelInstance: any = {
      _panel: { reveal: jest.fn() },
      updateTask: jest.fn()
    };
    (TaskDetailPanel as any).currentPanel = fakePanelInstance;

    const fakeUri: any = { path: '' };
    // Mock internal clients
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue({ getTask: jest.fn(), updateTask: jest.fn() } as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue({ listArtifacts: jest.fn() } as any);
    TaskDetailPanel.createOrShow(fakeUri, 't1');

    expect(fakePanelInstance._panel.reveal).toHaveBeenCalled();
    expect(fakePanelInstance.updateTask).toHaveBeenCalledWith('t1');
  });

  test('constructor wires onDidReceiveMessage to call saveTask', () => {
    const messageHandlers: any[] = [];
    const fakeWebview: any = { onDidReceiveMessage: (cb: any) => messageHandlers.push(cb), postMessage: jest.fn() };
    const fakePanel: any = {
      webview: fakeWebview,
      onDidDispose: jest.fn((cb: any) => { /* store cb if needed */ }),
      title: '',
      webviewOptions: {},
      dispose: jest.fn()
    };

    const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: true }) };
    const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

    // simulate a save message
    expect(messageHandlers.length).toBeGreaterThan(0);
    const saveMsg = { command: 'save', data: { title: 'New' } };
    // call the handler
    messageHandlers[0](saveMsg);

    // updateTask should have been called via saveTask
  expect(taskClientMock.updateTask).toHaveBeenCalled();
  });

  test('dispose clears currentPanel and disposables', () => {
    const disposable = { dispose: jest.fn() };
    const fakePanel: any = {
      reveal: jest.fn(),
      title: '',
      webview: { html: '', onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), postMessage: jest.fn() },
      onDidDispose: jest.fn(() => ({ dispose: () => {} })),
      dispose: jest.fn()
    };

    const taskClientMock = { getTask: jest.fn(), updateTask: jest.fn() };
    const artifactClientMock = { listArtifacts: jest.fn() };
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
    const inst = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');
    // push a disposable and call dispose
    (inst as any)._disposables.push(disposable as any);

    inst.dispose();

    expect((TaskDetailPanel as any).currentPanel).toBeUndefined();
    expect(disposable.dispose).toHaveBeenCalled();
    expect(fakePanel.dispose).toHaveBeenCalled();
  });

});
