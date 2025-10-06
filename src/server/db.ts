import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'wbs.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
    // Projects table
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1
        )
    `);

    // Tasks table
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            parent_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            goal TEXT,
            assignee TEXT,
            status TEXT DEFAULT 'pending',
            estimate TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Dependencies table
    db.exec(`
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

    // Sessions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);

    // Session members table
    db.exec(`
        CREATE TABLE IF NOT EXISTS session_members (
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at TEXT NOT NULL,
            PRIMARY KEY (session_id, user_id),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
    `);

    // Task history table for version tracking
    db.exec(`
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

    console.log('Database initialized successfully');
}

export function getDatabase() {
    return db;
}

// Initialize on import
initializeDatabase();
