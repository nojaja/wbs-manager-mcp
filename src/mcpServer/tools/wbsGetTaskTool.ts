import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * wbs.getTask ツール
 * @class
 */
export default class WbsGetTaskTool extends Tool {
    private readonly repo: TaskRepository;
    /**
     * コンストラクタ
     */
    constructor() {
        super({ 
            name: 'wbs.planMode.getTask', 
            description: 'Get task details by ID (tool plugin)', 
            inputSchema: { type: 'object', properties: { taskId: { type: 'string', description: 'Task ID' } }, required: ['taskId'] } 
        });
        this.repo = new TaskRepository();
    }

    /**
     * 処理名: init (依存注入エントリ)
     * 処理概要: DI による依存注入の受け口（このツールは特に初期化を行わないため noop）
     * 実装理由: 一貫してツールが init を受け取れるようにインターフェースを揃えるため
     * @param deps DIで注入される依存
     */
    // no init/deps

    /**
     * 処理名: run (タスク取得処理)
     * 処理概要: 指定された taskId の詳細情報を取得して返却する
     * 実装理由: クライアントがタスク詳細を参照する要求に応じるため
     * @param args ツール引数 (taskId)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        // リポジトリを取得してタスク検索を行う
        const repo = this.repo;
        try {
            if (!repo) throw new Error('Repository not injected');
            const task = await repo.getTask(args.taskId);
            // 見つからない場合はユーザー向けメッセージを返す
            if (!task) {
                return { content: [{ type: 'text', text: `❌ Task not found: ${args.taskId}` }] };
            }
            // タスク情報を JSON で返却
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to get task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsGetTaskTool();
