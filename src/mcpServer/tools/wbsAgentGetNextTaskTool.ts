import { Tool } from './Tool';
import { TaskRepository } from '../repositories/TaskRepository';
import { DependenciesRepository } from '../repositories/DependenciesRepository';
import { getDatabase } from '../db/connection';

/**
 * 処理名: wbs.agentmode.getNextTask
 * 処理概要: 次に実行すべきタスクを決定して返す。既に in-progress のタスクがあればそれを返す。なければ末端で pending のタスクのうち依存先が無いか全て completed のものを選び、そのタスクを in-progress に変更して返す。
 * 実装理由: エージェント実行時に並行実行や競合を起こさないよう、起動中のタスクを優先し、次に安全に開始可能なタスクを選んで状態遷移を行うため
 */
export default class WbsAgentGetNextTaskTool extends Tool {
  private readonly repo: TaskRepository;
  private readonly depsRepo: DependenciesRepository;

  /**
   * コンストラクタ
   * 処理概要: リポジトリを初期化する
   * 実装理由: ツールの実行に必要な依存（TaskRepository, DependenciesRepository）を準備するため
   */
  constructor() {
    super({
      name: 'wbs.agentmode.getNextTask',
      description: 'Return the next task to execute. Prioritizes existing in-progress tasks; otherwise selects a leaf pending task whose dependees are none or all completed, then marks it in-progress and returns it.'
    });
    this.repo = new TaskRepository();
    this.depsRepo = new DependenciesRepository();
  }

  /**
   * 処理名: 実行エントリ (run)
   * 処理概要: MCP 呼び出しのエントリポイント。実行可能なタスクを検索し、選定した場合は in-progress に遷移させて返す
   * 実装理由: MCP の tools/call から呼ばれる単一エントリであり、ここで外部からの引数チェックやエラーハンドリングを行うため
   * @param _args なし
   * @returns {Promise<any>} ツール実行結果オブジェクト
   */
  async run(_args: any) {
    try {
      // 1) 既に in-progress のタスクがあれば優先して返却する
      const inProgress = await this.findExistingInProgress();
      if (inProgress) return inProgress;

      // 2) 末端 pending タスク候補を走査し、依存関係が解決されたタスクを選ぶ
      const candidate = await this.findAndClaimRunnableTask();
      if (candidate) return candidate;

      // 3) 見つからない場合は null を返す
      const llmHints = { nextActions: [], notes: ['No runnable task found'] };
      return { content: [{ type: 'text', text: JSON.stringify({ llmHints }) }] };
    } catch (error) {
      // 例外ハンドリング: 呼び出し元へエラーメッセージを返す
      const message = error instanceof Error ? error.message : String(error);
      const llmHints = { nextActions: [{ action: 'wbs.agentmode.getNextTask', detail: 'Retry' }], notes: [`Exception message: ${message}`] };
      return { content: [{ type: 'text', text: `❌ Failed to get next task: ${message}` }], llmHints };
    }
  }

  /**
   * 既に in-progress のタスクを DB から取得してフォーマットして返す
   * 処理概要: 優先度の高い in-progress タスクが存在する場合、それを返す
   * 実装理由: 途中実行中のタスクがあればそれを継続/監視することが優先される
   */
  /**
   * 既に in-progress のタスクを取得して返す
   * @returns {Promise<any|null>} 見つかったタスク情報または null
   */
  private async findExistingInProgress() {
    const db = await getDatabase();
    // DB: in-progress の最も古い更新日時を持つタスクを取得
    const inProgressRow = await db.get<any>(`SELECT id FROM tasks WHERE status = 'in-progress' ORDER BY updated_at ASC LIMIT 1`);
    if (inProgressRow && inProgressRow.id) {
      const t = await this.repo.getTask(inProgressRow.id);
      const llmHints = { nextActions: [], notes: ['Found existing in-progress task'] };
      return { content: [{ type: 'text', text: JSON.stringify(t, null, 2) }], llmHints };
    }
    return null;
  }

  /**
   * 処理名: 依存先が完了しているか判定
   * 処理概要: 指定された dependeeId 配列について、すべてのタスクが 'completed' かを確認する
   * 実装理由: 依存先が完了していない場合は開始できないため、共通ロジックとして抽出する
   * @param {string[]} dependeeIds 依存先タスクIDの配列
   * @returns {Promise<boolean>} すべて完了なら true
   */
  private async areDependeesCompleted(dependeeIds: string[]): Promise<boolean> {
    if (!Array.isArray(dependeeIds) || dependeeIds.length === 0) return true;
    const dependeeTasks = await this.repo.getTasks(dependeeIds);
    if (dependeeTasks.length !== dependeeIds.length) return false;
    return dependeeTasks.every(dt => dt.status === 'completed');
  }

  /**
   * 末端の pending タスクを順に評価し、依存先が解決していれば in-progress に遷移して返す
   * 処理概要: leaf かつ pending のタスクを作成日時順に検索し、dependee が無い/完了済であれば選定して状態遷移する
   * 実装理由: エージェントが安全に開始できる次タスクを自動選定するため
   */
  /**
   * 条件を満たす pending タスクを見つけて in-progress に遷移する
   * @returns {Promise<any|null>} 選定して遷移したタスク情報または null
   */
  private async findAndClaimRunnableTask() {
    const db = await getDatabase();
    // leaf (子を持たない) かつ pending のタスクを取得
    const candidateRows = await db.all<any[]>(
      `SELECT t.id FROM tasks t
       WHERE t.status = 'pending' AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id)
       ORDER BY t.created_at ASC`);

    // 処理概要: 各候補について依存先が全て completed かを確認し、条件を満たしたものを in-progress に更新して返す
    for (const row of candidateRows) {
      const taskId = row.id;
      const dependeeIds = await this.depsRepo.getDependeeByTaskId(taskId);
      // 依存先が全て完了しているかを共通ヘルパで判定
      const okToStart = await this.areDependeesCompleted(dependeeIds);

      if (okToStart) {
        // 選定されたタスクを in-progress に遷移
        const current = await this.repo.getTask(taskId);
        if (!current) continue; // defensive
        // 処理概要: タスクを in-progress に遷移させる
        // 実装理由: 以前は updateTask に status を渡していたが、updateTask のシグネチャ変更に伴い
        //           ステータス更新は専用メソッド updateTaskStatus を使用する
        await this.repo.updateTaskStatus(taskId, 'in-progress', true);
        const currentTask = await this.repo.getTask(taskId);
        const llmHints = { nextActions: [], notes: ['Selected task transitioned to in-progress'] };
        return { content: [{ type: 'text', text: JSON.stringify({ updated: currentTask, llmHints }, null, 2) }] };
      }
    }

    return null;
  }
}

export const instance = new WbsAgentGetNextTaskTool();
