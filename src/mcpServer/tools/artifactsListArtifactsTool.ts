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
     * 処理名: ArtifactsListArtifactsTool.constructor
     * 処理概要: ツールインスタンスの初期化を行います。
     * 実装理由: ツールの名前・説明・入力スキーマを親クラスに渡し、依存注入される可能性のあるリポジトリを初期化するために必要です。
     */
    constructor() {
        super({ name: 'wbs.planMode.listArtifacts', description: 'List artifacts', inputSchema: { type: 'object', properties: {} } });
        this.repo = null;
    }
    /**
     * 処理名: ArtifactsListArtifactsTool.init
     * 処理概要: DIで渡された依存を使ってツールの内部状態を初期化します。
     * 実装理由: テストや実行環境に応じて外部のリポジトリ実装を注入できるようにし、実行時に必要な依存を解決するために必要です。
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: ArtifactsListArtifactsTool.run
     * 処理概要: リポジトリから成果物一覧を取得し、JSON形式でレスポンスを返却します。例外時はエラーメッセージと再試行ヒントを含むレスポンスを返します。
     * 実装理由: UI（ツリービューなど）や他のコンポーネントが成果物一覧を取得して表示するためのエンドポイント的役割を提供するために必要です。依存するリポジトリが注入されていない場合や取得に失敗した場合の堅牢なエラーハンドリングも担います。
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
