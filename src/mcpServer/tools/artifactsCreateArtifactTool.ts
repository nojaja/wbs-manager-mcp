import { Tool } from './Tool';
import { ArtifactRepository } from '../repositories/ArtifactRepository';

/**
 * 処理名: wbs.planMode.createArtifact ツール実装
 * 処理概要: 成果物（Artifact）を作成するためのツール実装。受け取った title/uri/description を DB に保存し、結果を返す
 * 実装理由: MCP を通じて成果物管理操作を行えるようにプラグイン化し、サーバ側で一元的に保存と整合性を担保するため
 * @class
 */
export default class ArtifactsCreateArtifactTool extends Tool {
    private readonly repo: ArtifactRepository;

    /**
     * 処理名: コンストラクタ
     * 処理概要: ツールのメタ情報を設定し、内部で使用する ArtifactRepository を生成する
     * 実装理由: ツールの自己記述的メタ情報を定義し、リポジトリを利用できるように準備するため
     */
    constructor() {
        super({ name: 'wbs.planMode.createArtifact', description: 'Create a new artifact', inputSchema: { type: 'object', properties: { title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } });
        this.repo = new ArtifactRepository();
    }

    /**
     * 処理名: 初期化
     * 処理概要: 依存注入されたオブジェクトを受け取り、必要に応じて親の初期化を行う（ここでは no-op）
     * 実装理由: インターフェースの一貫性を保ち、将来の拡張で外部依存を受け取れるようにするため
     * @param {any} deps DIで注入される依存オブジェクト
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        // no-op
        await super.init(deps);
    }

    /**
     * 成果物作成ハンドラ
     * 処理概要: 引数を受け取り ArtifactRepository.createArtifact を呼んで成果物を DB に登録し、登録結果と LLM 向けヒントを返す
     * 実装理由: MCP ツールとして成果物作成を扱い、クライアント側が結果や次の操作を受け取れるようにするため
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
