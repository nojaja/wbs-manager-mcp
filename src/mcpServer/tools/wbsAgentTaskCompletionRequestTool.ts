import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';

/**
 * 処理名: wbs.agentmode.taskCompletionRequest
 * 処理概要: エージェントからの完了リクエストを検証し、妥当であればタスクを完了状態に遷移する
 * 実装理由: 自動化エージェントがタスク完了を報告する際の妥当性確認と状態遷移を担保するため
 * @class
 */
export default class WbsAgentTaskCompletionRequestTool extends Tool {
  /**
   * TaskRepository インスタンス
   * 処理概要: タスクの永続化・取得・更新を行う
   * 実装理由: ツールからタスク情報へアクセスするために必要
   */
  private readonly repo: TaskRepository;
  /**
   * コンストラクタ
   * 処理概要: TaskRepository を初期化する
   * 実装理由: ツール実行に必要な永続化レイヤを準備するため
   * @returns {void}
   */
  constructor() {
    super({
      name: 'wbs.agentmode.taskCompletionRequest',
      description: 'Request to mark a running task as completed. Requires audits for all completionConditions. If audits are missing or any are not approved, the call is rejected and completionConditions are returned.'
    });
    this.repo = new TaskRepository();
  }

  /**
   * 実行エントリ
   * 処理概要: タスク完了リクエストを受け取り監査結果を検証する
   * 実装理由: エージェントが提出した監査結果を検証し、タスクの整合性を保つため
   * @param args { taskId: string, audits: Array<{id:string, ok:boolean}> }
   * @returns {Promise<any>} ツール実行結果オブジェクト
   */
  async run(args: any) {
    try {
      const taskId = args?.taskId;
      const audits: Array<{ id: string; ok: boolean }> = Array.isArray(args?.audits) ? args.audits : [];
      if (!taskId) throw new Error('taskId is required');

      const task = await this.repo.getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

  const completionConditions = task.completionConditions ?? [];
  // 処理概要: 各完了条件に対して監査結果が存在し ok===true であることを検証
  // 実装理由: 完了条件が満たされていない状態でタスクを完了扱いにすると一貫性が壊れるため
  const missing = completionConditions.filter((c: any) => !audits.find(a => a.id === c.id && a.ok === true));
      if (missing.length > 0) {
        // reject and return completionConditions for the client to inspect
        const llmHints = { nextActions: [], notes: ['Completion conditions missing or not approved'] };
        return { content: [{ type: 'text', text: JSON.stringify({ accepted: false, completionConditions }, null, 2) }], llmHints };
      }

  // All audits OK -> set task to completed
  // 処理概要: タスクを completed に遷移させる
  // 実装理由: updateTask のシグネチャ変更に伴い、ステータス更新は updateTaskStatus を使用する
  await this.repo.updateTaskStatus(taskId, 'completed', true);
  const updated = await this.repo.getTask(taskId);
  const llmHints = { nextActions: [], notes: ['Task marked as completed'] };
  return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }], llmHints };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const llmHints = { nextActions: [{ action: 'wbs.agentmode.taskCompletionRequest', detail: 'Retry' }], notes: [`Exception message: ${message}`] };
      return { content: [{ type: 'text', text: `❌ Failed to complete task: ${message}` }], llmHints };
    }
  }
}

/**
 * インスタンスエクスポート
 * 処理概要: ツールのシングルトンインスタンスをエクスポートする
 * 実装理由: 他モジュールから簡単に利用できるようにするため
 * @type {WbsAgentTaskCompletionRequestTool}
 */
export const instance = new WbsAgentTaskCompletionRequestTool();
