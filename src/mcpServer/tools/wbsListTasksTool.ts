import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.planMode.listTasks
 * 処理概要: 指定 parentId のタスク一覧を取得するツール
 * 実装理由: クライアントの一覧表示要求に応じて DB から必要なタスクデータを提供するため
 * @class
 */
export default class WbsListTasksTool extends Tool {
    private readonly repo: TaskRepository;

    /**
     * 処理名: コンストラクタ
     * 処理概要: ツールのメタ情報とリポジトリを初期化する
     * 実装理由: ツール登録時のメタ設定および DB 操作用リポジトリを準備するため
     */
    constructor() {
        super({
            name: 'wbs.planMode.listTasks',
            description: 'List tasks for a given parentId or top-level tasks when parentId is omitted. Returns task objects which include metadata such as id, parentId, title, status, estimate and childCount. Use this tool to obtain task IDs (issued by wbs.planMode.createTask) for subsequent operations such as creating dependencies or updating tasks.',
            inputSchema: {
                type: 'object',
                properties: {
                    parentId: { type: 'string', description: "Optional parent task ID. If omitted or null, the tool returns top-level (root) tasks. Use task IDs returned by 'wbs.planMode.createTask' when calling other tools that require task references." }
                }
            }
        });
        this.repo = new TaskRepository();
    }

    /**
     * タスク一覧取得処理
     * 指定parentIdのタスク一覧をDBから取得し、ツールレスポンスで返す
     * なぜ必要か: クライアントからのタスク一覧表示要求に応えるため
     * @param {any} args 実行引数 (parentId: 親タスクID、省略時はトップレベル)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // DB リポジトリを取得し、存在確認を行う
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 指定 parentId のタスク一覧を取得して文字列化して返す
            const tasks = await repo.listTasks(args.parentId);
            const llmHints = { nextActions: [], notes: ['Task list retrieved successfully.'] };
            return { content: [{ type: 'text', text: JSON.stringify({tasks, llmHints}, null, 2) }] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'wbs.planMode.listTasks', detail: 'Retry the request' }], notes: [`Exception message: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to list tasks: ${error instanceof Error ? error.message : String(error)}` }], llmHints };
        }
    }
}

export const instance = new WbsListTasksTool();
