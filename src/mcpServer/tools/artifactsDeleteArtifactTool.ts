import { Tool } from './Tool';

/**
 * artifacts.deleteArtifact ツール
 *
 * 成果物削除を行うツールラッパーです。
 * @class
 */
export default class ArtifactsDeleteArtifactTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     * @constructor
     */
    constructor() {
        super({ name: 'wbs.planMode.deleteArtifact', description: 'Delete an artifact', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' } }, required: ['artifactId'] } });
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
     * 成果物削除ハンドラ
     * 指定成果物を削除し、結果メッセージを返す
     * なぜ必要か: 成果物管理からの削除要求に応えるため
     * @param {any} args 実行引数（artifactId）
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');

            const deleted = await repo.deleteArtifact(args.artifactId);

            const llmHints = {
                nextActions: [
                    { action: 'refreshArtifactList', detail: '最新の成果物一覧を取得してください' }
                ],
                notes: [deleted ? '成果物が削除されました。' : '指定された成果物は見つかりませんでした。']
            };

            if (!deleted) {
                return { content: [{ type: 'text', text: `❌ Artifact not found: ${args.artifactId}` }], llmHints };
            }

            return { content: [{ type: 'text', text: `✅ Artifact deleted successfully!\n\nID: ${args.artifactId}` }], llmHints };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const llmHints = { nextActions: [{ action: 'checkRepo', detail: 'リポジトリの注入状態を確認してください' }], notes: [`例外メッセージ: ${message}`] };
            return { content: [{ type: 'text', text: `❌ Failed to delete artifact: ${message}` }], llmHints };
        }
    }
}

export const instance = new ArtifactsDeleteArtifactTool();
