import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * 処理名: アーティファクト行の型定義 (ArtifactRow)
 *
 * 処理概要:
 * データベースの `artifacts` テーブルの1行を表す型定義です。
 * 各フィールドはDBスキーマに合わせて型付けされています。
 *
 * 実装理由（なぜ必要か）:
 * アプリケーション全体でアーティファクトのレコード構造を明確に共有するため。
 * 型情報により呼び出し側でのミスを減らし、取得/更新処理の安全性を高めます。
 */
export interface ArtifactRow {
    id: string;
    title: string;
    uri?: string | null;
    description?: string | null;
    created_at: string;
    updated_at: string;
    version: number;
}


/**
 * 処理名: アーティファクト一覧取得
 *
 * 処理概要:
 * データベースからすべてのアーティファクトをタイトル昇順で取得し、配列で返します。
 * UIの一覧表示やバッチ処理など、複数のアーティファクトを必要とする場面で利用されます。
 *
 * 実装理由（なぜ必要か）:
 * アーティファクトの一覧表示や選択リストを提供するための基本的な読み取りAPI。
 * 単純なSELECTで済むため高効率に一覧を取得できます。
 *
 * @param {Database} db sqlite Database
 * @returns {Promise<ArtifactRow[]>} アーティファクト配列
 */
export async function listArtifacts(db: Database): Promise<ArtifactRow[]> {
    return db.all<ArtifactRow[]>(
        `SELECT id, title, uri, description, created_at, updated_at, version
         FROM artifacts
         ORDER BY title ASC`
    );
}

/**
 * 処理名: アーティファクト取得
 *
 * 処理概要:
 * 指定されたIDに一致するアーティファクトを1件取得して返します。存在しない場合はnullを返します。
 *
 * 実装理由（なぜ必要か）:
 * アーティファクトの詳細表示、更新、削除など個別操作のために単一のレコードが必要となるため。
 * nullを返すことで呼び出し側が存在確認を行える設計になっています。
 *
 * @param {Database} db sqlite Database
 * @param {string} artifactId 取得するアーティファクトのID
 * @returns {Promise<ArtifactRow|null>} アーティファクト行または存在しない場合はnull
 */
export async function getArtifact(db: Database, artifactId: string): Promise<ArtifactRow | null> {
    const row = await db.get<ArtifactRow>(
        `SELECT id, title, uri, description, created_at, updated_at, version
         FROM artifacts
         WHERE id = ?`,
        artifactId
    );
    return row ?? null;
}

/**
 * 処理名: アーティファクト作成
 *
 * 処理概要:
 * 新しいアーティファクト行を生成し、UUIDを付与して `artifacts` テーブルに挿入します。
 * 挿入後に再度取得して、挿入された完全なレコードを返します。
 *
 * 実装理由（なぜ必要か）:
 * 新規アーティファクトを永続化する共通処理。挿入直後に完全なレコード（タイムスタンプやバージョンなど）を返すことで
 * クライアント側が一貫したデータを受け取れるようにします。
 *
 * @param {Database} db sqlite Database
 * @param {string} title アーティファクトのタイトル
 * @param {string} [uri] オプションのURI
 * @param {string} [description] オプションの説明
 * @returns {Promise<ArtifactRow>} 作成したアーティファクト行
 */
export async function createArtifact(db: Database, title: string, uri?: string, description?: string): Promise<ArtifactRow> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.run(
        `INSERT INTO artifacts (id, title, uri, description, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        id,
        title,
        uri ?? null,
        description ?? null,
        now,
        now
    );
    return (await getArtifact(db, id))!;
}

/**
 * 処理名: アーティファクト更新（楽観的ロック対応）
 *
 * 処理概要:
 * 指定されたアーティファクトを更新します。更新前に現在のレコードを取得し、
 * オプションの `ifVersion` を指定している場合はバージョン一致を確認します。
 * 問題なければフィールドを更新し、version をインクリメントして更新後のレコードを返します。
 *
 * 実装理由（なぜ必要か）:
 * 複数クライアントからの同時更新による競合を検出し、意図しない上書きを防止するため。
 * バージョンチェックにより安全に更新できるように設計されています。
 *
 * @param {Database} db sqlite Database
 * @param {string} artifactId 更新対象のアーティファクトID
 * @param {{title?: string, uri?: string|null, description?: string|null, ifVersion?: number}} updates 更新ペイロード
 * @param {string} [updates.title] 更新するタイトル（未指定の場合は既存値を保持）
 * @param {string|null} [updates.uri] 更新するURI（nullでURIを削除）
 * @param {string|null} [updates.description] 更新する説明（nullで説明を削除）
 * @param {number} [updates.ifVersion] 楽観的ロック用のバージョン（指定した場合は一致確認を行う）
 * @returns {Promise<ArtifactRow>} 更新後のアーティファクト行
 */
export async function updateArtifact(db: Database, artifactId: string, updates: { title?: string; uri?: string | null; description?: string | null; ifVersion?: number }): Promise<ArtifactRow> {
    const current = await getArtifact(db, artifactId);
    if (!current) throw new Error(`Artifact not found: ${artifactId}`);
    if (updates.ifVersion !== undefined && updates.ifVersion !== current.version) {
        throw new Error('Artifact has been modified by another user');
    }
    const now = new Date().toISOString();
    const newVersion = current.version + 1;
    await db.run(
        `UPDATE artifacts SET title = ?, uri = ?, description = ?, updated_at = ?, version = ? WHERE id = ?`,
        updates.title ?? current.title,
        updates.uri !== undefined ? updates.uri : current.uri ?? null,
        updates.description !== undefined ? updates.description : current.description ?? null,
        now,
        newVersion,
        artifactId
    );
    return (await getArtifact(db, artifactId))!;
}

/**
 * 処理名: アーティファクト削除
 *
 * 処理概要:
 * 指定したIDのアーティファクトを削除します。削除に成功したかどうかを真偽値で返します。
 *
 * 実装理由（なぜ必要か）:
 * 不要になったアーティファクトを永続層から除去するための基本操作。
 * 呼び出し側は戻り値で削除の成否を判断できます。
 *
 * @param {Database} db sqlite Database
 * @param {string} artifactId 削除対象のアーティファクトID
 * @returns {Promise<boolean>} 削除に成功した場合はtrue
 */
export async function deleteArtifact(db: Database, artifactId: string): Promise<boolean> {
    const result = await db.run(`DELETE FROM artifacts WHERE id = ?`, artifactId);
    return (result.changes ?? 0) > 0;
}
