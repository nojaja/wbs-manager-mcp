describe('MCPClient branch coverage', () => {
  let client: any;
  const fakeOutput = { appendLine: jest.fn() } as any;

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('initialize throws when response has error', async () => {
    const mod = await import('../src/extension/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    jest.spyOn(client as any, 'sendRequest').mockResolvedValue({ error: { message: 'init fail' } });
    await expect((client as any).initialize()).rejects.toThrow('Failed to initialize MCP: init fail');
  });

  test('start logs parse error from stdout and handles exit rejecting pending', async () => {
    jest.useFakeTimers();
    const handlers: any = {};

    // ChildProcess型のダミーオブジェクトを型安全に作成
    class DummyWritable {
      writable = true;
      write = jest.fn();
    }
    class DummyReadable {
      readable = true;
      setEncoding = jest.fn();
      on = (evt: string, cb: any) => { if (evt === 'data') handlers.stdout = cb; };
    }
    class DummyChildProcess {
      stdin = new DummyWritable();
      stdout = new DummyReadable();
      stderr = { on: (evt: string, cb: any) => { if (evt === 'data') handlers.stderr = cb; } };
      on = (evt: string, cb: any) => { if (evt === 'exit') handlers.exit = cb; if (evt === 'error') handlers.error = cb; };
      kill = jest.fn();
    }

  jest.resetModules();
  jest.doMock('child_process', () => ({ spawn: () => new DummyChildProcess() }));
  const mod = await import('../src/extension/mcpClient');
  client = new mod.MCPClient(fakeOutput);

  // provide a writer so sendRequest can work
  client.setWriter((s: string) => {});

  jest.spyOn(client as any, 'sendRequest').mockResolvedValue({});
  const startP = client.start();

  // simulate ServerService passing a bad JSON line
  // The client should log parse error when handleResponseFromServer is called with bad input wrapped
  client.handleResponseFromServer('notjson' as any);

  // simulate exit after start initialized
  jest.advanceTimersByTime(1000);
  await startP;

  expect(fakeOutput.appendLine).toHaveBeenCalled();
  // now set a pending request and trigger exit by calling client's onServerExit
  const rejectMock = jest.fn();
  (client as any).pendingRequests.set(99, { resolve: () => {}, reject: rejectMock });
  // call client's onServerExit to simulate ServerService notification
  (client as any).onServerExit(1, null);
  expect(rejectMock).toHaveBeenCalled();
  });

  test('sendRequest rejects when stdin.write callback errors', async () => {
    const mod = await import('../src/extension/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    // simulate writer that throws via callback
    client.setWriter((_: string) => { throw new Error('writefail'); });

    await expect((client as any).sendRequest('m', {})).rejects.toThrow('writefail');
    expect((client as any).pendingRequests.size).toBe(0);
  });

  test('callTool throws when response.error present', async () => {
    const mod = await import('../src/extension/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    jest.spyOn(client as any, 'sendRequest').mockResolvedValue({ error: { message: 'tool error' } });
    await expect(client.callTool('x', {})).rejects.toThrow('tool error');
  });



  test('listTasks returns parsed array on success', async () => {
    const mod = await import('../src/extension/mcpClient');
    client = new mod.MCPClient(fakeOutput);
    const payload = JSON.stringify([{ id: 't1', title: 'T1' }]);
    const res = { content: [{ text: payload }] };
    const callToolSpy = jest.spyOn(client as any, 'callTool').mockResolvedValue(res);
    const r = await client.listTasks('p1');
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].id).toBe('t1');
    expect(callToolSpy).toHaveBeenCalledWith('wbs.listTasks', { parentId: 'p1' });
  });
});
