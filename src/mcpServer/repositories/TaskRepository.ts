import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import * as TARepo from './TaskArtifactRepository';
import * as CCRepo from './CompletionConditionRepository';

export interface TaskRow {
    id: string;
    parent_id?: string | null;
    title: string;
    description?: string | null;
    assignee?: string | null;
    status: string;
    estimate?: string | null;
    created_at: string;
    updated_at: string;
    version: number;
}

/**
 * Insert a new task row and return its id
 * @param {Database} db sqlite Database
 * @param {Partial<TaskRow> & {title: string}} row task fields
 * @returns {Promise<string>} created id
 */
export async function insertTask(db: Database, row: Partial<TaskRow> & { title: string }): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.run(
        `INSERT INTO tasks (id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id,
        row.parent_id ?? null,
        row.title,
        row.description ?? null,
        row.assignee ?? null,
        row.status ?? 'draft',
        row.estimate ?? null,
        now,
        now
    );
    return id;
}

/**
 * Get single task row by id
 * @param {Database} db sqlite Database
 * @param {string} id task id
 * @returns {Promise<TaskRow|null>}
 */
export async function getTaskRow(db: Database, id: string): Promise<TaskRow | null> {
    const row = await db.get<TaskRow>(
        `SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version
         FROM tasks WHERE id = ?`,
        id
    );
    return row ?? null;
}

/**
 * Update task row fields
 * @param {Database} db sqlite Database
 * @param {string} id task id
 * @param {Partial<TaskRow> & {version?: number}} updates
 * @returns {Promise<void>}
 */
export async function updateTaskRow(db: Database, id: string, updates: Partial<TaskRow> & { version?: number }): Promise<void> {
    const now = new Date().toISOString();
    const newVersion = (updates.version ?? 1);
    await db.run(
        `UPDATE tasks SET title = ?, description = ?, assignee = ?, status = ?, estimate = ?, updated_at = ?, version = ? WHERE id = ?`,
        updates.title ?? null,
        updates.description ?? null,
        updates.assignee ?? null,
        updates.status ?? null,
        updates.estimate ?? null,
        now,
        newVersion,
        id
    );
}

/**
 * Delete task row by id
 * @param {Database} db sqlite Database
 * @param {string} id task id
 * @returns {Promise<boolean>}
 */
export async function deleteTaskRow(db: Database, id: string): Promise<boolean> {
    const result = await db.run(`DELETE FROM tasks WHERE id = ?`, id);
    return (result.changes ?? 0) > 0;
}

/**
 * List tasks for a parent (or top-level when parentId is null/undefined)
 * @param {Database} db sqlite Database
 * @param {string|null} [parentId]
 * @returns {Promise<TaskRow[]>}
 */
export async function listTaskRows(db: Database, parentId?: string | null): Promise<TaskRow[]> {
    const isTopLevel = parentId === undefined || parentId === null;
    const whereClause = isTopLevel ? 'WHERE parent_id IS NULL' : 'WHERE parent_id = ?';
    const params = isTopLevel ? [] : [parentId];
    const rows = await db.all<TaskRow[]>(
        `SELECT t.id, t.parent_id, t.title, t.description, t.assignee, t.status, t.estimate, t.created_at, t.updated_at, t.version,
            (
                SELECT COUNT(1) FROM tasks c WHERE c.parent_id = t.id
            ) AS childCount
         FROM tasks t
         ${whereClause}
         ORDER BY t.created_at ASC`,
        ...params
    );
    return rows;
}

/**
 * Get task tree rooted at taskId (including the node itself and all descendants) or full tree when taskId is null
 * Uses a recursive CTE to fetch hierarchy efficiently and then collects related artifacts and completion conditions
 * @param {Database} db sqlite Database
 * @param {string|null} taskId root task id, or null to fetch all tasks
 * @returns {Promise<any|null>} tree root object when taskId provided, or array of roots when taskId is null
 */
export async function getTaskTree(db: Database, taskId: string | null): Promise<any> {
    // Fetch rows using recursive CTE
    const params: any[] = [];
    const whereRoot = taskId ? 'WHERE t.id = ?' : 'WHERE t.parent_id IS NULL';
    if (taskId) params.push(taskId);

    const rows = await db.all(
        `WITH RECURSIVE subtree(id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version) AS (
            SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version FROM tasks t ${whereRoot}
            UNION ALL
            SELECT c.id, c.parent_id, c.title, c.description, c.assignee, c.status, c.estimate, c.created_at, c.updated_at, c.version
            FROM tasks c
            JOIN subtree s ON s.id = c.parent_id
        )
        SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version FROM subtree ORDER BY created_at ASC`,
        ...params
    );

    if (!rows || rows.length === 0) return taskId ? null : [];

    const ids = rows.map((r: any) => r.id);
    const taskArtifacts = await TARepo.collectTaskArtifacts(db, ids);
    const completionConditions = await CCRepo.collectCompletionConditions(db, ids);

    const taskMap = new Map<string, any>();
    rows.forEach((r: any) => {
        const artifactInfo = taskArtifacts.get(r.id) ?? [];
        const deliverables = (artifactInfo as any[]).filter((a: any) => a.role === 'deliverable').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations ?? null, order: a.order_index }));
        const prerequisites = (artifactInfo as any[]).filter((a: any) => a.role === 'prerequisite').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations ?? null, order: a.order_index }));
        taskMap.set(r.id, { ...r, children: [], deliverables, prerequisites, completionConditions: completionConditions.get(r.id) ?? [] });
    });

    // link children
    rows.forEach((r: any) => {
        if (r.parent_id && taskMap.has(r.parent_id)) {
            taskMap.get(r.parent_id).children.push(taskMap.get(r.id));
        }
    });

    if (taskId) return taskMap.get(taskId) ?? null;

    // return top-level roots from fetched set
    const roots = rows.filter((r: any) => !r.parent_id).map((r: any) => taskMap.get(r.id));
    return roots;
}
