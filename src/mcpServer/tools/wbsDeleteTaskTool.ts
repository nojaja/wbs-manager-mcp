import { Tool } from './Tool';

/**
 * wbs.deleteTask ツール
 * @class
 */
export default class WbsDeleteTaskTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.deleteTask', description: 'Delete a task and its descendants', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } });
        this.repo = null;
    }

    /**
     * 初期化
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * タスク削除処理
     * 指定IDのタスクと子タスクを削除し、結果メッセージを返す
     * なぜ必要か: クライアントからの削除要求をDB操作に接続するため
     * @param {any} args 実行引数（taskId）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const deleted = await repo.deleteTask(args.taskId);
            if (!deleted) return { content: [{ type: 'text', text: `❌ Task not found: ${args.taskId}` }] };
            return { content: [{ type: 'text', text: `✅ Task deleted successfully!\n\nID: ${args.taskId}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to delete task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsDeleteTaskTool();
