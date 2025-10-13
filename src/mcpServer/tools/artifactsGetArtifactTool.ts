import { Tool } from './Tool';

/**
 * artifacts.getArtifact ツール
 *
 * 指定IDの成果物を取得するツールラッパーです。
 * @class
 */
export default class ArtifactsGetArtifactTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.planMode.getArtifact', description: 'Get artifact by ID', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' } }, required: ['artifactId'] } });
        this.repo = null;
    }
    /**
     * 初期化
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 成果物取得ハンドラ
     * 指定IDの成果物をJSONとして返す
     * なぜ必要か: 成果物詳細画面で表示するため
     * @param {any} args 実行引数（artifactId）
     * @returns {Promise<any>} ツールレスポンス
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

export const instance = new ArtifactsGetArtifactTool();
