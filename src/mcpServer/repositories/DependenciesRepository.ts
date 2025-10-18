import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection';

/**
 * DependenciesRepository は依存関係と関連アーティファクトを操作するリポジトリです。
 * @class
 */
export class DependenciesRepository {
  /**
   * コンストラクタ
   */
  constructor() { }

  /**
   * 処理名: 依存関係作成
   * 処理概要: dependencies レコードを作成し、関連する dependency_artifacts を同期する
   * 実装理由: 依存関係作成時にアーティファクトの紐付けも同時に行うことで整合性を保つため
   * @param fromTaskId 依存元タスクID
   * @param toTaskId 依存先タスクID
   * @param artifacts 成果物ID配列（省略可）
   * @returns 作成された依存関係オブジェクト（getDependencyById の形式）
   */
  async createDependency(fromTaskId: string, toTaskId: string, artifacts: string[] | undefined) {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    // Validate tasks exist to avoid foreign key constraint failures
    const fromTask = await db.get(`SELECT id FROM tasks WHERE id = ?`, fromTaskId);
    if (!fromTask) throw new Error(`Task not found (fromTaskId): ${fromTaskId}`);
    const toTask = await db.get(`SELECT id FROM tasks WHERE id = ?`, toTaskId);
    if (!toTask) throw new Error(`Task not found (toTaskId): ${toTaskId}`);

    // Validate artifacts exist before inserting dependency_artifacts
    await this.validateArtifactsExist(db, artifacts);

    await db.run('BEGIN');
    try {
      await db.run(
        `INSERT INTO dependencies (id, from_task_id, to_task_id, created_at) VALUES (?, ?, ?, ?)`,
        id,
        fromTaskId,
        toTaskId,
        now
      );

      if (Array.isArray(artifacts) && artifacts.length > 0) {
        let idx = 0;
        for (const aId of artifacts) {
          await db.run(
            `INSERT INTO dependency_artifacts (id, dependency_id, artifact_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)`,
            uuidv4(),
            id,
            aId,
            idx,
            now
          );
          idx += 1;
        }
      }

      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }

    return this.getDependencyById(id);
  }

  /**
   * 処理名: 依存関係更新
   * 処理概要: 既存の dependencies レコードを更新し、依存に紐づく dependency_artifacts を置換する
   * 実装理由: 依存関係の変更が発生した際にアーティファクトの差し替えを原子的に行うため
   * @param dependencyId 更新対象の依存関係ID
   * @param fromTaskId 依存元タスクID
   * @param toTaskId 依存先タスクID
   * @param artifacts 成果物ID配列（省略可）
   * @returns 更新後の依存関係オブジェクト
   */
  async updateDependency(dependencyId: string, fromTaskId: string, toTaskId: string, artifacts: string[] | undefined) {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Ensure dependency exists
    const existing = await db.get(`SELECT id FROM dependencies WHERE id = ?`, dependencyId);
    if (!existing) throw new Error(`Dependency not found: ${dependencyId}`);

    // Validate tasks exist
    const fromTask = await db.get(`SELECT id FROM tasks WHERE id = ?`, fromTaskId);
    if (!fromTask) throw new Error(`Task not found (fromTaskId): ${fromTaskId}`);
    const toTask = await db.get(`SELECT id FROM tasks WHERE id = ?`, toTaskId);
    if (!toTask) throw new Error(`Task not found (toTaskId): ${toTaskId}`);

    // Validate artifacts exist
    await this.validateArtifactsExist(db, artifacts);

    await db.run('BEGIN');
    try {
      await db.run(
        `UPDATE dependencies SET from_task_id = ?, to_task_id = ? WHERE id = ?`,
        fromTaskId,
        toTaskId,
        dependencyId
      );

      await db.run(`DELETE FROM dependency_artifacts WHERE dependency_id = ?`, dependencyId);

      if (Array.isArray(artifacts) && artifacts.length > 0) {
        let idx = 0;
        for (const aId of artifacts) {
          await db.run(
            `INSERT INTO dependency_artifacts (id, dependency_id, artifact_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)`,
            uuidv4(),
            dependencyId,
            aId,
            idx,
            now
          );
          idx += 1;
        }
      }

      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }

    return this.getDependencyById(dependencyId);
  }

  /**
   * 処理名: 依存関係削除
   * 処理概要: dependencies レコードを削除し、関連する dependency_artifacts は外部キーで CASCADE される
   * 実装理由: 依存を削除する際に関連する紐付けも一括で削除されることを期待するため
   * @param dependencyId 削除対象の依存関係ID
   * @returns 削除に成功したら true を返す
   */
  async deleteDependency(dependencyId: string) {
    const db = await getDatabase();
    const existing = await db.get(`SELECT id FROM dependencies WHERE id = ?`, dependencyId);
    if (!existing) return false;
    const res = await db.run(`DELETE FROM dependencies WHERE id = ?`, dependencyId);
    return (res.changes ?? 0) > 0;
  }

  /**
   * 処理名: 依存関係取得（ID）
   * 処理概要: 指定IDの dependencies レコードと、それに紐づく dependency_artifacts を取得して返す
   * 実装理由: ツールや API が依存関係と紐づく成果物一覧を一度に取得できるようにするため
   * @param dependencyId 取得対象の依存関係ID
   * @returns 依存関係オブジェクトまたは null
   */
  async getDependencyById(dependencyId: string) {
    const db = await getDatabase();
    const dep = await db.get<any>(`SELECT id, from_task_id AS fromTaskId, to_task_id AS toTaskId, created_at FROM dependencies WHERE id = ?`, dependencyId);
    if (!dep) return null;
    const rows = await db.all<any[]>(`SELECT id, artifact_id AS artifactId, order_index AS orderIndex, created_at FROM dependency_artifacts WHERE dependency_id = ? ORDER BY order_index ASC`, dependencyId);
    return { dependencyId: dep.id, fromTaskId: dep.fromTaskId, toTaskId: dep.toTaskId, createdAt: dep.created_at, artifacts: rows.map(r => ({ id: r.id, artifactId: r.artifactId, orderIndex: r.orderIndex, createdAt: r.created_at })) };
  }

  /**
   * 処理名: タスクに関連する依存関係収集
   * 処理概要: 複数のタスクIDに対して、それぞれが持つ依存の from/to および関連アーティファクト一覧を取得して Map に変換する
   * 実装理由: TaskRepository がタスク一覧/ツリーを返す際に dependencies 情報を付与するための補助メソッド
   * @param taskIds タスクIDの配列
   * @returns Map<string, { dependents: any[]; dependees: any[] }>
   */
  async collectDependenciesForTasks(taskIds: string[]) {
    const result = new Map<string, { dependents: any[]; dependees: any[] }>();
    if (!Array.isArray(taskIds) || taskIds.length === 0) return result;
    const db = await getDatabase();
    const placeholders = taskIds.map(() => '?').join(', ');

    // 依存元（from_task_id）と依存先（to_task_id）の両方で検索して、それぞれをバケット化する
    const rows = await db.all<any[]>(
      `SELECT d.id AS dependency_id, d.from_task_id AS from_task_id, d.to_task_id AS to_task_id, da.id AS da_id, da.artifact_id AS artifact_id, da.order_index AS order_index
       FROM dependencies d
       LEFT JOIN dependency_artifacts da ON da.dependency_id = d.id
       WHERE d.from_task_id IN (${placeholders}) OR d.to_task_id IN (${placeholders})
       ORDER BY d.id, da.order_index ASC`,
      ...taskIds,
      ...taskIds
    );

    for (const row of rows) {
      this.processDependencyRow(row, taskIds, result);
    }

    // ensure all taskIds present
    for (const t of taskIds) {
      if (!result.has(t)) result.set(t, { dependents: [], dependees: [] });
    }

    return result;
  }

  /**
   * 単一のDB行を解析して結果Mapに反映するヘルパ
   * @param row DBの行オブジェクト
   * @param taskIds 対象のタスクID配列
   * @param result 結果を格納するMap
   * @private
   */
  private processDependencyRow(row: any, taskIds: string[], result: Map<string, { dependents: any[]; dependees: any[] }>) {
    const depId = row.dependency_id;
    const fromId = row.from_task_id;
    const toId = row.to_task_id;
    const artifact = row.da_id ? { id: row.da_id, artifactId: row.artifact_id, order: typeof row.order_index === 'number' ? row.order_index : Number(row.order_index ?? 0) } : null;

    this.handleFromRow(depId, fromId, toId, artifact, taskIds, result);
    this.handleToRow(depId, fromId, toId, artifact, taskIds, result);
  }

  /**
   * fromId 側の行を処理して dependents を追加する
   * @private
   * @param depId 依存関係ID
   * @param fromId 依存元タスクID
   * @param toId 依存先タスクID
   * @param artifact 依存に紐づくアーティファクト（または null）
   * @param taskIds 対象タスクID配列
   * @param result 結果Map
   */
  private handleFromRow(depId: string, fromId: string, toId: string, artifact: any, taskIds: string[], result: Map<string, { dependents: any[]; dependees: any[] }>) {
    if (!taskIds.includes(fromId)) return;
    if (!result.has(fromId)) result.set(fromId, { dependents: [], dependees: [] });
    const bucket = result.get(fromId)!;
    let dep = bucket.dependents.find((d: any) => d.dependencyId === depId);
    if (!dep) {
      dep = { dependencyId: depId, fromTaskId: fromId, toTaskId: toId, artifacts: [] };
      bucket.dependents.push(dep);
    }
    if (artifact) dep.artifacts.push(artifact);
  }

  /**
   * toId 側の行を処理して dependees を追加する
   * @private
   * @param depId 依存関係ID
   * @param fromId 依存元タスクID
   * @param toId 依存先タスクID
   * @param artifact 依存に紐づくアーティファクト（または null）
   * @param taskIds 対象タスクID配列
   * @param result 結果Map
   */
  private handleToRow(depId: string, fromId: string, toId: string, artifact: any, taskIds: string[], result: Map<string, { dependents: any[]; dependees: any[] }>) {
    if (!taskIds.includes(toId)) return;
    if (!result.has(toId)) result.set(toId, { dependents: [], dependees: [] });
    const bucket = result.get(toId)!;
    let dep = bucket.dependees.find((d: any) => d.dependencyId === depId);
    if (!dep) {
      dep = { dependencyId: depId, fromTaskId: fromId, toTaskId: toId, artifacts: [] };
      bucket.dependees.push(dep);
    }
    if (artifact) dep.artifacts.push(artifact);
  }

  /**
   * artifacts 配列の存在を検証するヘルパ
   * @param db DB 接続オブジェクト
   * @param artifacts チェックするアーティファクトID配列
   * @returns Promise<void>
   * @private
   */
  private async validateArtifactsExist(db: any, artifacts: string[] | undefined) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) return;
    const missing: string[] = [];
    for (const aId of artifacts) {
      const art = await db.get(`SELECT id FROM artifacts WHERE id = ?`, aId);
      if (!art) missing.push(aId);
    }
    if (missing.length > 0) throw new Error(`Artifact(s) not found: ${missing.join(', ')}`);
  }
}

export default DependenciesRepository;
