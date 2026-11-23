import type { GraphAnalysisResult, GraphNode } from "@/shared/api/generated/draftWorkspaceContract";

export const graphKinds: Record<GraphNode["kind"], string> = { PROCESS: "过程", OBJECT: "对象", STATE: "状态" };
export const graphColors: Record<GraphNode["kind"], string> = { PROCESS: "#13a34b", OBJECT: "#2864ed", STATE: "#9435db" };
const proceduralColors = ["#ea580c", "#16a34a", "#dc2626", "#0891b2", "#2563eb", "#c2410c", "#15803d", "#be123c", "#e11d48", "#9f1239", "#0e7490", "#1d4ed8", "#7c3aed", "#a855f7", "#d97706", "#b45309"];
const structuralColors = ["#64748b", "#475569", "#78716c", "#a16207", "#0d9488", "#ca8a04", "#9333ea", "#0284c7", "#a3a31b", "#c026d3"];
export function graphRelationColor(id: string) {
  if (id === "STATE_OF") return "#8b5cf6";
  const match = /^CAP-ISO-(PROC|STRUCT)-(\d{3})$/.exec(id);
  if (!match) return "#64748b";
  return (match[1] === "PROC" ? proceduralColors : structuralColors)[Number(match[2]) - 1] ?? "#64748b";
}
const proceduralNames = ["消耗", "生成", "影响", "执行", "工具", "状态限定消耗", "状态限定生成", "输入输出状态限定影响", "输入状态限定影响", "输出状态限定影响", "状态限定执行", "状态限定工具", "调用", "自调用", "超时异常", "欠时异常"];
const structuralNames = ["单向标签关系", "单向关联", "双向标签关系", "互惠关系", "聚合与组成", "表征与特征", "泛化与特化", "类与实例", "状态限定表征", "状态限定标签关系"];
const englishRelationNames = new Set(["Consumption", "Result", "Effect", "Agent", "Instrument", "State-specified Consumption", "State-specified Result", "Input-output-specified Effect", "Input-specified Effect", "Output-specified Effect", "State-specified Agent", "State-specified Instrument", "Invocation", "Self-invocation", "Overtime Exception", "Undertime Exception", "Unidirectional Tagged", "Unidirectional Null-tagged", "Bidirectional Tagged", "Reciprocal Tagged", "Aggregation-participation", "Exhibition-characterization", "Generalization-specialization", "Classification-instantiation", "State-specified Characterization", "State-specified Tagged"]);
const relationNames: Record<string, string> = { STATE_OF: "拥有状态",
  ...Object.fromEntries(proceduralNames.map((name, index) => [`CAP-ISO-PROC-${String(index + 1).padStart(3, "0")}`, name])),
  ...Object.fromEntries(structuralNames.map((name, index) => [`CAP-ISO-STRUCT-${String(index + 1).padStart(3, "0")}`, name])),
};
const endpointNames: Record<string, string> = {
  CONSUMED_OBJECT: "被消耗对象", CONSUMING_PROCESS: "消耗过程", RESULT_PROCESS: "生成过程", RESULT_OBJECT: "生成对象",
  AFFECTEE: "影响前对象", AFFECTING_PROCESS: "影响过程", AFFECTED: "影响后对象", AGENT_OBJECT: "执行对象", ENABLED_PROCESS: "被支持过程",
  INSTRUMENT_OBJECT: "工具对象", CONSUMED_STATE: "被消耗状态", RESULT_STATE: "生成状态", AFFECTEE_INPUT_STATE: "输入状态",
  AFFECTED_OUTPUT_STATE: "输出状态", AFFECTED_OBJECT: "影响后对象", AFFECTEE_OBJECT: "影响前对象", AGENT_STATE: "执行对象状态",
  INSTRUMENT_STATE: "工具对象状态", INVOKING_PROCESS: "调用过程", INVOKED_PROCESS: "被调用过程", MONITORED_PROCESS: "受监控过程", HANDLING_PROCESS: "异常处理过程",
  STRUCTURAL_SOURCE: "关系起点", STRUCTURAL_TARGET: "关系终点", WHOLE_THING: "整体", PART_THING: "组成部分",
  EXHIBITOR_THING: "被表征实体", FEATURE_THING: "特征", GENERAL_THING: "一般实体", SPECIALIZED_THING: "特化实体",
  CLASS_THING: "类", INSTANCE_THING: "实例", EXHIBITOR_THING_OR_STATE: "被表征实体或状态", VALUE_STATE: "取值状态",
  STATE_TAGGED_SOURCE: "状态关系起点", STATE_TAGGED_TARGET: "状态关系终点",
};
export function graphRelationName(id: string, fallback = "其他关系") { return relationNames[id] ?? (/^[^A-Za-z]*$/.test(fallback) ? fallback : "其他关系"); }
export function graphEndpointName(role: string) { return endpointNames[role] ?? "关联端点"; }
export function localizeGraph(data: GraphAnalysisResult): GraphAnalysisResult {
  return { ...data, relation_types: data.relation_types.map(type => ({ ...type, label: graphRelationName(type.id, type.label) })),
    edges: data.edges.map(edge => ({ ...edge, label: englishRelationNames.has(edge.label) || edge.label === edge.relation_type ? graphRelationName(edge.relation_type) : edge.label })),
  };
}
export function graphWarningMessage(code: string) {
  return ({ UNSUPPORTED_NODE: "属性取值或非对象状态暂未纳入图谱。", UNSUPPORTED_RELATION: "该关系类型暂不支持图谱展示。",
    UNSUPPORTED_ENDPOINTS: "关系端点不符合已支持的角色约定。", UNSUPPORTED_ENDPOINT: "关系包含缺失或暂不支持的端点。",
    HIDDEN_STATE: "关系连接到当前建模图中的隐藏状态，可切换整个模型查看。", OUTSIDE_SCOPE: "关系端点超出当前范围，可扩大分析范围查看。" } as Record<string, string>)[code] ?? "部分模型内容暂未展示。";
}
export interface GraphFilters { kinds: string[]; relations: string[] }

export function filterGraph(data: GraphAnalysisResult, filters: GraphFilters) {
  const nodes = data.nodes.filter(node => filters.kinds.includes(node.kind));
  const ids = new Set(nodes.map(node => node.id));
  const edges = data.edges.filter(edge => filters.relations.includes(edge.relation_type) && ids.has(edge.source) && ids.has(edge.target));
  return { nodes, edges };
}

export function graphNeighborhood(id: string, edges: ReadonlyArray<Pick<GraphAnalysisResult["edges"][number], "source" | "target">>, hops: number) {
  const found = new Set([id]); let frontier = new Set([id]);
  for (let i = 0; i < hops; i++) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !found.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !found.has(edge.source)) next.add(edge.source);
    }
    next.forEach(item => found.add(item)); frontier = next;
  }
  return found;
}
