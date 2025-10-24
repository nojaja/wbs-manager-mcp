/**
 * Tool: wbs.planmode.deleteDependency
 * @module wbsDeleteDependencyTool
 */
import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * wbs.planmode.deleteDependency ツール
 * 指定の依存関係を削除します
 * @class WbsDeleteDependencyTool
 * @export
 */
export default class WbsDeleteDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();
  /**
   * コンストラクタ
   */
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

  /**
   * コンストラクタ
   */
  // constructor() {} // defined above

  /**
   * 指定された dependencyId を削除する
   * @param args 実行引数オブジェクト
   * @param args.dependencyId 削除対象の依存関係ID
   * @returns JSON-RPC用のコンテンツオブジェクト
   */
  async run(args: any) {
    try {
      const dependencyId = args.dependencyId;
      const deleteDependency = await this.repo.deleteDependency(dependencyId);
      return { content: [{ type: 'text', text: JSON.stringify({ deleteDependency }) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to delete dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsDeleteDependencyTool();
