import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

export interface TaskArtifactRow {
    id: string;
    task_id: string;
    artifact_id: string;
    role: string;
    crud_operations?: string | null;
    order_index: number;
    created_at: string;
    updated_at: string;
}

/**
 * Delete task artifacts by task id and role
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @param {string} role role name
 * @returns {Promise<void>}
 */
export async function deleteTaskArtifactsByTaskAndRole(db: Database, taskId: string, role: string): Promise<void> {
    await db.run(`DELETE FROM task_artifacts WHERE task_id = ? AND role = ?`, taskId, role);
}

/**
 * Insert a task artifact assignment
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @param {string} artifactId artifact id
 * @param {string} role role name
 * @param {string|null} crudOperations CRUD string
 * @param {number} orderIndex order index
 * @param {string} timestamp ISO timestamp
 * @returns {Promise<void>}
 */
export async function insertTaskArtifact(db: Database, taskId: string, artifactId: string, role: string, crudOperations: string | null, orderIndex: number, timestamp: string): Promise<void> {
    await db.run(
        `INSERT INTO task_artifacts (id, task_id, artifact_id, role, crud_operations, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(),
        taskId,
        artifactId,
        role,
        crudOperations ?? null,
        orderIndex,
        timestamp,
        timestamp
    );
}

/**
 * Collect task artifacts grouped by task id
 * @param {Database} db sqlite Database
 * @param {string[]} taskIds array of task ids
 * @returns {Promise<Map<string, TaskArtifactRow[]>>}
 */
export async function collectTaskArtifacts(db: Database, taskIds: string[]): Promise<Map<string, TaskArtifactRow[]>> {
    const result = new Map<string, TaskArtifactRow[]>();
    if (taskIds.length === 0) return result;
    const placeholders = taskIds.map(() => '?').join(', ');
    const rows = await db.all<any[]>(
        `SELECT ta.* FROM task_artifacts ta WHERE ta.task_id IN (${placeholders}) ORDER BY ta.task_id, ta.role, ta.order_index`,
        taskIds
    );
    for (const r of rows) {
        const list = result.get(r.task_id) ?? [];
        list.push(r as TaskArtifactRow);
        result.set(r.task_id, list);
    }
    taskIds.forEach((id) => { if (!result.has(id)) result.set(id, []); });
    return result;
}
