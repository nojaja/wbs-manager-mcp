import { MCPBaseClient } from '../../src/extension/repositories/mcp/baseClient';
import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';
import { MCPInitializeClient } from '../../src/extension/repositories/mcp/initializeClient';

const fakeOutput = { appendLine: jest.fn() } as any;

describe('MCP repository clients', () => {
  let taskClient: MCPTaskClient;
  let artifactClient: MCPArtifactClient;
  let initializeClient: MCPInitializeClient;

  beforeEach(() => {
    jest.useFakeTimers();
    taskClient = new MCPTaskClient(fakeOutput);
    artifactClient = new MCPArtifactClient(fakeOutput);
    initializeClient = new MCPInitializeClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('specialised clients extend the base transport', () => {
    expect(taskClient).toBeInstanceOf(MCPBaseClient);
    expect(artifactClient).toBeInstanceOf(MCPBaseClient);
    expect(initializeClient).toBeInstanceOf(MCPBaseClient);
  });

  test('sendRequest rejects when writer not registered', async () => {
    await expect((taskClient as any).sendRequest('foo')).rejects.toThrow('MCP server not started');
  });

  test('responses resolve only once matching pending id', async () => {
    const payloads: string[] = [];
    taskClient.setWriter((chunk: string) => {
      payloads.push(chunk);
    });

    const responsePromise = (taskClient as any).sendRequest('tools/call', { name: 'x' });
    expect(payloads).toHaveLength(1);

    const sent = JSON.parse(payloads[0]) as { id: number };
    (taskClient as any).handleResponse({ jsonrpc: '2.0', id: sent.id, result: { ok: true } });

    await expect(responsePromise).resolves.toEqual({ jsonrpc: '2.0', id: sent.id, result: { ok: true } });
  });

  test('request identifiers are unique across client instances', async () => {
    const captured: Array<{ source: string; id: number }> = [];
    const writer = (source: string) => (payload: string) => {
      captured.push({ source, id: JSON.parse(payload).id });
    };
    taskClient.setWriter(writer('task'));
    artifactClient.setWriter(writer('artifact'));

    const taskPromise = (taskClient as any).sendRequest('tools/call', {});
    const artifactPromise = (artifactClient as any).sendRequest('tools/call', {});

    expect(new Set(captured.map((c) => c.id)).size).toBe(2);

    for (const entry of captured) {
      if (entry.source === 'task') {
        (taskClient as any).handleResponse({ jsonrpc: '2.0', id: entry.id, result: {} });
      } else {
        (artifactClient as any).handleResponse({ jsonrpc: '2.0', id: entry.id, result: {} });
      }
    }

    await expect(taskPromise).resolves.toEqual(expect.objectContaining({ id: captured.find((c) => c.source === 'task')?.id }));
    await expect(artifactPromise).resolves.toEqual(expect.objectContaining({ id: captured.find((c) => c.source === 'artifact')?.id }));
  });

  test('task client parsing success path for getTask', async () => {
    jest.spyOn(taskClient as any, 'callTool').mockResolvedValue({ content: [{ text: JSON.stringify({ id: 't1', title: 'Task' }) }] });
    const task = await taskClient.getTask('t1');
    expect(task).toEqual({ id: 't1', title: 'Task' });
  });

  test('task client handles error plain text', async () => {
    jest.spyOn(taskClient as any, 'callTool').mockResolvedValue({ content: [{ text: 'Error ❌' }] });
    const task = await taskClient.getTask('t1');
    expect(task).toBeNull();
  });

  test('task client updateTask returns structured responses', async () => {
    const spy = jest.spyOn(taskClient as any, 'callTool');
    spy.mockResolvedValueOnce({ content: [{ text: '✅ ok' }] });
    const ok = await taskClient.updateTask('t1', {});
    expect(ok).toEqual({ success: true, taskId: 't1', message: '✅ ok' });

    spy.mockResolvedValueOnce({ content: [{ text: 'modified by another user' }] });
    const conflict = await taskClient.updateTask('t1', {});
    expect(conflict).toEqual({ success: false, conflict: true, error: 'modified by another user', message: 'modified by another user' });

    spy.mockResolvedValueOnce({ content: [{ text: '❌ fail' }] });
    const fail = await taskClient.updateTask('t1', {});
    expect(fail).toEqual({ success: false, error: '❌ fail', message: '❌ fail' });

    spy.mockRestore();
  });

  test('task client create/delete/move propagate parameters', async () => {
    const spy = jest.spyOn(taskClient as any, 'callTool');
    spy.mockResolvedValueOnce({ content: [{ text: '✅ Task created\nID: new-id' }] });
    const created = await taskClient.createTask({ parentId: 'root', title: 'Task' });
    expect(spy).toHaveBeenCalledWith('wbs.planMode.createTask', { parentId: 'root', title: 'Task' });
    expect(created).toEqual({ success: true, taskId: 'new-id', message: '✅ Task created\nID: new-id' });

    spy.mockResolvedValueOnce({ content: [{ text: '✅ removed' }] });
    const deleted = await taskClient.deleteTask('t1');
    expect(spy).toHaveBeenCalledWith('wbs.planMode.deleteTask', { taskId: 't1' });
    expect(deleted.success).toBe(true);

    spy.mockResolvedValueOnce({ content: [{ text: '✅ moved' }] });
    const moved = await taskClient.moveTask('t1', null);
    expect(spy).toHaveBeenCalledWith('wbs.planMode.moveTask', { taskId: 't1', newParentId: null });
    expect(moved.success).toBe(true);

    spy.mockRestore();
  });

  test('artifact client list/create/update/delete behaviour mirrors task client', async () => {
    const spy = jest.spyOn(artifactClient as any, 'callTool');
    spy.mockResolvedValueOnce({ content: [{ text: JSON.stringify([{ id: 'a1' }]) }] });
    const artifacts = await artifactClient.listArtifacts();
    expect(artifacts).toEqual([{ id: 'a1' }]);

    spy.mockResolvedValueOnce({ content: [{ text: JSON.stringify({ id: 'a1' }) }] });
    const created = await artifactClient.createArtifact({ title: 'A' });
    expect(created.success).toBe(true);

    spy.mockResolvedValueOnce({ content: [{ text: JSON.stringify({ id: 'a1' }) }] });
    const updated = await artifactClient.updateArtifact({ artifactId: 'a1' });
    expect(updated.success).toBe(true);

    spy.mockResolvedValueOnce({ content: [{ text: '✅ deleted' }] });
    const deleted = await artifactClient.deleteArtifact('a1');
    expect(deleted.success).toBe(true);

    spy.mockRestore();
  });
});
