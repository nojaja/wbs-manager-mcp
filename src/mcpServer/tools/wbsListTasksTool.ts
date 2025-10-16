import { Tool } from './Tool';

/**
 * 処理名: WbsListTasksTool (wbs.planMode.listTasks)
 * 概要: 指定された parentId に紐づくタスク一覧を取得して返すツールです。
 * 実装理由: クライアント側（UIや外部API）がWBSのタスク一覧を要求した際に
 *           データベースから該当タスクを取得してレスポンスを返す必要があるため実装しています。
 */
export default class WbsListTasksTool extends Tool {
    repo: any | null;

    /**
     * 処理名: コンストラクタ
     * 概要: ツールのメタ情報（名前・説明・入力スキーマ）を親クラスに渡して初期化します。
     * 実装理由: ツールとして登録される際に必要なメタデータを設定し、DIで注入される
     *           リポジトリ参照を保持するための初期状態を構築します。
     */
    constructor() {
        super({ name: 'wbs.planMode.listTasks', description: 'List tasks optionally by parentId', inputSchema: { type: 'object', properties: { parentId: { type: 'string' } } } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     * 概要: 依存注入されたオブジェクト（deps）を初期化し、ローカルにリポジトリ参照を設定します。
     * 実装理由: テストや実行環境に応じて異なるリポジトリ実装を注入できるようにし、
     *           実行時にDBアクセスを行うための準備を行うために必要です。
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: 実行 (run)
     * 概要: 引数で受け取った parentId に基づき、注入されたリポジトリからタスク一覧を取得して
     *       ツール形式のレスポンス（content と llmHints）で返却します。例外発生時はエラーメッセージを含む
     *       レスポンスを返します。
     * 実装理由: クライアント要求に応じたタスク一覧取得のユースケースを実装するため。リポジトリ未注入や
     *           データ取得失敗などのエラーを呼び出し元に伝搬させずツールレスポンスとして扱うためにエラーハンドリングを含めています。
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
            const llmHints = { nextActions: [], notes: ['タスク一覧を取得しました'] };
            return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'wbs.planMode.listTasks', detail: '再試行してください' }], notes: [`例外メッセージ: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to list tasks: ${error instanceof Error ? error.message : String(error)}` }], llmHints };
        }
    }
}

export const instance = new WbsListTasksTool();
