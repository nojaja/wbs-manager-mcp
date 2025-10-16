import { Tool } from './Tool';

/**
 * 処理名: WBS タスク作成ツール (wbs.planMode.createTask)
 * 概要: 引数を受け取り、WBS のタスクを作成するためのラッパーツールです。
 *       リポジトリ層へ createTask を委譲し、作成結果から LLM に渡す補助ヒントを生成して返却します。
 * 実装理由: 外部呼び出し（ツールプラグイン経由）からタスク作成の共通処理を一元化し、
 *       引数の正規化・検証、エラーハンドリング、LLM 向けヒント生成を集中管理するために必要です。
 */
export default class WbsCreateTaskTool extends Tool {
    repo: any | null;
    /**
     * 処理名: コンストラクタ
     * 概要: ツール定義（名前・説明・入力スキーマ）を初期化し、リポジトリ参照を初期化します。
     * 実装理由: ツールとして登録されるためのメタ情報（inputSchema 等）をセットアップし、
     *       後続の init() で DI による依存注入を受けられる状態にする必要があるためです。
     */
    constructor() {
        super({
            name: 'wbs.planMode.createTask',
            description: 'Create a new task (tool plugin wrapper)',
            inputSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Task title' },
                    description: { type: 'string', description: 'Task description' },
                    assignee: { type: 'string', description: 'Assignee name' },
                    estimate: { type: 'string', description: 'Time estimate' },
                    completionConditions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { description: { type: 'string' } },
                            required: ['description']
                        }
                    },
                    parentId: { type: 'string', description: 'Parent task ID' },
                    deliverables: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } },
                            required: ['artifactId']
                        }
                    },
                    prerequisites: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { artifactId: { type: 'string' }, crudOperations: { type: 'string' } },
                            required: ['artifactId']
                        }
                    }
                },
                required: ['title']
            }
        });
        this.repo = null;
    }

    /**
     * 処理名: 初期化 (init)
     * 概要: 依存注入されたオブジェクトを受け取り、ローカルで使用するリポジトリ参照を設定します。
     * 実装理由: テストや実行環境に応じてリポジトリ実装を差し替え可能にし、createTask 等の呼び出しで
     *       実際の永続化層へアクセスできるようにするためです。
     * @param deps DIで注入される依存オブジェクト（例: { repo })
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * 処理名: タスク作成実行 (run)
     * 概要: ツール呼び出しから渡された引数を検証・正規化し、リポジトリの createTask を呼んで
     *       タスクを作成します。作成結果を整形して content と LLM 用のヒントを返却します。
     * 実装理由: UI や外部システムからの要求を受けてタスクを永続化するためのエントリポイントであり、
     *       引数のバリデーション、エラー整形、LLM ヒント生成などの横断的関心事を処理するために必要です。
     * @param args ツール引数 (title, description, parentId, assignee, estimate, deliverables, prerequisites, completionConditions)
     * @returns {Promise<any>} ツールの実行結果（content と llmHints を含む）
     */
    async run(args: any) {
        try {
            // リポジトリの存在確認
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            // 引数を正規化して DB に渡す（deliverables/prerequisites/conditions の整形と検証）
            const task = await repo.createTask(
                args.title,
                args.description ?? '',
                args.parentId ?? null,
                args.assignee ?? null,
                args.estimate ?? null,
                {
                    deliverables: Array.isArray(args.deliverables) ? args.deliverables.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    prerequisites: Array.isArray(args.prerequisites) ? args.prerequisites.map((item: any) => ({
                        artifactId: item?.artifactId,
                        crudOperations: item?.crudOperations ?? item?.crud ?? null
                    })) : [],
                    completionConditions: Array.isArray(args.completionConditions)
                        ? args.completionConditions
                            .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                            .map((item: any) => ({ description: item.description.trim() }))
                        : []
                }
            );
            // task オブジェクトに加え、mcpClient側のLLMに渡すためのヒント情報を付与します。
            // llmHints の構造:
            // {
            //   nextActions: Array<{ action: string, detail?: string }>,
            //   notes: string[]
            // }
            // LLM ヒントは専用メソッドで生成して run() の複雑さを下げる
            const llmHints = this.buildLlmHintsForTask(task);
            return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }], llmHints };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = {
                nextActions: [
                    { action: 'retryCreate', detail: '引数を検証して再試行してください' },
                    { action: 'checkRepo', detail: 'リポジトリの注入状態を確認してください' }
                ],
                notes: [
                    `例外メッセージ: ${message}`,
                    'エラー発生時は詳細ログをサーバー側で確認してください。'
                ]
            };
            return { content: [{ type: 'text', text: `❌ Failed to create task: ${message}` }], llmHints };
        }
    }

    // task に基づく LLM 向けヒントを生成する
    /**
     * 処理名: LLM ヒント生成 (buildLlmHintsForTask)
     * 概要: 作成された task オブジェクトを解析して、LLM（例: 補助 AI）に渡すための
     *       nextActions と notes を生成します。draft ステータスの場合は未設定フィールドに基づく
     *       updateTask の提案を含めます。
     * 実装理由: フロントや LLM に対して次の操作候補を示すことで、ユーザー支援や自動化ワークフローの
     *       補助を行うために必要です。タスク作成後のフォローアップ操作を分かりやすく提示します。
     * @param {any} task タスクオブジェクト
     * @returns {{nextActions: any[], notes: string[]}} llmHints オブジェクト
     */
    private buildLlmHintsForTask(task: any) {
        const nextActions: any[] = [
            { action: 'linkArtifacts', detail: (task?.deliverables && task.deliverables.length > 0) || (task?.options && Array.isArray(task.options.deliverables) && task.options.deliverables.length > 0) ? '紐付けられた成果物を確認してください' : '成果物が未指定です。必要なら deliverables を追加してください' }
        ];

        const notes: string[] = [
            `作業を細分化できる場合は、このtaskIdをparentIdに指定して詳細タスクを登録してください。追加するにはツール 'wbs.planMode.createTask' を使用してください。`,
        ];

        try {
            const status = task?.status ?? null;
            if (status === 'draft') {
                const taskId = task?.id ?? task?.taskId ?? '<TASK_ID>';
                const missing = this.getMissingDraftFields(task);
                this.appendMissingFieldActions(missing, nextActions, taskId);
                if (missing.length > 0) notes.push('missing: ' + missing.join(', '));
            }
        } catch (e) {
            notes.push(`llmHints 生成中に例外が発生しました: ${e instanceof Error ? e.message : String(e)}`);
        }

        return { nextActions, notes };
    }

    /**
     * 処理名: draft 未設定フィールド検出 (getMissingDraftFields)
     * 概要: draft 状態の task を検査して、title/description/estimate や
     *       options 配下の deliverables/prerequisites/completionConditions が未設定かどうかを判定し、
     *       未設定フィールドの配列を返します。
     * 実装理由: draft タスクは不完全な状態であることが多く、どのフィールドが欠落しているかを特定して
     *       追加の updateTask 提案を生成するために必要です。
     * @param {any} task タスクオブジェクト
     * @returns {string[]} 未設定フィールドの配列
     */
    private getMissingDraftFields(task: any): string[] {
        const deliverables = task?.options?.deliverables ?? task?.deliverables ?? [];
        const prerequisites = task?.options?.prerequisites ?? task?.prerequisites ?? [];
        const completionConditions = task?.options?.completionConditions ?? task?.completionConditions ?? [];
        const missing: string[] = [];
        if (!task?.title || String(task.title).trim().length === 0) missing.push('title');
        if (!task?.description || String(task.description).trim().length === 0) missing.push('description');
        if (!task?.estimate) missing.push('estimate');
        if (!Array.isArray(deliverables) || deliverables.length === 0) missing.push('options.deliverables');
        if (!Array.isArray(prerequisites) || prerequisites.length === 0) missing.push('options.prerequisites');
        if (!Array.isArray(completionConditions) || completionConditions.length === 0) missing.push('options.completionConditions');
        return missing;
    }

    /**
     * 処理名: updateTask アクション生成 (buildUpdateActionForField)
     * 概要: 指定された未設定フィールドに対して、LLM/フロントが呼び出すべき
     *       'wbs.planMode.updateTask' の利用方法を含む nextAction オブジェクトを生成します。
     * 実装理由: ユーザーや自動化エージェントが不足しているフィールドを埋めるために
     *       どのツールをどのように使えばよいかを明確に伝える必要があるためです。
     * @param {string} field フィールド名
     * @param {string} taskId タスクID
     * @returns {object} nextAction オブジェクト
     */
    private buildUpdateActionForField(field: string, taskId: string) {
        return {
            action: 'updateTask',
            detail: `このタスクは 'draft' です。フィールド '${field}' が未設定です。追加するにはツール 'wbs.planMode.updateTask' を使用してください。 例: { taskId: ${taskId}, ${field.includes('.') ? field.replace('options.', '') : field}: <value> }`,
            tool: 'wbs.planMode.updateTask'
        };
    }

    /**
     * 処理名: 未設定フィールドアクション追加 (appendMissingFieldActions)
     * 概要: 未設定フィールドの配列を受け取り、それぞれに対して updateTask を呼ぶための
     *       nextAction を生成して nextActions 配列へ追加します。
     * 実装理由: getMissingDraftFields の結果を利用して LLM/フロントが実行すべき具体的な
     *       アクションのリストを作成するために必要です。
     * @param {string[]} missingFields 未設定フィールド名の配列
     * @param {any[]} nextActions 追加先の nextActions 配列
     * @param {string} taskId タスクID
     */
    private appendMissingFieldActions(missingFields: string[], nextActions: any[], taskId: string) {
        for (const field of missingFields) {
            nextActions.push(this.buildUpdateActionForField(field, taskId));
        }
    }

}

export const instance = new WbsCreateTaskTool();
