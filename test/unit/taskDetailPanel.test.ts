import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

const fakePanel: any = {
  reveal: jest.fn(),
  title: '',
  webview: { html: '', onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), postMessage: jest.fn() },
  onDidDispose: jest.fn(() => ({ dispose: () => {} })),
  webviewOptions: {}
};

const fakePanelFactory = {
  createWebviewPanel: jest.fn(() => fakePanel)
};

describe('TaskDetailPanel', () => {
  const createDeps = () => ({
    taskClient: {
      getTask: jest.fn().mockResolvedValue(null),
      updateTask: jest.fn().mockResolvedValue({ success: true })
    },
    artifactClient: {
      listArtifacts: jest.fn().mockResolvedValue([])
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getHtmlForWebview contains task data payload and script', async () => {
  const { taskClient: taskClientMock, artifactClient: artifactClientMock } = createDeps();
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');
    const html = (panel as any).getHtmlForWebview({ id: 't1', title: 'Hello', status: 'pending', version: 1 });
    // Title and container exist
    expect(html).toContain('<title>Task Detail</title>');
    expect(html).toContain('<div id="app"></div>');
    // Script bundle is referenced
    expect(html).toContain('task.bundle.js');
    // Payload embedding includes task data
    const m = html.match(/window.__TASK_PAYLOAD__ = (.*?);<\/script>/s);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]);
    expect(payload.task).toEqual({ id: 't1', title: 'Hello', status: 'pending', version: 1 });
  });

  test('buildUpdateObject forwards new collections and version', () => {
  const { taskClient: taskClientMock, artifactClient: artifactClientMock } = createDeps();
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel: any = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't2');
    panel._task = { version: 42 };
    const updates = panel.buildUpdateObject({
      deliverables: [{ artifactId: 'spec', crudOperations: 'UD' }],
      prerequisites: [{ artifactId: 'design' }],
      completionConditions: [{ description: 'レビュー完了' }]
    });

    expect(updates.deliverables).toEqual([{ artifactId: 'spec', crudOperations: 'UD' }]);
    expect(updates.prerequisites).toEqual([{ artifactId: 'design' }]);
    expect(updates.completionConditions).toEqual([{ description: 'レビュー完了' }]);
    expect(updates.ifVersion).toBe(42);
  });
});
