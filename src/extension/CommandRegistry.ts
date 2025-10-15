import * as vscode from 'vscode';

/**
 * CommandRegistry は拡張機能内のコマンド登録を一元管理します。
 * 単体テストしやすくするため DI で各種依存を受け取ります。
 */
export class CommandRegistry {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private serverService: any;
  private initializeClient: any;
  private taskClient: any;
  private artifactClient: any;
  private wbsProvider: any;
  private artifactProvider: any;
  private treeView: any;
  private artifactTreeView: any;
  private showTaskDetail: (taskId: string) => Promise<void>;

  /**
   * CommandRegistry を構築します。
   * @param opts 設定オブジェクト
   * @param opts.context VS Code の ExtensionContext
   * @param opts.outputChannel 出力用チャネル
   * @param opts.serverService ServerService のインスタンス
   * @param opts.initializeClient 初期化クライアント
   * @param opts.taskClient タスククライアント
   * @param opts.artifactClient アーティファクトクライアント
   * @param opts.wbsProvider WBS Tree Provider
   * @param opts.artifactProvider Artifact Tree Provider
   * @param opts.treeView WBS 用 TreeView
   * @param opts.artifactTreeView Artifact 用 TreeView
   * @param opts.showTaskDetail タスク詳細表示用コールバック
   */
  constructor(opts: {
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    serverService: any,
    initializeClient: any,
    taskClient: any,
    artifactClient: any,
    wbsProvider: any,
    artifactProvider: any,
    treeView: any,
    artifactTreeView: any,
    showTaskDetail?: (taskId: string) => Promise<void>
  }) {
    this.context = opts.context;
    this.outputChannel = opts.outputChannel;
    this.serverService = opts.serverService;
    this.initializeClient = opts.initializeClient;
    this.taskClient = opts.taskClient;
    this.artifactClient = opts.artifactClient;
    this.wbsProvider = opts.wbsProvider;
    this.artifactProvider = opts.artifactProvider;
    this.treeView = opts.treeView;
    this.artifactTreeView = opts.artifactTreeView;
    this.showTaskDetail = opts.showTaskDetail ?? (async () => {});
  }

  /**
   * すべてのコマンドを登録して Disposable 配列を返します。
   * @returns 登録された Disposable の配列
   */
  async registerAll(): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = [];

    // start server
    const { startServerCommandHandler } = await import('./commands/startServer');
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
      await startServerCommandHandler(this.serverService, this.context, [this.initializeClient, this.taskClient, this.artifactClient]);
      this.wbsProvider.refresh();
      this.artifactProvider.refresh();
    });
    disposables.push(startServerCommand);

    // refresh tree
    const { refreshTreeCommandHandler } = await import('./commands/refreshTree');
    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {
      await refreshTreeCommandHandler(this.serverService, this.wbsProvider, this.context, [this.initializeClient, this.taskClient, this.artifactClient]);
    });
    disposables.push(refreshTreeCommand);

    // artifact tree refresh
    const refreshArtifactTreeCommand = vscode.commands.registerCommand('artifactTree.refresh', async () => {
      this.artifactProvider.refresh();
    });
    disposables.push(refreshArtifactTreeCommand);

    // create artifact
    const { createArtifactCommandHandler } = await import('./commands/createArtifact');
    const createArtifactCommand = vscode.commands.registerCommand('artifactTree.createArtifact', async () => {
      await createArtifactCommandHandler(this.artifactProvider);
    });
    disposables.push(createArtifactCommand);

    // edit artifact
    const { editArtifactCommandHandler } = await import('./commands/editArtifact');
    const editArtifactCommand = vscode.commands.registerCommand('artifactTree.editArtifact', async (item?: any) => {
      await editArtifactCommandHandler(this.artifactTreeView, this.artifactProvider, this.context, this.artifactClient, item);
    });
    disposables.push(editArtifactCommand);

    // delete artifact
    const { deleteArtifactCommandHandler } = await import('./commands/deleteArtifact');
    const deleteArtifactCommand = vscode.commands.registerCommand('artifactTree.deleteArtifact', async (item?: any) => {
      this.outputChannel.appendLine(`artifactTree.deleteArtifact: ${item ? item.label : 'no item'}`);
      const target = item ?? (this.artifactTreeView.selection && this.artifactTreeView.selection.length > 0
        ? this.artifactTreeView.selection[0]
        : undefined);
      await deleteArtifactCommandHandler(this.artifactProvider, target);
    });
    disposables.push(deleteArtifactCommand);

    // open task
    const { openTaskCommandHandler } = await import('./commands/openTask');
    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item: any) => {
      this.outputChannel.appendLine(`wbsTree.openTask: ${item ? item.label : 'no item'}`);
      openTaskCommandHandler(this.context, item, this.taskClient, this.artifactClient);
    });
    disposables.push(openTaskCommand);

    // create task
    const { createTaskCommandHandler } = await import('./commands/createTask');
    const createTaskCommand = vscode.commands.registerCommand('wbsTree.createTask', async () => {
      await createTaskCommandHandler(this.wbsProvider, this.treeView, this.showTaskDetail);
    });
    disposables.push(createTaskCommand);

    // add child task
    const { addChildTaskCommandHandler } = await import('./commands/addChildTask');
    const addChildTaskCommand = vscode.commands.registerCommand('wbsTree.addChildTask', async (item?: any) => {
      await addChildTaskCommandHandler(this.wbsProvider, this.treeView, this.showTaskDetail);
    });
    disposables.push(addChildTaskCommand);

    // delete task
    const { deleteTaskCommandHandler } = await import('./commands/deleteTask');
    const deleteTaskCommand = vscode.commands.registerCommand('wbsTree.deleteTask', async (item?: any) => {
      await deleteTaskCommandHandler(this.wbsProvider, this.treeView, item);
    });
    disposables.push(deleteTaskCommand);

    return disposables;
  }
}
