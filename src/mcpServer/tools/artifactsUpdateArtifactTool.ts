import { Tool } from './Tool';
import { ArtifactRepository } from '../repositories/ArtifactRepository';

/**
 * 処理名: artifacts.updateArtifact ツール
 *
 * 処理概要:
 * 既存の成果物(Artifact)情報を更新し、更新結果を返すツールラッパーです。
 * このクラスはツールフレームワーク上で実行され、受け取った引数をリポジトリに渡して
 * 成果物のタイトル、URI、説明、バージョン条件(ifVersion)などを更新します。
 *
 * 実装理由(なぜ必要か):
 * サーバ側で管理している成果物メタデータを編集できるようにするために必要です。
 * クライアントからの更新要求を検証・仲介し、永続層(リポジトリ)とのやり取りを統一する役割を持ちます。
 * @class
 */
export default class ArtifactsUpdateArtifactTool extends Tool {
    private readonly repo: ArtifactRepository;
    /**
     * 処理名: コンストラクタ
     *
     * 処理概要:
     * ツールの初期設定を行い、ツール名・説明・入力スキーマを親クラスに渡して初期化します。
     * repo は依存注入により後で設定されるため、ここでは null で初期化します。
     *
     * 実装理由(なぜ必要か):
     * ツールがどのような入力を受け取るかを定義することで、実行時のバリデーションと
     * 説明を統一し、ツール管理システムに登録できるようにするためです。
     */
    constructor() {
        super({ name: 'wbs.planMode.updateArtifact', description: 'Update an existing artifact', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' }, title: { type: 'string' }, uri: { type: 'string' }, description: { type: 'string' }, ifVersion: { type: 'number' } }, required: ['artifactId'] } });
        this.repo = new ArtifactRepository();
    }

    /**
     * 処理名: 初期化 (init)
     *
     * 処理概要:
     * DIコンテナや呼び出し元から渡される依存関係を受け取り、内部の repo を設定します。
     * 親クラスの init を呼び出して基底初期化処理を行います。
     *
     * 実装理由(なぜ必要か):
     * テストや環境毎に異なるリポジトリ実装を注入できるようにして、処理の疎結合化とテスト容易性を高めるため。
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        // no-op
        await super.init(deps);
    }

    /**
     * 処理名: 成果物更新ハンドラ (run)
     *
     * 処理概要:
     * 指定された artifactId を持つ成果物をリポジトリ経由で更新します。
     * 更新対象フィールドは title, uri, description, ifVersion で、更新後の成果物情報を
     * JSON テキストとして返却します。エラー発生時はエラーメッセージを含むレスポンスを返します。
     *
     * 実装理由(なぜ必要か):
     * クライアントからの成果物編集操作を安全に実行し、リポジトリ層の更新ロジックと
     * エラーハンドリングを一元化するため。LLM 用のヒント (llmHints) を付与して
     * 次のアクション提案を行う補助も行います。
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

/**
 * シングルトンインスタンス
 *
 * 処理概要: このツールのデフォルトインスタンスをエクスポートします。
 * 実装理由: 他モジュールから簡単に利用できるようにするための便宜的なエクスポートです。
 */
export const instance = new ArtifactsUpdateArtifactTool();
