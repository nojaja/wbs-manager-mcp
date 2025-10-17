import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * wbs.deleteTask ツール
 * @class
 */
export default class WbsDeleteTaskTool extends Tool {
    private readonly repo: TaskRepository;

    /**
     * コンストラクタ
     */
    constructor() {
        super({ name: 'wbs.planMode.deleteTask', description: 'Delete a task and its descendants', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } });
        this.repo = new TaskRepository();
    }

    /**
     * 処理名: init (初期化)
     * 処理概要: 依存注入を受け取るエントリポイント（現状 noop）
     * 実装理由: 他のツールと同様に init インターフェースを提供し、将来的な DI 対応に備えるため
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        // no-op
        await super.init(deps);
    }

    /**
     * 処理名: run (タスク削除処理)
     * 処理概要: 指定された taskId のタスクとその子孫を削除し、結果を返却する
     * 実装理由: ユーザー操作によるタスク削除要求を安全に DB に反映するため
     * @param {any} args 実行引数（taskId）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリを検証し、タスク削除処理を呼び出す
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
