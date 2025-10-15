import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';

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
 * List all artifacts.
 * @param {Database} db sqlite Database
 * @returns {Promise<ArtifactRow[]>} list of artifacts
 */
export async function listArtifacts(db: Database): Promise<ArtifactRow[]> {
    return db.all<ArtifactRow[]>(
        `SELECT id, title, uri, description, created_at, updated_at, version
         FROM artifacts
         ORDER BY title ASC`
    );
}

/**
 * Get single artifact by id
 */

/**
 * Get an artifact by id.
 * @param {Database} db sqlite Database
 * @param {string} artifactId artifact id
 * @returns {Promise<ArtifactRow|null>} artifact row or null
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
 * Create a new artifact row
 */

/**
 * Create a new artifact.
 * @param {Database} db sqlite Database
 * @param {string} title artifact title
 * @param {string} [uri] optional uri
 * @param {string} [description] optional description
 * @returns {Promise<ArtifactRow>} created artifact
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
 * Update an artifact with optimistic locking support
 */

/**
 * Update an artifact with optimistic locking support.
 * @param {Database} db sqlite Database
 * @param {string} artifactId artifact id
 * @param {{title?: string, uri?: string|null, description?: string|null, ifVersion?: number}} updates update payload
 * @param {string} [updates.title]
 * @param {string|null} [updates.uri]
 * @param {string|null} [updates.description]
 * @param {number} [updates.ifVersion]
 * @returns {Promise<ArtifactRow>} updated artifact
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
 * Delete artifact by id
 */

/**
 * Delete an artifact by id.
 * @param {Database} db sqlite Database
 * @param {string} artifactId artifact id
 * @returns {Promise<boolean>} true if deleted
 */
export async function deleteArtifact(db: Database, artifactId: string): Promise<boolean> {
    const result = await db.run(`DELETE FROM artifacts WHERE id = ?`, artifactId);
    return (result.changes ?? 0) > 0;
}
