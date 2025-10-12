import { MCPClient } from '../src/extension/mcpClient';

describe('MCPClient extra tests', () => {
  let client: MCPClient;
  const fakeOutput = { appendLine: jest.fn() } as any;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new MCPClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('stop kills process and clears pending requests', () => {
    const kill = jest.fn();
    // @ts-ignore
    client['serverProcess'] = { kill };
    // @ts-ignore
    client['pendingRequests'].set(1, { resolve: () => {}, reject: () => {} });

    client.stop();

    expect(kill).toHaveBeenCalled();
    // @ts-ignore
    expect((client as any).pendingRequests.size).toBe(0);
  });

  test('sendNotification does not throw when no server', () => {
    expect(() => (client as any).sendNotification('m', {})).not.toThrow();
  });

  test('sendRequest times out after 10 seconds', async () => {
    const fakeStdout: any = { setEncoding: () => {}, on: () => {} };
    const fakeStdin = { write: jest.fn((s, cb) => cb && cb()) };
    // @ts-ignore
    client['serverProcess'] = { stdin: fakeStdin, stdout: fakeStdout, stderr: null };

    const p = (client as any).sendRequest('tools/call', { name: 'x' });

    // advance timers by 10s
    jest.advanceTimersByTime(10000);

    await expect(p).rejects.toThrow(/Request timeout/);
  });
});
