import { Tool } from './Tool';

/**
 * 処理名: ArtifactsGetArtifactTool
 *
 * 概要:
 * artifacts.getArtifact 相当のツールラッパーです。指定された成果物IDを受け取り、
 * リポジトリから該当の成果物を取得して JSON 形式で返却します。
 *
 * 実装理由（なぜ必要か）:
 * このツールは成果物の詳細表示や連携処理の起点として利用されます。
 * UI の成果物詳細画面や自動化ワークフローから成果物情報を安全に取得するために必要です。
 *
 * @class
 */
export default class ArtifactsGetArtifactTool extends Tool {
    /**
     * リポジトリ参照。DIで注入される。
     *
     * 実装理由:
     * テスト容易性と責務分離のためリポジトリは外部から注入して利用します。
     */
    repo: any | null;

    /**
     * 処理名: コンストラクタ
     *
     * 概要:
     * ツール名・説明・入力スキーマを親クラスに渡して初期化します。
     *
     * 実装理由:
     * ツールとして利用可能にするためのメタ情報（name/description/inputSchema）を登録し、
     * DI で注入されるリポジトリ用フィールドを初期化します。
     */
    constructor() {
        super({ name: 'wbs.planMode.getArtifact', description: 'Get artifact by ID', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' } }, required: ['artifactId'] } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化（init）
     *
     * 概要:
     * 依存関係を受け取り、内部の `repo` を DI から取得して設定します。
     *
     * 実装理由:
     * 実行時に外部リポジトリを差し替えられるようにし、ユニットテストやモック注入を容易にするため。
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: run (成果物取得ハンドラ)
     *
     * 概要:
     * 引数で渡された `artifactId` を用いてリポジトリから成果物を取得し、
     * 成功時は成果物 JSON を、未検出・例外時は適切なメッセージと LLM 向けヒントを返します。
     *
     * 実装理由:
     * 成果物詳細表示や他処理との連携で一貫したレスポンス形式を提供するために
     * エラーハンドリングとヒント情報を含めたラッパー処理を提供します。
     *
     * @param {any} args 実行引数（artifactId を含むオブジェクト）
     * @returns {Promise<any>} ツールレスポンス（content と llmHints を含むオブジェクト）
     */
    async run(args: any) {
        try {
            // リポジトリ取得と指定成果物の検索
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifact = await repo.getArtifact(args.artifactId);
            if (!artifact) {
                const llmHints = { nextActions: [{ action: 'searchArtifact', detail: 'IDを確認して再検索してください' }], notes: ['指定された成果物が見つかりませんでした。'] };
                return { content: [{ type: 'text', text: `❌ Artifact not found: ${args.artifactId}` }], llmHints };
            }
            const llmHints = { nextActions: [{ action: 'linkToTasks', detail: `成果物 ${args.artifactId} を関連タスクにリンクできます` }], notes: ['成果物を取得しました。追加アクション: タスクへのリンク検討'] };
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'retryGetArtifact', detail: '再試行してください' }], notes: [`例外メッセージ: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to get artifact: ${message}` }], llmHints };
        }
    }
}

/**
 * 処理名: singleton インスタンス
 *
 * 概要:
 * モジュール読み込み時に利用可能な既定のツールインスタンスをエクスポートします。
 *
 * 実装理由:
 * 呼び出し元で毎回インスタンスを生成する手間を省き、共通設定の再利用を容易にするため。
 */
export const instance = new ArtifactsGetArtifactTool();
