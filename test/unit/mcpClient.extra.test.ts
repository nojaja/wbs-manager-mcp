import { MCPArtifactClient } from '../../src/extension/repositories/mcp/artifactClient';

describe('MCPClient extra tests', () => {
  let client: MCPArtifactClient;
  const fakeOutput = { appendLine: jest.fn() } as any;

  beforeEach(() => {
    jest.useFakeTimers();
  client = new MCPArtifactClient(fakeOutput);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  test('stop clears pending requests', () => {
    // set a fake writer and pending request
    (client as any).setWriter(() => {});
    // @ts-ignore
    client['pendingRequests'].set(1, { resolve: () => {}, reject: () => {} });

    client.stop();

    // pendingRequests cleared
    // @ts-ignore
    expect((client as any).pendingRequests.size).toBe(0);
  });

  test('sendNotification does not throw when no server', () => {
    expect(() => (client as any).sendNotification('m', {})).not.toThrow();
  });

  test('sendRequest times out after 10 seconds', async () => {
    const fakeWrites: string[] = [];
    (client as any).setWriter((s: string) => { fakeWrites.push(s); });

    const p = (client as any).sendRequest('tools/call', { name: 'x' });

    // advance timers by 10s
    jest.advanceTimersByTime(10000);

    await expect(p).rejects.toThrow(/Request timeout/);
  });
});
