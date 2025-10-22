


import { jest } from '@jest/globals';
import * as path from 'path';
import { ServerService } from '../../src/extension/server/ServerService';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));
import * as fs from 'fs';
import * as child_process from 'child_process';

describe('サーバプロセス管理の現状動作テスト', () => {
  let serverPath: string;
  let workspaceRoot: string;
  let mockProcess: any;
  let outputChannel: { appendLine: jest.Mock, show: jest.Mock };
  let service: ServerService;
  // Node.js組み込みモジュールはESM+Jest環境で一度しかspyOnできないためdescribe直下で一度だけspyOn
  beforeEach(() => {
    jest.clearAllMocks();
    serverPath = path.join(__dirname, '../../src/server/index.js');
    workspaceRoot = path.join(__dirname, '..');
    mockProcess = {};
    outputChannel = { appendLine: jest.fn(), show: jest.fn() };
  service = ServerService.getInstance();
  });

  it('サーバファイル存在チェック: 存在しない場合はfalse', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const result = service.validateServerPath('notfound.js');
    expect(result).toBe(false);
    expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('notfound.js'));
  });

  it('サーバファイル存在チェック: 存在する場合はtrue', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const result = service.validateServerPath('exists.js');
    expect(result).toBe(true);
  });

  it('サーバプロセス起動時にchild_process.spawnが呼ばれる', () => {
    (child_process.spawn as jest.Mock).mockReturnValue(mockProcess);
    const env = service.spawnServerProcess('dummy.js', workspaceRoot);
    expect(child_process.spawn).toHaveBeenCalled();
    expect(env.WBS_MCP_DATA_DIR).toBe('.');
    expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Starting MCP server'));
  });

  it('MCP設定ファイルが正しく生成される', () => {
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.mkdirSync as jest.Mock).mockImplementation(() => '');
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    service.createMcpConfig(workspaceRoot, 'server.js');
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Created MCP configuration'));
  });
});
