import * as vscode from 'vscode';
import * as path from 'path';
import { WBSTreeProvider, WBSTreeDragAndDropController } from './views/explorer/wbsTree';
import { ArtifactTreeProvider } from './views/explorer/artifactTree';
import { ServerService } from './server/ServerService';
import { MCPInitializeClient } from './repositories/mcp/initializeClient';
import { MCPTaskClient } from './repositories/mcp/taskClient';
import { MCPArtifactClient } from './repositories/mcp/artifactClient';
import { MCPGanttClient } from './repositories/mcp/ganttClient';

//Logger
import { Logger } from './Logger';
/**
 * Extension の起動・終了と依存注入を責務とするコントローラクラス
 * - サーバ/クライアントの初期化
 * - TreeView/コマンドの登録
 * - context.subscriptions の管理
 */
export class ExtensionController {
  private context: vscode.ExtensionContext;
  private initializeClient: MCPInitializeClient;
  private taskClient: MCPTaskClient;
  private artifactClient: MCPArtifactClient;
  private ganttClient: MCPGanttClient;
  private serverService: ServerService;
  /** 出力チャネル */
  protected readonly outputChannel: Logger = Logger.getInstance();
  /**
   * コントローラを構築します。依存はオプションで注入可能です。
   * @param context VS Code 拡張機能のコンテキスト
   * @param deps 任意の依存注入オブジェクト（テストで差し替え可能）
   * @param deps.serverService ServerService の差し替え
   */
  constructor(context: vscode.ExtensionContext, deps?: {
    serverService?: ServerService,
  }) {
    this.context = context;
    this.outputChannel.log('ExtensionController: initialized');

    this.initializeClient = (MCPInitializeClient as any).getInstance();
    this.taskClient = (MCPTaskClient as any).getInstance();
    this.artifactClient = (MCPArtifactClient as any).getInstance();
  this.ganttClient = (MCPGanttClient as any).getInstance();
    this.serverService = ServerService.getInstance();
  }

  /**
   * 拡張機能を起動します。サーバ起動、TreeProvider/TreeView 登録、コマンド登録を行います
   * @returns void
   */
  async start(): Promise<void> {
    const wbsProvider = WBSTreeProvider.getInstance();
    const artifactProvider = ArtifactTreeProvider.getInstance();

    // start server and clients
  await this.serverService.startLocalServer(this.context, [this.initializeClient, this.taskClient, this.artifactClient, this.ganttClient]);

    // Register MCP server definition provider so that MCP clients (Copilot, etc.)
    // can discover the local MCP server without relying on a workspace mcp.json file.
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : this.context.extensionPath;
      const serverPath = path.join(this.context.extensionPath, 'out', 'mcpServer', 'index.js');

      const provider: vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> = {
        /**
         * 処理名: MCP サーバ定義提供
         * 処理概要: MCP クライアントが利用するためのローカル Stdio サーバ定義を返す
         * 実装理由: ワークスペースに mcp.json がなくてもローカルサーバを発見できるようにするため
         * @param token Cancellation token (未使用)
         * @returns 配列で MCP サーバ定義を返す
         */
        provideMcpServerDefinitions(token) {
          return [new vscode.McpStdioServerDefinition(
            'wbs-manager-mcp',
            process.execPath,
            [serverPath],
            { WBS_MCP_DATA_DIR: workspaceRoot }
          )];
        },
        /**
         * 処理名: MCP サーバ定義解決
         * 処理概要: 提供されたサーバ定義を解決/検証して返すフック（ここではパススルー）
         * 実装理由: 将来的に定義の検証や変換が必要になった場合に拡張しやすくするため
         * @param server サーバ定義
         * @param token Cancellation token (未使用)
         * @returns 解決済みのサーバ定義
         */
        resolveMcpServerDefinition(server, token) {
          return server;
        }
      };
  const disposable = vscode.lm.registerMcpServerDefinitionProvider('wbs-manager-mcp', provider as any);
      this.context.subscriptions.push(disposable);
      this.outputChannel.log('Registered MCP server definition provider');
    } catch (err) {
      this.outputChannel.log(`Failed to register MCP server provider: ${String(err)}`);
    }

    // create tree views
    const dragAndDropController = WBSTreeDragAndDropController.getInstance();
    const treeView = vscode.window.createTreeView('wbsTree', {
      treeDataProvider: wbsProvider,
      showCollapseAll: true,
      dragAndDropController
    });
    const artifactTreeView = vscode.window.createTreeView('artifactTree', {
      treeDataProvider: artifactProvider,
      showCollapseAll: false
    });

    // Register commands via CommandRegistry to keep start() small
    const { CommandRegistry } = await import('./CommandRegistry');

    const registry = new CommandRegistry({
      context: this.context,
      treeView,
      artifactTreeView
    });
    const commandDisposables = await registry.registerAll();

    // push to subscriptions for lifecycle management
    this.context.subscriptions.push(
      ...commandDisposables,
      dragAndDropController,
      treeView,
      artifactTreeView
    );
    // subscriptions pushed to context for lifecycle management
  }

  /**
   * 拡張機能を停止します。クライアントとサーバの停止を行います
   */
  stop(): void {
    // stop clients
    try {
      this.initializeClient?.stop();
      this.taskClient?.stop();
      this.artifactClient?.stop();
  this.ganttClient?.stop();
    } catch (err) {
      this.outputChannel.log(`Error stopping clients: ${String(err)}`);
    }

    // stop server
    if (this.serverService) {
      try {
        this.serverService.stopServerProcess();
      } catch (err) {
        this.outputChannel.log(`Error stopping server: ${String(err)}`);
      }
    }
  }
}
