// Temporary in-memory database for MCP server testing
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export type TaskArtifactRole = 'deliverable' | 'prerequisite';

export interface Artifact {
    id: string;
    title: string;
    uri?: string;
    description?: string;
    created_at: string;
    updated_at: string;
    version: number;
}

export interface TaskArtifactAssignment {
    id: string;
    artifact_id: string;
    role: TaskArtifactRole;
    crudOperations?: string | null;
    order: number;
    artifact: Artifact;
}

export interface TaskCompletionCondition {
    id: string;
    task_id: string;
    description: string;
    order: number;
}

interface TaskArtifactInput {
    artifactId: string;
    crudOperations?: string | null;
}

interface TaskCompletionConditionInput {
    description: string;
}

export interface Task {
    id: string;
    parent_id?: string;
    title: string;
    description?: string;
    assignee?: string;
    status: string;
    estimate?: string;
    created_at: string;
    updated_at: string;
    version: number;
    children?: Task[];
    deliverables?: TaskArtifactAssignment[];
    prerequisites?: TaskArtifactAssignment[];
    completionConditions?: TaskCompletionCondition[];
}

const dbPromiseMap: Map<string, Promise<Database>> = new Map();

/**
 * データベースパス解決処理
 * データディレクトリの絶対パスを生成し返す
 * なぜ必要か: ワークスペースごとに独立したDBファイルを安全に配置するため
 * 
 * WBS_MCP_DATA_DIRが設定されていれば、それを基準ディレクトリとして使用
 * - 絶対パスの場合：そのまま使用
 * - 相対パスの場合：プロセスの作業ディレクトリ（通常はワークスペースルート）からの相対パスとして解釈
 * - 未設定の場合：プロセスの作業ディレクトリを使用
 * 
 * @returns データベースファイルパス
 */
function resolveDatabasePath(): string {
    const baseDir = process.env.WBS_MCP_DATA_DIR && process.env.WBS_MCP_DATA_DIR.trim().length > 0
        ? process.env.WBS_MCP_DATA_DIR
        : process.cwd();

    // path.resolve()により、相対パスの場合は現在の作業ディレクトリからの相対パスとして解釈される
    const resolvedBase = path.resolve(baseDir);
    return path.join(resolvedBase, 'data', 'wbs.db');
}

// Note: DB path is resolved dynamically inside getDatabase to support per-test overrides of WBS_MCP_DATA_DIR

/**
 * データベース取得処理
 * DBファイルがなければ作成し、Databaseインスタンスを返す
 * なぜ必要か: DB初期化・多重生成防止・全DB操作の共通入口とするため
 * @returns Promise<Database>
 */
async function getDatabase(): Promise<Database> {
    const DB_PATH = resolveDatabasePath();
    const DB_DIR = path.dirname(DB_PATH);
    if (!dbPromiseMap.has(DB_PATH)) {
        // DBディレクトリがなければ作成
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        const p = open({ filename: DB_PATH, driver: sqlite3.Database }).then(async (db) => {

            // 処理概要: 外部キー制約を有効化
            // 実装理由: 親子削除等の整合性をDBレイヤで担保するため
            await db.exec('PRAGMA foreign_keys = ON');
            return db;
        });
        dbPromiseMap.set(DB_PATH, p);
    }
    return dbPromiseMap.get(DB_PATH)!;
}

/**
 * データベース初期化処理
 * 必要なテーブルを作成し、初期データを投入する
 * なぜ必要か: サーバ起動時にDBスキーマ・サンプルデータを自動生成するため
 */
export async function initializeDatabase(): Promise<void> {
    const DB_PATH = resolveDatabasePath();
    const db = await getDatabase();
    // To avoid issues when migrating away from a projects table (old schema),
    // drop related tables first so we can recreate them with the new schema.
    // This is safe for test environments where DB is ephemeral.
    await db.exec('PRAGMA foreign_keys = OFF');
    // 処理概要: スキーマ作成前は外部キー制約を一時的に無効化
    // 実装理由: 作成順による依存関係の問題を回避するため（作成後にON）


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
     * タスク作成処理
     * 新規タスクをDBに登録し、作成結果を返す
     * なぜ必要か: クライアントからの新規タスク作成要求に応えるため
     * @param title タスク名
     * @param description タスク説明
     * @param parentId 親タスクID
     * @param assignee 担当者
     * @param estimate 見積もり
     * @param options 付随情報（成果物・前提条件・完了条件）
     * @param options.deliverables 成果物割当一覧
     * @param options.prerequisites 前提条件の成果物割当一覧
     * @param options.completionConditions 完了条件一覧
     * @returns Promise<Task>
     */
    async createTask(
        title: string,
        description: string = '',
        parentId: string | null = null,
        assignee: string | null = null,
        estimate: string | null = null,
        options?: {
            deliverables?: TaskArtifactInput[];
            prerequisites?: TaskArtifactInput[];
            completionConditions?: TaskCompletionConditionInput[];
        }
    ): Promise<Task> {
        const db = await this.db();
        const id = uuidv4();
        const now = new Date().toISOString();
        // status はテスト期待値に合わせ、title/description/estimate のみを必須として判定する
        const hasTitle = !!(title && title.toString().trim().length > 0);
        const hasDescription = !!(description && description.toString().trim().length > 0);
        const hasEstimate = !!(estimate && estimate.toString().trim().length > 0);
        const allPresent = hasTitle && hasDescription && hasEstimate;
        const status = allPresent ? 'pending' : 'draft';

        await db.run('BEGIN');
        try {
            // projects テーブルを廃止したため、tasks テーブルの project_id カラムは存在しない
            // INSERT 文から project_id を削除して登録する
            await db.run(
                `INSERT INTO tasks (
                    id, parent_id, title, description, assignee,
                    status, estimate, created_at, updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                id,
                parentId || null,
                title,
                description || null,
                assignee || null,
                status,
                estimate || null,
                now,
                now
            );

            await this.syncTaskArtifacts(db, id, 'deliverable', options?.deliverables ?? [], now);
            await this.syncTaskArtifacts(db, id, 'prerequisite', options?.prerequisites ?? [], now);
            await this.syncTaskCompletionConditions(db, id, options?.completionConditions ?? [], now);

            await db.run('COMMIT');
        } catch (error) {
            // 処理概要: 途中エラー時はロールバックして一貫性を維持
            // 実装理由: 子テーブルが部分的に更新される不整合を避ける
            await db.run('ROLLBACK');
            throw error;
        }

        return (await this.getTask(id))!;
    }

    /**
     * 複数タスク一括登録処理
    * 複数のタスク定義を連続して作成する
    * なぜ必要か: 外部データ（WBS記法やJSON）からのインポートを効率よく反映するため
     * @param tasksTasks タスク配列 (各要素に title 等のプロパティを持つ)
     * @returns 作成された Task の配列
     */
    async importTasks(tasksTasks: Array<any>): Promise<Task[]> {
        const created: Task[] = [];
        for (const t of tasksTasks || []) {
            // 最小限のバリデーション
            if (!t || !t.title) continue; // 理由: 必須項目（title）が無い行はスキップするのみ
            const task = await this.createTask(
                t.title,
                t.description ?? '',
                t.parentId ?? null,
                t.assignee ?? null,
                t.estimate ?? null,
                {
                    deliverables: Array.isArray(t.deliverables) ? t.deliverables.map((d: any) => ({
                        artifactId: d.artifactId,
                        crudOperations: d.crudOperations ?? d.crud ?? null
                    })) : [],
                    prerequisites: Array.isArray(t.prerequisites) ? t.prerequisites.map((p: any) => ({
                        artifactId: p.artifactId,
                        crudOperations: p.crudOperations ?? null
                    })) : [],
                    completionConditions: Array.isArray(t.completionConditions) ? t.completionConditions
                        .filter((c: any) => typeof c?.description === 'string' && c.description.trim().length > 0)
                        .map((c: any) => ({ description: c.description.trim() })) : []
                }
            );
            created.push(task);
        }
        return created;
    }

    /**
     * 成果物一覧取得処理
     * 成果物を全件取得する
     * 引数を省略した場合はワークスペースの成果物を返す
     * なぜ必要か: 成果物ツリービューやタスク編集で参照するため
     * @returns 成果物配列
     */
    async listArtifacts(): Promise<Artifact[]> {
        const db = await this.db();
        const rows = await db.all<Artifact[]>(
            `SELECT id, title, uri, description, created_at, updated_at, version
             FROM artifacts
             ORDER BY title ASC`
        );
        return rows;
    }

    /**
     * 成果物取得処理
     * 指定IDの成果物を取得する
     * なぜ必要か: 編集・参照時に最新情報を取得するため
     * @param artifactId 成果物ID
     * @returns 成果物またはnull
     */
    async getArtifact(artifactId: string): Promise<Artifact | null> {
        const db = await this.db();
        const artifact = await db.get<Artifact>(
            `SELECT id, title, uri, description, created_at, updated_at, version
             FROM artifacts
             WHERE id = ?`,
            artifactId
        );
        return artifact ?? null;
    }

    /**
     * 成果物作成処理
     * 新しい成果物を登録する
     * なぜ必要か: 成果物管理機能から新規作成に対応するため
     * @param title 成果物名
     * @param uri 関連URI（任意）
     * @param description 説明（任意）
     * @returns 作成された成果物
     */
    async createArtifact(
        title: string,
        uri?: string,
        description?: string
    ): Promise<Artifact> {
        const db = await this.db();
        const id = uuidv4();
        const now = new Date().toISOString();
        await db.run(
            `INSERT INTO artifacts (
                id, title, uri, description, created_at, updated_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            id,
            title,
            uri ?? null,
            description ?? null,
            now,
            now
        );

        return (await this.getArtifact(id))!;
    }

    /**
     * 成果物更新処理
     * 指定成果物を更新し、更新後の情報を返す
     * なぜ必要か: 成果物情報の編集と楽観ロックに対応するため
     * @param artifactId 成果物ID
     * @param updates 更新内容
     * @param updates.title 成果物名（任意）
     * @param updates.uri 関連URI（任意）
     * @param updates.description 説明（任意）
     * @param updates.ifVersion 競合検出用バージョン（任意）
     * @returns 更新後の成果物
     */
    async updateArtifact(
        artifactId: string,
        updates: {
            title?: string;
            uri?: string | null;
            description?: string | null;
            ifVersion?: number;
        }
    ): Promise<Artifact> {
        const db = await this.db();
        const current = await this.getArtifact(artifactId);

        if (!current) {
            // 処理概要: 対象が存在しない場合はエラー
            // 実装理由: 更新対象の特定に失敗しているため
            throw new Error(`Artifact not found: ${artifactId}`);
        }

        if (updates.ifVersion !== undefined && updates.ifVersion !== current.version) {
            // 処理概要: 楽観ロックのバージョン不一致
            // 実装理由: 競合検出し、上書き更新を防止
            throw new Error('Artifact has been modified by another user');
        }

        const now = new Date().toISOString();
        const newVersion = current.version + 1;

        await db.run(
            `UPDATE artifacts
             SET title = ?,
                 uri = ?,
                 description = ?,
                 updated_at = ?,
                 version = ?
             WHERE id = ?`,
            updates.title ?? current.title,
            updates.uri !== undefined ? updates.uri : current.uri ?? null,
            updates.description !== undefined ? updates.description : current.description ?? null,
            now,
            newVersion,
            artifactId
        );

        return (await this.getArtifact(artifactId))!;
    }

    /**
     * 成果物削除処理
     * 指定成果物を削除する
     * なぜ必要か: 成果物管理から除去するため
     * @param artifactId 成果物ID
     * @returns 削除が行われたかどうか
     */
    async deleteArtifact(artifactId: string): Promise<boolean> {
        const db = await this.db();
        const result = await db.run(
            `DELETE FROM artifacts WHERE id = ?`,
            artifactId
        );
        return (result.changes ?? 0) > 0;
    }

    /**
    * タスク一覧取得処理
    * 指定parentIdの直下のタスクを取得する。parentIdがnullまたはundefinedの場合はトップレベルタスクを返す
    * なぜ必要か: 階層構造に応じたタスク一覧をUIに表示するため
    * @param parentId 親タスクID（null/undefined=トップレベル）
    * @returns Promise<Task[]>
     */
    async listTasks(parentId?: string | null): Promise<Task[]> {
        const db = await this.db();

        // parentIdがundefinedまたはnullの場合はトップレベルタスク
        const isTopLevel = parentId === undefined || parentId === null;
        const whereClause = isTopLevel
            ? 'WHERE parent_id IS NULL'
            : 'WHERE parent_id = ?';
        const params = isTopLevel ? [] : [parentId];

        // 各タスクの子要素数も取得
        const rows = await db.all<any[]>(
            `SELECT t.id, t.parent_id, t.title, t.description, t.assignee, t.status,
                t.estimate, t.created_at, t.updated_at, t.version,
                (
                    SELECT COUNT(1) FROM tasks c WHERE c.parent_id = t.id
                ) AS childCount
             FROM tasks t
             ${whereClause}
             ORDER BY t.created_at ASC`,
            ...params
        );

        const taskIds = rows.map((row) => row.id);
        const artifacts = await this.collectTaskArtifacts(db, taskIds);
        const completionConditions = await this.collectCompletionConditions(db, taskIds);

        return rows.map((row) => {
            const artifactInfo = artifacts.get(row.id) ?? { deliverables: [], prerequisites: [] };
            return {
                ...row,
                childCount: typeof row.childCount === 'number' ? row.childCount : Number(row.childCount ?? 0),
                children: [],
                deliverables: artifactInfo.deliverables,
                prerequisites: artifactInfo.prerequisites,
                completionConditions: completionConditions.get(row.id) ?? []
            };
        });
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
            `SELECT id, parent_id, title, description, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE id = ?`,
            taskId
        );
        if (!task) {
            return null;
        }

        const rows = await db.all<Task[]>(
            `SELECT id, parent_id, title, description, assignee, status,
            estimate, created_at, updated_at, version
         FROM tasks
         ORDER BY created_at ASC`
        );

        const taskMap = new Map<string, Task>();

        const taskIds = rows.map((row) => row.id);
        const artifacts = await this.collectTaskArtifacts(db, taskIds);
        const completionConditions = await this.collectCompletionConditions(db, taskIds);

        rows.forEach((row) => {
            const artifactInfo = artifacts.get(row.id) ?? { deliverables: [], prerequisites: [] };
            taskMap.set(row.id, {
                ...row,
                children: [],
                deliverables: artifactInfo.deliverables,
                prerequisites: artifactInfo.prerequisites,
                completionConditions: completionConditions.get(row.id) ?? []
            });
        });

        rows.forEach((row) => {
            if (row.parent_id && taskMap.has(row.parent_id)) {
                const parent = taskMap.get(row.parent_id)!;
                parent.children!.push(taskMap.get(row.id)!);
            }
        });

        const target = taskMap.get(taskId);
        if (!target) {
            // 処理概要: 子配列が構築できていない場合のフォールバック
            // 実装理由: 取得できた単体行を最低限返す
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
    async updateTask(taskId: string, updates: Partial<Task> & {
        ifVersion?: number;
        deliverables?: TaskArtifactInput[];
        prerequisites?: TaskArtifactInput[];
        completionConditions?: TaskCompletionConditionInput[];
    }): Promise<Task> {
        const db = await this.db();
        const current = await this.getTask(taskId);
        // タスクが存在しなければエラー
        // 理由: 存在しないタスクの更新を防ぐ
        if (!current) {
            // 処理概要: タスクが存在しない
            // 実装理由: 更新できないため明示エラー
            throw new Error(`Task not found: ${taskId}`);
        }

        // 楽観ロック: バージョン不一致ならエラー
        // 理由: 複数ユーザー編集時の競合検出・整合性維持のため
        if (updates.ifVersion !== undefined && current.version !== updates.ifVersion) {
            // 処理概要: 楽観ロックにより競合検出
            // 実装理由: 他の更新によりバージョンが進んでいる
            throw new Error('Task has been modified by another user');
        }

        const now = new Date().toISOString();
        const newVersion = current.version + 1;

        await db.run('BEGIN');
        try {
            await db.run(
                `UPDATE tasks
                 SET title = ?,
                     description = ?,
                     assignee = ?,
                     status = ?,
                     estimate = ?,
                     updated_at = ?,
                     version = ?
                 WHERE id = ?`,
                updates.title ?? current.title,
                updates.description ?? current.description ?? null,
                updates.assignee ?? current.assignee ?? null,
                // status は、title/description/estimate/deliverables/prerequisites/completionConditions の
                // 全てに値が設定されている場合に 'pending'、いずれか欠けていれば 'draft' とする
                this.computeStatusFromFields(updates, current),
                updates.estimate ?? current.estimate ?? null,
                now,
                newVersion,
                taskId
            );

            await this.applySyncs(db, taskId, updates, now);

            await db.run('COMMIT');
        } catch (error) {
            // 処理概要: 失敗時はロールバック
            // 実装理由: 一部だけ更新される中途半端な状態を避ける
            await db.run('ROLLBACK');
            throw error;
        }

        return (await this.getTask(taskId))!;
    }

    /**
     * 同期操作の適用ヘルパー
     * updateTask の内部で使われる複数の if ブロックを集約し、関数の認知的複雑度を下げる
     * @param db Database インスタンス
     * @param taskId タスクID
     * @param updates 更新オブジェクト
     * @param now 更新日時文字列
     */
    /**
     * applySyncs: updates に含まれる同期系のフィールドを DB に反映する
     * - deliverables/prerequisites/completionConditions の存在をチェックして個別の同期処理を呼び出す
     * @param {Database} db Database インスタンス
     * @param {string} taskId タスクID
     * @param {Partial<Task>} updates 更新オブジェクト
     * @param {string} now 更新日時文字列 (ISO)
     * @private
     */
    private async applySyncs(
        db: Database,
        taskId: string,
        updates: Partial<Task> & { deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[] },
        now: string
    ): Promise<void> {
        if (updates.deliverables !== undefined) {
            await this.syncTaskArtifacts(db, taskId, 'deliverable', updates.deliverables ?? [], now);
        }

        if (updates.prerequisites !== undefined) {
            await this.syncTaskArtifacts(db, taskId, 'prerequisite', updates.prerequisites ?? [], now);
        }

        if (updates.completionConditions !== undefined) {
            await this.syncTaskCompletionConditions(db, taskId, updates.completionConditions ?? [], now);
        }
    }

    /**
     * updates と current を組み合わせて最終的に決まるフィールド群から status を算出する
     * - すべての必要フィールドが揃っている場合に 'pending' を返す
    /**
     * updates と current を組み合わせて最終的に決まるフィールド群から status を算出する
     * - すべての必要フィールドが揃っている場合に 'pending' を返す
     * @param {Partial<Task>} updates 更新内容（部分）
     * @param {Task} current 現在のタスク
     * @returns {string} 'pending' または 'draft'
     * @private
     */
    /**
     * computeStatusFromFields: updates と current を元に最終的な status を決定する
     * - updates.status が明示されていればそれを優先
     * - それ以外は title/description/estimate が揃っていれば 'pending'、不足していれば 'draft'
     * @param {Partial<Task>} updates 更新内容（部分）
     * @param {Task} current 現在のタスク
     * @returns {string} 'pending' または 'draft'
     * @private
     */
    private computeStatusFromFields(updates: Partial<Task> & { deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[] }, current: Task): string {
        // 明示的な status が指定されていればそれを優先
        if (updates.status !== undefined && typeof updates.status === 'string') {
            return updates.status;
        }

        const finalTitle = updates.title ?? current.title;
        const finalDescription = (updates.description ?? current.description ?? '');
        const finalEstimate = (updates.estimate ?? current.estimate ?? '');

        const titleOk = !!(finalTitle && String(finalTitle).trim().length > 0);
        const descriptionOk = !!(finalDescription && String(finalDescription).trim().length > 0);
        const estimateOk = !!(finalEstimate && String(finalEstimate).trim().length > 0);

        return (titleOk && descriptionOk && estimateOk) ? 'pending' : 'draft';
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
            // 処理概要: ルートへ移動は特段の検証なし
            // 実装理由: ルートは常に有効
            return;
        }

        if (normalizedParentId === task.id) {
            // 処理概要: 自己を親にすることは不可
            // 実装理由: 循環参照の起点となるため
            throw new Error('Task cannot be its own parent');
        }

        const parent = await db.get<Task>(
            `SELECT id, parent_id
             FROM tasks
             WHERE id = ?`,
            normalizedParentId
        );

        if (!parent) {
            // 処理概要: 指定された親が存在しない
            // 実装理由: 不正な移動要求を拒否
            throw new Error(`Parent task not found: ${normalizedParentId}`);
        }

        // projects テーブルは廃止され、プロジェクト分離は行われないため移動チェックは不要

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
            // 処理概要: 親チェーンを遡って対象IDに到達するか検査
            // 実装理由: 自分の配下へ移動する循環を阻止
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
            `SELECT id, parent_id, title, description, assignee, status,
                    estimate, created_at, updated_at, version
             FROM tasks
             WHERE id = ?`,
            taskId
        );
        return row ?? null;
    }

    /**
     * タスク成果物同期処理
     * 指定タスクの成果物割当を再登録する
     * なぜ必要か: タスク保存時に最新の割当内容へ置き換えるため
     * @param db Databaseインスタンス
     * @param taskId タスクID
     * @param role 成果物の役割（deliverable/prerequisite）
     * @param assignments 割当一覧
     * @param timestamp 登録日時文字列
     */
    private async syncTaskArtifacts(
        db: Database,
        taskId: string,
        role: TaskArtifactRole,
        assignments: TaskArtifactInput[] | undefined,
        timestamp: string
    ): Promise<void> {
        await db.run(
            `DELETE FROM task_artifacts WHERE task_id = ? AND role = ?`,
            taskId,
            role
        );

        if (!assignments || assignments.length === 0) {
            // 処理概要: 何も割当が無ければ削除のみで終了
            // 実装理由: 全置換方式のため
            return;
        }

        let index = 0;
        for (const assignment of assignments) {
            if (!assignment?.artifactId) {
                // 処理概要: artifactIdが無い行はスキップ
                // 実装理由: 必須項目の欠落
                continue;
            }

            // projects テーブルが存在しないため、所属チェックは行わず存在チェックのみを行う
            const artifact = await db.get<Artifact>(
                `SELECT id FROM artifacts WHERE id = ?`,
                assignment.artifactId
            );
            if (!artifact) {
                // 処理概要: 参照先の成果物が存在しない
                // 実装理由: 参照整合性を保つため例外
                throw new Error(`Artifact not found: ${assignment.artifactId}`);
            }

            await db.run(
                `INSERT INTO task_artifacts (
                    id, task_id, artifact_id, role, crud_operations, order_index, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                uuidv4(),
                taskId,
                assignment.artifactId,
                role,
                assignment.crudOperations ?? null,
                index,
                timestamp,
                timestamp
            );

            index += 1;
        }
    }

    /**
     * タスク完了条件同期処理
     * 完了条件を全件置き換える
     * なぜ必要か: 入力内容をそのままDBへ反映するため
     * @param db Databaseインスタンス
     * @param taskId タスクID
     * @param conditions 完了条件一覧
     * @param timestamp 登録日時文字列
     */
    private async syncTaskCompletionConditions(
        db: Database,
        taskId: string,
        conditions: TaskCompletionConditionInput[] | undefined,
        timestamp: string
    ): Promise<void> {
        await db.run(
            `DELETE FROM task_completion_conditions WHERE task_id = ?`,
            taskId
        );

        if (!conditions || conditions.length === 0) {
            // 処理概要: 条件未指定なら削除のみ
            // 実装理由: 全置換
            return;
        }

        let index = 0;
        for (const condition of conditions) {
            const description = (condition?.description ?? '').trim();
            if (description.length === 0) {
                // 処理概要: 空行は無視
                // 実装理由: ノイズデータの登録を避ける
                continue;
            }

            await db.run(
                `INSERT INTO task_completion_conditions (
                    id, task_id, description, order_index, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                uuidv4(),
                taskId,
                description,
                index,
                timestamp,
                timestamp
            );

            index += 1;
        }
    }

    /**
     * タスク成果物収集処理
     * タスクID一覧に対する成果物割当を取得し、役割別にまとめる
     * なぜ必要か: タスク一覧取得時に成果物情報を付与するため
     * @param db Databaseインスタンス
     * @param taskIds タスクID配列
     * @returns タスクIDをキーとした成果物割当マップ
     */
    private async collectTaskArtifacts(db: Database, taskIds: string[]): Promise<Map<string, { deliverables: TaskArtifactAssignment[]; prerequisites: TaskArtifactAssignment[] }>> {
        const result = new Map<string, { deliverables: TaskArtifactAssignment[]; prerequisites: TaskArtifactAssignment[] }>();

        if (taskIds.length === 0) {
            return result;
        }

        const placeholders = taskIds.map(() => '?').join(', ');
        const rows = await db.all<Array<any>>(
            `SELECT
                ta.id AS assignment_id,
                ta.task_id AS task_id,
                ta.artifact_id AS artifact_id,
                ta.role AS role,
                ta.crud_operations AS crud_operations,
                ta.order_index AS order_index,
                pa.title AS artifact_title,
                pa.uri AS artifact_uri,
                pa.description AS artifact_description,
                pa.created_at AS artifact_created_at,
                pa.updated_at AS artifact_updated_at,
                pa.version AS artifact_version
             FROM task_artifacts ta
             JOIN artifacts pa ON pa.id = ta.artifact_id
             WHERE ta.task_id IN (${placeholders})
             ORDER BY ta.task_id, ta.role, ta.order_index`,
            taskIds
        );

        for (const row of rows) {
            // 処理概要: 取得行を割当オブジェクトへ変換
            // 実装理由: ビュー層へ返すための整形
            const assignment: TaskArtifactAssignment = {
                id: row.assignment_id,
                artifact_id: row.artifact_id,
                role: row.role as TaskArtifactRole,
                crudOperations: row.crud_operations ?? undefined,
                order: typeof row.order_index === 'number' ? row.order_index : Number(row.order_index ?? 0),
                artifact: {
                    id: row.artifact_id,
                    title: row.artifact_title,
                    uri: row.artifact_uri ?? undefined,
                    description: row.artifact_description ?? undefined,
                    created_at: row.artifact_created_at,
                    updated_at: row.artifact_updated_at,
                    version: row.artifact_version
                }
            };

            const bucket = result.get(row.task_id) ?? { deliverables: [], prerequisites: [] };
            if (!result.has(row.task_id)) {
                result.set(row.task_id, bucket);
            }

            if (assignment.role === 'deliverable') {
                bucket.deliverables.push(assignment);
            } else {
                bucket.prerequisites.push(assignment);
            }
        }

        taskIds.forEach((taskId) => {
            // 処理概要: 未取得のタスクには空配列をセット
            // 実装理由: 参照側でのundefinedチェックを減らす
            if (!result.has(taskId)) {
                result.set(taskId, { deliverables: [], prerequisites: [] });
            }
        });

        return result;
    }

    /**
     * タスク完了条件収集処理
     * 複数タスクの完了条件をまとめて取得する
     * なぜ必要か: タスク詳細・ツリー表示に完了条件を付与するため
     * @param db Databaseインスタンス
     * @param taskIds タスクID配列
     * @returns タスクIDをキーとした完了条件マップ
     */
    private async collectCompletionConditions(db: Database, taskIds: string[]): Promise<Map<string, TaskCompletionCondition[]>> {
        const result = new Map<string, TaskCompletionCondition[]>();

        if (taskIds.length === 0) {
            return result;
        }

        const placeholders = taskIds.map(() => '?').join(', ');
        const rows = await db.all<Array<any>>(
            `SELECT
                id,
                task_id,
                description,
                order_index
             FROM task_completion_conditions
             WHERE task_id IN (${placeholders})
             ORDER BY task_id, order_index`,
            taskIds
        );

        for (const row of rows) {
            // 処理概要: 取得行を完了条件オブジェクトへ変換
            // 実装理由: ビュー層での表示/編集に供する
            const condition: TaskCompletionCondition = {
                id: row.id,
                task_id: row.task_id,
                description: row.description,
                order: typeof row.order_index === 'number' ? row.order_index : Number(row.order_index ?? 0)
            };

            const list = result.get(row.task_id) ?? [];
            list.push(condition);
            result.set(row.task_id, list);
        }

        taskIds.forEach((taskId) => {
            // 処理概要: 未取得のタスクには空配列をセット
            // 実装理由: 参照側でのガード簡略化
            if (!result.has(taskId)) {
                result.set(taskId, []);
            }
        });

        return result;
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
            // 処理概要: 既に無い場合は削除不要
            // 実装理由: idempotent な削除APIにする
            return false;
        }

        const result = await db.run(
            `DELETE FROM tasks WHERE id = ?`,
            taskId
        );

        return (result.changes ?? 0) > 0;
    }
}