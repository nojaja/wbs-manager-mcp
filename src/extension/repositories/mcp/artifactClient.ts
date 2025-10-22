import { MCPBaseClient } from './baseClient';
import type { Artifact } from './types';

/**
 * 成果物関連のJSON-RPC呼び出しを集約するクラス。
 */
export class MCPArtifactClient extends MCPBaseClient {
    /**
     * 成果物一覧を取得する。
     *
     * @returns 成果物情報の配列
     */
    public async listArtifacts(): Promise<Artifact[]> {
        try {
            const result = await this.callTool('wbs.planMode.listArtifacts', {});
            const parsed = this.parseToolResponse(result);
            if (Array.isArray(parsed.parsed)) {
                return parsed.parsed as Artifact[];
            }
            if (parsed.error) {
                this.outputChannel.log(`[MCP Client] Failed to list artifacts: ${parsed.error}`);
            }
            return [];
        } catch (error) {
            this.outputChannel.log(`[MCP Client] Failed to list artifacts: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * 成果物を新規作成する。
     *
     * @param params 作成パラメータ
     * @param params.title 成果物タイトル
     * @param params.uri 関連URI（任意）
     * @param params.description 説明文（任意）
     * @returns 作成結果と生成された成果物
     */
    public async createArtifact(params: {
        title: string;
        uri?: string | null;
        description?: string | null;
    }): Promise<{ success: boolean; artifact?: Artifact; error?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.createArtifact', {
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null
            });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed && typeof parsed.parsed === 'object') {
                return { success: true, artifact: parsed.parsed as Artifact, message: parsed.hintSummary || parsed.rawText };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * 成果物を更新する。
     *
     * @param params 更新パラメータ
     * @param params.artifactId 更新対象の成果物ID
     * @param params.title 成果物タイトル
     * @param params.uri 関連URI
     * @param params.description 説明文
     * @param params.version 競合チェック用バージョン
     * @returns 更新結果と最新成果物
     */
    public async updateArtifact(params: {
        artifactId: string;
        title?: string;
        uri?: string | null;
        description?: string | null;
        version?: number;
    }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.updateArtifact', {
                artifactId: params.artifactId,
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null,
                ifVersion: params.version
            });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed && typeof parsed.parsed === 'object') {
                return { success: true, artifact: parsed.parsed as Artifact, message: parsed.hintSummary || parsed.rawText };
            }
            if (parsed.error && parsed.error.includes('modified by another user')) {
                return { success: false, conflict: true, error: parsed.error, message: parsed.hintSummary || parsed.rawText };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * 成果物詳細を取得する。
     * 指定IDの成果物を取得する
     * @param artifactId 取得対象の成果物ID
     * @returns 成果物詳細。取得できなければnull
     */
    public async getArtifact(artifactId: string): Promise<Artifact | null> {
        try {
            const result = await this.callTool('wbs.planMode.getArtifact', { artifactId });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed && typeof parsed.parsed === 'object') {
                return parsed.parsed as Artifact;
            }
            if (parsed.error) {
                this.outputChannel.log(`[MCP Client] Failed to get artifact: ${parsed.error}`);
            }
            return null;
        } catch (error) {
            this.outputChannel.log(`[MCP Client] Failed to get artifact: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * 成果物を削除する。
     *
     * @param artifactId 削除対象の成果物ID
     * @returns 削除結果
     */
    public async deleteArtifact(artifactId: string): Promise<{ success: boolean; error?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.deleteArtifact', { artifactId });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed) {
                return { success: true, message: parsed.hintSummary || parsed.rawText };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
