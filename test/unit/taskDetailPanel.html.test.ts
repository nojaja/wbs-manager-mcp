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

  test('getHtmlForWebview embeds task payload and references bundle', () => {
    const fakeMcp: any = { getTask: jest.fn() };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1', fakeMcp);

    const task = { id: 't1', title: 'X', status: 'in-progress', version: 42, description: 'D', assignee: 'A', estimate: '3d' };
    const html = (panel as any).getHtmlForWebview(task);

    // Minimal HTML skeleton and script
    expect(html).toContain('<title>Task Detail</title>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('task.bundle.js');
    const m = html.match(/window.__TASK_PAYLOAD__ = (.*?);<\/script>/s);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]);
    expect(payload.task.id).toBe('t1');
    expect(payload.task.status).toBe('in-progress');
  });

  test('getHtmlForWebview includes pending status in payload', () => {
    const fakeMcp: any = { getTask: jest.fn() };
    const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't2', fakeMcp);
    const task = { id: 't2', title: 'Y', status: 'pending', version: 1 };
    const html = (panel as any).getHtmlForWebview(task);
    const m = html.match(/window.__TASK_PAYLOAD__ = (.*?);<\/script>/s);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]);
    expect(payload.task.status).toBe('pending');
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
