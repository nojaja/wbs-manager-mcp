import { MCPBaseClient } from './baseClient';

/**
 * 処理名: MCPDependenciesClient
 * 処理概要: 依存関係作成・更新・削除の JSON-RPC 呼び出しを集約するクライアント
 * 実装理由: extension 側からサーバの依存管理ツールを呼び出すための専用クラスを提供し、呼び出しロジックを一元化するため
 */
export class MCPDependenciesClient extends MCPBaseClient {
  /**
   * 依存関係を作成する
   * @param params { dependee, dependency, artifacts }
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
