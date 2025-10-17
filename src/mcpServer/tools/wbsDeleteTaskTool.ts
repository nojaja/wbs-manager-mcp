import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: WBS タスク削除ツール (wbs.planMode.deleteTask)
 *
 * 処理概要:
 * 指定されたタスクIDに対応するタスクと、その子孫タスクを永続層から削除するツールです。
 * クライアントから受け取った削除要求をリポジトリに伝播し、結果メッセージを返却します。
 *
 * 実装理由 (なぜ必要か):
 * ユーザーがWBS上のタスクを削除する操作を行った際に、サーバー側で安全かつ一貫性を保ちながら
 * タスクとその子孫の削除を行うために存在します。リポジトリ層へ委譲することで責務を分離し、テスト
 * とモックがしやすい構造にしています。
 *
 * @class
 * @extends Tool
 */
export default class WbsDeleteTaskTool extends Tool {
    private readonly repo: TaskRepository;

    /**
     * 処理名: コンストラクタ
     *
     * 処理概要:
     * ツールのインスタンスを生成し、親クラス(Tool)へツール名・説明・入力スキーマを渡して初期化します。
     *
     * 実装理由 (なぜ必要か):
     * ツールのメタ情報（名前・説明・入力バリデーション）を明示的に定義することで、実行時の検証や
     * 管理コンソールへの表示、呼び出し側での誤用防止に寄与します。
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
