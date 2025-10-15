// Temporary in-memory database for MCP server testing
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sqlite';
import { TaskService } from './services/TaskService';
import * as ArtifactRepo from './repositories/ArtifactRepository';
import { resolveDatabasePath as defaultResolveDatabasePath, getDatabase as defaultGetDatabase, initializeDatabase as defaultInitializeDatabase, closeAndClearDatabase as defaultCloseAndClearDatabase } from './db/DatabaseManager';

import type {
    TaskArtifactRole as CommonTaskArtifactRole,
    Artifact as CommonArtifact,
    TaskArtifactAssignment as CommonTaskArtifactAssignment,
    TaskCompletionCondition as CommonTaskCompletionCondition,
    Task as CommonTask
} from '../extension/types';

export type TaskArtifactRole = CommonTaskArtifactRole;

export interface Artifact extends CommonArtifact {
    created_at: string;
    updated_at: string;
    version: number;
}

export interface TaskArtifactAssignment extends CommonTaskArtifactAssignment {
    id: string;
    artifact_id: string;
    crudOperations?: string | null;
    order: number;
    artifact: Artifact;
}

export interface TaskCompletionCondition extends CommonTaskCompletionCondition {
    id: string;
    task_id: string;
    order: number;
}

interface TaskArtifactInput {
    artifactId: string;
    crudOperations?: string | null;
}

interface TaskCompletionConditionInput {
    description: string;
}

export interface Task extends CommonTask {
    created_at: string;
    updated_at: string;
    version: number;
    children?: Task[];
    deliverables?: TaskArtifactAssignment[];
    prerequisites?: TaskArtifactAssignment[];
    completionConditions?: TaskCompletionCondition[];
}

// DB 管理は src/mcpServer/db/DatabaseManager に移譲しています

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
/**
 * Resolve database path (delegated to DatabaseManager)
 * @returns {string} path to DB file
 */
export const resolveDatabasePath = defaultResolveDatabasePath;

// Note: DB path is resolved dynamically inside getDatabase to support per-test overrides of WBS_MCP_DATA_DIR

/**
 * データベース取得処理
 * DBファイルがなければ作成し、Databaseインスタンスを返す
 * なぜ必要か: DB初期化・多重生成防止・全DB操作の共通入口とするため
 * @returns Promise<Database>
 */
/**
 * Get Database instance (delegated to DatabaseManager)
 * @returns {Promise<Database>}
 */
async function getDatabase(): Promise<Database> {
    return defaultGetDatabase();
}

/**
 * データベース初期化処理
 * 必要なテーブルを作成し、初期データを投入する
 * なぜ必要か: サーバ起動時にDBスキーマ・サンプルデータを自動生成するため
 */
/**
 * Initialize the database schema (delegated to DatabaseManager)
 * @returns {Promise<void>}
 */
export async function initializeDatabase(): Promise<void> {
    return defaultInitializeDatabase();
}

/**
 * Close and clear DB cache (delegated to DatabaseManager)
 * @returns {Promise<void>}
 */
export async function closeAndClearDatabase(): Promise<void> {
    return defaultCloseAndClearDatabase();
}


/**
 * WBSリポジトリクラス
 * プロジェクト・タスクのDB操作を提供する
 * なぜ必要か: DBアクセスを集約し、サーバ本体から分離・再利用性を高めるため
 */
// Exported functional API (no wrapper): callers should use these top-level functions

/**
 * Create a task and return the created Task object
 */
/**
 * タスクを作成して作成後の Task オブジェクトを返します。
 * @param {string} title タスク名
 * @param {string} [description] タスク説明
 * @param {string|null} [parentId] 親タスクID（null = ルート）
 * @param {string|null} [assignee] 担当者
 * @param {string|null} [estimate] 見積り
 * @param {{deliverables?: TaskArtifactInput[], prerequisites?: TaskArtifactInput[], completionConditions?: TaskCompletionConditionInput[]}} [options] 付随情報
 * @param {TaskArtifactInput[]} [options.deliverables]
 * @param {TaskArtifactInput[]} [options.prerequisites]
 * @param {TaskCompletionConditionInput[]} [options.completionConditions]
 * @returns {Promise<Task>} 作成されたタスク
 */
export async function createTask(
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
    const db = await getDatabase();
    const svc = new TaskService(db);
    const id = await svc.createTask(title, description, parentId, assignee, estimate, options);
    return (await getTask(id))!;
}

/**
 * 複数タスクを一括作成します。
 * @param {Array<any>} tasksTasks タスク定義の配列（各要素は少なくとも title を持つオブジェクト）
 * @param {Object} [options]
 * @returns {Promise<Task[]>} 作成されたタスク配列
 */
export async function importTasks(tasksTasks: Array<any>): Promise<Task[]> {
    const created: Task[] = [];
    for (const t of tasksTasks || []) {
        if (!t || !t.title) continue;
        const task = await createTask(
            t.title,
            t.description ?? '',
            t.parentId ?? null,
            t.assignee ?? null,
            t.estimate ?? null,
            {
                deliverables: Array.isArray(t.deliverables) ? t.deliverables.map((d: any) => ({ artifactId: d.artifactId, crudOperations: d.crudOperations ?? d.crud ?? null })) : [],
                prerequisites: Array.isArray(t.prerequisites) ? t.prerequisites.map((p: any) => ({ artifactId: p.artifactId, crudOperations: p.crudOperations ?? null })) : [],
                completionConditions: Array.isArray(t.completionConditions) ? t.completionConditions.filter((c: any) => typeof c?.description === 'string' && c.description.trim().length > 0).map((c: any) => ({ description: c.description.trim() })) : []
            }
        );
        created.push(task);
    }
    return created;
}

/**
 * 成果物一覧を返します。
 * @returns {Promise<Artifact[]>} 成果物配列
 */
export async function listArtifacts(): Promise<Artifact[]> {
    const db = await getDatabase();
    return ArtifactRepo.listArtifacts(db) as Promise<Artifact[]>;
}

/**
 * 指定IDの成果物を取得します。
 * @param {string} artifactId 成果物ID
 * @returns {Promise<Artifact|null>} 成果物（存在しない場合は null）
 */
export async function getArtifact(artifactId: string): Promise<Artifact | null> {
    const db = await getDatabase();
    return ArtifactRepo.getArtifact(db, artifactId) as Promise<Artifact | null>;
}

/**
 * 新しい成果物を作成します。
 * @param {string} title 成果物名
 * @param {string} [uri] 関連 URI
 * @param {string} [description] 説明
 * @returns {Promise<Artifact>} 作成された成果物
 */
export async function createArtifact(title: string, uri?: string, description?: string): Promise<Artifact> {
    const db = await getDatabase();
    return ArtifactRepo.createArtifact(db, title, uri, description) as Promise<Artifact>;
}

/**
 * 成果物を更新します（楽観ロック対応）。
 * @param {string} artifactId 成果物ID
 * @param {{title?: string, uri?: string|null, description?: string|null, ifVersion?: number}} updates 更新内容
 * @param {string} [updates.title] 更新後タイトル
 * @param {string|null} [updates.uri] 更新後URI
 * @param {string|null} [updates.description] 更新後説明
 * @param {number} [updates.ifVersion] 楽観ロック用バージョン
 * @returns {Promise<Artifact>} 更新後の成果物
 */
export async function updateArtifact(artifactId: string, updates: { title?: string; uri?: string | null; description?: string | null; ifVersion?: number }): Promise<Artifact> {
    const db = await getDatabase();
    return ArtifactRepo.updateArtifact(db, artifactId, updates) as Promise<Artifact>;
}

/**
 * 成果物を削除します。
 * @param {string} artifactId 成果物ID
 * @returns {Promise<boolean>} 削除された場合は true
 */
export async function deleteArtifact(artifactId: string): Promise<boolean> {
    const db = await getDatabase();
    return ArtifactRepo.deleteArtifact(db, artifactId);
}

/**
 * 指定親の直下タスクを一覧で返します（parentId が未指定または null の場合はトップレベル）
 * @param {string|null} [parentId] 親タスクID
 * @returns {Promise<Task[]>} タスク配列
 */
export async function listTasks(parentId?: string | null): Promise<Task[]> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.listTasks(parentId) as Promise<Task[]>;
}

/**
 * 指定タスク（子孫を含むツリー構造）を取得します。
 * @param {string} taskId タスクID
 * @returns {Promise<Task|null>} タスク（存在しない場合は null）
 */
export async function getTask(taskId: string): Promise<Task | null> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.getTask(taskId) as Promise<Task | null>;
}

/**
 * タスクを更新します。
 * @param {string} taskId タスクID
 * @param {Partial<Task> & {ifVersion?:number, deliverables?:TaskArtifactInput[], prerequisites?:TaskArtifactInput[], completionConditions?:TaskCompletionConditionInput[]}} updates 更新内容
 * @returns {Promise<Task>} 更新後のタスク
 */
export async function updateTask(taskId: string, updates: Partial<Task> & { ifVersion?: number; deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[]; }): Promise<Task> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.updateTask(taskId, updates) as Promise<Task>;
}


/**
 * タスクの親を変更します。
 * @param {string} taskId タスクID
 * @param {string|null} newParentId 新しい親タスクID（null = ルート）
 * @returns {Promise<Task>} 更新後のタスク
 */
export async function moveTask(taskId: string, newParentId: string | null): Promise<Task> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.moveTask(taskId, newParentId) as Promise<Task>;
}

/**
 * タスクを削除します。
 * @param {string} taskId タスクID
 * @returns {Promise<boolean>} 削除された場合は true
 */
export async function deleteTask(taskId: string): Promise<boolean> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.deleteTask(taskId);
}