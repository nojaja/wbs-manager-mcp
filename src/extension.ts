import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { WBSTreeProvider } from './views/wbsTree';
import { TaskDetailPanel } from './panels/taskDetailPanel';
import { MCPClient } from './mcpClient';

let serverProcess: child_process.ChildProcess | null = null;
let outputChannel: vscode.OutputChannel;
let treeProvider: WBSTreeProvider;
let mcpClient: MCPClient;

/**
 *
 * @param context
 */
export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    outputChannel.appendLine('MCP WBS Extension activated');

    // Initialize MCP client
    mcpClient = new MCPClient(outputChannel);

    // Auto-start server and MCP client connection
    await startLocalServer(context);

    // Initialize tree provider with MCP client (after MCP接続完了)
    treeProvider = new WBSTreeProvider(mcpClient);
    const treeView = vscode.window.createTreeView('wbsTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    // Register commands
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
        await startLocalServer(context);
        treeProvider.refresh();
    });

    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {
        // MCPClientが未接続なら再接続を試みる
        if (!mcpClient) {
            mcpClient = new MCPClient(outputChannel);
            await startLocalServer(context);
        }
        treeProvider.refresh();
    });

    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item) => {
        if (item && item.contextValue === 'task') {
            TaskDetailPanel.createOrShow(context.extensionUri, item.itemId, mcpClient);
        }
    });

    context.subscriptions.push(
        startServerCommand,
        refreshTreeCommand,
        openTaskCommand,
        treeView,
        outputChannel
    );
}

/**
 *
 */
export function deactivate() {
    if (mcpClient) {
        mcpClient.stop();
    }
    if (serverProcess) {
        outputChannel.appendLine('Stopping MCP server...');
        serverProcess.kill();
        (serverProcess as child_process.ChildProcess | null) = null;
    }
}

/**
 * Creates the MCP config file
 * @param workspaceRoot - The workspace root path
 * @param serverPath - Path to the server executable
 */
function createMcpConfig(workspaceRoot: string, serverPath: string): void {
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }

    const mcpConfig = {
        servers: {
            "wbs-mcp": {
                "command": process.execPath,
                "args": [
                    serverPath
                ],
                "type": "stdio",
                "env": {
                    "WBS_MCP_DATA_DIR": workspaceRoot
                }
            }
        }
    };

    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    outputChannel.appendLine(`Created MCP configuration at: ${mcpConfigPath}`);
    vscode.window.showInformationMessage('MCP server started successfully');
}

/**
 * Sets up server process event handlers
 * @param serverProcess - The server process
 */
function setupServerProcessHandlers(serverProcess: child_process.ChildProcess): void {
    serverProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        outputChannel.appendLine(`[Server] ${output}`);
        outputChannel.show();
    });

    serverProcess.stderr?.on('data', (data) => {
        const error = data.toString().trim();
        outputChannel.appendLine(`[Server Error] ${error}`);
        outputChannel.show();
        console.error('Server Error:', error);
    });

    serverProcess.on('exit', (code, signal) => {
        outputChannel.appendLine(`Server process exited with code ${code}, signal: ${signal}`);
        if (code !== 0) {
            vscode.window.showErrorMessage(`MCP server exited unexpectedly with code ${code}`);
        }
        (serverProcess as child_process.ChildProcess | null) = null;
    });

    serverProcess.on('error', (err) => {
        outputChannel.appendLine(`Server process error: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${err.message}`);
        (serverProcess as child_process.ChildProcess | null) = null;
    });
}

/**
 * Validates server path exists
 * @param serverPath - Path to server executable
 * @returns True if valid
 */
function validateServerPath(serverPath: string): boolean {
    if (!fs.existsSync(serverPath)) {
        vscode.window.showErrorMessage(`Server file not found: ${serverPath}`);
        outputChannel.appendLine(`Error: Server file not found at ${serverPath}`);
        return false;
    }
    return true;
}

/**
 * Starts MCP client and connects to server
 * @param serverPath - Path to server executable
 * @param serverEnv - Environment variables
 */
async function startMcpClient(serverPath: string, serverEnv: any): Promise<void> {
    outputChannel.appendLine('Starting MCP client connection...');
    await mcpClient.start(serverPath, {
        cwd: path.dirname(serverPath),
        env: serverEnv
    });
    outputChannel.appendLine('MCP client connected successfully');
}

/**
 * Spawns the server process
 * @param serverPath - Path to server executable
 * @param workspaceRoot - Workspace root path
 * @returns Server environment
 */
function spawnServerProcess(serverPath: string, workspaceRoot: string) {
    outputChannel.appendLine(`Starting MCP server from: ${serverPath}`);

    const serverEnv = {
        ...process.env,
        WBS_MCP_DATA_DIR: workspaceRoot
    };
    
    serverProcess = child_process.spawn(process.execPath, [serverPath], {
        cwd: workspaceRoot,
        env: serverEnv,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    return serverEnv;
}

/**
 * Handles MCP config creation
 * @param workspaceFolders - VS Code workspace folders
 * @param workspaceRoot - Workspace root path
 * @param serverPath - Path to server executable
 */
function handleMcpConfigCreation(workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined, workspaceRoot: string, serverPath: string): void {
    if (workspaceFolders && workspaceFolders.length > 0) {
        createMcpConfig(workspaceRoot, serverPath);
    } else {
        vscode.window.showWarningMessage('No workspace folder found. MCP configuration not created.');
    }
}

/**
 * @param context - VS Code extension context
 */
async function startLocalServer(context: vscode.ExtensionContext) {
    if (serverProcess) {
        vscode.window.showInformationMessage('MCP server is already running');
        return;
    }

    const serverPath = path.join(context.extensionPath, 'out', 'server', 'index.js');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : context.extensionPath;
    
    if (!validateServerPath(serverPath)) {
        return;
    }

    try {
        const serverEnv = spawnServerProcess(serverPath, workspaceRoot);
        setupServerProcessHandlers(serverProcess!);
        await startMcpClient(serverPath, serverEnv);
        handleMcpConfigCreation(workspaceFolders, workspaceRoot, serverPath);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${errorMessage}`);
        if (serverProcess) {
            (serverProcess as child_process.ChildProcess | null) = null;
        }
    }
}
