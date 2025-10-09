import { TaskDetailPanel } from '../src/panels/taskDetailPanel';

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
  const fakeMcp: any = {
    getTask: jest.fn().mockResolvedValue(null)
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getHtmlForWebview contains task data', async () => {
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    const html = (panel as any).getHtmlForWebview({ id: 't1', title: 'Hello', status: 'pending', version: 1 });
    expect(html).toContain('Task Details');
    expect(html).toContain('Hello');
    expect(html).toContain('deliverables');
    expect(html).toContain('前提条件');
    expect(html).toContain('完了条件');
  });

  test('buildUpdateObject forwards new collections and version', () => {
    const panel: any = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't2', fakeMcp);
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
