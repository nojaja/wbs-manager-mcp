// Interface definitions for WBSService public API
import type { Artifact } from '../mcpClient';

export type Task = any; // 詳細は domain モデルで拡張可能

export interface CreateTaskParams {
  title?: string;
  description?: string;
  parentId?: string | null;
  assignee?: string | null;
  estimate?: string | null;
  deliverables?: Array<{ artifactId: string; crudOperations?: string | null }>;
  prerequisites?: Array<{ artifactId: string; crudOperations?: string | null }>;
  completionConditions?: Array<{ description: string }>;
}

export interface UpdateTaskParams extends Partial<CreateTaskParams> {
}

export interface WBSServicePublic {
  // Tasks
  listTasksApi(parentId?: string | null): Promise<Task[]>;
  getTaskApi(taskId: string): Promise<Task | null>;
  createTaskApi(params: CreateTaskParams): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }>;
  updateTaskApi(taskId: string, updates: UpdateTaskParams): Promise<{ success: boolean; conflict?: boolean; error?: string }>;
  deleteTaskApi(taskId: string): Promise<{ success: boolean; error?: string }>;
  moveTaskApi(taskId: string, newParentId: string | null): Promise<{ success: boolean; error?: string }>;

  // Artifacts
  listArtifactsApi(): Promise<Artifact[]>;
  createArtifactApi(params: { title: string; uri?: string | null; description?: string | null }): Promise<{ success: boolean; artifact?: Artifact; error?: string }>;
  updateArtifactApi(params: { artifactId: string; title: string; uri?: string | null; description?: string | null; version?: number }): Promise<{ success: boolean; artifact?: Artifact; conflict?: boolean; error?: string }>;
  deleteArtifactApi(artifactId: string): Promise<{ success: boolean; error?: string }>;
}
