import readline from 'readline';

/**
 * 処理名: メッセージハンドラ型定義
 * 処理概要: 標準入力から受信した1行分の生データを受け取るコールバックの型。
 * 実装理由: 受信データの処理をデカップリングして、任意のハンドラを登録できるようにするため。
 * @param {string} line - 受信した1行の文字列
 */
export type MessageHandler = (line: string) => void;

/**
 * 処理名: 標準入出力ベースのトランスポート
 * 処理概要: 標準入力を行単位で読み取り、行ごとに登録されたハンドラへ渡す。送信はオブジェクトを
 *           1行の JSON 文字列として標準出力へ書き出す。デバッグ情報は標準エラーへ出力する。
 * 実装理由: 単純なプロトコル（1行 JSON）で外部プロセスとやり取りするための最小限の入出力インターフェースを提供し、
 *           テストや標準入出力ベースのデプロイで互換性を保つために必要。
 */
import Logger from '../logger';

/**
 * StdioTransport provides line-based stdin reading and stdout JSON writing.
 */
export class StdioTransport {
  private rl: readline.Interface | null = null;
  private handler: MessageHandler | null = null;

  /**
   * 処理名: トランスポート開始
   * 処理概要: readline インターフェースを作成して stdin の行イベントを購読し、
   *           受信行を登録済みハンドラへ渡す。stdin の close イベント発生時はプロセスを終了する。
   * 実装理由: サーバが外部からの JSON-RPC メッセージを行単位で正しく受信できるようにするため。
   * @returns {void}
   */
  start() {
    this.rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    this.rl.on('line', (line) => {
      if (this.handler) this.handler(line);
    });

    this.rl.on('close', () => {
      Logger.info('[MCP Server] StdioTransport: stdin closed');
      process.exit(0);
    });
  }

  /**
   * 処理名: メッセージハンドラ登録
   * 処理概要: 標準入力から受信した各行を処理するコールバックを登録する。
   * 実装理由: 受信処理を外部に委譲することでトランスポート層と処理層の責務を分離するため。
   * @param {MessageHandler} handler
   * @returns {void}
   */
  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  /**
   * 処理名: メッセージ送信
   * 処理概要: オブジェクトを JSON にシリアライズし、1行分の文字列として標準出力へ書き出す。
   *           デバッグ用に整形済み文字列を標準エラーへ出力することも試みる。
   * 実装理由: 外部クライアントやパイプを通じたプロセス間通信で安定してメッセージを渡すため、
   *           1行 JSON というシンプルな形式を採用する必要があるため。
   * @param {any} obj 送信するオブジェクト
   * @returns {void}
   */
  send(obj: any) {
    const str = JSON.stringify(obj);
    // debug friendly pretty print to stderr
    try {
      Logger.debug('[MCP Server] Sending', null, { pretty: JSON.stringify(obj, null, 2) });
    } catch (e) {
      Logger.error('[MCP Server] Sending (stringify failed)', null, { err: e instanceof Error ? e.message : String(e) });
    }
    process.stdout.write(str + '\n');
  }

  /**
   * 処理名: トランスポート停止
   * 処理概要: readline インターフェースを閉じ、内部のハンドラ参照をクリアしてリソースを解放する。
   * 実装理由: テスト終了やサーバ停止時にリソースを明示的に解放し、プロセスの正常終了や再起動を可能にするため。
   * @returns {void}
   */
  stop() {
    this.rl?.close();
    this.rl = null;
    this.handler = null;
  }
}
