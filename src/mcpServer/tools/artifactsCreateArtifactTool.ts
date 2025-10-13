import { Tool } from './Tool';

/**
 * artifacts.createArtifact ツール
 */
export default class ArtifactsCreateArtifactTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     */
    constructor() {
        super({ name: 'artifacts.createArtifact', description: 'Create a new artifact', inputSchema: { type: 'object', properties: { title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } });
        this.repo = null;
    }

    /**
     * 初期化
     * @param {any} deps DIで注入される依存オブジェクト
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 成果物作成ハンドラ
     * 成果物を新規登録し、結果を返す
     * なぜ必要か: 成果物管理からの作成要求に応えるため
     * @param {any} args 実行引数（title, uri, description）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifact = await repo.createArtifact(args.title, args.uri ?? null, args.description ?? null);
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to create artifact: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new ArtifactsCreateArtifactTool();
