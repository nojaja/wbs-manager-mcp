import { MCPBaseClient } from './baseClient';
import type { ArtifactReferenceInput, CompletionConditionInput } from './types';


/**
 * タスク関連のJSON-RPC呼び出しを集約するクラス。
 */
export class MCPTaskClient extends MCPBaseClient {
    /**
     * 処理名: parsed から ID を抽出するユーティリティ
     * 処理概要: JSON-RPC レスポンスのパース結果（parsed）から既知のフィールド名を優先順に調べ、タスクの ID を返す。
     * 実装理由: ツールのレスポンスフォーマットはバージョンやコマンドごとに差異があり、戻り値の形が異なるため、共通処理で安全に id を取り出す必要がある。
     *
     * @param parsed parseToolResponse の戻り値オブジェクト。内部に parsed プロパティを持つ想定
     * @param _candidates 優先的に確認するフィールド名の候補（未使用、将来拡張用）
     * @returns タスク ID（見つからなければ undefined）
     */
    private extractIdFromParsed(parsed: any, _candidates?: string[][]): string | undefined {
        // 入力チェック: parsed が期待する形かを先に検証する
        if (!parsed || typeof parsed !== 'object') return undefined;
        const body = parsed.parsed as any;
        if (!body || typeof body !== 'object') return undefined;
        // 処理概要: optional chaining と論理演算子で簡潔に取得する（分岐を減らして複雑度を低減）
        const id = (body && ((body.updatedTask && body.updatedTask.id) || (body.task && body.task.id) || (body.createdTask && body.createdTask.id) || (body.deletedTask && body.deletedTask.id) || body.id));
        return id ?? undefined;
    }

    /**
     * 処理名: parsed からタスクオブジェクトを取り出す
     * 処理概要: parsed の中身を調べ、task フィールドやタスクライクなオブジェクトを返す。
     * 実装理由: getTask 内の分岐を外出しすることで関数の複雑度を下げる。
     *
     * @param parsed parseToolResponse の戻り値
     * @returns タスクオブジェクト（見つからなければ undefined）
     */
    private getTaskFromParsed(parsed: any): any | undefined {
        if (!parsed || typeof parsed !== 'object') return undefined;
        const body = parsed.parsed as any;
        if (!body || typeof body !== 'object') return undefined;
        if (body.task && typeof body.task === 'object') return body.task;
        if (this.isTaskLike(body)) return body;
        return undefined;
    }

    /**
     * 処理名: オブジェクトがタスクっぽいかを判定する
     * 処理概要: オブジェクトに id/title/status のいずれかがあればタスクオブジェクトとみなす。
     * 実装理由: getTask の中で複数条件を直接評価するのではなく、この小さな関数に切り出すことで可読性と複雑度を下げるため。
     *
     * @param obj 判定対象のオブジェクト
     * @returns タスクっぽければ true
     */
    private isTaskLike(obj: any): boolean {
        return !!(obj && typeof obj === 'object' && (obj.id || obj.title || obj.status));
    }

    /**
     * 処理名: parsed から表示メッセージを組み立てる
     * 処理概要: parseToolResponse の戻り値からユーザー向けの概要メッセージ(hintSummary など)を抽出する。
     * 実装理由: ツールのヒントや生テキストのどちらかを優先して表示するための共通処理として必要。
     *
     * @param parsed parseToolResponse の戻り値オブジェクト
     * @returns メッセージ文字列（無ければ undefined）
     */
    private buildMessageFromParsed(parsed: any): string | undefined {
        // 入力チェック: parsed が期待形でなければ undefined を返す
        if (!parsed || typeof parsed !== 'object') return undefined;
        // 処理概要: hintSummary を第一候補、なければ rawText を返す
        return parsed.hintSummary || parsed.rawText;
    }

    /**
     * 処理名: タスク一覧取得
     * 処理概要: 指定された parentId 直下のタスク一覧を MCP ツールに問い合わせて取得する。
     * 実装理由: UI でタスクツリーを表示・更新するために必要な一覧取得処理。
     *
     * @param parentId 親タスクID。nullでルート配下
     * @returns タスクエンティティの配列
     */
    public async listTasks(parentId?: string | null): Promise<any[]> {
        const args = parentId !== undefined ? { parentId } : {};
        try {
            // ツール呼び出し: listTasks を実行し、parseToolResponse で標準形に変換
            const result = await this.callTool('wbs.planMode.listTasks', args);
            const parsed = this.parseToolResponse(result);
            // 処理概要: 解析済オブジェクトから tasks 配列を返す。理由: ツール返却形が異なることがあるため parseToolResponse を通す。
            if (Array.isArray(parsed.parsed?.tasks)) {
                return parsed.parsed.tasks;
            }
            if (parsed.error) {
                this.outputChannel.log(`[MCP Client] Failed to list tasks: ${parsed.error}`);
            }
            return [];
        } catch (error) {
            this.outputChannel.log(`[MCP Client] Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }


    /**
     * 処理名: タスク詳細取得
     * 処理概要: 指定した taskId の詳細をツールに問い合わせ、いくつかの出力フォーマットに対応してタスクオブジェクトを返す。
     * 実装理由: ツールのバージョンやコマンドにより戻り値の構造が異なるため、互換性を保つための変換処理が必要。
     *
     * @param taskId 取得対象のタスクID
     * @returns タスク詳細。取得できなければnull
     */
    public async getTask(taskId: string): Promise<any | null> {
        try {
            const result = await this.callTool('wbs.planMode.getTask', { taskId });
            const parsed = this.parseToolResponse(result);
            // Newer tool shape: { task: { ... } }
            // Older/alternate shape: parsed.parsed is the task object itself
            // 処理概要: getTaskFromParsed に判定を委譲して可読性と複雑度を低く保つ
            const maybeTask = this.getTaskFromParsed(parsed);
            if (maybeTask) return maybeTask;
            if (parsed.error) {
                this.outputChannel.log(`[MCP Client] Failed to get task: ${parsed.error}`);
            }
            return null;
        } catch (error) {
            this.outputChannel.log(`[MCP Client] Failed to get task: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * 処理名: タスク更新
     * 処理概要: 指定した taskId に対して更新を試み、成功時は更新後の ID を返す。競合やエラー情報も含めて返却する。
     * 実装理由: サーバ側での競合検出や、ツールごとの応答差異を吸収して呼び出し元に統一的な結果を返すため。
     *
     * @param taskId 更新するタスクID
     * @param updates 更新内容
     * @returns 成功・競合・エラー情報
     */
    public async updateTask(taskId: string, updates: Record<string, unknown>): Promise<{ success: boolean; conflict?: boolean; error?: string; taskId?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.updateTask', { taskId, ...updates });
            const parsed = this.parseToolResponse(result);
            // 処理概要: parsed.parsed が存在する場合、共通ユーティリティで ID とメッセージを抽出して返す
            if (parsed.parsed) {
                const parsedId = this.extractIdFromParsed(parsed, [['updatedTask', 'id'], ['task', 'id'], ['id']]);
                const message = this.buildMessageFromParsed(parsed);
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            if (parsed.error && parsed.error.includes('modified by another user')) {
                return { success: false, conflict: true, error: parsed.error, message: parsed.hintSummary || parsed.rawText };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: this.buildMessageFromParsed(parsed) };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * 処理名: タスク作成
     * 処理概要: 指定されたパラメータでタスクを作成し、生成されたタスク ID を返す。
     * 実装理由: ユーザーが新しいタスクを追加するためのエントリポイントであり、ツールの返却形式の差を吸収するために共通処理が必要。
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
                // 処理概要: 作成結果から ID を共通ユーティリティで抽出
                const createdId = this.extractIdFromParsed(parsed, [['task', 'id'], ['createdTask', 'id'], ['id']]);
                const message = this.buildMessageFromParsed(parsed);
                return { success: true, taskId: createdId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: this.buildMessageFromParsed(parsed) };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }

    /**
     * 処理名: タスク削除
     * 処理概要: 指定タスクを削除し、削除結果を返す。
     * 実装理由: 削除コマンドの戻り値の形式差異を吸収し、削除された ID を呼び出し元に返すため。
     *
     * @param taskId 削除するタスクID
     * @returns 削除結果
     */
    public async deleteTask(taskId: string): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }> {
        try {
            const result = await this.callTool('wbs.planMode.deleteTask', { taskId });
            const parsed = this.parseToolResponse(result);
            // parsed.parsed may be { deletedTask: { id: ... } } or { id: ... } or true
            if (parsed.parsed) {
                // 処理概要: 削除結果から ID を抽出
                const parsedId = this.extractIdFromParsed(parsed, [['deletedTask', 'id'], ['id']]);
                const message = this.buildMessageFromParsed(parsed);
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: this.buildMessageFromParsed(parsed) };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * 処理名: タスクの親変更（移動）
     * 処理概要: 指定タスクを新しい親の下に移動する。
     * 実装理由: 移動処理の成功/失敗を統一的に扱い、ツール出力の差を吸収するため。
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
                const parsedId = this.extractIdFromParsed(parsed, [['updatedTask', 'id'], ['task', 'id'], ['id']]);
                const message = this.buildMessageFromParsed(parsed);
                return { success: true, taskId: parsedId ?? taskId, message };
            }
            return { success: false, error: parsed.error ?? 'Unknown error', message: this.buildMessageFromParsed(parsed) };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
