import { MCPTaskClient } from './taskClient';
import type { Artifact } from './types';

/**
 * 成果物関連のJSON-RPC呼び出しを集約するクラス。
 */
export class MCPArtifactClient extends MCPTaskClient {
    /**
     * 成果物一覧を取得する。
     *
     * @returns 成果物情報の配列
     */
    public async listArtifacts(): Promise<Artifact[]> {
        try {
            const result = await this.callTool('wbs.planMode.listArtifacts', {});
            const content = (result as any)?.content?.[0]?.text;
            if (content) {
                return JSON.parse(content) as Artifact[];
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list artifacts: ${error instanceof Error ? error.message : String(error)}`);
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
    }): Promise<{ success: boolean; artifact?: Artifact; error?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.createArtifact', {
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null
            });
            const content = (result as any)?.content?.[0]?.text ?? '';
            if (content.includes('❌')) {
                return { success: false, error: content };
            }
            const artifact = JSON.parse(content) as Artifact;
            return { success: true, artifact };
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
    }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.updateArtifact', {
                artifactId: params.artifactId,
                title: params.title,
                uri: params.uri ?? null,
                description: params.description ?? null,
                ifVersion: params.version
            });
            const content = (result as any)?.content?.[0]?.text ?? '';
            if (content.includes('modified by another user')) {
                return { success: false, conflict: true, error: content };
            }
            if (content.includes('❌')) {
                return { success: false, error: content };
            }
            const artifact = JSON.parse(content) as Artifact;
            return { success: true, artifact };
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
            const content = (result as any)?.content?.[0]?.text;
            if (content && !content.includes('❌')) {
                return JSON.parse(content) as Artifact;
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to get artifact: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * 成果物を削除する。
     *
     * @param artifactId 削除対象の成果物ID
     * @returns 削除結果
     */
    public async deleteArtifact(artifactId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.deleteArtifact', { artifactId });
            const content = (result as any)?.content?.[0]?.text ?? '';
            if (content.includes('✅')) {
                return { success: true };
            }
            return { success: false, error: content || 'Unknown error' };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
