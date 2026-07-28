import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";

import type {
  AccessMode,
  BottomTab,
  CanvasTool,
  CommandState,
  ConsumptionRelation,
  ContextSummary,
  FindingSummary,
  ModelSummary,
  OpdNode,
  OverlayState,
  ProjectScope,
  ProjectSummary,
  ResourceState,
  SaveState,
  TextProjectionState,
  TextTrace,
  ValidationState,
} from "@/shared/types/modeling";

const initialProjects: ProjectSummary[] = [
  { id: "project-raw-material", name: "原料加工系统", description: "原料加工、处理与质量检查的最小 OPM 建模确认。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 1, lastOpenedAt: "今天 09:42", status: "active" },
  { id: "project-warehouse", name: "智能仓储系统", description: "仓储作业与设备协同建模。", profile: "OPM 基础配置 1.0.0", modelCount: 2, lastOpenedAt: "昨天 16:20", status: "active" },
  { id: "project-archived", name: "历史制造线", description: "已归档设计确认项目。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 3, lastOpenedAt: "2026-07-21", status: "archived" },
];

const initialModels: ModelSummary[] = [
  { id: "model-processing", projectId: "project-raw-material", name: "原料加工模型", description: "根 SD、对象、过程与 Consumption 的最小闭环。", profile: "ISO 19450:2024 草案 0.1.0", revision: 18, baselineCount: 1, validation: "current", contextCount: 3, lastSavedAt: "09:42" },
  { id: "model-warehouse", projectId: "project-warehouse", name: "仓储履约模型", description: "入库、拣选、出库的初始模型。", profile: "OPM 基础配置 1.0.0", revision: 6, baselineCount: 0, validation: "stale", contextCount: 2, lastSavedAt: "昨天 16:20" },
];

function createNode(
  id: string,
  label: string,
  kind: OpdNode["kind"],
  x: number,
  y: number,
  occurrenceRole: OpdNode["occurrenceRole"] = "owned",
): OpdNode {
  return {
    id,
    occurrenceId: `occ-${id}-${occurrenceRole}`,
    label,
    kind,
    x,
    y,
    valueDomain: kind === "object" ? "待定义状态/值域" : "不适用",
    visibility: "public",
    multiplicity: "1",
    architectureLayer: kind === "object" ? "产品" : "功能",
    occurrenceRole,
  };
}

function createConsumption(source: OpdNode, target: OpdNode, suffix = ""): ConsumptionRelation {
  return {
    id: `consumption-${source.id}-${target.id}${suffix}`,
    sourceId: source.id,
    targetId: target.id,
    sourceOccurrenceId: source.occurrenceId,
    targetOccurrenceId: target.occurrenceId,
    symbolRef: "symbol.consumption.v1",
    layoutRef: `layout-${source.id}-${target.id}${suffix}`,
  };
}

function createContext(
  id: string,
  name: string,
  kind: ContextSummary["kind"],
  nodes: OpdNode[],
  relations: ConsumptionRelation[],
  parentContextId?: string,
  refineeId?: string,
): ContextSummary {
  return { id, name, kind, occurrenceCount: nodes.length, nodes, relations, parentContextId, refineeId };
}

function seedContexts(model: ModelSummary): ContextSummary[] {
  if (model.id === "model-warehouse") {
    const inventory = createNode("inventory", "Inventory", "object", 120, 188);
    const fulfillment = createNode("fulfillment", "Fulfillment", "process", 430, 180);
    const batch = createNode("fulfillment-batch", "Fulfillment Batch", "object", 120, 188);
    const dispatch = createNode("dispatch", "Dispatch", "process", 430, 180);
    return [
      createContext("warehouse-sd", "SD · 智能仓储系统", "system-diagram", [inventory, fulfillment], [createConsumption(inventory, fulfillment)]),
      createContext("fulfillment-refinement", "Fulfillment refinement", "process-refinement", [batch, dispatch], [createConsumption(batch, dispatch)], "warehouse-sd", "fulfillment"),
    ];
  }
  if (model.id !== "model-processing") return [createContext("root-sd", "SD · 新模型", "system-diagram", [], [])];

  const rawMaterial = createNode("raw-material", "Raw Material", "object", 120, 188);
  const processing = createNode("processing", "Processing", "process", 430, 180);
  const input = createNode("processing-input", "Processing Input", "object", 120, 188);
  const qualityCheck = createNode("quality-check", "Quality Check", "process", 430, 180);
  const rawMaterialReference = { ...rawMaterial, occurrenceId: "occ-raw-material-reference", occurrenceRole: "reference" as const };
  const inspectMaterial = createNode("inspect-material", "Inspect Material", "process", 430, 180);
  return [
    createContext("raw-material-sd", "SD · 原料加工系统", "system-diagram", [rawMaterial, processing], [createConsumption(rawMaterial, processing)]),
    createContext("processing-refinement", "Processing refinement", "process-refinement", [input, qualityCheck], [createConsumption(input, qualityCheck)], "raw-material-sd", "processing"),
    createContext("raw-material-refinement", "Raw Material refinement", "object-refinement", [rawMaterialReference, inspectMaterial], [createConsumption(rawMaterialReference, inspectMaterial)], "raw-material-sd", "raw-material"),
    createContext("quality-view", "质量检查视图", "model-view", [], [], "raw-material-sd"),
  ];
}

function seedFindings(contexts: ContextSummary[], revision: number): FindingSummary[] {
  return contexts.flatMap((context) => {
    const target = context.nodes[0];
    if (!target) return [];
    return [{
      id: `finding-${context.id}-${target.id}`,
      severity: "警告" as const,
      ruleId: "VAL-TRACE-001",
      message: `${target.label} 的说明待补充，点击定位。`,
      contextId: context.id,
      constructId: target.id,
      inputRevision: revision,
    }];
  });
}

function buildTrace(context: ContextSummary): TextTrace[] {
  return context.relations.flatMap((relation) => {
    const source = context.nodes.find((node) => node.id === relation.sourceId);
    const target = context.nodes.find((node) => node.id === relation.targetId);
    if (!source || !target) return [];
    return [{
      sentenceId: `sentence-${relation.id}`,
      contextId: context.id,
      relationId: relation.id,
      constructIds: [source.id, target.id, relation.id],
      sentence: `${target.label} consumes available ${source.label}.`,
    }];
  });
}

export const useDesignConfirmationStore = defineStore("design-confirmation", () => {
  const projects = ref<ProjectSummary[]>(structuredClone(initialProjects));
  const models = ref<ModelSummary[]>(structuredClone(initialModels));
  const projectScope = ref<ProjectScope>("active");
  const projectSearch = ref("");
  const activeProjectId = ref("project-raw-material");
  const activeModelId = ref("model-processing");
  const overlay = ref<OverlayState | null>(null);
  const toast = ref("");
  const isSidebarCollapsed = ref(false);
  let validationTimer: number | undefined;

  const initialContexts = seedContexts(initialModels[0]!);
  const workbench = reactive({
    resourceState: "ready" as ResourceState,
    revision: 18,
    accessMode: "editable-draft" as AccessMode,
    commandState: "idle" as CommandState,
    commandFeedback: "",
    tool: "select" as CanvasTool,
    selectedId: "raw-material",
    zoom: 100,
    bottomTab: "text" as BottomTab,
    navigationMode: "process-tree",
    validationState: "current" as ValidationState,
    validationProgress: 100,
    textState: "current" as TextProjectionState,
    blockingFindings: 0,
    baselineCreated: true,
    snapshotCount: 0,
    lastSnapshotName: "",
    autosaveState: "saved" as SaveState,
    lastAction: "已打开 Draft r18",
    activeContextId: initialContexts[0]?.id ?? "",
    contexts: initialContexts,
    nodes: initialContexts[0]?.nodes ?? [],
    relations: initialContexts[0]?.relations ?? [],
    findings: seedFindings(initialContexts, 18),
  });

  const activeProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value));
  const activeModel = computed(() => models.value.find((model) => model.id === activeModelId.value));
  const projectModels = computed(() => models.value.filter((model) => model.projectId === activeProjectId.value));
  const activeContext = computed(() => workbench.contexts.find((context) => context.id === workbench.activeContextId));
  const activeTextTraces = computed(() => activeContext.value ? buildTrace(activeContext.value) : []);
  const activeFindings = computed(() => workbench.findings.filter((finding) => finding.contextId === workbench.activeContextId));
  const selectedNode = computed(() => workbench.nodes.find((node) => node.id === workbench.selectedId));
  const selectedRelation = computed(() => workbench.relations.find((relation) => relation.id === workbench.selectedId));
  const refinementPreview = computed(() => {
    if (!activeContext.value || !selectedNode.value) return null;
    return {
      refinee: selectedNode.value,
      parentContext: activeContext.value,
      targetTree: selectedNode.value.kind === "process" ? "过程树" : "对象林",
      kind: selectedNode.value.kind === "process" ? "process-refinement" as const : "object-refinement" as const,
    };
  });
  const impactSummary = computed(() => {
    const selectedIds = selectedRelation.value
      ? [selectedRelation.value.sourceId, selectedRelation.value.targetId]
      : selectedNode.value ? [selectedNode.value.id] : [];
    const relevantContexts = workbench.contexts.filter((context) => selectedIds.some((id) => context.nodes.some((node) => node.id === id)));
    const currentContext = activeContext.value;
    return {
      ownedElements: currentContext?.nodes.filter((node) => node.occurrenceRole === "owned").length ?? 0,
      referencedContexts: Math.max(0, relevantContexts.length - (currentContext ? 1 : 0)),
      refinementEdges: workbench.contexts.filter((context) => context.parentContextId === currentContext?.id || selectedIds.includes(context.refineeId ?? "")).length,
      modelViews: relevantContexts.filter((context) => context.kind === "model-view").length,
    };
  });
  const filteredProjects = computed(() => {
    const search = projectSearch.value.trim().toLocaleLowerCase();
    return projects.value.filter((project) => {
      const matchesScope = projectScope.value === "all" || project.status === projectScope.value;
      return matchesScope && (!search || `${project.name}${project.description}`.toLocaleLowerCase().includes(search));
    });
  });
  const isReadonly = computed(() => workbench.accessMode !== "editable-draft");
  const isBaselineReady = computed(() => (
    workbench.autosaveState === "saved"
    && workbench.validationState === "current"
    && workbench.textState === "current"
    && workbench.blockingFindings === 0
  ));

  function applyContextProjection(context: ContextSummary) {
    workbench.activeContextId = context.id;
    workbench.nodes = context.nodes;
    workbench.relations = context.relations;
    workbench.selectedId = context.nodes[0]?.id ?? context.relations[0]?.id ?? "";
  }

  function resetWorkbenchForModel(model: ModelSummary) {
    const contexts = seedContexts(model);
    const context = contexts[0];
    workbench.resourceState = context ? "ready" : "empty";
    workbench.revision = model.revision;
    workbench.accessMode = "editable-draft";
    workbench.commandState = "idle";
    workbench.commandFeedback = "";
    workbench.zoom = 100;
    workbench.bottomTab = "text";
    workbench.navigationMode = "process-tree";
    workbench.validationState = model.validation;
    workbench.validationProgress = model.validation === "current" ? 100 : 0;
    workbench.textState = model.validation === "current" ? "current" : "stale";
    workbench.blockingFindings = 0;
    workbench.baselineCreated = model.baselineCount > 0;
    workbench.snapshotCount = 0;
    workbench.lastSnapshotName = "";
    workbench.autosaveState = "saved";
    workbench.lastAction = `已打开 Draft r${model.revision}`;
    workbench.contexts = contexts;
    workbench.findings = seedFindings(contexts, model.revision);
    if (context) applyContextProjection(context);
  }

  function notify(message: string) {
    toast.value = message;
    window.setTimeout(() => {
      if (toast.value === message) toast.value = "";
    }, 3200);
  }

  function blockCommand(message: string) {
    workbench.commandState = "blocked";
    workbench.commandFeedback = message;
    notify(message);
  }

  function completeLocalCommand(message: string) {
    workbench.commandState = "idle";
    workbench.commandFeedback = "";
    workbench.autosaveState = "saved";
    notify(message);
  }

  function openOverlay(kind: OverlayState["kind"]) {
    if (kind === "refinement" && !refinementPreview.value) {
      blockCommand("请先在当前 Context 选择可细化的 Object 或 Process。");
      return;
    }
    overlay.value = { kind };
  }

  function closeOverlay() {
    overlay.value = null;
  }

  function selectProject(projectId: string) {
    activeProjectId.value = projectId;
  }

  function selectModel(modelId: string) {
    activeModelId.value = modelId;
    const model = models.value.find((item) => item.id === modelId);
    if (model) {
      activeProjectId.value = model.projectId;
      resetWorkbenchForModel(model);
    }
  }

  function createProject(name: string, description: string) {
    const project: ProjectSummary = { id: `project-${Date.now()}`, name, description: description || "待补充项目说明。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 0, lastOpenedAt: "刚刚", status: "active" };
    projects.value.unshift(project);
    activeProjectId.value = project.id;
    closeOverlay();
    notify("设计确认项目已创建，尚未写入本地运行时。");
    return project;
  }

  function createModel(name: string) {
    const project = activeProject.value;
    if (!project) return null;
    const model: ModelSummary = { id: `model-${Date.now()}`, projectId: project.id, name, description: "新建模型的设计确认态。", profile: project.profile, revision: 1, baselineCount: 0, validation: "stale", contextCount: 1, lastSavedAt: "刚刚" };
    models.value.unshift(model);
    project.modelCount += 1;
    activeModelId.value = model.id;
    resetWorkbenchForModel(model);
    closeOverlay();
    notify("模型、根 Context 与 Draft r1 已进入设计确认态。");
    return model;
  }

  function selectConstruct(id: string) {
    if (!workbench.nodes.some((node) => node.id === id) && !workbench.relations.some((relation) => relation.id === id)) return;
    workbench.selectedId = id;
  }

  function selectContext(contextId: string) {
    const context = workbench.contexts.find((item) => item.id === contextId);
    if (!context) return;
    applyContextProjection(context);
    workbench.lastAction = `${context.name} 已打开`;
  }

  function setViewportZoom(nextZoom: number) {
    workbench.zoom = Math.min(400, Math.max(25, nextZoom));
  }

  function setNavigationMode(mode: "process-tree" | "object-forest") {
    workbench.navigationMode = mode;
  }

  function setBottomTab(tab: BottomTab) {
    workbench.bottomTab = tab;
  }

  function setCanvasTool(tool: CanvasTool) {
    workbench.tool = tool;
  }

  function addCandidate(kind: "object" | "process") {
    if (isReadonly.value || !activeContext.value) {
      blockCommand("当前访问模式不允许创建语义候选。");
      return;
    }
    const count = workbench.nodes.filter((node) => node.kind === kind).length + 1;
    const node = createNode(`${kind}-${Date.now()}`, `${kind === "object" ? "Object" : "Process"} ${count}`, kind, kind === "object" ? 120 : 430, 80 + Math.max(0, count - 2) * 70);
    workbench.nodes.push(node);
    activeContext.value.occurrenceCount = workbench.nodes.length;
    workbench.selectedId = node.id;
    workbench.lastAction = `${node.label} 候选已加入 ${activeContext.value.name}`;
    completeLocalCommand("候选只用于设计确认；真实实现需由 API-EDT-002 提交。");
  }

  function selectConsumption() {
    if (isReadonly.value) {
      blockCommand("当前访问模式不允许创建关系候选。");
      return;
    }
    const objectNode = selectedNode.value?.kind === "object" ? selectedNode.value : workbench.nodes.find((node) => node.kind === "object");
    const processNode = selectedNode.value?.kind === "process" ? selectedNode.value : workbench.nodes.find((node) => node.kind === "process");
    if (!objectNode || !processNode) {
      blockCommand("至少创建一个 Object 和一个 Process 后，才能选择 Consumption 候选。");
      return;
    }
    const relation = createConsumption(objectNode, processNode, `-${Date.now()}`);
    workbench.relations.push(relation);
    workbench.selectedId = relation.id;
    workbench.lastAction = `Consumption 候选已连接 ${objectNode.label} 与 ${processNode.label}`;
    completeLocalCommand("当前仅展示 Object/State -> Process 的 Consumption 候选。");
  }

  function commitProperty(name: string, updates?: Pick<OpdNode, "valueDomain" | "visibility" | "multiplicity" | "architectureLayer">) {
    if (isReadonly.value) {
      blockCommand("当前访问模式不允许提交属性候选。");
      return;
    }
    const node = selectedNode.value;
    if (!node || !name.trim()) {
      blockCommand("名称不能为空，属性候选尚未提交。");
      return;
    }
    workbench.commandState = "submitting";
    node.label = name.trim();
    if (updates) {
      node.valueDomain = updates.valueDomain.trim() || node.valueDomain;
      node.visibility = updates.visibility;
      node.multiplicity = updates.multiplicity.trim() || node.multiplicity;
      node.architectureLayer = updates.architectureLayer;
    }
    workbench.revision += 1;
    workbench.textState = "current";
    workbench.validationState = "stale";
    workbench.validationProgress = 0;
    workbench.lastAction = `属性候选已确认到设计修订 r${workbench.revision}`;
    completeLocalCommand("属性候选已确认到本地设计状态，未调用后端命令。");
  }

  function confirmSemanticZoom() {
    if (isReadonly.value) {
      blockCommand("当前访问模式不允许执行语义缩放。");
      return;
    }
    workbench.commandState = "submitting";
    workbench.revision += 1;
    workbench.textState = "current";
    workbench.validationState = "stale";
    workbench.validationProgress = 0;
    workbench.lastAction = `SEMANTIC_IN_ZOOM 已形成设计修订 r${workbench.revision}`;
    closeOverlay();
    completeLocalCommand("语义缩放已确认：Context、Occurrence、Revision 与 OPL 将同步更新。");
  }

  function runValidation() {
    if (validationTimer) window.clearInterval(validationTimer);
    workbench.validationState = "running";
    workbench.validationProgress = 0;
    notify(`校验任务已登记，输入固定为 r${workbench.revision}。`);
    validationTimer = window.setInterval(() => {
      workbench.validationProgress += 20;
      if (workbench.validationProgress >= 100) {
        window.clearInterval(validationTimer);
        validationTimer = undefined;
        workbench.validationProgress = 100;
        workbench.validationState = "current";
        workbench.lastAction = `校验结果当前，绑定 r${workbench.revision}`;
        notify("校验完成：阻断 0，警告 1，ISO 证据未就绪。");
      }
    }, 150);
  }

  function markSaveFailed(message = "本地保存失败，请重试或从最近安全修订恢复。") {
    workbench.autosaveState = "save-failed";
    workbench.commandState = "failed";
    workbench.commandFeedback = message;
  }

  function markValidationFailed(message = "校验任务失败，请重试或查看诊断信息。") {
    workbench.validationState = "failed";
    workbench.commandState = "failed";
    workbench.commandFeedback = message;
  }

  function createBaseline() {
    if (!isBaselineReady.value) {
      blockCommand("文本、校验、保存和阻断问题未同时满足基线条件。");
      return false;
    }
    workbench.baselineCreated = true;
    workbench.accessMode = "readonly-baseline";
    closeOverlay();
    completeLocalCommand("本地只读基线已创建；不包含 ISO 符合性声明。");
    return true;
  }

  function createDraftFromBaseline() {
    if (workbench.accessMode === "recovery-required") {
      blockCommand("恢复完成前不能基于当前版本创建草稿。");
      return;
    }
    workbench.accessMode = "editable-draft";
    workbench.revision += 1;
    workbench.validationState = "stale";
    workbench.validationProgress = 0;
    workbench.lastAction = `已从只读版本建立 Draft r${workbench.revision}`;
    completeLocalCommand("已从只读版本创建可编辑草稿。");
  }

  function createSnapshot(name: string) {
    if (workbench.accessMode !== "editable-draft" || workbench.autosaveState !== "saved") {
      blockCommand("当前草稿尚未耐久保存，不能创建命名快照。");
      return false;
    }
    const snapshotName = name.trim();
    if (!snapshotName) {
      blockCommand("请填写快照名称。");
      return false;
    }
    workbench.snapshotCount += 1;
    workbench.lastSnapshotName = snapshotName;
    workbench.lastAction = `命名快照 ${snapshotName} 已固定在 r${workbench.revision}`;
    closeOverlay();
    completeLocalCommand("不可变命名快照已在设计确认态创建。");
    return true;
  }

  function createRefinement(name: string) {
    const preview = refinementPreview.value;
    if (workbench.accessMode !== "editable-draft" || !preview) {
      blockCommand("请在可编辑草稿的当前 Context 中选择一个可细化元素。");
      return false;
    }
    const contextName = name.trim();
    if (!contextName) {
      blockCommand("请填写新 Context 名称。");
      return false;
    }
    const refinee = { ...preview.refinee, occurrenceId: `occ-${preview.refinee.id}-reference-${Date.now()}`, occurrenceRole: "reference" as const };
    const companion = createNode(
      `${preview.refinee.kind}-detail-${Date.now()}`,
      preview.refinee.kind === "process" ? `${preview.refinee.label} Input` : `Inspect ${preview.refinee.label}`,
      preview.refinee.kind === "process" ? "object" : "process",
      preview.refinee.kind === "process" ? 120 : 430,
      180,
    );
    const nodes = preview.refinee.kind === "process" ? [companion, { ...refinee, x: 430, y: 180 }] : [{ ...refinee, x: 120, y: 188 }, companion];
    const context = createContext(`context-${Date.now()}`, contextName, preview.kind, nodes, [createConsumption(nodes[0] as OpdNode, nodes[1] as OpdNode)], preview.parentContext.id, preview.refinee.id);
    workbench.contexts.push(context);
    workbench.revision += 1;
    workbench.textState = "current";
    workbench.validationState = "stale";
    workbench.validationProgress = 0;
    workbench.findings.push(...seedFindings([context], workbench.revision));
    applyContextProjection(context);
    workbench.lastAction = `${contextName} 已创建并打开；细化对象为 ${preview.refinee.label}`;
    closeOverlay();
    completeLocalCommand("细化 OPD 已加入对应树，并打开新的设计确认 Context。");
    return true;
  }

  function locateTextTrace(sentenceId: string) {
    const trace = workbench.contexts.flatMap(buildTrace).find((item) => item.sentenceId === sentenceId);
    if (!trace) {
      blockCommand("目标在当前修订不存在，已清除旧选择。");
      workbench.selectedId = "";
      return;
    }
    selectContext(trace.contextId);
    selectConstruct(trace.relationId);
    workbench.lastAction = `已按 Text Trace 定位 ${trace.sentenceId}`;
  }

  function locateFinding(findingId: string) {
    const finding = workbench.findings.find((item) => item.id === findingId);
    if (!finding) {
      blockCommand("目标 Finding 在当前修订不存在，已清除旧选择。");
      workbench.selectedId = "";
      return;
    }
    selectContext(finding.contextId);
    selectConstruct(finding.constructId);
    workbench.bottomTab = "findings";
    workbench.lastAction = `已按 Finding ${finding.ruleId} 定位 ${finding.constructId}`;
  }

  return {
    projects,
    models,
    projectScope,
    projectSearch,
    activeProjectId,
    activeModelId,
    overlay,
    toast,
    isSidebarCollapsed,
    workbench,
    activeProject,
    activeModel,
    projectModels,
    filteredProjects,
    activeContext,
    activeTextTraces,
    activeFindings,
    selectedNode,
    selectedRelation,
    refinementPreview,
    impactSummary,
    isReadonly,
    isBaselineReady,
    notify,
    openOverlay,
    closeOverlay,
    selectProject,
    selectModel,
    createProject,
    createModel,
    selectConstruct,
    selectContext,
    setViewportZoom,
    setNavigationMode,
    setBottomTab,
    setCanvasTool,
    addCandidate,
    selectConsumption,
    commitProperty,
    confirmSemanticZoom,
    runValidation,
    markSaveFailed,
    markValidationFailed,
    createBaseline,
    createDraftFromBaseline,
    createSnapshot,
    createRefinement,
    locateTextTrace,
    locateFinding,
  };
});
