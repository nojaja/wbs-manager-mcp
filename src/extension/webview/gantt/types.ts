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

export interface GanttWebviewContext {
  parentId: string | null;
  titleHint?: string;
}

export interface GanttWebviewPayload {
  snapshot: GanttSnapshot;
  context: GanttWebviewContext;
}
