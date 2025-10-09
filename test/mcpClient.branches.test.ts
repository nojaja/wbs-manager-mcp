describe('MCPClient branch coverage', () => {
  let client: any;
  const fakeOutput = { appendLine: jest.fn() } as any;

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('initialize throws when response has error', async () => {
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    jest.spyOn(client as any, 'sendRequest').mockResolvedValue({ error: { message: 'init fail' } });
    await expect((client as any).initialize()).rejects.toThrow('Failed to initialize MCP: init fail');
  });

  test('start logs parse error from stdout and handles exit rejecting pending', async () => {
    jest.useFakeTimers();
    const handlers: any = {};

    const fakeProcess: any = {
      stdin: { write: jest.fn() },
      stdout: { setEncoding: jest.fn(), on: (evt: string, cb: any) => { if (evt === 'data') handlers.stdout = cb; } },
      stderr: { on: (evt: string, cb: any) => { if (evt === 'data') handlers.stderr = cb; } },
      on: (evt: string, cb: any) => { if (evt === 'exit') handlers.exit = cb; if (evt === 'error') handlers.error = cb; },
      kill: jest.fn()
    };

    jest.resetModules();
    jest.doMock('child_process', () => ({ spawn: () => fakeProcess }));
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);

    jest.spyOn(client as any, 'sendRequest').mockResolvedValue({});
    const startP = client.start('somepath');

    // simulate stdout data with bad JSON
    handlers.stdout && handlers.stdout('notjson\n');

    // simulate exit after start initialized
    jest.advanceTimersByTime(1000);
    await startP;

    expect(fakeOutput.appendLine).toHaveBeenCalled();
    // now set a pending request and trigger exit
    const rejectMock = jest.fn();
    (client as any).pendingRequests.set(99, { resolve: () => {}, reject: rejectMock });
    handlers.exit && handlers.exit(1, null);
    expect(rejectMock).toHaveBeenCalled();
  });

  test('sendRequest rejects when stdin.write callback errors', async () => {
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    const fakeStdin = { write: (_: string, cb: any) => cb && cb(new Error('writefail')) };
    client['serverProcess'] = { stdin: fakeStdin } as any;

    await expect((client as any).sendRequest('m', {})).rejects.toThrow('writefail');
    expect((client as any).pendingRequests.size).toBe(0);
  });

  test('callTool throws when response.error present', async () => {
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    jest.spyOn(client as any, 'sendRequest').mockResolvedValue({ error: { message: 'tool error' } });
    await expect(client.callTool('x', {})).rejects.toThrow('tool error');
  });

  test('listProjects returns parsed array on success', async () => {
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    const payload = JSON.stringify([{ id: 'p1', title: 'P1' }]);
    const res = { content: [{ text: payload }] };
    jest.spyOn(client as any, 'callTool').mockResolvedValue(res);
    const r = await client.listProjects();
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].id).toBe('p1');
  });

  test('listTasks returns parsed array on success', async () => {
    const mod = await import('../src/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    const payload = JSON.stringify([{ id: 't1', title: 'T1' }]);
    const res = { content: [{ text: payload }] };
    jest.spyOn(client as any, 'callTool').mockResolvedValue(res);
    const r = await client.listTasks('p1');
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].id).toBe('t1');
  });
});
