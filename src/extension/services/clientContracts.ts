import type { Artifact, Task, ArtifactReferenceInput as CommonArtifactReferenceInput, TaskCompletionCondition as TaskCompletionConditionType } from '../types';
import type { ArtifactReferenceInput, CompletionConditionInput } from '../tasks/taskPayload';

export interface TaskClientLike {
    listTasks(parentId?: string | null): Promise<Task[]>;
    getTask(taskId: string): Promise<Task | null>;
    createTask(params: {
        title?: string;
        description?: string;
        parentId?: string | null;
        assignee?: string | null;
        estimate?: string | null;
        artifacts?: ArtifactReferenceInput[];
        completionConditions?: CompletionConditionInput[];
    }): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }>;
    updateTask(taskId: string, updates: Record<string, unknown>): Promise<{ success: boolean; conflict?: boolean; error?: string; taskId?: string; message?: string }>;
    deleteTask(taskId: string): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }>;
    moveTask(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string; taskId?: string; message?: string }>;
}

export interface ArtifactClientLike {
    listArtifacts(): Promise<Artifact[]>;
    getArtifact(artifactId: string): Promise<Artifact | null>;
    createArtifact(params: { title: string; uri?: string | null; description?: string | null }): Promise<{ success: boolean; artifact?: Artifact; error?: string; message?: string }>;
    updateArtifact(params: { artifactId: string; title: string; uri?: string | null; description?: string | null; version?: number }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string; message?: string }>;
    deleteArtifact(artifactId: string): Promise<{ success: boolean; error?: string; message?: string }>;
}
