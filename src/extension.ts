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
 * アクティベート処理
 * 拡張機能の初期化、MCPクライアント・サーバ起動、ツリービュー・コマンド登録を行う
 * @param context VSCode拡張機能のコンテキスト
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
 * デアクティベート処理
 * 拡張機能の終了時にMCPクライアント・サーバプロセスを停止する
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
 * MCP設定ファイル作成処理
 * .vscode/mcp.jsonを生成し、サーバ起動設定を保存する
 * @param workspaceRoot ワークスペースルートパス
 * @param serverPath サーバ実行ファイルのパス
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
 * サーバプロセスイベントハンドラ設定処理
 * サーバプロセスの標準出力・エラー・終了イベントを監視し、ログ出力やエラー通知を行う
 * @param serverProcess サーバプロセス
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
 * サーバパス検証処理
 * サーバ実行ファイルの存在を確認し、なければエラー通知する
 * @param serverPath サーバ実行ファイルのパス
 * @returns 存在すればtrue、なければfalse
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
 * MCPクライアント起動・接続処理
 * MCPクライアントを起動し、サーバへ接続する
 * @param serverPath サーバ実行ファイルのパス
 * @param serverEnv サーバ用環境変数
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
 * サーバプロセス起動処理
 * MCPサーバプロセスを新規に起動し、環境変数を返す
 * @param serverPath サーバ実行ファイルのパス
 * @param workspaceRoot ワークスペースルートパス
 * @returns サーバ用環境変数
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
 * MCP設定作成ハンドラ
 * ワークスペースが存在する場合のみMCP設定ファイルを作成する
 * @param workspaceFolders ワークスペースフォルダ一覧
 * @param workspaceRoot ワークスペースルートパス
 * @param serverPath サーバ実行ファイルのパス
 */
function handleMcpConfigCreation(workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined, workspaceRoot: string, serverPath: string): void {
    if (workspaceFolders && workspaceFolders.length > 0) {
        createMcpConfig(workspaceRoot, serverPath);
    } else {
        vscode.window.showWarningMessage('No workspace folder found. MCP configuration not created.');
    }
}

/**
 * ローカルサーバ起動処理
 * MCPサーバプロセスを起動し、クライアント接続・設定作成を行う
 * @param context VSCode拡張機能のコンテキスト
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
