import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const dbPromiseMap: Map<string, Promise<Database>> = new Map();

/**
 * Resolve the database file path used by the test server.
 * @returns {string} Absolute path to the wbs.db file
 */
export function resolveDatabasePath(): string {
    const baseDir = process.env.WBS_MCP_DATA_DIR && process.env.WBS_MCP_DATA_DIR.trim().length > 0
        ? process.env.WBS_MCP_DATA_DIR
        : process.cwd();

    const resolvedBase = path.resolve(baseDir);
    return path.join(resolvedBase, 'data', 'wbs.db');
}

/**
 * Open (or return cached) sqlite Database instance.
 * @returns {Promise<Database>} Promise resolving to sqlite Database
 */
export async function getDatabase(): Promise<Database> {
    const DB_PATH = resolveDatabasePath();
    const DB_DIR = path.dirname(DB_PATH);
    if (!dbPromiseMap.has(DB_PATH)) {
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        const p = open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {
            await db.exec('PRAGMA foreign_keys = ON');
            return db;
        });
        dbPromiseMap.set(DB_PATH, p);
    }
    return dbPromiseMap.get(DB_PATH)!;
}

/**
 * Close the database connection for the current resolved DB path and clear cache.
 * @returns {Promise<void>} Promise that resolves when closed
 */
export async function closeAndClearDatabase(): Promise<void> {
    const DB_PATH = resolveDatabasePath();
    const p = dbPromiseMap.get(DB_PATH);
    if (p) {
        try {
            const db = await p;
            await db.close();
        } finally {
            dbPromiseMap.delete(DB_PATH);
        }
    }
}

/**
 * Initialize database schema. This is intentionally idempotent so it can be run
 * multiple times during tests/startup without harming existing data.
 * @returns {Promise<void>} Promise that resolves when initialization completes
 */
export async function initializeDatabase(): Promise<void> {
    const DB_PATH = resolveDatabasePath();
    const db = await getDatabase();

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
            from_task_id TEXT NOT NULL,
            to_task_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (from_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(from_task_id, to_task_id)
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

    // close DB and remove from cache so test harness can delete files without locking issues
    try {
        await db.close();
    } finally {
        if (dbPromiseMap.has(DB_PATH)) {
            dbPromiseMap.delete(DB_PATH);
        }
    }
}
