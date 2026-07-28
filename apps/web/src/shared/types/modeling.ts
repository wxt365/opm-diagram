export type ProjectScope = "active" | "archived" | "all";
export type AccessMode = "editable-draft" | "readonly-snapshot" | "readonly-baseline" | "recovery-required";
export type ValidationState = "current" | "running" | "stale" | "failed";
export type TextProjectionState = "current" | "stale" | "generating" | "blocked" | "failed";
export type ResourceState = "loading" | "ready" | "empty" | "error";
export type CommandState = "idle" | "submitting" | "blocked" | "failed";
export type SaveState = "saved" | "save-failed";
export type BottomTab = "text" | "findings" | "history" | "method";
export type CanvasTool = "select" | "pan" | "object" | "process" | "consumption";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  profile: string;
  modelCount: number;
  lastOpenedAt: string;
  status: "active" | "archived";
}

export interface ModelSummary {
  id: string;
  projectId: string;
  name: string;
  description: string;
  profile: string;
  revision: number;
  baselineCount: number;
  validation: "current" | "stale";
  contextCount: number;
  lastSavedAt: string;
}

export interface OpdNode {
  id: string;
  occurrenceId: string;
  label: string;
  kind: "object" | "process";
  x: number;
  y: number;
  valueDomain: string;
  visibility: "public" | "protected" | "private";
  multiplicity: string;
  architectureLayer: "任务" | "功能" | "产品";
  occurrenceRole: "owned" | "reference";
}

export interface ConsumptionRelation {
  id: string;
  sourceId: string;
  targetId: string;
  sourceOccurrenceId: string;
  targetOccurrenceId: string;
  symbolRef: string;
  layoutRef: string;
}

export interface TextTrace {
  sentenceId: string;
  contextId: string;
  relationId: string;
  constructIds: string[];
  sentence: string;
}

export interface FindingSummary {
  id: string;
  severity: "警告" | "阻断";
  ruleId: string;
  message: string;
  contextId: string;
  constructId: string;
  inputRevision: number;
}

export interface ContextSummary {
  id: string;
  name: string;
  occurrenceCount: number;
  kind: "system-diagram" | "process-refinement" | "object-refinement" | "model-view";
  parentContextId?: string;
  refineeId?: string;
  nodes: OpdNode[];
  relations: ConsumptionRelation[];
}

export interface OverlayState {
  kind: "project" | "model" | "refinement" | "snapshot" | "baseline" | "semantic-zoom" | "impact";
}
