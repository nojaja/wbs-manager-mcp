import { Tool } from './Tool';

/**
 * 処理名: 成果物作成ツール (artifacts.createArtifact)
 *
 * 概要:
 *  このクラスは外部からの「成果物（artifact）作成」要求を受け取り、
 *  リポジトリに新しい成果物を登録するためのツール実装です。
 *  ツールフレームワーク（Tool）を継承し、入力スキーマや実行ハンドラを提供します。
 *
 * 実装理由（なぜ必要か）:
 *  エディタやUI、外部サービスからの成果物作成操作を一元的に扱うために必要です。
 *  このツールを介して作成処理を標準化することで、入力検証、エラーハンドリング、
 *  作成後のフォローアップ（通知や関連タスクへのリンク）を共通的に実行できます。
 */
export default class ArtifactsCreateArtifactTool extends Tool {
    /**
     * リポジトリ参照（DIで注入される）
     *
     * なぜ保持するか:
     *  実際のデータ操作はリポジトリ層に委譲するため、インスタンス変数として保有します。
     */
    repo: any | null;

    /**
     * 処理名: コンストラクタ（初期化設定）
     *
     * 概要:
     *  ツール名や説明、入力スキーマを親クラスへ渡して初期化します。
     *  また、リポジトリ参照をnullで初期化します。
     *
     * 実装理由（なぜ必要か）:
     *  入力の検証ルールを明確に定義し、ツール登録時にメタ情報を持たせるために必要です。
     */
    constructor() {
        super({ name: 'wbs.planMode.createArtifact', description: 'Create a new artifact', inputSchema: { type: 'object', properties: { title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     *
     * 概要:
     *  依存関係注入（DI）で渡されるオブジェクトを受け取り、内部で利用するリポジトリ参照を設定します。
     *
     * 実装理由（なぜ必要か）:
     *  実際のデータ操作や永続化は環境依存のため外部から注入して切り替え可能にするためです。
     *
     * @param {any} deps DIで注入される依存オブジェクト
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: 成果物作成ハンドラ (run)
     *
     * 概要:
     *  ツールのエントリポイント。引数からタイトル等を受け取り、リポジトリ経由で成果物を作成する。
     *  作成に成功した場合は作成物のJSONを返し、LLM向けのヒント（次アクションなど）も付与します。
     *  失敗時はエラーメッセージと再試行や注入状態確認のヒントを返します。
     *
     * 実装理由（なぜ必要か）:
     *  ビジネスロジック（成果物作成）を一箇所にまとめ、エラー処理や後続アクションを統一して提供するためです。
     *  また、LLMやUIが次に実行すべき操作を受け取りやすくするための補助情報を返却します。
     *
     * @param {any} args 実行引数（title, uri, description）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ存在確認と成果物作成
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifact = await repo.createArtifact(args.title, args.uri ?? null, args.description ?? null);
            const llmHints = {
                nextActions: [
                    { action: 'notifyArtifactCreated', detail: `成果物 ${artifact.title} が作成されました` },
                    { action: 'linkToTasks', detail: 'この成果物を必要とするタスクと紐付けてください' }
                ],
                notes: ['成果物はDBに保存されています。必要に応じてタスクへ割当ててください。']
            };
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = {
                nextActions: [
                    { action: 'retryCreate', detail: '引数を検証して再試行してください' },
                    { action: 'checkRepo', detail: 'リポジトリの注入状態を確認してください' }
                ],
                notes: [`例外メッセージ: ${message}`]
            };
            return { content: [{ type: 'text', text: `❌ Failed to create artifact: ${message}` }], llmHints };
        }
    }
}

/**
 * シングルトンインスタンス
 *
 * なぜ提供するか:
 *  ツールは状態を持たないか、共有状態をDIで注入して利用する設計になっているため、
 *  単一のインスタンスをエクスポートして使い回すのが簡潔で扱いやすいです。
 */
export const instance = new ArtifactsCreateArtifactTool();
