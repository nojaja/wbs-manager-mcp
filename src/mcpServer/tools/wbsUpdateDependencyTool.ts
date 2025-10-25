/**
 * Tool: wbs.planmode.updateDependency
 * @module wbsUpdateDependencyTool
 */
import { Tool } from './Tool';
import { DependenciesRepository } from '../repositories/DependenciesRepository';

/**
 * wbs.planmode.updateDependency ツール
 * 既存の依存関係を更新し、紐づく成果物マッピングを置換します
 * @class WbsUpdateDependencyTool
 * @export
 */
export default class WbsUpdateDependencyTool extends Tool {
  private readonly repo = new DependenciesRepository();
  /**
   * コンストラクタ
   */
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

  /**
   * コンストラクタ
   */
  // constructor() {} // defined above

  /**
   * 指定された引数で依存関係を更新する
   * @param args 実行引数オブジェクト
   * @param args.dependencyId 更新対象の依存関係ID
   * @param args.dependee 依存先タスクID
   * @param args.dependency 依存元タスクID
   * @param args.artifacts 成果物ID配列
   * @returns JSON-RPC用のコンテンツオブジェクト
   */
  async run(args: any) {
    try {
      const dependencyId = args.dependencyId;
      const dependee = args.dependee;
      const dependency = args.dependency;
      const artifacts = Array.isArray(args.artifacts) ? args.artifacts : [];

      const updatedDependency = await this.repo.updateDependency(dependencyId, dependee, dependency, artifacts);
      return { content: [{ type: 'text', text: JSON.stringify({ updatedDependency }) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Failed to update dependency: ${message}` }] };
    }
  }
}

export const instance = new WbsUpdateDependencyTool();
