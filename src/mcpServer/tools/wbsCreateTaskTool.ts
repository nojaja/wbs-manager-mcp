import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.planMode.createTask ツール実装
 * 処理概要: クライアント（MCP）からのタスク作成要求を受け取り、TaskRepository を介してタスクおよび関連データ（deliverables/prerequisites/completionConditions）を作成するツールプラグイン。
 * 実装理由: MCP プロトコル経由でタスク作成機能をプラグイン化し、サーバ側で一貫したバリデーションと関連データの同期を行うため。
 * @class
 */
export default class WbsCreateTaskTool extends Tool {
    private readonly repo: TaskRepository;
    /**
     * 処理名: コンストラクタ
     * 処理概要: ツールのメタ情報を設定し、内部で使用する TaskRepository を生成する
     * 実装理由: ToolRegistry に登録される際のメタ情報を定義し、リポジトリを直接利用できるように初期化するため
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
        this.repo = new TaskRepository();
    }

    /**
     * 処理名: run (タスク作成)
     * 処理概要: 入力引数を正規化して TaskRepository.createTask を呼び出し、作成されたタスクおよび LLM 向けヒントを返す
     * 実装理由: MCP のツール呼び出しインターフェースに準拠してタスク作成を行い、クライアント側が次のアクションを決定できる補助情報を提供するため
     * @param args ツール引数 (title, description, parentId, assignee, estimate, deliverables 等)
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

    /**
     * 処理名: LLM ヒント生成
     * 処理概要: 作成されたタスクから、追加で必要な操作（例: 成果物の紐付けや未設定フィールドの更新）を表す nextActions とメモを生成する
     * 実装理由: クライアント側の LLM や UI が次の推奨アクションを提示できるように、構造化されたガイダンスを提供するため
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
     * 処理名: draft 欠損フィールド検出
     * 処理概要: draft 状態のタスクに対して、title/description/estimate や関連配列が未設定かを判定して未設定フィールド一覧を返す
     * 実装理由: 作成直後の draft タスクに欠けている情報を特定し、ユーザーへの補完提案や自動化フローの判断材料とするため
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
