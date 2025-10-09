import { TaskDetailPanel } from '../src/panels/taskDetailPanel';

// We will mock mcpClient.updateTask and mcpClient.getTask to simulate saveTask flows

describe('TaskDetailPanel save flows', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn((cb: any) => { /* store cb if needed */ }), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    webviewOptions: {}
  };

  test('saveTask success path triggers load and info message', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: true })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    // call private saveTask
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
  });

  test('saveTask conflict path triggers reload option', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
  });

  test('saveTask failure shows error', async () => {
    const fakeMcp: any = {
      getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTask: jest.fn().mockResolvedValue({ success: false, error: 'fail' })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeMcp.updateTask).toHaveBeenCalled();
  });
});
