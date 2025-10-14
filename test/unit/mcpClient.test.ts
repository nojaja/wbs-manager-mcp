import { MCPClient } from '../../src/extension/mcpClient';
import { MCPBaseClient } from '../../src/extension/mcp/baseClient';
import { MCPInitializeClient } from '../../src/extension/mcp/initializeClient';
import { MCPTaskClient } from '../../src/extension/mcp/taskClient';
import { MCPArtifactClient } from '../../src/extension/mcp/artifactClient';

const fakeOutput = { appendLine: jest.fn() } as any;

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new MCPClient(fakeOutput);
  });
  test('MCPClient composes specialized layers', () => {
    expect(client).toBeInstanceOf(MCPArtifactClient);
    expect(client).toBeInstanceOf(MCPTaskClient);
    expect(client).toBeInstanceOf(MCPInitializeClient);
    expect(client).toBeInstanceOf(MCPBaseClient);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('sendRequest rejects when server not started', async () => {
    // @ts-ignore - access private via cast
    const sendRequest = (client as any).sendRequest.bind(client);
    await expect(sendRequest('foo')).rejects.toThrow('MCP server not started');
  });

  test('handleResponse resolves pending request', async () => {
    // inject writer instead of mocking private serverProcess
    const fakeStdout: any = { setEncoding: () => {}, on: () => {} };
    const fakeStdin = { write: jest.fn((s, cb) => cb && cb()) };
    (client as any).setWriter((s: string) => {
      // emulate async write callback success
      fakeStdin.write(s, () => {});
    });

    const p = (client as any).sendRequest('tools/call', { name: 'x' });

    // grab pending id
    // @ts-ignore
    const pendingEntries = (client as any).pendingRequests.entries();
    let id: number | undefined;
    for (const [k] of pendingEntries) { id = k; break; }

    // send response
    (client as any).handleResponse({ jsonrpc: '2.0', id, result: { content: [{ text: '"ok"' }] } });

    await expect(p).resolves.toBeDefined();
  });


  test('getTask returns parsed object when content valid', async () => {
    const mockResult = { content: [{ text: JSON.stringify({ id: 't1', title: 'Task' }) }] };
    jest.spyOn(client as any, 'callTool').mockResolvedValue(mockResult);
    const task = await client.getTask('t1');
    expect(task).toEqual({ id: 't1', title: 'Task' });
  });

  test('getTask returns null when content has ❌', async () => {
    const mockResult = { content: [{ text: 'Error ❌' }] };
    jest.spyOn(client as any, 'callTool').mockResolvedValue(mockResult);
    const task = await client.getTask('t1');
    expect(task).toBeNull();
  });

  test('updateTask handles success, conflict and error', async () => {
    const success = { content: [{ text: '\u2705 OK' }] };
    const conflict = { content: [{ text: 'modified by another user' }] };
    const fail = { content: [{ text: 'some error' }] };

    const spy = jest.spyOn(client as any, 'callTool');
    spy.mockResolvedValueOnce(success);
    const r1 = await client.updateTask('t1', {});
    expect(r1).toEqual({ success: true });

    spy.mockResolvedValueOnce(conflict);
    const r2 = await client.updateTask('t1', {});
    expect(r2).toEqual({ success: false, conflict: true });

    spy.mockResolvedValueOnce(fail);
    const r3 = await client.updateTask('t1', {});
    expect(r3).toEqual({ success: false, error: 'some error' });

    spy.mockRestore();
  });

  test('createTask parses success response', async () => {
    const message = '✅ Task created successfully!\nID: new-task-id';
    const spy = jest.spyOn(client as any, 'callTool').mockResolvedValue({ content: [{ text: message }] });
    const result = await client.createTask({});
    expect(result).toEqual({ success: true, taskId: 'new-task-id', message });
    // MCPClient is transport-only when WBSService is not injected; expect raw params
    expect(spy).toHaveBeenCalledWith('wbs.planMode.createTask', {});
    spy.mockRestore();
  });

  test('createTask handles error response', async () => {
    const message = '❌ Failed to create task';
    const spy = jest.spyOn(client as any, 'callTool').mockResolvedValue({ content: [{ text: message }] });
    const result = await client.createTask({ parentId: 't1', title: ' ' });
    expect(result).toEqual({ success: false, error: message, message });
    // MCPClient forwards the provided params as-is when no WBSService is present
    expect(spy).toHaveBeenCalledWith('wbs.planMode.createTask', { parentId: 't1', title: ' ' });
    spy.mockRestore();
  });

  test('deleteTask handles success and error paths', async () => {
    const spy = jest.spyOn(client as any, 'callTool');
    spy.mockResolvedValueOnce({ content: [{ text: '✅ removed' }] });
    const ok = await client.deleteTask('t5');
    expect(ok).toEqual({ success: true });
    expect(spy).toHaveBeenCalledWith('wbs.planMode.deleteTask', { taskId: 't5' });

    spy.mockResolvedValueOnce({ content: [{ text: '❌ missing' }] });
    const fail = await client.deleteTask('t5');
    expect(fail).toEqual({ success: false, error: '❌ missing' });

    spy.mockRejectedValueOnce(new Error('boom'));
    const err = await client.deleteTask('t5');
    expect(err).toEqual({ success: false, error: 'boom' });

    spy.mockRestore();
  });


  test('moveTask handles success and error paths', async () => {
    const spy = jest.spyOn(client as any, 'callTool');
    spy.mockResolvedValueOnce({ content: [{ text: '✅ moved' }] });
    const ok = await client.moveTask('t1', 'p2');
    expect(ok).toEqual({ success: true });
    expect(spy).toHaveBeenCalledWith('wbs.planMode.moveTask', { taskId: 't1', newParentId: 'p2' });

    spy.mockResolvedValueOnce({ content: [{ text: '❌ fail' }] });
    const fail = await client.moveTask('t1', 'p2');
    expect(fail).toEqual({ success: false, error: '❌ fail' });

    spy.mockRejectedValueOnce(new Error('boom'));
    const err = await client.moveTask('t1', null);
    expect(err).toEqual({ success: false, error: 'boom' });

    spy.mockRestore();
  });

});
