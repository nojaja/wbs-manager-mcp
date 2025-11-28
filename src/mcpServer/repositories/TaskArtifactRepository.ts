import type { TaskArtifactAssignment, TaskArtifactRole } from '../db/types';
import { randomUUID } from 'node:crypto';
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
   * 処理名: タスク-成果物マップ作成
   * 処理概要: 指定タスクと成果物の関連付けを新規作成し、DB に保存する
   * 実装理由: タスクに対して成果物を割り当てる操作を提供するため
   * @param {string} taskId Task id to associate the artifact with
   * @param {string} artifactId Artifact id to be associated
   * @returns {Promise<TaskArtifactAssignment>} Created task-artifact assignment
   */
  async createTaskArtifactMap(
    taskId: string,
    artifactId: string
  ): Promise<TaskArtifactAssignment> {
    const db = await getDatabase();
    const id = randomUUID();
    const now = new Date().toISOString();

    const defaultRole: TaskArtifactRole = 'deliverable';
    await db.run(
      `INSERT INTO task_artifacts (
          id, task_id, artifact_id, role, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      taskId,
      artifactId,
      defaultRole,
      now,
      now
    );

    // Return object shaped as TaskArtifactAssignment
    return {
      id: id,
      taskId: taskId,
      artifactId: artifactId,
      role: defaultRole,
      order: 0,
      artifact: {
        id: artifactId,
        title: '',
        created_at: now,
        updated_at: now,
        version: 1
      }
    };
  }

  /**
   * 処理名: taskIdに紐づく成果物ID取得
   * 処理概要: task_id の成果物IDを DB から取得する
   * @param {string} taskId タスク ID
   * @returns {Promise<string[]>} 成果物IDの配列
   */
  async getArtifactIdsByTaskIds(
    taskId: string
  ): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.all<Array<any>>(
      `SELECT
            id,
            task_id,
            artifact_id,
            crud_operations
         FROM task_artifacts
         WHERE task_id = ?
         ORDER BY order_index`,
      taskId
    );

    if (rows.length === 0) return [];

    return rows.map(row => row.id);
  }

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
        randomUUID(),
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
        taskId: row.task_id,
        artifactId: row.artifact_id,
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
