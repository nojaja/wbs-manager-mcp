// Temporary in-memory database for MCP server testing
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export interface Project {
    id: string;
    title: string;
    description?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface Task {
    id: string;
    project_id: string;
    parent_id?: string;
    title: string;
    description?: string;
    goal?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    created_at: string;
    updated_at: string;
    version: number;
    children?: Task[];
}

let dbPromise: Promise<Database> | null = null;

/**
 * データベースパス解決処理
 * データディレクトリの絶対パスを生成し返す
 * なぜ必要か: ワークスペースごとに独立したDBファイルを安全に配置するため
 * @returns データベースファイルパス
 */
function resolveDatabasePath(): string {
    const baseDir = process.env.WBS_MCP_DATA_DIR && process.env.WBS_MCP_DATA_DIR.trim().length > 0
        ? process.env.WBS_MCP_DATA_DIR
        : process.cwd();

    const resolvedBase = path.resolve(baseDir);
    return path.join(resolvedBase, 'data', 'wbs.db');
}

const DB_PATH = resolveDatabasePath();
const DB_DIR = path.dirname(DB_PATH);

/**
 * データベース取得処理
 * DBファイルがなければ作成し、Databaseインスタンスを返す
 * なぜ必要か: DB初期化・多重生成防止・全DB操作の共通入口とするため
 * @returns Promise<Database>
 */
async function getDatabase(): Promise<Database> {
    // dbPromiseが未初期化ならDBを初期化
    // 理由: 多重初期化・競合を防ぐため
    if (!dbPromise) {
        // DBディレクトリがなければ作成
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        dbPromise = open({
            filename: DB_PATH,
            driver: sqlite3.Database
        }).then(async (db) => {
            await db.exec('PRAGMA foreign_keys = ON');
            return db;
        });
    }
    return dbPromise;
}

/**
 * データベース初期化処理
 * 必要なテーブルを作成し、初期データを投入する
 * なぜ必要か: サーバ起動時にDBスキーマ・サンプルデータを自動生成するため
 */
export async function initializeDatabase(): Promise<void> {
    const db = await getDatabase();

    await db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1
        )
    `);

    await db.exec(`
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

    await seedInitialData(db);
}

/**
 * 初期データ投入処理
 * DBにサンプルプロジェクト・タスクを投入する
 * なぜ必要か: 新規環境でも動作確認できるように初期データを自動投入するため
 * @param db Databaseインスタンス
 */
async function seedInitialData(db: Database): Promise<void> {
    const existing = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM projects'
    );

    // 既存データが1件以上あれば初期データ投入をスキップ
    // 理由: 再投入による重複・整合性崩壊を防ぐため
    if ((existing?.count ?? 0) > 0) {
        return;
    }

    const now = new Date().toISOString();

    const projectAlphaId = uuidv4();
    const projectBetaId = uuidv4();

    await db.run(
        `INSERT INTO projects (id, title, description, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 1)`,
        projectAlphaId,
        'Alpha Release Plan',
        'Milestones and tasks leading up to the alpha release.',
        now,
        now
    );

    await db.run(
        `INSERT INTO projects (id, title, description, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 1)`,
        projectBetaId,
        'Beta Feedback Sprint',
        'Collect and triage beta feedback items for resolution.',
        now,
        now
    );

    const planningTaskId = uuidv4();
    const backendTaskId = uuidv4();
    const uiTaskId = uuidv4();
    const qaTaskId = uuidv4();
    const feedbackRootId = uuidv4();
    const feedbackBugfixId = uuidv4();

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        planningTaskId,
        projectAlphaId,
        null,
        'Project kickoff & planning',
        'Define scope, success metrics, and resource allocation for alpha.',
        'Shared understanding of scope and priorities',
        'Yuki Tanaka',
        'completed',
        '2d',
        now,
        now
    );

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        backendTaskId,
        projectAlphaId,
        planningTaskId,
        'Finalize API contract',
        'Lock down the REST/JSON contract for core features.',
        'Approved API spec shared with frontend',
        'Akira Sato',
        'in-progress',
        '3d',
        now,
        now
    );

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        uiTaskId,
        projectAlphaId,
        planningTaskId,
        'Implement dashboard UI',
        'Build the main dashboard experience aligning with the new spec.',
        'Dashboard usable for stakeholder review',
        'Mina Kato',
        'pending',
        '5d',
        now,
        now
    );

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        qaTaskId,
        projectAlphaId,
        null,
        'Alpha regression sweep',
        'Verify critical paths before releasing to early adopters.',
        'Green test matrix covering P0 flows',
        'Leo Nakamura',
        'pending',
        '3d',
        now,
        now
    );

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        feedbackRootId,
        projectBetaId,
        null,
        'Feedback triage',
        'Categorize and prioritize incoming beta feedback.',
        'Clear prioritization backlog for beta findings',
        'Sara Ito',
        'in-progress',
        '1d',
        now,
        now
    );

    await db.run(
        `INSERT INTO tasks (
            id, project_id, parent_id, title, description, goal, assignee,
            status, estimate, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        feedbackBugfixId,
        projectBetaId,
        feedbackRootId,
        'Patch top blocker bug',
        'Fix the crash reported by multiple beta testers in the editor view.',
        'Crash no longer reproducible on latest build',
        'Hiroko Yamamoto',
        'pending',
        '2d',
        now,
        now
    );
}

/**
 * WBSリポジトリクラス
 * プロジェクト・タスクのDB操作を提供する
 * なぜ必要か: DBアクセスを集約し、サーバ本体から分離・再利用性を高めるため
 */
export class WBSRepository {
    /**
     * DB取得処理
     * Databaseインスタンスを返す
     * なぜ必要か: 全DB操作で同一インスタンスを使い、コネクション管理を簡素化するため
     * @returns Promise<Database>
     */
    private async db(): Promise<Database> {
        return getDatabase();
    }

    /**
     * プロジェクト作成処理
     * 新規プロジェクトをDBに登録し、作成結果を返す
     * なぜ必要か: クライアントからの新規プロジェクト作成要求に応えるため
     * @param title プロジェクト名
     * @param description プロジェクト説明
     * @returns Promise<Project>
     */
    async createProject(title: string, description: string = ''): Promise<Project> {
        const db = await this.db();
        const id = uuidv4();
        const now = new Date().toISOString();

        await db.run(
            `INSERT INTO projects (id, title, description, created_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, 1)`,
            id,
            title,
            description || null,
            now,
            now
        );

        return this.getProject(id) as Promise<Project>;
    }

    /**
     * プロジェクト一覧取得処理
     * DBから全プロジェクトを取得し、配列で返す
     * なぜ必要か: クライアントからのプロジェクト一覧表示要求に応えるため
     * @returns Promise<Project[]>
     */
    async listProjects(): Promise<Project[]> {
        const db = await this.db();
        const rows = await db.all<Project[]>(
            `SELECT id, title, description, created_at, updated_at, version
             FROM projects
             ORDER BY created_at DESC`
        );
        return rows;
    }

    /**
     * プロジェクト取得処理
     * 指定IDのプロジェクトをDBから取得する
     * なぜ必要か: プロジェクト詳細画面やタスク作成時に参照するため
     * @param id プロジェクトID
     * @returns Promise<Project | null>
     */
    async getProject(id: string): Promise<Project | null> {
        const db = await this.db();
        const project = await db.get<Project>(
            `SELECT id, title, description, created_at, updated_at, version
             FROM projects
             WHERE id = ?`,
            id
        );
        return project ?? null;
    }

    /**
     * タスク作成処理
     * 新規タスクをDBに登録し、作成結果を返す
     * なぜ必要か: クライアントからの新規タスク作成要求に応えるため
     * @param projectId プロジェクトID
     * @param title タスク名
     * @param description タスク説明
     * @param parentId 親タスクID
     * @param assignee 担当者
     * @param estimate 見積もり
     * @param goal ゴール
     * @returns Promise<Task>
     */
    async createTask(
        projectId: string,
        title: string,
        description: string = '',
        parentId: string | null = null,
        assignee: string | null = null,
        estimate: string | null = null,
        goal: string | null = null
    ): Promise<Task> {
        const db = await this.db();
        const id = uuidv4();
        const now = new Date().toISOString();

        await db.run(
            `INSERT INTO tasks (
                id, project_id, parent_id, title, description, goal, assignee,
                status, estimate, created_at, updated_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1)`,
            id,
            projectId,
            parentId || null,
            title,
            description || null,
            goal || null,
            assignee || null,
            estimate || null,
            now,
            now
        );

        return (await this.getTask(id))!;
    }

    /**
     * タスク一覧取得処理
     * 指定プロジェクトIDのタスクをDBから取得し、階層構造で返す
     * なぜ必要か: プロジェクト配下のタスクツリーをUIに表示するため
     * @param projectId プロジェクトID
     * @returns Promise<Task[]>
     */
    async listTasks(projectId: string): Promise<Task[]> {
        const db = await this.db();
        const rows = await db.all<Task[]>(
            `SELECT id, project_id, parent_id, title, description, goal, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE project_id = ?
             ORDER BY created_at ASC`,
            projectId
        );

        const taskMap = new Map<string, Task>();
        const roots: Task[] = [];

        rows.forEach((row) => {
            taskMap.set(row.id, { ...row, children: [] });
        });

        rows.forEach((row) => {
            const node = taskMap.get(row.id)!;
            // 親タスクが存在すれば親のchildrenに追加、なければルートに追加
            // 理由: タスクツリー構造を正しく再現するため
            if (row.parent_id && taskMap.has(row.parent_id)) {
                const parent = taskMap.get(row.parent_id)!;
                parent.children!.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    }

    /**
     * タスク取得処理
     * 指定IDのタスクをDBから取得する
     * なぜ必要か: タスク詳細画面や編集時に最新情報を取得するため
     * @param taskId タスクID
     * @returns Promise<Task | null>
     */
    async getTask(taskId: string): Promise<Task | null> {
        const db = await this.db();
        const task = await db.get<Task>(
            `SELECT id, project_id, parent_id, title, description, goal, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE id = ?`,
            taskId
        );
        return task ?? null;
    }

    /**
     * タスク更新処理
     * 指定IDのタスクをDBで更新し、更新後のタスクを返す
     * なぜ必要か: タスク編集・保存時にDBへ反映し、バージョン管理・競合検出も行うため
     * @param taskId タスクID
     * @param updates 更新内容
     * @returns Promise<Task>
     */
    async updateTask(taskId: string, updates: Partial<Task> & { ifVersion?: number }): Promise<Task> {
        const db = await this.db();
        const current = await this.getTask(taskId);
        // タスクが存在しなければエラー
        // 理由: 存在しないタスクの更新を防ぐ
        if (!current) {
            throw new Error(`Task not found: ${taskId}`);
        }

        // 楽観ロック: バージョン不一致ならエラー
        // 理由: 複数ユーザー編集時の競合検出・整合性維持のため
        if (updates.ifVersion !== undefined && current.version !== updates.ifVersion) {
            throw new Error('Task has been modified by another user');
        }

        const now = new Date().toISOString();
        const newVersion = current.version + 1;

        await db.run(
            `UPDATE tasks
             SET title = ?,
                 description = ?,
                 goal = ?,
                 assignee = ?,
                 status = ?,
                 estimate = ?,
                 updated_at = ?,
                 version = ?
             WHERE id = ?`,
            updates.title ?? current.title,
            updates.description ?? current.description ?? null,
            updates.goal ?? current.goal ?? null,
            updates.assignee ?? current.assignee ?? null,
            updates.status ?? current.status,
            updates.estimate ?? current.estimate ?? null,
            now,
            newVersion,
            taskId
        );

        return (await this.getTask(taskId))!;
    }
}