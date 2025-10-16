import { Tool } from './Tool';

/**
 * 処理名: wbs.planMode.updateTask
 * 概要: 既存の WBS タスクを更新するツール実装クラス。
 * 実装理由: クライアントから受け取った更新情報を検証し、必要な差分を組み立ててリポジトリ経由で永続化するため。
 *           楽観ロックや存在チェックを含め、複数ユーザーによる競合や不正な更新を防ぐ責務を持つ。
 */
export default class WbsUpdateTaskTool extends Tool {
    /**
     * 処理名: repo (依存注入リポジトリ)
     * 概要: タスク操作を行うためのリポジトリ参照を保持するメンバ。
     * 実装理由: テストや実行環境でリポジトリ実装を差し替え可能にするために DI を用いる。
     */
    repo: any | null;

    /**
     * 処理名: コンストラクタ
     * 概要: ツールのメタ情報（名前・説明・入力スキーマ）を初期化する。
     * 実装理由: 呼び出し元がツールを列挙・検証できるように、自己記述的なメタデータを提供するため。
     */
    constructor() {
        super({ name: 'wbs.planMode.updateTask', description: 'Update an existing task', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' }, status: { type: 'string' }, estimate: { type: 'string' }, completionConditions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } }, deliverables: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, prerequisites: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, ifVersion: { type: 'number' } }, required: ['taskId'] } });
        this.repo = null;
    }


    /**
     * 処理名: init
     * 概要: ツールの依存関係（リポジトリなど）を初期化する。
     * 実装理由: 実行環境に応じて外部依存を注入できるようにし、テスト時にモックを差し替えられるようにするため。
     * @param deps 依存注入オブジェクト
     * @returns Promise<void>
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }


    /**
     * 処理名: run
     * 概要: タスク更新の主要処理。入力検証、存在チェック、楽観ロック検証、更新データ生成、DB更新を順に実行する。
     * 実装理由: 単一のエントリポイントで更新フローを管理することで例外処理と一貫したレスポンス生成を行うため。
     * @param args 更新引数
     * @returns ツールレスポンス（成功時は更新済タスクの内容を含むメッセージ、失敗時はエラーメッセージ）
     */
    async run(args: any) {
        try {
            // リポジトリ取得と存在確認
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');

            // 対象タスクを取得し、存在しない場合は notFound を返す
            const currentTask = await repo.getTask(args.taskId);
            if (!currentTask) return this.notFound(args.taskId);

            // 楽観ロック用バージョン検証を実行（競合検出）
            const versionErr = this.checkVersion(args, currentTask);
            if (versionErr) return versionErr;

            // 更新データを組み立てて DB を更新する
            const updateData = this.buildUpdateData(args, currentTask);
            const updatedTask = await repo.updateTask(args.taskId, updateData);
            return { content: [{ type: 'text', text: `✅ Task updated successfully!\n\n${JSON.stringify(updatedTask, null, 2)}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to update task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }

    /**
     * 処理名: notFound
     * 概要: タスクが見つからない場合のレスポンスを生成するユーティリティ。
     * 実装理由: エラー時の出力フォーマットを統一して呼び出し元の可読性を高めるため。
     * @param taskId タスクID
     * @returns レスポンスオブジェクト
     */
    private notFound(taskId: string) {
        return { content: [{ type: 'text', text: `❌ Task not found: ${taskId}` }] };
    }

    /**
     * 処理名: checkVersion
     * 概要: 楽観ロック（バージョン）検証を行い、バージョン不一致があればエラー応答を返す。
     * 実装理由: 同じタスクを複数ユーザーが同時に編集した際の競合を検出し、意図しない上書きを防止するため。
     * @param task 入力タスク
     * @param currentTask 現在の永続化済タスク
     * @returns エラー応答オブジェクトまたは null
     */
    private checkVersion(task: any, currentTask: any) {
        if (task.ifVersion !== undefined && currentTask.version !== task.ifVersion) {
            return { content: [{ type: 'text', text: `❌ Task has been modified by another user. Expected version ${task.ifVersion}, but current version is ${currentTask.version}` }] };
        }
        return null;
    }

    /**
     * 処理名: buildUpdateData
     * 概要: クライアントから渡された更新引数と現在のタスクから、DB に渡す安全な更新オブジェクトを作成する。
     * 実装理由: 不要なフィールド書き換えや不正なデータ注入を防ぎ、配列項目の整形（deliverables/prerequisites/completionConditions）を統一的に処理するため。
     * @param args 実行引数
     * @param currentTask 現在タスク
     * @returns 更新オブジェクト
     */
    private buildUpdateData(args: any, currentTask: any) {
        return {
            title: args.title !== undefined ? args.title : currentTask.title,
            description: args.description !== undefined ? args.description : currentTask.description,
            assignee: args.assignee !== undefined ? args.assignee : currentTask.assignee,
            status: args.status !== undefined ? args.status : currentTask.status,
            estimate: args.estimate !== undefined ? args.estimate : currentTask.estimate,
            deliverables: Array.isArray(args.deliverables)
                ? args.deliverables.map((item: any) => ({ artifactId: item?.artifactId, crudOperations: item?.crudOperations ?? item?.crud ?? null }))
                : undefined,
            prerequisites: Array.isArray(args.prerequisites)
                ? args.prerequisites.map((item: any) => ({ artifactId: item?.artifactId, crudOperations: item?.crudOperations ?? item?.crud ?? null }))
                : undefined,
            completionConditions: Array.isArray(args.completionConditions)
                ? args.completionConditions
                    .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                    .map((item: any) => ({ description: item.description.trim() }))
                : undefined,
            ifVersion: args.ifVersion
        };
    }
}

export const instance = new WbsUpdateTaskTool();
