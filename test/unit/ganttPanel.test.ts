import { GanttPanel } from '../../src/extension/views/panels/ganttPanel';
import { MCPGanttClient } from '../../src/extension/repositories/mcp/ganttClient';

type FakePanel = {
  reveal: jest.Mock;
  title: string;
  webview: {
    html: string;
    onDidReceiveMessage: jest.Mock;
    postMessage: jest.Mock;
  };
  onDidDispose: jest.Mock;
};

const sampleSnapshot = {
  metadata: {
    parentId: null,
    generatedAt: '2024-01-01T00:00:00Z',
    anchor: { start: '2024-01-01T00:00:00Z' }
  },
  tasks: [
    {
      id: 'task-1',
      label: 'Task 1',
      estimate: { durationHours: 8 },
      progress: 0.5,
      status: 'in_progress',
      lane: 'Alpha',
      wbsPath: ['task-1'],
      orderIndex: 0
    }
  ],
  dependencies: []
};

const createFakePanel = (): FakePanel => ({
  reveal: jest.fn(),
  title: '',
  webview: {
    html: '',
    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
    postMessage: jest.fn()
  },
  onDidDispose: jest.fn(() => ({ dispose: jest.fn() }))
});

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('GanttPanel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds HTML payload on initial load', async () => {
    const ganttClient = { getGanttSnapshot: jest.fn().mockResolvedValue(sampleSnapshot) };
    jest.spyOn(MCPGanttClient as any, 'getInstance').mockReturnValue(ganttClient);
    const fakePanel = createFakePanel();

    const panel: any = new (GanttPanel as any)(fakePanel, { path: '' } as any, { parentId: null });
    await flushPromises();

    expect(fakePanel.webview.html).toContain('__GANTT_PAYLOAD__');
    expect(fakePanel.webview.html).toContain('gantt.bundle.js');
    expect(fakePanel.webview.html).toContain('Task 1');
    expect(ganttClient.getGanttSnapshot).toHaveBeenCalledWith({ parentId: null, since: undefined });
  });

  it('refresh message triggers snapshot update', async () => {
    const ganttClient = { getGanttSnapshot: jest.fn().mockResolvedValue(sampleSnapshot) };
    jest.spyOn(MCPGanttClient as any, 'getInstance').mockReturnValue(ganttClient);
    const fakePanel = createFakePanel();

    const panel: any = new (GanttPanel as any)(fakePanel, { path: '' } as any, { parentId: null });
    await flushPromises();
    expect(fakePanel.webview.postMessage).not.toHaveBeenCalled();

    panel.onMessage({ command: 'refresh' });
    await flushPromises();

    expect(ganttClient.getGanttSnapshot).toHaveBeenCalledTimes(2);
    expect(fakePanel.webview.postMessage).toHaveBeenCalledWith({
      command: 'snapshot',
      snapshot: sampleSnapshot,
      context: { parentId: null, titleHint: undefined }
    });
  });

  it('changeParent message updates parent id', async () => {
    const ganttClient = { getGanttSnapshot: jest.fn().mockResolvedValue(sampleSnapshot) };
    jest.spyOn(MCPGanttClient as any, 'getInstance').mockReturnValue(ganttClient);
    const fakePanel = createFakePanel();

    const panel: any = new (GanttPanel as any)(fakePanel, { path: '' } as any, { parentId: null });
    await flushPromises();

    panel.onMessage({ command: 'changeParent', parentId: 'child-1', titleHint: 'Child Task' });
    await flushPromises();

    expect(ganttClient.getGanttSnapshot).toHaveBeenLastCalledWith({ parentId: 'child-1', since: undefined });
    expect(fakePanel.webview.postMessage).toHaveBeenCalledWith({
      command: 'snapshot',
      snapshot: sampleSnapshot,
      context: { parentId: 'child-1', titleHint: 'Child Task' }
    });
  });
});
