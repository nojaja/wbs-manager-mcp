


import { jest } from '@jest/globals';
import * as path from 'path';

// Mock core modules BEFORE importing the module under test so the
// implementation picks up the mocked functions.
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
import { ServerService } from '../../src/extension/server/ServerService';
import { Logger } from '../../src/extension/Logger';

describe('サーバプロセス管理の現状動作テスト', () => {
  let serverPath: string;
  let workspaceRoot: string;
  let mockProcess: any;
  let service: ServerService;
  let logger: any;
  // Node.js組み込みモジュールはESM+Jest環境で一度しかspyOnできないためdescribe直下で一度だけspyOn
  beforeEach(() => {
    jest.clearAllMocks();
    serverPath = path.join(__dirname, '../../src/server/index.js');
    workspaceRoot = path.join(__dirname, '..');
    mockProcess = {};
  // spy on Logger singleton used by implementation
  logger = { log: jest.fn(), show: jest.fn() };
  jest.spyOn(Logger, 'getInstance').mockReturnValue(logger as any);
    // Ensure singleton is fresh so the Logger spy is used
    (ServerService as any).instance = undefined;
    service = ServerService.getInstance();
  });

  it('サーバファイル存在チェック: 存在しない場合はfalse', () => {
  (fs.existsSync as jest.Mock).mockReturnValue(false);
  const result = service.validateServerPath('notfound.js');
  expect(result).toBe(false);
  expect(Logger.getInstance().log).toHaveBeenCalledWith(expect.stringContaining('notfound.js'));
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
  expect(Logger.getInstance().log).toHaveBeenCalledWith(expect.stringContaining('Starting MCP server'));
  });

  it('MCP設定ファイルが正しく生成される', () => {
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.mkdirSync as jest.Mock).mockImplementation(() => '');
    (fs.existsSync as jest.Mock).mockReturnValue(false);
  service.createMcpConfig(workspaceRoot, 'server.js');
  expect(fs.mkdirSync).toHaveBeenCalled();
  expect(fs.writeFileSync).toHaveBeenCalled();
  expect(Logger.getInstance().log).toHaveBeenCalledWith(expect.stringContaining('Created MCP configuration'));
  });
});
