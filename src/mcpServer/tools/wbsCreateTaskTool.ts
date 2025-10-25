import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * 処理名: wbs.planMode.createTask ツール実装
 * 処理概要: クライアント（MCP）からのタスク作成要求を受け取り、TaskRepository を介してタスクおよび関連データ（deliverables/prerequisites/completionConditions）を作成するツールプラグイン。
 * 実装理由: MCP プロトコル経由でタスク作成機能をプラグイン化し、サーバ側で一貫したバリデーションと関連データの同期を行うため。
 * @class
 */
export default class WbsCreateTaskTool extends Tool {
    private readonly repo: TaskRepository;
    private readonly dependenciesRepo: DependenciesRepository;
    /**
     * 処理名: コンストラクタ
     * 処理概要: ツールのメタ情報を設定し、内部で使用する TaskRepository を生成する
     * 実装理由: ToolRegistry に登録される際のメタ情報を定義し、リポジトリを直接利用できるように初期化するため
     */
    constructor() {
        super({
            name: 'wbs.planMode.createTask',
            description: 'Tool to create a WBS task. If `parentId` is provided the new task will be created as a child of that parent; if omitted the task is registered at the root level. When creation succeeds a task ID is issued and the created task can be retrieved in lists via `wbs.planMode.listTasks`. For LLM-driven automation, provide a clear "details" prompt with execution instructions, use `completionConditions.description` for audit/acceptance prompts, and list any affected artifacts in `artifacts` for traceability.',
            inputSchema: {
                type: 'object',
                properties: {
                    parentId: { type: 'string', description: 'Parent task ID. If provided the new task will be registered as a child of this task. If null or omitted the task will be created at the root level.' },
                    title: { type: 'string', description: 'Task title (required). A short, descriptive label for the task.' },
                    description: { type: 'string', description: 'Instruction prompt describing what must be done to complete the task. Write concrete steps or acceptance criteria so an LLM or a human can act on it.' },
                    assignee: { type: 'string', description: 'Assignee name or user identifier. If omitted the task will be unassigned.' },
                    estimate: { type: 'string', description: "Estimated time required for the task (examples: '4h', '2d'). If the work exceeds 8 hours it is recommended to split it into subtasks." },
                    details: { type: 'string', description: 'Set the prompt for the work LLM, including detailed work content, work steps, and background information necessary for the LLM to perform the work accurately.' },
                    completionConditions: {
                        type: 'array',
                        description: 'An array of audit/acceptance prompts used to determine whether the task is complete. Each item should contain a description that can be used as a verification checklist or test prompt.',
                        items: {
                            type: 'object',
                            properties: { description: { type: 'string', description: 'A verification/audit prompt describing how to judge that the task is complete. Be specific and include measurable checks where possible.' } },
                            required: ['description']
                        }
                    },
                    artifacts: {
                        type: 'array',
                        description: 'List of artifacts that will be added or modified by this task. Use this to link deliverables or files to the task.',
                        items: {
                            type: 'object',
                            properties: { artifactId: { type: 'string', description: 'ID of the artifact that will be added or modified by the task.' }, crudOperations: { type: 'string', description: "CRUD operation(s) applied to the artifact: use C, R, U, D (create/read/update/delete). If multiple, use a agreed format such as comma-separated values." } },
                            required: ['artifactId']
                        }
                    },
                    dependency: {
                        type: 'array',
                        description: 'Array of related task references. Use `taskId` to point to successor or dependent tasks.',
                        items: {
                            type: 'object',
                            properties: { taskId: { type: 'string', description: 'ID of a related task (for example a successor or dependency).' } },
                            required: ['taskId']
                        }
                    }
                },
                required: ['title']
            }
        });
        this.repo = new TaskRepository();
        this.dependenciesRepo = new DependenciesRepository();
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
            const depRepo = this.dependenciesRepo;
            if (!depRepo) throw new Error('DependenciesRepository not injected');
            // Normalize inputs and create the task
            // Support both 'dependencies' and singular 'dependency' keys from callers/tests
            const inputArgs = { ...args };
            if (!inputArgs.dependencies && inputArgs.dependency) inputArgs.dependencies = inputArgs.dependency;
            const { dependencies, artifacts, completionConditions } = this.normalizeInputs(inputArgs);
            const task = await repo.createTask(
                args.title,
                args.description ?? '',
                args.details ?? '',
                args.parentId ?? null,
                args.assignee ?? null,
                args.estimate ?? null,
                { dependencies, artifacts, completionConditions }
            );
                // pass details through options so repository can persist it
                // (keep backwards compatible signature)

            // Create dependencies (if any) in a separated helper to keep complexity low
            const dependencyResults = await this.createDependenciesForTask(task, inputArgs.dependencies);
            // task オブジェクトに加え、mcpClient側のLLMに渡すためのヒント情報を付与します。
            // llmHints の構造:
            // {
            //   nextActions: Array<{ action: string, detail?: string }>,
            //   notes: string[]
            // }
            // LLM ヒントは専用メソッドで生成して run() の複雑さを下げる
            const llmHints = this.buildLlmHintsForTask(task);
            // Include dependency creation results to help the caller understand any partial failures
            return { content: [{ type: 'text', text: JSON.stringify({task, llmHints}, null, 2) }], dependencies: dependencyResults };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = {
                nextActions: [
                    { action: 'retryCreate', detail: 'Validate input arguments and retry.' },
                    { action: 'checkRepo', detail: 'Verify repository injection and database availability.' }
                ],
                notes: [
                    `Exception message: ${message}`,
                    'Check server logs for full stack trace and details.'
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
        const nextActions: any[] = [];
        //detailsが未指定の場合のnextAction追加
        if (!task.details || task.details.length === 0) {
            nextActions.push({ action: 'wbs.planMode.updateTask', detail: '詳細が未指定です。タスクの詳細をdetailsに設定してください' });
        }
        //dependenciesが未指定の場合のnextAction追加
        if (!task.dependencies || task.dependencies.length === 0) {
            nextActions.push({ action: 'addDependencies', detail: '依存関係が未指定です。後続タスクがある場合はdependenciesに設定してください' });
        }
        //artifactsが未指定の場合のnextAction追加
        if (!task.artifacts || task.artifacts.length === 0) {
            nextActions.push({ action: 'addArtifacts', detail: '成果物は必須です。タスクで編集する成果物をartifactsに設定してください' });
        }
        //completionConditionsが未指定の場合のnextAction追加
        if (!task.completionConditions || task.completionConditions.length === 0) {
            nextActions.push({ action: 'addCompletionConditions', detail: '完了条件は必須です。タスクの完了条件をcompletionConditionsに設定してください' });
        }

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

    /**
     * Normalize input arrays for dependencies/artifacts/completionConditions
     * @param {any} args Raw tool arguments
     * @returns {{dependencies:any[],artifacts:any[],completionConditions:any[]}} Normalized arrays ready for TaskRepository
     */
    private normalizeInputs(args: any) {
        const dependencySource = Array.isArray(args.dependencies) ? args.dependencies : [];
        const artifactsSource = Array.isArray(args.artifacts) ? args.artifacts : [];

        const dependencies = dependencySource.map((item: any) => ({
            artifactId: item?.artifactId,
            crudOperations: item?.crudOperations ?? item?.crud ?? null
        }));

        const artifacts = artifactsSource.map((item: any) => ({
            artifactId: item?.artifactId,
            crudOperations: item?.crudOperations ?? item?.crud ?? null
        }));

        const completionConditions = Array.isArray(args.completionConditions)
            ? args.completionConditions
                .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                .map((item: any) => ({ description: item.description.trim() }))
            : [];

        return { dependencies, artifacts, completionConditions };
    }

    /**
     * Create dependency records for the newly created task.
     * @param {any} task Created task object (expects task.id)
     * @param {any} dependencyInput Raw dependency input value from args
     * @returns {Promise<any[]>} Array of result objects describing success/failure per dependency
     */
    private async createDependenciesForTask(task: any, dependencyInput: any): Promise<any[]> {
        const results: any[] = [];
        if (!task || !task.id) return results;
        if (!Array.isArray(dependencyInput) || dependencyInput.length === 0) return results;

        const validItems = dependencyInput.filter((d: any) => d && typeof d.taskId === 'string' && d.taskId.trim().length > 0).map((d: any) => ({
            taskId: d.taskId,
            artifacts: Array.isArray(d.artifacts) ? d.artifacts.filter((a: any) => typeof a === 'string') : undefined
        }));

        if (validItems.length === 0) return results;

        const promises = validItems.map((it: any) => this.dependenciesRepo.createDependency(task.id, it.taskId, it.artifacts));
        const settled = await Promise.allSettled(promises);

        for (let i = 0; i < settled.length; i++) {
            const s = settled[i];
            const input = validItems[i];
            if (s.status === 'fulfilled') {
                results.push({ success: true, dependency: s.value });
            } else {
                results.push({ success: false, error: s.reason instanceof Error ? s.reason.message : String(s.reason), input });
            }
        }

        return results;
    }

}

export const instance = new WbsCreateTaskTool();
