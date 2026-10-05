export type ProjectScope = "active" | "archived" | "all";
export type AccessMode = "editable-draft" | "readonly-snapshot" | "readonly-baseline" | "recovery-required";
export type ValidationState = "current" | "running" | "stale" | "failed";
export type TextProjectionState = "current" | "stale" | "generating" | "blocked" | "failed";
export type ResourceState = "loading" | "ready" | "empty" | "error";
export type CommandState = "idle" | "submitting" | "blocked" | "failed";
export type SaveState = "saved" | "save-failed";
export type BottomTab = "text" | "findings" | "history" | "method";
export type CanvasTool = "select" | "pan" | "object" | "process" | "attribute" | "operation" | "consumption" | "state";
export type RelationCatalogGroup = "procedural" | "control" | "structural";

export interface RelationCatalogItem {
  capabilityId: string;
  group: RelationCatalogGroup;
  label: string;
  endpointSummary: string;
  available: boolean;
  reason?: string;
}

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
  kind: "object" | "process" | "attribute" | "operation" | "state";
  x: number;
  y: number;
  width?: number;
  height?: number;
  valueDomain: string;
  visibility: "public" | "protected" | "private";
  multiplicity: string;
  architectureLayer: "任务" | "功能" | "产品";
  occurrenceRole: "owned" | "reference";
  ownerId?: string;
  stateRoles?: Array<"INITIAL" | "DEFAULT" | "FINAL">;
  explicitness?: "EXPLICIT" | "SUPPRESSED";
  foldState?: "UNFOLDED" | "FOLDED";
}

export interface ProceduralEndpoint {
  role: string;
  targetId: string;
  targetKind: "ELEMENT" | "STATE" | "FEATURE";
  ordinal: number;
}

export interface ConsumptionRelation {
  id: string;
  occurrenceId: string;
  sourceId: string;
  targetId: string;
  sourceOccurrenceId: string;
  targetOccurrenceId: string;
  symbolRef: string;
  layoutRef: string;
  capabilityId?: string;
  direction?: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED";
  endpoints?: ProceduralEndpoint[];
  duration?: string;
  controlCapability?: string;
  controlSegment?: "PROCESS_INPUT";
  labels?: Array<{ slotId: string; text: string }>;
  collectionCompleteness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
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
