import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

export interface CompletionConditionRow {
    id: string;
    task_id: string;
    description: string;
    order_index: number;
    created_at: string;
    updated_at: string;
}

/**
 * 処理名: 完了条件行データの型定義
 * 処理概要: データベースの `task_completion_conditions` テーブルから取得・保存される完了条件の1行分を表すインターフェース。
 * 実装理由: データベースレコードを扱う際に型安全性を確保し、呼び出し側でフィールド名や型の誤りを早期に検出するため。
 */

/**
 * 処理名: タスクに紐づく完了条件を全削除
 * 処理概要: 指定したタスクIDに関連する `task_completion_conditions` の全レコードを削除する。
 * 実装理由: タスク削除や完了条件の再登録時に旧データを一括で消去し、データの整合性を保つために必要。
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @returns {Promise<void>}
 */
export async function deleteCompletionConditionsByTask(db: Database, taskId: string): Promise<void> {
    await db.run(`DELETE FROM task_completion_conditions WHERE task_id = ?`, taskId);
}

/**
 * 処理名: 完了条件の挿入
 * 処理概要: 新しい完了条件を `task_completion_conditions` テーブルに挿入する。自動採番の代わりにUUIDを生成して `id` として保存し、作成・更新時刻に同一のタイムスタンプを設定する。
 * 実装理由: 完了条件はタスクに紐づく副次データであり、複数の条件を順序付けて保持する必要があるため、順序情報（order_index）や一意の識別子が必須。タイムスタンプは差分検出や同期処理で利用される。
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @param {string} description condition description
 * @param {number} orderIndex ordering index
 * @param {string} timestamp ISO timestamp
 * @returns {Promise<void>}
 */
export async function insertCompletionCondition(db: Database, taskId: string, description: string, orderIndex: number, timestamp: string): Promise<void> {
    await db.run(
        `INSERT INTO task_completion_conditions (id, task_id, description, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        uuidv4(),
        taskId,
        description,
        orderIndex,
        timestamp,
        timestamp
    );
}

/**
 * 処理名: 複数タスクの完了条件収集
 * 処理概要: 指定した複数のタスクIDに対する完了条件をデータベースから取得し、タスクIDをキーとしたMapに整形して返す。結果は `task_id` と `order_index` の順でソートされる。
 * 実装理由: UIやAPIで複数タスクの完了条件を一括表示・比較するケースがあるため、1回のクエリでまとめて取得しクライアント側で扱いやすいMap形式で提供することで性能と利便性を両立する。
 * @param {Database} db sqlite Database
 * @param {string[]} taskIds array of task ids
 * @returns {Promise<Map<string, CompletionConditionRow[]>>}
 */
export async function collectCompletionConditions(db: Database, taskIds: string[]): Promise<Map<string, CompletionConditionRow[]>> {
    const result = new Map<string, CompletionConditionRow[]>();
    if (taskIds.length === 0) return result;
    const placeholders = taskIds.map(() => '?').join(', ');
    const rows = await db.all<any[]>(
        `SELECT id, task_id, description, order_index FROM task_completion_conditions WHERE task_id IN (${placeholders}) ORDER BY task_id, order_index`,
        taskIds
    );
    for (const r of rows) {
        const list = result.get(r.task_id) ?? [];
        list.push(r as CompletionConditionRow);
        result.set(r.task_id, list);
    }
    taskIds.forEach((id) => { if (!result.has(id)) result.set(id, []); });
    return result;
}
