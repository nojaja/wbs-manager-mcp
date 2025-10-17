import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * 処理名: wbs.planmode.deleteDependency
 * 処理概要: 指定の依存関係を削除するツール
 * 実装理由: クライアント要求で依存関係を削除し、関連するマッピングも DB の外部キーで整合的に削除されるようにするため
 */
export default class WbsDeleteDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();

  constructor() {
    super({
      name: 'wbs.planmode.deleteDependency',
      description: 'Delete a dependency between tasks',
      inputSchema: {
        type: 'object',
        properties: {
          dependencyId: { type: 'string' }
        },
        required: ['dependencyId']
      }
    });
  }

  async run(args: any) {
    try {
      const dependencyId = args.dependencyId;
      const ok = await this.repo.deleteDependency(dependencyId);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: ok }) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to delete dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsDeleteDependencyTool();
