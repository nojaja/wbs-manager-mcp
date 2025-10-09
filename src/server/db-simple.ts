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
        if (!task) {
            return null;
        }

        const rows = await db.all<Task[]>(
            `SELECT id, project_id, parent_id, title, description, goal, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE project_id = ?
             ORDER BY created_at ASC`,
            task.project_id
        );

        const taskMap = new Map<string, Task>();

        rows.forEach((row) => {
            taskMap.set(row.id, { ...row, children: [] });
        });

        rows.forEach((row) => {
            if (row.parent_id && taskMap.has(row.parent_id)) {
                const parent = taskMap.get(row.parent_id)!;
                parent.children!.push(taskMap.get(row.id)!);
            }
        });

        const target = taskMap.get(taskId);
        if (!target) {
            return { ...task, children: [] };
        }

        return target;
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

    /**
     * タスク移動処理
     * 指定タスクの親タスクを変更し、更新後のタスクを返す
     * なぜ必要か: ツリー上でのドラッグ&ドロップによる親子関係の付け替えに対応するため
     * @param taskId 移動対象タスクID
     * @param newParentId 新しい親タスクID（ルートへ移動する場合はnull）
     * @returns Promise<Task>
     */
    async moveTask(taskId: string, newParentId: string | null): Promise<Task> {
        const db = await this.db();
        const task = await this.fetchTaskRow(db, taskId);

        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        const normalizedParentId = newParentId ?? null;

        await this.validateMoveTarget(db, task, normalizedParentId);

        if ((task.parent_id ?? null) === normalizedParentId) {
            return (await this.getTask(taskId))!;
        }

        const now = new Date().toISOString();
        const newVersion = task.version + 1;

        await db.run(
            `UPDATE tasks
             SET parent_id = ?,
                 updated_at = ?,
                 version = ?
             WHERE id = ?`,
            normalizedParentId,
            now,
            newVersion,
            taskId
        );

        return (await this.getTask(taskId))!;
    }

    /**
     * タスク移動先検証処理
     * 親タスク変更時の制約を確認し、問題があれば例外を投げる
     * なぜ必要か: 無効な親子関係の生成や循環参照の発生を防ぐため
     * @param db Databaseインスタンス
     * @param task 現在のタスク
     * @param normalizedParentId 新しい親タスクID（null許容）
     */
    private async validateMoveTarget(db: Database, task: Task, normalizedParentId: string | null): Promise<void> {
        if (!normalizedParentId) {
            return;
        }

        if (normalizedParentId === task.id) {
            throw new Error('Task cannot be its own parent');
        }

        const parent = await db.get<Task>(
            `SELECT id, project_id, parent_id
             FROM tasks
             WHERE id = ?`,
            normalizedParentId
        );

        if (!parent) {
            throw new Error(`Parent task not found: ${normalizedParentId}`);
        }

        if (parent.project_id !== task.project_id) {
            throw new Error('Cannot move task to a different project');
        }

        await this.ensureNotDescendant(db, task.id, parent.parent_id ?? null);
    }

    /**
     * 循環参照防止処理
     * 親チェーンを遡り、移動対象タスクが含まれていないことを確認する
     * なぜ必要か: タスクを自身の子孫配下へ移動して循環を発生させるのを防ぐため
     * @param db Databaseインスタンス
     * @param taskId 移動対象タスクID
     * @param startParentId 検査開始の親ID
     */
    private async ensureNotDescendant(db: Database, taskId: string, startParentId: string | null): Promise<void> {
        let ancestorId = startParentId;
        while (ancestorId) {
            if (ancestorId === taskId) {
                throw new Error('Cannot move task into its descendant');
            }
            const ancestor = await db.get<{ parent_id: string | null }>(
                `SELECT parent_id FROM tasks WHERE id = ?`,
                ancestorId
            );
            ancestorId = ancestor?.parent_id ?? null;
        }
    }

    /**
     * タスク行取得処理
     * DBから単一タスク行を取得する
     * なぜ必要か: 移動検証などのために最低限のタスク情報を取得するため
     * @param db Databaseインスタンス
     * @param taskId タスクID
     * @returns タスク行またはnull
     */
    private async fetchTaskRow(db: Database, taskId: string): Promise<Task | null> {
        const row = await db.get<Task>(
            `SELECT id, project_id, parent_id, title, description, goal, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE id = ?`,
            taskId
        );
        return row ?? null;
    }

    /**
     * タスク削除処理
     * 指定されたタスクとその子タスクをDBから削除する
     * なぜ必要か: UIやAPIからの削除要求を実データベースに反映するため
     * @param taskId タスクID
     * @returns 削除が行われたかどうか
     */
    async deleteTask(taskId: string): Promise<boolean> {
        const db = await this.db();
        const existing = await db.get<{ id: string }>(
            `SELECT id FROM tasks WHERE id = ?`,
            taskId
        );

        if (!existing) {
            return false;
        }

        const result = await db.run(
            `DELETE FROM tasks WHERE id = ?`,
            taskId
        );

        return (result.changes ?? 0) > 0;
    }

    /**
     * プロジェクト削除処理
     * 指定されたプロジェクトと配下のタスクを削除する
     * なぜ必要か: プロジェクト削除要求をDBへ反映し、関連タスクも一括で削除するため
     * @param projectId プロジェクトID
     * @returns 削除が行われたかどうか
     */
    async deleteProject(projectId: string): Promise<boolean> {
        const db = await this.db();
        const existing = await db.get<{ id: string }>(
            `SELECT id FROM projects WHERE id = ?`,
            projectId
        );

        if (!existing) {
            return false;
        }

        const result = await db.run(
            `DELETE FROM projects WHERE id = ?`,
            projectId
        );

        return (result.changes ?? 0) > 0;
    }
}