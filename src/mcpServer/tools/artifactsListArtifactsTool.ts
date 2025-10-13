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
     * @constructor
     */
    constructor() {
        super({ name: 'artifacts.listArtifacts', description: 'List artifacts', inputSchema: { type: 'object', properties: {} } });
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
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifacts = await repo.listArtifacts();
            return { content: [{ type: 'text', text: JSON.stringify(artifacts, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to list artifacts: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new ArtifactsListArtifactsTool();
