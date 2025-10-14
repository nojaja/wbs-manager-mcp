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
        super({ name: 'wbs.planMode.updateArtifact', description: 'Update an existing artifact', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' }, title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' }, ifVersion: { type: 'number' } }, required: ['artifactId'] } });
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
            // リポジトリ確認と更新データの適用
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const artifact = await repo.updateArtifact(args.artifactId, {
                title: args.title,
                uri: args.uri ?? null,
                description: args.description ?? null,
                ifVersion: args.ifVersion
            });
            const llmHints = { nextActions: [{ action: 'wbs.planMode.updateTask', detail: `成果物 ${args.artifactId} をタスクと紐づける` }], notes: ['成果物が更新されました'] };
            return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = { nextActions: [{ action: 'wbs.planMode.updateArtifact', detail: '再試行してください' }], notes: [`例外メッセージ: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to update artifact: ${message}` }], llmHints };
        }
    }
}

export const instance = new ArtifactsUpdateArtifactTool();
