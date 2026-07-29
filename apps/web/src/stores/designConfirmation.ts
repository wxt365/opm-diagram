import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";

import {
  advanceMockRevision,
  completeMockValidation,
  createMockConsumption,
  createMockFindings,
  createMockModel,
  createMockNode,
  createMockProject,
  createMockTextTraces,
  createMockWorkspaceProjection,
  mockModelFixtures,
  mockProjectFixtures,
} from "@/shared/api/mock/designConfirmationAdapter";
import type {
  AccessMode,
  BottomTab,
  CanvasTool,
  CommandState,
  ContextSummary,
  ModelSummary,
  OpdNode,
  OverlayState,
  ProjectScope,
  ProjectSummary,
  ResourceState,
  SaveState,
} from "@/shared/types/modeling";

export const useDesignConfirmationStore = defineStore("design-confirmation", () => {
  const projects = ref<ProjectSummary[]>(structuredClone(mockProjectFixtures));
  const models = ref<ModelSummary[]>(structuredClone(mockModelFixtures));
  const projectScope = ref<ProjectScope>("active");
  const projectSearch = ref("");
  const activeProjectId = ref("project-raw-material");
  const activeModelId = ref("model-processing");
  const overlay = ref<OverlayState | null>(null);
  const toast = ref("");
  const isSidebarCollapsed = ref(false);
  let validationTimer: number | undefined;

  const initialProjection = createMockWorkspaceProjection(mockModelFixtures[0]!);
  const workbench = reactive({
    resourceState: "ready" as ResourceState,
    revision: initialProjection.revision,
    accessMode: "editable-draft" as AccessMode,
    commandState: "idle" as CommandState,
    commandFeedback: "",
    tool: "select" as CanvasTool,
    selectedId: "raw-material",
    zoom: 100,
    bottomTab: "text" as BottomTab,
    navigationMode: "process-tree",
    validationState: initialProjection.validationState,
    validationProgress: initialProjection.validationProgress,
    textState: initialProjection.textState,
    blockingFindings: 0,
    baselineCreated: initialProjection.baselineCreated,
    snapshotCount: 0,
    lastSnapshotName: "",
    autosaveState: "saved" as SaveState,
    lastAction: "已打开 Draft r18",
    activeContextId: initialProjection.contexts[0]?.id ?? "",
    contexts: initialProjection.contexts,
    nodes: initialProjection.contexts[0]?.nodes ?? [],
    relations: initialProjection.contexts[0]?.relations ?? [],
    findings: initialProjection.findings,
  });

  const activeProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value));
  const activeModel = computed(() => models.value.find((model) => model.id === activeModelId.value));
  const projectModels = computed(() => models.value.filter((model) => model.projectId === activeProjectId.value));
  const activeContext = computed(() => workbench.contexts.find((context) => context.id === workbench.activeContextId));
  const activeTextTraces = computed(() => activeContext.value ? createMockTextTraces(activeContext.value) : []);
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
    const projection = createMockWorkspaceProjection(model);
    const context = projection.contexts[0];
    workbench.resourceState = projection.resourceState;
    workbench.revision = projection.revision;
    workbench.accessMode = "editable-draft";
    workbench.commandState = "idle";
    workbench.commandFeedback = "";
    workbench.zoom = 100;
    workbench.bottomTab = "text";
    workbench.navigationMode = "process-tree";
    workbench.validationState = projection.validationState;
    workbench.validationProgress = projection.validationProgress;
    workbench.textState = projection.textState;
    workbench.blockingFindings = 0;
    workbench.baselineCreated = projection.baselineCreated;
    workbench.snapshotCount = 0;
    workbench.lastSnapshotName = "";
    workbench.autosaveState = "saved";
    workbench.lastAction = `已打开 Draft r${model.revision}`;
    workbench.contexts = projection.contexts;
    workbench.findings = projection.findings;
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

  function restoreWorkbenchLocation(requestedRevision: number | undefined, requestedContextId: string | undefined) {
    const defaultContext = workbench.contexts[0];
    if (!defaultContext) return { revision: workbench.revision, contextId: "" };

    const isCurrentRevision = requestedRevision === undefined || requestedRevision === workbench.revision;
    const context = isCurrentRevision && requestedContextId
      ? workbench.contexts.find((item) => item.id === requestedContextId)
      : undefined;
    const resolvedContext = context ?? defaultContext;

    applyContextProjection(resolvedContext);
    if (!isCurrentRevision || (requestedContextId && !context)) {
      workbench.lastAction = "请求的修订或 Context 不可用，已打开当前 Draft 的根 Context。";
    }
    return { revision: workbench.revision, contextId: resolvedContext.id };
  }

  function createProject(name: string, description: string) {
    const project = createMockProject(`project-${Date.now()}`, name, description);
    projects.value.unshift(project);
    activeProjectId.value = project.id;
    closeOverlay();
    notify("设计确认项目已创建，尚未写入本地运行时。");
    return project;
  }

  function createModel(name: string) {
    const project = activeProject.value;
    if (!project) return null;
    const model = createMockModel(`model-${Date.now()}`, project, name);
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

  function blockCanvasTool(message: string) {
    blockCommand(message);
  }

  function addCandidate(kind: "object" | "process") {
    if (isReadonly.value || !activeContext.value) {
      blockCommand("当前访问模式不允许创建语义候选。");
      return;
    }
    const count = workbench.nodes.filter((node) => node.kind === kind).length + 1;
    const node = createMockNode(`${kind}-${Date.now()}`, `${kind === "object" ? "Object" : "Process"} ${count}`, kind, kind === "object" ? 120 : 430, 80 + Math.max(0, count - 2) * 70);
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
    const relation = createMockConsumption(objectNode, processNode, `-${Date.now()}`);
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
    Object.assign(workbench, advanceMockRevision(workbench.revision));
    workbench.lastAction = `属性候选已确认到设计修订 r${workbench.revision}`;
    completeLocalCommand("属性候选已确认到本地设计状态，未调用后端命令。");
  }

  function confirmSemanticZoom() {
    if (isReadonly.value) {
      blockCommand("当前访问模式不允许执行语义缩放。");
      return;
    }
    workbench.commandState = "submitting";
    Object.assign(workbench, advanceMockRevision(workbench.revision));
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
        Object.assign(workbench, completeMockValidation(workbench.revision));
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
    Object.assign(workbench, advanceMockRevision(workbench.revision));
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
    const companion = createMockNode(
      `${preview.refinee.kind}-detail-${Date.now()}`,
      preview.refinee.kind === "process" ? `${preview.refinee.label} Input` : `Inspect ${preview.refinee.label}`,
      preview.refinee.kind === "process" ? "object" : "process",
      preview.refinee.kind === "process" ? 120 : 430,
      180,
    );
    const nodes = preview.refinee.kind === "process" ? [companion, { ...refinee, x: 430, y: 180 }] : [{ ...refinee, x: 120, y: 188 }, companion];
    const context = {
      id: `context-${Date.now()}`,
      name: contextName,
      kind: preview.kind,
      occurrenceCount: nodes.length,
      nodes,
      relations: [createMockConsumption(nodes[0] as OpdNode, nodes[1] as OpdNode)],
      parentContextId: preview.parentContext.id,
      refineeId: preview.refinee.id,
    };
    workbench.contexts.push(context);
    Object.assign(workbench, advanceMockRevision(workbench.revision));
    workbench.findings.push(...createMockFindings([context], workbench.revision));
    applyContextProjection(context);
    workbench.lastAction = `${contextName} 已创建并打开；细化对象为 ${preview.refinee.label}`;
    closeOverlay();
    completeLocalCommand("细化 OPD 已加入对应树，并打开新的设计确认 Context。");
    return true;
  }

  function locateTextTrace(sentenceId: string) {
    const trace = workbench.contexts.flatMap(createMockTextTraces).find((item) => item.sentenceId === sentenceId);
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
    restoreWorkbenchLocation,
    createProject,
    createModel,
    selectConstruct,
    selectContext,
    setViewportZoom,
    setNavigationMode,
    setBottomTab,
    setCanvasTool,
    blockCanvasTool,
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
