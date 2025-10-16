import { Tool } from './Tool';

/**
 * 処理名: WBS 複数タスクインポートツール
 * 概要: WBS（Work Breakdown Structure）形式のタスクを一括でインポートするためのツールクラスです。
 * 実装理由: 外部から複数のタスクデータを受け取り、リポジトリの importTasks を利用して一括登録する責務を明確化するため。
 *           バッチ的なタスク登録を一元化することで、呼び出し側の実装を簡潔に保ち、リポジトリ注入によるテスト容易性を確保します。
 * @class
 */
export default class WbsImpotTaskTool extends Tool {
    repo: any | null;

    /**
     * 処理名: コンストラクタ
     * 概要: ツール名・説明・入力スキーマを親クラス Tool に渡して初期化します。
     * 実装理由: ツールとしてのメタ情報（name, description, inputSchema）を定義するため。これにより外部から呼び出す際の入力検証や説明表示が可能になります。
     */
    constructor() {
        super({ name: 'wbs.planMode.impotTask', description: 'Import multiple tasks', inputSchema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' }, assignee: { type: 'string' }, estimate: { type: 'string' }, deliverables: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, prerequisites: { type: 'array', items: { type: 'object', properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } }, required: ['artifactId'] } }, completionConditions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } } }, required: ['title'] } } }, required: ['tasks'] } });
        this.repo = null;
    }

    /**
     * 処理名: 初期化
     * 概要: DIで注入された依存関係（特にリポジトリ）を受け取り、内部フィールドに設定します。
     * 実装理由: テスト時にモックリポジトリを注入したり、実行時に環境に応じた実装を差し替え可能にするため。副作用は最小化し、依存注入による疎結合を実現します。
     * @param {any} deps DIで注入される依存
     * @returns {Promise<void>}
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: 複数タスクの一括登録実行
     * 概要: 引数で受け取った tasks 配列を正規化し、リポジトリの importTasks を呼び出してタスクを一括登録します。
     * 実装理由: 一括登録処理をツール側で完結させることで、呼び出し元は単にタスクデータを渡すだけで済み、エラーハンドリングやレスポンス生成を統一できます。
     *           また、リポジトリが注入されていない場合は明示的にエラーを返し、安全性を確保します。
     * @param {any} args 実行引数 (tasks)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ存在確認と入力タスク配列の正規化
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            // importTasks を呼び出して一括登録を実行
            const created = await repo.importTasks(tasks);
            return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to import tasks: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsImpotTaskTool();
