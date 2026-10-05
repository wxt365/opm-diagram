export interface RelationToolLabel {
  readonly zh: string;
  readonly en: string;
}

const relationToolLabels: Readonly<Record<string, RelationToolLabel>> = {
  "CAP-ISO-PROC-001": { zh: "消耗关系", en: "Consumption Link" },
  "CAP-ISO-PROC-002": { zh: "生成关系", en: "Result Link" },
  "CAP-ISO-PROC-003": { zh: "影响关系", en: "Effect Link" },
  "CAP-ISO-PROC-004": { zh: "主体关系", en: "Agent Link" },
  "CAP-ISO-PROC-005": { zh: "手段关系", en: "Instrument Link" },
  "CAP-ISO-PROC-006": { zh: "状态指定消耗关系", en: "State-specified Consumption" },
  "CAP-ISO-PROC-007": { zh: "状态指定生成关系", en: "State-specified Result" },
  "CAP-ISO-PROC-008": { zh: "输入-输出状态指定影响关系", en: "Input-output-specified Effect" },
  "CAP-ISO-PROC-009": { zh: "输入状态指定影响关系", en: "Input-specified Effect" },
  "CAP-ISO-PROC-010": { zh: "输出状态指定影响关系", en: "Output-specified Effect" },
  "CAP-ISO-PROC-011": { zh: "状态指定主体关系", en: "State-specified Agent" },
  "CAP-ISO-PROC-012": { zh: "状态指定手段关系", en: "State-specified Instrument" },
  "CAP-ISO-PROC-013": { zh: "调用关系", en: "Invocation Link" },
  "CAP-ISO-PROC-014": { zh: "自调用关系", en: "Self-invocation Link" },
  "CAP-ISO-PROC-015": { zh: "超时异常关系", en: "Overtime Exception Link" },
  "CAP-ISO-PROC-016": { zh: "欠时异常关系", en: "Undertime Exception Link" },
  "CAP-ISO-CTRL-001": { zh: "转换事件", en: "Transforming Event" },
  "CAP-ISO-CTRL-002": { zh: "使能事件", en: "Enabling Event" },
  "CAP-ISO-CTRL-003": { zh: "状态指定转换事件", en: "State-specified Transforming Event" },
  "CAP-ISO-CTRL-004": { zh: "状态指定使能事件", en: "State-specified Enabling Event" },
  "CAP-ISO-CTRL-005": { zh: "转换条件", en: "Transforming Condition" },
  "CAP-ISO-CTRL-006": { zh: "使能条件", en: "Enabling Condition" },
  "CAP-ISO-CTRL-007": { zh: "状态指定转换条件", en: "State-specified Transforming Condition" },
  "CAP-ISO-CTRL-008": { zh: "状态指定使能条件", en: "State-specified Enabling Condition" },
  "CAP-ISO-STRUCT-001": { zh: "单向标记结构关系", en: "Unidirectional Tagged Structural" },
  "CAP-ISO-STRUCT-002": { zh: "单向无标记结构关系", en: "Unidirectional Null-tagged Structural" },
  "CAP-ISO-STRUCT-003": { zh: "双向标记结构关系", en: "Bidirectional Tagged Structural" },
  "CAP-ISO-STRUCT-004": { zh: "互惠标记结构关系", en: "Reciprocal Tagged Structural" },
  "CAP-ISO-STRUCT-005": { zh: "聚合-参与关系", en: "Aggregation-participation" },
  "CAP-ISO-STRUCT-006": { zh: "展示-特征关系", en: "Exhibition-characterization" },
  "CAP-ISO-STRUCT-007": { zh: "泛化-特化关系", en: "Generalization-specialization" },
  "CAP-ISO-STRUCT-008": { zh: "分类-实例化关系", en: "Classification-instantiation" },
  "CAP-ISO-STRUCT-009": { zh: "状态指定特征关系", en: "State-specified Characterization" },
  "CAP-ISO-STRUCT-010": { zh: "状态指定标记结构关系", en: "State-specified Tagged Structural" },
};

const unavailableReasons: Readonly<Record<string, string>> = {
  CONTROL_REQUIRES_BASE_FACT: "请先选择可附加控制的过程关系 / Select a compatible procedural relation first",
  MODIFIER_COMBINATION_INVALID: "所选过程关系不支持此控制类型 / The selected relation does not support this control",
  READ_ONLY_REVISION: "当前修订只读 / The current revision is read-only",
  REVISION_STALE: "当前修订已过期，请刷新 / The current revision is stale; refresh it first",
};

export const RELATION_TOOL_ASSET_UNAVAILABLE = "关系工具资源不可用 / Relation tool asset is unavailable";
export const RELATION_TOOL_UNAVAILABLE = "当前不可用 / Currently unavailable";

export function resolveRelationToolLabel(capabilityId: string): RelationToolLabel | undefined {
  return relationToolLabels[capabilityId];
}

export function relationToolDisplayName(capabilityId: string): string | undefined {
  const label = resolveRelationToolLabel(capabilityId);
  return label ? `${label.zh} / ${label.en}` : undefined;
}

export function relationToolUnavailableReason(reasonCode?: string): string {
  return reasonCode ? unavailableReasons[reasonCode] ?? RELATION_TOOL_UNAVAILABLE : RELATION_TOOL_UNAVAILABLE;
}
