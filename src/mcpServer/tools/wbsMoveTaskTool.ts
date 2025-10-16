import { Tool } from './Tool';

/**
 * 処理名: WBS タスク移動ツール (wbs.planMode.moveTask)
 *
 * 概要:
 * WBS（Work Breakdown Structure）内のタスクを別の親タスク配下へ移動するためのツールクラスです。
 * クライアントから受け取った taskId と newParentId を使ってリポジトリ層の移動処理を呼び出し、
 * 実行結果をユーザー向けのメッセージ形式で返却します。
 *
 * 実装理由（なぜ必要か）:
 * ユーザーがUI上でタスクの階層を変更（例: ドラッグ&ドロップ）した際に、サーバ側で親子関係を
 * 永続化する必要があるため。このツールはそのためのサーバ側エントリポイントとして機能します。
 * @class
 */
export default class WbsMoveTaskTool extends Tool {
    repo: any | null;

    /**
     * 処理名: コンストラクタ (WbsMoveTaskTool.constructor)
     *
     * 概要:
     * ツール名・説明・入力スキーマを親クラスに登録し、内部で使用するリポジトリ参照を初期化します。
     *
     * 実装理由（なぜ必要か）:
     * ツールがどのような入力を期待するかを明確にするためにスキーマを定義し、依存注入でリポジトリを
     * 受け取る準備を行う必要があります。
     */
    constructor() {
        super({ name: 'wbs.planMode.moveTask', description: 'Move a task under a different parent', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, newParentId: { type: 'string' } }, required: ['taskId'] } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     *
     * 概要:
     * 依存注入されたオブジェクト（例: リポジトリ）を受け取り、内部状態を設定します。
     * 親クラスの初期化処理も呼び出します。
     *
     * 実装理由（なぜ必要か）:
     * テストや実行環境に応じてリポジトリ等の依存を差し替えられるようにするため。これにより
     * 単体テストでモックを注入したり、実運用で実実装を注入できます。
     *
     * @param {any} deps DIで注入される依存オブジェクト（省略可）
     * @returns {Promise<void>} 非同期初期化の完了を示すPromise
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: タスク移動実行 (run)
     *
     * 概要:
     * 指定された taskId を newParentId の配下へ移動する処理を実行します。
     * 正常時は移動後のタスク情報をメッセージとして返却し、エラー時は失敗理由を含むメッセージを返却します。
     *
     * 実装理由（なぜ必要か）:
     * クライアント操作を受けてWBSの構造を変更する中心的な処理です。移動処理の呼び出し、エラーハンドリング、
     * ユーザーに返すためのメッセージ整形を一元的に行うことで、クライアント／サーバ間の契約を安定させます。
     *
     * 期待される args の形:
     * { taskId: string, newParentId?: string | null }
     *
     * 考慮すべきエッジケース:
     * - リポジトリが注入されていない
     * - taskId が存在しない／移動先が不正
     * - リポジトリ層での例外発生
     *
     * @param {any} args 実行引数 (taskId, newParentId)
     * @returns {Promise<any>} ツールの実行結果オブジェクト
     */
    async run(args: any) {
        try {
            // リポジトリ検証
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 指定タスクを新しい親配下に移動し、結果を返す
            const task = await repo.moveTask(args.taskId, args.newParentId ?? null);
            return { content: [{ type: 'text', text: `✅ Task moved successfully!\n\n${JSON.stringify(task, null, 2)}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to move task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

/**
 * 処理名: 単一インスタンスのエクスポート (instance)
 *
 * 概要:
 * このモジュールで使用するためのデフォルトインスタンスを生成してエクスポートします。
 *
 * 実装理由（なぜ必要か）:
 * 他のモジュールが簡単にこのツールを利用できるように単一インスタンスを提供しておくため。DIやテスト時に
 * インスタンスを差し替えることも可能です。
 */
export const instance = new WbsMoveTaskTool();
