import { ServerService } from '../../src/extension/server/ServerService';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

// モックの設定
jest.mock('fs');
jest.mock('child_process');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedChildProcess = child_process as jest.Mocked<typeof child_process>;

describe('ServerService', () => {
  let serverService: ServerService;
  let mockOutputChannel: { appendLine: jest.Mock; show: jest.Mock };
  let mockChildProcess: {
    stdout: { on: jest.Mock };
    stderr: { on: jest.Mock };
    on: jest.Mock;
    kill: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOutputChannel = {
      appendLine: jest.fn(),
      show: jest.fn()
    };

    mockChildProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };

    serverService = new ServerService(mockOutputChannel);
  });

  describe('constructor', () => {
    it('should create ServerService with output channel', () => {
      const outputChannel = { appendLine: jest.fn(), show: jest.fn() };
      const service = new ServerService(outputChannel);
      expect(service).toBeInstanceOf(ServerService);
    });

    it('should create ServerService with minimal output channel', () => {
      const outputChannel = { appendLine: jest.fn() };
      const service = new ServerService(outputChannel);
      expect(service).toBeInstanceOf(ServerService);
    });
  });

  describe('validateServerPath', () => {
    it('should return true if server path exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      
      const result = serverService.validateServerPath('/path/to/server.js');
      
      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/path/to/server.js');
    });

    it('should return false and log error if server path does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      
      const result = serverService.validateServerPath('/path/to/nonexistent.js');
      
      expect(result).toBe(false);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Error: Server file not found at /path/to/nonexistent.js'
      );
    });
  });

  describe('spawnServerProcess', () => {
    it('should spawn server process with correct parameters', () => {
      mockedChildProcess.spawn.mockReturnValue(mockChildProcess as any);
      
      const serverEnv = serverService.spawnServerProcess('/path/to/server.js', '/workspace');
      
      expect(mockedChildProcess.spawn).toHaveBeenCalledWith(
        process.execPath,
        ['/path/to/server.js'],
        {
          cwd: '/workspace',
          env: {
            ...process.env,
            WBS_MCP_DATA_DIR: '.'
          },
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );
      expect(serverEnv).toEqual({
        ...process.env,
        WBS_MCP_DATA_DIR: '.'
      });
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        'Starting MCP server from: /path/to/server.js'
      );
    });
  });

  describe('setupServerProcessHandlers', () => {
    beforeEach(() => {
      mockedChildProcess.spawn.mockReturnValue(mockChildProcess as any);
      serverService.spawnServerProcess('/path/to/server.js', '/workspace');
    });

    it('should setup stdout handler', () => {
      serverService.setupServerProcessHandlers();
      
      expect(mockChildProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      
      // テスト用のデータを作成
  const stdoutCallback = mockChildProcess.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
  // simulate Buffer input
  stdoutCallback(Buffer.from('test output\n'));

  expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('test output');
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should setup stderr handler', () => {
      serverService.setupServerProcessHandlers();
      
      expect(mockChildProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
      
      // テスト用のエラーデータを作成
      const stderrCallback = mockChildProcess.stderr.on.mock.calls.find(call => call[0] === 'data')[1];
      stderrCallback(Buffer.from('test error'));
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('test error');
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should setup exit handler with normal exit', () => {
      const onExitCallback = jest.fn();
      serverService.setupServerProcessHandlers(onExitCallback);
      
      expect(mockChildProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
      
      // 正常終了のテスト
      const exitCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitCallback(0, null);
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Server process exited with code 0, signal: null');
      expect(onExitCallback).toHaveBeenCalledWith(0, null);
    });

    it('should setup exit handler with abnormal exit', () => {
      const onExitCallback = jest.fn();
      serverService.setupServerProcessHandlers(onExitCallback);
      
      const exitCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitCallback(1, 'SIGTERM');
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Server process exited with code 1, signal: SIGTERM');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('MCP server exited unexpectedly with code 1');
      expect(onExitCallback).toHaveBeenCalledWith(1, 'SIGTERM');
    });

    it('should setup error handler', () => {
      serverService.setupServerProcessHandlers();
      
      expect(mockChildProcess.on).toHaveBeenCalledWith('error', expect.any(Function));
      
      const errorCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'error')[1];
      const error = new Error('Test error');
      errorCallback(error);
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Server process error: Test error');
    });

    it('should handle missing server process', () => {
      const service = new ServerService(mockOutputChannel);
      service.setupServerProcessHandlers();
      
      // サーバプロセスがない場合は何もしない
      expect(mockChildProcess.stdout.on).not.toHaveBeenCalled();
    });

    it('should handle missing onExit callback', () => {
      serverService.setupServerProcessHandlers();
      
      const exitCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      expect(() => exitCallback(0, null)).not.toThrow();
    });
  });

  describe('stopServerProcess', () => {
    it('should stop server process if it exists', () => {
      mockedChildProcess.spawn.mockReturnValue(mockChildProcess as any);
      serverService.spawnServerProcess('/path/to/server.js', '/workspace');
      
      serverService.stopServerProcess();
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Stopping MCP server...');
      expect(mockChildProcess.kill).toHaveBeenCalled();
    });

    it('should do nothing if no server process exists', () => {
      serverService.stopServerProcess();
      
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
      expect(mockChildProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe('createMcpConfig', () => {
    it('should create MCP config file in existing .vscode directory', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.writeFileSync.mockImplementation(() => {});
      
      serverService.createMcpConfig('/workspace', '/path/to/server.js');
      
      const expectedConfig = {
        servers: {
          'wbs-mcp': {
            command: process.execPath,
            args: ['/path/to/server.js'],
            type: 'stdio',
            env: { WBS_MCP_DATA_DIR: '${workspaceFolder}' }
          }
        }
      };
      
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        path.join('/workspace', '.vscode', 'mcp.json'),
        JSON.stringify(expectedConfig, null, 2)
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        `Created MCP configuration at: ${path.join('/workspace', '.vscode', 'mcp.json')}`
      );
    });

    it('should create .vscode directory if it does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => '');
      mockedFs.writeFileSync.mockImplementation(() => {});
      
      serverService.createMcpConfig('/workspace', '/path/to/server.js');
      
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        path.join('/workspace', '.vscode'),
        { recursive: true }
      );
    });
  });

  describe('getServerProcess', () => {
    it('should return null when no server process exists', () => {
      const result = serverService.getServerProcess();
      expect(result).toBeNull();
    });

    it('should return server process when it exists', () => {
      mockedChildProcess.spawn.mockReturnValue(mockChildProcess as any);
      serverService.spawnServerProcess('/path/to/server.js', '/workspace');
      
      const result = serverService.getServerProcess();
      expect(result).toBe(mockChildProcess);
    });
  });
});