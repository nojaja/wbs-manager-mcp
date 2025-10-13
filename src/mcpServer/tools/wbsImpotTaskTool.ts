import { Tool } from './Tool';

/**
 * wbs.impotTask ツール
 * @class
 */
export default class WbsImpotTaskTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.impotTask', description: 'Import multiple tasks', inputSchema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' }, assignee: { type: 'string' }, estimate: { type: 'string' }, deliverables: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, prerequisites: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, completionConditions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } } }, required: ['title'] } } }, required: ['tasks'] } });
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
     * 複数タスク一括登録
     * @param {any} args 実行引数 (tasks)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            const created = await repo.importTasks(tasks);
            return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to import tasks: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsImpotTaskTool();
