import { MCPBaseClient } from './baseClient';
import type { GanttSnapshot, GanttDependencyItem, GanttTaskItem, GanttMetadata } from '../../types';

interface GanttRequestParams {
    parentId?: string | null;
    since?: string;
}

/**
 * Gantt 関連の JSON-RPC 呼び出しをまとめるクライアント。
 * wbs.planMode.getGantt をラップし、応答の揺れを吸収して共通のスナップショット構造を返します。
 */
export class MCPGanttClient extends MCPBaseClient {
    /**
     * ガントスナップショットを取得する。
     * @param params 取得パラメータ
     * @returns 正常時はスナップショット、失敗時は null
     */
    public async getGanttSnapshot(params?: GanttRequestParams): Promise<GanttSnapshot | null> {
        const args = this.buildArguments(params);
        try {
            const result = await this.callTool('wbs.planMode.getGantt', args);
            const direct = this.tryExtractSnapshot(result);
            if (direct) {
                return direct;
            }

            const parsed = this.parseToolResponse(result);
            const snapshot = this.tryExtractSnapshot(parsed.parsed ?? parsed);
            if (snapshot) {
                return snapshot;
            }

            if (parsed.error) {
                this.outputChannel.log(`[MCP Client] Failed to get gantt snapshot: ${parsed.error}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.outputChannel.log(`[MCP Client] Failed to get gantt snapshot: ${message}`);
        }
        return null;
    }


    /**
     * ツール呼び出しパラメータを組み立てる。
     * @param params クライアント呼び出し時に受け取ったオプション
     * @returns JSON-RPC の arguments に渡すオブジェクト（空の場合は undefined）
     */
    private buildArguments(params?: GanttRequestParams): Record<string, unknown> | undefined {
        if (!params) {
            return undefined;
        }
        const payload: Record<string, unknown> = {};
        if (params.parentId !== undefined) {
            payload.parentId = params.parentId ?? null;
        }
        if (params.since) {
            payload.since = params.since;
        }
        return Object.keys(payload).length > 0 ? payload : undefined;
    }

    /**
     * 任意構造のレスポンスからガントスナップショットを抽出する。
     * ツールのバージョンによっては result や data などのラッパーが追加されるため段階的に展開する。
     */
    /**
     * さまざまなレスポンス形式からスナップショットを抽出する。
     * @param payload ツールレスポンス本体
     * @returns 正常なスナップショット、無ければ null
     */
    private tryExtractSnapshot(payload: unknown): GanttSnapshot | null {
        const candidate = this.unwrapSnapshotCandidate(payload);
        if (!candidate) {
            return null;
        }
        if (this.isSnapshot(candidate)) {
            return this.normalizeSnapshot(candidate);
        }
        return null;
    }

    /**
     * レスポンスの各層を辿って snapshot らしきオブジェクトを探す。
     */
    /**
     * 候補オブジェクトを探索し、スナップショット構造に到達するまで再帰的に展開する。
     * @param payload ツールレスポンスの一部
     * @returns スナップショットらしきオブジェクトまたは null
     */
    private unwrapSnapshotCandidate(payload: unknown): unknown {
        if (!payload) {
            return null;
        }
        if (typeof payload === 'string') {
            return this.unwrapFromString(payload);
        }
        if (Array.isArray(payload)) {
            return this.unwrapFromArray(payload);
        }
        if (typeof payload === 'object') {
            return this.unwrapFromObject(payload as Record<string, unknown>);
        }
        return null;
    }

    /**
     * 文字列レスポンスを解析して再帰的に探索する。
     * @param payload JSON 文字列の可能性があるレスポンス
     * @returns 内部に含まれる候補
     */
    private unwrapFromString(payload: string): unknown {
        try {
            const parsed = JSON.parse(payload);
            return this.unwrapSnapshotCandidate(parsed);
        } catch {
            return null;
        }
    }

    /**
     * 配列レスポンスを走査してスナップショット候補を探す。
     * @param payload 任意の配列
     * @returns 最初に見つかった候補
     */
    private unwrapFromArray(payload: unknown[]): unknown {
        for (const item of payload) {
            const extracted = this.unwrapSnapshotCandidate(item);
            if (extracted) {
                return extracted;
            }
        }
        return null;
    }

    /**
     * オブジェクトレスポンスからスナップショット候補を抜き出す。
     * @param obj 任意のオブジェクト
     * @returns オブジェクト自体または入れ子の候補
     */
    private unwrapFromObject(obj: Record<string, unknown>): unknown {
        if (this.looksLikeSnapshot(obj)) {
            return obj;
        }
        const nestedKeys = ['snapshot', 'result', 'data', 'payload', 'content'];
        for (const key of nestedKeys) {
            if (key in obj) {
                const nested = this.unwrapSnapshotCandidate(obj[key]);
                if (nested) {
                    return nested;
                }
            }
        }
        return null;
    }

    /**
     * オブジェクトがスナップショット構造に見えるか判定する。
     * @param obj 判定対象
     * @returns スナップショットとして有効か
     */
    private looksLikeSnapshot(obj: Record<string, unknown>): boolean {
        return typeof obj === 'object'
            && obj !== null
            && 'metadata' in obj
            && 'tasks' in obj
            && 'dependencies' in obj;
    }

    /**
     * オブジェクトを厳密なスナップショット型に絞り込む。
     * @param obj 判定対象
     * @returns GanttSnapshot として扱えるか
     */
    private isSnapshot(obj: any): obj is GanttSnapshot {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        const { metadata, tasks, dependencies } = obj as GanttSnapshot;
        const hasMetadata = metadata && typeof metadata === 'object' && typeof metadata.generatedAt === 'string' && metadata.anchor && typeof metadata.anchor.start === 'string';
        const hasTasks = Array.isArray(tasks);
        const hasDependencies = Array.isArray(dependencies);
        return Boolean(hasMetadata && hasTasks && hasDependencies);
    }

    /**
     * スナップショットのプロパティを補正して欠損値にデフォルトを設定する。
     * @param snapshot 取得したスナップショット
     * @returns 正規化済みスナップショット
     */
    private normalizeSnapshot(snapshot: GanttSnapshot): GanttSnapshot {
        const metadata: GanttMetadata = {
            parentId: snapshot.metadata?.parentId ?? null,
            generatedAt: snapshot.metadata?.generatedAt ?? new Date().toISOString(),
            anchor: {
                start: snapshot.metadata?.anchor?.start ?? new Date().toISOString()
            }
        };

        const tasks: GanttTaskItem[] = Array.isArray(snapshot.tasks)
            ? snapshot.tasks.map(task => ({
                ...task,
                lane: task.lane,
                metadata: task.metadata ?? undefined,
                progress: this.clampProgress(task.progress)
            }))
            : [];

        const dependencies: GanttDependencyItem[] = Array.isArray(snapshot.dependencies)
            ? snapshot.dependencies.map(dep => ({
                ...dep,
                lagHours: typeof dep.lagHours === 'number' ? dep.lagHours : undefined,
                metadata: dep.metadata ?? undefined
            }))
            : [];

        return {
            metadata,
            tasks,
            dependencies
        };
    }

    /**
     * 進捗率を 0-1 の範囲に丸める。
     * @param progress レスポンス値
     * @returns 補正済みの進捗率
     */
    private clampProgress(progress: number | undefined): number {
        if (typeof progress !== 'number' || Number.isNaN(progress)) {
            return 0;
        }
        if (progress < 0) {
            return 0;
        }
        if (progress > 1) {
            return 1;
        }
        return progress;
    }
}
