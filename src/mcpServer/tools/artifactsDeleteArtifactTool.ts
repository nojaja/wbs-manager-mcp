import { Tool } from './Tool';

/**
 * 処理名: artifacts.deleteArtifact ツール
 *
 * 処理概要:
 * 成果物（Artifact）を削除するためのツールラッパーです。
 * リポジトリに定義された deleteArtifact メソッドを呼び出して指定IDの成果物を削除し、
 * 成功／失敗メッセージと LLM 向けのヒント情報を返却します。
 *
 * 実装理由（なぜ必要か）:
 * エディタ拡張や外部コマンドから成果物削除リクエストを受け付ける際、共通の入出力形式と
 * エラーハンドリングを提供するためにツール化しています。これによりビジネスロジックと
 * 実際の削除実装（リポジトリ）を分離し、テストやモックが容易になります。
 *
 * @class
 */
export default class ArtifactsDeleteArtifactTool extends Tool {
    repo: any | null;

    /**
     * 処理名: コンストラクタ
     *
     * 処理概要:
     * ツール名、説明、入力スキーマを親クラスに渡して Tool を初期化します。
     * repo フィールドは初期状態で null に設定されます。
     *
     * 実装理由（なぜ必要か）:
     * ツールとして呼び出された際に入力検証(schema)を自動で行えるようにし、
     * 外部からの依存注入（DI）を受け取る準備をします。
     */
    constructor() {
        super({ name: 'wbs.planMode.deleteArtifact', description: 'Delete an artifact', inputSchema: { type: 'object', properties: { artifactId: { type: 'string' } }, required: ['artifactId'] } });
        this.repo = null;
    }
    /**
     * 処理名: 初期化 (init)
     *
     * 処理概要:
     * DI（依存注入）から渡されたオブジェクトを受け取り、内部で利用する repo を設定します。
     * 親クラス Tool の init を呼び出して共通初期化処理を行います。
     *
     * 実装理由（なぜ必要か）:
     * 実行時に外部リポジトリ実装を注入することで、実際のデータ層を差し替え可能にし、
     * 単体テストやモックによる検証を容易にします。
     *
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }
    /**
     * 処理名: 成果物削除ハンドラ (run)
     *
     * 処理概要:
     * 引数で受け取った artifactId を用いてリポジトリの deleteArtifact を呼び出し、
     * 削除結果に応じてユーザー向けのメッセージと LLM（AI）向けヒントを含むレスポンスを返します。
     * 成功時は削除完了メッセージ、存在しない場合は未検出メッセージ、例外発生時はエラーメッセージを返します。
     *
     * 実装理由（なぜ必要か）:
     * 成果物削除に伴う結果通知や失敗時のフォールバックを一元管理するため。この層で
     * 例外処理や LLM 向けの次アクション提案を付与することで、呼び出し元が気にする
     * べきエラー処理の負担を軽減します。
     *
     * @param {any} args 実行引数（artifactId を含むオブジェクト）
     * @returns {Promise<any>} ツールレスポンス（content と llmHints を含む）
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

/**
 * 単一インスタンス
 *
 * 処理概要:
 * このツールのデフォルトインスタンスをエクスポートします。
 *
 * 実装理由（なぜ必要か）:
 * 他モジュールから簡単に利用できるようにグローバルなシングルトン風のインスタンスを提供します。
 */
export const instance = new ArtifactsDeleteArtifactTool();
