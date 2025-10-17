import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPromiseMap: Map<string, Promise<Database>> = new Map();

/**
 * 処理名: データベースパス解決
 *
 * 処理概要:
 * 環境変数 `WBS_MCP_DATA_DIR` が設定されている場合はそのディレクトリを基準に、
 * 設定されていない場合はカレントワーキングディレクトリを基準にして
 * data/wbs.db の絶対パスを返します。
 *
 * 実装理由:
 * テストやローカル実行時にデータファイルの格納先を柔軟に切り替えられるようにするため。
 * 絶対パスを返すことで、ファイル操作時のパス解決ミスや相対パスによるロック問題を防ぎます。
 *
 * @returns {string} wbs.db ファイルへの絶対パス
 */
export function resolveDatabasePath(): string {
    // 処理概要:
    // 環境変数 `WBS_MCP_DATA_DIR` が設定されていればそれを利用し、未設定なら
    // カレントワーキングディレクトリを基準にデータディレクトリを決定する。
    // 実装理由:
    // 環境ごとにデータ格納先を切り替えられるようにし、テストや開発環境で柔軟に動作させるため。
    const baseDir = process.env.WBS_MCP_DATA_DIR && process.env.WBS_MCP_DATA_DIR.trim().length > 0
        ? process.env.WBS_MCP_DATA_DIR
        : process.cwd();

    const resolvedBase = path.resolve(baseDir);
    return path.join(resolvedBase, 'data', 'wbs.db');
}

/**
 * 処理名: データベース接続取得
 *
 * 処理概要:
 * 指定されたデータベースファイルパスに対して sqlite データベースを開き、
 * その Promise を内部キャッシュに保持します。同じパスから複数回呼ばれた場合は
 * 既存の Promise を返して接続の使い回しを行います。接続確立後に外部キー制約を有効化します。
 *
 * 実装理由:
 * 同一ファイルへの重複接続や同時初期化を避け、テスト・ランタイムでのファイルロックや
 * リソースリークを防止するため。キャッシュにより接続オーバーヘッドを削減します。
 *
 * @returns {Promise<Database>} sqlite の Database インスタンスを返す Promise
 */
export async function getDatabase(): Promise<Database> {
    const DB_PATH = resolveDatabasePath();
    const DB_DIR = path.dirname(DB_PATH);
    // 処理概要:
    // データベースパスに対応する接続 Promise がキャッシュに存在するか確認し、
    // 存在しなければディレクトリを作成してデータベースをオープンする。
    // 実装理由:
    // 同一ファイルへの重複接続を防ぎ、接続の初期化を一箇所にまとめることで
    // リソース競合やファイルロック問題を軽減するため。
    if (!dbPromiseMap.has(DB_PATH)) {
        // 処理概要:
        // DB ファイルの格納ディレクトリが存在しない場合は作成する。
        // 実装理由:
        // 初回実行時などで data ディレクトリが無いとファイル作成に失敗するため、事前に作成する。
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        // 処理概要:
        // sqlite データベースを開いて、外部キー制約を有効化した Promise を作成する。
        // 実装理由:
        // sqlite はデフォルトで外部キー制約が無効なため、参照整合性を保つために明示的に有効化する。
        const p = open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {
            await db.exec('PRAGMA foreign_keys = ON');
            return db;
        });
        dbPromiseMap.set(DB_PATH, p);
    }
    return dbPromiseMap.get(DB_PATH)!;
}

/**
 * 処理名: データベース接続クローズとキャッシュクリア
 *
 * 処理概要:
 * 現在解決されているデータベースパスに対応する接続 Promise を取得し、開いている場合は
 * データベースを閉じます。最後に内部キャッシュからエントリを削除します。
 *
 * 実装理由:
 * テスト実行やプロセス終了時にファイルのロックを解除してファイル削除や再初期化を可能にするため。
 * キャッシュをクリアすることで次回の接続要求時にクリーンな初期化が行えます。
 *
 * @returns {Promise<void>} クローズ完了を示す Promise
 */
export async function closeAndClearDatabase(): Promise<void> {
    const DB_PATH = resolveDatabasePath();
    const p = dbPromiseMap.get(DB_PATH);
    // 処理概要:
    // キャッシュされた接続 Promise があればデータベースを閉じ、キャッシュを削除する。
    // 実装理由:
    // テストや再初期化時にファイルロックを解除し、次回接続で新しい状態から開始できるようにするため。
    if (p) {
        try {
            // 処理概要:
            // Promise を待って実際の Database インスタンスを取得し、close を呼び出す。
            // 実装理由:
            // 非同期で作成された接続を確実に閉じてリソースを解放するため。
            const db = await p;
            await db.close();
        } finally {
            // 処理概要:
            // 例外の有無に関わらずキャッシュエントリを削除する。
            // 実装理由:
            // クローズに失敗した場合でも不整合なキャッシュが残らないようにするため。
            dbPromiseMap.delete(DB_PATH);
        }
    }
}

/**
 * 処理名: データベーススキーマ初期化
 *
 * 処理概要:
 * データベースファイルを取得し、必要なテーブル（tasks, artifacts, task_artifacts,
 * task_completion_conditions, dependencies, task_history）を存在しなければ作成します。
 * 初期化は冪等に設計されており、複数回実行しても既存データを破壊しません。
 * 最後に接続を閉じてキャッシュから削除します。
 *
 * 実装理由:
 * テストやアプリ起動時にスキーマが存在しない環境でも自動的に必要な構造を作成し、
 * 手動セットアップを不要にするため。冪等性により初期化を安全に何度でも実行できます。
 *
 * @returns {Promise<void>} 初期化完了を示す Promise
 */
export async function initializeDatabase(): Promise<void> {
    const DB_PATH = resolveDatabasePath();
    const db = await getDatabase();
    // 処理概要:
    // スキーマ変更を行う際に一時的に外部キー制約を無効化する。
    // 実装理由:
    // テーブル作成/変更の際に外部キー順序の問題で失敗するのを防ぐため、一旦 OFF にしてから
    // 必要なテーブルを作成し終えたあとで ON に戻す。
    await db.exec('PRAGMA foreign_keys = OFF');

    // 処理概要:
    // tasks テーブルを作成（存在すれば何もしない）。タスク情報と階層管理のための主テーブル。
    // 実装理由:
    // WBS のコアデータであるタスクを管理するために必須のテーブル。ON DELETE CASCADE により
    // 親の削除時に子タスクや参照先が自動的に削除され整合性を保つ。
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

    // 処理概要:
    // artifacts テーブルを作成。成果物のメタ情報を保持する。
    // 実装理由:
    // タスクと紐付け可能な成果物（ドキュメント等）を一元管理するため。
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

    // 処理概要:
    // task_artifacts テーブルを作成し、タスクと成果物の関連（役割やCRUD操作）を保持する。
    // 実装理由:
    // 多対多の関係を表現する結合テーブルとして、タスクと成果物の紐付けを詳細に管理するため。
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

    // 処理概要:
    // task_completion_conditions テーブルを作成し、タスクごとの完了条件を順序付きで保持する。
    // 実装理由:
    // タスクの完了判定に必要な条件を独立して管理することで、UI 表示や編集が容易になるため。
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

    // 処理概要:
    // dependencies テーブルを作成し、タスク間の依存関係を保持する。
    // 実装理由:
    // 先行/後続タスクの関係を管理して、WBS における依存解析や表示を可能にするため。
    await db.exec(`
        CREATE TABLE IF NOT EXISTS dependencies (
            id TEXT PRIMARY KEY,
            from_task_id TEXT NOT NULL,
            to_task_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(from_task_id, to_task_id)
        )
    `);

    // 処理概要:
    // task_history テーブルを作成し、タスクの変更履歴（バージョン付き）を保持する。
    // 実装理由:
    // 変更履歴を保存することで差分表示やロールバック、監査が行えるようにするため。
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

    // 処理概要:
    // テーブル作成後、外部キー制約を再度有効化する。
    // 実装理由:
    // 一時的に OFF にしていた外部キー制約を復元し、以降のデータ操作で参照整合性を保つため。
    await db.exec('PRAGMA foreign_keys = ON');

    // close DB and remove from cache so test harness can delete files without locking issues
    // 処理概要:
    // 初期化が終わったら接続を閉じ、キャッシュを削除してファイルロックを解除する。
    // 実装理由:
    // テスト実行や環境リセットの際に DB ファイルを削除・再作成できるようにするため。
    try {
        await db.close();
    } finally {
        if (dbPromiseMap.has(DB_PATH)) {
            dbPromiseMap.delete(DB_PATH);
        }
    }
}
