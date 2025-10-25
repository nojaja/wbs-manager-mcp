// src/server/ServerService.ts
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
//Logger
import { Logger } from '../Logger';

/**
 * クライアント登録情報の形
 */
type ClientRegistration = {
  handleResponseFromServer?: (resp: string) => void;
  handleResponse?: (resp: any) => void;
  onServerExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  setWriter?: (writer: (payload: string) => void) => void;
  start?: () => Promise<void>;
};

/**
 * サーバプロセス管理専用サービス
 */
export class ServerService {

  protected static instance?: ServerService;
  /** サーバプロセス */
  private serverProcess: child_process.ChildProcess | null = null;
  /** 登録されたクライアント群 */
  private readonly registeredClients = new Set<ClientRegistration>();
  /** 出力チャネル */
  protected readonly outputChannel: Logger = Logger.getInstance();

  /**
   * コンストラクタ
   */
  constructor() {
  }


  /**
   * ServerServiceクラスのシングルトンインスタンスを取得します
   * @returns {ServerService} ServerServiceインスタンス
   */
  public static getInstance(): ServerService {
    if (!ServerService.instance) {
      ServerService.instance = new ServerService();
    }
    return ServerService.instance;
  }


  /**
   * サーバ実行ファイルの存在を検証
   * @param serverPath サーバ実行ファイルのパス
   * @returns 存在すればtrue
   */
  validateServerPath(serverPath: string): boolean {
    // 処理名: サーバ実行ファイル存在チェック
    // 処理概要: 与えられたパスにサーバ実行ファイルが存在するかを検証する
    // 実装理由: 起動処理を行う前に必須ファイルの有無を確認し、無駄な処理や例外を防ぐため
    if (!fs.existsSync(serverPath)) {
      this.outputChannel.log(`Error: Server file not found at ${serverPath}`);
      return false;
    }
    return true;
  }

  /**
   * サーバプロセスをspawnで起動
   * MCPサーバプロセスを新規に起動し、環境変数を返す
   * なぜ必要か: サーバの独立起動・環境変数制御・プロセス管理のため
   * @param serverPath サーバ実行ファイルのパス
   * @param workspaceRoot ワークスペースルート
   * @returns サーバ用環境変数
   */
  spawnServerProcess(serverPath: string, workspaceRoot: string) {
    // 処理名: サーバプロセス起動
    // 処理概要: Node 実行パスで指定スクリプトを spawn し、環境変数と作業ディレクトリを設定して起動する
    // 実装理由: サーバを独立プロセスとして動作させ、拡張機能本体とプロセス分離を行うため
    this.outputChannel.log(`Starting MCP server from: ${serverPath}`);

    // サーバ用環境変数を設定
    const serverEnv = {
      ...process.env,
      WBS_MCP_DATA_DIR: '.'
    };
    // サーバプロセスをspawnで起動
    this.serverProcess = child_process.spawn(process.execPath, [serverPath], {
      cwd: workspaceRoot,
      env: serverEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return serverEnv;
  }

  /**
   * サーバプロセスの標準出力・エラー・終了イベントを監視
   * サーバプロセスの標準出力・エラー・終了イベントを監視し、ログ出力やエラー通知を行う
   * なぜ必要か: サーバの状態監視・障害検知・ユーザー通知のため
   * @param onExit 終了時コールバック
   */
  setupServerProcessHandlers(onExit?: (code: number | null, signal: NodeJS.Signals | null) => void) {
    if (!this.serverProcess) return;
    // 処理名: サーバプロセスハンドラ登録
    // 処理概要: stdout/stderr のコールバックとプロセス終了/エラー時のハンドラを登録する
    // 実装理由: サーバのログ収集と JSON レスポンスの受け渡し、エラー検知を行うため
    let buffer = '';
    const stdout = this.serverProcess.stdout;
    if (stdout && typeof (stdout as any).setEncoding === 'function') {
      (stdout as any).setEncoding('utf8');
    }
    stdout?.on('data', (data) => {
      buffer = this.processStdoutData(buffer, data);
    });
    this.serverProcess.stderr?.on('data', (data) => this.handleServerStderr(data));
    this.serverProcess.on('exit', (code, signal) => {
      this.handleServerExit(code, signal);
      if (onExit) onExit(code, signal);
    });
    // 起動エラー時の処理
    this.serverProcess.on('error', (err) => {
      this.outputChannel.log(`Server process error: ${err.message}`);
      this.serverProcess = null;
    });
  }

  /**
   * 単一の stdout 行を処理するヘルパー
   * @param line stdout から受け取った1行の文字列
   */
  private processServerLine(line: string) {
    // 処理名: stdout 行処理
    // 処理概要: 改行で区切られた1行をトリムし、ログ表示および登録クライアントへ通知する
    // 実装理由: サーバの JSON-RPC レスポンスやデバッグ出力を正しく受け渡すため
    const trimmed = line.trim();
    if (!trimmed) return;
    const clients = Array.from(this.registeredClients);
    if (clients.length === 0) {
      return;
    }

    // only notify clients with the raw trimmed line. JSON parsing is
    // the responsibility of the client (or an external dispatcher).
    this.notifyClientsOfRawLine(clients, trimmed);
  }

  /**
   * stdout データのバッファを処理し、完全な行を processServerLine に渡す。
   * @param buffer 前回処理時に残ったバッファ
   * @param chunk 今回受け取ったデータ
   * @returns 次回へ持ち越すバッファ
   */
  private processStdoutData(buffer: string, chunk: Buffer | string): string {
    const combined = buffer + chunk.toString();
    const lines = combined.split('\n');
    const nextBuffer = lines.pop() ?? '';
    for (const line of lines) {
      this.processServerLine(line);
    }
    return nextBuffer;
  }

  /**
   * stderr 出力をログへ転送する。
   * @param data stderr からの出力
   */
  private handleServerStderr(data: Buffer | string): void {
    const error = data.toString().trim();
    if (!error) {
      return;
    }
    this.outputChannel.log(`${error}`);
    //this.outputChannel.show();
  }

  /**
   * サーバ終了時の後処理を行う。
   * @param code 終了コード
   * @param signal シグナル
   */
  private handleServerExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.outputChannel.log(`Server process exited with code ${code}, signal: ${signal}`);
    if (code !== 0) {
      this.outputChannel.log(`MCP server exited unexpectedly with code ${code}`);
    }
    this.serverProcess = null;
    this.notifyClientsOfExit(code, signal);
  }

  /**
   * サーバ終了をクライアントへ通知する。
   * @param code 終了コード
   * @param signal シグナル
   */
  private notifyClientsOfExit(code: number | null, signal: NodeJS.Signals | null): void {
    for (const client of this.registeredClients) {
      if (typeof client.onServerExit !== 'function') {
        continue;
      }
      try {
        client.onServerExit(code, signal);
      } catch (error) {
        this.logClientError('Client exit handler error', error);
      }
    }
  }

  /**
   * 生の stdout 行をクライアントへ通知する。
   * @param clients 登録クライアント一覧
   * @param payload 行データ
   */
  private notifyClientsOfRawLine(clients: ClientRegistration[], payload: string): void {
    for (const client of clients) {
      if (typeof client.handleResponseFromServer !== 'function') {
        continue;
      }
      try {
        client.handleResponseFromServer(payload);
      } catch (error) {
        this.logClientError('Client raw handler error', error);
      }
    }
  }

  /**
   * クライアントで発生した例外をログへ送出する。
   * @param prefix ログメッセージのプレフィックス
   * @param error 捕捉したエラー
   */
  private logClientError(prefix: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.log(`${prefix}: ${message}`);
  }

  /**
   * サーバプロセスを停止
   */
  stopServerProcess() {
    // 処理名: サーバ停止処理
    // 処理概要: プロセスが存在する場合は kill して参照をクリアする
    // 実装理由: 拡張機能の終了や再起動時にサーバが残らないようにするため
    if (this.serverProcess) {
      this.outputChannel.log('Stopping MCP server...');
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  /**
   * MCPClient を登録し、必要ならば書き込み関数を渡す。
   *
   * ServerService はプロセスの stdin/stdout を管理し、stdout の parsed JSON をクライアントに渡す。
   *
   * @param client MCPClient 相当のオブジェクト
   */
  registerClient(client: ClientRegistration) {
    // 処理名: クライアント登録
    // 処理概要: MCPClient 相当のオブジェクトを保持し、必要ならば server.stdin へ書き込むラッパーを渡す
    // 実装理由: ServerService がプロセス入出力を集中管理し、クライアントへ安全なインターフェースを提供するため
    const registration = client as ClientRegistration;
    this.registeredClients.add(registration);
    if (typeof registration.setWriter === 'function') {
      registration.setWriter((s: string) => {
        this.serverProcess?.stdin?.write(s);
      });
    }
  }

  /**
   * 登録解除
   *
   * @param client 個別に解除するクライアント（未指定時は全クリア）
   */
  unregisterClient(client?: ClientRegistration) {
    if (client) {
      this.registeredClients.delete(client);
    } else {
      this.registeredClients.clear();
    }
  }

  /**
   * MCP設定ファイルを生成
   * .vscode/mcp.jsonを生成し、サーバ起動設定を保存する
   * なぜ必要か: サーバ起動・クライアント接続の自動化、再起動時の設定復元のため
   * @param workspaceRoot ワークスペースルート
   * @param serverPath サーバ実行ファイルのパス
   */
  createMcpConfig(workspaceRoot: string, serverPath: string): void {
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
          command: process.execPath,
          args: [serverPath],
          type: "stdio",
          env: { WBS_MCP_DATA_DIR: "${workspaceFolder}" }
        }
      }
    };

    // 設定ファイルを書き出し
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    this.outputChannel.log(`Created MCP configuration at: ${mcpConfigPath}`);
  }

  /**
   * サーバプロセスの参照を取得
   * @returns サーバプロセス
   */
  getServerProcess() {
    return this.serverProcess;
  }

  /**
   * extension.ts から移管されたローカルサーバ起動ユーティリティ
   * @param context VSCode のコンテキスト
   * @param clients 登録するクライアント配列
   */
  async startLocalServer(context: vscode.ExtensionContext, clients?: ClientRegistration[]) {
    // 既に起動済みなら何もしない
    if (this.getServerProcess()) {
      vscode.window.showInformationMessage('MCP server is already running');
      return;
    }

    const serverPath = path.join(context.extensionPath, 'out', 'mcpServer', 'index.js');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders[0].uri.fsPath
      : context.extensionPath;

    if (!this.validateServerPath(serverPath)) {
      return;
    }

    try {
      await this.startAndAttachClient(clients ?? [], serverPath, workspaceRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.log(`Failed to start server: ${message}`);
      vscode.window.showErrorMessage(`Failed to start MCP server: ${message}`);
    }
  }

  /**
   * サーバプロセスを開始して MCP クライアント群を接続するユーティリティ
   * @param clients 登録するクライアント（単体または配列）
   * @param serverPath サーバ実行ファイルパス
   * @param workspaceRoot ワークスペースルート
   */
  async startAndAttachClient(
    clients: ClientRegistration | ClientRegistration[],
    serverPath: string,
    workspaceRoot: string
  ): Promise<void> {
    try {
      if (!this.validateServerPath(serverPath)) {
        return;
      }

      this.spawnServerProcess(serverPath, workspaceRoot);
      this.setupServerProcessHandlers();

      const clientList = Array.isArray(clients) ? clients : [clients];

      for (const client of clientList) {
        this.registerClient(client);
      }

      for (const client of clientList) {
        if (typeof client.start === 'function') {
          await client.start();
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.log(`Failed to start and attach MCP client: ${message}`);
    }
  }

  // NOTE: createMcpConfig was removed in favor of using vscode.lm.registerMcpServerDefinitionProvider
  // to register MCP servers dynamically. Writing to `.vscode/mcp.json` caused unintentional
  // overwrites of user configurations and has been replaced by provider-based registration.
}
