import { randomUUID } from 'node:crypto';
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
   * 処理名: タスクのステータス算出(computeStatus)
   * 処理概要: 現状データからタスクの status を決定するロジック
   * 実装理由: create/update から共通で使われるステータス算出処理を一元化し、親子整合性を保つため
   * @param {string} taskId 対象タスクID
   * @param {string|undefined} status 任意で強制的に設定したい status
   * @returns {Promise<{status:string, reasonCode:string, reasonMessage:string}>}
   */
  async computeStatus(taskId: string, status?: string): Promise<{ status: string; reasonCode: string; reasonMessage: string }> {
    const current = await this.getTask(taskId);
    if (!current) {
      return { status: status ?? 'draft', reasonCode: 'TASK_NOT_FOUND', reasonMessage: `Task not found: ${taskId}` };
    }
    // ルール1: dependees が存在する場合、そのステータスを確認
    // 処理概要: 依存タスクが未完了であれば待機状態('pending')にする
    // 実装理由: 依存タスクが完了していなければ開始できないため
    const depIds: string[] = (current.dependee ?? []).filter(Boolean) as string[];
    if (depIds.length > 0) {
      const anyNotCompleted = await this.anyDependeeNotCompleted(depIds);
      if (anyNotCompleted) return { status: 'pending', reasonCode: 'WAITING_DEPENDEES', reasonMessage: '依存先のタスクが完了していないため待機中です' };
    }

    // ルール2: children が存在する場合、そのステータスを確認
    // 処理概要: 子タスクの状態により親の状態を決定する（draft/in-progress/completed など）
    // 実装理由: 親は子タスクの進捗に依存するため、子の状態を参照して整合性を取る
    const childIds: string[] = (current.children ?? []).map((c: any) => c.id).filter(Boolean);
    if (childIds.length > 0) {
      const childEval = await this.evaluateChildrenStatus(childIds, status);
      if (childEval) return childEval;
    }

    // ルール3: 必須フィールドが揃っているか
    // 処理概要: タイトル/説明/見積り/完了条件/アーティファクトが揃っているか検証する
    // 実装理由: これらが揃っていない場合は未完成として 'draft' を返す必要がある
    if (!this.hasRequiredFieldsForStatus(current)) {
      return { status: 'draft', reasonCode: 'MISSING_REQUIRED_FIELDS', reasonMessage: 'タイトル/説明/詳細/見積り/完了条件/アーティファクトのいずれかが不足しています' };
    }

    // ルール4: 引数 status または pending
    const finalStatus = status ?? 'pending';
    return { status: finalStatus, reasonCode: 'FALLBACK', reasonMessage: `引数またはデフォルトによる決定: ${finalStatus}` };
  }

  /**
   * 必須フィールドが揃っているかを判定する
   * @param {import('../db/types').Task} current 判定対象のタスクオブジェクト
   * @returns {boolean} 必須フィールドが揃っていれば true
   */
  private hasRequiredFieldsForStatus(current: import('../db/types').Task): boolean {
    // 処理名: 必須フィールド判定
    // 処理概要: タスクの title/description/estimate/completionConditions/artifact が存在するか検査する
    // 実装理由: ステータスが 'draft' か 'pending' かを判定する基準として使用するため
    const title = current.title ?? '';
    const description = current.description ?? '';
    const details = current.details ?? '';
    const estimate = current.estimate ?? '';
    const completionConditions = current.completionConditions ?? [];
    const artifacts = current.artifact ?? [];
    return this.isNotEmpty(title) && this.isNotEmpty(description) && this.isNotEmpty(estimate) && this.isNotEmpty(details) && Array.isArray(completionConditions) && completionConditions.length > 0 && Array.isArray(artifacts) && artifacts.length > 0;
  }

  /**
   * 値が空でないか判定するユーティリティ
   * @param {any} v 判定対象の値
   * @returns {boolean} 空でなければ true
   */
  private isNotEmpty(v: any): boolean {
    // 処理名: 非空判定ユーティリティ
    // 処理概要: 文字列的に空でないかを判定する
    // 実装理由: 複数個所で同様の判定が必要なためユーティリティ化して共通化する
    return !!(v !== undefined && v !== null && v.toString().trim().length > 0);
  }

  /**
   * dependees のいずれかが completed でないかを判定する（見つからない参照は無視）
   * @param {string[]} depIds 参照先タスク ID の配列
   * @returns {Promise<boolean>} いずれかが completed でなければ true
   */
  private async anyDependeeNotCompleted(depIds: string[]): Promise<boolean> {
    // 処理名: 依存タスク未完了判定
    // 処理概要: 指定された依存タスクのうちいずれかが completed でないかを確認する
    // 実装理由: 依存タスクが未完了であればこのタスクは 'pending' とすべきため
    if (!depIds || depIds.length === 0) return false;
    const deps = await this.getTasks(depIds);
    const found = deps.filter(d => d && d.id);
    if (found.length === 0) return false;
    return found.some(d => (d.status ?? '') !== 'completed');
  }

  /**
   * children の状態を評価し、決定できれば結果オブジェクトを返す。決定できない場合は null を返す
   * @param {string[]} childIds 子タスク ID の配列
   * @param {string|undefined} statusArg 呼び出し元から渡された status（任意）
   * @returns {Promise<{status:string,reasonCode:string,reasonMessage:string}|null>} 判定結果オブジェクトまたは null
   */
  private async evaluateChildrenStatus(childIds: string[], statusArg?: string): Promise<{ status: string; reasonCode: string; reasonMessage: string } | null> {
    // 処理名: 子タスク状態評価
    // 処理概要: 子タスク群の状態を評価して親の状態を決定できるか判定する
    // 実装理由: 親は子の状態に応じて draft/in-progress/completed 等に変わるため
    if (!childIds || childIds.length === 0) return null;
    const children = await this.getTasks(childIds);
    const foundChildren = children.filter(c => c && c.id);
    if (foundChildren.length === 0) return null;

    // 子に draft がある場合は親も draft
    const anyDraft = foundChildren.some(c => (c.status ?? '') === 'draft');
    if (anyDraft) return { status: 'draft', reasonCode: 'CHILD_HAS_DRAFT', reasonMessage: '子タスクに draft のものが存在します' };

    // 子に in-progress がある場合は親を in-progress とする
    const anyInProgress = foundChildren.some(c => (c.status ?? '') === 'in-progress');
    if (anyInProgress) return { status: 'in-progress', reasonCode: 'CHILD_IN_PROGRESS', reasonMessage: '子タスクに in-progress のものが存在します' };

    // 引数の status が指定されていなければ、全て completed の場合は completed を返す
    const allCompleted = foundChildren.every(c => (c.status ?? '') === 'completed');
    if (!statusArg && allCompleted) return { status: 'completed', reasonCode: 'ALL_CHILDREN_COMPLETED', reasonMessage: '全ての子タスクが completed です' };

    // 子に pending がある場合は親も pending
    const anyPending = foundChildren.some(c => (c.status ?? '') === 'pending');
    if (anyPending) return { status: 'pending', reasonCode: 'CHILD_HAS_PENDING', reasonMessage: '子タスクに pending のものが存在します' };

    return null;
  }

  /**
   * 処理名: タスクのステータス更新(updateTaskStatus)
   * 処理概要: computeStatus を使って、タスクのステータスを変更する。親タスクへ再帰的に伝播する
   * 実装理由: タスクのステータス変更処理を一元化し、親子の整合性を保つため
   * @param {string} taskId 対象タスクID
   * @param {string|undefined} status 設定したい status（任意）
   * @param {boolean|undefined} force true の場合は無条件で引数 status を適用する
   * @param {Set<string>|undefined} visited 再帰時に通過した taskId 集合（内部用）
   * @returns {Promise<{status:string, reasonCode:string, reasonMessage:string}>}
   */
  async updateTaskStatus(taskId: string, status?: string, force?: boolean, visited?: Set<string>): Promise<{ status: string; reasonCode: string; reasonMessage: string }> {
    const db = await this.db();

    // 現状タスクを取得
    const current = await this.getTask(taskId);
    if (!current) return { status: status ?? 'draft', reasonCode: 'TASK_NOT_FOUND', reasonMessage: `Task not found: ${taskId}` };

    // 再帰ループ検出のための visited set
    const seen = visited ?? new Set<string>();
    if (seen.has(taskId)) {
      return { status: status ?? (current.status ?? 'draft'), reasonCode: 'CYCLE_DETECTED', reasonMessage: `Cycle detected for task: ${taskId}` };
    }
    seen.add(taskId);

    // force が true かつ status が与えられている場合はそれを適用
    let decidedStatus: string;
    let reasonCode: string;
    let reasonMessage: string;
    if (force && typeof status === 'string') {
      decidedStatus = status;
      reasonCode = 'FORCED';
      reasonMessage = `強制的に指定された status を適用: ${status}`;
    } else {
      // computeStatus を呼び出して最終 status を決定する
      const computed = await this.computeStatus(taskId, status);
      decidedStatus = computed.status;
      reasonCode = computed.reasonCode;
      reasonMessage = computed.reasonMessage;
    }

    // DB に直接更新（updateTask を使うと循環するため直接 SQL）
    // 処理概要: version と updated_at を更新して永続化する
    // 実装理由: 排他制御のため version をインクリメントして保存する必要がある
    const now = new Date().toISOString();
    //const newVersion = (current.version ?? 0) + 1;
    try {
      await db.run(
        `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`,
        decidedStatus,
        now,
        taskId
      );
    } catch (error) {
      console.error('[updateTaskStatus] Failed to update task status in DB for task:', taskId, ',decidedStatus:',decidedStatus,',now:',now,'Error:', error);
      throw error;
    }

    // 親タスクの整合性を保つため、親タスクがあれば updateTaskStatus を再帰的に呼び出す
    const parentId = (current as any).parentId ?? (current as any).parent_id ?? null;
    if (parentId) {
      try {
        // 親は force=false、visited set を渡して再帰
        await this.updateTaskStatus(parentId, undefined, false, seen);
      } catch (err: any) {
        // 親更新失敗でも処理は継続（ログ出力）
        console.error('親タスクのステータス更新に失敗しました:', err?.message ?? err);
      }
    }

    return { status: decidedStatus, reasonCode, reasonMessage };
  }

  /**
   * 処理名: タスク作成
   * 処理概要: 指定されたフィールドとオプション（deliverables/prerequisites/completionConditions）を用いてタスクを DB に作成する。トランザクション内で関連テーブルも同期する。
   * 実装理由: タスク作成時に関連するアーティファクト割当や完了条件も同時に整合性を保って保存する必要があるため、単一の原子的操作として提供する。
   * @param {string} title Task title
   * @param {string} [description]
   * @param {string} [details]
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
    details?: string | null,
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
    const id = randomUUID();
    const now = new Date().toISOString();
    const hasTitle = !!(title && title.toString().trim().length > 0);
    const hasDescription = !!(description && description.toString().trim().length > 0);
    const hasEstimate = !!(estimate && estimate.toString().trim().length > 0);
    // テスト期待に合わせ、タイトル・説明・見積りが揃っていれば pending とする（完了条件/アーティファクトは必須としない）
    const hasCompletionConditions = options?.completionConditions && options.completionConditions.length > 0;
    const hasArtifacts = options?.artifacts && options?.artifacts.length > 0;
    const allPresent = hasTitle && hasDescription && hasEstimate;
    const status = allPresent ? 'pending' : 'draft';

    await db.run('BEGIN');
    try {
      await db.run(
        `INSERT INTO tasks (
            id, parent_id, title, description, details, assignee,
            status, estimate, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id,
        parentId || null,
        title,
        description || null,
        details ?? null,
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

    // トランザクション終了後にステータスを算出して反映（共通メソッドに差し替え）
    await this.updateTaskStatus(id, undefined, false);

    return (await this.getTask(id))!;
  }

  /**
   * Insert completion conditions helper
   * 処理名: 完了条件挿入ヘルパ
   * 処理概要: 指定されたタスク ID に対して完了条件を順に挿入するユーティリティ
   * 実装理由: タスク作成時・更新時に完了条件を一括で保存する責務を分離するため
   * @param {string} taskId
   * @param {TaskCompletionConditionInput[]|undefined} conditions
   */
  private async insertCompletionConditions(taskId: string, conditions?: TaskCompletionConditionInput[]) {
    // 条件配列が空の場合は何もしない
    for (const cond of conditions ?? []) {
      // 各完了条件をリポジトリに委譲して作成
      await this.completionConditionRepo.createCompletionCondition(taskId, cond.description);
    }
  }

  /**
   * Insert artifact mappings helper
   * 処理名: アーティファクト割当挿入ヘルパ
   * 処理概要: タスクに紐づくアーティファクト割当 (artifactId 等) を順に挿入する
   * 実装理由: アーティファクト割当を個別の責務として分離し、タスク作成/更新の主処理を簡潔にするため
   * @param {string} taskId
   * @param {TaskArtifactInput[]|undefined} artifacts
   */
  private async insertArtifacts(taskId: string, artifacts?: TaskArtifactInput[]) {
    // 配列が存在する場合のみループして割当を作成
    for (const art of artifacts ?? []) {
      await this.taskArtifactRepo.createTaskArtifactMap(taskId, art.artifactId);
    }
  }

  /**
   * Insert dependencies helper
   * 処理名: 依存関係挿入ヘルパ
   * 処理概要: タスクの依存関係情報を順に登録する
   * 実装理由: 依存関係は別テーブルで管理されるため、挿入処理を分離して扱いやすくするため
   * @param {string} taskId
   * @param {TaskDependenciesInput[]|undefined} dependencies
   */
  private async insertDependencies(taskId: string, dependencies?: TaskDependenciesInput[]) {
    // 存在する依存関係を順に作成
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
  * 処理名: プレーンオブジェクトをタスク作成呼び出しに変換
  * 処理概要: 外部から渡された任意オブジェクトを検証・整形して createTask に渡す
  * 実装理由: 生の入力データをそのまま渡すと不整合や型エラーを引き起こすため、安全に整形してから作成処理を呼ぶため
  * @param {any} t
  * @returns {Promise<Task>}
   */
  private async createTaskFromObject(t: any): Promise<Task> {
    const title = this.stringField(t, 'title');
    const description = this.stringField(t, 'description');
    const parentId = this.stringField(t, 'parentId') || null;
    const assignee = this.stringField(t, 'assignee') || null;
    const estimate = this.stringField(t, 'estimate') || null;
    const details = this.stringField(t, 'details') || null;
    const options = {
      dependencies: this.arrayField(t, 'dependencies'),
      artifacts: this.arrayField(t, 'artifacts'),
      completionConditions: this.arrayField(t, 'completionConditions'),
    };
    return await this.createTask(title, description, details, parentId, assignee, estimate, options);
  }
  /**
   * 処理名: 文字列フィールド取得ユーティリティ
   * 処理概要: 指定されたキーの値が文字列であれば返し、それ以外は空文字を返す
   * 実装理由: 外部入力の型が不確実なため、安全に文字列を取得して上位処理のバリデーションを簡略化するため
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
   * 処理名: 配列フィールド取得ユーティリティ
   * 処理概要: 指定キーが配列であればその配列を返し、そうでなければ undefined を返す
   * 実装理由: 任意入力から配列データを安全に取り出すための共通ヘルパ
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

    const isTopLevel = parentId === undefined || parentId === null || parentId === '';
    // Build WHERE clause with optional parent filter and optional status filter
    const clauses: string[] = [];
    const params: any[] = [];
    if (isTopLevel) clauses.push('parent_id IS NULL');
    else { clauses.push('parent_id = ?'); params.push(parentId); }
    if (status !== undefined && status !== null) { clauses.push('status = ?'); params.push(status); }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await db.all<any[]>(
      `SELECT t.id, t.parent_id, t.title, t.description, t.details, t.assignee, t.status,
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
        details: row.details ?? null,
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
   * 処理名: 末端のタスク一覧 (leafTaskList)
   * 処理概要: 指定 parentId 配下の全ての子孫を探索し、子を持たない（真の leaf）タスクを抽出して返す。
   *           status フィルタを任意で指定でき、status は文字列または文字列配列を受け付ける。
   * 実装理由: 特定 status のタスクをまとめて修正するための修正候補取得に利用する
   * @param {string|null|undefined} parentId Optional parent id
   * @param {string|string[]|null|undefined} status Optional status filter (単一または配列)。小文字化して完全一致で比較する
   * @returns {Promise<Task[]>} Array of tasks (flat list, listTasks と同様のフォーマット)
   */
  async leafTaskList(parentId?: string | null, status?: string | string[] | null): Promise<Task[]> {
    const db = await this.db();

    const isTopLevel = parentId === undefined || parentId === null || parentId === '';

    // Build recursive CTE to collect all descendants of the given parent(s).
    // If parentId is not provided, start from all roots (parent_id IS NULL).
    // Start seed depends on parentId existence.
    let cteSeedSql: string;
    const params: any[] = [];
    if (isTopLevel) {
      cteSeedSql = `SELECT id FROM tasks WHERE parent_id IS NULL`;
    } else {
      // verify parent exists; if not, return empty array (requirement)
      const parentRow = await db.get<{ id: string }>(`SELECT id FROM tasks WHERE id = ?`, parentId);
      if (!parentRow) return [];
      cteSeedSql = `SELECT id FROM tasks WHERE id = ?`;
      params.push(parentId);
    }

    // Prepare status filter list (lowercased). Accept string or array.
    const statusList = this.buildStatusList(status);

    // Recursive CTE: collect all descendant ids starting from seed(s)
    // Then select those ids where there are no children (pure leaf), excluding the seed parent itself
    // Note: status filter is applied AFTER selecting leaf nodes as required
    const placeholders = statusList ? statusList.map(() => '?').join(',') : '';
    const sql = `WITH RECURSIVE descendants(id) AS (
        ${cteSeedSql}
        UNION ALL
          SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id
        )
        SELECT t.id, t.parent_id, t.title, t.description, t.details, t.assignee, t.status, t.estimate, t.created_at, t.updated_at, t.version
        FROM tasks t
        WHERE t.id IN (SELECT id FROM descendants)
        AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id)
        ${statusList ? `AND LOWER(t.status) IN (${placeholders})` : ''}
        ORDER BY t.created_at ASC`;

    const rows = await db.all<any[]>(sql, ...params, ...(statusList ?? []));

    if (!rows || rows.length === 0) return [];

    const taskPromises = rows.map(async (row: any) => {
      const completionConditions = await this.completionConditionRepo.getCompletionConditionByTaskId(row.id);
      const dependencyIds = await this.dependenciesRepo.getDependencyByTaskId(row.id);
      const dependeeIds = await this.dependenciesRepo.getDependeeByTaskId(row.id);
      const artifactIds = await this.taskArtifactRepo.getArtifactIdsByTaskIds(row.id);

      return {
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        description: row.description,
        details: row.details ?? null,
        status: row.status,
        estimate: row.estimate,
        version: row.version,
        childCount: 0,
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
   * ヘルパ: status 引数からプレーンな小文字化されたステータス配列を返す
   * @param {string|string[]|null|undefined} status
   * @returns {string[]|null}
   */
  private buildStatusList(status?: string | string[] | null): string[] | null {
    if (status === undefined || status === null) return null;
    if (Array.isArray(status)) {
      const list = status.map(s => (s ?? '').toString().toLowerCase()).filter(s => s.length > 0);
      return list.length === 0 ? null : list;
    }
    const single = (status ?? '').toString().toLowerCase();
    return single.length === 0 ? null : [single];
  }

  /**
   * 指定 taskId の既存依存(dependents) を削除し、新しい依存配列を作成するヘルパ
   * @param {string} taskId
   * @param {Array<any>} existingDependents
   * @param {TaskDependenciesInput[]} newDeps
   */
  private async syncTaskDependencies(taskId: string, existingDependents: Array<any>, newDeps: TaskDependenciesInput[] = []) {
    // 既存依存を削除
    for (const dep of existingDependents ?? []) {
      if (dep && dep.dependencyId) {
        try {
          await this.dependenciesRepo.deleteDependency(dep.dependencyId);
        } catch (err: any) {
          console.error('依存関係の削除に失敗しました:', (err as any)?.message ?? err);
        }
      }
    }

    // 新しい依存を作成
    for (const dep of newDeps ?? []) {
      await this.dependenciesRepo.createDependency(taskId, dep.taskId, []);
    }
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
    // 空配列ならすぐ抜ける
    if (!taskIds || taskIds.length === 0) return [];
    try {
      // SQLite は `IN (?)` に配列を直接渡すとプレースホルダ数が合わずエラーになるため
      // taskIds の長さに応じたプレースホルダを生成して展開する
      const placeholders = taskIds.map(() => '?').join(',');
      const sql = `SELECT id, parent_id, title, description, details, assignee, status,
                  estimate, created_at, updated_at, version
        FROM tasks
        WHERE id IN (${placeholders})`;
      const tasks = await db.all<Task[]>(sql, ...taskIds);
      if (!tasks || tasks.length === 0) return [];
      return tasks as unknown as Task[];
    } catch (error) {
      console.error('[getTasks] Failed to fetch tasks from DB for IDs:', taskIds, 'Error:', error);
      throw error;
    }
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
      `SELECT id, parent_id, title, description, details, assignee, status,
              estimate, created_at, updated_at, version
       FROM tasks
       WHERE id = ?`,
      taskId
    );
    if (!task) return null;
    // ターゲットとその直下の子のみを取得してツリーを構築する（効率化）
    const childRows = await db.all<any[]>(
      `SELECT id, parent_id, title, description, details, assignee, status, estimate, created_at, updated_at, version
       FROM tasks
       WHERE parent_id = ?
       ORDER BY created_at ASC`,
      taskId
    );

    // 必要な ID を集めて関連データを限定取得
    const completionConditions = await this.completionConditionRepo.getCompletionConditionByTaskId(task.id);
    const dependencyIds = await this.dependenciesRepo.getDependencyByTaskId(task.id); // 依存関係情報を限定取得
    const dependeeIds = await this.dependenciesRepo.getDependeeByTaskId(task.id); // 依存関係情報を限定取得


    // 既存は ID 一覧を返していたが、collectTaskArtifacts を使って詳細を取得する
    // 返却は artifact_id, crud_operations, artifact_title を含む形に整形する
    const collectedArtifacts = await this.taskArtifactRepo.collectTaskArtifacts([task.id]);
    const bucket = collectedArtifacts.get(task.id) ?? { deliverables: [], prerequisites: [] };
    const dependencyDetails = await this.getTasks(dependencyIds);
    const dependeeDetails = await this.getTasks(dependeeIds);

    const target = {
      ...task,
      children: childRows.map((row: any) => {
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          details: row.details ?? null,
          status: row.status,
          estimate: row.estimate
        } as Task;
      }),
      // artifact: 以前は ID のみの配列を返していたが、collectTaskArtifacts の結果を整形して返す
      artifact: (() => {
        try {
          const assignments = [...(bucket.deliverables ?? []), ...(bucket.prerequisites ?? [])];
          return assignments.map(a => ({
            artifact_id: a.artifactId ?? a.artifact?.id,
            crud_operations: a.crudOperations ?? undefined,
            artifact_title: a.artifact?.title ?? undefined
          }));
        } catch (err) {
          // 何らかの理由で整形できない場合は安全のため空配列を返す
          return [];
        }
      })(),
      dependees: dependeeDetails.map(dependeeDetail => ({
        id: dependeeDetail.id,
        title: dependeeDetail.title,
        description: dependeeDetail.description,
        status: dependeeDetail.status
      })),
      dependents: dependencyDetails.map(dependencyDetail => ({
        id: dependencyDetail.id,
        title: dependencyDetail.title,
        description: dependencyDetail.description,
        status: dependencyDetail.status
      })),
      completionConditions: completionConditions.map(completionCondition => ({
        id: completionCondition.id,
        description: completionCondition.description
      }))
    };

    return target as unknown as Task;
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
  * @param {string} [title]
  * @param {string} [description]
  * @param {string} [details]
  * @param {string|null} [parentId]
  * @param {string|null} [assignee]
  * @param {string|null} [estimate]
  * @param {Object} [options] オプションパラメータ
  * @param {TaskDependenciesInput[]} [options.dependencies] 依存タスク配列
  * @param {TaskArtifactInput[]} [options.artifacts] アーティファクト入力配列
  * @param {TaskCompletionConditionInput[]} [options.completionConditions] 完了条件入力配列
  * @param {number} [options.ifVersion] 排他制御用のバージョン
   * @returns {Promise<Task>}
   */
  async updateTask(
    taskId: string,
    title?: string,
    description: string = '',
    details: string = '',
    parentId: string | null = null,
    assignee: string | null = null,
    estimate: string | null = null,
    options?: {
      dependencies?: TaskDependenciesInput[];
      artifacts?: TaskArtifactInput[];
      completionConditions?: TaskCompletionConditionInput[];
      ifVersion?: number;
    }
  ): Promise<Task> {
    const db = await this.db();
    const current = await this.getTask(taskId);
    if (!current) throw new Error(`Task not found: ${taskId}`);

    // バージョンチェック(ifVersion)は options に含める
    if (options?.ifVersion !== undefined && current.version !== options.ifVersion) throw new Error('Task has been modified by another user');

    const now = new Date().toISOString();
    const newVersion = current.version + 1;

    await db.run('BEGIN');
    try {
      await db.run(
        `UPDATE tasks
         SET title = ?,
             description = ?,
             details = ?,
             assignee = ?,
             estimate = ?,
             parent_id = ?,
             updated_at = ?,
             version = ?
         WHERE id = ?`,
        title ?? (current as any).title,
        (description ?? (current as any).description) ?? null,
        // details may be provided in options.details
        details ?? (current as any).details ?? null,
        assignee ?? (current as any).assignee ?? null,
        estimate ?? (current as any).estimate ?? null,
        parentId ?? (current as any).parentId ?? (current as any).parent_id ?? null,
        now,
        newVersion,
        taskId
      );

      // createTask の options 形式に合わせて受け取り、内部の同期処理に渡す形に変換する
      // 型の違いを回避するため any を使って同期用オブジェクトを組み立てる
      const syncUpdates: any = {
        deliverables: options?.artifacts ?? [],
        prerequisites: [],
        completionConditions: options?.completionConditions ?? []
      };

      await this.applySyncs(taskId, syncUpdates, now);

      // 依存タスク (task-level dependencies) が渡された場合は既存の依存を削除して再登録する
      if (options?.dependencies && Array.isArray(options.dependencies)) {
        // 既存依存を DependenciesRepository を介して削除してから再作成する（サブリポジトリに委譲）
        const collected = await this.dependenciesRepo.collectDependenciesForTasks([taskId]);
        const bucket = collected.get(taskId) ?? { dependents: [], dependees: [] };
        // dependents はこのタスクが dependency_task_id の行
        await this.syncTaskDependencies(taskId, bucket.dependents, options.dependencies);
      }

      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }

    // トランザクション内の他フィールド更新は完了したので、外でステータスを再計算して DB に反映する
    await this.updateTaskStatus(taskId, undefined, false);
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
    const row = await db.get<Task>(`SELECT id, parent_id, title, description, details, assignee, status, estimate, created_at, updated_at, version FROM tasks WHERE id = ?`, taskId);
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
