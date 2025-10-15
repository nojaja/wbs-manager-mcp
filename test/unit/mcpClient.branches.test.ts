import { MCPTaskClient } from '../../src/extension/repositories/mcp/taskClient';
import { MCPInitializeClient } from '../../src/extension/repositories/mcp/initializeClient';

describe('MCP client branch coverage', () => {
  const fakeOutput = { appendLine: jest.fn() } as any;
  let taskClient: MCPTaskClient;
  let initClient: MCPInitializeClient;

  beforeEach(() => {
    jest.useFakeTimers();
    taskClient = new MCPTaskClient(fakeOutput);
    initClient = new MCPInitializeClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('initialize throws when response has error', async () => {
    jest.spyOn(initClient as any, 'sendRequest').mockResolvedValue({ error: { message: 'init fail' } });
    await expect((initClient as any).initialize()).rejects.toThrow('Failed to initialize MCP: init fail');
  });

  test('handleResponseFromServer logs parse errors and onServerExit rejects pending requests', () => {
    taskClient.setWriter(() => {});
    taskClient.handleResponseFromServer('not-json');
    expect(fakeOutput.appendLine).toHaveBeenCalledWith(expect.stringContaining('Failed to parse response'));

    const rejectMock = jest.fn();
    (taskClient as any).pendingRequests.set(42, { resolve: jest.fn(), reject: rejectMock });
    taskClient.onServerExit(1, null);
    expect(rejectMock).toHaveBeenCalled();
  });

  test('sendRequest rejects when writer throws', async () => {
    taskClient.setWriter(() => {
      throw new Error('writefail');
    });
    await expect((taskClient as any).sendRequest('demoMethod', {})).rejects.toThrow('writefail');
    expect((taskClient as any).pendingRequests.size).toBe(0);
  });

  test('callTool rethrows error responses', async () => {
    jest.spyOn(taskClient as any, 'sendRequest').mockResolvedValue({ error: { message: 'tool error' } });
    await expect((taskClient as any).callTool('x', {})).rejects.toThrow('tool error');
  });

  test('listTasks returns parsed array on success', async () => {
    const payload = JSON.stringify([{ id: 't1', title: 'T1' }]);
    const res = { content: [{ text: payload }] };
    const callToolSpy = jest.spyOn(taskClient as any, 'callTool').mockResolvedValue(res);
    const r = await taskClient.listTasks('p1');
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].id).toBe('t1');
    expect(callToolSpy).toHaveBeenCalledWith('wbs.planMode.listTasks', { parentId: 'p1' });
  });
});
