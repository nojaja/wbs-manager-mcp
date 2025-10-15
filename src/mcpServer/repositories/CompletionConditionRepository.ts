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
 * Delete all completion conditions for a given task
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @returns {Promise<void>}
 */
export async function deleteCompletionConditionsByTask(db: Database, taskId: string): Promise<void> {
    await db.run(`DELETE FROM task_completion_conditions WHERE task_id = ?`, taskId);
}

/**
 * Insert a completion condition row
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
 * Collect completion conditions for multiple tasks
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
