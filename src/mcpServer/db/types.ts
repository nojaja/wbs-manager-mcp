import type {
    TaskArtifactRole as CommonTaskArtifactRole,
    Artifact as CommonArtifact,
    TaskArtifactAssignment as CommonTaskArtifactAssignment,
    TaskCompletionCondition as CommonTaskCompletionCondition,
    Task as CommonTask
} from '../../extension/types';

/**
 * 処理名: TaskArtifactRole 型エイリアス
 * 処理概要: 共通の TaskArtifactRole を再エクスポートするための型
 * 実装理由: 拡張側（extension/types）との型互換を維持するため
 */
export type TaskArtifactRole = CommonTaskArtifactRole;

/**
 * 処理名: Artifact レコード型
 * 処理概要: DB に保存されるアーティファクトのフィールドを表す型（拡張フィールド付き）
 * 実装理由: DB スキーマに対応したフィールド（created_at/updated_at/version）を型に明示するため
 */
export interface Artifact extends CommonArtifact {
    created_at: string;
    updated_at: string;
    version: number;
}

/**
 * 処理名: TaskArtifactAssignment 型
 * 処理概要: タスクとアーティファクトの関連（割当）を表す型。DB の task_artifacts 行に対応する
 * 実装理由: タスクに紐づく納品物や前提物などの情報を一貫して取り扱うため
 */
export interface TaskArtifactAssignment extends CommonTaskArtifactAssignment {
    id: string;
    taskId: string;
    artifactId: string;
    crudOperations?: string | null;
    order: number;
    artifact: Artifact;
}

/**
 * 処理名: TaskCompletionCondition 型
 * 処理概要: タスクの完了条件を表す型。DB の task_completion_conditions 行に対応する
 * 実装理由: 完了条件を DB と型で一致させ、アプリケーション側で安全に利用するため
 */
export interface TaskCompletionCondition extends CommonTaskCompletionCondition {
    id: string;
    task_id: string;
    order: number;
}

/**
 * 処理名: Task 型
 * 処理概要: DB に保存されるタスクの完全な表現（子タスクや納品物・完了条件を含む）
 * 実装理由: クライアント/サーバ間や内部処理で、タスクの階層構造や関連データを一つのオブジェクトとして扱うため
 */
export interface Task extends CommonTask {
    details: any;
    children?: Task[];
    dependency?: String[];
    dependee?: String[];
    artifact?: String[];
    completionConditions?: TaskCompletionCondition[];
    version: number;
}

/**
 * 処理名: TaskArtifactInput 型
 * 処理概要: タスク作成/更新時に渡されるアーティファクト参照情報の入力形
 * 実装理由: 外部から受け取るデータの形を明示してバリデーションや整形を容易にするため
 */
export interface TaskArtifactInput {
    artifactId: string;
    crudOperations?: string | null;
}

export interface TaskDependenciesInput {
    taskId: string;
}

/**
 * 処理名: TaskCompletionConditionInput 型
 * 処理概要: タスク作成/更新時に渡される完了条件の入力形
 * 実装理由: 入力データと DB 表現を分離し、受け取り側で安全に変換できるようにするため
 */
export interface TaskCompletionConditionInput {
    description: string;
}
