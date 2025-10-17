import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * 処理名: wbs.planmode.createDependency
 * 処理概要: タスク間の依存関係を作成し、関連する成果物マッピングを保存するツール
 * 実装理由: MCP クライアントからの依存関係作成要求を受け取り、サーバ側で整合性のある保存を行うため
 */
export default class WbsCreateDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();

  constructor() {
    super({
      name: 'wbs.planmode.createDependency',
      description: 'Create a dependency between tasks',
      inputSchema: {
        type: 'object',
        properties: {
          dependee: { type: 'string' },
          dependency: { type: 'string' },
          artifacts: { type: 'array', items: { type: 'string' } }
        },
        required: ['dependee', 'dependency']
      }
    });
  }

  async run(args: any) {
    try {
      const dependee = args.dependee;
      const dependency = args.dependency;
      const artifacts = Array.isArray(args.artifacts) ? args.artifacts : [];

      // Note: mapping: dependee -> from_task_id? The spec says dependee is from_task_id (依存先) as from_task_id, dependency is to_task_id
      // In DB columns: from_task_id (依存元), to_task_id (依存先)
      // The user's spec earlier: dependee 依存先タスクidを指定(from_task_id) and dependency 依存元タスクidを指定(to_task_id)
      // To keep consistent with spec, pass fromTaskId = args.dependee, toTaskId = args.dependency
      const created = await this.repo.createDependency(dependee, dependency, artifacts);
      return { content: [{ type: 'text', text: JSON.stringify(created) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to create dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsCreateDependencyTool();
