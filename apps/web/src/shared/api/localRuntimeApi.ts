import type {
  ApiEdtCommandCapabilitiesData,
  ApiEdtCreateFactPayload,
  ApiEdtCreateStatePayload,
  ApiEdtDeleteConstructPayload,
  ApiEdtRelationCatalogItem,
  ApiEdtStatePresentationPayload,
  ApiEdtUpdateFactPayload,
  ApiEdtUpdateLayoutPayload,
  ApiEdtUpdatePropertyPayload,
  ApiEdtUpdateStatePayload,
} from "./generated/apiEdtContract";
import type * as Draft from "./generated/draftWorkspaceContract";
import type { PinResult, SaveResult } from "./generated/draftSaveContract";

export interface DraftQueryContracts {
  open: [Draft.OpenDraftRequest, Draft.OpenDraftResult];
  projection: [Draft.DraftQueryRequest, Draft.DraftProjectionResult];
  text: [Draft.DraftQueryRequest, Draft.DraftTextResult];
  navigation: [Draft.DraftQueryRequest, Draft.DraftNavigationResult];
  findings: [Draft.DraftQueryRequest, Draft.DraftFindingsResult];
  "relation-catalog": [Draft.DraftRelationCatalogRequest, Draft.DraftRelationCatalogResult];
  capabilities: [Draft.DraftCapabilitiesRequest, Draft.DraftCapabilitiesResult];
  receipts: [Draft.DraftReceiptRequest, Draft.DraftReceiptResult];
}

export interface DraftMutationResults { EDIT: Draft.DraftEditResult; SAVE: SaveResult; PIN: PinResult }

export type ResourceAccessMode = "EDITABLE_DRAFT" | "READONLY_SNAPSHOT" | "READONLY_BASELINE";

export interface ProjectWire {
  project_id: string;
  name: string;
  description?: string;
  archive_state: "ACTIVE" | "ARCHIVED";
  model_count: number;
  updated_at: string;
}

export interface ModelWire {
  model_id: string;
  project_id: string;
  name: string;
  head_revision: string | null;
  profile_id: string;
  profile_version: string;
  rule_version: string;
  access_mode: ResourceAccessMode;
}

export interface WorkspaceSessionWire {
  model: ModelWire;
  root_context_id: string;
  current_context_id: string;
}

export interface QueryMeta {
  read_revision: string | null;
  profile_version: string | null;
  rule_version: string | null;
  freshness: "current" | "historical" | "not-applicable";
}

export interface QueryEnvelope<T> {
  meta: QueryMeta;
  data: T;
}

export interface CommandMeta {
  command_id: string;
  status: "COMMITTED" | "ACCEPTED";
  committed_revision: string | null;
  autosave_state: "saved" | "not-applicable";
}

export interface CommandEnvelope<T> {
  meta: CommandMeta;
  data: T;
}

export interface NavigationNodeWire {
  context_id: string;
  label: string;
  context_kind: string;
  has_children: boolean;
}

export interface ProjectionConstructWire {
  occurrence_id: string;
  target_id: string;
  target_kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT";
  construct_role: string;
  label?: string;
  layout: { x: number; y: number; width: number; height: number; z_order: number };
  source_id?: string;
  process_id?: string;
  source_occurrence_id?: string;
  target_occurrence_id?: string;
  symbol_ref?: string;
  layout_ref?: string;
  owner_id?: string;
  state_roles?: Array<"INITIAL" | "DEFAULT" | "FINAL">;
  explicitness?: "EXPLICIT" | "SUPPRESSED";
  fold_state?: "UNFOLDED" | "FOLDED";
  capability_id: string;
  direction?: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED";
  endpoints?: Array<{ role: string; target_kind: "ELEMENT" | "STATE" | "FEATURE"; target_id: string; ordinal: number }>;
  modifiers?: Array<{ modifier_id: string; value: string }>;
  labels?: Array<{ slot_id: string; text: string }>;
  collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
}

export interface SuppressedStateWire {
  state_id: string;
  owner_ref: { target_kind: "ELEMENT" | "FEATURE"; target_id: string };
  name_or_value: string;
  state_roles: Array<"INITIAL" | "DEFAULT" | "FINAL">;
  explicitness: "SUPPRESSED";
}

export interface TextSentenceWire {
  sentence_id: string;
  text: string;
  ordinal: number;
}

export interface TextTraceWire {
  sentence_id: string;
  fact_ids: string[];
  occurrence_ids: string[];
}

export type RelationCatalogItemWire = ApiEdtRelationCatalogItem;

export interface RevisionWire {
  revision_id: string;
  sequence: number;
  kind: "DRAFT" | "BASELINE";
  created_at: string;
  immutable: boolean;
  blocking_count: number;
}

export interface FindingWire {
  finding_id: string;
  rule_id: string;
  severity: "BLOCKING" | "WARNING" | "SUGGESTION";
  category: string;
  context_id: string;
  entity_id: string;
}

export interface OperationRecordWire {
  operation_record_id: string;
  project_id: string;
  model_id: string;
  operation_id: string;
  aggregate_id: string;
  command_id: string;
  input_revision_id: string;
  result_revision_id: string | null;
  result_status: string;
  diagnostic_id: string | null;
  occurred_at: string;
}

export interface ReleaseVisualCommonFaultCommandWire {
  command_id: "command.visual.blocked-feedback.persistence-failed";
  command_type: "CREATE_FACT";
  payload: {
    kind: "CONSUMPTION";
    fact_id: "fact.visual.blocked-feedback.one-shot";
    object_id: "element.visual.blocked-feedback.input";
    process_id: "element.visual.blocked-feedback.process";
    layout: { x: 340; y: 266 };
  };
}

export interface ValidationTaskWire {
  task_id: string;
  state: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progress: number | null;
  input_revision?: string;
}

export type P0Command =
  | { commandType: "CREATE_ELEMENT"; payload: { kind: "OBJECT" | "PROCESS"; name: string; layout: { x: number; y: number } } }
  | { commandType: "CREATE_FEATURE"; payload: { context_id: string; owner_element_id: string; feature_kind: "ATTRIBUTE" | "OPERATION"; capability_ref: { capability_id: string }; name: string; occurrence: { ownership: "OWNED"; construct_role: string }; layout: { x: number; y: number }; capability_query_id: string; selected_option_id: string } }
  | { commandType: "CREATE_FACT"; payload: { kind: "CONSUMPTION"; object_id: string; state_id?: string; process_id: string; layout: { x: number; y: number } } }
  | { commandType: "CREATE_FACT"; payload: ApiEdtCreateFactPayload }
  | { commandType: "CREATE_STATE"; payload: ApiEdtCreateStatePayload }
  | { commandType: "UPDATE_STATE"; payload: ApiEdtUpdateStatePayload }
  | { commandType: "UPDATE_FACT"; payload: ApiEdtUpdateFactPayload }
  | { commandType: "UPDATE_PROPERTY"; payload: ApiEdtUpdatePropertyPayload }
  | { commandType: "UPDATE_LAYOUT"; payload: ApiEdtUpdateLayoutPayload }
  | { commandType: "DELETE_CONSTRUCT"; payload: ApiEdtDeleteConstructPayload }
  | { commandType: "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD"; payload: ApiEdtStatePresentationPayload };

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
}

interface ProfileRuleBinding {
  profile_id: string;
  profile_version: string;
  rule_set_id: string;
  rule_version: string;
}

export class LocalRuntimeApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly reasonCode: string | null;

  constructor(code: string, message: string, retryable = false, reasonCode: string | null = null) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.reasonCode = reasonCode;
  }
}

class LocalRuntimeApi {
  draftQuery<K extends keyof DraftQueryContracts>(project: string, model: string, operation: K,
    request: DraftQueryContracts[K][0]): Promise<DraftQueryContracts[K][1]> {
    return this.writeRaw(draftPath(project, model, operation), JSON.stringify(request));
  }

  // raw 已由传输 owner 持久化；重试不能重新序列化或分配另一 command_id。
  draftMutation<K extends keyof DraftMutationResults>(project: string, model: string, operation: K,
    raw: string): Promise<DraftMutationResults[K]> {
    const path = { EDIT: "commands", SAVE: "save", PIN: "pin" }[operation];
    return this.writeRaw(draftPath(project, model, path), raw);
  }

  async listProjects(query?: string): Promise<ProjectWire[]> {
    const params = new URLSearchParams({ request_id: requestId("query.projects") });
    if (query?.trim()) params.set("query", query.trim());
    return (await this.request<QueryEnvelope<ProjectWire[]>>(`/api/v1/projects?${params}`)).data;
  }

  async createProject(name: string, description: string): Promise<ProjectWire> {
    return (await this.write<CommandEnvelope<ProjectWire>>("/api/v1/projects", {
      request_id: requestId("request.project"),
      command_id: requestId("command.project"),
      name,
      description,
    })).data;
  }

  async getProject(projectId: string): Promise<ProjectWire> {
    return (await this.request<QueryEnvelope<ProjectWire>>(`/api/v1/projects/${encodeURIComponent(projectId)}?${queryRequestId("project")}`)).data;
  }

  async listModels(projectId: string): Promise<ModelWire[]> {
    return (await this.request<QueryEnvelope<ModelWire[]>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models?${queryRequestId("models")}`)).data;
  }

  async createModel(projectId: string, name: string): Promise<ModelWire> {
    return (await this.write<CommandEnvelope<ModelWire>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models`, {
      request_id: requestId("request.model"),
      command_id: requestId("command.model"),
      name,
      binding: activeBinding(),
    })).data;
  }

  async openWorkspace(projectId: string, modelId: string): Promise<WorkspaceSessionWire> {
    return (await this.request<QueryEnvelope<WorkspaceSessionWire>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/workspace-session?${queryRequestId("workspace")}`)).data;
  }

  async workspaceSession(projectId: string, modelId: string, revision?: string, context?: string): Promise<QueryEnvelope<WorkspaceSessionWire>> {
    const params = new URLSearchParams(queryRequestId("workspace"));
    if (revision !== undefined) params.set("revision", revision);
    if (context !== undefined) params.set("context", context);
    return this.request<QueryEnvelope<WorkspaceSessionWire>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/workspace-session?${params}`);
  }

  async navigation(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<{ current_path: string[]; process_tree: NavigationNodeWire[]; object_forest: NavigationNodeWire[]; views: NavigationNodeWire[] }>> {
    return this.queryContext(projectId, modelId, contextId, revision, "navigation");
  }

  async projection(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<{ context_id: string; constructs: ProjectionConstructWire[]; suppressed_states: SuppressedStateWire[] }>> {
    return this.queryContext(projectId, modelId, contextId, revision, "projection");
  }

  async commandCapabilities(projectId: string, modelId: string, contextId: string, revision: string, selectionId?: string, intent?: string, endpointIds: string[] = []): Promise<QueryEnvelope<ApiEdtCommandCapabilitiesData>> {
    const params = new URLSearchParams({ request_id: requestId("query.command-capabilities"), revision });
    if (selectionId) params.set("selection_id", selectionId);
    if (intent) params.set("intent", intent);
    endpointIds.forEach((endpointId) => params.append("endpoint", endpointId));
    return this.request<QueryEnvelope<ApiEdtCommandCapabilitiesData>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/command-capabilities?${params}`);
  }

  async relationCatalog(projectId: string, modelId: string, contextId: string, revision: string, selectionId?: string): Promise<QueryEnvelope<{ items: RelationCatalogItemWire[] }>> {
    const params = new URLSearchParams({ request_id: requestId("query.relation-catalog"), revision });
    if (selectionId) params.set("selection_id", selectionId);
    return this.request<QueryEnvelope<{ items: RelationCatalogItemWire[] }>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/relation-catalog?${params}`);
  }

  async textProjection(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<{ artifact_id: string; modality: "OPL" | "OPT"; sentences: TextSentenceWire[]; traces: TextTraceWire[] }>> {
    return this.queryContext(projectId, modelId, contextId, revision, "text-projection");
  }

  async findings(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<FindingWire[]>> {
    return this.queryContext(projectId, modelId, contextId, revision, "findings");
  }

  async operationRecords(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<OperationRecordWire[]>> {
    return this.queryContext(projectId, modelId, contextId, revision, "operation-records");
  }

  async releaseVisualCommonFaultCommand(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<ReleaseVisualCommonFaultCommandWire>> {
    return this.queryContext(projectId, modelId, contextId, revision, "release-visual-common-fault-command");
  }

  async revisions(projectId: string, modelId: string): Promise<RevisionWire[]> {
    return (await this.request<QueryEnvelope<RevisionWire[]>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/revisions?${queryRequestId("revisions")}`)).data;
  }

  async executeP0Command(projectId: string, modelId: string, contextId: string, baseRevision: string, command: P0Command): Promise<CommandEnvelope<{ affected_ids: string[]; text_trace_ids: string[]; validation_summary: { blocking: number; warning: number; suggestion: number; coverage_state: string } }>> {
    return this.write(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/commands`, {
      request_id: requestId("request.command"),
      command_id: requestId("command.p0"),
      base_revision: baseRevision,
      binding: activeBinding(),
      command_type: command.commandType,
      payload: command.payload,
    });
  }

  async executeReleaseVisualCommonFaultCommand(projectId: string, modelId: string, contextId: string, baseRevision: string, command: ReleaseVisualCommonFaultCommandWire): Promise<CommandEnvelope<{ affected_ids: string[]; text_trace_ids: string[]; validation_summary: { blocking: number; warning: number; suggestion: number; coverage_state: string } }>> {
    return this.write(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/commands`, {
      request_id: requestId("request.release-visual-common-fault-command"),
      command_id: command.command_id,
      base_revision: baseRevision,
      binding: activeBinding(),
      command_type: command.command_type,
      payload: command.payload,
    });
  }

  async validate(projectId: string, modelId: string, revision: string): Promise<CommandEnvelope<ValidationTaskWire>> {
    return this.write(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/validation-tasks`, {
      request_id: requestId("request.validation"),
      command_id: requestId("command.validation"),
      input_revision: revision,
      binding: activeBinding(),
      scope: "FULL",
    });
  }

  private queryContext<T>(projectId: string, modelId: string, contextId: string, revision: string, resource: string): Promise<QueryEnvelope<T>> {
    const params = new URLSearchParams({ request_id: requestId(`query.${resource}`), revision });
    return this.request<QueryEnvelope<T>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/${resource}?${params}`);
  }

  private async write<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.writeRaw(path, JSON.stringify(body));
  }

  private async writeRaw<T>(path: string, raw: string): Promise<T> {
    const token = window.__OPM_LOCAL_SESSION__;
    if (!token) {
      throw new LocalRuntimeApiError("LOCAL_SESSION_INVALID", "本地会话尚未就绪，请刷新页面后重试。");
    }
    return this.request<T>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OPM-Session": token,
      },
      body: raw,
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, init);
    } catch {
      throw new LocalRuntimeApiError("RUNTIME_UNAVAILABLE", "本地运行时不可用，请确认服务已启动。", true);
    }
    const payload = await json(response);
    const isDraft = path.startsWith("/api/v2/");
    if (!response.ok) {
      const error = isDraft ? asDraftError(payload) : asError(payload);
      throw new LocalRuntimeApiError(error?.code ?? "REQUEST_FAILED", error?.message ?? "本地请求失败，请重试。", error?.retryable ?? false,
        isDraft ? asDraftError(payload)?.reason_code ?? null : null);
    }
    if (isDraft && (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0))
      throw new LocalRuntimeApiError("DRAFT_RESPONSE_INVALID", "草稿响应无效，待确认请求已保留。");
    return payload as T;
  }
}

export const localRuntimeApi = new LocalRuntimeApi();

function draftPath(project: string, model: string, operation: string): string {
  return `/api/v2/projects/${encodeURIComponent(project)}/models/${encodeURIComponent(model)}/draft/${operation}`;
}

function asDraftError(payload: unknown): { code: string; message: string; retryable: boolean; reason_code: string | null } | undefined {
  if (!payload || typeof payload !== "object" || !("code" in payload) || !("message" in payload) || !("retryable" in payload)
    || typeof payload.code !== "string" || typeof payload.message !== "string" || typeof payload.retryable !== "boolean") return undefined;
  return { code: payload.code, message: payload.message, retryable: payload.retryable,
    reason_code: "reason_code" in payload && typeof payload.reason_code === "string" ? payload.reason_code : null };
}

function activeBinding(): ProfileRuleBinding {
  const binding = window.__OPM_ACTIVE_PROFILE_BINDING__;
  if (!binding || !binding.profile_id || !binding.profile_version || !binding.rule_set_id || !binding.rule_version) {
    throw new LocalRuntimeApiError("RUNTIME_BINDING_UNAVAILABLE", "本地运行时未下发活动 Profile binding，请刷新页面后重试。", true);
  }
  return binding;
}

function requestId(prefix: string): string {
  return `${prefix}.${crypto.randomUUID().replaceAll("-", "")}`;
}

function queryRequestId(scope: string): string {
  return new URLSearchParams({ request_id: requestId(`query.${scope}`) }).toString();
}

async function json(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function asError(payload: unknown): ErrorEnvelope["error"] {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return undefined;
  const candidate = payload.error;
  return typeof candidate === "object" && candidate !== null ? candidate as ErrorEnvelope["error"] : undefined;
}
