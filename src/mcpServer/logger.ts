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
 * LoggerClass provides leveled logging to stderr with optional JSON output
 * and an in-memory hook used by tests. It intentionally writes to stderr so
 * stdout remains reserved for JSON-RPC responses.
 */
class LoggerClass {
  private level: LogLevel;
  private json: boolean;
  private out: Writable;
  private memory: LogRecord[] | null = null;

  /**
   * Create a LoggerClass instance. Level and JSON mode are read from
   * environment variables `WBS_MCP_LOG_LEVEL` and `WBS_MCP_LOG_JSON`.
   */
  constructor() {
    const envLevel = (process.env.WBS_MCP_LOG_LEVEL || 'info') as LogLevel;
    this.level = LEVELS[envLevel] === undefined ? 'info' : envLevel;
    this.json = (process.env.WBS_MCP_LOG_JSON || '0') === '1';
    this.out = process.stderr;
  }

  /**
   * Enable in-memory collection of logs (for tests).
   */
  enableMemoryHook() {
    this.memory = [];
  }

  /**
   * Disable in-memory collection.
   */
  disableMemoryHook() {
    this.memory = null;
  }

  /**
   * Get a copy of the collected logs.
   * @returns {LogRecord[]} copy of log records
   */
  getMemory(): LogRecord[] {
    return this.memory ? [...this.memory] : [];
  }

  /**
   * Set runtime log level.
   * @param {LogLevel} l
   * @returns {void}
   */
  setLevel(l: LogLevel) {
    if (LEVELS[l] === undefined) return;
    this.level = l;
  }

  /**
   * Determine whether a level should be logged.
   * @param {LogLevel} l
   * @returns {boolean}
   */
  private shouldLog(l: LogLevel) {
    return LEVELS[l] <= LEVELS[this.level];
  }

  /**
   * Internal record writer.
  * @param {LogLevel} level
  * @param {string} msg
  * @param {string|null|undefined} correlationId
  * @param {Record<string, unknown>|null|undefined} extra
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
   * Log an error.
  * @param {string} msg
  * @param {string|null|undefined} correlationId
  * @param {Record<string, unknown>|null|undefined} extra
   */
  error(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('error')) return;
    this.record('error', msg, correlationId, extra);
  }

  /**
   * Log a warning.
  * @param {string} msg
  * @param {string|null|undefined} correlationId
  * @param {Record<string, unknown>|null|undefined} extra
   */
  warn(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('warn')) return;
    this.record('warn', msg, correlationId, extra);
  }

  /**
   * Log info.
  * @param {string} msg
  * @param {string|null|undefined} correlationId
  * @param {Record<string, unknown>|null|undefined} extra
   */
  info(msg: string, correlationId?: string | null, extra?: Record<string, unknown> | null) {
    if (!this.shouldLog('info')) return;
    this.record('info', msg, correlationId, extra);
  }

  /**
   * Log debug message.
  * @param {string} msg
  * @param {string|null|undefined} correlationId
  * @param {Record<string, unknown>|null|undefined} extra
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
