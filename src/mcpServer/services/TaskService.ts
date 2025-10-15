import { Database } from 'sqlite';
import * as TaskRepo from '../repositories/TaskRepository';
import * as ArtifactRepo from '../repositories/ArtifactRepository';
import * as TARepo from '../repositories/TaskArtifactRepository';
import * as CCRepo from '../repositories/CompletionConditionRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * TaskService
 *
 * 高レベルのタスク関連業務ロジックを提供します。
 * - タスクの作成・更新・削除・移動
 * - 関連するアーティファクトや完了条件の同期（トランザクション内で実行）
 *
 * このクラスは低レイヤーの Repository モジュールを利用して DB 操作を行います。
 * 外部から `Database` を受け取り、トランザクション管理を行います。
 *
 * @example
 * const svc = new TaskService(db);
 * await svc.createTask('タイトル', null, null, null, null, {});
 *
 * @class
 */
export class TaskService {
    private db: Database;
    /**
     * コンストラクタ
     * @param {Database} db SQLite の Database インスタンス
     */
    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Create task with related artifacts and completion conditions
     * @param {string} title
     * @param {string|null} description
     * @param {string|null} parentId
     * @param {string|null} assignee
     * @param {string|null} estimate
    * @param {{deliverables?: any[], prerequisites?: any[], completionConditions?: any[]}} [options]
    * @param {any[]} [options.deliverables]
    * @param {any[]} [options.prerequisites]
    * @param {any[]} [options.completionConditions]
     * @returns {Promise<string>} created task id
     */
    async createTask(
        title: string,
        description: string | null,
        parentId: string | null,
        assignee: string | null,
        estimate: string | null,
        options?: { deliverables?: Array<any>; prerequisites?: Array<any>; completionConditions?: Array<any> }
    ) {
        const hasTitle = !!(title && String(title).trim().length > 0);
        const hasDescription = !!(description && String(description).trim().length > 0);
        const hasEstimate = !!(estimate && String(estimate).trim().length > 0);
        const status = (hasTitle && hasDescription && hasEstimate) ? 'pending' : 'draft';

        await this.db.run('BEGIN');
        try {
            const id = await TaskRepo.insertTask(this.db, { title, description: description ?? null, parent_id: parentId ?? null, assignee: assignee ?? null, status, estimate: estimate ?? null });
            const now = new Date().toISOString();
            // sync artifacts and conditions using helpers
            await this.syncDeliverables(id, options?.deliverables ?? [], now);
            await this.syncPrerequisites(id, options?.prerequisites ?? [], now);
            await this.syncCompletionConditions(id, options?.completionConditions ?? [], now);

            await this.db.run('COMMIT');
            return id;
        } catch (e) {
            await this.db.run('ROLLBACK');
            throw e;
        }
    }

    /**
     * Helper: sync deliverables for a task
     * @private
     * @param {string} taskId タスクID
     * @param {Array<any>} deliverables deliverables 配列
     * @param {string} now ISO 時刻文字列
     * @returns {Promise<void>}
     */
    private async syncDeliverables(taskId: string, deliverables: Array<any>, now: string) {
        await TARepo.deleteTaskArtifactsByTaskAndRole(this.db, taskId, 'deliverable');
        let idx = 0;
        for (const d of deliverables ?? []) {
            if (!d?.artifactId) continue;
            const art = await ArtifactRepo.getArtifact(this.db, d.artifactId);
            if (!art) throw new Error(`Artifact not found: ${d.artifactId}`);
            await TARepo.insertTaskArtifact(this.db, taskId, d.artifactId, 'deliverable', d.crudOperations ?? null, idx++, now);
        }
    }

    /**
     * Helper: sync prerequisites for a task
     * @private
     * @param {string} taskId タスクID
     * @param {Array<any>} prerequisites prerequisites 配列
     * @param {string} now ISO 時刻文字列
     * @returns {Promise<void>}
     */
    private async syncPrerequisites(taskId: string, prerequisites: Array<any>, now: string) {
        await TARepo.deleteTaskArtifactsByTaskAndRole(this.db, taskId, 'prerequisite');
        let idx = 0;
        for (const p of prerequisites ?? []) {
            if (!p?.artifactId) continue;
            const art = await ArtifactRepo.getArtifact(this.db, p.artifactId);
            if (!art) throw new Error(`Artifact not found: ${p.artifactId}`);
            await TARepo.insertTaskArtifact(this.db, taskId, p.artifactId, 'prerequisite', p.crudOperations ?? null, idx++, now);
        }
    }

    /**
     * Helper: sync completion conditions for a task
     * @private
     * @param {string} taskId タスクID
     * @param {Array<any>} conditions completion conditions 配列
     * @param {string} now ISO 時刻文字列
     * @returns {Promise<void>}
     */
    private async syncCompletionConditions(taskId: string, conditions: Array<any>, now: string) {
        await CCRepo.deleteCompletionConditionsByTask(this.db, taskId);
        let idx = 0;
        for (const c of conditions ?? []) {
            const desc = (c?.description ?? '').trim();
            if (desc.length === 0) continue;
            await CCRepo.insertCompletionCondition(this.db, taskId, desc, idx++, now);
        }
    }

    /**
     * List tasks for a given parent
     * @param {string|null} [parentId]
     * @returns {Promise<any[]>}
     */
    async listTasks(parentId?: string | null) {
        const rows = await TaskRepo.listTaskRows(this.db, parentId);
        const ids = rows.map(r => r.id);
        const taskArtifacts = await TARepo.collectTaskArtifacts(this.db, ids);
        const completionConditions = await CCRepo.collectCompletionConditions(this.db, ids);
        return rows.map((row: any) => {
            const artifactInfo = taskArtifacts.get(row.id) ?? [];
            const deliverables = artifactInfo.filter((a: any) => a.role === 'deliverable').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations, order: a.order_index }));
            const prerequisites = artifactInfo.filter((a: any) => a.role === 'prerequisite').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations, order: a.order_index }));
            return { ...row, children: [], deliverables, prerequisites, completionConditions: completionConditions.get(row.id) ?? [] };
        });
    }

    /**
     * Get a task with nested children and related data
     * @param {string} taskId
     * @returns {Promise<any|null>}
     */
    async getTask(taskId: string) {
        // Delegate complex tree construction to repository which uses a recursive CTE
        return TaskRepo.getTaskTree(this.db, taskId);
    }

    /**
     * Update task and sync related rows
     * @param {string} taskId
     * @param {any} updates
     * @returns {Promise<any>} updated task
     */
    async updateTask(taskId: string, updates: any) {
        const current = await this.getTask(taskId);
        if (!current) throw new Error(`Task not found: ${taskId}`);
        if (updates.ifVersion !== undefined && updates.ifVersion !== current.version) throw new Error('Task has been modified by another user');

        const now = new Date().toISOString();
        const newVersion = current.version + 1;

        await this.db.run('BEGIN');
        try {
            await this.db.run(
                `UPDATE tasks SET title = ?, description = ?, assignee = ?, status = ?, estimate = ?, updated_at = ?, version = ? WHERE id = ?`,
                updates.title ?? current.title,
                updates.description ?? current.description ?? null,
                updates.assignee ?? current.assignee ?? null,
                updates.status ?? current.status ?? null,
                updates.estimate ?? current.estimate ?? null,
                now,
                newVersion,
                taskId
            );

            // apply syncs for artifacts and conditions using helpers
            if (updates.deliverables !== undefined) await this.syncDeliverables(taskId, updates.deliverables ?? [], now);
            if (updates.prerequisites !== undefined) await this.syncPrerequisites(taskId, updates.prerequisites ?? [], now);
            if (updates.completionConditions !== undefined) await this.syncCompletionConditions(taskId, updates.completionConditions ?? [], now);

            await this.db.run('COMMIT');
            return await this.getTask(taskId);
        } catch (e) {
            await this.db.run('ROLLBACK');
            throw e;
        }
    }

    /**
     * Delete a task
     * @param {string} taskId
     * @returns {Promise<boolean>} true if deleted
     */
    async deleteTask(taskId: string) {
        return TaskRepo.deleteTaskRow(this.db, taskId);
    }

    /**
     * Move a task under a new parent
     * @param {string} taskId
     * @param {string|null} newParentId
     * @returns {Promise<any>} updated task
     */
    async moveTask(taskId: string, newParentId: string | null) {
        const task = await TaskRepo.getTaskRow(this.db, taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        // simple validation: prevent making itself parent
        if (newParentId === taskId) throw new Error('Task cannot be its own parent');
        const now = new Date().toISOString();
        const newVersion = task.version + 1;
        await this.db.run(`UPDATE tasks SET parent_id = ?, updated_at = ?, version = ? WHERE id = ?`, newParentId, now, newVersion, taskId);
        return await this.getTask(taskId);
    }
}
