import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * wbs.planMode.updateTask ツール実装
 * - 既存タスクの更新を行う
 * @class
 */
export default class WbsUpdateTaskTool extends Tool {
    /** リポジトリ（DI注入） */
    private readonly repo: TaskRepository;
    private readonly dependenciesRepo: DependenciesRepository;

    /**
     * コンストラクタ
     */
    constructor() {
        super({
            name: 'wbs.planMode.updateTask',
            description: 'Update an existing task.For LLM-driven automation, provide a clear "description" prompt with execution instructions, use `completionConditions.description` for audit/acceptance prompts, and list any affected artifacts in `artifacts` for traceability.',
            inputSchema: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    title: { type: 'string', description: 'Task title (required). A short, descriptive label for the task.' },
                    description: { type: 'string', description: 'Instruction prompt describing what must be done to complete the task. Write concrete steps or acceptance criteria so an LLM or a human can act on it.' },
                    assignee: { type: 'string', description: 'Assignee name or user identifier. If omitted the task will be unassigned.' },
                    estimate: { type: 'string', description: "Estimated time required for the task (examples: '4h', '2d'). If the work exceeds 8 hours it is recommended to split it into subtasks." },
                    completionConditions: {
                        type: 'array',
                        description: 'An array of audit/acceptance prompts used to determine whether the task is complete. Each item should contain a description that can be used as a verification checklist or test prompt.',
                        items: {
                            type: 'object',
                            properties: {
                                description: { type: 'string', description: 'A verification/audit prompt describing how to judge that the task is complete. Be specific and include measurable checks where possible.' }
                            },
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
                    },
                    ifVersion: { type: 'number' }
                },
                required: ['taskId']
            }
        });
        this.repo = new TaskRepository();
        this.dependenciesRepo = new DependenciesRepository();
    }


    /**
     * 依存関係を初期化
     * @param deps 依存注入オブジェクト
     * @returns Promise<void>
     */
    async init(deps?: any) {
        // no-op: repository created directly
        await super.init(deps);
    }


    /**
     * タスク更新を実行
     * @param args 更新引数
     * @returns ツールレスポンス
     */
    async run(args: any) {
        try {
            // リポジトリ取得と存在確認
            const repo = this.repo;
            if (!repo) throw new Error('Repository not injected');
            const depRepo = this.dependenciesRepo;
            if (!depRepo) throw new Error('DependenciesRepository not injected');

            // 対象タスクを取得し、存在しない場合は notFound を返す
            const currentTask = await repo.getTask(args.taskId);
            if (!currentTask) return this.notFound(args.taskId);

            // 楽観ロック用バージョン検証を実行（競合検出）
            const versionErr = this.checkVersion(args, currentTask);
            if (versionErr) return versionErr;

            // cast to any because TaskRepository.updateTask has a specific signature
            const { dependencies, artifacts, completionConditions } = this.normalizeInputs(args);
            console.error('Normalized Inputs:', { dependencies, artifacts, completionConditions });
            const updatedTask = await (repo as any).updateTask(
                args.taskId,
                args.title ?? currentTask.title,
                args.description ?? currentTask.description,
                args.parentId ?? currentTask.parent_id ?? null,
                args.assignee ?? currentTask.assignee ?? null,
                args.estimate ?? currentTask.estimate ?? null,
                { dependencies, artifacts, completionConditions }
            );
            // LLM ヒントは専用メソッドで生成して run() の複雑さを下げる
            const llmHints = this.buildLlmHintsForTask(updatedTask);
            return { content: [{ type: 'text', text: JSON.stringify({updatedTask, llmHints}, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `${error instanceof Error ? error.message : String(error)}` }],"isError": true };
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
     * 処理名: LLM ヒント生成
     * 処理概要: 作成されたタスクから、追加で必要な操作（例: 成果物の紐付けや未設定フィールドの更新）を表す nextActions とメモを生成する
     * 実装理由: クライアント側の LLM や UI が次の推奨アクションを提示できるように、構造化されたガイダンスを提供するため
     * @param {any} task タスクオブジェクト
     * @returns {{nextActions: any[], notes: string[]}} llmHints オブジェクト
     */
    private buildLlmHintsForTask(task: any) {
        const nextActions: any[] = [];
        //dependenciesが未指定の場合のnextAction追加
        if (!task.dependencies || task.dependencies.length === 0) {
            nextActions.push({ action: 'wbs.planMode.updateTask', detail: '依存関係が未指定です。後続タスクがある場合はdependenciesに設定してください' });
        }
        //artifactsが未指定の場合のnextAction追加
        if (!task.artifact || task.artifact.length === 0) {
            nextActions.push({ action: 'wbs.planMode.createArtifact', detail: '成果物IDは`wbs.planMode.createArtifact`にて登録を行うIDが生成されます' });
            nextActions.push({ action: 'wbs.planMode.updateTask', detail: '成果物は必須です。タスクで編集する成果物をartifactsに設定してください' });
        }
        //completionConditionsが未指定の場合のnextAction追加
        if (!task.completionConditions || task.completionConditions.length === 0) {
            nextActions.push({ action: 'wbs.planMode.updateTask', detail: '完了条件は必須です。タスクの完了条件をcompletionConditionsに設定してください' });
        }
        const notes: string[] = [
            `必要な情報が登録されるとステータスがdraftからpendingに自動更新されます。`,
        ];

        return { nextActions, notes };
    }
    /**
     * タスク未検出時レスポンス生成
     * @param taskId タスクID
     * @returns レスポンス
     */
    private notFound(taskId: string) {
        return { content: [{ type: 'text', text: `❌ Task not found: ${taskId}` }] };
    }

    /**
     * 楽観ロック検証
     * バージョン不一致時はエラーを返す
     * なぜ必要か: 複数ユーザー編集時の競合検出・整合性維持のため
     * @param task 入力タスク
     * @param currentTask 現在タスク
     * @returns エラー応答またはnull
     */
    private checkVersion(task: any, currentTask: any) {
        if (task.ifVersion !== undefined && currentTask.version !== task.ifVersion) {
            return { content: [{ type: 'text', text: `❌ Task has been modified by another user. Expected version ${task.ifVersion}, but current version is ${currentTask.version}` }] };
        }
        return null;
    }

    /**
     * 更新データ生成
     * 更新引数と現在のタスクから更新用オブジェクトを生成する
     * なぜ必要か: DB更新時に必要な差分のみを安全にまとめるため
     * @param args 実行引数
     * @param currentTask 現在タスク
     * @returns 更新オブジェクト
     */
    private buildUpdateData(args: any, currentTask: any) {
        return {
            title: args.title !== undefined ? args.title : currentTask.title,
            description: args.description !== undefined ? args.description : currentTask.description,
            assignee: args.assignee !== undefined ? args.assignee : currentTask.assignee,
            status: args.status !== undefined ? args.status : currentTask.status,
            estimate: args.estimate !== undefined ? args.estimate : currentTask.estimate,
            deliverables: Array.isArray(args.deliverables)
                ? args.deliverables.map((item: any) => ({ artifactId: item?.artifactId, crudOperations: item?.crudOperations ?? item?.crud ?? null }))
                : undefined,
            prerequisites: Array.isArray(args.prerequisites)
                ? args.prerequisites.map((item: any) => ({ artifactId: item?.artifactId, crudOperations: item?.crudOperations ?? item?.crud ?? null }))
                : undefined,
            completionConditions: Array.isArray(args.completionConditions)
                ? args.completionConditions
                    .filter((item: any) => typeof item?.description === 'string' && item.description.trim().length > 0)
                    .map((item: any) => ({ description: item.description.trim() }))
                : undefined,
            ifVersion: args.ifVersion
        };
    }
}

export const instance = new WbsUpdateTaskTool();
