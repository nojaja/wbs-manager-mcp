import { Tool } from './Tool';

/**
 * artifacts.updateArtifact ツール
 *
 * 既存成果物の更新を行うツールラッパーです。
 * @class
 */
export default class ArtifactsUpdateArtifactTool extends Tool {
    repo: any | null;
    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'artifacts.updateArtifact', description: 'Update an existing artifact', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' }, title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' }, ifVersion: { type: 'number' } }, required: ['artifactId'] } });
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
     * 成果物更新ハンドラ
     * 既存成果物を更新し、結果を返す
     * なぜ必要か: 成果物情報の編集をサーバへ反映するため
     * @param {any} args 実行引数（artifactId, title, uri, description, ifVersion）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifact = await repo.updateArtifact(args.artifactId, {
                title: args.title,
                uri: args.uri ?? null,
                description: args.description ?? null,
                ifVersion: args.ifVersion
            });
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to update artifact: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new ArtifactsUpdateArtifactTool();
