import * as vscode from 'vscode';
import { TaskDetailPanel } from '../src/panels/taskDetailPanel';

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
    TaskDetailPanel.createOrShow(fakeUri, 't1', {} as any);

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

    const fakeMcp: any = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: true }) };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    // simulate a save message
    expect(messageHandlers.length).toBeGreaterThan(0);
    const saveMsg = { command: 'save', data: { title: 'New' } };
    // call the handler
    messageHandlers[0](saveMsg);

    // updateTask should have been called via saveTask
    expect(fakeMcp.updateTask).toHaveBeenCalled();
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

    const fakeMcp: any = { getTask: jest.fn() };
    const inst = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    // push a disposable and call dispose
    (inst as any)._disposables.push(disposable as any);

    inst.dispose();

    expect((TaskDetailPanel as any).currentPanel).toBeUndefined();
    expect(disposable.dispose).toHaveBeenCalled();
    expect(fakePanel.dispose).toHaveBeenCalled();
  });

});
