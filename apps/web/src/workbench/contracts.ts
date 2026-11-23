import type { RuntimeContext, RuntimeTextLine } from "@/stores/workbench/projectionMapping";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import type { localRuntimeApi, FindingWire } from "@/shared/api/localRuntimeApi";
import type { assistantRequest, watchAssistant } from "@/shared/api/assistantApi";
import type { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";

export interface WorkbenchContext {
  project?: { id?: string; name?: string };
  model?: { id?: string; name?: string };
  activeContextId?: string;
  revision?: string;
  profileLabel?: string;
}

export interface WorkbenchSource {
  systemId?: string;
  projectId: string;
  projectName: string;
  modelId: string;
  modelName: string;
}
export interface WorkbenchBinding { projectId: string; modelId: string }
export interface WorkbenchConnectionOptions {
  backendUrl: string;
  assistantUrl?: string;
  accessToken?: string | (() => string | Promise<string>);
}

/** 展示快照保留语义 ID 与图中实例 ID；不使用 X6 内部 JSON 作为交换契约。 */
export interface WorkbenchDiagram extends RuntimeContext {
  nodes: OpdNode[];
  relations: ConsumptionRelation[];
  textLines?: RuntimeTextLine[];
}
export interface WorkbenchSnapshot {
  diagrams: WorkbenchDiagram[];
  findings?: FindingWire[];
}

export type WorkbenchRuntimeApi = Pick<typeof localRuntimeApi,
  "draftQuery" | "draftSaveState" | "draftMutation" | "getProject" | "listModels" | "revisions" | "workspaceSession" |
  "navigation" | "projection" | "commandCapabilities" | "relationCatalog" | "textProjection" |
  "findings" | "operationRecords" | "operationHistory" | "methodSummary" | "exportOpdJson" |
  "releaseVisualCommonFaultCommand" | "executeReleaseVisualCommonFaultCommand" | "executeP0Command">
  & Partial<Pick<typeof localRuntimeApi, "canvasNodeColors" | "saveCanvasNodeColors" | "graphAnalysis">>;
export interface WorkbenchServices {
  api: WorkbenchRuntimeApi;
  createSession: (projectId: string, modelId: string) => DraftWorkbenchSession;
  assistant?: { request: typeof assistantRequest; watch: typeof watchAssistant };
}

export interface WorkbenchHandle {
  reload?: () => void;
  prepareLeave: (keepAnalysis?: boolean) => Promise<boolean>;
  save: () => Promise<void>;
  /** Returns the confirmed immutable revision, or null if saving did not complete. */
  saveWithResult: () => Promise<string | null>;
  validate: () => Promise<void>;
  resize: () => void;
  /** Select and focus a semantic element in the requested view. */
  locateConstruct: (semanticId: string, contextId?: string) => Promise<boolean>;
}
