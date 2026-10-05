import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

import { OpdRelationRenderError } from "../../core/relation-definition-registry";
import { nodeDimensions } from "../../core/node-geometry";
import type { OpdRelationDefinition, RelationCellSpec, RelationEdgeSpec, RelationRenderContext, RelationRenderSpec } from "../../core/relation-render-spec";

type StructuralMode = "DIRECTED" | "BIDIRECTIONAL" | "FAN_FILLED" | "FAN_OPEN" | "FAN_EXHIBITION";

interface StructuralDefinitionConfig {
  readonly capabilityId: string;
  readonly definitionId: string;
  readonly mode: StructuralMode;
}

const arrowMarker = { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#20242a" };

export function createStructuralDefinition(config: StructuralDefinitionConfig): OpdRelationDefinition {
  return {
    definitionId: config.definitionId,
    capabilityId: config.capabilityId,
    family: "STRUCTURAL",
    buildRenderSpec(relation, context) {
      return config.mode.startsWith("FAN_")
        ? fanSpec(relation, context, config.mode)
        : binarySpec(relation, context, config.mode === "BIDIRECTIONAL");
    },
  };
}

function binarySpec(relation: ConsumptionRelation, context: RelationRenderContext, bidirectional: boolean): RelationRenderSpec {
  const [source, target] = orderedEndpoints(relation);
  if (!source || !target) throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `Structural ${relation.id} 缺少两个端点`);
  const edge: RelationEdgeSpec = {
    kind: "edge", id: relation.id, source: source.targetId, target: target.targetId,
    data: relationData(relation), labels: structuralLabels(relation),
    line: {
      stroke: "#20242a", strokeWidth: 2, sourceMarker: bidirectional ? arrowMarker : undefined, targetMarker: arrowMarker,
      captureAnchor: relation.occurrenceId, findingHighlighted: relation.id === context.highlightedFindingTargetId,
    },
  };
  return { relationId: relation.id, occurrenceId: relation.occurrenceId, family: "STRUCTURAL", symbolId: relation.symbolRef, cells: [edge], primaryCellId: edge.id };
}

function fanSpec(relation: ConsumptionRelation, context: RelationRenderContext, mode: StructuralMode): RelationRenderSpec {
  const [root, ...members] = orderedEndpoints(relation);
  const rootNode = root ? context.nodes.find((node) => node.id === root.targetId) : undefined;
  const memberNodes = members.map((member) => context.nodes.find((node) => node.id === member.targetId)).filter((node): node is OpdNode => Boolean(node));
  if (!root || !rootNode || !memberNodes.length) throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `Structural fan ${relation.id} 端点不完整`);
  const averageX = memberNodes.reduce((total, node) => total + node.x + nodeDimensions(node).width / 2, 0) / memberNodes.length;
  const averageY = memberNodes.reduce((total, node) => total + node.y + nodeDimensions(node).height / 2, 0) / memberNodes.length;
  const rootX = rootNode.x + nodeDimensions(rootNode).width / 2, rootY = rootNode.y + nodeDimensions(rootNode).height / 2;
  const junctionId = `${relation.id}.junction`;
  const junctionX = (rootX + averageX) / 2;
  const junctionY = (rootY + averageY) / 2;
  const angle = Math.atan2(rootY - junctionY, rootX - junctionX) * 180 / Math.PI + 90;
  const rootEdge: RelationEdgeSpec = {
    kind: "edge", id: `${relation.id}.root`, source: root.targetId, target: junctionId, data: relationData(relation), labels: [],
    line: { stroke: "#20242a", strokeWidth: 2, captureAnchor: relation.occurrenceId, findingHighlighted: relation.id === context.highlightedFindingTargetId },
  };
  const cells: RelationCellSpec[] = [
    {
      kind: "node", id: junctionId, shape: "polygon", x: junctionX - 12, y: junctionY - 12, width: 24, height: 24, zIndex: 3, angle,
      body: { refPoints: "0,24 12,0 24,24", fill: mode === "FAN_FILLED" ? "#20242a" : "#ffffff", stroke: "#20242a", strokeWidth: 1.5 }, label: { text: "" },
    },
    rootEdge,
    ...members.map((member, index): RelationEdgeSpec => ({
      kind: "edge", id: `${relation.id}.member.${index}`, source: junctionId, target: member.targetId, data: relationData(relation),
      labels: index === 0 ? structuralLabels(relation) : [], line: { stroke: "#20242a", strokeWidth: 2 },
    })),
  ];
  if (mode === "FAN_EXHIBITION") cells.push({
    kind: "node", id: `${junctionId}.inner`, shape: "polygon", x: junctionX - 6, y: junctionY - 6, width: 12, height: 12, zIndex: 4, angle,
    body: { refPoints: "0,12 6,0 12,12", fill: "#20242a", stroke: "#20242a", strokeWidth: 1, pointerEvents: "none" }, label: { text: "" },
  });
  if (relation.collectionCompleteness === "INCOMPLETE") {
    cells.push({ kind: "node", id: `${relation.id}.incomplete`, shape: "rect", x: junctionX - 10, y: junctionY + 14, width: 20, height: 12, zIndex: 4, body: { fill: "transparent", stroke: "transparent" }, label: { text: "...", fill: "#20242a", fontSize: 12, fontWeight: 700 } });
  }
  return { relationId: relation.id, occurrenceId: relation.occurrenceId, family: "STRUCTURAL", symbolId: relation.symbolRef, cells, primaryCellId: rootEdge.id };
}

function orderedEndpoints(relation: ConsumptionRelation) {
  return relation.endpoints?.slice().sort((left, right) => left.ordinal - right.ordinal) ?? [];
}

function relationData(relation: ConsumptionRelation) {
  return { relationId: relation.id, sourceOccurrenceId: relation.sourceOccurrenceId, targetOccurrenceId: relation.targetOccurrenceId, symbolRef: relation.symbolRef, layoutRef: relation.layoutRef };
}

function structuralLabels(relation: ConsumptionRelation) {
  return (relation.labels ?? []).map((label) => ({ position: label.slotId === "forward_tag" ? 0.35 : label.slotId === "reverse_tag" ? 0.65 : 0.5, text: label.text, fontSize: 11, fontWeight: 600 }));
}
