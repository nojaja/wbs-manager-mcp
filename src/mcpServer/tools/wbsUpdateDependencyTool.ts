import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * 処理名: wbs.planmode.updateDependency
 * 処理概要: 既存の依存関係を更新し、紐づく成果物マッピングを置換するツール
 * 実装理由: クライアントから依存関係の更新を受け取り、DB側で原子的に反映するため
 */
export default class WbsUpdateDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();

  constructor() {
    super({
      name: 'wbs.planmode.updateDependency',
      description: 'Update an existing dependency between tasks',
      inputSchema: {
        type: 'object',
        properties: {
          dependencyId: { type: 'string' },
          dependee: { type: 'string' },
          dependency: { type: 'string' },
          artifacts: { type: 'array', items: { type: 'string' } }
        },
        required: ['dependencyId', 'dependee', 'dependency']
      }
    });
  }

  async run(args: any) {
    try {
      const dependencyId = args.dependencyId;
      const dependee = args.dependee;
      const dependency = args.dependency;
      const artifacts = Array.isArray(args.artifacts) ? args.artifacts : [];

      const updated = await this.repo.updateDependency(dependencyId, dependee, dependency, artifacts);
      return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to update dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsUpdateDependencyTool();
