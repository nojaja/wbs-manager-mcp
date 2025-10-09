import { MCPClient } from '../src/mcpClient';

const fakeOutput = { appendLine: jest.fn() } as any;

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new MCPClient(fakeOutput);
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
    // simulate serverProcess with stdin write
    const fakeStdout: any = { setEncoding: () => {}, on: () => {} };
    const fakeStdin = { write: jest.fn((s, cb) => cb && cb()) };

    // @ts-ignore
    client['serverProcess'] = { stdin: fakeStdin, stdout: fakeStdout, stderr: null };

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

  test('listProjects returns empty array on error', async () => {
    const spy = jest.spyOn(client as any, 'callTool').mockRejectedValue(new Error('fail'));
    const projects = await client.listProjects();
    expect(projects).toEqual([]);
    expect(fakeOutput.appendLine).toHaveBeenCalled();
    spy.mockRestore();
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

});
