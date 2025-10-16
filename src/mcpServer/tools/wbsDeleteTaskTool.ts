import { Tool } from './Tool';

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
    repo: any | null;

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
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     *
     * 処理概要:
     * 依存注入（DI）されたオブジェクトを受け取り、親クラスの初期化を行ったうえで
     * このツールが利用するリポジトリ参照を設定します。
     *
     * 実装理由 (なぜ必要か):
     * 実行環境によってリポジトリ実装を差し替え可能にするため、初期化時に外部依存を注入
     * して疎結合にします。テスト時にはモックを注入して単体テストを容易にします。
     *
     * @param {any} deps DIで注入される依存オブジェクト（例: { repo })
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: タスク削除実行 (run)
     *
     * 処理概要:
     * 引数で与えられた taskId を基に、注入済みのリポジトリの deleteTask メソッドを呼び出し、
     * 削除結果（成功／未検出／エラー）を人間向けメッセージとして返却します。
     *
     * 実装理由 (なぜ必要か):
     * クライアントからの削除要求に対し、サーバー側で責務を持って削除処理を行い、扱いやすい
     * レスポンスを返すために実装しています。エラーハンドリングを含めることで呼び出し側の
     * ユーザー体験を向上させ、運用時の障害解析を容易にします。
     *
     * @param {any} args 実行引数（例: { taskId: string }）
     * @returns {Promise<any>} ツールレスポンス（content配列を含むオブジェクト）
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
