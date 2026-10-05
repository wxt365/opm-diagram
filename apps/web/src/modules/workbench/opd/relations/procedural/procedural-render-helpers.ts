import type { ConsumptionRelation } from "@/shared/types/modeling";

import { OpdRelationRenderError } from "../../core/relation-definition-registry";
import type { OpdRelationDefinition, RelationEdgeSpec, RelationRenderContext, RelationRenderSpec } from "../../core/relation-render-spec";

type ProceduralMode = "BINARY" | "EFFECT" | "AGENT" | "INSTRUMENT" | "INVOCATION" | "SELF_INVOCATION" | "OVERTIME" | "UNDERTIME";

interface ProceduralDefinitionConfig {
  readonly capabilityId: string;
  readonly definitionId: string;
  readonly mode: ProceduralMode;
}

const arrowMarker = { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#20242a" };
const agentMarker = { name: "circle", r: 5, fill: "#20242a", stroke: "#20242a" };
const instrumentMarker = { name: "circle", r: 5, fill: "#ffffff", stroke: "#20242a" };

export function createProceduralDefinition(config: ProceduralDefinitionConfig): OpdRelationDefinition {
  return {
    definitionId: config.definitionId,
    capabilityId: config.capabilityId,
    family: "PROCEDURAL",
    buildRenderSpec(relation, context) {
      if (config.mode === "EFFECT") return effectSpec(relation, context);
      const marker = config.mode === "AGENT" ? agentMarker : config.mode === "INSTRUMENT" ? instrumentMarker : arrowMarker;
      const exception = config.mode === "OVERTIME" ? "/" : config.mode === "UNDERTIME" ? "//" : "";
      const invocation = config.mode === "INVOCATION";
      const selfInvocation = config.mode === "SELF_INVOCATION";
      const edge = edgeSpec(
        relation.id,
        relation.sourceId,
        relation.targetId,
        relation,
        context,
        "PROCESS_INPUT",
        relation.occurrenceId,
        marker,
        relation.duration ? [{ position: 0.82, text: `${exception} ${relation.duration}`, fontSize: 11 }] : [],
        invocation ? lightningVertices(relation.sourceId, relation.targetId, context) : undefined,
        selfInvocation ? { name: "loop", args: { position: "top", width: 36, height: 28 } } : undefined,
      );
      return { relationId: relation.id, occurrenceId: relation.occurrenceId, family: "PROCEDURAL", symbolId: relation.symbolRef, cells: [edge], primaryCellId: edge.id };
    },
  };
}

function effectSpec(relation: ConsumptionRelation, context: RelationRenderContext): RelationRenderSpec {
  const endpoints = orderedEndpoints(relation);
  const [input, process, output] = endpoints;
  if (!input || !process || !output) throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `Effect ${relation.id} 缺少三个端点`);
  const inputEdge = edgeSpec(`${relation.id}.input`, input.targetId, process.targetId, relation, context, "PROCESS_INPUT", relation.occurrenceId, arrowMarker, []);
  const outputEdge = edgeSpec(`${relation.id}.output`, process.targetId, output.targetId, relation, context, undefined, undefined, arrowMarker, []);
  return { relationId: relation.id, occurrenceId: relation.occurrenceId, family: "PROCEDURAL", symbolId: relation.symbolRef, cells: [inputEdge, outputEdge], primaryCellId: inputEdge.id };
}

function edgeSpec(
  id: string,
  source: string,
  target: string,
  relation: ConsumptionRelation,
  context: RelationRenderContext,
  role: RelationEdgeSpec["role"],
  captureAnchor: string | undefined,
  targetMarker: Record<string, unknown>,
  labels: RelationEdgeSpec["labels"],
  vertices?: RelationEdgeSpec["vertices"],
  router?: RelationEdgeSpec["router"],
): RelationEdgeSpec {
  const touchesState = relation.endpoints?.some((endpoint) =>
    endpoint.targetKind === "STATE" && (endpoint.targetId === source || endpoint.targetId === target));
  return {
    kind: "edge", id, source, target, role, ...(touchesState ? { zIndex: 2.5 } : {}),
    data: relationData(relation),
    line: { stroke: "#20242a", strokeWidth: 2, targetMarker, captureAnchor, findingHighlighted: relation.id === context.highlightedFindingTargetId },
    labels, vertices, router,
  };
}

function orderedEndpoints(relation: ConsumptionRelation) {
  return relation.endpoints?.slice().sort((left, right) => left.ordinal - right.ordinal) ?? [];
}

function relationData(relation: ConsumptionRelation) {
  return {
    relationId: relation.id,
    sourceOccurrenceId: relation.sourceOccurrenceId,
    targetOccurrenceId: relation.targetOccurrenceId,
    symbolRef: relation.symbolRef,
    layoutRef: relation.layoutRef,
  };
}

function lightningVertices(sourceId: string, targetId: string, context: RelationRenderContext) {
  const source = (context.nodeById?.get(sourceId) ?? context.nodes.find((node) => node.id === sourceId));
  const target = (context.nodeById?.get(targetId) ?? context.nodes.find((node) => node.id === targetId));
  if (!source || !target) return [];
  const sourceX = source.x + 84;
  const sourceY = source.y + 42;
  const targetX = target.x + 84;
  const targetY = target.y + 42;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);
  if (length < 48) return [];
  const offsetX = (-dy / length) * 10;
  const offsetY = (dx / length) * 10;
  return [
    { x: sourceX + dx * 0.34 + offsetX, y: sourceY + dy * 0.34 + offsetY },
    { x: sourceX + dx * 0.5 - offsetX, y: sourceY + dy * 0.5 - offsetY },
    { x: sourceX + dx * 0.66 + offsetX, y: sourceY + dy * 0.66 + offsetY },
  ];
}
