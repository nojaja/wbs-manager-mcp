import { Database } from 'sqlite';
import * as TaskRepo from '../repositories/TaskRepository';
import * as ArtifactRepo from '../repositories/ArtifactRepository';
import * as TARepo from '../repositories/TaskArtifactRepository';
import * as CCRepo from '../repositories/CompletionConditionRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * TaskService
 *
 * 処理名: タスク業務サービス
 * 処理概要: タスクの作成・更新・削除・移動、および関連するアーティファクトや完了条件の同期を行う高レベル業務ロジックを提供します。
 * 実装理由: 複数テーブルにまたがる操作（タスク本体、タスク⇄アーティファクト、完了条件等）をトランザクション内で一元管理し、データ整合性と再利用可能なビジネスロジックを確保するため。
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
     * 処理名: タスク作成
     * 処理概要: タスク行を作成し、オプションで渡された成果物(deliverables)、前提(prerequisites)、完了条件(completionConditions)を同期します。操作はトランザクション内で行われます。
     * 実装理由: タスク作成時に関連データを同時に登録することで参照整合性を保ち、途中失敗時はロールバックして不整合な状態を防ぐため。
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
    // タイトル/説明/見積りの存在チェック
    // 処理概要: 各フィールドが空文字でないかを判定し、ステータスの初期値（draft/pending）を決定する
    // 実装理由: 必要情報が揃っている場合は 'pending' にして作業進行中として扱い、揃っていない場合は下書き(draft)として保存するため
    const hasTitle = !!(title && String(title).trim().length > 0);
    const hasDescription = !!(description && String(description).trim().length > 0);
    const hasEstimate = !!(estimate && String(estimate).trim().length > 0);
    // ステータス決定 (全てそろっている -> pending, そうでなければ draft)
    const status = (hasTitle && hasDescription && hasEstimate) ? 'pending' : 'draft';

        // トランザクション開始 -> タスクと関連データを原子操作で登録
        // 処理概要: トランザクションを開始し、タスク行を作成してから関連テーブルを同期。失敗時はロールバックする。
        // 実装理由: タスク本体と関連情報の整合性を担保するため一連の操作を原子性で実行する必要がある
        await this.db.run('BEGIN');
        try {
            // タスク本体を挿入
            const id = await TaskRepo.insertTask(this.db, { title, description: description ?? null, parent_id: parentId ?? null, assignee: assignee ?? null, status, estimate: estimate ?? null });
            const now = new Date().toISOString();
            // 成果物/前提/完了条件を個別ヘルパーで同期（ヘルパー内部で削除->再挿入の方式で反映）
            await this.syncDeliverables(id, options?.deliverables ?? [], now);
            await this.syncPrerequisites(id, options?.prerequisites ?? [], now);
            await this.syncCompletionConditions(id, options?.completionConditions ?? [], now);

            // 全て成功したらコミット
            await this.db.run('COMMIT');
            return id;
        } catch (e) {
            // 何らかのエラーが発生した場合はロールバックして呼び出し元に例外を伝播
            await this.db.run('ROLLBACK');
            throw e;
        }
    }

    /**
    * 処理名: 成果物同期
    * 処理概要: 指定タスクに紐づく成果物(task-artifact)を一旦削除し、渡された配列に基づいて再登録します。削除→挿入の方式で順序やCRUD操作指定を反映します。
    * 実装理由: 成果物一覧はフルセットで更新されることが多いため、差分を個別計算する代わりにクリアして再挿入することで実装を簡潔にし、順序やCRUD操作の確実な反映を担保します。
    * @private
    * @param {string} taskId タスクID
    * @param {Array<any>} deliverables deliverables 配列
    * @param {string} now ISO 時刻文字列
    * @returns {Promise<void>}
     */
    private async syncDeliverables(taskId: string, deliverables: Array<any>, now: string) {
        // 既存の成果物関連行を消してから再挿入する
        // 処理概要: 指定ロール('deliverable')のタスク関連行を削除し、渡された配列の順序で再追加する
        // 実装理由: フルリプレース方式で確実に最新の成果物セットを反映させ、順序や CRUD 指定を簡潔に扱うため
        await TARepo.deleteTaskArtifactsByTaskAndRole(this.db, taskId, 'deliverable');
        let idx = 0;
        for (const d of deliverables ?? []) {
            // 無効なエントリはスキップ
            if (!d?.artifactId) continue;
            // 参照先アーティファクトが存在するか確認
            const art = await ArtifactRepo.getArtifact(this.db, d.artifactId);
            if (!art) throw new Error(`Artifact not found: ${d.artifactId}`);
            // 正常なら関連テーブルへ挿入
            await TARepo.insertTaskArtifact(this.db, taskId, d.artifactId, 'deliverable', d.crudOperations ?? null, idx++, now);
        }
    }

    /**
     * Helper: sync prerequisites for a task
    * 処理名: 前提成果物同期
    * 処理概要: 指定タスクに紐づく前提(prerequisite)を一旦削除し、渡された配列に基づいて再登録します。
    * 実装理由: 前提関係の更新もフルリプレース方式で扱うことで、古い参照の残存を防ぎデータ整合性を簡潔に維持するため。
    * @private
    * @param {string} taskId タスクID
    * @param {Array<any>} prerequisites prerequisites 配列
    * @param {string} now ISO 時刻文字列
    * @returns {Promise<void>}
     */
    private async syncPrerequisites(taskId: string, prerequisites: Array<any>, now: string) {
        // 既存の前提関連行を削除してから再挿入する（フルリプレース）
        // 処理概要: 'prerequisite' ロールのタスク関連をクリアし、渡された配列の順序で再登録する
        // 実装理由: 前提関係の古い参照を残さず、最新状態を確実に反映するため
        await TARepo.deleteTaskArtifactsByTaskAndRole(this.db, taskId, 'prerequisite');
        let idx = 0;
        for (const p of prerequisites ?? []) {
            // 無効なエントリは無視
            if (!p?.artifactId) continue;
            const art = await ArtifactRepo.getArtifact(this.db, p.artifactId);
            if (!art) throw new Error(`Artifact not found: ${p.artifactId}`);
            await TARepo.insertTaskArtifact(this.db, taskId, p.artifactId, 'prerequisite', p.crudOperations ?? null, idx++, now);
        }
    }

    /**
     * Helper: sync completion conditions for a task
    * 処理名: 完了条件同期
    * 処理概要: 指定タスクに紐づく完了条件を削除してから、与えられた条件を順序付きで挿入します。空の条件は無視します。
    * 実装理由: 完了条件は順序や内容の確実な反映が重要なため、既存をクリアしてから再登録することで更新処理を簡潔かつ確実に行えるため。
    * @private
    * @param {string} taskId タスクID
    * @param {Array<any>} conditions completion conditions 配列
    * @param {string} now ISO 時刻文字列
    * @returns {Promise<void>}
     */
    private async syncCompletionConditions(taskId: string, conditions: Array<any>, now: string) {
        // 完了条件を一旦全削除してから有効な条件のみ順序付きで挿入する
        // 処理概要: 既存完了条件を削除し、空でない説明文のみを順に追加する
        // 実装理由: 完了条件は順序と内容が重要なため、フルクリア→再登録で確実に反映する
        await CCRepo.deleteCompletionConditionsByTask(this.db, taskId);
        let idx = 0;
        for (const c of conditions ?? []) {
            const desc = (c?.description ?? '').trim();
            // 空の説明はスキップして不要な空行登録を防止
            if (desc.length === 0) continue;
            await CCRepo.insertCompletionCondition(this.db, taskId, desc, idx++, now);
        }
    }

    /**
    * 処理名: タスク一覧取得
    * 処理概要: 指定した親IDの直下にあるタスク行を取得し、各タスクに紐づく成果物（deliverables/prerequisites）と完了条件を集約して返します。
    * 実装理由: リポジトリ層からの複数クエリ結果を組み合わせてクライアントに便利な形で返すことで、プレゼンテーション層の負担を軽減します。
    * @param {string|null} [parentId]
    * @returns {Promise<any[]>}
     */
    async listTasks(parentId?: string | null) {
        // リポジトリからタスク行を取得し、関連成果物と完了条件を集約してクライアント向けの形に整形
        // 処理概要: タスク行を取得 -> ID一覧から関連テーブルを一括取得 -> 各行に deliverables/prerequisites/completionConditions を付与して返却
        // 実装理由: 複数テーブルを個別に問い合わせた結果をサービス側で組み合わせることで、呼び出し側の処理を単純化するため
        const rows = await TaskRepo.listTaskRows(this.db, parentId);
        const ids = rows.map(r => r.id);
        const taskArtifacts = await TARepo.collectTaskArtifacts(this.db, ids);
        const completionConditions = await CCRepo.collectCompletionConditions(this.db, ids);
        return rows.map((row: any) => {
            const artifactInfo = taskArtifacts.get(row.id) ?? [];
            // 成果物を役割ごとに分離して整形
            const deliverables = artifactInfo.filter((a: any) => a.role === 'deliverable').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations, order: a.order_index }));
            const prerequisites = artifactInfo.filter((a: any) => a.role === 'prerequisite').map((a: any) => ({ id: a.id, artifact_id: a.artifact_id, role: a.role, crudOperations: a.crud_operations, order: a.order_index }));
            return { ...row, children: [], deliverables, prerequisites, completionConditions: completionConditions.get(row.id) ?? [] };
        });
    }

    /**
     * 処理名: タスク取得（ツリー）
     * 処理概要: 指定タスクのツリー構造（子孫を含む）および関連データを取得します。実際のツリー構築はリポジトリ層の再帰的CTEに委譲します。
     * 実装理由: ツリー取得はSQL側で効率的に行う方が高速かつシンプルであるため、レポジトリに任せて結果をそのまま返却します。
     * @param {string} taskId
     * @returns {Promise<any|null>}
     */
    async getTask(taskId: string) {
    // 複雑なツリー構築はリポジトリ（SQLの再帰CTE）に委譲して結果をそのまま返す
    // 処理概要: 指定タスクの子孫を含むツリーを取得する。DB側で効率的に集計して返却するため、ここでは単純に委譲
    // 実装理由: 大量データや深い階層の検索はSQLで処理する方が効率的であり、アプリケーション側で再構築する負担を避けるため
    return TaskRepo.getTaskTree(this.db, taskId);
    }

    /**
    * 処理名: タスク更新
    * 処理概要: 指定タスクのフィールドを更新し、必要に応じて成果物・前提・完了条件を同期します。楽観的ロック（ifVersion）チェックを行います。
    * 実装理由: 更新時に関連テーブルも同時に扱う必要があり、競合検知とトランザクションによる整合性確保が必須であるため、このサービス層で一括管理します。
    * @param {string} taskId
    * @param {any} updates
    * @returns {Promise<any>} updated task
     */
    async updateTask(taskId: string, updates: any) {
        // 更新前チェック: 存在確認および楽観的ロック(ifVersion)検証
        // 処理概要: 対象タスクを取得し、存在しない場合はエラー。ifVersionが指定されている場合はバージョン不一致で競合エラーを返す
        // 実装理由: 複数クライアントによる競合更新を検出し、不整合な上書きを防ぐため
        const current = await this.getTask(taskId);
        if (!current) throw new Error(`Task not found: ${taskId}`);
        if (updates.ifVersion !== undefined && updates.ifVersion !== current.version) throw new Error('Task has been modified by another user');

        const now = new Date().toISOString();
        const newVersion = current.version + 1;

        // トランザクション開始 -> タスク更新と関連データの同期を原子操作で行う
        // 処理概要: tasks テーブルの更新を実行し、必要に応じて関連データの同期ヘルパーを呼ぶ。例外時はロールバック。
        // 実装理由: 更新処理中に途中失敗が発生すると不整合が起きるため、トランザクションで保護する
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

            // 関連テーブルの差分適用（渡されたプロパティのみ同期）
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
     * 処理名: タスク削除
     * 処理概要: 指定タスクを削除します。依存関係の削除（関連テーブル）についてはリポジトリ層の実装に依存します。
     * 実装理由: タスク削除は簡潔な操作に見えても依存テーブルとの整合性が必要なため、サービス層からリポジトリを呼び出して安全に実行します。
     * @param {string} taskId
     * @returns {Promise<boolean>} true if deleted
     */
    async deleteTask(taskId: string) {
        return TaskRepo.deleteTaskRow(this.db, taskId);
    }

    /**
    * 処理名: タスク移動
    * 処理概要: 指定タスクの親を変更し、バリデーション（自身を親にできない等）を行った上で更新します。
    * 実装理由: 階層構造を扱う際に循環や不整合が生じないよう、サービス層で最低限の検証を行って安全に親変更を適用するため。
    * @param {string} taskId
    * @param {string|null} newParentId
    * @returns {Promise<any>} updated task
     */
    async moveTask(taskId: string, newParentId: string | null) {
    // 移動対象タスクの存在確認
    // 処理概要: 対象タスクを取得し、存在しなければエラーを投げる
    // 実装理由: 存在しないタスクを操作すると意味がないため事前に検査する
    const task = await TaskRepo.getTaskRow(this.db, taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    // 循環防止のため自身を親に設定する操作をブロック
    // 処理概要: newParentId が自分自身と等しい場合はエラー
    // 実装理由: 階層の循環を防ぎデータ整合性を維持するため
    if (newParentId === taskId) throw new Error('Task cannot be its own parent');
    const now = new Date().toISOString();
    const newVersion = task.version + 1;
    await this.db.run(`UPDATE tasks SET parent_id = ?, updated_at = ?, version = ? WHERE id = ?`, newParentId, now, newVersion, taskId);
    return await this.getTask(taskId);
    }
}
