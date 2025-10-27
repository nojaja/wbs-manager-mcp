import { Tool } from './Tool';
import { getDatabase } from '../db/connection';

interface RawTaskRow {
    id: string;
    parent_id: string | null;
    title: string;
    status: string | null;
    estimate: string | null;
    assignee: string | null;
    created_at: string;
    updated_at: string;
    depth: number;
}

interface RawDependencyRow {
    id: string;
    dependency_task_id: string;
    dependee_task_id: string;
    created_at: string;
}

type DurationParseResult = {
    durationHours: number;
    strategy: 'token' | 'iso8601' | 'numeric' | 'unknown' | 'absent';
};

type NormalizedArgs = {
    parentId: string | null;
    sinceRaw?: string;
};

const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;

/**
 * 指定した文字列をトークン形式 (例: 1d2h) として解析し、時間へ換算する。
 * @param trimmed トリム済みの見積り文字列
 * @returns 合計時間(時間) または null
 */
function parseTokenDuration(trimmed: string): number | null {
    const unitPattern = /(\d+(?:\.\d+)?)\s*([smhdw])/gi;
    let total = 0;
    let matched = false;
    let token: RegExpExecArray | null;
    while ((token = unitPattern.exec(trimmed)) !== null) {
        matched = true;
        const value = parseFloat(token[1]);
        const unit = token[2].toLowerCase();
        switch (unit) {
            case 's':
                total += value / 3600;
                break;
            case 'm':
                total += value / 60;
                break;
            case 'h':
                total += value;
                break;
            case 'd':
                total += value * HOURS_PER_DAY;
                break;
            case 'w':
                total += value * HOURS_PER_WEEK;
                break;
            default:
                return null;
        }
    }
    return matched ? Number(total.toFixed(2)) : null;
}

/**
 * ISO8601 期間表現を解析し、時間へ換算する。
 * @param trimmed 見積り文字列
 * @returns 合計時間(時間) または null
 */
function parseIsoDuration(trimmed: string): number | null {
    const iso = trimmed.match(/^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (!iso) return null;
    const weeks = iso[1] ? parseFloat(iso[1]) : 0;
    const days = iso[2] ? parseFloat(iso[2]) : 0;
    const hours = iso[3] ? parseFloat(iso[3]) : 0;
    const minutes = iso[4] ? parseFloat(iso[4]) : 0;
    const seconds = iso[5] ? parseFloat(iso[5]) : 0;
    const total = weeks * HOURS_PER_WEEK + days * HOURS_PER_DAY + hours + minutes / 60 + seconds / 3600;
    return Number(total.toFixed(2));
}

/**
 * 数値文字列を時間として解釈する。
 * @param trimmed 見積り文字列
 * @returns 時間 または null
 */
function parseNumericDuration(trimmed: string): number | null {
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) return null;
    return Number(numeric.toFixed(2));
}

/**
 * 見積り文字列を工数(時間)へ変換する。
 * サポート形式: "1w2d4h", "PT4H", "3.5", "90m" など。
 * 未知形式の場合は0時間として扱い、strategy=unknownを返す。
 * @param raw 見積り文字列
 * @returns 解析結果
 */
function parseEstimateToHours(raw: string | null | undefined): DurationParseResult {
    if (!raw || !raw.trim()) return { durationHours: 0, strategy: 'absent' };
    const trimmed = raw.trim();
    const token = parseTokenDuration(trimmed);
    if (token !== null) return { durationHours: token, strategy: 'token' };
    const iso = parseIsoDuration(trimmed);
    if (iso !== null) return { durationHours: iso, strategy: 'iso8601' };
    const numeric = parseNumericDuration(trimmed);
    if (numeric !== null) return { durationHours: numeric, strategy: 'numeric' };
    return { durationHours: 0, strategy: 'unknown' };
}

/**
 * タスクステータスを進捗率へ変換する。
 * @param status タスクステータス
 * @returns 0〜1の進捗率
 */
function statusToProgress(status: string | null | undefined): number {
    const normalized = (status ?? '').toLowerCase();
    switch (normalized) {
        case 'completed':
        case 'done':
            return 1;
        case 'in-progress':
        case 'in_progress':
            return 0.5;
        case 'blocked':
            return 0.25;
        case 'pending':
        case 'draft':
        default:
            return 0;
    }
}

/**
 * 親IDをマップキーに変換する。
 * @param parentId 親タスクID
 * @returns ルート判定用キー
 */
function keyForParent(parentId: string | null): string {
    return parentId ?? '__ROOT__';
}

/**
 * ユーザー入力を正規化する。
 * @param args ツール引数
 * @returns 正規化済みの引数
 */
function normalizeArgs(args: any): NormalizedArgs {
    if (!args) return { parentId: null };
    const parentId = typeof args.parentId === 'string' && args.parentId.trim().length > 0 ? args.parentId.trim() : null;
    const sinceRaw = typeof args.since === 'string' ? args.since : undefined;
    return { parentId, sinceRaw };
}

/**
 * since 文字列を解析し、失敗時はエラー値を返す。
 * @param sinceRaw ISO8601 文字列
 * @returns 解析結果
 */
function resolveSince(sinceRaw?: string): { sinceDate: Date | null; invalidValue?: string } {
    if (!sinceRaw) return { sinceDate: null };
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) return { sinceDate: null, invalidValue: sinceRaw };
    return { sinceDate: parsed };
}

/**
 * since 指定が不正な場合のレスポンスを生成する。
 * @param sinceRaw 不正な値
 * @returns ツールレスポンス
 */
function createInvalidSinceResponse(sinceRaw: string) {
    const llmHints = {
        nextActions: [{ action: 'wbs.planMode.getGantt', detail: 'since は ISO8601 形式で指定してください。例: 2025-01-01T00:00:00Z' }],
        notes: ['差分取得の指定値が不正です。']
    };
    return {
        content: [{ type: 'text', text: `❌ Invalid since timestamp: ${sinceRaw}` }],
        llmHints
    };
}

/**
 * 祖先の親子関係を取得し親参照マップを生成する。
 * @param db データベース接続
 * @param parentId 親タスクID
 * @returns 親参照マップ
 */
async function buildAncestorLookup(db: any, parentId: string | null): Promise<Map<string, string | null>> {
    const lookup = new Map<string, string | null>();
    if (!parentId) return lookup;
    let current: string | null = parentId;
    while (current) {
        const row = await db.get(`SELECT id, parent_id FROM tasks WHERE id = ?`, current) as { id: string; parent_id: string | null } | null;
        if (!row) throw new Error(`Parent task not found: ${parentId}`);
        lookup.set(row.id, row.parent_id ?? null);
        current = row.parent_id ?? null;
    }
    return lookup;
}

/**
 * 指定範囲のタスク行を取得する。
 * @param db データベース接続
 * @param parentId 親タスクID
 * @returns タスク行配列
 */
async function fetchDescendantRows(db: any, parentId: string | null): Promise<RawTaskRow[]> {
    if (parentId) {
        const rows = await db.all(
            `WITH RECURSIVE subtree AS (
                SELECT id, parent_id, title, status, estimate, assignee, created_at, updated_at, 0 AS depth
                FROM tasks
                WHERE id = ?
                UNION ALL
                SELECT t.id, t.parent_id, t.title, t.status, t.estimate, t.assignee, t.created_at, t.updated_at, subtree.depth + 1
                FROM tasks t
                INNER JOIN subtree ON t.parent_id = subtree.id
            )
            SELECT id, parent_id, title, status, estimate, assignee, created_at, updated_at, depth
            FROM subtree
            WHERE depth > 0`,
            parentId
        );
        return rows as RawTaskRow[];
    }
    const rows = await db.all(
        `WITH RECURSIVE roots AS (
            SELECT id, parent_id, title, status, estimate, assignee, created_at, updated_at, 0 AS depth
            FROM tasks
            WHERE parent_id IS NULL
            UNION ALL
            SELECT t.id, t.parent_id, t.title, t.status, t.estimate, t.assignee, t.created_at, t.updated_at, roots.depth + 1
            FROM tasks t
            INNER JOIN roots ON t.parent_id = roots.id
        )
        SELECT id, parent_id, title, status, estimate, assignee, created_at, updated_at, depth FROM roots`
    );
    return rows as RawTaskRow[];
}

/**
 * 親参照マップへ子孫タスクの情報を統合する。
 * @param lookup 親参照マップ
 * @param rows タスク行配列
 */
function mergeParentLookupWithDescendants(lookup: Map<string, string | null>, rows: RawTaskRow[]): void {
    for (const row of rows) lookup.set(row.id, row.parent_id ?? null);
}

/**
 * 兄弟順序インデックスを生成する。
 * @param rows タスク行配列
 * @returns タスクID毎の順序インデックス
 */
function buildOrderLookup(rows: RawTaskRow[]): Map<string, number> {
    const siblings = new Map<string, RawTaskRow[]>();
    for (const row of rows) {
        const key = keyForParent(row.parent_id);
        if (!siblings.has(key)) siblings.set(key, []);
        siblings.get(key)!.push(row);
    }
    const orderLookup = new Map<string, number>();
    for (const group of siblings.values()) {
        group.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
        group.forEach((task, index) => orderLookup.set(task.id, index));
    }
    return orderLookup;
}

/**
 * 差分指定に応じてタスクを抽出する。
 * @param rows 全タスク行
 * @param sinceDate 差分基準
 * @returns 抽出結果
 */
function filterRowsBySince(rows: RawTaskRow[], sinceDate: Date | null): { filteredRows: RawTaskRow[]; changedTaskIds: Set<string> } {
    if (!sinceDate) return { filteredRows: rows, changedTaskIds: new Set(rows.map(row => row.id)) };
    const sinceMillis = sinceDate.getTime();
    const filtered = rows.filter(row => {
        const updatedMillis = Date.parse(row.updated_at);
        return !Number.isNaN(updatedMillis) && updatedMillis > sinceMillis;
    });
    return { filteredRows: filtered, changedTaskIds: new Set(filtered.map(row => row.id)) };
}

/**
 * 親参照マップから WBS パスを解決する関数を生成する。
 * @param parentLookup 親参照マップ
 * @returns WBS パス解決関数
 */
function createPathResolver(parentLookup: Map<string, string | null>): (taskId: string) => string[] {
    const cache = new Map<string, string[]>();
    /**
     * 単一タスクの WBS パスを再帰的に算出する。
     * @param taskId 対象タスクID
     * @returns WBS パス配列
     */
    const resolve = (taskId: string): string[] => {
        if (cache.has(taskId)) return cache.get(taskId)!;
        const parent = parentLookup.get(taskId);
        if (!parent) {
            const path = [taskId];
            cache.set(taskId, path);
            return path;
        }
        const path = [...resolve(parent), taskId];
        cache.set(taskId, path);
        return path;
    };
    return resolve;
}

/**
 * タスクレスポンス配列を構築する。
 * @param rows タスク行
 * @param orderLookup 兄弟順序マップ
 * @param resolvePath WBS パス解決関数
 * @returns レスポンス用タスク配列と要対応タスクID
 */
function buildTasksPayload(
    rows: RawTaskRow[],
    orderLookup: Map<string, number>,
    resolvePath: (taskId: string) => string[]
): { tasks: Array<any>; unparsable: string[] } {
    const unparsable: string[] = [];
    const tasks = rows.map(row => {
        const estimateInfo = parseEstimateToHours(row.estimate);
        if (estimateInfo.strategy === 'unknown') unparsable.push(row.id);
        const metadata: Record<string, unknown> = {
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            depth: row.depth,
            estimateParseStrategy: estimateInfo.strategy
        };
        if (row.assignee) metadata.assignee = row.assignee;
        if (row.estimate) metadata.originalEstimate = row.estimate;
        return {
            id: row.id,
            label: row.title,
            estimate: {
                durationHours: estimateInfo.durationHours
            },
            progress: statusToProgress(row.status),
            status: row.status ?? 'unknown',
            lane: row.assignee ?? 'unassigned',
            wbsPath: resolvePath(row.id),
            orderIndex: orderLookup.get(row.id) ?? 0,
            metadata
        };
    });
    return { tasks, unparsable };
}

/**
 * スコープ内の依存関係レコードを取得する。
 * @param db データベース接続
 * @param descendantRows スコープ内タスク
 * @returns 依存レコード配列
 */
async function fetchDependencyRows(db: any, descendantRows: RawTaskRow[]): Promise<RawDependencyRow[]> {
    if (descendantRows.length === 0) return [];
    const ids = descendantRows.map(row => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(
        `SELECT id, dependency_task_id, dependee_task_id, created_at
         FROM dependencies
         WHERE dependency_task_id IN (${placeholders})
            OR dependee_task_id IN (${placeholders})`,
        ...ids,
        ...ids
    );
    return rows as RawDependencyRow[];
}

/**
 * 差分条件を考慮して依存情報を整形する。
 * @param dependencyRows 依存レコード
 * @param descendantRows スコープ内タスク
 * @param changedTaskIds 変更対象タスクID集合
 * @param sinceDate 差分基準
 * @returns Gantt 用依存情報
 */
function selectDependencies(
    dependencyRows: RawDependencyRow[],
    descendantRows: RawTaskRow[],
    changedTaskIds: Set<string>,
    sinceDate: Date | null
): Array<{ from: string; to: string; type: string; lagHours: number; metadata: Record<string, unknown> }> {
    const scopeIds = new Set(descendantRows.map(row => row.id));
    const sinceMillis = sinceDate ? sinceDate.getTime() : null;
    return dependencyRows
        .filter(row => scopeIds.has(row.dependency_task_id) && scopeIds.has(row.dependee_task_id))
        .filter(row => {
            if (!sinceMillis) return true;
            const createdMillis = Date.parse(row.created_at);
            if (!Number.isNaN(createdMillis) && createdMillis > sinceMillis) return true;
            return changedTaskIds.has(row.dependency_task_id) || changedTaskIds.has(row.dependee_task_id);
        })
        .map(row => ({
            from: row.dependency_task_id,
            to: row.dependee_task_id,
            type: 'FS',
            lagHours: 0,
            metadata: {
                dependencyId: row.id,
                createdAt: row.created_at
            }
        }));
}

/**
 * メタ情報オブジェクトを構築する。
 * @param parentId 親タスクID
 * @param generatedAt スナップショット時刻
 * @returns メタ情報
 */
function buildMetadata(parentId: string | null, generatedAt: string) {
    return {
        parentId,
        generatedAt,
        anchor: {
            start: generatedAt
        }
    };
}

/**
 * LLM 向けヒント情報を生成する。
 * @param sinceDate 差分基準日時
 * @param taskCount 応答タスク数
 * @param unparsable 未解析タスクID
 * @returns {{ nextActions: Array<{ action: string, detail: string }>, notes: string[] }} ヒント情報
 */
function buildLlmHints(
    sinceDate: Date | null,
    taskCount: number,
    unparsable: string[]
): {
    nextActions: Array<{ action: string; detail: string }>;
    notes: string[];
} {
    const notes: string[] = [];
    if (sinceDate) notes.push(`since=${sinceDate.toISOString()} 以降の差分を返却しました`);
    if (taskCount === 0) notes.push('該当するタスクが存在しませんでした。');
    if (unparsable.length > 0) notes.push(`未対応の見積り形式を持つタスク: ${unparsable.join(', ')}`);

    const nextActions = unparsable.length > 0
        ? [{ action: 'wbs.planMode.updateTask', detail: `タスク ${unparsable.join(', ')} の estimate を 4h や PT8H 形式に更新してください。` }]
        : [];

    return { nextActions, notes };
}
/**
 * WBS タスクの Gantt スナップショットを提供する MCP ツール。
 */
export default class WbsGetGanttTool extends Tool {
    /**
     * Gantt スナップショット取得ツールを初期化する。
     */
    constructor() {
        super({
            name: 'wbs.planMode.getGantt',
            title: 'Gantt Board Snapshot',
            description: 'Fetch tasks and dependency data for Gantt rendering within the specified WBS scope.',
            inputSchema: {
                type: 'object',
                properties: {
                    parentId: {
                        type: 'string',
                        description: 'Parent task ID that defines the scope. When omitted the entire WBS root is targeted.'
                    },
                    since: {
                        type: 'string',
                        format: 'date-time',
                        description: 'ISO8601 timestamp for incremental sync. Returns only elements changed after this moment.'
                    }
                }
            },
            outputSchema: {
                type: 'object',
                properties: {
                    metadata: {
                        type: 'object',
                        properties: {
                            parentId: { type: ['string', 'null'] },
                            generatedAt: { type: 'string', format: 'date-time' },
                            anchor: {
                                type: 'object',
                                properties: {
                                    start: { type: 'string', format: 'date-time' }
                                },
                                required: ['start']
                            }
                        },
                        required: ['parentId', 'generatedAt', 'anchor']
                    },
                    tasks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                estimate: {
                                    type: 'object',
                                    properties: {
                                        durationHours: { type: 'number' },
                                        effortPoints: { type: 'number' }
                                    },
                                    required: ['durationHours']
                                },
                                progress: { type: 'number' },
                                status: { type: 'string' },
                                lane: { type: 'string' },
                                wbsPath: {
                                    type: 'array',
                                    items: { type: 'string' }
                                },
                                orderIndex: { type: 'integer' },
                                metadata: { type: 'object' }
                            },
                            required: ['id', 'label', 'estimate', 'progress', 'status', 'wbsPath', 'orderIndex']
                        }
                    },
                    dependencies: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                from: { type: 'string' },
                                to: { type: 'string' },
                                type: { type: 'string' },
                                lagHours: { type: 'number' },
                                metadata: { type: 'object' }
                            },
                            required: ['from', 'to', 'type']
                        }
                    }
                },
                required: ['metadata', 'tasks', 'dependencies']
            }
        });
    }

    /**
     * Gantt 表示用のタスク/依存関係スナップショットを取得する。
     * @param args ツール引数
     * @returns MCP ツールレスポンス
     */
    async run(args: any) {
        const { parentId, sinceRaw } = normalizeArgs(args);
        const { sinceDate, invalidValue } = resolveSince(sinceRaw);
        if (invalidValue) return createInvalidSinceResponse(invalidValue);

        try {
            const db = await getDatabase();
            const parentLookup = await buildAncestorLookup(db, parentId);
            const descendantRows = await fetchDescendantRows(db, parentId);
            mergeParentLookupWithDescendants(parentLookup, descendantRows);

            const orderLookup = buildOrderLookup(descendantRows);
            const { filteredRows, changedTaskIds } = filterRowsBySince(descendantRows, sinceDate);
            const resolvePath = createPathResolver(parentLookup);
            const { tasks, unparsable } = buildTasksPayload(filteredRows, orderLookup, resolvePath);

            const dependencyRows = await fetchDependencyRows(db, descendantRows);
            const dependencies = selectDependencies(dependencyRows, descendantRows, changedTaskIds, sinceDate);

            const generatedAt = new Date().toISOString();
            const metadata = buildMetadata(parentId ?? null, generatedAt);
            const llmHints = buildLlmHints(sinceDate, tasks.length, unparsable);

            const payload = {
                metadata,
                tasks,
                dependencies
            };

            return {
                content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
                llmHints
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const llmHints = {
                nextActions: [{ action: 'wbs.planMode.getGantt', detail: '入力パラメータを見直し、再実行してください。' }],
                notes: [`例外: ${message}`]
            };
            return {
                content: [{ type: 'text', text: `❌ Failed to get gantt snapshot: ${message}` }],
                llmHints
            };
        }
    }
}

export const instance = new WbsGetGanttTool();
