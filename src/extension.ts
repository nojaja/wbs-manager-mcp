import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { WBSTreeProvider } from './views/wbsTree';
import { TaskDetailPanel } from './panels/taskDetailPanel';

let serverProcess: child_process.ChildProcess | null = null;
let outputChannel: vscode.OutputChannel;
let treeProvider: WBSTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    outputChannel.appendLine('MCP WBS Extension activated');

    // Initialize tree provider
    treeProvider = new WBSTreeProvider();
    const treeView = vscode.window.createTreeView('wbsTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    // Auto-start server on activation
    startLocalServer(context);

    // Register commands
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
        await startLocalServer(context);
    });

    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', () => {
        treeProvider.refresh();
    });

    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item) => {
        if (item && item.contextValue === 'task') {
            TaskDetailPanel.createOrShow(context.extensionUri, item.itemId);
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

export function deactivate() {
    if (serverProcess) {
        outputChannel.appendLine('Stopping MCP server...');
        serverProcess.kill();
        serverProcess = null;
    }
}

async function startLocalServer(context: vscode.ExtensionContext) {
    if (serverProcess) {
        vscode.window.showInformationMessage('MCP server is already running');
        return;
    }

    const serverPath = path.join(context.extensionPath, 'out', 'server', 'index.js');
    
    if (!fs.existsSync(serverPath)) {
        vscode.window.showErrorMessage(`Server file not found: ${serverPath}`);
        outputChannel.appendLine(`Error: Server file not found at ${serverPath}`);
        return;
    }

    try {
        outputChannel.appendLine(`Starting MCP server from: ${serverPath}`);
        
        serverProcess = child_process.spawn(process.execPath, [serverPath], {
            cwd: context.extensionPath,
            env: { ...process.env }
        });

        serverProcess.stdout?.on('data', (data) => {
            const output = data.toString().trim();
            outputChannel.appendLine(`[Server] ${output}`);
            outputChannel.show(); // Show output panel automatically
        });

        serverProcess.stderr?.on('data', (data) => {
            const error = data.toString().trim();
            outputChannel.appendLine(`[Server Error] ${error}`);
            outputChannel.show(); // Show output panel automatically
            console.error('Server Error:', error);
        });

        serverProcess.on('exit', (code, signal) => {
            outputChannel.appendLine(`Server process exited with code ${code}, signal: ${signal}`);
            if (code !== 0) {
                vscode.window.showErrorMessage(`MCP server exited unexpectedly with code ${code}`);
            }
            serverProcess = null;
        });

        serverProcess.on('error', (err) => {
            outputChannel.appendLine(`Server process error: ${err.message}`);
            vscode.window.showErrorMessage(`Failed to start MCP server: ${err.message}`);
            serverProcess = null;
        });

        // Wait for server to start and test connectivity
        outputChannel.appendLine('Waiting for server to start...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test if server is responding
        try {
            const http = require('http');
            const testReq = http.get('http://127.0.0.1:8000/health', (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => {
                    outputChannel.appendLine(`Server health check OK: ${res.statusCode} - ${data}`);
                });
            });
            testReq.on('error', (err: any) => {
                outputChannel.appendLine(`Server health check failed: ${err.message}`);
            });
            testReq.setTimeout(3000);
        } catch (error) {
            outputChannel.appendLine(`Server connectivity test failed: ${error}`);
        }

        // Create or update .vscode/mcp.json
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const vscodeDir = path.join(workspaceRoot, '.vscode');
            const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

            // Create .vscode directory if it doesn't exist
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
            }

            const mcpConfig = {
                servers: {
                    "wbs-mcp": {
                        "command": "node",
                        "args": [
                            "d:\\devs\\workspace202111\\wbs-mcp\\out\\server\\index.js"
                        ],
                        "type": "http",
                        "url": "http://127.0.0.1:8000/mcp"
                    }
                }
            };

            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
            outputChannel.appendLine(`Created MCP configuration at: ${mcpConfigPath}`);
            vscode.window.showInformationMessage('MCP server started successfully');
        } else {
            vscode.window.showWarningMessage('No workspace folder found. MCP configuration not created.');
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${errorMessage}`);
        serverProcess = null;
    }
}
