import type { RelationCatalogItem } from "@/shared/types/modeling";

const unavailableReason = "完整画布命令、规则、符号与文本资产尚未接入。";

function relation(
  capabilityId: string,
  group: RelationCatalogItem["group"],
  label: string,
  endpointSummary: string,
  available = false,
): RelationCatalogItem {
  return { capabilityId, group, label, endpointSummary, available, reason: available ? undefined : unavailableReason };
}

export const mockCanvasRelationCatalog: RelationCatalogItem[] = [
  relation("CAP-ISO-PROC-001", "procedural", "Consumption", "Object -> Process", true),
  relation("CAP-ISO-PROC-002", "procedural", "Result", "Process -> Object"),
  relation("CAP-ISO-PROC-003", "procedural", "Effect", "Object <-> Process"),
  relation("CAP-ISO-PROC-004", "procedural", "Agent", "Agent Object -> Process"),
  relation("CAP-ISO-PROC-005", "procedural", "Instrument", "Instrument Object -> Process"),
  relation("CAP-ISO-PROC-006", "procedural", "State-specified Consumption", "Object State -> Process"),
  relation("CAP-ISO-PROC-007", "procedural", "State-specified Result", "Process -> Object State"),
  relation("CAP-ISO-PROC-008", "procedural", "Input-output-specified Effect", "Input State -> Process -> Output State"),
  relation("CAP-ISO-PROC-009", "procedural", "Input-specified Effect", "Input State -> Process -> Object"),
  relation("CAP-ISO-PROC-010", "procedural", "Output-specified Effect", "Object -> Process -> Output State"),
  relation("CAP-ISO-PROC-011", "procedural", "State-specified Agent", "Agent State -> Process"),
  relation("CAP-ISO-PROC-012", "procedural", "State-specified Instrument", "Instrument State -> Process"),
  relation("CAP-ISO-PROC-013", "procedural", "Invocation", "Process -> Process"),
  relation("CAP-ISO-PROC-014", "procedural", "Self-invocation", "Process -> same Process"),
  relation("CAP-ISO-PROC-015", "procedural", "Overtime Exception", "Process -> handling Process"),
  relation("CAP-ISO-PROC-016", "procedural", "Undertime Exception", "Process -> handling Process"),
  relation("CAP-ISO-CTRL-001", "control", "Transforming Event", "Consumption/Effect input"),
  relation("CAP-ISO-CTRL-002", "control", "Enabling Event", "Agent/Instrument"),
  relation("CAP-ISO-CTRL-003", "control", "State-specified Transforming Event", "State Consumption/Effect"),
  relation("CAP-ISO-CTRL-004", "control", "State-specified Enabling Event", "State Agent/Instrument"),
  relation("CAP-ISO-CTRL-005", "control", "Transforming Condition", "Consumption/Effect input"),
  relation("CAP-ISO-CTRL-006", "control", "Enabling Condition", "Agent/Instrument"),
  relation("CAP-ISO-CTRL-007", "control", "State-specified Transforming Condition", "State Consumption/Effect"),
  relation("CAP-ISO-CTRL-008", "control", "State-specified Enabling Condition", "State Agent/Instrument"),
  relation("CAP-ISO-STRUCT-001", "structural", "Unidirectional Tagged", "Thing -> Thing"),
  relation("CAP-ISO-STRUCT-002", "structural", "Unidirectional Null-tagged", "Thing -> Thing"),
  relation("CAP-ISO-STRUCT-003", "structural", "Bidirectional Tagged", "Thing <-> Thing"),
  relation("CAP-ISO-STRUCT-004", "structural", "Reciprocal Tagged", "Thing <-> Thing"),
  relation("CAP-ISO-STRUCT-005", "structural", "Aggregation-participation", "Whole -> Part Things"),
  relation("CAP-ISO-STRUCT-006", "structural", "Exhibition-characterization", "Exhibitor -> Attribute/Operation"),
  relation("CAP-ISO-STRUCT-007", "structural", "Generalization-specialization", "General -> Specialized Things"),
  relation("CAP-ISO-STRUCT-008", "structural", "Classification-instantiation", "Class -> Instance Things"),
  relation("CAP-ISO-STRUCT-009", "structural", "State-specified Characterization", "Thing/State -> Feature/Value State"),
  relation("CAP-ISO-STRUCT-010", "structural", "State-specified Tagged", "State-specified endpoints"),
];
