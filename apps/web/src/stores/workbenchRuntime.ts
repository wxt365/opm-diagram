import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";

import {
  LocalRuntimeApiError,
  localRuntimeApi,
  type FindingWire,
  type NavigationNodeWire,
  type OperationRecordWire,
  type ProjectionConstructWire,
  type ReleaseVisualCommonFaultCommandWire,
  type RelationCatalogItemWire,
  type SuppressedStateWire,
} from "@/shared/api/localRuntimeApi";
import type { ApiEdtCommandCapabilityOption, ApiEdtStateRole } from "@/shared/api/generated/apiEdtContract";
import type { BottomTab, ConsumptionRelation, OpdNode, ResourceState } from "@/shared/types/modeling";

export interface RuntimeContext {
  id: string;
  label: string;
  kind: string;
}

export interface RuntimeTextLine {
  id: string;
  text: string;
  factIds: string[];
  occurrenceIds: string[];
}

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
  const findings = ref<FindingWire[]>([]);
  const operationRecords = ref<OperationRecordWire[]>([]);
  const selectedFindingId = ref("");
  const highlightedFindingTargetId = ref("");
  const releaseVisualCommonFaultCommand = ref<ReleaseVisualCommonFaultCommandWire | null>(null);
  const allowedCommands = ref<string[]>([]);
  const stateCreateOption = ref<ApiEdtCommandCapabilityOption | null>(null);
  const stateDeleteOption = ref<ApiEdtCommandCapabilityOption | null>(null);
  const factDeleteOption = ref<ApiEdtCommandCapabilityOption | null>(null);
  const stateCandidate = reactive({ phase: "idle" as "idle" | "placing" | "editing", ownerId: "", name: "", roles: ["INITIAL"] as ApiEdtStateRole[], x: 0, y: 0 });
  const stateEditor = reactive({ name: "", roles: [] as ApiEdtStateRole[] });
  const relationCandidate = reactive({ phase: "idle" as "idle" | "selecting-target" | "choosing" | "previewing", sourceId: "", targetId: "", endpointIds: [] as string[], options: [] as ApiEdtCommandCapabilityOption[], selectedOption: null as ApiEdtCommandCapabilityOption | null, candidateId: "", duration: "PT5M", labels: {} as Record<string, string>, collectionCompleteness: "" as "" | "COMPLETE" | "INCOMPLETE", direction: "DIRECTED" as "DIRECTED" | "BIDIRECTIONAL" });
  const relationCatalog = reactive({ open: false, loading: false, search: "", expandedFamilies: [] as RelationCatalogFamily[], items: [] as RelationCatalogItemWire[] });
  const rightPanel = reactive({ open: false });
  const controlCandidate = reactive({ phase: "idle" as "idle" | "choosing", factId: "", options: [] as ApiEdtCommandCapabilityOption[] });
  const structuralUpdateCandidate = reactive({ phase: "idle" as "idle" | "editing", factId: "", option: null as ApiEdtCommandCapabilityOption | null, labels: {} as Record<string, string>, collectionCompleteness: "" as "" | "COMPLETE" | "INCOMPLETE", direction: "DIRECTED" as "DIRECTED" | "BIDIRECTIONAL" });
  let loadSequence = 0;

  const workbench = reactive({
    resourceState: "loading" as ResourceState,
    revision: "",
    activeContextId: "",
    selectedId: "",
    nodes: [] as OpdNode[],
    relations: [] as ConsumptionRelation[],
    zoom: 100,
    bottomTab: "text" as BottomTab,
    validationState: "stale" as "current" | "running" | "stale" | "failed",
    validationProgress: 0,
    blockingFindings: 0,
    commandState: "idle" as "idle" | "submitting" | "blocked" | "failed",
    commandFeedback: "",
    feedbackCode: null as string | null,
    autosaveState: "saved" as "saved" | "save-failed",
    lastAction: "正在打开工作台",
    accessMode: "editable" as "editable" | "readonly",
  });

  const isReadonly = computed(() => workbench.accessMode === "readonly");
  const selectedNode = computed(() => workbench.nodes.find((node) => node.id === workbench.selectedId));
  const selectedRelation = computed(() => workbench.relations.find((relation) => relation.id === workbench.selectedId));
  const selectedObjectSuppressedStates = computed(() => {
    const selected = selectedNode.value;
    if (!selected || selected.kind !== "object") return [];
    return suppressedStates.value.filter((state) => state.owner_ref.target_kind === "ELEMENT" && state.owner_ref.target_id === selected.id);
  });
  const activeContext = computed(() => contexts.value.find((context) => context.id === workbench.activeContextId));
  const captureViewState = computed(() => {
    const selectedTargetId = selectedRelation.value?.id ?? selectedNode.value?.id ?? "";
    const selectionKind = selectedRelation.value ? "relation" : selectedNode.value ? "single-element" : "none";
    const bottomMode = workbench.bottomTab === "findings" ? "FINDINGS" : workbench.bottomTab === "history" ? "HISTORY" : "";
    const catalogOpen = relationCatalog.open;
    return {
      readRevision: workbench.revision,
      selectionKind,
      selectionTargetId: selectedTargetId,
      rightOpen: rightPanel.open,
      rightMode: !rightPanel.open ? "" : selectedRelation.value ? "inspector-relation-fields" : selectedNode.value ? "inspector-element-fields" : "",
      bottomOpen: Boolean(bottomMode),
      bottomMode,
      relationCandidateState: relationCandidate.phase === "previewing" ? "preview" : "none",
      relationCandidateCapabilityId: relationCandidate.phase === "previewing" ? relationCandidate.selectedOption?.capability_ref.capability_id ?? "" : "",
      relationCandidateId: relationCandidate.phase === "previewing" ? relationCandidate.candidateId : "",
      relationCandidateSourceTargetId: relationCandidate.phase === "previewing" ? relationCandidate.sourceId : "",
      relationCandidateTargetTargetId: relationCandidate.phase === "previewing" ? relationCandidate.targetId : "",
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
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    relationCatalog.loading = true;
    relationCatalog.open = true;
    relationCatalog.search = "";
    relationCatalog.expandedFamilies = [];
    workbench.selectedId = "";
    try {
      const result = await localRuntimeApi.relationCatalog(projectId.value, modelId.value, workbench.activeContextId, workbench.revision);
      relationCatalog.items = result.data.items;
      workbench.lastAction = "已打开 Runtime 关系目录。";
    } catch (error) {
      relationCatalog.open = false;
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

  async function load(nextProjectId: string, nextModelId: string, requestedContext?: string, requestedRevision?: string) {
    const sequence = ++loadSequence;
    projectId.value = nextProjectId;
    modelId.value = nextModelId;
    workbench.resourceState = "loading";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    releaseVisualCommonFaultCommand.value = null;
    try {
      const session = await localRuntimeApi.workspaceSession(nextProjectId, nextModelId);
      const revision = requestedRevision ?? session.meta.read_revision;
      const contextId = requestedContext ?? session.data.current_context_id;
      if (!revision || !contextId) throw new LocalRuntimeApiError("WORKSPACE_INVALID", "工作台会话缺少当前修订或 Context。");
      const [project, navigation, projection, capabilities, text, history, nextFindings, nextOperationRecords, releaseCommand] = await Promise.all([
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
      ]);
      if (sequence !== loadSequence) return;
      projectName.value = project.name;
      modelName.value = session.data.model.name;
      profileLabel.value = `${session.data.model.profile_id} ${session.data.model.profile_version}`;
      workbench.revision = revision;
      workbench.activeContextId = contextId;
      workbench.accessMode = session.data.model.access_mode === "EDITABLE_DRAFT" ? "editable" : "readonly";
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
      workbench.resourceState = "ready";
      workbench.lastAction = `已打开 ${activeContext.value?.label ?? contextId}`;
      const initialObject = workbench.nodes.find((node) => node.id === workbench.selectedId && node.kind === "object");
      if (initialObject) await refreshStateCreateOption(initialObject.id);
    } catch (error) {
      if (sequence !== loadSequence) return;
      workbench.resourceState = "error";
      workbench.commandFeedback = message(error);
      workbench.lastAction = "工作台读取失败";
    }
  }

  async function selectContext(contextId: string) {
    if (!projectId.value || !modelId.value || !workbench.revision || contextId === workbench.activeContextId) return;
    await load(projectId.value, modelId.value, contextId, workbench.revision);
  }

  async function selectConstruct(id: string) {
    if (!workbench.nodes.some((node) => node.id === id) && !workbench.relations.some((relation) => relation.id === id)) return;
    if (relationCandidate.phase === "selecting-target" && workbench.nodes.some((node) => node.id === id)) {
      selectRelationEndpoint(id);
      return;
    }
    workbench.selectedId = id;
    const node = workbench.nodes.find((item) => item.id === id);
    if (node?.kind === "object" || node?.kind === "attribute" || node?.kind === "operation") await refreshStateCreateOption(node.id);
    else stateCreateOption.value = null;
    if (node?.kind === "state") {
      stateEditor.name = node.label;
      stateEditor.roles = [...(node.stateRoles ?? [])];
      await refreshStateDeleteOption(node.id);
    } else {
      stateDeleteOption.value = null;
    }
    const relation = workbench.relations.find((item) => item.id === id);
    if (relation) await refreshFactDeleteOption(relation.id);
    else factDeleteOption.value = null;
  }

  function setBottomTab(tab: BottomTab) {
    workbench.bottomTab = tab;
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
      const capabilities = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, owner.id, "CREATE_FEATURE");
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

  function armRelationCreation() {
    const source = selectedNode.value;
    if (isReadonly.value) return block("当前修订为只读版本，不能创建关系。");
    relationCandidate.phase = "selecting-target";
    relationCandidate.sourceId = source?.id ?? "";
    relationCandidate.targetId = "";
    relationCandidate.endpointIds = source ? [source.id] : [];
    relationCandidate.options = [];
    relationCandidate.selectedOption = null;
    relationCandidate.candidateId = "";
    relationCandidate.labels = {};
    relationCandidate.collectionCompleteness = "";
    relationCandidate.direction = "DIRECTED";
    relationCandidate.duration = "PT5M";
    workbench.lastAction = "请选择关系端点；完成后查看可用关系。";
  }

  function cancelRelationCandidate() {
    relationCandidate.phase = "idle";
    relationCandidate.sourceId = "";
    relationCandidate.targetId = "";
    relationCandidate.endpointIds = [];
    relationCandidate.options = [];
    relationCandidate.selectedOption = null;
    relationCandidate.candidateId = "";
    relationCandidate.labels = {};
    relationCandidate.collectionCompleteness = "";
  }

  function selectRelationEndpoint(id: string) {
    if (relationCandidate.endpointIds.length >= 16) return block("当前候选最多支持 16 个端点，请先查看可用关系。");
    if (relationCandidate.endpointIds.length > 1 && relationCandidate.endpointIds.includes(id)) return block("除 Self-invocation 外，不能重复选择同一端点。");
    relationCandidate.endpointIds.push(id);
    relationCandidate.targetId = id;
    workbench.lastAction = `已选择 ${relationCandidate.endpointIds.length} 个端点；可继续选择，或查看可用关系。`;
  }

  async function resolveRelationCandidates() {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId || relationCandidate.endpointIds.length < 2) return;
    try {
      const result = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, undefined, "CREATE_FACT", relationCandidate.endpointIds);
      relationCandidate.options = result.data.options.filter((option) => option.command_type === "CREATE_FACT" && option.enabled);
      relationCandidate.phase = "choosing";
      if (!relationCandidate.options.length) block("所选端点没有可提交的过程关系。");
      else workbench.lastAction = "请选择要创建的过程关系。";
    } catch (error) {
      cancelRelationCandidate();
      workbench.commandFeedback = message(error);
    }
  }

  async function submitRelationCandidate(option: ApiEdtCommandCapabilityOption) {
    if ((relationCandidate.phase !== "choosing" && relationCandidate.phase !== "previewing") || !canEdit("CREATE_FACT")) return;
    const durationRequired = option.required_fields.some((field) => field.field_id === "duration" && field.required);
    if (durationRequired && !relationCandidate.duration.trim()) return block("该 Exception Link 必须填写 duration。");
    const family = relationFactFamily(option.capability_ref.capability_id);
    if (!family) return block("当前 Capability 没有可提交的 Fact family。");
    const structural = option.capability_ref.capability_id.startsWith("CAP-ISO-STRUCT-");
    const labels = Object.entries(relationCandidate.labels)
      .filter(([, text]) => text.trim())
      .map(([slot_id, text]) => ({ slot_id, text: text.trim() }));
    const direction = relationDirection(option, relationCandidate.direction);
    if (!direction) return block("Runtime 结构关系候选缺少方向约束。");
    const requiredLabelSlots = requiredStructuralLabelSlots(option, direction);
    if (structural && option.required_fields.some((field) => field.field_id === "labels" && field.required)
      && requiredLabelSlots.some((slot) => !labels.some((label) => label.slot_id === slot))) {
      return block("请填写所有必填关系标签。");
    }
    if (structural && option.required_fields.some((field) => field.field_id === "collection_completeness") && !relationCandidate.collectionCompleteness) {
      return block("请选择 fan 的完整性。");
    }
    await execute({ commandType: "CREATE_FACT", payload: {
      context_id: workbench.activeContextId,
      capability_ref: { capability_id: option.capability_ref.capability_id },
      fact_family: family,
      normalized_endpoints: option.normalized_endpoints.map((endpoint) => ({ role: endpoint.role, target_ref: { target_kind: endpoint.target_ref.target_kind as "ELEMENT" | "STATE", target_id: endpoint.target_ref.target_id }, ordinal: endpoint.ordinal })),
      direction,
      labels,
      modifiers: durationRequired ? [{ modifier_id: "duration", value: relationCandidate.duration.trim() }] : [],
      logical_groups: [],
      ...(structural ? { collection_completeness: relationCandidate.collectionCompleteness || "NOT_APPLICABLE" } : {}),
      occurrence: { ownership: "OWNED", construct_role: "PROCEDURAL_LINK" },
      layout: { x: 180, y: 80 },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelRelationCandidate();
  }

  function chooseRelationCandidate(option: ApiEdtCommandCapabilityOption) {
    if (option.capability_ref.capability_id === "CAP-ISO-PROC-001") {
      relationCandidate.selectedOption = option;
      relationCandidate.candidateId = "candidate.visual.candidate-layer";
      relationCandidate.phase = "previewing";
      workbench.lastAction = "过程关系候选正在预览；确认后才会提交。";
      return;
    }
    if (!option.capability_ref.capability_id.startsWith("CAP-ISO-STRUCT-")) {
      void submitRelationCandidate(option);
      return;
    }
    relationCandidate.selectedOption = option;
    relationCandidate.labels = {};
    const labels = option.required_fields.find((field) => field.field_id === "labels");
    (labels?.allowed_values ?? []).forEach((slot) => { relationCandidate.labels[slot] = ""; });
    relationCandidate.collectionCompleteness = "";
    const direction = option.required_fields.find((field) => field.field_id === "direction");
    const allowedDirections = direction?.allowed_values ?? [];
    relationCandidate.direction = allowedDirections.includes("BIDIRECTIONAL") && allowedDirections.length === 1 ? "BIDIRECTIONAL" : "DIRECTED";
  }

  async function confirmRelationCandidate() {
    const option = relationCandidate.selectedOption;
    if (!option || relationCandidate.phase !== "previewing") return;
    await submitRelationCandidate(option);
  }

  async function armControlUpdate() {
    const relation = selectedRelation.value;
    if (!relation || isReadonly.value || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const result = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, relation.id, "UPDATE_FACT");
      allowedCommands.value = result.data.allowed;
      controlCandidate.factId = relation.id;
      controlCandidate.options = result.data.options.filter((option) => option.command_type === "UPDATE_FACT" && option.enabled && option.base_fact_capability_ref?.capability_id === relation.capabilityId);
      controlCandidate.phase = controlCandidate.options.length ? "choosing" : "idle";
      if (!controlCandidate.options.length) block("当前基础关系没有可提交的 Control Link。");
      else workbench.lastAction = "请选择要附加到基础 Fact 的 Control Link。";
    } catch (error) {
      cancelControlCandidate();
      workbench.commandFeedback = message(error);
    }
  }

  function cancelControlCandidate() {
    controlCandidate.phase = "idle";
    controlCandidate.factId = "";
    controlCandidate.options = [];
  }

  async function submitControlCandidate(option: ApiEdtCommandCapabilityOption) {
    const relation = selectedRelation.value;
    const baseCapabilityId = option.base_fact_capability_ref?.capability_id;
    if (controlCandidate.phase !== "choosing" || !relation || relation.id !== controlCandidate.factId || !baseCapabilityId || !canEdit("UPDATE_FACT")) return;
    const modifiers = option.allowed_modifiers.map((modifier) => ({ modifier_id: modifier.modifier_id, value: modifier.value_options[0] }));
    if (modifiers.some((modifier) => !modifier.value)) return block("Runtime Control 候选缺少固定 Modifier 值。");
    await execute({ commandType: "UPDATE_FACT", payload: {
      fact_id: relation.id,
      expected_capability_ref: { capability_id: baseCapabilityId },
      replacement: { modifiers },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelControlCandidate();
  }

  async function armStructuralUpdate() {
    const relation = selectedRelation.value;
    if (!relation?.capabilityId?.startsWith("CAP-ISO-STRUCT-") || isReadonly.value || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const result = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, relation.id, "UPDATE_FACT");
      allowedCommands.value = result.data.allowed;
      const option = result.data.options.find((item) => item.command_type === "UPDATE_FACT" && item.enabled && item.capability_ref.capability_id === relation.capabilityId);
      if (!option) return block("当前结构关系没有可提交的更新候选。");
      structuralUpdateCandidate.factId = relation.id;
      structuralUpdateCandidate.option = option;
      structuralUpdateCandidate.labels = Object.fromEntries((option.required_fields.find((field) => field.field_id === "labels")?.allowed_values ?? [])
        .map((slot) => [slot, relation.labels?.find((label) => label.slotId === slot)?.text ?? ""]));
      structuralUpdateCandidate.collectionCompleteness = relation.collectionCompleteness === "COMPLETE" || relation.collectionCompleteness === "INCOMPLETE"
        ? relation.collectionCompleteness : "";
      structuralUpdateCandidate.direction = relation.direction === "BIDIRECTIONAL" ? "BIDIRECTIONAL" : "DIRECTED";
      structuralUpdateCandidate.phase = "editing";
      workbench.lastAction = "编辑结构关系标签、方向或完整性。";
    } catch (error) {
      cancelStructuralUpdate();
      workbench.commandFeedback = message(error);
    }
  }

  function cancelStructuralUpdate() {
    structuralUpdateCandidate.phase = "idle";
    structuralUpdateCandidate.factId = "";
    structuralUpdateCandidate.option = null;
    structuralUpdateCandidate.labels = {};
    structuralUpdateCandidate.collectionCompleteness = "";
    structuralUpdateCandidate.direction = "DIRECTED";
  }

  async function submitStructuralUpdate() {
    const relation = selectedRelation.value;
    const option = structuralUpdateCandidate.option;
    if (structuralUpdateCandidate.phase !== "editing" || !option || !relation || relation.id !== structuralUpdateCandidate.factId || !canEdit("UPDATE_FACT")) return;
    const labels = Object.entries(structuralUpdateCandidate.labels).filter(([, text]) => text.trim())
      .map(([slot_id, text]) => ({ slot_id, text: text.trim() }));
    const direction = relationDirection(option, structuralUpdateCandidate.direction);
    if (!direction) return block("Runtime 结构关系候选缺少方向约束。");
    const requiredLabels = requiredStructuralLabelSlots(option, direction);
    if (option.required_fields.some((field) => field.field_id === "labels" && field.required)
      && requiredLabels.some((slot) => !labels.some((label) => label.slot_id === slot))) {
      return block("请填写所有必填关系标签。");
    }
    const completenessRequired = option.required_fields.some((field) => field.field_id === "collection_completeness");
    const collectionCompleteness = structuralUpdateCandidate.collectionCompleteness;
    const collectionCompletenessValue = collectionCompleteness === "COMPLETE" || collectionCompleteness === "INCOMPLETE"
      ? collectionCompleteness : undefined;
    if (completenessRequired && !collectionCompletenessValue) return block("请选择 fan 的完整性。");
    await execute({ commandType: "UPDATE_FACT", payload: {
      fact_id: relation.id,
      expected_capability_ref: { capability_id: option.capability_ref.capability_id },
      replacement: {
        direction,
        labels,
        ...(collectionCompletenessValue ? { collection_completeness: collectionCompletenessValue } : {}),
      },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelStructuralUpdate();
  }

  function armStateCreation() {
    const owner = selectedNode.value;
    if (isReadonly.value) return block("当前修订为只读版本，不能创建 State。");
    if (!owner || (owner.kind !== "object" && owner.kind !== "attribute" && owner.kind !== "operation")) return block("请先选择一个 Object 或 Feature，再创建 State。");
    if (!stateCreateOption.value?.enabled) return block("当前 Object 不支持创建 State。");
    stateCandidate.phase = "placing";
    stateCandidate.ownerId = owner.id;
    stateCandidate.name = "";
    stateCandidate.roles = ["INITIAL"];
    workbench.lastAction = "请在已选择 Object 内点击 State 位置。";
  }

  function placeState(ownerId: string) {
    const owner = workbench.nodes.find((node) => node.id === ownerId);
    if (stateCandidate.phase !== "placing" || !owner || ownerId !== stateCandidate.ownerId) return;
    const stateCount = workbench.nodes.filter((node) => node.kind === "state" && node.ownerId === ownerId).length;
    stateCandidate.phase = "editing";
    stateCandidate.x = owner.x + 36;
    stateCandidate.y = owner.y + 4 + stateCount * 34;
    workbench.lastAction = "请输入 State 名称并选择角色。";
  }

  function cancelStateCandidate() {
    stateCandidate.phase = "idle";
    stateCandidate.ownerId = "";
  }

  async function submitStateCandidate() {
    const option = stateCreateOption.value;
    if (!option || stateCandidate.phase !== "editing") return;
    if (!stateCandidate.name.trim()) return block("State 名称不能为空。");
    await execute({ commandType: "CREATE_STATE", payload: {
      context_id: workbench.activeContextId,
      owner_ref: { target_kind: selectedNode.value?.kind === "attribute" || selectedNode.value?.kind === "operation" ? "FEATURE" : "ELEMENT", target_id: stateCandidate.ownerId },
      capability_ref: option.capability_ref,
      name_or_value: stateCandidate.name.trim(),
      state_roles: stateCandidate.roles,
      occurrence: { ownership: "OWNED", construct_role: selectedNode.value?.kind === "attribute" || selectedNode.value?.kind === "operation" ? "FEATURE_STATE_NODE" : "STATE_NODE" },
      layout: { x: stateCandidate.x, y: stateCandidate.y },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelStateCandidate();
  }

  async function saveSelectedState() {
    const state = selectedNode.value;
    if (!state || state.kind !== "state" || !state.ownerId) return;
    await execute({ commandType: "UPDATE_STATE", payload: {
      state_id: state.id,
      expected_owner_ref: { target_kind: "ELEMENT", target_id: state.ownerId },
      changes: { name_or_value: stateEditor.name.trim(), state_roles: stateEditor.roles },
      capability_query_id: stateCreateOption.value?.capability_query_id ?? "query.state.update",
      selected_option_id: stateCreateOption.value?.option_id ?? "option.state.update",
    } });
  }

  async function changeStatePresentation(commandType: "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD") {
    const state = selectedNode.value;
    if (!state || state.kind !== "state") return;
    await execute({ commandType, payload: { context_id: workbench.activeContextId, state_id: state.id } });
  }

  async function makeSuppressedStateExplicit(stateId: string) {
    const state = selectedObjectSuppressedStates.value.find((item) => item.state_id === stateId);
    if (!state) return block("该抑制 State 不属于当前选择的 Object。");
    await execute({ commandType: "STATE_EXPLICIT", payload: { context_id: workbench.activeContextId, state_id: state.state_id } });
  }

  async function deleteSelectedState() {
    const state = selectedNode.value;
    const option = stateDeleteOption.value;
    if (!state || state.kind !== "state" || !option?.impact_token) return;
    if (!option.enabled) return block("该 State 已被 Fact 引用，不能删除。");
    await execute({ commandType: "DELETE_CONSTRUCT", payload: { construct_kind: "STATE", construct_id: state.id, impact_token: option.impact_token } });
  }

  async function deleteSelectedFact() {
    const fact = selectedRelation.value;
    const option = factDeleteOption.value;
    if (!fact || !option?.enabled || !option.impact_token) return;
    await execute({ commandType: "DELETE_CONSTRUCT", payload: { construct_kind: "FACT", construct_id: fact.id, impact_token: option.impact_token } });
  }

  async function runValidation() {
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
    const command = releaseVisualCommonFaultCommand.value;
    if (!command || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    workbench.commandState = "submitting";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    try {
      const result = await localRuntimeApi.executeReleaseVisualCommonFaultCommand(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, command);
      if (!result.meta.committed_revision) throw new LocalRuntimeApiError("COMMAND_NOT_COMMITTED", "命令未返回已提交修订。", true);
      workbench.autosaveState = "saved";
      workbench.validationState = "stale";
      workbench.commandState = "idle";
      await load(projectId.value, modelId.value, workbench.activeContextId, result.meta.committed_revision);
    } catch (error) {
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

  async function execute(command: Parameters<typeof localRuntimeApi.executeP0Command>[4]) {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    workbench.commandState = "submitting";
    workbench.commandFeedback = "";
    workbench.feedbackCode = null;
    try {
      const result = await localRuntimeApi.executeP0Command(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, command);
      if (!result.meta.committed_revision) throw new LocalRuntimeApiError("COMMAND_NOT_COMMITTED", "命令未返回已提交修订。", true);
      workbench.autosaveState = "saved";
      workbench.validationState = "stale";
      workbench.commandState = "idle";
      await load(projectId.value, modelId.value, workbench.activeContextId, result.meta.committed_revision);
    } catch (error) {
      const apiError = error instanceof LocalRuntimeApiError ? error : undefined;
      workbench.commandState = apiError?.code === "REVISION_CONFLICT" || apiError?.code === "VALIDATION_BLOCKED" ? "blocked" : "failed";
      workbench.autosaveState = apiError?.retryable ? "save-failed" : "saved";
      workbench.feedbackCode = apiError?.code ?? null;
      workbench.commandFeedback = message(error);
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
    try {
      const capabilities = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, selectionId, "CREATE_STATE");
      stateCreateOption.value = capabilities.data.options.find((option) => option.command_type === "CREATE_STATE") ?? null;
    } catch (error) {
      stateCreateOption.value = null;
      workbench.commandFeedback = message(error);
    }
  }

  async function refreshStateDeleteOption(selectionId: string) {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const capabilities = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, selectionId, "DELETE_CONSTRUCT");
      stateDeleteOption.value = capabilities.data.options.find((option) => option.command_type === "DELETE_CONSTRUCT") ?? null;
    } catch (error) {
      stateDeleteOption.value = null;
      workbench.commandFeedback = message(error);
    }
  }

  async function refreshFactDeleteOption(selectionId: string) {
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const capabilities = await localRuntimeApi.commandCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, selectionId, "DELETE_CONSTRUCT");
      factDeleteOption.value = capabilities.data.options.find((option) => option.command_type === "DELETE_CONSTRUCT") ?? null;
    } catch (error) {
      factDeleteOption.value = null;
      workbench.commandFeedback = message(error);
    }
  }

  return { projectId, modelId, projectName, modelName, profileLabel, contexts, textLines, revisions, findings, operationRecords, selectedFindingId, highlightedFindingTargetId, releaseVisualCommonFaultCommand, workbench, isReadonly, selectedNode, selectedRelation, selectedObjectSuppressedStates, stateCreateOption, stateDeleteOption, factDeleteOption, stateCandidate, stateEditor, relationCandidate, relationCatalog, relationCatalogFamilies, rightPanel, controlCandidate, structuralUpdateCandidate, captureViewState, load, selectContext, selectConstruct, setBottomTab, openRightPanel, closeRightPanel, setViewportZoom, addElement, addFeature, addConsumption, openRelationCatalog, closeRelationCatalog, relationCatalogItems, isRelationCatalogExpanded, toggleRelationCatalogFamily, armRelationCreation, cancelRelationCandidate, resolveRelationCandidates, submitRelationCandidate, chooseRelationCandidate, confirmRelationCandidate, armControlUpdate, cancelControlCandidate, submitControlCandidate, armStructuralUpdate, cancelStructuralUpdate, submitStructuralUpdate, armStateCreation, placeState, cancelStateCandidate, submitStateCandidate, saveSelectedState, changeStatePresentation, makeSuppressedStateExplicit, deleteSelectedState, deleteSelectedFact, runValidation, locateText, selectFinding, locateFinding, submitReleaseVisualCommonFaultCommand, unavailable };
});

function operationHistoryCode(record: OperationRecordWire): string | null {
  const diagnosticId = record.diagnostic_id;
  if (!diagnosticId) return null;
  const code = diagnosticId.slice(diagnosticId.lastIndexOf(".") + 1);
  return ["VALIDATION_BLOCKED", "REVISION_CONFLICT", "READONLY"].includes(code) ? code : null;
}

function toContexts(data: { process_tree: NavigationNodeWire[]; object_forest: NavigationNodeWire[]; views: NavigationNodeWire[] }, fallbackId: string): RuntimeContext[] {
  const nodes = [...data.process_tree, ...data.object_forest, ...data.views];
  return (nodes.length ? nodes : [{ context_id: fallbackId, label: fallbackId, context_kind: "SYSTEM_DIAGRAM", has_children: false }]).map((item) => ({ id: item.context_id, label: item.label, kind: item.context_kind }));
}

function toNode(value: ProjectionConstructWire): OpdNode {
  return {
    id: value.target_id,
    occurrenceId: value.occurrence_id,
    label: value.label ?? value.target_id,
    kind: value.construct_role === "PROCESS_NODE" ? "process" : value.construct_role === "ATTRIBUTE_NODE" ? "attribute" : value.construct_role === "OPERATION_NODE" ? "operation" : value.construct_role === "STATE_NODE" || value.construct_role === "FEATURE_STATE_NODE" ? "state" : "object",
    x: value.layout.x,
    y: value.layout.y,
    valueDomain: "-",
    visibility: "public",
    multiplicity: "1",
    architectureLayer: "产品",
    occurrenceRole: "owned",
    ownerId: value.owner_id,
    stateRoles: value.state_roles,
    explicitness: value.explicitness,
    foldState: value.fold_state,
  };
}

function toConsumption(value: ProjectionConstructWire, nodes: OpdNode[]): ConsumptionRelation[] {
  const occurrenceIdForTarget = (targetId: string) => nodes.find((node) => node.id === targetId)?.occurrenceId ?? targetId;
  if (value.endpoints?.length) {
    const ordered = [...value.endpoints].sort((left, right) => left.ordinal - right.ordinal);
    const source = ordered[0];
    const target = ordered.length === 3 ? ordered[1] : ordered[1];
    if (!source || !target) return [];
    return [{
      id: value.target_id,
      occurrenceId: value.occurrence_id,
      sourceId: source.target_id,
      targetId: target.target_id,
      sourceOccurrenceId: occurrenceIdForTarget(source.target_id),
      targetOccurrenceId: occurrenceIdForTarget(target.target_id),
      symbolRef: value.symbol_ref ?? "symbol.link.procedural",
      layoutRef: value.layout_ref ?? value.occurrence_id,
      capabilityId: value.capability_id,
      endpoints: ordered.map((endpoint) => ({ role: endpoint.role, targetId: endpoint.target_id, targetKind: endpoint.target_kind, ordinal: endpoint.ordinal })),
      duration: value.modifiers?.find((modifier) => modifier.modifier_id === "duration")?.value,
      controlCapability: value.modifiers?.find((modifier) => modifier.modifier_id === "control.capability")?.value,
      controlSegment: value.modifiers?.find((modifier) => modifier.modifier_id === "control.segment")?.value === "PROCESS_INPUT" ? "PROCESS_INPUT" : undefined,
      labels: value.labels?.map((label) => ({ slotId: label.slot_id, text: label.text })),
      direction: value.direction,
      collectionCompleteness: value.collection_completeness,
    }];
  }
  if (!value.source_id || !value.process_id) return [];
  return [{
    id: value.target_id,
    occurrenceId: value.occurrence_id,
    sourceId: value.source_id,
    targetId: value.process_id,
    sourceOccurrenceId: value.source_occurrence_id ?? value.source_id,
    targetOccurrenceId: value.target_occurrence_id ?? value.process_id,
    symbolRef: value.symbol_ref ?? "symbol.consumption.v1",
    layoutRef: value.layout_ref ?? value.occurrence_id,
  }];
}

function proceduralFactFamily(capabilityId: string): "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT" | undefined {
  if (["CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-003", "CAP-ISO-PROC-006", "CAP-ISO-PROC-007", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010"].includes(capabilityId)) return "TRANSFORMATION";
  if (["CAP-ISO-PROC-004", "CAP-ISO-PROC-005", "CAP-ISO-PROC-011", "CAP-ISO-PROC-012"].includes(capabilityId)) return "ENABLING";
  if (["CAP-ISO-PROC-013", "CAP-ISO-PROC-014", "CAP-ISO-PROC-015", "CAP-ISO-PROC-016"].includes(capabilityId)) return "PROFILE_FACT";
  return undefined;
}

function relationFactFamily(capabilityId: string): "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT" | "STRUCTURAL" | undefined {
  return capabilityId.startsWith("CAP-ISO-STRUCT-") ? "STRUCTURAL" : proceduralFactFamily(capabilityId);
}

function relationDirection(option: ApiEdtCommandCapabilityOption, selected: "DIRECTED" | "BIDIRECTIONAL"): "DIRECTED" | "BIDIRECTIONAL" | undefined {
  const direction = option.required_fields.find((field) => field.field_id === "direction");
  if (!direction) return "DIRECTED";
  const allowedDirections = direction.allowed_values ?? [];
  return allowedDirections.includes(selected) ? selected : allowedDirections[0] as "DIRECTED" | "BIDIRECTIONAL" | undefined;
}

function requiredStructuralLabelSlots(option: ApiEdtCommandCapabilityOption, direction: "DIRECTED" | "BIDIRECTIONAL" | undefined): string[] {
  const slots = option.required_fields.find((field) => field.field_id === "labels")?.allowed_values ?? [];
  return direction === "DIRECTED" ? slots.filter((slot) => slot !== "reverse_tag") : slots;
}

function toTextLines(sentences: Array<{ sentence_id: string; text: string }>, traces: Array<{ sentence_id: string; fact_ids: string[]; occurrence_ids: string[] }>): RuntimeTextLine[] {
  return sentences.map((sentence) => {
    const trace = traces.find((item) => item.sentence_id === sentence.sentence_id);
    return { id: sentence.sentence_id, text: sentence.text, factIds: trace?.fact_ids ?? [], occurrenceIds: trace?.occurrence_ids ?? [] };
  });
}

function message(error: unknown) {
  return error instanceof LocalRuntimeApiError ? error.message : "本地请求失败，请重试。";
}
