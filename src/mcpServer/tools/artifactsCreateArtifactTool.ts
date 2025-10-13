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
        super({ name: 'wbs.planMode.createArtifact', description: 'Create a new artifact', inputSchema: { type: 'object', properties: { title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } });
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

export const instance = new ArtifactsCreateArtifactTool();
