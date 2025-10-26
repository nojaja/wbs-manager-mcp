import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const dbPromiseMap: Map<string, Promise<Database>> = new Map();

/**
 * 処理名: RunResult型定義
 * 処理概要: node:sqlite の Statement#run が返す変更情報を既存実装互換の形で表現する
 */
export interface RunResult {
  changes?: number;
  lastID?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * 処理名: Databaseインターフェース
 * 処理概要: 既存リポジトリが期待する非同期SQLite操作APIを node:sqlite 上で再現するための契約定義
 */
export interface Database {
  all<T = any>(sql: string, ...params: unknown[]): Promise<T>;
  get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  run(sql: string, ...params: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * 処理名: NativeDatabaseクラス
 * 処理概要: node:sqlite の同期APIを Promise ベースにラップして既存コードから透過的に利用できるようにする
 */
class NativeDatabase implements Database {
  private closed = false;

  /**
   * @param {DatabaseSync} db node:sqlite の同期データベースインスタンス
   */
  constructor(private readonly db: DatabaseSync) {}

  /**
   * 処理名: allラッパ
   * 処理概要: 同期 all 呼び出しを Promise で包み、従来の非同期APIと同じ戻り値を返す
   * @param {string} sql 実行するクエリ
   * @param {...unknown[]} params バインドパラメータ
   * @returns {Promise<T>} クエリ結果
   */
  async all<T = any>(sql: string, ...params: unknown[]): Promise<T> {
    const statement = this.db.prepare(sql);
    try {
      const boundParams = normalizeParams(params);
      return statement.all(...boundParams) as T;
    } finally {
      disposeStatement(statement);
    }
  }

  /**
   * 処理名: getラッパ
   * 処理概要: 同期 get を Promise で包み、存在しない場合は undefined を返す挙動を保持する
   * @param {string} sql 実行するクエリ
   * @param {...unknown[]} params バインドパラメータ
   * @returns {Promise<T|undefined>} 取得した行
   */
  async get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const statement = this.db.prepare(sql);
    try {
      const boundParams = normalizeParams(params);
      return statement.get(...boundParams) as T | undefined;
    } finally {
      disposeStatement(statement);
    }
  }

  /**
   * 処理名: runラッパ
   * 処理概要: Statement#run の戻り値を sqlite パッケージ互換のオブジェクトに変換する
   * @param {string} sql 実行するクエリ
   * @param {...unknown[]} params バインドパラメータ
   * @returns {Promise<RunResult>} 変更結果情報
   */
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const statement = this.db.prepare(sql);
    try {
      const boundParams = normalizeParams(params);
      const result = statement.run(...boundParams);
      const changes = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes;
      const lastInsertRowid = typeof result.lastInsertRowid === 'bigint'
        ? Number(result.lastInsertRowid)
        : result.lastInsertRowid;

      return {
        changes,
        lastID: lastInsertRowid,
        lastInsertRowid: result.lastInsertRowid,
      };
    } finally {
      disposeStatement(statement);
    }
  }

  /**
   * 処理名: execラッパ
   * 処理概要: 同期 exec を呼び出しつつ既存インターフェースの Promise 形態を維持する
   * @param {string} sql 実行するSQLスクリプト
   */
  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  /**
   * 処理名: closeラッパ
   * 処理概要: 多重クローズを避けつつ DatabaseSync#close を呼び出してコネクションを解放する
   * @returns {Promise<void>} クローズ完了
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      this.db.close();
    } finally {
      this.closed = true;
    }
  }
}

/**
 * 処理名: ステートメントクローズ補助
 * 処理概要: node:sqlite の StatementSync が expose する close を安全に呼び出してリソースを解放する
 * @param {{close?: () => void}} statement StatementSync互換オブジェクト
 * @param {() => void} [statement.close] クローズ処理
 */
function disposeStatement(statement: { close?: () => void }): void {
  if (typeof statement.close === 'function') {
    try {
      statement.close();
    } catch {
      // ignore close errors, statements will be collected by GC
    }
  }
}

/**
 * 処理名: パラメータ正規化
 * 処理概要: 位置パラメータ配列や名前付きパラメータオブジェクトを node:sqlite が受け付ける形に変換し、undefined を null に揃える
 * @param {unknown[]} params 呼び出し元から渡されたパラメータ引数
 * @returns {unknown[]} StatementSync へバインド可能な配列
 */
function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 0) {
    return [];
  }

  if (params.length === 1) {
    const single = params[0];

    if (Array.isArray(single)) {
      return single.map(normalizeValue);
    }

    if (isPlainObject(single)) {
      return [normalizeObject(single as Record<string, unknown>)];
    }

    return [normalizeValue(single)];
  }

  return params.map((value) => {
    if (isPlainObject(value)) {
      return normalizeObject(value as Record<string, unknown>);
    }

    return normalizeValue(value);
  });
}

/**
 * 処理名: オブジェクト正規化
 * 処理概要: 名前付きパラメータ用オブジェクト内の undefined を null に揃える
 * @param {Record<string, unknown>} source 元オブジェクト
 * @returns {Record<string, unknown>} 正規化済みオブジェクト
 */
function normalizeObject(source: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(source).map(([key, value]) => [key, normalizeValue(value)]);
  return Object.fromEntries(entries);
}

/**
 * 処理名: 値正規化
 * 処理概要: undefined を null に変換し、ネストしたオブジェクトを再帰処理する
 * @param {unknown} value パラメータ値
 * @returns {unknown} SQLite にバインド可能な値
 */
function normalizeValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (isPlainObject(value)) {
    return normalizeObject(value as Record<string, unknown>);
  }

  return value;
}

/**
 * 処理名: プレーンオブジェクト判定
 * 処理概要: 配列や Buffer などを除外した純粋なオブジェクトかを判定する
 * @param {unknown} value 判定対象
 * @returns {boolean} プレーンオブジェクトであれば true
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 処理名: データベースパス解決
 * 処理概要: 環境変数またはカレントディレクトリから SQLite データベースファイル（data/wbs.db）の絶対パスを構築して返す
 * 実装理由: テストや実行環境で DB ファイルの配置先を切り替え可能にし、コード中で再利用できる統一経路を提供するため
 * @returns {string} Absolute path to the wbs.db file under data/
 * @class
 */
export function resolveDatabasePath(): string {
  const baseDir = process.env.WBS_MCP_DATA_DIR && process.env.WBS_MCP_DATA_DIR.trim().length > 0
    ? process.env.WBS_MCP_DATA_DIR
    : process.cwd();

  const resolvedBase = path.resolve(baseDir);
  // If running under Jest, use the worker id to create per-worker DB files to avoid
  // concurrent access/unique-constraint issues when tests run in parallel.
  const jestWorker = process.env.JEST_WORKER_ID;
  const dbFileName = jestWorker ? `wbs.${jestWorker}.db` : 'wbs.db';
  return path.join(resolvedBase, 'data', dbFileName);
}

/**
 * 処理名: データベース取得/初期化
 * 処理概要: Node.js ネイティブの node:sqlite ドライバで DB を開き、スキーマ初期化済みの Database インスタンスを Promise として返却する。再取得時は既存の Promise を再利用する（memoize）。
 * 実装理由: テスト実行で不要な I/O を抑えつつ、同一パスの DB を複数回開かないようにし、スキーマ初期化を一元管理するため
 * @returns {Promise<Database>} A promise resolving to the Database instance
 */
export async function getDatabase(): Promise<Database> {
  const DB_PATH = resolveDatabasePath();
  const DB_DIR = path.dirname(DB_PATH);

  if (!dbPromiseMap.has(DB_PATH)) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const p = (async () => {
      const nativeDb = new DatabaseSync(DB_PATH, { enableForeignKeyConstraints: true });
      console.error('[db.connection] Opened database at', DB_PATH);
      const db = new NativeDatabase(nativeDb);
      await runInitialize(db);
      return db;
    })();

    dbPromiseMap.set(DB_PATH, p);
  }

  return dbPromiseMap.get(DB_PATH)!;
}

/**
 * 処理名: データベースクローズ
 * 処理概要: 指定またはデフォルトの DB パスに紐づく Database インスタンスをクローズし、キャッシュから削除する
 * 実装理由: テストやプロセス終了時にファイルハンドルを正しく解放し、次回起動時にクリーンに初期化できるようにするため
 * @param {string} [dbPath] Optional DB path to close. If omitted, uses resolved default path.
 */
export async function closeDatabase(dbPath?: string): Promise<void> {
  const DB_PATH = dbPath ?? resolveDatabasePath();
  const p = dbPromiseMap.get(DB_PATH);
  if (p) {
    try {
      const db = await p;
      try {
        await db.close();
      } catch (e) {
        // ignore close errors during cleanup
      }
    } finally {
      dbPromiseMap.delete(DB_PATH);
    }
  }
}

/**
 * 処理名: スキーマ初期化
 * 処理概要: 指定した Database インスタンスに対して必要なテーブル群（tasks, artifacts, task_artifacts 等）を作成する
 * 実装理由: アプリケーションの起動時やテストセットアップ時にスキーマを自動的に整備して、手動作業を省くため
 * @internal
 * @param {Database} db Database instance to apply schema on
 * @returns {Promise<void>} Resolves when schema has been applied
 */
async function runInitialize(db: Database): Promise<void> {
  // temporarily disable foreign keys while creating schema to avoid ordering issues
  await db.exec('PRAGMA foreign_keys = OFF');

  await db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            details TEXT,
            assignee TEXT,
            status TEXT DEFAULT 'draft',
            estimate TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            uri TEXT,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            UNIQUE(title)
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS task_artifacts (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            artifact_id TEXT NOT NULL,
            role TEXT NOT NULL,
            crud_operations TEXT,
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
        )
    `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS task_completion_conditions (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            description TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      dependency_task_id TEXT NOT NULL,
      dependee_task_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (dependency_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (dependee_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(dependency_task_id, dependee_task_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS dependency_artifacts (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
        CREATE TABLE IF NOT EXISTS task_history (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            title TEXT,
            description TEXT,
            details TEXT,
            status TEXT,
            assignee TEXT,
            changed_by TEXT,
            changed_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

  await db.exec('PRAGMA foreign_keys = ON');
}


/**
 * 処理名: データベース初期化（ユーティリティ）
 * 処理概要: 解決された DB パスでデータベースを初期化し、直後にクローズするユーティリティ関数
 * 実装理由: テストや CI 環境でスキーマを確実に作成するために単発で呼べる補助関数を提供するため
 */
export async function initializeDatabase(): Promise<void> {
  const DB_PATH = resolveDatabasePath();
  const db = await getDatabase();
  // getDatabase will have already run runInitialize, but expose initializeDatabase
  // for compatibility: ensure schema exists and then close
  await runInitialize(db);
  await closeDatabase(DB_PATH);
}
