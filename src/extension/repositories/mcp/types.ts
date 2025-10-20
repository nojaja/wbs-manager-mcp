import type {
    TaskArtifactRole as CommonTaskArtifactRole,
    Artifact as CommonArtifact,
    TaskArtifactAssignment as CommonTaskArtifactAssignment,
    TaskCompletionCondition as CommonTaskCompletionCondition,
    ArtifactReferenceInput as CommonArtifactReferenceInput,
} from '../../types';

// Re-export common types (aliases) for compatibility
export type TaskArtifactRole = CommonTaskArtifactRole;

export interface Artifact extends CommonArtifact {
    // Server-specific timestamps
    created_at?: string;
    updated_at?: string;
    // keep version as number
}

export interface TaskArtifactAssignment extends CommonTaskArtifactAssignment {
    // server representation may include DB ids and ordering
    taskId?: string;
    artifactId?: string;
    order?: number;
    // keep nested artifact shape
    artifact?: Artifact;
}

export interface TaskCompletionCondition extends CommonTaskCompletionCondition {
    id?: string;
    task_id?: string;
    order?: number;
}

export type ArtifactReferenceInput = CommonArtifactReferenceInput;

export interface CompletionConditionInput {
    description: string;
}
