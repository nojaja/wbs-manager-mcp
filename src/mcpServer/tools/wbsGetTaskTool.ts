import { Tool } from './Tool';

/**
 * wbs.getTask ツール
 */
export default class WbsGetTaskTool extends Tool {
    repo: any | null;
    /**
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.getTask', description: 'Get task details by ID (tool plugin)', inputSchema: { type: 'object', properties: { taskId: { type: 'string', description: 'Task ID' } }, required: ['taskId'] } });
        this.repo = null;
    }

    /**
     * @param deps DIで注入される依存
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * タスク取得処理 (ツール呼び出しから)
     * @param args ツール引数 (taskId)
    * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        const repo = this.repo;
        try {
            if (!repo) throw new Error('Repository not injected');
            const task = await repo.getTask(args.taskId);
            if (!task) {
                return { content: [{ type: 'text', text: `❌ Task not found: ${args.taskId}` }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to get task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsGetTaskTool();
