import { v4 as uuidv4 } from 'uuid';
import type { Database } from '../db/connection';
import type {
  Task,
  TaskArtifactInput,
  TaskCompletionConditionInput,
  TaskDependenciesInput
} from '../db/types';
import { TaskArtifactRepository } from './TaskArtifactRepository';
import { CompletionConditionRepository } from './CompletionConditionRepository';
import { DependenciesRepository } from './DependenciesRepository';
import { getDatabase } from '../db/connection';

/**
 * 処理名: TaskRepository（タスク永続化レイヤ）
 * 処理概要: タスクの CRUD、一覧取得、移動、インポート等の DB 操作を提供するリポジトリクラス
 * 実装理由: データアクセスを一元化して、ビジネスロジックと DB 操作を分離し、テストやメンテナンスを容易にするため
 * @class
 */
export class TaskRepository {
  private readonly taskArtifactRepo = new TaskArtifactRepository();
  private readonly completionConditionRepo = new CompletionConditionRepository();
  private readonly dependenciesRepo = new DependenciesRepository();

  /**
   * 処理名: コンストラクタ
   * 処理概要: TaskRepository のインスタンスを構築する
   * 実装理由: リポジトリ内部で使用するサブリポジトリを初期化するため
   * @returns {void}
   */
  constructor() { }

  /**
   * 処理名: DB 取得ユーティリティ
   * 処理概要: Connection モジュールから Database インスタンスの Promise を取得するラッパ
   * 実装理由: 各メソッドで直接 getDatabase() を呼ぶ代わりに抽象化して将来的な差し替えを容易にするため
   * @returns {Promise<Database>} Database instance
   */
  private async db(): Promise<Database> {
    return getDatabase();
  }

  /**
   * 処理名: タスク作成
   * 処理概要: 指定されたフィールドとオプション（deliverables/prerequisites/completionConditions）を用いてタスクを DB に作成する。トランザクション内で関連テーブルも同期する。
   * 実装理由: タスク作成時に関連するアーティファクト割当や完了条件も同時に整合性を保って保存する必要があるため、単一の原子的操作として提供する。
   * @param {string} title Task title
   * @param {string} [description]
   * @param {string|null} [parentId]
   * @param {string|null} [assignee]
   * @param {string|null} [estimate]
   * @param {{dependencies?:TaskDependenciesInput[],artifacts?:TaskArtifactInput[],completionConditions?:TaskCompletionConditionInput[]}} [options]
   * @param {TaskDependenciesInput[]} [options.dependencies] 依存関係タスクの配列
   * @param {TaskArtifactInput[]} [options.artifacts] アーティファクトの配列
   * @param {TaskCompletionConditionInput[]} [options.completionConditions] 完了条件の配列
   * @returns {Promise<Task>} Created task
   */
  async createTask(
    title: string,
    description: string = '',
    parentId: string | null = null,
    assignee: string | null = null,
    estimate: string | null = null,
    options?: {
      dependencies?: TaskDependenciesInput[];
      artifacts?: TaskArtifactInput[];
      completionConditions?: TaskCompletionConditionInput[];
    }
  ): Promise<Task> {
    const db = await this.db();
    const id = uuidv4();
    const now = new Date().toISOString();
    const hasTitle = !!(title && title.toString().trim().length > 0);
    const hasDescription = !!(description && description.toString().trim().length > 0);
    const hasEstimate = !!(estimate && estimate.toString().trim().length > 0);
    const allPresent = hasTitle && hasDescription && hasEstimate;
    const status = allPresent ? 'pending' : 'draft';

    await db.run('BEGIN');
    try {
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

      // 関連データをヘルパーに委譲
      await this.insertCompletionConditions(id, options?.completionConditions);
      await this.insertArtifacts(id, options?.artifacts);
      await this.insertDependencies(id, options?.dependencies);

      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }

    return (await this.getTask(id))!;
  }

  /**
   * Insert completion conditions helper
   * @param {string} taskId
   * @param {TaskCompletionConditionInput[]|undefined} conditions
   */
  private async insertCompletionConditions(taskId: string, conditions?: TaskCompletionConditionInput[]) {
    for (const cond of conditions ?? []) {
      await this.completionConditionRepo.createCompletionCondition(taskId, cond.description);
    }
  }

  /**
   * Insert artifact mappings helper
   * @param {string} taskId
   * @param {TaskArtifactInput[]|undefined} artifacts
   */
  private async insertArtifacts(taskId: string, artifacts?: TaskArtifactInput[]) {
    for (const art of artifacts ?? []) {
      await this.taskArtifactRepo.createTaskArtifactMap(taskId, art.artifactId);
    }
  }

  /**
   * Insert dependencies helper
   * @param {string} taskId
   * @param {TaskDependenciesInput[]|undefined} dependencies
   */
  private async insertDependencies(taskId: string, dependencies?: TaskDependenciesInput[]) {
    for (const dep of dependencies ?? []) {
      await this.dependenciesRepo.createDependency(taskId, dep.taskId, []);
    }
  }

  /**
   * 処理名: タスク一括インポート
   * 処理概要: プレーンなオブジェクト配列からタスクを順に作成するユーティリティ
   * 実装理由: 外部ワークスペースやテンプレートからのデータ取り込みを簡便に行うための補助機能として提供する
   * @param {Array<any>} tasksTasks Array of plain task objects
   * @returns {Promise<Task[]>} Created tasks
   */
  async importTasks(tasksTasks: Array<any>): Promise<Task[]> {
    const created: Task[] = [];
    if (!Array.isArray(tasksTasks) || tasksTasks.length === 0) return created;
    for (const t of tasksTasks) {
      const createdTask = await this.createTaskFromObject(t);
      created.push(createdTask);
    }
    return created;
  }

  /**
   * Convert a plain object to task creation call
   * @param {any} t
   * @returns {Promise<Task>}
   */
  private async createTaskFromObject(t: any): Promise<Task> {
    const title = this.stringField(t, 'title');
    const description = this.stringField(t, 'description');
    const parentId = this.stringField(t, 'parentId') || null;
    const assignee = this.stringField(t, 'assignee') || null;
    const estimate = this.stringField(t, 'estimate') || null;
    const options = {
      dependencies: this.arrayField(t, 'dependencies'),
      artifacts: this.arrayField(t, 'artifacts'),
      completionConditions: this.arrayField(t, 'completionConditions')
    };
    return await this.createTask(title, description, parentId, assignee, estimate, options as any);
  }
  /**
   * 文字列フィールド取得（安全に）
   * @param {any} obj
   * @param {string} key
   * @returns {string}
   */
  private stringField(obj: any, key: string): string {
    if (!obj) return '';
    const val = obj[key];
    return typeof val === 'string' ? val : '';
  }

  /**
   * 配列フィールド取得（存在しない場合 undefined を返す）
   * @param {any} obj
   * @param {string} key
   * @returns {any[]|undefined}
   */
  private arrayField(obj: any, key: string): any[] | undefined {
    if (!obj) return undefined;
    const val = obj[key];
    return Array.isArray(val) ? val : undefined;
  }


  /**
   * 処理名: タスク一覧取得
   * 処理概要: 親 ID によるフィルタリング（トップレベルまたは子一覧）をサポートするタスク取得処理。関連アーティファクトや完了条件も収集して返す。
   * 実装理由: UI 層が階層化されたタスクリストを表示するために、単一クエリ結果と関連情報を組み合わせた整形済みデータを提供する必要があるため
   * @param {string|null|undefined} parentId Optional parent id
   * @param {string|null|undefined} status Optional status filter (例: 'draft','pending','in-progress','completed')
   * @returns {Promise<Task[]>} Array of tasks
   */
  async listTasks(parentId?: string | null, status?: string | null): Promise<Task[]> {
    const db = await this.db();

    const isTopLevel = parentId === undefined || parentId === null;
    // Build WHERE clause with optional parent filter and optional status filter
    const clauses: string[] = [];
    const params: any[] = [];
    if (isTopLevel) clauses.push('parent_id IS NULL');
    else { clauses.push('parent_id = ?'); params.push(parentId); }
    if (status !== undefined && status !== null) { clauses.push('status = ?'); params.push(status); }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

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

    const taskPromises = rows.map(async (row: any) => {
      // 必要な ID を集めて関連データを限定取得
      const completionConditions = await this.completionConditionRepo.getCompletionConditionByTaskId(row.id);
      const dependencyIds = await this.dependenciesRepo.getDependencyByTaskId(row.id); // 依存関係情報を限定取得
      const dependeeIds = await this.dependenciesRepo.getDependeeByTaskId(row.id); // 依存関係情報を限定取得
      const artifactIds = await this.taskArtifactRepo.getArtifactIdsByTaskIds(row.id);

      return {
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        description: row.description,
        status: row.status,
        estimate: row.estimate,
        version: row.version,
        childCount: typeof row.childCount === 'number' ? row.childCount : Number(row.childCount ?? 0),
        children: [],
        dependency: dependencyIds,
        dependee: dependeeIds,
        artifact: artifactIds,
        completionConditions
      } as Task;
    });

    return await Promise.all(taskPromises);

  }


  /**
   * 処理名: タスク取得
   * 処理概要: 指定 ID のタスクを取得する
   * 実装理由: 特定のタスク情報を取得するための基本的なデータアクセス手段を提供するため
  * @param {string[]} taskIds Task id to fetch
  * @returns {Promise<Task[]>} The tasks (empty array when none found)
  */
  async getTasks(taskIds: string[]): Promise<Task[]> {
    const db = await this.db();
    const tasks = await db.all<Task[]>(
      `SELECT id, parent_id, title, description, assignee, status,
              estimate, created_at, updated_at, version
       FROM tasks
       WHERE id IN (?)`,
      taskIds
    );
    if (!tasks || tasks.length === 0) return [];

    return tasks as unknown as Task[];
  }

  /**
   * 処理名: タスク取得
   * 処理概要: 指定 ID のタスクを取得し、その直下の子タスク、関連アーティファクト割当、完了条件も含めて返す
   * 実装理由: タスク詳細表示や編集画面で、完全なタスクオブジェクトを提供するため
   * @param {string} taskId Task id to fetch
   * @returns {Promise<Task|null>} The task or null
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
    if (!task) return null;
    // ターゲットとその直下の子のみを取得してツリーを構築する（効率化）
    const childRows = await db.all<any[]>(
      `SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version
       FROM tasks
       WHERE parent_id = ?
       ORDER BY created_at ASC`,
      taskId
    );

    // 必要な ID を集めて関連データを限定取得
    const completionConditions = await this.completionConditionRepo.getCompletionConditionByTaskId(task.id);
    const dependencyIds = await this.dependenciesRepo.getDependencyByTaskId(task.id); // 依存関係情報を限定取得
    const dependeeIds = await this.dependenciesRepo.getDependeeByTaskId(task.id); // 依存関係情報を限定取得


    const artifactIds = await this.taskArtifactRepo.getArtifactIdsByTaskIds(task.id);
    const dependencyDetails = await this.getTasks(dependencyIds);
    const dependeeDetails = await this.getTasks(dependeeIds);

    const target = {
      ...task,
      children: childRows.map((row: any) => {
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          status: row.status,
          estimate: row.estimate,
          version: row.version
        } as Task;
      }),
      artifact: artifactIds,
      dependees: dependeeDetails.map(dependeeDetail => ({
        id: dependeeDetail.id,
        description: dependeeDetail.description,
        status: dependeeDetail.status,
        estimate: dependeeDetail.estimate
      })),
      dependents: dependencyDetails.map(dependencyDetail => ({
        id: dependencyDetail.id,
        description: dependencyDetail.description,
        status: dependencyDetail.status,
        estimate: dependencyDetail.estimate
      })),
      completionConditions: completionConditions.map(completionCondition => ({
        id: completionCondition.id,
        description: completionCondition.description
      }))
    };

    return target as unknown as Task;
  }


  /**
   * 処理名: ステータス算出
   * 処理概要: 更新内容と現状データからタスクの status を決定するロジック（必要なフィールドが揃えば 'pending'、不足があれば 'draft'）
   * 実装理由: ステータスは複数フィールドの組合せで決まるため、共通処理として切り出して一貫性を保つため
   * @param {Partial<Task> & {deliverables?:TaskArtifactInput[],prerequisites?:TaskArtifactInput[],completionConditions?:TaskCompletionConditionInput[]}} updates
   * @param {Task} current
   * @returns {string}
   */
  private computeStatusFromFields(updates: Partial<Task> & { deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[] }, current: Task): string {
    if (updates.status !== undefined && typeof updates.status === 'string') return updates.status;
    const finalTitle = updates.title ?? current.title;
    const finalDescription = (updates.description ?? current.description ?? '');
    const finalEstimate = (updates.estimate ?? current.estimate ?? '');
    const titleOk = !!(finalTitle && String(finalTitle).trim().length > 0);
    const descriptionOk = !!(finalDescription && String(finalDescription).trim().length > 0);
    const estimateOk = !!(finalEstimate && String(finalEstimate).trim().length > 0);
    return (titleOk && descriptionOk && estimateOk) ? 'pending' : 'draft';
  }

  /**
   * 処理名: 関連データ同期適用
   * 処理概要: deliverables/prerequisites/completionConditions の差分同期をサブリポジトリに委譲して適用する
   * 実装理由: 関連テーブルの整合性を保つために、タスク更新時は関連データの同期処理も必須であり、責務を分離して管理するため
   * @param {string} taskId
   * @param {Partial<Task> & {deliverables?:TaskArtifactInput[],prerequisites?:TaskArtifactInput[],completionConditions?:TaskCompletionConditionInput[]}} updates
   * @param {string} now ISO timestamp
   * @returns {Promise<void>}
   */
  private async applySyncs(
    taskId: string,
    updates: Partial<Task> & { deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[] },
    now: string
  ): Promise<void> {
    await this.syncDeliverables(taskId, updates.deliverables ?? [], now);
    await this.syncPrerequisites(taskId, updates.prerequisites ?? [], now);
    await this.syncCompletionConditions(taskId, updates.completionConditions ?? [], now);
  }



  /**
   * @private
   * @param {string} taskId
   * @param {TaskArtifactInput[]} deliverables
   * @param {string} now
   */
  private async syncDeliverables(taskId: string, deliverables: TaskArtifactInput[] = [], now: string) {
    if (deliverables.length === 0) return;
    await this.taskArtifactRepo.syncTaskArtifacts(taskId, 'deliverable' as any, deliverables ?? [], now);
  }

  /**
   * @private
   * @param {string} taskId
   * @param {TaskArtifactInput[]} prerequisites
   * @param {string} now
   */
  private async syncPrerequisites(taskId: string, prerequisites: TaskArtifactInput[] = [], now: string) {
    if (prerequisites.length === 0) return;
    await this.taskArtifactRepo.syncTaskArtifacts(taskId, 'prerequisite' as any, prerequisites ?? [], now);
  }

  /**
   * @private
   * @param {string} taskId
   * @param {TaskCompletionConditionInput[]} completionConditions
   * @param {string} now
   */
  private async syncCompletionConditions(taskId: string, completionConditions: TaskCompletionConditionInput[] = [], now: string) {
    if (completionConditions.length === 0) return;
    await this.completionConditionRepo.syncTaskCompletionConditions(taskId, completionConditions ?? [], now);
  }

  /**
   * 処理名: タスク更新
   * 処理概要: 指定された部分更新をトランザクション内で適用し、関連データの同期とバージョニングを処理して更新済みオブジェクトを返す
   * 実装理由: 排他制御（ifVersion）や関連データの整合性確保が必要なため、単一の原子的な更新処理として提供する
   * @param {string} taskId
   * @param {Partial<Task> & {ifVersion?:number,deliverables?:TaskArtifactInput[],prerequisites?:TaskArtifactInput[],completionConditions?:TaskCompletionConditionInput[]}} updates
   * @returns {Promise<Task>}
   */
  async updateTask(taskId: string, updates: Partial<Task> & { ifVersion?: number; deliverables?: TaskArtifactInput[]; prerequisites?: TaskArtifactInput[]; completionConditions?: TaskCompletionConditionInput[] }): Promise<Task> {
    const db = await this.db();
    const current = await this.getTask(taskId);
    if (!current) throw new Error(`Task not found: ${taskId}`);
    if (updates.ifVersion !== undefined && current.version !== updates.ifVersion) throw new Error('Task has been modified by another user');
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
        this.computeStatusFromFields(updates, current),
        updates.estimate ?? current.estimate ?? null,
        now,
        newVersion,
        taskId
      );

      await this.applySyncs(taskId, updates, now);

      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }

    return (await this.getTask(taskId))!;
  }

  /**
   * 処理名: タスク移動
   * 処理概要: タスクの親を変更する。循環参照や自身を親にしない等のバリデーションを行う
   * 実装理由: タスク階層の整合性を保つため、移動先の検証を行い安全に更新する必要があるため
   * @param {string} taskId
   * @param {string|null} newParentId
   * @returns {Promise<Task>}
   */
  async moveTask(taskId: string, newParentId: string | null): Promise<Task> {
    const db = await this.db();
    const task = await this.fetchTaskRow(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const normalizedParentId = newParentId ?? null;
    await this.validateMoveTarget(task, normalizedParentId);
    if ((task.parent_id ?? null) === normalizedParentId) return (await this.getTask(taskId))!;
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
   * 処理名: 移動先検証
   * 処理概要: 移動対象が自分自身や子孫にならないか、親が存在するかを検証する
   * 実装理由: 階層整合性を維持し、循環構造ができることを防ぐため
   * @param {Task} task
   * @param {string|null} normalizedParentId
   * @returns {Promise<void>}
   */
  private async validateMoveTarget(task: Task, normalizedParentId: string | null): Promise<void> {
    const db = await this.db();
    if (!normalizedParentId) return;
    if (normalizedParentId === task.id) throw new Error('Task cannot be its own parent');
    const parent = await db.get<Task>(`SELECT id, parent_id FROM tasks WHERE id = ?`, normalizedParentId);
    if (!parent) throw new Error(`Parent task not found: ${normalizedParentId}`);
    await this.ensureNotDescendant(task.id, parent.parent_id ?? null);
  }

  /**
   * 処理名: 子孫チェック
   * 処理概要: 指定された開始親から上へ辿り、移動先が元タスクの子孫でないことを確認する
   * 実装理由: 移動操作で循環構造が発生しないよう事前に検出して例外を投げるため
   * @param {string} taskId
   * @param {string|null} startParentId
   * @returns {Promise<void>}
   */
  private async ensureNotDescendant(taskId: string, startParentId: string | null): Promise<void> {
    const db = await this.db();
    let ancestorId = startParentId;
    while (ancestorId) {
      if (ancestorId === taskId) throw new Error('Cannot move task into its descendant');
      const ancestor = await db.get<{ parent_id: string | null }>(`SELECT parent_id FROM tasks WHERE id = ?`, ancestorId);
      ancestorId = ancestor?.parent_id ?? null;
    }
  }

  /**
   * 処理名: 生行取得
   * 処理概要: 指定 ID の tasks テーブル行をそのまま取得するユーティリティ
   * 実装理由: getTask のようなツリー組み立てとは別に、単純な行情報が必要な場面で使い分けるため
   * @param {string} taskId
   * @returns {Promise<Task|null>}
   */
  private async fetchTaskRow(taskId: string): Promise<Task | null> {
    const db = await this.db();
    const row = await db.get<Task>(`SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version FROM tasks WHERE id = ?`, taskId);
    return row ?? null;
  }

  /**
   * 処理名: タスク削除
   * 処理概要: 指定 ID のタスクを削除する。存在しない場合は false を返す
   * 実装理由: UI からの削除要求に応じて DB 側の行削除を行うため。外部キー制約で子タスク等は CASCADE により削除される設計
   * @param {string} taskId
   * @returns {Promise<boolean>}
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const db = await this.db();
    const existing = await db.get<{ id: string }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
    if (!existing) return false;
    const result = await db.run(`DELETE FROM tasks WHERE id = ?`, taskId);
    return (result.changes ?? 0) > 0;
  }
}

export default TaskRepository;
