export type ArtifactReferenceInput = { artifactId: string; crudOperations?: string | null };
export type CompletionConditionInput = { description: string };

export interface CreateTaskParams {
  title?: string;
  description?: string;
  parentId?: string | null;
  assignee?: string | null;
  estimate?: string | null;
  deliverables?: ArtifactReferenceInput[];
  prerequisites?: ArtifactReferenceInput[];
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
  deliverables?: ArtifactReferenceInput[];
  prerequisites?: ArtifactReferenceInput[];
  completionConditions?: CompletionConditionInput[];
}

export interface UpdateTaskPayload {
  [key: string]: unknown;
  deliverables?: ArtifactReferenceInput[];
  prerequisites?: ArtifactReferenceInput[];
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
function normalizeArtifactInput(input: ArtifactReferenceInput | undefined) {
  if (!input || typeof input.artifactId !== 'string') {
    return null;
  }

  const artifactId = input.artifactId.trim();
  if (artifactId.length === 0) {
    return null;
  }

  if (typeof input.crudOperations === 'string') {
    const crud = input.crudOperations.trim();
    if (crud.length > 0) {
      return { artifactId, crudOperations: crud } as const;
    }
  }

  return { artifactId } as const;
}

/**
 * Artifact参照配列をサニタイズして有効な参照のみを返します。
 * @param inputs 入力配列 (nullable)
 * @returns サニタイズ済み配列または undefined (入力が配列でない場合)
 */
export function sanitizeArtifactReferences(inputs?: ArtifactReferenceInput[]) {
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
  const deliverables = sanitizeArtifactReferences(params.deliverables);
  const prerequisites = sanitizeArtifactReferences(params.prerequisites);
  const completionConditions = sanitizeCompletionConditions(params.completionConditions);

  const payload: CreateTaskPayload = {
    title: params.title ?? 'New Task',
    description: params.description ?? '',
    parentId: params.parentId ?? null,
    assignee: params.assignee ?? null,
    estimate: params.estimate ?? null
  };

  if (deliverables !== undefined) {
    payload.deliverables = deliverables;
  }
  if (prerequisites !== undefined) {
    payload.prerequisites = prerequisites;
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
  const deliverables = sanitizeArtifactReferences(updates.deliverables);
  const prerequisites = sanitizeArtifactReferences(updates.prerequisites);
  const completionConditions = sanitizeCompletionConditions(updates.completionConditions);

  const normalized: UpdateTaskPayload = { ...updates };
  delete normalized.taskId;

  if (deliverables !== undefined) {
    normalized.deliverables = deliverables;
  } else {
    delete normalized.deliverables;
  }

  if (prerequisites !== undefined) {
    normalized.prerequisites = prerequisites;
  } else {
    delete normalized.prerequisites;
  }

  if (completionConditions !== undefined) {
    normalized.completionConditions = completionConditions;
  } else {
    delete normalized.completionConditions;
  }

  return normalized;
}
