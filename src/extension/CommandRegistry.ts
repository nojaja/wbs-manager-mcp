import * as vscode from 'vscode';

import {StartServerHandler} from './commands/startServer';
import {RefreshWbsTreeHandler} from './commands/refreshWbsTree';
import {RefreshArtifactTreeHandler} from './commands/refreshArtifactTree';
import {CreateArtifactHandler} from './commands/createArtifact';
import {EditArtifactHandler} from './commands/editArtifact';
import {DeleteArtifactHandler} from './commands/deleteArtifact';
import {OpenTaskHandler} from './commands/openTask';
import {CreateTaskHandler} from './commands/createTask';
import {AddChildTaskHandler} from './commands/addChildTask';
import {DeleteTaskHandler} from './commands/deleteTask';

    
//Logger
import { Logger } from './Logger';
/**
 * CommandRegistry は拡張機能内のコマンド登録を一元管理します。
 * 単体テストしやすくするため DI で各種依存を受け取ります。
 */
export class CommandRegistry {
  private context: vscode.ExtensionContext;
  private treeView: any;
  private artifactTreeView: any;
  /** 出力チャネル */
  protected readonly outputChannel: Logger = Logger.getInstance();


  /**
   * CommandRegistry を構築します。
  * @param opts 設定オブジェクト
  * @param opts.context VS Code の ExtensionContext
  * @param opts.treeView WBS 用 TreeView
  * @param opts.artifactTreeView Artifact 用 TreeView
  * @param opts.serverService optional ServerService instance
  * @param opts.initializeClient optional initialize client
  * @param opts.taskClient optional MCP task client
  * @param opts.artifactClient optional MCP artifact client
  * @param opts.wbsProvider optional WBS provider
  * @param opts.artifactProvider optional Artifact provider
  * @param opts.showTaskDetail optional show detail callback
  * @param opts.outputChannel optional output channel
   */
  constructor(opts: {
    context: vscode.ExtensionContext,
    treeView: any,
    artifactTreeView: any
  }) {
    this.context = opts.context;
    this.treeView = opts.treeView;
    this.artifactTreeView = opts.artifactTreeView;
  }

  /**
   * すべてのコマンドを登録して Disposable 配列を返します。
   * @returns 登録された Disposable の配列
   */
  async registerAll(): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = [];

    // start server
    const startServerHandler = new StartServerHandler();
    const startServerCommand = vscode.commands.registerCommand('mcpWbs.start', async () => {
      await startServerHandler.handle(this.context);
    });
    disposables.push(startServerCommand);

    // refresh wbs tree
    const refreshTreeHandler = new RefreshWbsTreeHandler();
    const refreshTreeCommand = vscode.commands.registerCommand('wbsTree.refresh', async () => {
      await refreshTreeHandler.handle(this.context);
    });
    disposables.push(refreshTreeCommand);

    // refresh artifact tree
    const refreshArtifactTreeHandler = new RefreshArtifactTreeHandler();
    const refreshArtifactTreeCommand = vscode.commands.registerCommand('artifactTree.refresh', async () => {
      await refreshArtifactTreeHandler.handle(this.context);
    });
    disposables.push(refreshArtifactTreeCommand);

    // create artifact
    const createArtifactHandler = new CreateArtifactHandler();
    const createArtifactCommand = vscode.commands.registerCommand('artifactTree.createArtifact', async () => {
      await createArtifactHandler.handle();
    });
    disposables.push(createArtifactCommand);

    // edit artifact
    const editArtifactHandler = new EditArtifactHandler();
    const editArtifactCommand = vscode.commands.registerCommand('artifactTree.editArtifact', async (item?: any) => {
      await editArtifactHandler.handle(this.context, this.artifactTreeView, item);
    });
    disposables.push(editArtifactCommand);

    // delete artifact
    const deleteArtifactHandler = new DeleteArtifactHandler();
    const deleteArtifactCommand = vscode.commands.registerCommand('artifactTree.deleteArtifact', async (item?: any) => {
      await deleteArtifactHandler.handle(this.artifactTreeView, item);
    });
    disposables.push(deleteArtifactCommand);

    // open task
    const openTaskHandler = new OpenTaskHandler();
    const openTaskCommand = vscode.commands.registerCommand('wbsTree.openTask', (item: any) => {
      openTaskHandler.handle(this.context, item);
    });
    disposables.push(openTaskCommand);

    // create task
    const createTaskCommandHandler = new CreateTaskHandler();
    const createTaskCommand = vscode.commands.registerCommand('wbsTree.createTask', async () => {
      await createTaskCommandHandler.handle(this.context, this.treeView);
    });
    disposables.push(createTaskCommand);

    // add child task
    const addChildTaskCommandHandler = new AddChildTaskHandler();
    const addChildTaskCommand = vscode.commands.registerCommand('wbsTree.addChildTask', async (item?: any) => {
      await addChildTaskCommandHandler.handle(this.context, item, this.treeView);
    });
    disposables.push(addChildTaskCommand);

    // delete task
    const deleteTaskCommandHandler = new DeleteTaskHandler();
    const deleteTaskCommand = vscode.commands.registerCommand('wbsTree.deleteTask', async (item?: any) => {
      await deleteTaskCommandHandler.handle(this.treeView, item);
    });
    disposables.push(deleteTaskCommand);

    return disposables;
  }
}
