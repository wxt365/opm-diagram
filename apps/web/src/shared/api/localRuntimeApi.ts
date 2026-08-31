import type {
  ApiEdtCommandCapabilitiesData,
  ApiEdtCreateFactPayload,
  ApiEdtCreateStatePayload,
  ApiEdtDeleteConstructPayload,
  ApiEdtStatePresentationPayload,
  ApiEdtUpdateFactPayload,
  ApiEdtUpdateStatePayload,
} from "./generated/apiEdtContract";

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
  head_revision: string;
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
  capability_id?: string;
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

export interface RevisionWire {
  revision_id: string;
  sequence: number;
  kind: "DRAFT" | "BASELINE";
  created_at: string;
  immutable: boolean;
  blocking_count: number;
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

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

class LocalRuntimeApi {
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

  async workspaceSession(projectId: string, modelId: string): Promise<QueryEnvelope<WorkspaceSessionWire>> {
    return this.request<QueryEnvelope<WorkspaceSessionWire>>(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/workspace-session?${queryRequestId("workspace")}`);
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

  async textProjection(projectId: string, modelId: string, contextId: string, revision: string): Promise<QueryEnvelope<{ artifact_id: string; modality: "OPL" | "OPT"; sentences: TextSentenceWire[]; traces: TextTraceWire[] }>> {
    return this.queryContext(projectId, modelId, contextId, revision, "text-projection");
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
      body: JSON.stringify(body),
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
    if (!response.ok) {
      const error = asError(payload);
      throw new LocalRuntimeApiError(error?.code ?? "REQUEST_FAILED", error?.message ?? "本地请求失败，请重试。", error?.retryable ?? false);
    }
    return payload as T;
  }
}

export const localRuntimeApi = new LocalRuntimeApi();

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
