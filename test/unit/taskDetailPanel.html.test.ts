import { TaskDetailPanel } from '../../src/extension/panels/taskDetailPanel';

describe('TaskDetailPanel HTML and escapeHtml', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    dispose: jest.fn(),
    webviewOptions: {}
  };

  test('getHtmlForWebview includes selected status and readonly fields', () => {
    const fakeMcp: any = { getTask: jest.fn() };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

  const task = { id: 't1', title: 'X', status: 'in-progress', version: 42, description: 'D', assignee: 'A', estimate: '3d' };
    const html = (panel as any).getHtmlForWebview(task);

    // status option 'in-progress' should be selected
    expect(html).toContain('option value="in-progress" selected');
    // readonly fields
    expect(html).toContain('value="t1" readonly');
    expect(html).toContain('value="42" readonly');
    // fields present
    expect(html).toContain('T' /* title appears */);
  });

  test('getHtmlForWebview pending status selection', () => {
    const fakeMcp: any = { getTask: jest.fn() };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't2', fakeMcp);
    const task = { id: 't2', title: 'Y', status: 'pending', version: 1 };
    const html = (panel as any).getHtmlForWebview(task);
    expect(html).toContain('option value="pending" selected');
  });

  test('escapeHtml escapes special characters', () => {
    const fakeMcp: any = { getTask: jest.fn() };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't3', fakeMcp);
    const unsafe = '& < > " \'';
    const escaped = (panel as any).escapeHtml(unsafe);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#039;');
  });

});
