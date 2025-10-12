// VSCode API本体のインポート
import * as vscode from 'vscode';
// 子プロセス操作用モジュール
// パス操作ユーティリティ
import * as path from 'path';
// WBSツリープロバイダ（ツリー表示用）
import { WBSTreeDragAndDropController } from './views/wbsTree';
import { ArtifactTreeItem } from './views/artifactTree';
// サービス層
import { ServerService } from './server/ServerService';
import { WBSService } from './services/WBSService';
// タスク詳細パネル（WebView表示用）
import { TaskDetailPanel } from './panels/taskDetailPanel';
// 成果物詳細パネル（WebView表示用）
import { ArtifactDetailPanel } from './panels/artifactDetailPanel';
// MCPクライアント（API通信・管理用）
import { MCPClient } from './mcpClient';




// 拡張機能用の出力チャネル（ログ表示用）
let outputChannel: vscode.OutputChannel;

// MCPクライアントのインスタンス
let mcpClient: MCPClient;
let serverService: ServerService;
let wbsService: WBSService;

/**
 * VSCode拡張機能のアクティベート処理
 * 拡張機能の初期化、MCPクライアント・サーバ起動、ツリービュー・コマンド登録を行う
 * @param context VSCode拡張機能のコンテキスト
 */
export async function activate(context: vscode.ExtensionContext) {
    // 出力チャネルの初期化（ログ表示用）
    outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    outputChannel.appendLine('MCP WBS Extension activated');

    // MCPクライアントの初期化（API通信のため）
    mcpClient = new MCPClient(outputChannel);
    serverService = new ServerService(outputChannel);
    wbsService = new WBSService(mcpClient);
    // Create providers and inject them into the service
    const wbsProvider = new (await import('./views/wbsTree')).WBSTreeProvider(wbsService as any);
    const artifactProvider = new (await import('./views/artifactTree')).ArtifactTreeProvider(wbsService as any);
    wbsService.setProviders(wbsProvider, artifactProvider);
    // Inject WBSService into MCPClient so MCPClient can delegate WBS business logic
    mcpClient.setWbsService(wbsService);

    // サーバ・クライアント自動起動
    await startLocalServer(context);

    // ツリービュー初期化
    const dragAndDropController = new WBSTreeDragAndDropController(wbsProvider);
    const treeView = vscode.window.createTreeView('wbsTree', {
        treeDataProvider: wbsProvider,
        showCollapseAll: true,
        dragAndDropController
    });
    const artifactTreeView = vscode.window.createTreeView('artifactTree', {
        treeDataProvider: artifactProvider,
        showCollapseAll: false
    });

    // コマンド登録: サーバ起動
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
        await startLocalServer(context);
        wbsService.refreshWbsTree();
        wbsService.refreshArtifactTree();
    });

    // コマンド登録: ツリーリフレッシュ
    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {

        // MCPClientが未接続なら再接続を試みる
        // 理由: サーバ再起動や初回起動時にクライアントが未初期化の場合でもUIリフレッシュを正常化するため
        if (!mcpClient) {
            mcpClient = new MCPClient(outputChannel);
            await startLocalServer(context);
        }
        wbsService.refreshWbsTree();
    });

    const refreshArtifactTreeCommand = vscode.commands.registerCommand('artifactTree.refresh', async () => {
        wbsService.refreshArtifactTree();
    });

    const createArtifactCommand = vscode.commands.registerCommand('artifactTree.createArtifact', async () => {
        await wbsService.createArtifact();
    });

    const editArtifactCommand = vscode.commands.registerCommand('artifactTree.editArtifact', async (item?: ArtifactTreeItem) => {
        const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
            ? artifactTreeView.selection[0]
            : undefined);
        // 処理概要: 明示指定なければ現在の選択を編集対象とする
        // 実装理由: コンテキストメニュー/ツールバーからの実行どちらにも対応するため
            if (target) {
            ArtifactDetailPanel.createOrShow(context.extensionUri, target.artifact.id, wbsService);
        }
    });
    const deleteArtifactCommand = vscode.commands.registerCommand('artifactTree.deleteArtifact', async (item?: ArtifactTreeItem) => {
        outputChannel.appendLine(`artifactTree.deleteArtifact: ${item ? item.label : 'no item'}`);
        const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
            ? artifactTreeView.selection[0]
            : undefined);
        // 処理概要: 明示指定がなければ選択中の成果物を削除
        // 実装理由: 操作性を統一し、誤削除を避けるため選択が無い場合は何もしない
        await wbsService.deleteArtifact(target);
    });

    // コマンド登録: タスク詳細パネルを開く
    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item) => {
        outputChannel.appendLine(`wbsTree.openTask: ${item ? item.label : 'no item'}`);
        // タスクノードのみ詳細パネルを開く
        // 理由: プロジェクトノードや他ノードで誤動作しないように分岐
        if (item) {
            TaskDetailPanel.createOrShow(context.extensionUri, item.itemId, wbsService);
        }
    });

    const createTaskCommand = vscode.commands.registerCommand('wbsTree.createTask', async () => {
        const selected = treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined;
        const result = await wbsService.createTask(selected as any);
        if (result?.taskId) {
            TaskDetailPanel.createOrShow(context.extensionUri, result.taskId, wbsService);
        }
    });

    const addChildTaskCommand = vscode.commands.registerCommand('wbsTree.addChildTask', async (item) => {
        const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
        const result = await wbsService.addChildTask(target as any);
        // 処理概要: 作成成功時のみ詳細パネルを開く
        // 実装理由: 失敗時に空のパネルを開かないためのガード
        if (result?.taskId) {
            TaskDetailPanel.createOrShow(context.extensionUri, result.taskId, wbsService);
        }
    });

    const deleteTaskCommand = vscode.commands.registerCommand('wbsTree.deleteTask', async (item) => {
        const target = item ?? (treeView.selection && treeView.selection.length > 0 ? treeView.selection[0] : undefined);
        await wbsService.deleteTask(target as any);
    });



    // サブスクリプションに各コマンド・ビュー・チャネルを登録（拡張機能のライフサイクル管理のため）
    context.subscriptions.push(
        startServerCommand,
        refreshTreeCommand,
        openTaskCommand,
        createTaskCommand,
        addChildTaskCommand,
        deleteTaskCommand,
        refreshArtifactTreeCommand,
        createArtifactCommand,
        editArtifactCommand,
        deleteArtifactCommand,
        dragAndDropController,
        treeView,
        artifactTreeView,
        outputChannel
    );
}


/**
 * VSCode拡張機能のデアクティベート処理
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
    if (serverService) {
        serverService.stopServerProcess();
    }
}


/**
 * ローカルサーバ起動処理
 * サーバ起動・クライアント接続・設定生成をServerService経由で行う
 * なぜ必要か: サーバ・クライアント・設定の一括起動/初期化を自動化し、ユーザー操作を簡略化するため
 * @param context VSCode拡張機能のコンテキスト
 */
async function startLocalServer(context: vscode.ExtensionContext) {
    // 既にサーバが起動していれば何もしない
    // 理由: 多重起動による競合・リソース浪費を防ぐため
    if (serverService.getServerProcess()) {
        vscode.window.showInformationMessage('MCP server is already running');
        return;
    }

    // サーバ実行ファイルのパスを決定
    const serverPath = path.join(context.extensionPath, 'out', 'mcpServer', 'index.js');
    // ワークスペースルートを決定
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : context.extensionPath;

    // サーバファイル存在チェック
    // 理由: ファイルがなければ以降の処理をスキップし、エラー通知のみ行う
    if (!serverService.validateServerPath(serverPath)) {
        return;
    }

    try {
        // サーバプロセス起動
        // ServerService に起動と MCPClient の接続を委譲
        await serverService.startAndAttachClient(mcpClient, serverPath, workspaceRoot);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${errorMessage}`);
    }
}
