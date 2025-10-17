import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.planMode.moveTask
 * 処理概要: 指定したタスクを別の親タスクの下に移動するツール実装
 * 実装理由: タスクの親子関係を変更する操作を安全に行い、クライアントへ結果を返すために必要
 * @class
 */
export default class WbsMoveTaskTool extends Tool {
    private readonly repo: TaskRepository;

    /**
     * 処理名: コンストラクタ
     * 処理概要: ツールのメタ情報とリポジトリを初期化する
     * 実装理由: ツールとして動作するためのメタ設定と DB 操作用リポジトリの準備を行う
     */
    constructor() {
        super({ name: 'wbs.planMode.moveTask', description: 'Move a task under a different parent', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, newParentId: { type: 'string' } }, required: ['taskId'] } });
        this.repo = new TaskRepository();
    }

    /**
     * 処理名: init (初期化)
     * 処理概要: 依存注入オブジェクトを受け取って初期化する（現状 no-op）
     * 実装理由: 将来的な DI 対応やテスト時の依存差し替えに備えたエントリポイントとして用意
     * @param {any} deps DI で注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        // no-op
        await super.init(deps);
    }

    /**
     * 処理名: run (タスク移動処理)
     * 処理概要: 指定タスクを新しい親に移動し、移動結果を返却する
     * 実装理由: クライアントの親子変更要求を DB に反映し、ユーザーへ結果を返すために必要
     * @param {any} args 実行引数(taskId, newParentId)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ検証
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 指定タスクを新しい親に移動し、結果を返す
            const task = await repo.moveTask(args.taskId, args.newParentId ?? null);
            return { content: [{ type: 'text', text: `✅ Task moved successfully!\n\n${JSON.stringify(task, null, 2)}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to move task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsMoveTaskTool();
