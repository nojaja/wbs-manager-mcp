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

            // 更新データを組み立てて DB を更新する
            const updateData = this.buildUpdateData(args, currentTask);
                // 新しい updateTask シグネチャ: updateTask(taskId, title?, description?, parentId?, assignee?, estimate?, options?)
                const options: any = {
                    dependencies: args.dependency ?? undefined,
                    artifacts: updateData.deliverables ?? undefined,
                    completionConditions: updateData.completionConditions ?? undefined,
                    ifVersion: args.ifVersion
                };
                const parentIdVal = args.parentId !== undefined ? args.parentId : (currentTask.parent_id ?? null);
                // cast to any because TaskRepository.updateTask has a specific signature
                const updatedTask = await (repo as any).updateTask(
                    args.taskId,
                    updateData.title,
                    updateData.description,
                    parentIdVal,
                    updateData.assignee ?? null,
                    updateData.estimate ?? null,
                    options
                );
            return { content: [{ type: 'text', text: `✅ Task updated successfully!\n\n${JSON.stringify(updatedTask, null, 2)}` }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to update task: ${error instanceof Error ? error.message : String(error)}` }] };
        }
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
