import { Tool } from './Tool';

/**
 * 処理名: WBS タスク取得ツール (wbs.planMode.getTask)
 *
 * 概要:
 * WBS のタスク情報を ID で取得するツールプラグイン実装です。外部からツール呼び出しにより
 * 指定された taskId を使ってリポジトリ経由でタスクを検索し、結果をツールレスポンス形式で返却します。
 *
 * 実装理由:
 * サービス間連携や自動化ワークフローでタスク詳細を参照できるようにするためにツール化しています。
 * リポジトリ層を注入可能にすることで、ユニットテストや異なる永続化実装を容易に切り替えられる
 * 柔軟性を確保しています。
 */
export default class WbsGetTaskTool extends Tool {
    repo: any | null;
    /**
     * 処理名: コンストラクタ
     *
     * 概要:
     * ツールの基本設定（name, description, inputSchema）を親クラスに渡して初期化します。
     * repo フィールドは後で DI によって注入されるため null で初期化します。
     *
     * 実装理由:
     * ツールのメタ情報と入力スキーマを明確に定義することで外部からの呼び出し時に検証を行い、
     * 想定外の引数による実行を防止します。
     */
    constructor() {
        super({ name: 'wbs.planMode.getTask', description: 'Get task details by ID (tool plugin)', inputSchema: { type: 'object', properties: { taskId: { type: 'string', description: 'Task ID' } }, required: ['taskId'] } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     *
     * 概要:
     * DI コンテナから渡された依存オブジェクトを受け取り、内部で使用するリポジトリを設定します。
     * 親クラスの init を呼び出した後、this.repo に repo が存在すればそれを保持します。
     *
     * 実装理由:
     * 実行時に外部の永続化層（リポジトリ）を注入することで、ツール実行時の副作用を最小化し、
     * テスト容易性と実装の分離（DI による抽象化）を実現します。
     *
     * @param deps DIで注入される依存
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: タスク取得実行 (run)
     *
     * 概要:
     * 引数で与えられた taskId を用いて injected なリポジトリからタスクを取得します。
     * タスクが見つかれば JSON 文字列化して返却し、見つからなければユーザー向けのメッセージを返します。
     * 例外発生時はエラーメッセージを含むレスポンスを返します。
     *
     * 実装理由:
     * ツール呼び出しのエントリポイントとして、リポジトリの存在チェック、正常系/異常系の応答整形、
     * 例外ハンドリングを一箇所に集約することで呼び出し側に分かりやすい出力を提供します。
     *
     * @param args ツール引数 (taskId を含むオブジェクト)
     * @returns {Promise<any>} ツールレスポンス（content 配列を含む）
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
