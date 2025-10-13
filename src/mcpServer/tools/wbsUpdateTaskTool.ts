/* eslint-disable jsdoc/require-jsdoc */
import { Tool } from './Tool';

/** wbs.updateTask ツール */
export default class WbsUpdateTaskTool extends Tool {
    repo: any | null;

    constructor() {
    super({ name: 'wbs.planMode.updateTask', description: 'Update an existing task', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' }, status: { type: 'string' }, estimate: { type: 'string' }, completionConditions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } }, deliverables: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, prerequisites: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, ifVersion: { type: 'number' } }, required: ['taskId'] } });
        this.repo = null;
    }

    /**
     * 初期化
     * @param deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * タスク更新処理
     * 指定IDのタスクをDBで更新し、結果を返す
     * なぜ必要か: クライアントからのタスク編集・保存要求に応えるため
     * @param args 更新引数
     * @returns {Promise<any>} ツールレスポンス
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
     * タスク未検出時のレスポンス
     * @param {string} taskId タスクID
     * @returns {any} レスポンスオブジェクト
     */
    private notFound(taskId: string) {
        return { content: [{ type: 'text', text: `❌ Task not found: ${taskId}` }] };
    }

    /**
     * 楽観ロック用バージョン検証処理
     * バージョン不一致時はエラーを返す
     * なぜ必要か: 複数ユーザー編集時の競合検出・整合性維持のため
     * @param {any} task 更新データ
     * @param {any} currentTask 現在のタスク
     * @returns {any|null} エラーオブジェクトまたは null
     */
    private checkVersion(task: any, currentTask: any) {
        if (task.ifVersion !== undefined && currentTask.version !== task.ifVersion) {
            return { content: [{ type: 'text', text: `❌ Task has been modified by another user. Expected version ${task.ifVersion}, but current version is ${currentTask.version}` }] };
        }
        return null;
    }

    /**
     * タスク更新オブジェクト生成処理
     * 更新引数と現在のタスクから更新用オブジェクトを生成する
     * なぜ必要か: DB更新時に必要な差分のみを安全にまとめるため
     * @param {any} args 実行引数
     * @param {any} currentTask 現在のタスク
     * @returns {any} 更新データオブジェクト
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
