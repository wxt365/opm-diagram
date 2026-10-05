import type { NavigationNodeWire, OperationRecordWire, ProjectionConstructWire } from "@/shared/api/localRuntimeApi";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

export interface RuntimeContext {
  id: string;
  label: string;
  kind: string;
  parentId?: string;
  refineeId?: string;
  depth: number;
}

export interface RuntimeTextLine {
  id: string;
  text: string;
  factIds: string[];
  occurrenceIds: string[];
}

export function operationHistoryCode(record: OperationRecordWire): string | null {
  const diagnosticId = record.diagnostic_id;
  if (!diagnosticId) return null;
  const code = diagnosticId.slice(diagnosticId.lastIndexOf(".") + 1);
  return ["VALIDATION_BLOCKED", "REVISION_CONFLICT", "READONLY"].includes(code) ? code : null;
}


export function toContexts(data: { process_tree: NavigationNodeWire[]; object_forest: NavigationNodeWire[]; views: NavigationNodeWire[] }, fallbackId: string): RuntimeContext[] {
  const nodes = [...data.process_tree, ...data.object_forest, ...data.views];
  const all = nodes.length ? nodes : [{ context_id: fallbackId, label: fallbackId, context_kind: "SYSTEM_DIAGRAM", has_children: false }];
  const ordered: RuntimeContext[] = [];
  const seen = new Set<string>();
  function visit(node: NavigationNodeWire, depth: number) {
    if (seen.has(node.context_id)) return;
    seen.add(node.context_id);
    ordered.push({ id: node.context_id, label: node.label, kind: node.context_kind,
      parentId: node.parent_context_id, refineeId: node.refinee_element_id, depth });
    all.filter(item => item.parent_context_id === node.context_id).sort((a, b) => a.context_id.localeCompare(b.context_id))
      .forEach(item => visit(item, depth + 1));
  }
  all.filter(item => !item.parent_context_id).sort((a, b) => a.context_id.localeCompare(b.context_id)).forEach(item => visit(item, 0));
  all.filter(item => !seen.has(item.context_id)).sort((a, b) => a.context_id.localeCompare(b.context_id)).forEach(item => visit(item, 0));
  return ordered;
}


export function toNode(value: ProjectionConstructWire): OpdNode {
  return {
    id: value.target_id,
    occurrenceId: value.occurrence_id,
    label: value.label ?? value.target_id,
    kind: value.construct_role === "PROCESS_NODE" ? "process" : value.construct_role === "ATTRIBUTE_NODE" ? "attribute" : value.construct_role === "OPERATION_NODE" ? "operation" : value.construct_role === "STATE_NODE" || value.construct_role === "FEATURE_STATE_NODE" ? "state" : "object",
    x: value.layout.x,
    y: value.layout.y,
    width: value.layout.width,
    height: value.layout.height,
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


export function toConsumption(value: ProjectionConstructWire, nodes: OpdNode[]): ConsumptionRelation[] {
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


export function toTextLines(sentences: Array<{ sentence_id: string; text: string }>, traces: Array<{ sentence_id: string; fact_ids: string[]; occurrence_ids: string[] }>): RuntimeTextLine[] {
  return sentences.map((sentence) => {
    const trace = traces.find((item) => item.sentence_id === sentence.sentence_id);
    return { id: sentence.sentence_id, text: sentence.text, factIds: trace?.fact_ids ?? [], occurrenceIds: trace?.occurrence_ids ?? [] };
  });
}
