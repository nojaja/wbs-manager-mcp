import { Tool } from './Tool';

/** wbs.listTasks ツール */
export default class WbsListTasksTool extends Tool {
    repo: any | null;

    /**
     * コンストラクタ
     */
    constructor() {
        super({ name: 'wbs.listTasks', description: 'List tasks optionally by parentId', inputSchema: { type: 'object', properties: { parentId: { type: 'string' } } } });
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
     * タスク一覧取得処理
     * 指定parentIdのタスク一覧をDBから取得し、ツールレスポンスで返す
     * なぜ必要か: クライアントからのタスク一覧表示要求に応えるため
     * @param {any} args 実行引数 (parentId: 親タスクID、省略時はトップレベル)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        try {
            // DB リポジトリを取得し、存在確認を行う
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 指定 parentId のタスク一覧を取得して文字列化して返す
            const tasks = await repo.listTasks(args.parentId);
            return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to list tasks: ${error instanceof Error ? error.message : String(error)}` }] };
        }
    }
}

export const instance = new WbsListTasksTool();
