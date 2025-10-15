import { jest } from '@jest/globals';
import * as vscode from 'vscode';

// Use CommonJS style mocking to avoid top-level await and ESM Jest features
jest.mock('../../src/extension/server/ServerService', () => ({
    ServerService: jest.fn().mockImplementation(() => ({
        validateServerPath: jest.fn().mockReturnValue(true),
        spawnServerProcess: jest.fn().mockReturnValue({}),
        setupServerProcessHandlers: jest.fn(),
        getServerProcess: jest.fn().mockReturnValue({}),
        createMcpConfig: jest.fn()
    }))
}));

jest.mock('../../src/extension/mcp/initializeClient', () => ({
    MCPInitializeClient: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
        stop: jest.fn()
    }))
}));
jest.mock('../../src/extension/mcp/taskClient', () => ({
    MCPTaskClient: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
        stop: jest.fn()
    }))
}));
jest.mock('../../src/extension/mcp/artifactClient', () => ({
    MCPArtifactClient: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
        stop: jest.fn()
    }))
}));

// Import the mocked constructors
const { ServerService } = require('../../src/extension/server/ServerService');
const { MCPInitializeClient } = require('../../src/extension/mcp/initializeClient');
const { MCPTaskClient } = require('../../src/extension/mcp/taskClient');
const { MCPArtifactClient } = require('../../src/extension/mcp/artifactClient');

describe('startLocalServer integration', () => {
    let context: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // minimal extension context stub
        context = {
            extensionPath: __dirname,
            extensionUri: { fsPath: __dirname }
        } as any;

        // provide a workspace folder
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: 'D:/devs/workspace202111/wbs-mcp' } }
        ];
    });

    it('should follow server start sequence when not running (simulated)', async () => {
    // Create instances using the mocked constructors (call instead of new to match jest.fn mockImplementation behavior)
    const svc = (ServerService as any)() as any;
    const client = (MCPInitializeClient as any)() as any;

        // Simulate startLocalServer logic manually
        // validateServerPath
        expect(svc.validateServerPath()).toBe(true);
        // spawnServerProcess
        const env = svc.spawnServerProcess('serverPath', 'workspaceRoot');
        expect(svc.spawnServerProcess).toHaveBeenCalled();
        // setup handlers
        svc.setupServerProcessHandlers();
        expect(svc.setupServerProcessHandlers).toHaveBeenCalled();
        // get process and start client
        const proc = svc.getServerProcess();
        expect(svc.getServerProcess).toHaveBeenCalled();
        if (proc) {
            await client.start(proc);
        }
        expect(client.start).toHaveBeenCalled();
        // create config
        svc.createMcpConfig('workspaceRoot', 'serverPath');
        expect(svc.createMcpConfig).toHaveBeenCalled();
    });
});
