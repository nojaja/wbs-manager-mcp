import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * wbs.getTask ツール
 * @class
 */
export default class WbsGetTaskTool extends Tool {
    private readonly repo: TaskRepository;
    /**
     * コンストラクタ
     */
    constructor() {
        super({ 
            name: 'wbs.planMode.getTask', 
            description: 'Get task details by ID', 
            inputSchema: { 
                type: 'object', 
                properties: { 
                    taskId: { type: 'string', description: 'Task ID' } }, 
                    required: ['taskId'] 
                } 
        });
        this.repo = new TaskRepository();
    }


    /**
     * 処理名: run (タスク取得処理)
     * 処理概要: 指定された taskId の詳細情報を取得して返却する
     * 実装理由: クライアントがタスク詳細を参照する要求に応じるため
     * @param args ツール引数 (taskId)
     * @returns {Promise<any>} ツールレスポンス
     */
    async run(args: any) {
        // リポジトリを取得してタスク検索を行う
        const repo = this.repo;
        try {
            if (!repo) throw new Error('Repository not injected');
            const task = await repo.getTask(args.taskId);
            // 見つからない場合はユーザー向けメッセージを返す
            if (!task) throw new Error(`❌ Task not found: ${args.taskId}`);

            // LLM ヒントは専用メソッドで生成して run() の複雑さを下げる
            const llmHints = this.buildLlmHintsForTask(task);
            // タスク情報を JSON で返却
            return { content: [{ type: 'text', text: JSON.stringify({task, llmHints}, null, 2) }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `❌ Failed to get task: ${error instanceof Error ? error.message : String(error)}` }] };
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
}

export const instance = new WbsGetTaskTool();
