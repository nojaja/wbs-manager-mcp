import type { TaskArtifactAssignment, TaskArtifactRole } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection';

/**
 * 処理名: TaskArtifactRepository（タスク-成果物割当リポジトリ）
 * 処理概要: task_artifacts テーブルを操作し、タスクに紐づく成果物（deliverables/prerequisites）の同期・収集を提供する
 * 実装理由: 成果物割当の管理を別のリポジトリに切り出すことで、タスクリポジトリの責務を軽減し再利用性を高めるため
 * @class
 */
export class TaskArtifactRepository {
  /**
   * 処理名: コンストラクタ
   * 処理概要: リポジトリインスタンスを生成する
   * 実装理由: 将来の依存注入や初期化処理を見越してコンストラクタを明示している
   */
  constructor() { }

  /**
   * 処理名: 割当同期
   * 処理概要: 指定タスクとロールに対する成果物割当を一括同期（既存削除後に挿入）する
   * 実装理由: タスク更新時に成果物の差分を逐次更新する代わりに、簡潔に全置換で整合性を保つ戦略を採るため
   * @param {string} taskId Task id to synchronize
   * @param {TaskArtifactRole} role Assignment role (deliverable|prerequisite)
   * @param {Array<{artifactId:string, crudOperations?:string|null}>|undefined} assignments Assignment list
   * @param {string} timestamp ISO timestamp used for created_at/updated_at
   * @returns {Promise<void>} Resolves when synchronization completes
   */
  async syncTaskArtifacts(
    taskId: string,
    role: TaskArtifactRole,
    assignments: Array<{ artifactId: string; crudOperations?: string | null }> | undefined,
    timestamp: string
  ): Promise<void> {
    const db = await getDatabase();
    await db.run(`DELETE FROM task_artifacts WHERE task_id = ? AND role = ?`, taskId, role);

    if (!assignments || assignments.length === 0) return;

    let index = 0;
    for (const assignment of assignments) {
      if (!assignment?.artifactId) continue;

      const artifact = await db.get<{ id: string }>(`SELECT id FROM artifacts WHERE id = ?`, assignment.artifactId);
      if (!artifact) throw new Error(`Artifact not found: ${assignment.artifactId}`);

      await db.run(
        `INSERT INTO task_artifacts (
            id, task_id, artifact_id, role, crud_operations, order_index, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(),
        taskId,
        assignment.artifactId,
        role,
        assignment.crudOperations ?? null,
        index,
        timestamp,
        timestamp
      );

      index += 1;
    }
  }

  /**
   * 処理名: 割当収集
   * 処理概要: 複数タスク ID に紐づく割当情報とアーティファクト情報を結合して Map に整形して返す
   * 実装理由: タスク一覧描画や API レスポンス作成時に、タスクごとの deliverables/prerequisites を効率的に結び付けて返すため
   * @param {string[]} taskIds List of task ids
   * @returns {Promise<Map<string, {deliverables: TaskArtifactAssignment[], prerequisites: TaskArtifactAssignment[]}>>}
   */
  async collectTaskArtifacts(taskIds: string[]): Promise<Map<string, { deliverables: TaskArtifactAssignment[]; prerequisites: TaskArtifactAssignment[] }>> {
    const result = new Map<string, { deliverables: TaskArtifactAssignment[]; prerequisites: TaskArtifactAssignment[] }>();
    if (taskIds.length === 0) return result;
    const db = await getDatabase();
    const placeholders = taskIds.map(() => '?').join(', ');
    const rows = await db.all<Array<any>>(
      `SELECT
          ta.id AS assignment_id,
          ta.task_id AS task_id,
          ta.artifact_id AS artifact_id,
          ta.role AS role,
          ta.crud_operations AS crud_operations,
          ta.order_index AS order_index,
          pa.title AS artifact_title,
          pa.uri AS artifact_uri,
          pa.description AS artifact_description,
          pa.created_at AS artifact_created_at,
          pa.updated_at AS artifact_updated_at,
          pa.version AS artifact_version
       FROM task_artifacts ta
       JOIN artifacts pa ON pa.id = ta.artifact_id
       WHERE ta.task_id IN (${placeholders})
       ORDER BY ta.task_id, ta.role, ta.order_index`,
      taskIds
    );

    for (const row of rows) {
      const assignment: TaskArtifactAssignment = {
        id: row.assignment_id,
        artifact_id: row.artifact_id,
        role: row.role as TaskArtifactRole,
        crudOperations: row.crud_operations ?? undefined,
        order: typeof row.order_index === 'number' ? row.order_index : Number(row.order_index ?? 0),
        artifact: {
          id: row.artifact_id,
          title: row.artifact_title,
          uri: row.artifact_uri ?? undefined,
          description: row.artifact_description ?? undefined,
          created_at: row.artifact_created_at,
          updated_at: row.artifact_updated_at,
          version: row.artifact_version
        }
      };

      const bucket = result.get(row.task_id) ?? { deliverables: [], prerequisites: [] };
      if (!result.has(row.task_id)) result.set(row.task_id, bucket);

      if (assignment.role === 'deliverable') bucket.deliverables.push(assignment);
      else bucket.prerequisites.push(assignment);
    }

    taskIds.forEach((taskId) => {
      if (!result.has(taskId)) result.set(taskId, { deliverables: [], prerequisites: [] });
    });

    return result;
  }
}

export default TaskArtifactRepository;
