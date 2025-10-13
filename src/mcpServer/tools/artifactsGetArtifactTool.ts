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
        super({ name: 'artifacts.getArtifact', description: 'Get artifact by ID', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' } }, required: ['artifactId'] } });
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
            if (!artifact) return { content: [{ type: 'text', text: `❌ Artifact not found: ${args.artifactId}` }] };
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to get artifact: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new ArtifactsGetArtifactTool();
