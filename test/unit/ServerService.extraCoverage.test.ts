import { ServerService } from '../../src/extension/server/ServerService';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { Logger } from '../../src/extension/Logger';

jest.mock('fs');
jest.mock('child_process');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedChildProcess = child_process as jest.Mocked<typeof child_process>;

describe('ServerService extra coverage', () => {
  let serverService: ServerService;
  let loggerMock: { log: jest.Mock; show: jest.Mock };
  let mockChildProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock = { log: jest.fn(), show: jest.fn() };
    jest.spyOn(Logger, 'getInstance').mockReturnValue(loggerMock as any);
    serverService = ServerService.getInstance();

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
    // ServerService no longer parses JSON; clients should parse raw lines themselves.
    const client = { handleResponse: jest.fn(), setWriter: jest.fn(), handleResponseFromServer: jest.fn() } as any;
    serverService.registerClient(client);

    serverService.spawnServerProcess('/path/to/server.js', '/workspace');
    serverService.setupServerProcessHandlers();

    // trigger stdout data callback with JSON line
    const stdoutCb = mockChildProcess.stdout.on.mock.calls.find((c: any[]) => c[0] === 'data')[1];
    const payload = { ping: 'pong' };
    const raw = JSON.stringify(payload);
    stdoutCb(Buffer.from(raw + '\n'));

    // ServerService should forward the raw JSON string to handleResponseFromServer
    expect(client.handleResponseFromServer).toHaveBeenCalledWith(raw);
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
    expect(Logger.getInstance().log).not.toHaveBeenCalledWith('raw line');
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
    expect(Logger.getInstance().log).toHaveBeenCalledWith('Error: Server file not found at /bad/path/server.js');
  });
});
