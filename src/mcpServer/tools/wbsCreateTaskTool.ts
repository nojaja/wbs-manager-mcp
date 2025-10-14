import { Tool } from './Tool';

/**
 * wbs.createTask ツール
 */
export default class WbsCreateTaskTool extends Tool {
    repo: any | null;
    /**
     * @constructor
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
     * @param deps DIで注入される依存
     */
    async init(deps?: any) {
        await super.init(deps);
        this.repo = this.deps.repo || null;
    }

    /**
     * タスク作成処理 (ツール呼び出しから)
     * @param args ツール引数 (title, description, parentId, assignee, estimate)
    * @returns {Promise<any>} ツールレスポンス
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
     * task オブジェクトから LLM に渡すヒントを生成する
     * - draft の場合は未設定フィールドを検出し、`wbs.planMode.updateTask` を使う指示を追加する
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
     * draft タスクに対して未設定のフィールド一覧を返す
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
     * 指定フィールドに対する updateTask 用の nextAction オブジェクトを生成する
     */
    /**
     * 指定フィールドに対する updateTask 用の nextAction オブジェクトを生成する
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
     * 未設定フィールドの一覧から nextActions に updateTask アクションを追加する
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
