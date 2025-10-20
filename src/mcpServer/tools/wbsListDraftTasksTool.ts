import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.planMode.listDraftTasks
 * 処理概要: 指定 parentId のドラフト状態（status='draft'）のタスク一覧を取得するツール
 * 実装理由: 編集途中や情報不足で未完成のタスクのみを一覧化して、ユーザーやエージェントが補完すべきタスクを特定するため
 * @class
 */
/**
 * 処理名: wbs.planMode.listDraftTasks
 * 処理概要: 指定 parentId のドラフト状態（status='draft'）のタスク一覧を取得するツール
 * 実装理由: 編集途中や情報不足で未完成のタスクのみを一覧化して、ユーザーやエージェントが補完すべきタスクを特定するため
 * @class
 */
export default class WbsListDraftTasksTool extends Tool {
    /**
     * TaskRepository インスタンス
     * 処理概要: タスクの永続化・取得・更新を行う
     * 実装理由: ツールからタスク情報へアクセスするために必要
     */
    private readonly repo: TaskRepository;

    /**
     * コンストラクタ
     * 処理概要: TaskRepository を初期化する
     * 実装理由: ツール実行に必要な永続化レイヤを準備するため
     * @returns {void}
     */
    constructor() {
        super({
            name: 'wbs.planMode.listDraftTasks',
            description: "List draft tasks (status='draft') for a given parentId or top-level tasks when parentId is omitted. Returns the same task object structure as 'wbs.planMode.listTasks'.",
            inputSchema: {
                type: 'object',
                properties: {
                    parentId: { type: 'string', description: "Optional parent task ID. If omitted or null, the tool returns top-level (root) draft tasks." }
                }
            }
        });
        this.repo = new TaskRepository();
    }

    /**
     * ドラフトタスク一覧取得処理
     * 指定 parentId のドラフトタスク一覧を DB から取得し、ツールレスポンスで返す
     * なぜ必要か: 情報不足タスクのみを抽出してユーザー/エージェントが補完作業を行えるようにするため
     * @param {any} args 実行引数 (parentId: 親タスクID、省略時はトップレベル)
     * @returns {Promise<any>} ツール実行結果オブジェクト
     */
    async run(args: any) {
        try {
            // 処理概要: リポジトリからドラフトタスクを取得して文字列化して返す
            // 実装理由: クライアントやエージェントがドラフトタスクを容易に取得できるようにするため
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const tasks = await this.repo.listTasks(args?.parentId, 'draft');
            const llmHints = { nextActions: [], notes: ['Draft task list retrieved successfully.'] };
            return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }], llmHints };
        } catch (error) {
            // エラー時は LLメモとエラーメッセージを返却
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'wbs.planMode.listDraftTasks', detail: 'Retry the request' }], notes: [`Exception message: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to list draft tasks: ${message}` }], llmHints };
        }
    }
}

/**
 * インスタンスエクスポート
 * 処理概要: ツールのシングルトンインスタンスをエクスポートする
 * 実装理由: 他モジュールからツールを参照可能にするため
 * @type {WbsListDraftTasksTool}
 */
export const instance = new WbsListDraftTasksTool();
