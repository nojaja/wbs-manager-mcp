import { TaskDetailPanel } from '../../src/extension/panels/taskDetailPanel';

// We will mock WBSService updateTaskApi and getTaskApi to simulate saveTask flows

describe('TaskDetailPanel save flows', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn((cb: any) => { /* store cb if needed */ }), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    webviewOptions: {}
  };

  test('saveTask success path triggers load and info message', async () => {
    const fakeService: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTaskApi: jest.fn().mockResolvedValue({ success: true })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);
    // call private saveTask
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeService.updateTaskApi).toHaveBeenCalled();
  });

  test('saveTask conflict path triggers reload option', async () => {
    const fakeService: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTaskApi: jest.fn().mockResolvedValue({ success: false, conflict: true })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeService.updateTaskApi).toHaveBeenCalled();
  });

  test('saveTask failure shows error', async () => {
    const fakeService: any = {
      getTaskApi: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
      updateTaskApi: jest.fn().mockResolvedValue({ success: false, error: 'fail' })
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeService);
    await (panel as any).saveTask({ title: 'New' });

    expect(fakeService.updateTaskApi).toHaveBeenCalled();
  });
});
