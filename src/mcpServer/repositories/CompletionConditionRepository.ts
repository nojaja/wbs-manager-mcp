import type { TaskCompletionCondition, TaskCompletionConditionInput } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection';

/**
 * 処理名: CompletionConditionRepository（完了条件リポジトリ）
 * 処理概要: タスクの完了条件（task_completion_conditions）の CRUD と同期処理を提供するリポジトリクラス
 * 実装理由: タスク本体とは別に完了条件を管理することで責務を分離し、関連データの同期や取得を一元化するため
 * @class
 */
export class CompletionConditionRepository {
  /**
   * 処理名: コンストラクタ
   * 処理概要: リポジトリインスタンスを生成する
   * 実装理由: 将来的な依存注入や初期化処理を追加できるように明示的にコンストラクタを定義している
   */
  constructor() { }


  /**
   * 処理名: 完了条件作成
   * 処理概要: 指定タスクに対する完了条件を新規作成し、DB に保存する
   * 実装理由: タスク作成/更新時に個別の完了条件を追加できるようにするため
   * @param {string} taskId Task id to associate the condition with
   * @param {string} description Description of the completion condition
   * @returns {Promise<TaskCompletionCondition>} Created completion condition
   */
  async createCompletionCondition(
    taskId: string,
    description: string
  ): Promise<TaskCompletionCondition> {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    // task_id毎のorderの最大値を取得し、+1するロジックは呼び出し元で実装
    const maxOrder = await db.get(`SELECT MAX(order_index) as maxOrder FROM task_completion_conditions WHERE task_id = ?`, taskId);
    const nextOrder = (maxOrder?.maxOrder ?? -1) + 1;
    const order = nextOrder;

    // DB に完了条件を挿入
    await db.run(
      `INSERT INTO task_completion_conditions (
          id, task_id, description, order_index, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      taskId,
      description,
      order,
      now,
      now
    );

    return {
      id,
      task_id: taskId,
      description,
      order
    };
  }

  /**
   * 処理名: taskIdに紐づく完了条件取得
   * 処理概要: task_id の完了条件を DB から取得する
   * @param {string} taskId タスク ID
   * @returns {Promise<TaskCompletionCondition[]>} 完了条件オブジェクトの配列
   */
  async getCompletionConditionByTaskId(
    taskId: string
  ): Promise<TaskCompletionCondition[]> {
    const db = await getDatabase();
    const rows = await db.all<Array<any>>(
      `SELECT
          id,
          task_id,
          description,
          order_index
       FROM task_completion_conditions
       WHERE task_id = ?
       ORDER BY order_index`,
      taskId
    );

    if (rows.length === 0) return [];

    return rows.map(row => ({
      id: row.id,
      task_id: row.task_id,
      description: row.description,
      order: typeof row.order_index === 'number' ? row.order_index : Number(row.order_index ?? 0)
    }));
  }

  /**
   * 処理名: 完了条件同期
   * 処理概要: 指定タスクの完了条件を一括で同期（既存を削除して指定リストを挿入）する
   * 実装理由: タスク更新時に完了条件の差分同期処理を単純化し、整合性を保つため（トランザクション外でも簡潔に再作成する戦略）
   * @param {string} taskId Task id to update
   * @param {TaskCompletionConditionInput[]|undefined} conditions Conditions to set
   * @param {string} timestamp ISO timestamp for created/updated fields
   * @returns {Promise<void>} Resolves when sync is complete
   */
  async syncTaskCompletionConditions(
    taskId: string,
    conditions: TaskCompletionConditionInput[] | undefined,
    timestamp: string
  ): Promise<void> {
    const db = await getDatabase();
    await db.run(`DELETE FROM task_completion_conditions WHERE task_id = ?`, taskId);

    if (!conditions || conditions.length === 0) return;

    let index = 0;
    for (const condition of conditions) {
      const description = (condition?.description ?? '').trim();
      if (description.length === 0) continue;

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
   * 処理名: 完了条件収集
   * 処理概要: 複数の taskId に対する完了条件を取得し、taskId をキーとする Map に整形して返す
   * 実装理由: タスクリスト描画時やツリー構築時に、タスクごとの完了条件をまとめて取得して効率的に結合するため
   * @param {string[]} taskIds Array of task ids to collect conditions for
   * @returns {Promise<Map<string, TaskCompletionCondition[]>>} Map of taskId -> conditions
   */
  async collectCompletionConditions(taskIds: string[]): Promise<Map<string, TaskCompletionCondition[]>> {
    const result = new Map<string, TaskCompletionCondition[]>();
    if (taskIds.length === 0) return result;
    const db = await getDatabase();
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
      if (!result.has(taskId)) result.set(taskId, []);
    });

    return result;
  }
}

export default CompletionConditionRepository;
