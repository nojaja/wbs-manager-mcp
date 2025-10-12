// src/server/ServerService.ts
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
/**
 * サーバプロセス管理専用サービス
 */
export class ServerService {
  /** サーバプロセス */
  private serverProcess: child_process.ChildProcess | null = null;
  /** 登録された MCPClient への参照（オプション） */
  private registeredClient: { handleResponse?: (resp: any) => void; onServerExit?: (code: number | null, signal: NodeJS.Signals | null) => void; setWriter?: (w: (s: string) => void) => void } | null = null;
  /** 出力チャネル */
  private outputChannel: { appendLine: (msg: string) => void; show?: () => void };

  /**
   * コンストラクタ
   * @param outputChannel ログ出力用チャネル
   * @param outputChannel.appendLine
   * @param outputChannel.show
   */
  constructor(outputChannel: { appendLine: (msg: string) => void; show?: () => void }) {
    this.outputChannel = outputChannel;
  }

  /**
   * サーバ実行ファイルの存在を検証
   * @param serverPath サーバ実行ファイルのパス
   * @returns 存在すればtrue
   */
  validateServerPath(serverPath: string): boolean {
    // 理由: サーバファイルが存在しない場合は即時エラー通知し、無駄な起動処理を防ぐ
    if (!fs.existsSync(serverPath)) {
      this.outputChannel.appendLine(`Error: Server file not found at ${serverPath}`);
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
    this.outputChannel.appendLine(`Starting MCP server from: ${serverPath}`);

    // サーバ用環境変数を設定
    // WBS_MCP_DATA_DIRは相対パス"."で設定（サーバはcwd: workspaceRootで起動されるため）
    const serverEnv = {
      ...process.env,
      WBS_MCP_DATA_DIR: "."
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
  setupServerProcessHandlers(onExit?: (code: number|null, signal: NodeJS.Signals|null) => void) {
    if (!this.serverProcess) return;
    // サーバの標準出力を処理
    // サーバのstdoutはJSON-RPCレスポンスのフレーム（改行区切り）を含むため、行単位で解析して登録されたクライアントへ通知する
    let buffer = '';
    if (this.serverProcess.stdout && typeof (this.serverProcess.stdout as any).setEncoding === 'function') {
      (this.serverProcess.stdout as any).setEncoding('utf8');
    }
    this.serverProcess.stdout?.on('data', (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop() || '';
      // If there were no newline splits but we have content, process that as a single line
      if (lines.length === 0 && buffer === '') {
        lines = [buffer];
      }
      for (const line of lines) {
        this.processServerLine(line);
      }
    });
    // サーバの標準エラー出力をログ・コンソールに出力
    // 理由: サーバ側のエラーを即時にユーザー・開発者へ通知するため
    this.serverProcess.stderr?.on('data', (data) => {
      const error = data.toString().trim();
      this.outputChannel.appendLine(`[Server Error] ${error}`);
      this.outputChannel.show?.();
    });
    // サーバプロセス終了時の処理
    // 理由: サーバ異常終了時にユーザーへ通知し、リソースをクリーンアップするため
    this.serverProcess.on('exit', (code, signal) => {
      this.outputChannel.appendLine(`Server process exited with code ${code}, signal: ${signal}`);
      if (code !== 0) {
        this.outputChannel.appendLine(`MCP server exited unexpectedly with code ${code}`);
      }
      this.serverProcess = null;
      // クライアントへ終了通知
      if (this.registeredClient && typeof this.registeredClient.onServerExit === 'function') {
        this.registeredClient.onServerExit(code, signal);
      }
      if (onExit) onExit(code, signal);
    });
    // サーバプロセスエラー時の処理
    // 理由: サーバ起動失敗や予期せぬ例外を即時通知し、リソースリークを防ぐため
    this.serverProcess.on('error', (err) => {
      this.outputChannel.appendLine(`Server process error: ${err.message}`);
      this.serverProcess = null;
    });
  }

  /**
   * 単一の stdout 行を処理するヘルパー
   * @param line stdout から受け取った1行の文字列
   */
  private processServerLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.outputChannel.appendLine(`[Server] ${trimmed}`);
    this.outputChannel.show?.();
    // クライアントが raw string を処理できる場合はそのまま渡す（互換性保持）
    if (this.registeredClient && typeof (this.registeredClient as any).handleResponseFromServer === 'function') {
      (this.registeredClient as any).handleResponseFromServer(trimmed);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (this.registeredClient && typeof (this.registeredClient as any).handleResponse === 'function') {
        (this.registeredClient as any).handleResponse(parsed);
      }
    } catch (err) {
      this.outputChannel.appendLine(`[Server] Non-JSON output: ${trimmed}`);
    }
  }

  /**
   * サーバプロセスを停止
   */
  stopServerProcess() {
    if (this.serverProcess) {
      this.outputChannel.appendLine('Stopping MCP server...');
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  /**
   * MCPClient を登録し、必要ならば書き込み関数を渡す
   * ServerService はプロセスの stdin/stdout を管理し、stdout の parsed JSON をクライアントに渡す
   * @param client MCPClient 相当のオブジェクト
   */
  /**
   * MCPClient を登録し、必要ならば書き込み関数を渡す
   * ServerService はプロセスの stdin/stdout を管理し、stdout の parsed JSON をクライアントに渡す
   * @param client.handleResponse サーバからの parsed JSON を受け取るコールバック
   * @param client.onServerExit サーバ終了を通知するコールバック
   * @param client.setWriter サーバへ文字列を書き込む関数を受け取る setter
   * @param client MCPClient 相当のオブジェクト
   */
  registerClient(client: { handleResponse?: (resp: any) => void; onServerExit?: (code: number | null, signal: NodeJS.Signals | null) => void; setWriter?: (w: (s: string) => void) => void }) {
    this.registeredClient = client;
    // サーバの stdin へ書き込むラッパーを渡す
    if (this.registeredClient && typeof this.registeredClient.setWriter === 'function') {
      this.registeredClient.setWriter((s: string) => {
        this.serverProcess?.stdin?.write(s);
      });
    }
  }

  /** 登録解除 */
  unregisterClient() {
    this.registeredClient = null;
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
    this.outputChannel.appendLine(`Created MCP configuration at: ${mcpConfigPath}`);
  }

  /**
   * サーバプロセスの参照を取得
   * @returns サーバプロセス
   */
  getServerProcess() {
    return this.serverProcess;
  }

  /**
   * サーバプロセスを開始して MCPClient を接続するユーティリティ
  * @param mcpClient MCPClient インスタンス（start(proc) を提供すること）
  * @param mcpClient.start MCPClient の start メソッド。サーバプロセスを引数に取り Promise を返すこと。
   * @param serverPath サーバ実行ファイルパス
   * @param workspaceRoot ワークスペースルート
   */
  async startAndAttachClient(mcpClient: { start: (proc: child_process.ChildProcess) => Promise<void> }, serverPath: string, workspaceRoot: string): Promise<void> {
    try {
      if (!this.validateServerPath(serverPath)) {
        return;
      }

      this.spawnServerProcess(serverPath, workspaceRoot);
      this.setupServerProcessHandlers();

      // 登録して writer を渡す
      this.registerClient(mcpClient as any);

      // クライアントの初期化開始
      if (typeof (mcpClient as any).start === 'function') {
        await (mcpClient as any).start();
      }
      this.createMcpConfig(workspaceRoot, serverPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`Failed to start and attach MCP client: ${message}`);
    }
  }
}
