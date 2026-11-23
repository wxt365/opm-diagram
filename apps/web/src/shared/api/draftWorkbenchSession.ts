import type * as Draft from "./generated/draftWorkspaceContract";
import type { SaveState } from "./generated/draftSaveContract";
import type { P0Command, ProjectionConstructWire, SuppressedStateWire } from "./localRuntimeApi";
import { localRuntimeApi, LocalRuntimeApiError } from "./localRuntimeApi";
import { DraftDelivery } from "./draftDelivery";
import { draftRawJson, sameDraftToken, validDraftToken } from "./draftRequestIdentity";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import { randomUuid } from "@/shared/platform/browserCrypto";

export type ArchitectureLinkCommand = { commandType: "CREATE_ARCHITECTURE_LINK"; payload: Draft.CreateArchitectureLinkPayload } | { commandType: "DELETE_ARCHITECTURE_LINK"; payload: Draft.DeleteArchitectureLinkPayload };
export type ArchitectureClassificationCommand = { commandType: "UPDATE_ARCHITECTURE_CLASSIFICATION"; payload: Draft.ArchitectureClassificationPayload };

export type LayoutBatchCommand = { commandType: "UPDATE_LAYOUT_BATCH"; payload: Draft.UpdateLayoutBatchPayload };
export type RestoreOperationCommand = { commandType: "RESTORE_OPERATION"; payload: Draft.RestoreOperationPayload };

export type ContextDeleteCommand = { commandType: "DELETE_CONTEXT"; payload: Draft.DeleteContextPayload };
export type ContextDeleteOption = Extract<Draft.CommandCapabilityOption, { command_type: "DELETE_CONTEXT" }>;

export class DraftWorkbenchSession {
  private readonly authorizations = new Map<string, { scope: Draft.DraftScope; option: Draft.CommandCapabilityOption }>();
  private readonly reads = new Map<string, Promise<unknown>>();
  constructor(readonly project: string, readonly model: string,
    private readonly delivery = new DraftDelivery(), private readonly api: Pick<typeof localRuntimeApi, "draftQuery" | "draftSaveState" | "getProject" | "listModels" | "revisions"> = localRuntimeApi) { }

  async saveState(): Promise<SaveState> {
    const state = await this.api.draftSaveState(this.project, this.model);
    if (!state || !validDraftToken(state.durable_token)
      || !["NONE", "AUTO", "MANUAL", "PIN"].includes(state.in_flight)
      || (state.dirty_since === null) !== (state.deadline === null)
      || (state.dirty_since !== null && (!Number.isFinite(Date.parse(state.dirty_since)) || !Number.isFinite(Date.parse(state.deadline!))))) invalid();
    for (const token of [state.checkpoint_token, state.pending_manual_target]) {
      if (token !== null && (!validDraftToken(token) || token.draft_id !== state.durable_token.draft_id
        || token.binding_digest !== state.durable_token.binding_digest || token.edit_seq > state.durable_token.edit_seq)) invalid();
    }
    return state;
  }

  async open(context: string | null = null): Promise<Draft.OpenDraftResult> {
    const request_id = draftRequestId();
    const result = await this.api.draftQuery(this.project, this.model, "open", { request_id, context_id: context });
    if (result.request_id !== request_id || result.project_id !== this.project || result.model_id !== this.model
      || result.mode !== "JOURNALED_DRAFT_V2" || !validDraftToken(result.draft_token)
      || !result.save_state || !sameDraftToken(result.draft_token, result.save_state.durable_token)) invalid();
    return result;
  }

  async recover() {
    for (const lane of ["EDIT", "EXPLICIT"] as const) await this.delivery.recover(this.project, this.model, lane);
  }
  pending() { return this.delivery.pending(this.project, this.model); }

  async read(opened: Draft.OpenDraftResult) {
    const [canvas, details, project, models, history] = await Promise.all([
      this.readCanvas(opened), this.readDetails(opened),
      this.api.getProject(this.project), this.api.listModels(this.project), this.api.revisions(this.project, this.model),
    ]);
    const model = models.find(item => item.model_id === this.model && item.project_id === this.project);
    if (!model) invalid();
    return { ...canvas, ...details, project, model, history };
  }

  async readCanvas(opened: Draft.OpenDraftResult) {
    const request = query(opened.draft_token, opened.context_id);
    const projection = await this.api.draftQuery(this.project, this.model, "projection", request);
    checkMeta(projection.meta, request);
    if (projection.data.context_id !== opened.context_id) invalid();
    return { opened, constructs: projection.data.constructs.map(projectConstruct), suppressed: projection.data.suppressed_states.map(projectSuppressed) };
  }

  async readEditedCanvas(token: Draft.DraftToken, context: string) {
    const request = query(token, context);
    const { opened, projection } = await this.api.draftQuery(this.project, this.model, "canvas", request);
    if (!opened || opened.request_id !== request.request_id || opened.project_id !== this.project || opened.model_id !== this.model
      || opened.mode !== "JOURNALED_DRAFT_V2" || opened.context_id !== context || !validDraftToken(opened.draft_token)
      || !sameDraftToken(opened.draft_token, token) || !opened.save_state || !sameDraftToken(opened.save_state.durable_token, token)) invalid();
    checkMeta(projection.meta, request);
    if (projection.data.context_id !== context) invalid();
    return { opened, constructs: projection.data.constructs.map(projectConstruct), suppressed: projection.data.suppressed_states.map(projectSuppressed) };
  }

  async readDetails(opened: Draft.OpenDraftResult) {
    const request = query(opened.draft_token, opened.context_id);
    const { text, navigation, findings, catalog } = await this.api.draftQuery(this.project, this.model, "details", request);
    for (const result of [navigation, findings, catalog]) checkMeta(result.meta, request);
    if (text) checkMeta(text.meta, request);
    else if (!findings.data.items.length) invalid();
    if (findings.data.validation_scope !== "MODEL" || findings.data.validation_summary.coverage_state !== "INCOMPLETE") invalid();
    this.reads.set(this.readKey("catalog", opened.draft_token, [opened.context_id, null]), Promise.resolve(catalog));
    this.trimReads();
    return { text: text?.data ?? { artifact_id: "artifact.unavailable", modality: "OPL" as const, sentences: [], traces: [] },
      textError: text ? "" : "当前 OPD 的 OPL 生成受模型问题阻断，请在“问题”面板查看详情。", navigation: navigation.data, findings: findings.data,
      catalog: catalog.data.items };
  }

  async catalog(token: Draft.DraftToken, context: string, selection?: string) {
    return this.reuseRead(this.readKey("catalog", token, [context, selection ?? null]), async () => {
    const request = { ...query(token, context), selection_id: selection ?? null };
    const result = await this.api.draftQuery(this.project, this.model, "relation-catalog", request);
    checkMeta(result.meta, request); return result;
    });
  }

  async findings(token: Draft.DraftToken, context: string) {
    const request = query(token, context);
    const result = await this.api.draftQuery(this.project, this.model, "findings", request);
    checkMeta(result.meta, request);
    if (result.data.validation_scope !== "MODEL" || result.data.validation_summary.coverage_state !== "INCOMPLETE") invalid();
    return result.data;
  }

  async projection(token: Draft.DraftToken, context: string) {
    const request = query(token, context);
    const result = await this.api.draftQuery(this.project, this.model, "projection", request);
    checkMeta(result.meta, request);
    if (result.data.context_id !== context) invalid();
    return result.data.constructs.map(projectConstruct);
  }

  async capabilities(token: Draft.DraftToken, context: string, selection: string | undefined, intent: Draft.DraftCommandType, endpoints: string[] = []) {
    const scope: Draft.DraftScope = { context_id: context, selection_id: selection ?? null, intent, endpoints: [...endpoints] };
    return this.reuseRead(this.readKey("capabilities", token, scope), async () => {
    const request = { request_id: draftRequestId(), draft_token: token, scope };
    const result = await this.api.draftQuery(this.project, this.model, "capabilities", request);
    checkMeta(result.meta, { ...request, context_id: context });
    if (draftRawJson(result.data.scope) !== draftRawJson(scope)) invalid();
    // 同 token 可保留不同选择的授权；进入另一编辑序号时移除旧 token。
    for (const [key, value] of this.authorizations) if (!sameDraftToken(value.option.expires_with_token, token)) this.authorizations.delete(key);
    const ids = new Set<string>();
    for (const option of result.data.options) {
      if (!sameDraftToken(option.expires_with_token, token) || option.command_type !== intent || ids.has(option.option_id)
        || option.capability_query_id !== result.data.capability_query_id) invalid();
      ids.add(option.option_id);
      if (option.command_type === "DELETE_CONSTRUCT" && (!sameDraftToken(option.impact_summary.input_token, token)
        || option.impact_summary.selected_occurrence_id !== scope.selection_id)) invalid();
      if (option.command_type === "DELETE_CONTEXT" && (!sameDraftToken(option.context_impact.input_token, token)
        || option.context_impact.context_id !== scope.selection_id)) invalid();
    }
    for (const option of result.data.options) this.authorizations.set(option.option_id, JSON.parse(draftRawJson({ scope, option })));
    return result;
    });
  }

  private readKey(operation: string, token: Draft.DraftToken, scope: unknown) { return draftRawJson([operation, token, scope]); }
  private trimReads() { while (this.reads.size > 32) this.reads.delete(this.reads.keys().next().value!); }
  private reuseRead<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.reads.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = load().catch(error => { if (this.reads.get(key) === pending) this.reads.delete(key); throw error; });
    this.reads.set(key, pending); this.trimReads();
    return pending;
  }

  async edit(token: Draft.DraftToken, context: string, input: P0Command | LayoutBatchCommand | ContextDeleteCommand | ArchitectureClassificationCommand | ArchitectureLinkCommand | RestoreOperationCommand) {
    if (input.commandType === "RESTORE_OPERATION") return this.delivery.submit(this.project, this.model, { operation: "EDIT", request: {
      request_id: draftRequestId(), command_id: draftRequestId("command"), expected_draft_token: token,
      scope: { context_id: context, selection_id: null, intent: "RESTORE_OPERATION", endpoints: [] },
      authorization: { capability_query_id: "recovery.latest", selected_option_id: input.payload.record_id },
      command: { command_type: "RESTORE_OPERATION", payload: input.payload },
    } });
    const payload = cleanPayload(input.payload) as Record<string, unknown>;
    if (input.commandType === "CREATE_ELEMENT") payload.context_id = context;
    if (input.commandType === "CREATE_FACT" && "kind" in payload) throw new LocalRuntimeApiError("INPUT_INVALID", "草稿关系请从 Runtime 关系目录创建。");
    let authorization = typeof payload.selected_option_id === "string" ? this.authorizations.get(payload.selected_option_id) : undefined;
    if (payload.selected_option_id && (!authorization || authorization.option.capability_query_id !== payload.capability_query_id)) stale();
    if (input.commandType === "DELETE_CONSTRUCT") {
      authorization = [...this.authorizations.values()].find(item => item.option.command_type === "DELETE_CONSTRUCT"
        && item.option.impact_token === payload.impact_token && item.scope.selection_id === payload.selection_id);
      if (!authorization) stale();
    }
    if (input.commandType === "DELETE_CONTEXT") {
      authorization = [...this.authorizations.values()].find(item => item.option.command_type === "DELETE_CONTEXT"
        && item.option.impact_token === payload.impact_token && item.scope.selection_id === payload.context_id);
      if (!authorization) stale();
    }
    if (!authorization) {
      const selection = input.commandType === "UPDATE_LAYOUT" ? String(payload.occurrence_id)
        : ["STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD"].includes(input.commandType) ? String(payload.state_id) : undefined;
      if (input.commandType !== "CREATE_ELEMENT" && input.commandType !== "UPDATE_LAYOUT_BATCH" && !["UPDATE_ARCHITECTURE_CLASSIFICATION", "CREATE_ARCHITECTURE_LINK", "DELETE_ARCHITECTURE_LINK"].includes(input.commandType) && !selection) stale();
      const endpoints = input.commandType === "UPDATE_LAYOUT_BATCH" ? input.payload.layouts.map(item => item.occurrence_id) : [];
      const result = await this.capabilities(token, context, selection, input.commandType, endpoints);
      const options = result.data.options.filter(option => option.enabled && (input.commandType !== "CREATE_ELEMENT"
        || option.required_fields.some(field => field.field_id === "kind" && field.allowed_values?.includes(String(payload.kind)))));
      if (options.length !== 1) throw new LocalRuntimeApiError("DRAFT_EDIT_REJECTED", result.data.forbidden[0]?.reason_code ?? "没有唯一可用的 Runtime 候选。");
      authorization = this.authorizations.get(options[0]!.option_id);
    }
    if (!authorization || !authorization.option.enabled || authorization.scope.intent !== input.commandType
      || authorization.scope.context_id !== context || !sameDraftToken(authorization.option.expires_with_token, token)) stale();
    if (["UPDATE_ARCHITECTURE_CLASSIFICATION", "CREATE_ARCHITECTURE_LINK", "DELETE_ARCHITECTURE_LINK"].includes(input.commandType) && (payload.context_id !== context
      || authorization.option.command_type !== input.commandType || !("target_context_id" in authorization.option) || authorization.option.target_context_id !== context)) stale();
    delete payload.capability_query_id; delete payload.selected_option_id;
    // payload 来自已有编辑 union，只移除 V1 授权字段；具体领域合法性仍由 Runtime 的封闭 Schema 检查。
    const command = { command_type: input.commandType, payload } as Draft.DraftCommand;
    return this.delivery.submit(this.project, this.model, { operation: "EDIT", request: {
      request_id: draftRequestId(), command_id: draftRequestId("command"), expected_draft_token: token,
      scope: authorization.scope, authorization: { capability_query_id: authorization.option.capability_query_id, selected_option_id: authorization.option.option_id }, command,
    } });
  }

  save(token: Draft.DraftToken) { return this.delivery.submit(this.project, this.model, { operation: "SAVE", request: { save_id: draftRequestId("save"), target_draft_token: token, reason: "MANUAL" } }); }
  pin(token: Draft.DraftToken) { return this.delivery.submit(this.project, this.model, { operation: "PIN", request: { pin_id: draftRequestId("pin"), target_draft_token: token, purpose: "PERMALINK" } }); }
}

export function optionIsCurrent(option: WorkbenchCapabilityOption, token: Draft.DraftToken | null, revision: string): boolean {
  return token ? !!option.expires_with_token && sameDraftToken(option.expires_with_token, token) : option.expires_with_revision === revision;
}
export function draftRequestId(prefix = "request"): string { return `${prefix}.workbench.${randomUuid().replaceAll("-", "")}`; }
function query(token: Draft.DraftToken, context: string): Draft.DraftQueryRequest { return { request_id: draftRequestId(), draft_token: token, context_id: context }; }
function checkMeta(meta: Draft.DraftQueryMeta, request: Draft.DraftQueryRequest) {
  if (!meta || meta.request_id !== request.request_id || meta.context_id !== request.context_id || !validDraftToken(meta.draft_token) || !sameDraftToken(meta.draft_token, request.draft_token)) invalid();
}
function projectConstruct(value: Draft.ProjectionConstruct): ProjectionConstructWire {
  const endpoints = value.endpoints?.map(endpoint => {
    if (endpoint.target_kind !== "ELEMENT" && endpoint.target_kind !== "STATE" && endpoint.target_kind !== "FEATURE") invalid();
    return { ...endpoint, target_kind: endpoint.target_kind };
  });
  const modifiers = value.modifiers?.map(modifier => {
    if (typeof modifier.value !== "string") invalid();
    return { ...modifier, value: modifier.value };
  });
  return { ...value, endpoints, modifiers };
}
function projectSuppressed(value: Draft.SuppressedState): SuppressedStateWire {
  const kind = value.owner_ref.target_kind;
  if (kind !== "ELEMENT" && kind !== "FEATURE") invalid();
  return { ...value, owner_ref: { ...value.owner_ref, target_kind: kind } };
}
function cleanPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, cleanPayload(item)]));
  return value;
}
function stale(): never { throw new LocalRuntimeApiError("DRAFT_CONFLICT", "候选已过期，请重新选择当前草稿中的构造。"); }
function invalid(): never { throw new LocalRuntimeApiError("DRAFT_RESPONSE_INVALID", "草稿查询身份或可渲染内容不一致，未应用部分结果。"); }
