/* Logger for mcpServer
 * - default: write to stderr
 * - supports JSON mode and plain text
 * - level controlled by WBS_MCP_LOG_LEVEL (error,warn,info,debug)
 * - test hook: collect logs in memory when enableMemory=true
 */
import { Writable } from 'stream';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  msg: string;
  correlationId?: string | null;
  extra?: Record<string, unknown> | null;
}

/**
 * 処理名: LoggerClass（ロギングユーティリティ）
 * 処理概要: レベル付きログを標準エラー出力へ出力するユーティリティクラスです。JSON形式出力と
 *          テスト用のメモリフック（インメモリでログ収集）をサポートします。stdoutはJSON-RPC等の
 *          出力に予約するため、stderrへ書き出します。
 * 実装理由: コマンドライン上やサーバプロセスで発生するログを一元管理し、テスト時にログ検証を行える
 *          ようにメモリ収集を提供する為です。JSON出力モードを持つことでログを機械的に解析しやすく
 *          し、レベル設定により必要な情報だけを出力できます。
 */
class LoggerClass {
  private level: LogLevel;
  private json: boolean;
  private out: Writable;
  private memory: LogRecord[] | null = null;

  /**
  * 処理名: コンストラクタ（インスタンス初期化）
  * 処理概要: 環境変数 `WBS_MCP_LOG_LEVEL` と `WBS_MCP_LOG_JSON` を参照して
  *          ログレベルとJSON出力モードを初期化します。出力先は標準エラー（stderr）です。
  * 実装理由: 実行環境ごとにログの詳細度や形式を切り替えられるようにし、運用時の柔軟性を担保するため。
   */
  constructor() {
    const envLevel = (process.env.WBS_MCP_LOG_LEVEL || 'info') as LogLevel;
    this.level = LEVELS[envLevel] === undefined ? 'info' : envLevel;
    this.json = (process.env.WBS_MCP_LOG_JSON || '0') === '1';
    this.out = process.stderr;
  }

  /**
   * 処理名: enableMemoryHook（メモリログ収集開始）
   * 処理概要: テストや一時的な検証のために、ログ出力をメモリ内配列へも蓄積するフックを有効化します。
   * 実装理由: テストコードで発生したログを検証したり、外部出力に頼らずログ内容を取得するために必要です。
   */
  enableMemoryHook() {
    this.memory = [];
  }

  /**
   * 処理名: disableMemoryHook（メモリログ収集停止）
   * 処理概要: enableMemoryHook によるメモリ収集を無効化します。収集中のログは破棄されます。
   * 実装理由: 長時間のメモリ収集を避け、テスト終了後に状態をクリアするために必要です。
   */
  disableMemoryHook() {
    this.memory = null;
  }

  /**
   * 処理名: getMemory（メモリログ取得）
   * 処理概要: メモリ収集されているログのコピーを返します。呼び出し側が配列を変更しても内部状態は保護されます。
   * 実装理由: テストやデバッグで収集したログを安全に検査するため、内部配列の参照をそのまま返さずコピーを返します。
   * @returns {LogRecord[]} ログレコードの配列コピー
   */
  getMemory(): LogRecord[] {
    return this.memory ? [...this.memory] : [];
  }

  /**
   * 処理名: setLevel（ログレベル設定）
   * 処理概要: ランタイムでのログ出力レベルを設定します。'error'|'warn'|'info'|'debug' のいずれかを指定します。
   * 実装理由: 運用中に出力されるログ量を調整して過剰な出力を抑えたり、詳細デバッグを一時的に有効化するために必要です。
   * @param {LogLevel} l 設定するログレベル
   * @returns {void}
   */
  setLevel(l: LogLevel) {
    if (LEVELS[l] === undefined) return;
    this.level = l;
  }

  /**
   * 処理名: shouldLog（ログ出力判定）
   * 処理概要: 指定したログレベルが現在の設定レベルにより出力されるべきかを判定して返します。
   * 実装理由: 各ログメソッドで出力前に呼び出すことで、無駄な文字列生成やIOを回避しパフォーマンスを保ちます。
   * @param {LogLevel} l 判定対象のログレベル
   * @returns {boolean} 出力すべきなら true
   */
  private shouldLog(l: LogLevel) {
    return LEVELS[l] <= LEVELS[this.level];
  }

  /**
  * 処理名: record（ログ記録・出力内部処理）
  * 処理概要: ログレコードを構築し、メモリフックへ追加した上で stderr に書き出します。JSONモードかプレーンテキストかを判定して
  *          文字列化を行います。出力失敗時は例外をスローせずベストエフォートで処理します。
  * 実装理由: ログ出力の共通処理を集約することで各レベルメソッドの重複を避け、一貫したフォーマットで出力するためです。
  * @param {LogLevel} level ログレベル
  * @param {string} msg ログメッセージ
  * @param {string|null|undefined} correlationId 相関ID（任意）
  * @param {Record<string, unknown>|null|undefined} extra 追加メタ情報（任意）
   */
  private record(level: LogLevel, msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    const rec: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      correlationId: correlationId ?? null,
      extra: extra ?? null,
    };

    if (this.memory) this.memory.push(rec);

    const outStr = this.json ? JSON.stringify(rec) : `[${rec.timestamp}] ${rec.level.toUpperCase()}: ${rec.msg}${rec.correlationId ? ' cid=' + rec.correlationId : ''}${rec.extra ? ' ' + JSON.stringify(rec.extra) : ''}`;
    try {
      this.out.write(outStr + '\n');
    } catch (e) {
      // best-effort: don't throw from logger
    }
  }

  /**
   * 処理名: error（エラーログ出力）
   * 処理概要: エラーレベルのログを記録します。出力条件は現在のログレベル設定に従います。
   * 実装理由: システムエラーや致命的な問題を記録し、障害解析や監視に利用できるようにするために必須です。
   * @param {string} msg ログメッセージ
   * @param {string|null|undefined} correlationId 相関ID（任意）
   * @param {Record<string, unknown>|null|undefined} extra 追加メタ情報（任意）
   */
  error(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('error')) return;
    this.record('error', msg, correlationId, extra);
  }

  /**
   * 処理名: warn（警告ログ出力）
   * 処理概要: 警告レベルのログを記録します。問題ではあるが即時の致命的影響がない事象を通知する用途です。
   * 実装理由: 運用上の注意点や潜在的な問題をログとして残し、後続調査や監視ルールのトリガーに使えるようにするため。
   * @param {string} msg ログメッセージ
   * @param {string|null|undefined} correlationId 相関ID（任意）
   * @param {Record<string, unknown>|null|undefined} extra 追加メタ情報（任意）
   */
  warn(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('warn')) return;
    this.record('warn', msg, correlationId, extra);
  }

  /**
   * 処理名: info（情報ログ出力）
   * 処理概要: 通常の運用情報や状態変化を記録するためのログ出力です。システムの挙動確認に有用です。
   * 実装理由: システムのライフサイクルや操作履歴を追跡するために、情報レベルのログを残す必要があるため。
   * @param {string} msg ログメッセージ
   * @param {string|null|undefined} correlationId 相関ID（任意）
   * @param {Record<string, unknown>|null|undefined} extra 追加メタ情報（任意）
   */
  info(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('info')) return;
    this.record('info', msg, correlationId, extra);
  }

  /**
   * 処理名: debug（デバッグログ出力）
   * 処理概要: 詳細なデバッグ情報を出力します。通常は無効化しておき、問題解析時に有効にします。
   * 実装理由: 詳細な実装フローや内部状態を記録することで、問題発生時の原因特定を迅速化するために用意しています。
   * @param {string} msg ログメッセージ
   * @param {string|null|undefined} correlationId 相関ID（任意）
   * @param {Record<string, unknown>|null|undefined} extra 追加メタ情報（任意）
   */
  debug(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('debug')) return;
    this.record('debug', msg, correlationId, extra);
  }
}

const Logger = new LoggerClass();

export default Logger;

/**
 * Return a wrapper that calls the original function while preserving types.
 * Intended for future use where logs might carry a correlation id.
 * @template T
 * @param {T} fn Original function to wrap
 * @param {string|undefined} correlationId Optional correlation id
 * @returns {T} Wrapped function
 */
export function withCorrelationId<T extends (...args: any[]) => any>(fn: T, correlationId?: string) {
  /**
   * Return a wrapper that calls the original function. This helper exists
   * for potential future use where a correlation id could be attached to logs.
   * Currently it simply forwards arguments and return value.
   * @param {...any} args
   * @returns {ReturnType<T>}
   */
  return (...args: Parameters<T>): ReturnType<T> => {
    return fn(...args);
  };
}
