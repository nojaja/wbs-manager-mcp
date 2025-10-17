import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.planMode.impotTask
 * 処理概要: 複数タスクの一括インポートを行うツール
 * 実装理由: 外部データやテンプレートから複数タスクをまとめて登録する要件に対応するため、一括処理を提供します。
 * @class
 */
export default class WbsImpotTaskTool extends Tool {
    private readonly repo: TaskRepository;

    /**
     * コンストラクタ
     */
    constructor() {
        super({ name: 'wbs.planMode.impotTask', description: 'Import multiple tasks', inputSchema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' }, assignee: { type: 'string' }, estimate: { type: 'string' }, deliverables: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, prerequisites: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, completionConditions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } } }, required: ['title'] } } }, required: ['tasks'] } });
        this.repo = new TaskRepository();
    }

    /**
     * 初期化
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        // no-op (repo created directly)
        await super.init(deps);
    }

    /**
     * 複数タスク一括登録
     * @param {any} args 実行引数 (tasks)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ存在確認と入力タスク配列の正規化
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            // importTasks を呼び出して一括登録を実行
            const created = await repo.importTasks(tasks);
            return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to import tasks: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsImpotTaskTool();
