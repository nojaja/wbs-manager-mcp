import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite';

const dbPromiseMap: Map<string, Promise<Database>> = new Map();

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
 * 処理概要: SQLite ドライバを遅延読み込みし、DB を open してスキーマ初期化を適用した Database インスタンスを返す。再取得時は既存の Promise を再利用する（memoize）。
 * 実装理由: テスト実行で不要な I/O を抑えつつ、同一パスの DB を複数回開かないようにし、スキーマ初期化を一元管理するため
 * @returns {Promise<Database>} A promise resolving to the Database instance
 */
export async function getDatabase(): Promise<Database> {
  // delayed import so tests that don't need the DB won't load sqlite driver / perform I/O
  const sqlite3 = await import('sqlite3');
  const { open } = await import('sqlite');

  const DB_PATH = resolveDatabasePath();
  const DB_DIR = path.dirname(DB_PATH);

  if (!dbPromiseMap.has(DB_PATH)) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const p = open({ filename: DB_PATH, driver: (sqlite3 as any).Database }).then(async (db) => {
      // run schema initialization on newly opened DB instance
      await runInitialize(db);
      // enable foreign keys by default
      await db.exec('PRAGMA foreign_keys = ON');
      return db as Database;
    });

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

export type { Database };

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
