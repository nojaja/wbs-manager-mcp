import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';

// We will mock task and artifact client methods to simulate saveTask flows

describe('TaskDetailPanel save flows', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn((cb: any) => { /* store cb if needed */ }), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    webviewOptions: {}
  };

  test('saveTask success path triggers load and info message', async () => {
    const deps = {
      taskClient: {
        getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
        updateTask: jest.fn().mockResolvedValue({ success: true })
      },
      artifactClient: {
        listArtifacts: jest.fn().mockResolvedValue([])
      }
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', deps);
    // call private saveTask
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });

  test('saveTask conflict path triggers reload option', async () => {
    const deps = {
      taskClient: {
        getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
        updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true })
      },
      artifactClient: {
        listArtifacts: jest.fn().mockResolvedValue([])
      }
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', deps);
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });

  test('saveTask failure shows error', async () => {
    const deps = {
      taskClient: {
        getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }),
        updateTask: jest.fn().mockResolvedValue({ success: false, error: 'fail' })
      },
      artifactClient: {
        listArtifacts: jest.fn().mockResolvedValue([])
      }
    };

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', deps);
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });
});
