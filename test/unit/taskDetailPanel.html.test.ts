import { TaskDetailPanel } from '../../src/extension/views/panels/taskDetailPanel';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

describe('TaskDetailPanel HTML and escapeHtml', () => {
  const fakePanel: any = {
    reveal: jest.fn(),
    title: '',
    webview: { html: '', onDidReceiveMessage: jest.fn(() => ({ dispose: () => {} })), postMessage: jest.fn() },
    onDidDispose: jest.fn(() => ({ dispose: () => {} })),
    dispose: jest.fn(),
    webviewOptions: {}
  };

  const createDeps = () => ({
    taskClient: {
      getTask: jest.fn(),
      updateTask: jest.fn()
    },
    artifactClient: {
      listArtifacts: jest.fn().mockResolvedValue([])
    }
  });

  test('getHtmlForWebview embeds task payload and references bundle', () => {
  const taskClientMock = { getTask: jest.fn().mockResolvedValue({ id: 't1', title: 'T1', version: 1 }) };
  const artifactClientMock = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't1');

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
  const taskClientMock2 = { getTask: jest.fn().mockResolvedValue({ id: 't2', title: 'T2', version: 1 }) };
  const artifactClientMock2 = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock2 as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock2 as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't2');
    const task = { id: 't2', title: 'Y', status: 'pending', version: 1 };
    const html = (panel as any).getHtmlForWebview(task);
    const m = html.match(/window.__TASK_PAYLOAD__ = (.*?);<\/script>/s);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]);
    expect(payload.task.status).toBe('pending');
  });

  test('escapeHtml escapes special characters', () => {
  const taskClientMock3 = { getTask: jest.fn().mockResolvedValue({ id: 't3', title: 'T3', version: 1 }) };
  const artifactClientMock3 = { listArtifacts: jest.fn().mockResolvedValue([]) };
  jest.spyOn(MCPTaskClient as any, 'getInstance').mockReturnValue(taskClientMock3 as any);
  jest.spyOn(MCPArtifactClient as any, 'getInstance').mockReturnValue(artifactClientMock3 as any);
  const panel = new (TaskDetailPanel as any)(fakePanel, { path: '' } as any, 't3');
    const unsafe = '& < > " \'';
    const escaped = (panel as any).escapeHtml(unsafe);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#039;');
  });

});
