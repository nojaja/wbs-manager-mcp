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
 * 処理名: タスク-アーティファクト関連行のデータ構造定義
 * 処理概要: データベースの `task_artifacts` テーブルから取得される1行分の型定義を提供します。
 * 実装理由: DBクエリ結果を扱う際に型安全性を確保し、フィールド名や型の一貫性を保つために必要です。
 */

/**
 * 処理名: タスクに紐づくアーティファクトの削除（ロール指定）
 * 処理概要: 指定した `taskId` と `role` に一致する `task_artifacts` テーブルの行を削除します。
 * 実装理由: タスクの役割に応じたアーティファクト割当を更新またはクリアする必要があるため。例えば、ロールの変更やタスク削除時に関連付けを一括で削除するために用います。
 * @param {Database} db sqlite Database
 * @param {string} taskId task id
 * @param {string} role role name
 * @returns {Promise<void>}
 */
export async function deleteTaskArtifactsByTaskAndRole(db: Database, taskId: string, role: string): Promise<void> {
    await db.run(`DELETE FROM task_artifacts WHERE task_id = ? AND role = ?`, taskId, role);
}

/**
 * 処理名: タスク-アーティファクト割当の新規登録
 * 処理概要: 新しい `task_artifacts` 行を作成し、タスクとアーティファクトの関連情報（ロール、CRUD表現、順序など）を永続化します。
 * 実装理由: タスクとアーティファクトの関連付けを追加するために必要。アーティファクトの表示順やアクセス権（crud_operations）を保持することで、UIやビジネスロジック側で正しく振る舞わせることができます。
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
 * 処理名: タスクに紐づくアーティファクトの収集（タスク毎にグループ化）
 * 処理概要: 指定した複数の `taskIds` に対応する `task_artifacts` レコードを取得し、タスクIDをキーとした Map にグループ化して返します。各タスク内では `role` と `order_index` に基づきソート済みです。
 * 実装理由: 複数タスクの一括表示やバッチ処理のために、関連アーティファクトを効率よくまとめて取得して利用できる形にする必要があるため。また、存在しないタスクIDに対しては空配列を返すことで呼び出し側のnullチェックを不要にし、安全に扱えるようにしています。
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
