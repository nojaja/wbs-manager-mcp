import { ServerService } from '../../src/extension/server/ServerService';
import * as fs from 'fs';
import * as child_process from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedChildProcess = child_process as jest.Mocked<typeof child_process>;

describe('ServerService extra coverage', () => {
  let serverService: ServerService;
  let mockOutputChannel: { appendLine: jest.Mock; show: jest.Mock };
  let mockChildProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOutputChannel = { appendLine: jest.fn(), show: jest.fn() };
    serverService = new ServerService(mockOutputChannel as any);

    mockChildProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
      stdin: { write: jest.fn() },
    };
  });

  it('forwards JSON stdout lines to registered client.handleResponse', () => {
    mockedChildProcess.spawn.mockReturnValue(mockChildProcess);
    // register client with handleResponse
    const client = { handleResponse: jest.fn(), setWriter: jest.fn() } as any;
    serverService.registerClient(client);

    serverService.spawnServerProcess('/path/to/server.js', '/workspace');
    serverService.setupServerProcessHandlers();

    // trigger stdout data callback with JSON line
    const stdoutCb = mockChildProcess.stdout.on.mock.calls.find((c: any[]) => c[0] === 'data')[1];
    const payload = { ping: 'pong' };
    stdoutCb(Buffer.from(JSON.stringify(payload) + '\n'));

    expect(client.handleResponse).toHaveBeenCalledWith(payload);
    // no plain append for JSON path
    expect(mockOutputChannel.appendLine).not.toHaveBeenCalledWith(expect.stringContaining('Non-JSON'));
  });

  it('forwards raw stdout to handleResponseFromServer and does not append log', () => {
    mockedChildProcess.spawn.mockReturnValue(mockChildProcess);
    const client = { handleResponseFromServer: jest.fn(), setWriter: jest.fn() } as any;
    serverService.registerClient(client);

    serverService.spawnServerProcess('/path/to/server.js', '/workspace');
    serverService.setupServerProcessHandlers();

    const stdoutCb = mockChildProcess.stdout.on.mock.calls.find((c: any[]) => c[0] === 'data')[1];
    stdoutCb(Buffer.from('raw line\n'));

    expect(client.handleResponseFromServer).toHaveBeenCalledWith('raw line');
    expect(mockOutputChannel.appendLine).not.toHaveBeenCalledWith('raw line');
  });

  it('registerClient provides writer that writes to stdin', () => {
    mockedChildProcess.spawn.mockReturnValue(mockChildProcess);
    const client: any = { setWriter: jest.fn() };

    serverService.spawnServerProcess('/path/to/server.js', '/workspace');
    serverService.registerClient(client);

    // capture provided writer
    const writer = client.setWriter.mock.calls[0][0] as (s: string) => void;
    writer('hello');
    expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('hello');
  });

  it('startAndAttachClient: early return when server path missing', async () => {
    mockedFs.existsSync.mockReturnValue(false);
    const client = { start: jest.fn(), setWriter: jest.fn() } as any;

    await serverService.startAndAttachClient(client, '/bad/path/server.js', '/workspace');

    expect(mockedChildProcess.spawn).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Error: Server file not found at /bad/path/server.js');
  });
});
