import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import * as TARepo from './TaskArtifactRepository';
import * as CCRepo from './CompletionConditionRepository';

/**
 * 処理名: タスク行データ型定義 (TaskRow)
 * 処理概要: データベース上の `tasks` テーブルの1行を表現するインタフェースです。
 * 実装理由: 型安全にDB行のプロパティを扱うため。各フィールドの存在や型を明示することで
 *          上位レイヤーやテストでの誤用を防ぎ、リファクタリングを容易にします。
 */
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
 * 処理名: タスク作成 (insertTask)
 * 処理概要: 新しいタスクを `tasks` テーブルに挿入し、生成された UUID の id を返します。
 * 実装理由: タスク作成時に一貫した初期値（status='draft', version=1, 作成/更新日時）を
 *          設定するため。呼び出し側はこの関数を使うことでID生成とDB挿入の責務を委譲できます。
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
 * 処理名: タスク取得 (getTaskRow)
 * 処理概要: 指定した id を持つタスク行を `tasks` テーブルから取得して返します。
 * 実装理由: 単一タスクの詳細表示や更新前チェックなど、タスク単体を参照するユースケースで
 *          再利用できるように抽象化しています。存在しない場合は null を返します。
 * @param {Database} db sqlite Database
 * @param {string} id task id
 * @returns {Promise<TaskRow|null>}
 */
export async function getTaskRow(db: Database, id: string): Promise<TaskRow | null> {
    // DBから単一行を取得する
    // 処理概要: id をキーに tasks テーブルから該当行を取得する
    // 実装理由: 単一タスクの詳細表示や更新前チェックのため、存在しない場合は null を返して呼び出し側でハンドリング可能にする
    const row = await db.get<TaskRow>(
        `SELECT id, parent_id, title, description, assignee, status, estimate, created_at, updated_at, version
         FROM tasks WHERE id = ?`,
        id
    );
    // 存在しない場合は null を返す（呼び出し元の判定を容易にするため）
    return row ?? null;
}

/**
 * 処理名: タスク更新 (updateTaskRow)
 * 処理概要: 指定した id のタスク行のフィールドを更新します。更新日時とバージョンを上書きします。
 * 実装理由: タスクの編集操作（タイトル/説明/担当者/ステータス/見積り）をまとめてDBへ反映する
 *          ための共通処理です。呼び出し側は部分的な更新オブジェクトを渡すことで柔軟に利用できます。
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
 * 処理名: タスク削除 (deleteTaskRow)
 * 処理概要: 指定した id を持つタスク行を `tasks` テーブルから削除します。削除が成功したかを真偽で返却します。
 * 実装理由: タスク削除の一貫した挙動を提供するため。呼び出し側は戻り値で削除の成否を確認できます。
 * @param {Database} db sqlite Database
 * @param {string} id task id
 * @returns {Promise<boolean>}
 */
export async function deleteTaskRow(db: Database, id: string): Promise<boolean> {
    // タスク行を削除する
    // 処理概要: 指定 id の行を削除し、削除件数が1以上なら true を返す
    // 実装理由: 削除の成否を呼び出し側が簡単に判定できるようにし、関連データの後続処理（例: 子タスクのチェック）に繋げられるようにする
    const result = await db.run(`DELETE FROM tasks WHERE id = ?`, id);
    return (result.changes ?? 0) > 0;
}

/**
 * 処理名: タスク一覧取得 (listTaskRows)
 * 処理概要: 指定した親タスクIDの直下にあるタスク一覧を作成日時順に取得します。
 *          parentId が未指定または null の場合はトップレベル（parent_id IS NULL）のタスクを返します。
 * 実装理由: ツリー表示や親フォルダごとのタスク一覧を表示する際に使う汎用的な取得処理を提供するため。
 * @param {Database} db sqlite Database
 * @param {string|null} [parentId]
 * @returns {Promise<TaskRow[]>}
 */
export async function listTaskRows(db: Database, parentId?: string | null): Promise<TaskRow[]> {
    // 親IDに応じた一覧を取得する
    // 処理概要: parentId が未指定/NULL の場合はトップレベル（parent_id IS NULL）を取得し、そうでなければ指定 parent_id の子を取得する
    // 実装理由: ツリー表示や親ごとの一覧取得で使い分けるための単一メソッドとして提供。サブクエリで子数を取得してUI側での表示に利用できるようにする
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
 * 処理名: タスクツリー取得 (getTaskTree)
 * 処理概要: 指定した root taskId を起点に、そのノード自身とすべての子孫ノードを再帰的に取得し、
 *          各タスクに紐づくアーティファクト（成果物・前提）および完了条件を集約してツリー構造で返します。
 *          taskId が null の場合は全トップレベルノードの配列を返します。
 * 実装理由: ツリー表示やエクスポート等で階層全体を一度に取得する必要があるため。再帰CTEで効率的に行を取り出し、
 *          その後関連データをまとめて結合することでDBアクセス回数を抑えつつ整形されたオブジェクトを返します。
 * @param {Database} db sqlite Database
 * @param {string|null} taskId root task id, or null to fetch all tasks
 * @returns {Promise<any|null>} tree root object when taskId provided, or array of roots when taskId is null
 */
export async function getTaskTree(db: Database, taskId: string | null): Promise<any> {
    // 再帰CTEを使ってツリーのノード群を取得する
    // 処理概要: 指定 root (taskId) がある場合はそのノードを起点に再帰的に子孫を取得し、ない場合はトップレベルノード群を取得する
    // 実装理由: 階層構造の全ノードを効率的に1クエリで取得するため。取得後に関連アーティファクトと完了条件をまとめて結合し、
    //          ツリー構造のオブジェクトを作成して返す（DBアクセス回数を削減し整形を容易にするため）。
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

    // 取得結果が空なら、単一ルート指定時は null、全体取得時は空配列を返す（呼び出し側の判定を容易に）
    if (!rows || rows.length === 0) return taskId ? null : [];

    // 取得したノード群のIDを抜き出し、関連するアーティファクトと完了条件をまとめて取得する
    // 実装理由: 関連データを個別に取得するとDBアクセス回数が増えるため、一括で集めてメモリ内で結合する
    const ids = rows.map((r: any) => r.id);
    const taskArtifacts = await TARepo.collectTaskArtifacts(db, ids);
    const completionConditions = await CCRepo.collectCompletionConditions(db, ids);

    // taskMap に各ノードのオブジェクト（子配列・deliverables/prerequisites/completionConditions を含む）を作成して格納
    // 実装理由: 後続の子リンク処理で O(1) でノード参照できるようにするため
    const taskMap = new Map<string, any>();
    rows.forEach((r: any) => {
        const artifactInfo = taskArtifacts.get(r.id) ?? [];
        const deliverables = (artifactInfo as any[]).filter((a: any) => a.role === 'deliverable').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations ?? null, order: a.order_index }));
        const prerequisites = (artifactInfo as any[]).filter((a: any) => a.role === 'prerequisite').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations ?? null, order: a.order_index }));
        taskMap.set(r.id, { ...r, children: [], deliverables, prerequisites, completionConditions: completionConditions.get(r.id) ?? [] });
    });

    // children をリンクする
    // 処理概要: 各ノードの parent_id を見て親ノードの children 配列へ参照を追加する
    // 実装理由: 木構造として返すために子参照を集める。Map を使うことで効率的にリンク可能
    rows.forEach((r: any) => {
        if (r.parent_id && taskMap.has(r.parent_id)) {
            taskMap.get(r.parent_id).children.push(taskMap.get(r.id));
        }
    });

    // ルート指定がある場合はそのノードを返す
    if (taskId) return taskMap.get(taskId) ?? null;

    // ルートがない（全体取得）場合はトップレベルのノードを配列で返す
    const roots = rows.filter((r: any) => !r.parent_id).map((r: any) => taskMap.get(r.id));
    return roots;
}
