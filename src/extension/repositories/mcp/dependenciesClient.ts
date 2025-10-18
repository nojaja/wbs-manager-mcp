import { MCPBaseClient } from './baseClient';

/**
 * 処理名: MCPDependenciesClient
 * 処理概要: 依存関係作成・更新・削除の JSON-RPC 呼び出しを集約するクライアント
 * 実装理由: extension 側からサーバの依存管理ツールを呼び出すための専用クラスを提供し、呼び出しロジックを一元化するため
 */
export class MCPDependenciesClient extends MCPBaseClient {
  /**
  * 依存関係を作成する
  * @param params 依存関係作成パラメータ
  * @param params.dependee 依存先タスクID
  * @param params.dependency 依存元タスクID
  * @param params.artifacts 成果物ID配列（省略可）
  * @returns 作成された依存関係のオブジェクトを含む結果オブジェクト
   */
  public async createDependency(params: { dependee: string; dependency: string; artifacts?: string[] }) {
    try {
      const result = await this.callTool('wbs.planmode.createDependency', params);
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) return { success: true, payload: parsed.parsed };
      return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 依存関係を更新する
   * @param params 更新パラメータ
   * @param params.dependencyId 更新対象の依存関係ID
   * @param params.dependee 依存先タスクID
   * @param params.dependency 依存元タスクID
   * @param params.artifacts 成果物ID配列（省略可）
   * @returns 更新された依存関係オブジェクトを含む結果オブジェクト
   */
  public async updateDependency(params: { dependencyId: string; dependee: string; dependency: string; artifacts?: string[] }) {
    try {
      const result = await this.callTool('wbs.planmode.updateDependency', params);
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) return { success: true, payload: parsed.parsed };
      return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 依存関係を削除する
   * @param params 削除パラメータ
   * @param params.dependencyId 削除対象の依存関係ID
   * @returns 削除の成否を示す結果オブジェクト
   */
  public async deleteDependency(params: { dependencyId: string }) {
    try {
      const result = await this.callTool('wbs.planmode.deleteDependency', params);
      const parsed = this.parseToolResponse(result);
      if (parsed.parsed) return { success: true, payload: parsed.parsed };
      return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
