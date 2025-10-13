import { Tool } from './Tool';

/**
 * wbs.moveTask ツール
 * @class
 */
export default class WbsMoveTaskTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.moveTask', description: 'Move a task under a different parent', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, newParentId: { type: 'string' } }, required: ['taskId'] } });
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
     * タスク移動処理
     * 指定タスクの親タスクを変更し、結果メッセージを返す
     * なぜ必要か: クライアントからのドラッグ&ドロップ操作で親子関係を付け替える要求に応えるため
     * @param {any} args 実行引数(taskId, newParentId)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ検証
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 指定タスクを新しい親配下に移動し、結果を返す
            const task = await repo.moveTask(args.taskId, args.newParentId ?? null);
            return { content: [{ type: 'text', text: `✅ Task moved successfully!\n\n${JSON.stringify(task, null, 2)}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to move task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsMoveTaskTool();
