/**
 * Tool: wbs.planmode.createDependency
 * @module wbsCreateDependencyTool
 */
import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * wbs.planmode.createDependency ツール
 * タスク間の依存関係を作成し、関連する成果物マッピングを保存します
 * @class WbsCreateDependencyTool
 * @export
 */
export default class WbsCreateDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();
  /**
   * コンストラクタ
   */
  constructor() {
    super({
      name: 'wbs.planmode.createDependency',
      description: "Create a dependency between two tasks in plan mode.\n\nFields:\n- 'dependee': the ID of the preceding task (the task that is depended on / the upstream task).\n- 'dependency': the ID of the following task (the task that depends on the dependee / the downstream task).\n- 'artifacts' (optional): an array of artifact IDs to map artifacts to this dependency.\n\nNotes for callers and LLMs:\n- Task IDs are issued when a task is created using 'wbs.planMode.createTask'.\n- You can list existing task IDs with 'wbs.planMode.listTasks'.\n- When calling this tool, pass 'dependee' as the preceding (upstream) task ID and 'dependency' as the following (downstream) task ID.\n\nReturn: the created dependency record as JSON when successful, or an error message when failed.",
      inputSchema: {
        type: 'object',
        properties: {
          dependee: {
            type: 'string',
            description: "The ID of the preceding (upstream) task that will be depended on. Use task IDs returned by 'wbs.planMode.createTask' or listed via 'wbs.planMode.listTasks'."
          },
          dependency: {
            type: 'string',
            description: "The ID of the following (downstream) task that depends on the 'dependee'. Use task IDs returned by 'wbs.planMode.createTask' or listed via 'wbs.planMode.listTasks'."
          },
          artifacts: {
            type: 'array',
            items: { type: 'string' },
            description: "Optional array of artifact IDs to associate with this dependency (e.g. artifacts produced or required by the dependency)."
          }
        },
        required: ['dependee', 'dependency']
      }
    });
  }

  /**
   * コンストラクタ
   */
  // constructor() {} // constructor is defined above by class body

  /**
   * 指定された引数で依存関係を作成する
   * @param args 実行引数オブジェクト
   * @param args.dependee 依存先タスクID
   * @param args.dependency 依存元タスクID
   * @param args.artifacts 成果物ID配列
   * @returns JSON-RPC用のコンテンツオブジェクト
   */
  async run(args: any) {
    try {
      const dependee = args.dependee;
      const dependency = args.dependency;
      const artifacts = Array.isArray(args.artifacts) ? args.artifacts : [];

      // Note: args.dependee は依存先タスクID、args.dependency は依存元タスクIDという仕様
      // New DB naming: dependency_task_id (依存元), dependee_task_id (依存先)
      const createDependency = await this.repo.createDependency(dependency, dependee, artifacts);
      return { content: [{ type: 'text', text: JSON.stringify({ createDependency }) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to create dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsCreateDependencyTool();
