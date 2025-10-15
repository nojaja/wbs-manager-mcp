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
import { MCPInitializeClient } from './mcp/initializeClient';
import { MCPTaskClient } from './mcp/taskClient';
import { MCPArtifactClient } from './mcp/artifactClient';




// 拡張機能用の出力チャネル（ログ表示用）
let outputChannel: vscode.OutputChannel;

// MCPクライアントのインスタンス
let initializeClient: MCPInitializeClient;
let taskClient: MCPTaskClient;
let artifactClient: MCPArtifactClient;
let serverService: ServerService;
let wbsService: WBSService;

/**
 * VSCode拡張機能のアクティベート処理
 * 拡張機能の初期化、MCPクライアント・サーバ起動、ツリービュー・コマンド登録を行う
 * 実装理由(なぜ必要か): 拡張機能が有効化された際に動作に必要なインスタンスや UI を初期化するため
 * @param context VSCode拡張機能のコンテキスト
 */
export async function activate(context: vscode.ExtensionContext) {
    // 出力チャネルの初期化（ログ表示用）
    outputChannel = vscode.window.createOutputChannel('MCP-WBS');
    outputChannel.appendLine('MCP WBS Extension activated');

    // MCPクライアントの初期化（API通信のため）
    initializeClient = new MCPInitializeClient(outputChannel);
    taskClient = new MCPTaskClient(outputChannel);
    artifactClient = new MCPArtifactClient(outputChannel);
    serverService = new ServerService(outputChannel);
    // Create service first so providers can depend on it without circular wiring
    wbsService = new WBSService({
        taskClient,
        artifactClient
    });
    const { WBSTreeProvider } = await import('./views/wbsTree');
    const { ArtifactTreeProvider } = await import('./views/artifactTree');
    const wbsProvider = new WBSTreeProvider(wbsService as any);
    const artifactProvider = new ArtifactTreeProvider(wbsService as any);
    // Ensure providers are set for refresh hooks
    wbsService.setProviders(wbsProvider as any, artifactProvider as any);

    // サーバ・クライアント自動起動
    // 処理概要: 開発用ローカルサーバを自動で起動し、クライアント接続を確立する
    // 実装理由: ユーザが手動でサーバを起動する手間を省き、即時に UI が動作する状態にするため
    await serverService.startLocalServer(context, [initializeClient, taskClient, artifactClient]);

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
        // 処理概要: 明示的にローカルサーバを再起動/起動するコマンド
        // 実装理由: サーバ停止後の再接続や設定反映のためにユーザが手動で起動できるようにする
    await serverService.startLocalServer(context, [initializeClient, taskClient, artifactClient]);
        wbsService.refreshWbsTree();
        wbsService.refreshArtifactTree();
    });

    // コマンド登録: ツリーリフレッシュ
    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {
        // 処理名: ツリーリフレッシュコマンド
        // 処理概要: サーバプロセスを確認し、必要なら再起動してからツリーを再読み込みする
        // 実装理由: サーバ停止後でも UI の復旧を自動化するため
        if (!serverService.getServerProcess()) {
            await serverService.startLocalServer(context, [initializeClient, taskClient, artifactClient]);
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
        // 処理名: 成果物編集コマンド
        // 処理概要: 明示的に指定があればそれを、無ければツリーの選択を編集対象として詳細パネルを開く
        // 実装理由: ユーザがコンテキストメニューやショートカットから編集できるようにするため
        const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
            ? artifactTreeView.selection[0]
            : undefined);
        if (target) {
            ArtifactDetailPanel.createOrShow(context.extensionUri, target.artifact.id, wbsService);
        }
    });
    const deleteArtifactCommand = vscode.commands.registerCommand('artifactTree.deleteArtifact', async (item?: ArtifactTreeItem) => {
        // 処理名: 成果物削除コマンド
        // 処理概要: 指定または選択中の成果物を削除するためのサービス呼び出しを行う
        // 実装理由: ユーザが UI から成果物を削除できるようにするため
        outputChannel.appendLine(`artifactTree.deleteArtifact: ${item ? item.label : 'no item'}`);
        const target = item ?? (artifactTreeView.selection && artifactTreeView.selection.length > 0
            ? artifactTreeView.selection[0]
            : undefined);
        await wbsService.deleteArtifact(target);
    });

    // コマンド登録: タスク詳細パネルを開く
    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item) => {
        // 処理名: タスク詳細パネル表示コマンド
        // 処理概要: タスクノードのクリックで詳細パネルを開く
        // 実装理由: ユーザがタスクの詳細を簡単に編集・参照できるようにするため
        outputChannel.appendLine(`wbsTree.openTask: ${item ? item.label : 'no item'}`);
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
    initializeClient?.stop();
    taskClient?.stop();
    artifactClient?.stop();
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
// startLocalServer の実装は ServerService に移管されました
