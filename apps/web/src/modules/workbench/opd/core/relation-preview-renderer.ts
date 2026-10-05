import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import type { Graph } from "@antv/x6";
import type { ConsumptionRelation, OpdNode, ProceduralEndpoint } from "@/shared/types/modeling";

import { createBuiltInControlDecoratorRegistry, createBuiltInRelationRegistry } from "../relations/built-in-relation-registries";
import { buildRelationRenderSpec } from "./relation-renderer";
import type { RelationCellSpec, RelationRenderSpec } from "./relation-render-spec";
import type { RelationPreviewRenderSpec } from "./relation-preview-render-spec";

export class RelationPreviewRenderError extends Error {
  readonly code = "OPD_RELATION_PREVIEW_RENDER_SPEC_INVALID";
}

export interface RelationPreviewParameters {
  readonly duration?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly direction?: "DIRECTED" | "BIDIRECTIONAL";
  readonly collectionCompleteness?: "COMPLETE" | "INCOMPLETE";
}

const relationDefinitions = createBuiltInRelationRegistry();
const controlDecorators = createBuiltInControlDecoratorRegistry();

export function buildCreateRelationPreview(
  option: WorkbenchCapabilityOption,
  nodes: readonly OpdNode[],
  parameters: RelationPreviewParameters = {},
): RelationPreviewRenderSpec {
  if (option.command_type !== "CREATE_FACT" || option.normalized_endpoints.length < 2) {
    throw new RelationPreviewRenderError("CREATE_FACT 候选缺少规范端点");
  }
  const candidateId = `candidate.relation.${option.option_id}`;
  const relation = relationFromOption(candidateId, option, parameters);
  return sanitize(candidateId, option, buildRelationRenderSpec(relation, { nodes }, relationDefinitions, controlDecorators));
}

export function buildControlRelationPreview(
  base: ConsumptionRelation,
  option: WorkbenchCapabilityOption,
  nodes: readonly OpdNode[],
): RelationPreviewRenderSpec {
  if (option.command_type !== "UPDATE_FACT" || !option.base_fact_capability_ref?.capability_id || !base.capabilityId) {
    throw new RelationPreviewRenderError("Control 候选缺少基础 Fact identity");
  }
  const candidateId = `candidate.control.${option.option_id}`;
  const relation: ConsumptionRelation = {
    ...base,
    controlCapability: option.capability_ref.capability_id,
    controlSegment: "PROCESS_INPUT",
  };
  return sanitize(candidateId, option, buildRelationRenderSpec(relation, { nodes }, relationDefinitions, controlDecorators));
}

export function addRelationPreviewRenderSpec(graph: Graph, spec: RelationPreviewRenderSpec) {
  const existingCellIds = new Set(graph.getCells().map((cell) => cell.id));
  spec.cells.forEach((cell) => {
    if (cell.kind === "node") {
      const current = existingCellIds.has(cell.id) ? graph.getCellById(cell.id) : undefined;
      if (current?.isNode()) {
        current.position(cell.x, cell.y);
        if (cell.angle !== undefined) current.rotate(cell.angle, { absolute: true });
        current.attr({ body: cell.body as never, label: cell.label as never });
        return;
      }
      graph.addNode({
        id: cell.id, shape: cell.shape, x: cell.x, y: cell.y, width: cell.width, height: cell.height, zIndex: cell.zIndex, angle: cell.angle,
        attrs: { body: cell.body as never, label: cell.label as never },
      });
      return;
    }
    const line = previewLineAttrs(spec, cell);
    const current = existingCellIds.has(cell.id) ? graph.getCellById(cell.id) : undefined;
    if (current?.isEdge()) {
      current.setLabels(previewLabels(cell));
      current.attr({ line: line as never });
      return;
    }
    graph.addEdge({
      id: cell.id,
      source: cell.source,
      target: cell.target,
      zIndex: 3,
      vertices: cell.vertices,
      router: cell.router,
      labels: previewLabels(cell),
      attrs: { line },
    });
  });
}

function previewLabels(cell: Extract<RelationCellSpec, { kind: "edge" }>) {
  return cell.labels.map((label) => ({
    position: label.position,
    attrs: { label: { text: label.text, fill: "#2f7abf", fontSize: label.fontSize, fontWeight: label.fontWeight } },
  }));
}

function previewLineAttrs(spec: RelationPreviewRenderSpec, cell: Extract<RelationCellSpec, { kind: "edge" }>) {
  return {
    "data-opm-candidate-cell-id": spec.candidateId,
    "data-testid": `p03-candidate-${spec.candidateId}`,
    stroke: "#2f7abf",
    strokeWidth: cell.line.strokeWidth,
    sourceMarker: cell.line.sourceMarker ?? null,
    targetMarker: cell.line.targetMarker ?? null,
  };
}

function relationFromOption(candidateId: string, option: WorkbenchCapabilityOption, parameters: RelationPreviewParameters): ConsumptionRelation {
  const endpoints: ProceduralEndpoint[] = option.normalized_endpoints.map((endpoint) => ({
    role: endpoint.role,
    targetId: endpoint.target_ref.target_id,
    targetKind: endpoint.target_ref.target_kind as ProceduralEndpoint["targetKind"],
    ordinal: endpoint.ordinal,
  }));
  const source = endpoints[0];
  const target = endpoints[1];
  if (!source || !target) throw new RelationPreviewRenderError("候选至少需要两个端点");
  return {
    id: candidateId,
    occurrenceId: `${candidateId}.occurrence`,
    sourceId: source.targetId,
    targetId: target.targetId,
    sourceOccurrenceId: source.targetId,
    targetOccurrenceId: target.targetId,
    symbolRef: option.symbol_descriptor.id,
    layoutRef: `${candidateId}.layout`,
    capabilityId: option.capability_ref.capability_id,
    direction: parameters.direction ?? "DIRECTED",
    endpoints,
    duration: parameters.duration,
    labels: Object.entries(parameters.labels ?? {}).filter(([, text]) => text.trim()).map(([slotId, text]) => ({ slotId, text: text.trim() })),
    collectionCompleteness: parameters.collectionCompleteness ?? "NOT_APPLICABLE",
  };
}

function sanitize(candidateId: string, option: WorkbenchCapabilityOption, committed: RelationRenderSpec): RelationPreviewRenderSpec {
  const idMap = new Map(committed.cells.map((cell, index) => [cell.id, `${candidateId}.cell.${index}`]));
  const cells = committed.cells.map((cell): RelationCellSpec => {
    if (cell.kind === "node") return { ...cell, id: idMap.get(cell.id) ?? `${candidateId}.cell` };
    return {
      ...cell,
      id: idMap.get(cell.id) ?? `${candidateId}.cell`,
      source: idMap.get(cell.source) ?? cell.source,
      target: idMap.get(cell.target) ?? cell.target,
      data: {},
      line: { ...cell.line, captureAnchor: undefined, findingHighlighted: undefined },
    };
  });
  const primaryCellId = idMap.get(committed.primaryCellId);
  if (!primaryCellId || cells.some((cell) => cell.kind === "edge" && cell.line.captureAnchor)) {
    throw new RelationPreviewRenderError("候选 RenderSpec 泄露 committed identity");
  }
  return {
    candidateId,
    capabilityId: option.capability_ref.capability_id,
    symbolDescriptor: option.symbol_descriptor,
    normalizedEndpoints: option.normalized_endpoints,
    cells,
    primaryCellId,
    ephemeral: true,
  };
}
