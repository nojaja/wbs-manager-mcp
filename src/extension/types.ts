export type TaskArtifactRole = 'deliverable' | 'prerequisite';

export interface Artifact {
  id: string;
  title: string;
  description?: string | null;
  // details: 作業内容の詳細を保持するフィールド
  details?: string | null;
  mimeType?: string | null;
  uri?: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskArtifactAssignment {
  // support both client-side and server-side shapes
  id?: string;
  artifactId?: string;
  taskId?: string;
  role: TaskArtifactRole;
  crudOperations?: string | null;
  order?: number;
  artifact?: Artifact;
}

export interface TaskCompletionCondition {
  id?: string;
  task_id?: string;
  description: string;
  order?: number;
}

export interface Task {
  id: string;
  parent_id?: string;
  title: string;
  description?: string | null;
  assignee?: string | null;
  status?: string | null;
  estimate?: string | null;
  version?: number;
  childCount?: number;
  children?: Task[];
  artifacts?: TaskArtifactAssignment[];
  completionConditions?: TaskCompletionCondition[];
  created_at?: string;
  updated_at?: string;
}

export type ArtifactReferenceInput = { artifactId: string; crudOperations?: string | null };

export interface GanttAnchor {
  start: string;
}

export interface GanttMetadata {
  parentId: string | null;
  generatedAt: string;
  anchor: GanttAnchor;
}

export interface GanttTaskEstimate {
  durationHours: number;
  effortPoints?: number;
}

export interface GanttTaskItem {
  id: string;
  label: string;
  estimate: GanttTaskEstimate;
  progress: number;
  status: string;
  lane?: string;
  wbsPath: string[];
  orderIndex: number;
  metadata?: Record<string, unknown>;
}

export interface GanttDependencyItem {
  from: string;
  to: string;
  type: string;
  lagHours?: number;
  metadata?: Record<string, unknown>;
}

export interface GanttSnapshot {
  metadata: GanttMetadata;
  tasks: GanttTaskItem[];
  dependencies: GanttDependencyItem[];
}
