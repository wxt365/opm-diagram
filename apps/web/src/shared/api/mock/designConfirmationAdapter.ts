import type {
  ContextSummary,
  FindingSummary,
  ModelSummary,
  OpdNode,
  ProjectSummary,
  TextTrace,
  TextProjectionState,
  ValidationState,
} from "@/shared/types/modeling";

export const mockProjectFixtures: ProjectSummary[] = [
  { id: "project-raw-material", name: "原料加工系统", description: "原料加工、处理与质量检查的最小 OPM 建模确认。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 1, lastOpenedAt: "今天 09:42", status: "active" },
  { id: "project-warehouse", name: "智能仓储系统", description: "仓储作业与设备协同建模。", profile: "OPM 基础配置 1.0.0", modelCount: 2, lastOpenedAt: "昨天 16:20", status: "active" },
  { id: "project-archived", name: "历史制造线", description: "已归档设计确认项目。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 3, lastOpenedAt: "2026-07-21", status: "archived" },
];

export const mockModelFixtures: ModelSummary[] = [
  { id: "model-processing", projectId: "project-raw-material", name: "原料加工模型", description: "根 SD、对象、过程与 Consumption 的最小闭环。", profile: "ISO 19450:2024 草案 0.1.0", revision: 18, baselineCount: 1, validation: "current", contextCount: 3, lastSavedAt: "09:42" },
  { id: "model-warehouse", projectId: "project-warehouse", name: "仓储履约模型", description: "入库、拣选、出库的初始模型。", profile: "OPM 基础配置 1.0.0", revision: 6, baselineCount: 0, validation: "stale", contextCount: 2, lastSavedAt: "昨天 16:20" },
];

export interface MockWorkspaceProjection {
  resourceState: "ready" | "empty";
  revision: number;
  validationState: ValidationState;
  validationProgress: number;
  textState: TextProjectionState;
  baselineCreated: boolean;
  contexts: ContextSummary[];
  findings: FindingSummary[];
}

export function createMockNode(
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

export function createMockConsumption(source: OpdNode, target: OpdNode, suffix = "") {
  const id = `consumption-${source.id}-${target.id}${suffix}`;
  return {
    id,
    occurrenceId: `occ-${id}`,
    sourceId: source.id,
    targetId: target.id,
    sourceOccurrenceId: source.occurrenceId,
    targetOccurrenceId: target.occurrenceId,
    symbolRef: "symbol.link.consumption",
    layoutRef: `layout-${source.id}-${target.id}${suffix}`,
  };
}

export function createMockContexts(model: ModelSummary): ContextSummary[] {
  if (model.id === "model-warehouse") {
    const inventory = createMockNode("inventory", "Inventory", "object", 120, 188);
    const fulfillment = createMockNode("fulfillment", "Fulfillment", "process", 430, 180);
    const batch = createMockNode("fulfillment-batch", "Fulfillment Batch", "object", 120, 188);
    const dispatch = createMockNode("dispatch", "Dispatch", "process", 430, 180);
    return [
      createMockContext("warehouse-sd", "SD · 智能仓储系统", "system-diagram", [inventory, fulfillment], [createMockConsumption(inventory, fulfillment)]),
      createMockContext("fulfillment-refinement", "Fulfillment refinement", "process-refinement", [batch, dispatch], [createMockConsumption(batch, dispatch)], "warehouse-sd", "fulfillment"),
    ];
  }
  if (model.id !== "model-processing") return [createMockContext("root-sd", "SD · 新模型", "system-diagram", [], [])];

  const rawMaterial = createMockNode("raw-material", "Raw Material", "object", 120, 188);
  const processing = createMockNode("processing", "Processing", "process", 430, 180);
  const input = createMockNode("processing-input", "Processing Input", "object", 120, 188);
  const qualityCheck = createMockNode("quality-check", "Quality Check", "process", 430, 180);
  const rawMaterialReference = { ...rawMaterial, occurrenceId: "occ-raw-material-reference", occurrenceRole: "reference" as const };
  const inspectMaterial = createMockNode("inspect-material", "Inspect Material", "process", 430, 180);
  return [
    createMockContext("raw-material-sd", "SD · 原料加工系统", "system-diagram", [rawMaterial, processing], [createMockConsumption(rawMaterial, processing)]),
    createMockContext("processing-refinement", "Processing refinement", "process-refinement", [input, qualityCheck], [createMockConsumption(input, qualityCheck)], "raw-material-sd", "processing"),
    createMockContext("raw-material-refinement", "Raw Material refinement", "object-refinement", [rawMaterialReference, inspectMaterial], [createMockConsumption(rawMaterialReference, inspectMaterial)], "raw-material-sd", "raw-material"),
    createMockContext("quality-view", "质量检查视图", "model-view", [], [], "raw-material-sd"),
  ];
}

export function createMockWorkspaceProjection(model: ModelSummary): MockWorkspaceProjection {
  const contexts = createMockContexts(model);
  return {
    resourceState: contexts.length ? "ready" : "empty",
    revision: model.revision,
    validationState: model.validation,
    validationProgress: model.validation === "current" ? 100 : 0,
    textState: model.validation === "current" ? "current" : "stale",
    baselineCreated: model.baselineCount > 0,
    contexts,
    findings: createMockFindings(contexts, model.revision),
  };
}

export function createMockFindings(contexts: ContextSummary[], revision: number): FindingSummary[] {
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

export function createMockTextTraces(context: ContextSummary): TextTrace[] {
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

export function createMockProject(id: string, name: string, description: string): ProjectSummary {
  return { id, name, description: description || "待补充项目说明。", profile: "ISO 19450:2024 草案 0.1.0", modelCount: 0, lastOpenedAt: "刚刚", status: "active" };
}

export function createMockModel(id: string, project: ProjectSummary, name: string): ModelSummary {
  return { id, projectId: project.id, name, description: "新建模型的设计确认态。", profile: project.profile, revision: 1, baselineCount: 0, validation: "stale", contextCount: 1, lastSavedAt: "刚刚" };
}

export function advanceMockRevision(revision: number) {
  return {
    revision: revision + 1,
    textState: "current" as const,
    validationState: "stale" as const,
    validationProgress: 0,
  };
}

export function completeMockValidation(revision: number) {
  return {
    validationState: "current" as const,
    validationProgress: 100,
    lastAction: `校验结果当前，绑定 r${revision}`,
  };
}

function createMockContext(
  id: string,
  name: string,
  kind: ContextSummary["kind"],
  nodes: OpdNode[],
  relations: ReturnType<typeof createMockConsumption>[],
  parentContextId?: string,
  refineeId?: string,
): ContextSummary {
  return { id, name, kind, occurrenceCount: nodes.length, nodes, relations, parentContextId, refineeId };
}
