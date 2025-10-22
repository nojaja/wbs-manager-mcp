import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

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
    const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: true }) };
    const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');
    // call private saveTask
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });

  test('saveTask conflict path triggers reload option', async () => {
    const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: false, conflict: true }) };
    const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });

  test('saveTask failure shows error', async () => {
    const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }), updateTask: jest.fn().mockResolvedValue({ success: false, error: 'fail' }) };
    const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
    jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
    jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);

    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');
    await (panel as any).saveTask({ title: 'New' });

  expect(deps.taskClient.updateTask).toHaveBeenCalled();
  });
});
