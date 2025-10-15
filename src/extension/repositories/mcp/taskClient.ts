import { MCPBaseClient } from './baseClient';
import type { ArtifactReferenceInput, CompletionConditionInput } from './types';

/**
 * タスク関連のJSON-RPC呼び出しを集約するクラス。
 */
export class MCPTaskClient extends MCPBaseClient {
    /**
     * 指定されたparentId直下のタスク一覧を取得する。
     *
     * @param parentId 親タスクID。nullでルート配下
     * @returns タスクエンティティの配列
     */
    public async listTasks(parentId?: string | null): Promise<any[]> {
        const args = parentId !== undefined ? { parentId } : {};
        try {
            const result = await this.callTool('wbs.planMode.listTasks', args);
            const parsed = this.parseToolResponse(result);
            if (Array.isArray(parsed.parsed)) {
                return parsed.parsed;
            }
            if (parsed.error) {
                this.outputChannel.appendLine(`[MCP Client] Failed to parse task list: ${parsed.error}`);
            }
            return [];
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * タスクIDから詳細情報を取得する。
     *
     * @param taskId 取得対象のタスクID
     * @returns タスク詳細。取得できなければnull
     */
    public async getTask(taskId: string): Promise<any | null> {
        try {
            const result = await this.callTool('wbs.planMode.getTask', { taskId });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed && typeof parsed.parsed === 'object') {
                return parsed.parsed;
            }
            if (parsed.error) {
                this.outputChannel.appendLine(`[MCP Client] Failed to get task: ${parsed.error}`);
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`[MCP Client] Failed to get task: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * タスクを更新する。
     *
     * @param taskId 更新するタスクID
     * @param updates 更新内容
     * @returns 成功・競合・エラー情報
     */
    public async updateTask(taskId: string, updates: Record<string, unknown>): Promise<{ success: boolean; conflict?: boolean; error?: string; taskId?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.updateTask', { taskId, ...updates });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed) {
                const parsedId = typeof parsed.parsed === 'object' && parsed.parsed !== null ? parsed.parsed.id : undefined;
                const message = parsed.hintSummary || parsed.rawText;
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            if (parsed.error && parsed.error.includes('modified by another user')) {
                return { success: false, conflict: true, error: parsed.error, message: parsed.hintSummary || parsed.rawText };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * 新しいタスクを作成する。
     *
     * @param params 作成パラメータ
     * @param params.title タスクタイトル
     * @param params.description タスク説明
     * @param params.parentId 親タスクID
     * @param params.assignee 担当者名
     * @param params.estimate 見積り値
     * @param params.deliverables 成果物割当一覧
     * @param params.prerequisites 前提成果物割当一覧
     * @param params.completionConditions 完了条件一覧
     * @returns 作成結果と生成されたタスクID
     */
    public async createTask(params: {
        title?: string;
        description?: string;
        parentId?: string | null;
        assignee?: string | null;
        estimate?: string | null;
        deliverables?: ArtifactReferenceInput[];
        prerequisites?: ArtifactReferenceInput[];
        completionConditions?: CompletionConditionInput[];
    }): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.createTask', params);
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed) {
                const createdId = typeof parsed.parsed === 'object' ? parsed.parsed.id : undefined;
                const message = parsed.hintSummary || parsed.rawText;
                return { success: true, taskId: createdId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * タスクを削除する。
     *
     * @param taskId 削除するタスクID
     * @returns 削除結果
     */
    public async deleteTask(taskId: string): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.deleteTask', { taskId });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed) {
                const parsedId = typeof parsed.parsed === 'object' ? parsed.parsed.id : undefined;
                const message = parsed.hintSummary || parsed.rawText;
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * タスクの親を変更する。
     *
     * @param taskId 対象タスクID
     * @param newParentId 新しい親タスクID。ルートの場合はnull
     * @returns 移動結果
     */
    public async moveTask(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.moveTask', { taskId, newParentId: newParentId ?? null });
            const parsed = this.parseToolResponse(result);
            if (parsed.parsed) {
                const parsedId = typeof parsed.parsed === 'object' ? parsed.parsed.id : undefined;
                const message = parsed.hintSummary || parsed.rawText;
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: parsed.hintSummary || parsed.rawText };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
