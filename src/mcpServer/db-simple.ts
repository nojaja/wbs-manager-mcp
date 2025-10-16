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
 * 処理名: データベースパス解決 (resolveDatabasePath)
 * 概要: データディレクトリおよびDBファイルの絶対パスを決定して返します。
 * 実装理由: ワークスペースやテストごとに独立したDBファイル配置を安全に行うために、
 *           ベースディレクトリの解決ロジックを一元化する必要があるため。
 *
 * 挙動の詳細:
 * - 環境変数 `WBS_MCP_DATA_DIR` が設定されていればそれを基準とする
 * - 絶対パスはそのまま利用し、相対パスはプロセス作業ディレクトリを基準に解釈する
 *
 * @returns {string} データベースファイルのパス
 */
export const resolveDatabasePath = defaultResolveDatabasePath;

// Note: DB path is resolved dynamically inside getDatabase to support per-test overrides of WBS_MCP_DATA_DIR

/**
 * 処理名: データベース取得 (getDatabase)
 * 概要: SQLite の Database インスタンスを返します。存在しない場合は初期化処理を呼び出して作成します。
 * 実装理由: DB の生成・初期化・キャッシュを一箇所で管理することで、多重生成や初期化漏れを防ぎ、
 *           呼び出し側をシンプルに保つため。
 *
 * @returns {Promise<Database>} 初期化済みの Database インスタンス
 */
async function getDatabase(): Promise<Database> {
    return defaultGetDatabase();
}

/**
 * 処理名: データベース初期化 (initializeDatabase)
 * 概要: 必要なテーブルや初期データを作成し、DB を使用可能な状態にします。
 * 実装理由: テストやローカル実行で期待されるスキーマが存在することを保証し、
 *           手動でスキーマを用意する手間を省くため。
 *
 * @returns {Promise<void>}
 */
export async function initializeDatabase(): Promise<void> {
    return defaultInitializeDatabase();
}

/**
 * 処理名: データベース終了・キャッシュクリア (closeAndClearDatabase)
 * 概要: オープンしている DB 接続を閉じ、キャッシュや一時ファイルをクリアします。
 * 実装理由: テストやサーバ停止時に接続リークや状態の残存を防ぎ、次回起動時にクリーンな状態を保証するため。
 *
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
 * 処理名: タスク作成 (createTask)
 * 概要: タイトルや説明、親情報・担当者などのメタ情報を受け取り、新しいタスクをデータベースに作成して作成済みの Task オブジェクトを返します。
 * 実装理由: タスク作成のビジネスロジック（ID 生成、関連成果物割当、バージョン管理など）をサーバ側で一元化し、
 *           クライアント・テストから簡潔にタスク作成を行えるようにするため。
 *
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
 * 処理名: タスク一括インポート (importTasks)
 * 概要: 複数のタスク定義オブジェクトの配列を受け取り、順に createTask を呼び出してタスクを作成します。戻り値として作成済みタスクの配列を返します。
 * 実装理由: 外部からのタスクバルク登録（JSON インポートやテストデータ準備）を簡単に行えるようにするため。個別作成ロジックを再利用します。
 *
 * @param {Array<any>} tasksTasks タスク定義の配列（各要素は少なくとも title を持つオブジェクト）
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
 * 処理名: 成果物一覧取得 (listArtifacts)
 * 概要: データベースに登録された全成果物の配列を返します。
 * 実装理由: クライアント表示や他処理から利用するために、成果物一覧を取得する共通 API を提供するため。
 *
 * @returns {Promise<Artifact[]>} 成果物配列
 */
export async function listArtifacts(): Promise<Artifact[]> {
    const db = await getDatabase();
    return ArtifactRepo.listArtifacts(db) as Promise<Artifact[]>;
}

/**
 * 処理名: 成果物取得 (getArtifact)
 * 概要: 指定した成果物ID に紐づく成果物を返します。存在しない場合は null を返します。
 * 実装理由: 単一成果物の表示・編集・参照処理で一貫した取得方法を提供するため。
 *
 * @param {string} artifactId 成果物ID
 * @returns {Promise<Artifact|null>} 成果物（存在しない場合は null）
 */
export async function getArtifact(artifactId: string): Promise<Artifact | null> {
    const db = await getDatabase();
    return ArtifactRepo.getArtifact(db, artifactId) as Promise<Artifact | null>;
}

/**
 * 処理名: 成果物作成 (createArtifact)
 * 概要: タイトル・URI・説明を受け取り、新規成果物を DB に作成して返します。
 * 実装理由: 成果物管理の基本 CRUD の Create 処理を提供し、他機能が統一的に成果物を生成できるようにするため。
 *
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
 * 処理名: 成果物更新 (updateArtifact)
 * 概要: 指定した成果物のフィールドを更新します。`ifVersion` による楽観ロックに対応しています。
 * 実装理由: 競合更新を防ぎつつ成果物情報を更新するために、バージョンチェックを含む更新ロジックを提供する必要があるため。
 *
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
 * 処理名: 成果物削除 (deleteArtifact)
 * 概要: 指定した成果物をデータベースから削除します。削除に成功すれば true を返します。
 * 実装理由: 成果物のライフサイクル管理の一環として、利用されなくなった成果物を安全に削除する必要があるため。
 *
 * @param {string} artifactId 成果物ID
 * @returns {Promise<boolean>} 削除された場合は true
 */
export async function deleteArtifact(artifactId: string): Promise<boolean> {
    const db = await getDatabase();
    return ArtifactRepo.deleteArtifact(db, artifactId);
}

/**
 * 処理名: タスク一覧取得 (listTasks)
 * 概要: 指定した親タスク直下の子タスク一覧を返します。parentId が未指定または null の場合はトップレベルタスクを返します。
 * 実装理由: ツリー表示や子タスク列挙の共通呼び出し口が必要であり、クライアントや他サービスから簡単に参照できるようにするため。
 *
 * @param {string|null} [parentId] 親タスクID
 * @returns {Promise<Task[]>} タスク配列
 */
export async function listTasks(parentId?: string | null): Promise<Task[]> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.listTasks(parentId) as Promise<Task[]>;
}

/**
 * 処理名: タスク取得 (getTask)
 * 概要: 指定したタスクID のタスクを、子孫を含むツリー構造で返します。存在しない場合は null を返します。
 * 実装理由: タスク詳細表示やサブタスクを含む編集処理で一貫したデータ構造を取得するため。
 *
 * @param {string} taskId タスクID
 * @returns {Promise<Task|null>} タスク（存在しない場合は null）
 */
export async function getTask(taskId: string): Promise<Task | null> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.getTask(taskId) as Promise<Task | null>;
}

/**
 * 処理名: タスク更新 (updateTask)
 * 概要: 指定したタスクの属性や関連情報（成果物割当や完了条件など）を更新し、更新後の Task を返します。ifVersion による楽観ロックをサポートします。
 * 実装理由: 競合を抑えつつタスク情報を変更できる統一 API を提供し、関連エンティティとの整合性を維持するため。
 *
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
 * 処理名: タスク移動 (moveTask)
 * 概要: 指定タスクの親を変更し、移動後のタスク情報を返します。
 * 実装理由: タスクの階層構造を編集（ドラッグ＆ドロップ等）する際に、親子関係の更新を安全に行うため。
 *
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
 * 処理名: タスク削除 (deleteTask)
 * 概要: 指定したタスクをデータベースから削除します。削除に成功すれば true を返します。
 * 実装理由: 不要になったタスクのライフサイクル管理のため、削除処理を提供する必要があるため。
 *
 * @param {string} taskId タスクID
 * @returns {Promise<boolean>} 削除された場合は true
 */
export async function deleteTask(taskId: string): Promise<boolean> {
    const db = await getDatabase();
    const svc = new TaskService(db);
    return svc.deleteTask(taskId);
}