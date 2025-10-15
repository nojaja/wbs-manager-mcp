import { Tool } from './Tool';

/**
 * artifacts.listArtifacts ツール
 *
 * 成果物一覧を取得するツールラッパーです。
 * @class
 */
export default class ArtifactsListArtifactsTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     */
    constructor() {
        super({ name: 'wbs.planMode.listArtifacts', description: 'List artifacts', inputSchema: { type: 'object', properties: {} } });
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
     * 成果物一覧取得ハンドラ
     * 成果物一覧をJSONとして返す
     * なぜ必要か: ツリービュー表示用に成果物一覧を取得するため
     * @param {any} args 実行引数（省略可能）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ確認と一覧取得
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const list = await repo.listArtifacts();
            const llmHints = { nextActions: [], notes: ['成果物一覧を取得しました'] };
            return { content: [{ type: 'json', text: JSON.stringify(list, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'wbs.planMode.listArtifacts', detail: '再試行してください' }], notes: [`例外メッセージ: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to list artifacts: ${message}` }], llmHints };
        }
    }
}

export const instance = new ArtifactsListArtifactsTool();
