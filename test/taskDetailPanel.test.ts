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
    getTask: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getHtmlForWebview contains task data', async () => {
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);
    const html = (panel as any).getHtmlForWebview({ id: 't1', title: 'Hello', status: 'pending', version: 1 });
    expect(html).toContain('Task Details');
    expect(html).toContain('Hello');
  });

});
