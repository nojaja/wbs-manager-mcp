import type { Artifact } from '../db/types';
import { getDatabase } from '../db/connection';

/**
 * 処理名: ArtifactRepository（アーティファクト永続化レイヤ）
 * 処理概要: アーティファクトの一覧取得・取得・作成・更新・削除を提供するリポジトリクラス
 * 実装理由: アーティファクトに関する DB 操作を一箇所に集約して責務を分離し、呼び出し側のロジックを簡潔にするため
 * @class
 */
export class ArtifactRepository {
  /**
   * コンストラクタ: ArtifactRepository のインスタンスを生成する
   * 主に依存注入や初期化処理を将来ここに追加するためのプレースホルダ
   * @returns {void}
   */
  constructor() { }

  /**
   * 処理名: アーティファクト一覧取得
   * 処理概要: artifacts テーブルから全件をタイトル順で取得して返す
   * 実装理由: UI で表示するために整列済みの一覧を提供する必要があるため
   * @returns {Promise<Artifact[]>}
   */
  async listArtifacts(): Promise<Artifact[]> {
    const db = await getDatabase();
    const rows = await db.all<Artifact[]>(
      `SELECT id, title, uri, description, created_at, updated_at, version
       FROM artifacts
       ORDER BY title ASC`
    );
    return rows;
  }

  /**
   * 処理名: アーティファクト取得
   * 処理概要: 指定 ID の artifacts テーブル行を取得して返す
   * 実装理由: 詳細表示や参照チェックのために単一レコードを取得できる必要があるため
   * @param {string} artifactId
  * @returns {Promise<Artifact|null>}
   */
  async getArtifact(artifactId: string): Promise<Artifact | null> {
    const db = await getDatabase();
    const artifact = await db.get<Artifact>(
      `SELECT id, title, uri, description, created_at, updated_at, version
       FROM artifacts
       WHERE id = ?`,
      artifactId
    );
    return artifact ?? null;
  }

  /**
   * 処理名: アーティファクト作成
   * 処理概要: 新しいアーティファクトを作成し、作成後のレコードを返す
   * 実装理由: 一意 ID とタイムスタンプを付与して DB に保存するための基本操作を提供するため
   * @param {string} title
   * @param {string} [uri]
   * @param {string} [description]
   * @returns {Promise<Artifact>}
   */
  async createArtifact(title: string, uri?: string, description?: string): Promise<Artifact> {
    const db = await getDatabase();
    const id = require('uuid').v4();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO artifacts (
          id, title, uri, description, created_at, updated_at, version
       ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      id,
      title,
      uri ?? null,
      description ?? null,
      now,
      now
    );
    return (await this.getArtifact(id))!;
  }

  /**
   * 処理名: アーティファクト更新
   * 処理概要: 指定された更新内容を反映し、楽観的ロック（ifVersion）をサポートして更新済みレコードを返す
   * 実装理由: 同時更新の衝突を検出し、整合性のある更新を行うため
   * @param {string} artifactId
  * @param {{ title?: string; uri?: string | null; description?: string | null; ifVersion?: number }} updates
  * @param {string} [updates.title] 更新後のタイトル
  * @param {string|null} [updates.uri] 更新後のURI
  * @param {string|null} [updates.description] 更新後の説明
  * @param {number} [updates.ifVersion] 楽観ロック用のバージョン
   * @returns {Promise<Artifact>}
   */
  async updateArtifact(
    artifactId: string,
    updates: { title?: string; uri?: string | null; description?: string | null; ifVersion?: number }
  ): Promise<Artifact> {
    const db = await getDatabase();
    const current = await this.getArtifact(artifactId);
    if (!current) throw new Error(`Artifact not found: ${artifactId}`);
    if (updates.ifVersion !== undefined && updates.ifVersion !== current.version) {
      throw new Error('Artifact has been modified by another user');
    }
    const now = new Date().toISOString();
    const newVersion = current.version + 1;
    await db.run(
      `UPDATE artifacts
       SET title = ?,
           uri = ?,
           description = ?,
           updated_at = ?,
           version = ?
       WHERE id = ?`,
      updates.title ?? current.title,
      updates.uri !== undefined ? updates.uri : current.uri ?? null,
      updates.description !== undefined ? updates.description : current.description ?? null,
      now,
      newVersion,
      artifactId
    );
    return (await this.getArtifact(artifactId))!;
  }

  /**
   * 処理名: アーティファクト削除
   * 処理概要: 指定 ID のアーティファクトを削除する
   * 実装理由: 不要になったアーティファクトの削除と、それに紐づくリソース管理を行うため
   * @param {string} artifactId
   * @returns {Promise<boolean>}
   */
  async deleteArtifact(artifactId: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.run(`DELETE FROM artifacts WHERE id = ?`, artifactId);
    return (result.changes ?? 0) > 0;
  }
}

export default ArtifactRepository;
