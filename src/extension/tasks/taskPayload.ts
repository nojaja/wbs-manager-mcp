export type ArtifactReferenceInput = { artifactId: string; crudOperations?: string | null };

/**
 * 文字列キー群を順に評価し、トリム済み文字列を返します。
 * @param source 参照元オブジェクト
 * @param keys 判定対象キー一覧
 * @returns トリム済み文字列または undefined
 */
function pickTrimmedString(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return undefined;
}

/**
 * 成果物参照オブジェクトから artifactId を抽出します。
 * @param source 参照元オブジェクト
 * @returns 抽出したID。取得できない場合は null
 */
function extractArtifactId(source: Record<string, unknown>): string | null {
    const direct = pickTrimmedString(source, ['artifactId', 'artifact_id']);
    if (direct) {
        return direct;
    }

    const nestedSource = (source as Record<string, unknown>)['artifact'];
    const nested = typeof nestedSource === 'object' && nestedSource !== null
        ? pickTrimmedString(nestedSource as Record<string, unknown>, ['id'])
        : undefined;

    return nested ?? null;
}

/**
 * 成果物参照オブジェクトから CRUD 操作文字列を抽出します。
 * @param source 参照元オブジェクト
 * @returns トリム済みCRUD文字列。無ければ null
 */
function extractCrudOperations(source: Record<string, unknown>): string | null {
    const crud = pickTrimmedString(source, ['crudOperations', 'crud_operations', 'crud']);
    return crud ?? null;
}
export type CompletionConditionInput = { description: string };

export interface CreateTaskParams {
    title?: string;
    description?: string;
    parentId?: string | null;
    assignee?: string | null;
    estimate?: string | null;
    artifacts?: ArtifactReferenceInput[];
    completionConditions?: CompletionConditionInput[];
}

export interface UpdateTaskParams extends Partial<CreateTaskParams> {
    taskId?: string;
    [key: string]: unknown;
}

export interface CreateTaskPayload {
    title: string;
    description: string;
    parentId: string | null;
    assignee: string | null;
    estimate: string | null;
    artifacts?: ArtifactReferenceInput[];
    completionConditions?: CompletionConditionInput[];
}

export interface UpdateTaskPayload {
    [key: string]: unknown;
    artifacts?: ArtifactReferenceInput[];
    completionConditions?: CompletionConditionInput[];
}

/**
 * 単一のArtifact参照入力を正規化します。
 * - undefined や不正な artifactId は null を返す
 * - artifactId をトリムし空文字でなければ返却
 * - crudOperations が文字列かつ空でなければトリムして含める
 * @param input 入力オブジェクト (artifactId, crudOperations)
 * @returns 正規化されたオブジェクトまたは null
 */
function normalizeArtifactInput(input: ArtifactReferenceInput | Record<string, unknown> | undefined) {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const artifactId = extractArtifactId(input);
    if (!artifactId) {
        return null;
    }

    const crudOperations = extractCrudOperations(input);
    if (crudOperations) {
        return { artifactId, crudOperations } as const;
    }

    return { artifactId } as const;
}

/**
 * Artifact参照配列をサニタイズして有効な参照のみを返します。
 * @param inputs 入力配列 (nullable)
 * @returns サニタイズ済み配列または undefined (入力が配列でない場合)
 */
export function sanitizeArtifactReferences(inputs?: (ArtifactReferenceInput | Record<string, any>)[]) {
    if (!Array.isArray(inputs)) {
        return undefined;
    }

    const normalized: ArtifactReferenceInput[] = [];
    for (const input of inputs) {
        const sanitized = normalizeArtifactInput(input);
        if (sanitized) {
            normalized.push(sanitized);
        }
    }
    return normalized;
}

/**
 * 完了条件配列をサニタイズして description が空でない要素のみ返す
 * @param inputs 入力配列 (nullable)
 * @returns サニタイズ済み配列または undefined (入力が配列でない場合)
 */
export function sanitizeCompletionConditions(inputs?: CompletionConditionInput[]) {
    if (!Array.isArray(inputs)) {
        return undefined;
    }

    const normalized: CompletionConditionInput[] = [];
    for (const input of inputs) {
        const description = typeof input?.description === 'string' ? input.description.trim() : '';
        if (description.length > 0) {
            normalized.push({ description });
        }
    }
    return normalized;
}

/**
 * タスク作成用ペイロードを構築します。
 * - 各フィールドはデフォルト値で補完され、参照配列はサニタイズされます。
 * @param params CreateTaskParams 入力パラメータ
 * @returns CreateTaskPayload (サーバ送信用の完全なオブジェクト)
 */
export function buildCreateTaskPayload(params: CreateTaskParams): CreateTaskPayload {
    const artifacts = sanitizeArtifactReferences(params.artifacts);
    const completionConditions = sanitizeCompletionConditions(params.completionConditions);

    const payload: CreateTaskPayload = {
        title: params.title ?? 'New Task',
        description: params.description ?? '',
        parentId: params.parentId ?? null,
        assignee: params.assignee ?? null,
        estimate: params.estimate ?? null
    };

    if (artifacts !== undefined) {
        payload.artifacts = artifacts;
    }
    
    if (completionConditions !== undefined) {
        payload.completionConditions = completionConditions;
    }

    return payload;
}

/**
 * タスク更新用ペイロードを構築します。
 * - updates の中から taskId を除去し、参照配列・完了条件はサニタイズして設定します。
 * - undefined の配列フィールドは削除されます。
 * @param updates UpdateTaskParams 更新パラメータ
 * @returns UpdateTaskPayload サーバ送信用の差分オブジェクト
 */
export function buildUpdateTaskPayload(updates: UpdateTaskParams): UpdateTaskPayload {
    const artifacts = sanitizeArtifactReferences(updates.artifacts);
    const completionConditions = sanitizeCompletionConditions(updates.completionConditions);

    const normalized: UpdateTaskPayload = { ...updates };
    delete normalized.taskId;

    if (artifacts !== undefined) {
        normalized.artifacts = artifacts;
    } else {
        delete normalized.artifacts;
    }

    if (completionConditions !== undefined) {
        normalized.completionConditions = completionConditions;
    } else {
        delete normalized.completionConditions;
    }

    return normalized;
}
