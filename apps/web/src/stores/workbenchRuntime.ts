import { createConstructEditing } from "./workbench/constructEditing";
import { createWorkbenchState } from "./workbench/workbenchState";
import { toContexts, toNode, toConsumption, toTextLines, operationHistoryCode, type RuntimeContext, type RuntimeTextLine } from "./workbench/projectionMapping";
import { isJavaBlank } from "./workbench/candidateRules";
import { message } from "./workbench/runtimeError";
import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { DraftWorkbenchSession, optionIsCurrent } from "@/shared/api/draftWorkbenchSession";
import { sameDraftToken, draftRawJson } from "@/shared/api/draftRequestIdentity";
import type { DraftToken, SaveState, DraftCommandType, OpenDraftResult, DraftFinding } from "@/shared/api/generated/draftWorkspaceContract";

import { createRelationEditing } from "./workbench/relationEditing";

import {
  LocalRuntimeApiError,
  localRuntimeApi,
  type FindingWire,
  type OperationRecordWire,
  type ProjectionConstructWire,
  type ReleaseVisualCommonFaultCommandWire,
  type RelationCatalogItemWire,
  type SuppressedStateWire,
} from "@/shared/api/localRuntimeApi";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import type { BottomTab } from "@/shared/types/modeling";

export type { RuntimeContext, RuntimeTextLine } from "./workbench/projectionMapping";
type RelationCatalogFamily = RelationCatalogItemWire["family"];

const relationCatalogFamilies: RelationCatalogFamily[] = ["PROCEDURAL", "CONTROL", "STRUCTURAL"];

export const useWorkbenchRuntimeStore = defineStore("workbench-runtime", () => {
  const projectId = ref("");
  const modelId = ref("");
  const projectName = ref("项目");
  const modelName = ref("模型");
  const profileLabel = ref("");
  const contexts = ref<RuntimeContext[]>([]);
  const textLines = ref<RuntimeTextLine[]>([]);
  const suppressedStates = ref<SuppressedStateWire[]>([]);
  const revisions = ref<Array<{ id: string; sequence: number; kind: string; createdAt: string }>>([]);
  const findings = ref<Array<FindingWire | DraftFinding>>([]);
  const operationRecords = ref<OperationRecordWire[]>([]);
  const selectedFindingId = ref("");
  const highlightedFindingTargetId = ref("");
  const releaseVisualCommonFaultCommand = ref<ReleaseVisualCommonFaultCommandWire | null>(null);
  const allowedCommands = ref<string[]>([]);
  const stateCreateOption = ref<WorkbenchCapabilityOption | null>(null);
  const elementNameOption = ref<WorkbenchCapabilityOption | null>(null);
  const relationCatalog = reactive({ open: true, loading: true, search: "", expandedFamilies: [...relationCatalogFamilies] as RelationCatalogFamily[], items: [] as RelationCatalogItemWire[] });
  const rightPanel = reactive({ open: false });
  let loadSequence = 0;
  let draftSession: DraftWorkbenchSession | null = null;
  const draftToken = ref<DraftToken | null>(null);
  const draftSaveState = ref<SaveState | null>(null);
  const saving = ref(false);
  const pendingDelivery = ref(false);
  const saveError = ref("");
  const manualCapture = ref<DraftToken | null>(null);
  const automaticCapture = ref<DraftToken | null>(null);
  let editInFlight: Promise<boolean> | null = null;
  let statusPolling = false;
  const editingIdentity = computed(() => draftToken.value ? draftRawJson(draftToken.value) : workbench.revision);
  const saveLabel = computed(() => {
    if (!draftToken.value) return workbench.autosaveState === "saved" ? "已保存" : "保存失败";
    if (workbench.resourceState !== "ready") return "草稿未就绪";
    if (workbench.commandState === "submitting") return "编辑待确认";
    if (pendingDelivery.value) return "存在待确认操作";
    if (saveError.value || draftSaveState.value?.last_error) return "保存失败";
    if (saving.value || (draftSaveState.value && draftSaveState.value.in_flight !== "NONE")) return "保存中";
    const state = draftSaveState.value;
    if (state?.dirty_since) return "草稿已保护 · 等待保存";
    if (manualCapture.value && sameDraftToken(manualCapture.value, draftToken.value)) return "已手动保存";
    if (automaticCapture.value && sameDraftToken(automaticCapture.value, draftToken.value)) return "已自动保存";
    return "草稿已保护";
  });
  function currentOption(option: WorkbenchCapabilityOption) { return optionIsCurrent(option, draftToken.value, workbench.revision); }
  async function queryCapabilities(project: string, model: string, context: string, revision: string, selection?: string, intent?: string, endpoints?: string[]) {
    const session = draftSession, token = draftToken.value;
    if (!session || !token) {
      const legacyIntent = intent as Parameters<typeof localRuntimeApi.commandCapabilities>[5];
      return endpoints === undefined ? localRuntimeApi.commandCapabilities(project, model, context, revision, selection, legacyIntent)
        : localRuntimeApi.commandCapabilities(project, model, context, revision, selection, legacyIntent, endpoints);
    }
    if (!intent) throw new LocalRuntimeApiError("INPUT_INVALID", "草稿候选必须带明确意图。");
    const result = await session.capabilities(token, context, selection, intent as DraftCommandType, endpoints);
    if (session !== draftSession || !draftToken.value || !sameDraftToken(token, draftToken.value) || context !== workbench.activeContextId) throw new LocalRuntimeApiError("DRAFT_CONFLICT", "草稿查询已过期。");
    return { data: { ...result.data, options: result.data.options as WorkbenchCapabilityOption[] } };
  }

  const workbench = createWorkbenchState();

  const isReadonly = computed(() => workbench.resourceState !== "ready" || workbench.accessMode === "readonly" || workbench.locationMode === "EXACT");
  const selectedNode = computed(() => workbench.nodes.find((node) => node.id === workbench.selectedId));
  const selectedRelation = computed(() => workbench.relations.find((relation) => relation.id === workbench.selectedId));
  const { relationCandidate, controlCandidate, structuralUpdateCandidate, activateRelationCatalogItem, armRelationCreation, cancelRelationCandidate, handleRelationGesture, resolveRelationCandidates, submitRelationCandidate, chooseRelationCandidate, rebuildRelationPreview, continueRelationEndpoints, confirmRelationCandidate, armControlUpdate, cancelControlCandidate, chooseControlCandidate, submitControlCandidate, confirmControlCandidate, armStructuralUpdate, cancelStructuralUpdate, submitStructuralUpdate } = createRelationEditing({ workbench, projectId, modelId, isReadonly, selectedRelation, allowedCommands, rightPanel, relationCatalog, editingIdentity, queryCapabilities, currentOption, execute, canEdit, block });

  const selectedObjectSuppressedStates = computed(() => {
    const selected = selectedNode.value;
    if (!selected || selected.kind !== "object") return [];
    return suppressedStates.value.filter((state) => state.owner_ref.target_kind === "ELEMENT" && state.owner_ref.target_id === selected.id);
  });
  const { constructActions, stateCandidate, stateEditor, armStateCreation, placeState, cancelStateCandidate, submitStateCandidate, saveSelectedState, changeStatePresentation, makeSuppressedStateExplicit, requestConstructActions, chooseConstructDelete, cancelConstructDelete } = createConstructEditing({ workbench, projectId, modelId, isReadonly, selectedNode, selectedObjectSuppressedStates, stateCreateOption, queryCapabilities, execute, block, getLoadSequence: () => loadSequence, isDraftSession: () => Boolean(draftSession) });

  const activeContext = computed(() => contexts.value.find((context) => context.id === workbench.activeContextId));
  const captureViewState = computed(() => {
    const selectedTargetId = selectedRelation.value?.id ?? selectedNode.value?.id ?? "";
    const selectionKind = selectedRelation.value ? "relation" : selectedNode.value ? "single-element" : "none";
    const bottomMode = !workbench.bottomPanelExpanded ? "" : workbench.bottomTab === "findings" ? "FINDINGS" : workbench.bottomTab === "history" ? "HISTORY" : "";
    const catalogOpen = relationCatalog.open;
    return {
      readRevision: workbench.revision,
      selectionKind,
      selectionTargetId: selectedTargetId,
      rightOpen: rightPanel.open,
      rightMode: !rightPanel.open ? "" : selectedRelation.value ? "inspector-relation-fields" : selectedNode.value ? "inspector-element-fields" : "",
      bottomOpen: Boolean(bottomMode),
      bottomMode,
      relationCandidateState: relationCandidate.phase === "candidate-preview" || controlCandidate.phase === "previewing" ? "preview" : "none",
      relationCandidateCapabilityId: relationCandidate.phase === "candidate-preview" ? relationCandidate.selectedOption?.capability_ref.capability_id ?? "" : controlCandidate.selectedOption?.capability_ref.capability_id ?? "",
      relationCandidateId: relationCandidate.phase === "candidate-preview" ? relationCandidate.candidateId : controlCandidate.previewSpec?.candidateId ?? "",
      relationCandidateSourceTargetId: relationCandidate.phase === "candidate-preview" ? relationCandidate.sourceId : "",
      relationCandidateTargetTargetId: relationCandidate.phase === "candidate-preview" ? relationCandidate.targetId : "",
      catalogOpen,
      catalogSearch: relationCatalog.search,
      catalogProceduralCount: catalogOpen ? relationCatalogItems("PROCEDURAL").length : 0,
      catalogControlCount: catalogOpen ? relationCatalogItems("CONTROL").length : 0,
      catalogStructuralCount: catalogOpen ? relationCatalogItems("STRUCTURAL").length : 0,
      findingSelectedId: selectedFindingId.value,
      findingHighlightedTargetId: highlightedFindingTargetId.value,
      feedbackCurrentCode: workbench.feedbackCode ?? "",
      historyCodes: workbench.bottomTab === "history" ? operationRecords.value.map(operationHistoryCode).filter((value): value is string => Boolean(value)) : [],
    };
  });

  function relationCatalogItems(family: RelationCatalogFamily): RelationCatalogItemWire[] {
    const search = relationCatalog.search.trim().toLowerCase();
    return relationCatalog.items.filter((item) => item.family === family
      && (!search || item.capability_id.toLowerCase().includes(search) || item.display_name.toLowerCase().includes(search)));
  }

  function isRelationCatalogExpanded(family: RelationCatalogFamily): boolean {
    return relationCatalog.expandedFamilies.includes(family);
  }

  function toggleRelationCatalogFamily(family: RelationCatalogFamily) {
    if (isRelationCatalogExpanded(family)) relationCatalog.expandedFamilies = relationCatalog.expandedFamilies.filter((item) => item !== family);
    else relationCatalog.expandedFamilies.push(family);
  }

  async function openRelationCatalog() {
    relationCatalog.open = true;
    await refreshRelationCatalog();
  }

  async function refreshRelationCatalog(selectionId = selectedRelation.value?.id) {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    relationCatalog.loading = true;
    try {
      const identity = editingIdentity.value;
      const sequence = loadSequence;
      const result = draftSession && draftToken.value
        ? await draftSession.catalog(draftToken.value, workbench.activeContextId, selectionId)
        : await localRuntimeApi.relationCatalog(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, selectionId);
      if (identity !== editingIdentity.value || sequence !== loadSequence) return;
      relationCatalog.items = result.data.items;
    } catch (error) {
      relationCatalog.items = [];
      workbench.commandFeedback = message(error);
    } finally {
      relationCatalog.loading = false;
    }
  }

  function closeRelationCatalog() {
    relationCatalog.open = false;
    relationCatalog.search = "";
    relationCatalog.expandedFamilies = [];
  }

  async function load(nextProjectId: string, nextModelId: string, requestedContext?: string, requestedRevision?: string, retainReady = false, refreshHead = false): Promise<boolean> {
    const sequence = ++loadSequence;
    const head = refreshHead || requestedRevision === undefined || requestedRevision === "head";
    saving.value = false;
    manualCapture.value = null; automaticCapture.value = null;
    projectId.value = nextProjectId;
    modelId.value = nextModelId;
    workbench.locationMode = head ? "HEAD" : "EXACT";
    if (!retainReady) workbench.accessMode = "readonly";
    if (!refreshHead) workbench.commandState = "idle";
    cancelRelationCandidate();
    cancelControlCandidate();
    cancelStateCandidate();
    cancelStructuralUpdate();
    cancelConstructDelete();
    if (!retainReady) workbench.resourceState = "loading";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    releaseVisualCommonFaultCommand.value = null;
    elementNameOption.value = null;
    try {
      if (head) {
        const candidateSession = new DraftWorkbenchSession(nextProjectId, nextModelId);
        let opened: OpenDraftResult | null = null;
        try { opened = await candidateSession.open(requestedContext ?? null); }
        catch (error) { if (!(error instanceof LocalRuntimeApiError) || error.code !== "DRAFT_MODE_REQUIRED") throw error; }
        if (sequence !== loadSequence) return false;
        if (opened) {
          let recoveryError = "";
          try { await candidateSession.recover(); }
          catch (error) { recoveryError = message(error); }
          if (sequence !== loadSequence) return false;
          opened = await candidateSession.open(requestedContext ?? null);
          const snapshot = await candidateSession.read(opened);
          if (sequence !== loadSequence) return false;
          draftSession = candidateSession; pendingDelivery.value = !!recoveryError; saveError.value = recoveryError;
          applyDraftSnapshot(snapshot); return true;
        }
      }
      draftSession = null; draftToken.value = null; draftSaveState.value = null; pendingDelivery.value = false; saveError.value = "";
      const session = await localRuntimeApi.workspaceSession(nextProjectId, nextModelId, requestedRevision, requestedContext);
      if (sequence !== loadSequence) return false;
      const revision = session.meta.read_revision;
      const contextId = session.data.current_context_id;
      if (!revision || !contextId) throw new LocalRuntimeApiError("WORKSPACE_INVALID", "工作台会话缺少当前修订或 Context。");
      if (requestedRevision !== undefined && requestedRevision !== "head" && revision !== requestedRevision) {
        throw new LocalRuntimeApiError("WORKSPACE_INVALID", "会话返回的修订与精确入口不一致。");
      }
      const [project, navigation, projection, capabilities, text, history, nextFindings, nextOperationRecords, releaseCommand, catalog] = await Promise.all([
        localRuntimeApi.getProject(nextProjectId),
        localRuntimeApi.navigation(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.projection(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.commandCapabilities(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.textProjection(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.revisions(nextProjectId, nextModelId),
        localRuntimeApi.findings(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.operationRecords(nextProjectId, nextModelId, contextId, revision),
        localRuntimeApi.releaseVisualCommonFaultCommand(nextProjectId, nextModelId, contextId, revision).catch((error: unknown) => {
          if (error instanceof LocalRuntimeApiError && error.code === "NOT_FOUND") return null;
          throw error;
        }),
        localRuntimeApi.relationCatalog(nextProjectId, nextModelId, contextId, revision),
      ]);
      if (sequence !== loadSequence) return false;
      if (projection.meta?.read_revision !== revision || projection.data.context_id !== contextId
        || [navigation, capabilities, text, nextFindings, nextOperationRecords, catalog].some((result) => result.meta && result.meta.read_revision !== revision)) {
        throw new LocalRuntimeApiError("WORKSPACE_INVALID", "工作台投影修订不一致。");
      }
      projectName.value = project.name;
      modelName.value = session.data.model.name;
      profileLabel.value = `${session.data.model.profile_id} ${session.data.model.profile_version}`;
      workbench.revision = revision;
      workbench.activeContextId = contextId;
      const editable = head && (refreshHead ? session.data.model.head_revision === revision : session.data.model.access_mode === "EDITABLE_DRAFT");
      workbench.locationMode = head && (editable || refreshHead) ? "HEAD" : "EXACT";
      workbench.accessMode = editable ? "editable" : "readonly";
      contexts.value = toContexts(navigation.data, contextId);
      applyProjection(projection.data.constructs);
      suppressedStates.value = projection.data.suppressed_states;
      allowedCommands.value = capabilities.data.allowed;
      textLines.value = toTextLines(text.data.sentences, text.data.traces);
      revisions.value = history.map((item) => ({ id: item.revision_id, sequence: item.sequence, kind: item.kind, createdAt: item.created_at }));
      findings.value = nextFindings.data;
      operationRecords.value = nextOperationRecords.data;
      selectedFindingId.value = "";
      highlightedFindingTargetId.value = "";
      rightPanel.open = false;
      releaseVisualCommonFaultCommand.value = releaseCommand?.data ?? null;
      relationCatalog.open = true;
      relationCatalog.loading = false;
      relationCatalog.search = "";
      relationCatalog.expandedFamilies = [...relationCatalogFamilies];
      relationCatalog.items = catalog.data.items;
      workbench.resourceState = "ready";
      workbench.commandState = "idle";
      workbench.lastAction = `已打开 ${activeContext.value?.label ?? contextId}`;
      if (requestedContext !== undefined && requestedContext !== contextId) workbench.commandFeedback = "指定 Context 不属于此版本，已打开该版本的根系统图。";
      const initialObject = workbench.nodes.find((node) => node.id === workbench.selectedId && node.kind === "object");
      if (initialObject) void refreshStateCreateOption(initialObject.id);
      return sequence === loadSequence;
    } catch (error) {
      if (sequence !== loadSequence) return false;
      workbench.resourceState = "error";
      workbench.commandState = "failed";
      workbench.accessMode = "readonly";
      workbench.revision = "";
      workbench.activeContextId = "";
      workbench.selectedId = "";
      workbench.nodes = [];
      workbench.relations = [];
      contexts.value = [];
      textLines.value = [];
      revisions.value = [];
      findings.value = [];
      operationRecords.value = [];
      allowedCommands.value = [];
      relationCatalog.items = [];
      workbench.commandFeedback = message(error);
      workbench.lastAction = "工作台读取失败";
      return false;
    }
  }

  async function selectContext(contextId: string) {
    if (!projectId.value || !modelId.value || !workbench.revision || contextId === workbench.activeContextId) return;
    cancelRelationCandidate();
    cancelControlCandidate();
    await load(projectId.value, modelId.value, contextId, workbench.locationMode === "EXACT" ? workbench.revision : undefined);
  }

  function applyDraftSnapshot(snapshot: Awaited<ReturnType<DraftWorkbenchSession["read"]>>) {
    projectName.value = snapshot.project.name; modelName.value = snapshot.model.name;
    profileLabel.value = `${snapshot.model.profile_id} ${snapshot.model.profile_version}`;
    draftToken.value = snapshot.opened.draft_token; draftSaveState.value = snapshot.opened.save_state;
    workbench.revision = [...snapshot.history].sort((a, b) => b.sequence - a.sequence)[0]?.revision_id ?? snapshot.model.head_revision ?? "";
    workbench.activeContextId = snapshot.opened.context_id;
    contexts.value = toContexts(snapshot.navigation, workbench.activeContextId);
    const selected = workbench.selectedId;
    applyProjection(snapshot.constructs);
    if ([...workbench.nodes, ...workbench.relations].some(item => item.id === selected)) workbench.selectedId = selected;
    suppressedStates.value = snapshot.suppressed;
    textLines.value = toTextLines(snapshot.text.sentences, snapshot.text.traces);
    findings.value = snapshot.findings.items;
    workbench.blockingFindings = snapshot.findings.validation_summary.blocking;
    operationRecords.value = []; releaseVisualCommonFaultCommand.value = null;
    revisions.value = snapshot.history.map(item => ({ id: item.revision_id, sequence: item.sequence, kind: item.kind, createdAt: item.created_at }));
    relationCatalog.items = snapshot.catalog; relationCatalog.loading = false;
    // 只开放已实现命令的入口，提交仍必须经过 Runtime 的 exact token 候选授权。
    allowedCommands.value = ["CREATE_ELEMENT", "CREATE_FEATURE", "CREATE_STATE", "CREATE_FACT", "UPDATE_PROPERTY", "UPDATE_LAYOUT", "UPDATE_STATE", "UPDATE_FACT", "DELETE_CONSTRUCT", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD"];
    workbench.resourceState = "ready"; workbench.accessMode = pendingDelivery.value ? "readonly" : "editable";
    workbench.locationMode = "HEAD"; workbench.commandState = "idle";
    workbench.commandFeedback = saveError.value; workbench.lastAction = `活动草稿 · 编辑 ${draftToken.value.edit_seq}`;
    workbench.validationState = "stale"; stateCreateOption.value = null; elementNameOption.value = null;
    if (selectedNode.value && ["object", "attribute", "operation"].includes(selectedNode.value.kind) && !isReadonly.value) void refreshStateCreateOption(selectedNode.value.id);
  }

  async function retryDraftDelivery() {
    if (draftSession) await load(projectId.value, modelId.value, workbench.activeContextId);
  }

  function leaveWorkbench() {
    loadSequence++;
    draftSession = null; draftToken.value = null; draftSaveState.value = null;
    saving.value = false; workbench.accessMode = "readonly";
  }

  async function pollDraftState() {
    if (!draftSession || !draftToken.value || statusPolling || workbench.resourceState !== "ready" || editInFlight) return;
    statusPolling = true;
    const session = draftSession, sequence = loadSequence, token = draftToken.value;
    try {
      const opened = await session.open(workbench.activeContextId);
      if (sequence !== loadSequence || session !== draftSession || editInFlight || !draftToken.value || !sameDraftToken(token, draftToken.value)) return;
      if (!sameDraftToken(opened.draft_token, token)) {
        workbench.accessMode = "readonly"; saveError.value = "草稿已在其他页面更新，请重新加载。";
        workbench.commandFeedback = saveError.value; return;
      }
      if (draftSaveState.value?.dirty_since && opened.save_state.dirty_since === null && opened.save_state.checkpoint_token
        && !saving.value && !pendingDelivery.value) automaticCapture.value = opened.save_state.checkpoint_token;
      draftSaveState.value = opened.save_state;
    } catch (error) { if (sequence === loadSequence) saveError.value = message(error); }
    finally { statusPolling = false; }
  }

  async function saveDraft(pin = false): Promise<string | null> {
    if (!draftSession || saving.value || workbench.locationMode !== "HEAD") return null;
    const session = draftSession, sequence = loadSequence;
    const pendingEdit = editInFlight;
    if (pendingEdit && !await pendingEdit) return null;
    if (sequence !== loadSequence || session !== draftSession || isReadonly.value || saving.value || !draftToken.value) return null;
    if (stateCandidate.phase !== "idle" || controlCandidate.phase !== "idle" || structuralUpdateCandidate.phase !== "idle"
      || !["idle", "relation-armed"].includes(relationCandidate.phase)) { block("请先完成或取消当前候选，再保存。"); return null; }
    const captured = { ...draftToken.value };
    saving.value = true; saveError.value = "";
    try {
      const result = pin ? await session.pin(captured) : await session.save(captured);
      if (sequence !== loadSequence || session !== draftSession) return null;
      if (!pin) manualCapture.value = captured;
      const history = await localRuntimeApi.revisions(session.project, session.model);
      if (sequence !== loadSequence || session !== draftSession) return null;
      revisions.value = history.map(item => ({ id: item.revision_id, sequence: item.sequence, kind: item.kind, createdAt: item.created_at }));
      workbench.revision = [...history].sort((a, b) => b.sequence - a.sequence)[0]?.revision_id ?? result.revision_id;
      await pollDraftState(); return result.revision_id;
    } catch (error) {
      if (sequence === loadSequence) {
        saveError.value = message(error); workbench.commandFeedback = saveError.value;
        let pending = true;
        try { pending = (await session.pending()).length > 0; } catch { /* 无法读取队列时保守保留待确认状态。 */ }
        if (sequence === loadSequence && session === draftSession) pendingDelivery.value = pending;
      }
      return null;
    } finally { if (session === draftSession) saving.value = false; }
  }

  async function selectConstruct(id: string) {
    if (!workbench.nodes.some((node) => node.id === id) && !workbench.relations.some((relation) => relation.id === id)) return;
    workbench.selectedId = id;
    const node = workbench.nodes.find((item) => item.id === id);
    if (node?.kind === "object" || node?.kind === "attribute" || node?.kind === "operation") await refreshStateCreateOption(node.id);
    else stateCreateOption.value = null;
    if (node?.kind === "state") {
      stateEditor.name = node.label;
      stateEditor.roles = [...(node.stateRoles ?? [])];
    }
    await refreshRelationCatalog(workbench.relations.some((relation) => relation.id === id) ? id : undefined);
  }

  function setBottomTab(tab: BottomTab) {
    workbench.bottomTab = tab;
    workbench.bottomPanelExpanded = true;
  }

  function openRightPanel() {
    if (!workbench.selectedId) return;
    rightPanel.open = true;
  }

  function closeRightPanel() {
    rightPanel.open = false;
  }

  function setViewportZoom(nextZoom: number) {
    workbench.zoom = Math.max(25, Math.min(400, nextZoom));
  }

  async function addElement(kind: "OBJECT" | "PROCESS") {
    if (!canEdit("CREATE_ELEMENT")) return;
    const nodeKind = kind === "OBJECT" ? "object" : "process";
    const ordinal = workbench.nodes.filter((node) => node.kind === nodeKind).length + 1;
    const x = kind === "OBJECT" ? 80 : 420;
    const y = 80 + ordinal * 96;
    await execute({ commandType: "CREATE_ELEMENT", payload: { kind, name: `${kind === "OBJECT" ? "Object" : "Process"} ${ordinal}`, layout: { x, y } } });
  }

  async function addFeature(kind: "ATTRIBUTE" | "OPERATION") {
    const owner = selectedNode.value;
    if (!owner || (owner.kind !== "object" && owner.kind !== "process")) return block("请先选择一个 Object 或 Process，再创建 Feature。");
    if (isReadonly.value) return block("当前修订为只读版本，不能创建 Feature。");
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const capabilities = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, owner.id, "CREATE_FEATURE");
      const option = capabilities.data.options.find((item) => item.command_type === "CREATE_FEATURE" && item.enabled && item.required_fields.some((field) => field.field_id === "feature_kind" && field.allowed_values?.includes(kind)));
      if (!option) return block("当前 Profile 不支持创建该 Feature。");
      const ordinal = workbench.nodes.filter((node) => node.kind === (kind === "ATTRIBUTE" ? "attribute" : "operation")).length + 1;
      await execute({ commandType: "CREATE_FEATURE", payload: {
        context_id: workbench.activeContextId,
        owner_element_id: owner.id,
        feature_kind: kind,
        capability_ref: option.capability_ref,
        name: `${kind === "ATTRIBUTE" ? "Attribute" : "Operation"} ${ordinal}`,
        occurrence: { ownership: "OWNED", construct_role: kind === "ATTRIBUTE" ? "ATTRIBUTE_NODE" : "OPERATION_NODE" },
        layout: { x: owner.x + 210, y: owner.y + ordinal * 52 },
        capability_query_id: option.capability_query_id,
        selected_option_id: option.option_id,
      } });
    } catch (error) {
      workbench.commandFeedback = message(error);
    }
  }

  async function addConsumption() {
    if (!canEdit("CREATE_FACT")) return;
    const selectedState = selectedNode.value?.kind === "state" ? selectedNode.value : undefined;
    const object = selectedState ? workbench.nodes.find((node) => node.id === selectedState.ownerId) : selectedNode.value?.kind === "object" ? selectedNode.value : workbench.nodes.find((node) => node.kind === "object");
    const process = selectedNode.value?.kind === "process" ? selectedNode.value : workbench.nodes.find((node) => node.kind === "process");
    if (!object || !process) {
      block("请先创建一个 Object 和一个 Process，再创建 Consumption。");
      return;
    }
    await execute({ commandType: "CREATE_FACT", payload: { kind: "CONSUMPTION", object_id: object.id, state_id: selectedState?.id, process_id: process.id, layout: { x: (object.x + process.x) / 2, y: (object.y + process.y) / 2 } } });
  }

  async function moveElement(occurrenceId: string, x: number, y: number) {
    const node = workbench.nodes.find((item) => item.occurrenceId === occurrenceId);
    if (!node || node.occurrenceRole !== "owned") return;
    const accepted = canEdit("UPDATE_LAYOUT") && await execute({ commandType: "UPDATE_LAYOUT", payload: { occurrence_id: occurrenceId, layout: { x, y } } });
    // 失败时重新投影已持久化坐标，连同本地跟随的状态一起恢复。
    if (!accepted) workbench.nodes = workbench.nodes.map((item) => ({ ...item }));
  }

  async function beginElementNameEdit(elementId: string): Promise<boolean> {
    const node = workbench.nodes.find((item) => item.id === elementId);
    elementNameOption.value = null;
    if (!node || (node.kind !== "object" && node.kind !== "process")) return false;
    if (isReadonly.value) {
      block("当前修订为只读版本，不能编辑名称。");
      return false;
    }
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return false;
    try {
      const capabilities = await queryCapabilities(
        projectId.value, modelId.value, workbench.activeContextId, workbench.revision, elementId, "UPDATE_PROPERTY",
      );
      const option = capabilities.data.options.find((item) => item.command_type === "UPDATE_PROPERTY");
      if (!capabilities.data.allowed.includes("UPDATE_PROPERTY") || !option?.enabled) {
        const reason = option?.reason_codes[0]
          ?? capabilities.data.forbidden.find((item) => item.command_type === "UPDATE_PROPERTY")?.reason_code
          ?? "PROFILE_CAPABILITY_DISABLED";
        block(`当前名称不可编辑：${reason}。`);
        return false;
      }
      elementNameOption.value = option;
      workbench.selectedId = elementId;
      return true;
    } catch (error) {
      workbench.commandState = "failed";
      workbench.commandFeedback = message(error);
      workbench.feedbackCode = error instanceof LocalRuntimeApiError ? error.code : null;
      return false;
    }
  }

  async function renameElement(elementId: string, value: string): Promise<boolean> {
    const node = workbench.nodes.find((item) => item.id === elementId);
    if (!node || (node.kind !== "object" && node.kind !== "process")) return false;
    if (value === node.label) return true;
    if (isJavaBlank(value) || [...value].length > 256) {
      workbench.feedbackCode = "INVALID_ARGUMENT";
      block("Element 名称必须为非空白且不超过 256 个 Unicode code point。");
      return false;
    }
    let option = elementNameOption.value;
    const optionTarget = option?.normalized_endpoints.find((endpoint) => endpoint.role === "PROPERTY_TARGET")?.target_ref.target_id;
    if (!option || optionTarget !== elementId || !currentOption(option)) {
      if (!await beginElementNameEdit(elementId)) return false;
      option = elementNameOption.value;
    }
    if (!option) return false;
    const succeeded = await execute({ commandType: "UPDATE_PROPERTY", payload: {
      target_ref: { target_kind: "ELEMENT", target_id: elementId },
      property_name: "name",
      value,
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (succeeded) elementNameOption.value = null;
    return succeeded;
  }

  async function runValidation() {
    if (draftSession) { workbench.commandFeedback = "当前显示草稿核心校验（INCOMPLETE）；完整规则校验尚未接入。"; return; }
    if (!projectId.value || !modelId.value || !workbench.revision) return;
    workbench.validationState = "running";
    workbench.validationProgress = 0;
    try {
      const result = await localRuntimeApi.validate(projectId.value, modelId.value, workbench.revision);
      workbench.validationState = result.data.state === "FAILED" ? "failed" : "current";
      workbench.validationProgress = result.data.progress ?? 100;
      workbench.lastAction = `校验任务 ${result.data.task_id} 已${result.data.state === "FAILED" ? "失败" : "完成"}`;
    } catch (error) {
      workbench.validationState = "failed";
      workbench.commandFeedback = message(error);
    }
  }

  function locateText(line: RuntimeTextLine) {
    const relation = workbench.relations.find((item) => line.factIds.includes(item.id));
    if (relation) selectConstruct(relation.id);
  }

  function selectFinding(findingId: string) {
    if (!findings.value.some((finding) => finding.finding_id === findingId)) return;
    selectedFindingId.value = findingId;
    workbench.lastAction = `已选择 Finding ${findingId}`;
  }

  async function locateFinding() {
    const finding = findings.value.find((item) => item.finding_id === selectedFindingId.value);
    if (!finding) return block("请先选择 Finding。");
    if (!workbench.nodes.some((node) => node.id === finding.entity_id) && !workbench.relations.some((relation) => relation.id === finding.entity_id)) {
      return block("Finding 引用的构造不在当前 Context。");
    }
    highlightedFindingTargetId.value = finding.entity_id;
    workbench.lastAction = `已定位 Finding ${finding.finding_id}`;
  }

  async function submitReleaseVisualCommonFaultCommand() {
    if (isReadonly.value || workbench.commandState === "submitting") return;
    const command = releaseVisualCommonFaultCommand.value;
    if (!command || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    workbench.commandState = "submitting";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    const sequence = loadSequence;
    try {
      const result = await localRuntimeApi.executeReleaseVisualCommonFaultCommand(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, command);
      if (sequence !== loadSequence) return;
      if (!result.meta.committed_revision) throw new LocalRuntimeApiError("COMMAND_NOT_COMMITTED", "命令未返回已提交修订。", true);
      workbench.autosaveState = "saved";
      workbench.validationState = "stale";
      await load(
        projectId.value,
        modelId.value,
        workbench.activeContextId,
        result.meta.committed_revision,
        "commandType" in command && command.commandType === "UPDATE_LAYOUT",
        true,
      );
    } catch (error) {
      if (sequence !== loadSequence) return;
      const apiError = error instanceof LocalRuntimeApiError ? error : undefined;
      workbench.commandState = apiError?.code === "REVISION_CONFLICT" || apiError?.code === "VALIDATION_BLOCKED" ? "blocked" : "failed";
      workbench.autosaveState = apiError?.retryable ? "save-failed" : "saved";
      workbench.feedbackCode = apiError?.code ?? null;
      workbench.commandFeedback = message(error);
    }
  }

  function unavailable(reason: string) {
    block(reason);
  }

  function execute(command: Parameters<typeof localRuntimeApi.executeP0Command>[4]): Promise<boolean> {
    if (editInFlight) return Promise.resolve(false);
    const promise = executeCommand(command);
    editInFlight = promise;
    void promise.finally(() => { if (editInFlight === promise) editInFlight = null; });
    return promise;
  }

  async function executeCommand(command: Parameters<typeof localRuntimeApi.executeP0Command>[4]): Promise<boolean> {
    if (isReadonly.value || workbench.commandState === "submitting") return false;
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return false;
    workbench.commandState = "submitting";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    const sequence = loadSequence;
    try {
      if (draftSession && draftToken.value) {
        const session = draftSession;
        const result = await session.edit(draftToken.value, workbench.activeContextId, command);
        if (sequence !== loadSequence || session !== draftSession) return false;
        const opened = await session.open(workbench.activeContextId);
        if (!sameDraftToken(opened.draft_token, result.result_token)) throw new LocalRuntimeApiError("DRAFT_CONFLICT", "草稿已被其他页面推进，请重新加载。");
        const snapshot = await session.read(opened);
        if (sequence !== loadSequence || session !== draftSession) return false;
        applyDraftSnapshot(snapshot); return true;
      }
      const result = await localRuntimeApi.executeP0Command(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, command);
      if (sequence !== loadSequence) return false;
      if (!result.meta.committed_revision) throw new LocalRuntimeApiError("COMMAND_NOT_COMMITTED", "命令未返回已提交修订。", true);
      workbench.autosaveState = "saved";
      workbench.validationState = "stale";
      return await load(projectId.value, modelId.value, workbench.activeContextId, result.meta.committed_revision, command.commandType === "UPDATE_LAYOUT", true);
    } catch (error) {
      if (sequence !== loadSequence) return false;
      const apiError = error instanceof LocalRuntimeApiError ? error : undefined;
      workbench.commandState = apiError?.code === "REVISION_CONFLICT" || apiError?.code === "VALIDATION_BLOCKED" ? "blocked" : "failed";
      workbench.autosaveState = apiError?.retryable ? "save-failed" : "saved";
      workbench.feedbackCode = apiError?.code ?? null;
      workbench.commandFeedback = message(error);
      if (draftSession) {
        const session = draftSession;
        let pending = true;
        try { pending = (await session.pending()).length > 0; } catch { /* 无法读取队列时保守保留待确认状态。 */ }
        if (sequence !== loadSequence || session !== draftSession) return false;
        pendingDelivery.value = pending;
        if (pendingDelivery.value || apiError?.code === "DRAFT_CONFLICT") workbench.accessMode = "readonly";
      }
      return false;
    }
  }

  function canEdit(command: string) {
    if (isReadonly.value) {
      block("当前修订为只读版本，不能提交语义命令。");
      return false;
    }
    if (!allowedCommands.value.includes(command)) {
      block(`当前 Profile 不允许 ${command}。`);
      return false;
    }
    return true;
  }

  function block(text: string) {
    workbench.commandState = "blocked";
    workbench.commandFeedback = text;
  }

  function applyProjection(constructs: ProjectionConstructWire[]) {
    const nodes = constructs.filter((item) => item.construct_role === "OBJECT_NODE" || item.construct_role === "PROCESS_NODE" || item.construct_role === "ATTRIBUTE_NODE" || item.construct_role === "OPERATION_NODE" || item.construct_role === "STATE_NODE" || item.construct_role === "FEATURE_STATE_NODE").map(toNode);
    workbench.nodes = nodes;
    workbench.relations = constructs.filter((item) => item.construct_role === "CONSUMPTION_LINK" || item.construct_role === "PROCEDURAL_LINK" || item.construct_role === "STRUCTURAL_LINK").flatMap((item) => toConsumption(item, nodes));
    workbench.selectedId = nodes[0]?.id ?? workbench.relations[0]?.id ?? "";
  }

  async function refreshStateCreateOption(selectionId: string) {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    const sequence = loadSequence;
    const identity = editingIdentity.value;
    try {
      const capabilities = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, selectionId, "CREATE_STATE");
      if (sequence !== loadSequence || identity !== editingIdentity.value || selectionId !== workbench.selectedId) return;
      stateCreateOption.value = capabilities.data.options.find((option) => option.command_type === "CREATE_STATE") ?? null;
    } catch (error) {
      if (sequence !== loadSequence || identity !== editingIdentity.value || selectionId !== workbench.selectedId) return;
      stateCreateOption.value = null;
      workbench.commandFeedback = message(error);
    }
  }

  return { leaveWorkbench, draftToken, draftSaveState, saving, pendingDelivery, saveError, saveLabel, editingIdentity, saveDraft, retryDraftDelivery, pollDraftState, projectId, modelId, projectName, modelName, profileLabel, contexts, textLines, revisions, findings, operationRecords, selectedFindingId, highlightedFindingTargetId, releaseVisualCommonFaultCommand, workbench, isReadonly, selectedNode, selectedRelation, selectedObjectSuppressedStates, stateCreateOption, constructActions, stateCandidate, stateEditor, relationCandidate, relationCatalog, relationCatalogFamilies, rightPanel, controlCandidate, structuralUpdateCandidate, captureViewState, load, selectContext, selectConstruct, setBottomTab, openRightPanel, closeRightPanel, setViewportZoom, addElement, addFeature, addConsumption, moveElement, beginElementNameEdit, renameElement, openRelationCatalog, closeRelationCatalog, relationCatalogItems, isRelationCatalogExpanded, toggleRelationCatalogFamily, activateRelationCatalogItem, armRelationCreation, handleRelationGesture, cancelRelationCandidate, resolveRelationCandidates, submitRelationCandidate, chooseRelationCandidate, rebuildRelationPreview, continueRelationEndpoints, confirmRelationCandidate, armControlUpdate, cancelControlCandidate, chooseControlCandidate, submitControlCandidate, confirmControlCandidate, armStructuralUpdate, cancelStructuralUpdate, submitStructuralUpdate, armStateCreation, placeState, cancelStateCandidate, submitStateCandidate, saveSelectedState, changeStatePresentation, makeSuppressedStateExplicit, requestConstructActions, chooseConstructDelete, cancelConstructDelete, runValidation, locateText, selectFinding, locateFinding, submitReleaseVisualCommonFaultCommand, unavailable };
});
