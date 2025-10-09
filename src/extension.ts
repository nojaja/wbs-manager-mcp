
// VSCode API本体のインポート
import * as vscode from 'vscode';
// 子プロセス操作用モジュール
import * as child_process from 'child_process';
// パス操作ユーティリティ
import * as path from 'path';
// ファイルシステム操作ユーティリティ
import * as fs from 'fs';
// WBSツリープロバイダ（ツリー表示用）
import { WBSTreeProvider, WBSTreeDragAndDropController } from './views/wbsTree';
// タスク詳細パネル（WebView表示用）
import { TaskDetailPanel } from './panels/taskDetailPanel';
// MCPクライアント（API通信・管理用）
import { MCPClient } from './mcpClient';


// サーバプロセスの参照（起動・停止管理用）
let serverProcess: child_process.ChildProcess | null = null;
// 拡張機能用の出力チャネル（ログ表示用）
let outputChannel: vscode.OutputChannel;
// WBSツリープロバイダのインスタンス
let treeProvider: WBSTreeProvider;
// MCPクライアントのインスタンス
let mcpClient: MCPClient;


/**
 * アクティベート処理
 * 拡張機能の初期化、MCPクライアント・サーバ起動、ツリービュー・コマンド登録を行う
 * なぜ必要か: 拡張機能のエントリポイントとして、初期化・UI・コマンド・サーバ連携を一括でセットアップするため
 * @param context VSCode拡張機能のコンテキスト
 */
export async function activate(context: vscode.ExtensionContext) {
    // 出力チャネルの初期化（ログ表示用）
    outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    outputChannel.appendLine('MCP WBS Extension activated');

    // MCPクライアントの初期化（API通信のため）
    mcpClient = new MCPClient(outputChannel);

    // サーバ・クライアント自動起動（ローカルサーバと接続）
    await startLocalServer(context);

    // MCPクライアントを使ってWBSツリープロバイダを初期化
    treeProvider = new WBSTreeProvider(mcpClient);
    // ツリービューを作成し、エクスプローラ部に表示
    const dragAndDropController = new WBSTreeDragAndDropController(treeProvider);
    const treeView = vscode.window.createTreeView('wbsTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
        dragAndDropController
    });

    // コマンド登録: サーバ起動
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
        await startLocalServer(context);
        treeProvider.refresh();
    });

    // コマンド登録: ツリーリフレッシュ

    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {
        // MCPClientが未接続なら再接続を試みる
        // 理由: サーバ再起動や初回起動時にクライアントが未初期化の場合でもUIリフレッシュを正常化するため
        if (!mcpClient) {
            mcpClient = new MCPClient(outputChannel);
            await startLocalServer(context);
        }
        treeProvider.refresh();
    });

    // コマンド登録: タスク詳細パネルを開く

    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item) => {
        // タスクノードのみ詳細パネルを開く
        // 理由: プロジェクトノードや他ノードで誤動作しないように分岐
        if (item && item.contextValue === 'task') {
            TaskDetailPanel.createOrShow(context.extensionUri, item.itemId, mcpClient);
        }
    });

    const createTaskCommand = vscode.commands.registerCommand('wbsTree.createTask', async () => {
        const selected = treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined;
        const result = await treeProvider.createTask(selected as any);
        if (result?.taskId) {
            TaskDetailPanel.createOrShow(context.extensionUri, result.taskId, mcpClient);
        }
    });

    const addChildTaskCommand = vscode.commands.registerCommand('wbsTree.addChildTask', async (item) => {
        const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
        const result = await treeProvider.createTask(target as any);
        if (result?.taskId) {
            TaskDetailPanel.createOrShow(context.extensionUri, result.taskId, mcpClient);
        }
    });

    const deleteTaskCommand = vscode.commands.registerCommand('wbsTree.deleteTask', async (item) => {
        const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
        await treeProvider.deleteTask(target as any);
    });

    const deleteProjectCommand = vscode.commands.registerCommand('wbsTree.deleteProject', async (item) => {
        const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
        await treeProvider.deleteProject(target as any);
    });

    // サブスクリプションに各コマンド・ビュー・チャネルを登録（拡張機能のライフサイクル管理のため）
    context.subscriptions.push(
        startServerCommand,
        refreshTreeCommand,
        openTaskCommand,
        createTaskCommand,
        addChildTaskCommand,
        deleteTaskCommand,
        deleteProjectCommand,
        dragAndDropController,
        treeView,
        outputChannel
    );
}


/**
 * デアクティベート処理
 * 拡張機能の終了時にMCPクライアント・サーバプロセスを停止する
 * なぜ必要か: プロセス・リソースリーク防止、正常な終了処理のため
 */
export function deactivate() {
    // MCPクライアントの停止
    // 理由: プロセス・リソースリーク防止のため
    if (mcpClient) {
        mcpClient.stop();
    }
    // サーバプロセスの停止
    // 理由: サーバプロセスが残存しないように明示的にkill
    if (serverProcess) {
        outputChannel.appendLine('Stopping MCP server...');
        serverProcess.kill();
        (serverProcess as child_process.ChildProcess | null) = null;
    }
}


/**
 * MCP設定ファイル作成処理
 * .vscode/mcp.jsonを生成し、サーバ起動設定を保存する
 * なぜ必要か: サーバ起動・クライアント接続の自動化、再起動時の設定復元のため
 * @param workspaceRoot ワークスペースルートパス
 * @param serverPath サーバ実行ファイルのパス
 */
function createMcpConfig(workspaceRoot: string, serverPath: string): void {
    // .vscodeディレクトリ・設定ファイルパスを決定
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    // .vscodeディレクトリがなければ作成
    // 理由: 初回起動時や手動削除時でも自動で安全にディレクトリ生成するため
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }

    // MCPサーバ設定オブジェクトを作成
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

    // 設定ファイルを書き出し
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    outputChannel.appendLine(`Created MCP configuration at: ${mcpConfigPath}`);
    vscode.window.showInformationMessage('MCP server started successfully');
}


/**
 * サーバプロセスイベントハンドラ設定処理
 * サーバプロセスの標準出力・エラー・終了イベントを監視し、ログ出力やエラー通知を行う
 * なぜ必要か: サーバの状態監視・障害検知・ユーザー通知のため
 * @param serverProcess サーバプロセス
 */
function setupServerProcessHandlers(serverProcess: child_process.ChildProcess): void {
    // サーバの標準出力をログに出力
    serverProcess.stdout?.on('data', (data) => {
        // 理由: サーバからの出力を即時に拡張機能ログへ反映し、デバッグ・監視性を高めるため
        const output = data.toString().trim();
        outputChannel.appendLine(`[Server] ${output}`);
        outputChannel.show();
    });

    // サーバの標準エラー出力をログ・コンソールに出力
    serverProcess.stderr?.on('data', (data) => {
        // 理由: サーバ側のエラーを即時にユーザー・開発者へ通知するため
        const error = data.toString().trim();
        outputChannel.appendLine(`[Server Error] ${error}`);
        outputChannel.show();
        console.error('Server Error:', error);
    });

    // サーバプロセス終了時の処理
    serverProcess.on('exit', (code, signal) => {
        // 理由: サーバ異常終了時にユーザーへ通知し、リソースをクリーンアップするため
        outputChannel.appendLine(`Server process exited with code ${code}, signal: ${signal}`);
        if (code !== 0) {
            vscode.window.showErrorMessage(`MCP server exited unexpectedly with code ${code}`);
        }
        (serverProcess as child_process.ChildProcess | null) = null;
    });

    // サーバプロセスエラー時の処理
    serverProcess.on('error', (err) => {
        // 理由: サーバ起動失敗や予期せぬ例外を即時通知し、リソースリークを防ぐため
        outputChannel.appendLine(`Server process error: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${err.message}`);
        (serverProcess as child_process.ChildProcess | null) = null;
    });
}


/**
 * サーバパス検証処理
 * サーバ実行ファイルの存在を確認し、なければエラー通知する
 * なぜ必要か: サーバ起動失敗時の早期検知・ユーザー通知のため
 * @param serverPath サーバ実行ファイルのパス
 * @returns 存在すればtrue、なければfalse
 */
function validateServerPath(serverPath: string): boolean {
    // 理由: サーバファイルが存在しない場合は即時エラー通知し、無駄な起動処理を防ぐ
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
 * なぜ必要か: サーバプロセスとクライアント間の通信を確立するため
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
 * なぜ必要か: サーバの独立起動・環境変数制御・プロセス管理のため
 * @param serverPath サーバ実行ファイルのパス
 * @param workspaceRoot ワークスペースルートパス
 * @returns サーバ用環境変数
 */
function spawnServerProcess(serverPath: string, workspaceRoot: string) {
    outputChannel.appendLine(`Starting MCP server from: ${serverPath}`);

    // サーバ用環境変数を設定
    const serverEnv = {
        ...process.env,
        WBS_MCP_DATA_DIR: workspaceRoot
    };

    // サーバプロセスをspawnで起動
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
 * なぜ必要か: ワークスペース未選択時の誤動作防止・ユーザー通知のため
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
 * なぜ必要か: サーバ・クライアント・設定の一括起動/初期化を自動化し、ユーザー操作を簡略化するため
 * @param context VSCode拡張機能のコンテキスト
 */
async function startLocalServer(context: vscode.ExtensionContext) {
    // 既にサーバが起動していれば何もしない
    // 理由: 多重起動による競合・リソース浪費を防ぐため
    if (serverProcess) {
        vscode.window.showInformationMessage('MCP server is already running');
        return;
    }

    // サーバ実行ファイルのパスを決定
    const serverPath = path.join(context.extensionPath, 'out', 'server', 'index.js');
    // ワークスペースルートを決定
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : context.extensionPath;

    // サーバファイル存在チェック
    // 理由: ファイルがなければ以降の処理をスキップし、エラー通知のみ行う
    if (!validateServerPath(serverPath)) {
        return;
    }

    try {
        // サーバプロセス起動
        const serverEnv = spawnServerProcess(serverPath, workspaceRoot);
        // サーバプロセスのイベントハンドラ設定
        setupServerProcessHandlers(serverProcess!);
        // MCPクライアント起動・接続
        await startMcpClient(serverPath, serverEnv);
        // MCP設定ファイル作成
        handleMcpConfigCreation(workspaceFolders, workspaceRoot, serverPath);

    } catch (error) {
        // 理由: サーバ起動・接続・設定作成のいずれかで例外発生時に詳細ログ・通知し、リソースをクリーンアップするため
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${errorMessage}`);
        if (serverProcess) {
            (serverProcess as child_process.ChildProcess | null) = null;
        }
    }
}
