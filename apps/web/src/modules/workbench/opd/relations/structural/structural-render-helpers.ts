import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

import { OpdRelationRenderError } from "../../core/relation-definition-registry";
import { nodeDimensions } from "../../core/node-geometry";
import { clearTrunkCoordinate } from "../../core/relation-routing";
import type { OpdRelationDefinition, RelationCellSpec, RelationEdgeSpec, RelationRenderContext, RelationRenderSpec } from "../../core/relation-render-spec";

type StructuralMode = "DIRECTED" | "BIDIRECTIONAL" | "FAN_FILLED" | "FAN_OPEN" | "FAN_EXHIBITION" | "FAN_CLASSIFICATION";

interface StructuralDefinitionConfig {
  readonly capabilityId: string;
  readonly definitionId: string;
  readonly mode: StructuralMode;
}

const openArrowMarker = { name: "block", width: 10, height: 8, open: true, fill: "none", stroke: "#20242a" };
const harpoonMarker = { name: "path", d: "M 0 4 L 8 10", fill: "none", stroke: "#20242a", strokeWidth: 1.6 };

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
      stroke: "#20242a", strokeWidth: 2, sourceMarker: bidirectional ? harpoonMarker : undefined, targetMarker: bidirectional ? harpoonMarker : openArrowMarker,
      captureAnchor: relation.occurrenceId, findingHighlighted: relation.id === context.highlightedFindingTargetId,
    },
  };
  return { relationId: relation.id, occurrenceId: relation.occurrenceId, family: "STRUCTURAL", symbolId: relation.symbolRef, cells: [edge], primaryCellId: edge.id };
}

function fanSpec(relation: ConsumptionRelation, context: RelationRenderContext, mode: StructuralMode): RelationRenderSpec {
  const [root, ...members] = orderedEndpoints(relation);
  const rootNode = root ? (context.nodeById?.get(root.targetId) ?? context.nodes.find((node) => node.id === root.targetId)) : undefined;
  const memberNodes = members.map((member) => (context.nodeById?.get(member.targetId) ?? context.nodes.find((node) => node.id === member.targetId))).filter((node): node is OpdNode => Boolean(node));
  if (!root || !rootNode || !memberNodes.length) throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `Structural fan ${relation.id} 端点不完整`);
  const averageX = memberNodes.reduce((total, node) => total + node.x + nodeDimensions(node).width / 2, 0) / memberNodes.length;
  const averageY = memberNodes.reduce((total, node) => total + node.y + nodeDimensions(node).height / 2, 0) / memberNodes.length;
  const rootX = rootNode.x + nodeDimensions(rootNode).width / 2, rootY = rootNode.y + nodeDimensions(rootNode).height / 2;
  const junctionId = `${relation.id}.junction`;
  const horizontal = Math.abs(averageX - rootX) / nodeDimensions(rootNode).width >= Math.abs(averageY - rootY) / nodeDimensions(rootNode).height;
  const sign = (horizontal ? averageX - rootX : averageY - rootY) >= 0 ? 1 : -1;
  let junctionX = horizontal ? rootX + sign * Math.max(nodeDimensions(rootNode).width / 2 + 36, Math.abs(averageX - rootX) / 2) : rootX;
  let junctionY = horizontal ? rootY : rootY + sign * Math.max(nodeDimensions(rootNode).height / 2 + 36, Math.abs(averageY - rootY) / 2);
  const memberCenters = memberNodes.map(node => ({ x: node.x + nodeDimensions(node).width / 2, y: node.y + nodeDimensions(node).height / 2 }));
  const values = [horizontal ? rootY : rootX, ...memberCenters.map(p => horizontal ? p.y : p.x)];
  const ancestors = new Set<string>();
  for (const endpoint of [rootNode, ...memberNodes]) {
    let node = endpoint;
    while (node.ownerId && !ancestors.has(node.ownerId)) { ancestors.add(node.ownerId); const owner = context.nodes.find(n => n.id === node.ownerId); if (!owner) break; node = owner; }
  }
  const obstacles = context.nodes.filter(node => !ancestors.has(node.id)).map(node => ({ ...node, ...nodeDimensions(node) }));
  const trunk = clearTrunkCoordinate((horizontal ? junctionX : junctionY) + sign * 48, horizontal, [Math.min(...values), Math.max(...values)], obstacles);
  if (memberNodes.length === 1) {
    const rootSize = nodeDimensions(rootNode), memberSize = nodeDimensions(memberNodes[0]!);
    const rootHalf = (horizontal ? rootSize.width : rootSize.height) / 2, memberHalf = (horizontal ? memberSize.width : memberSize.height) / 2;
    const free = Math.abs(horizontal ? averageX - rootX : averageY - rootY) - rootHalf - memberHalf;
    const offset = rootHalf + (free > 24 ? Math.min(32, free / 2) : 32);
    if (horizontal) junctionX = rootX + sign * offset; else junctionY = rootY + sign * offset;
  } else if (horizontal) junctionX = trunk - sign * 48; else junctionY = trunk - sign * 48;
  const branchSide = horizontal ? sign > 0 ? "right" : "left" : sign > 0 ? "bottom" : "top";
  const rootSide = horizontal ? sign > 0 ? "left" : "right" : sign > 0 ? "top" : "bottom";
  const angle = horizontal ? sign > 0 ? 270 : 90 : sign > 0 ? 0 : 180;
  const rootEdge: RelationEdgeSpec = {
    kind: "edge", id: `${relation.id}.root`, source: root.targetId, target: junctionId,
    data: { ...relationData(relation), routeSourceSide: branchSide, routeTargetSide: rootSide }, labels: [],
    line: { stroke: "#20242a", strokeWidth: 2, captureAnchor: relation.occurrenceId, findingHighlighted: relation.id === context.highlightedFindingTargetId },
  };
  const cells: RelationCellSpec[] = [
    {
      kind: "node", id: junctionId, shape: "polygon", x: junctionX - 8, y: junctionY - 8, width: 16, height: 16, zIndex: 3, angle,
      body: { refPoints: "0,24 12,0 24,24", fill: mode === "FAN_FILLED" ? "#20242a" : "#ffffff", stroke: "#20242a", strokeWidth: 1.5 }, label: { text: "" },
    },
    rootEdge,
    ...members.map((member, index): RelationEdgeSpec => ({
      kind: "edge", id: `${relation.id}.member.${index}`, source: junctionId, target: member.targetId,
      data: { ...relationData(relation), routeSourceSide: branchSide, routeTargetSide: rootSide },
      vertices: memberNodes.length === 1 ? [] : horizontal ? [{ x: trunk, y: junctionY }, { x: trunk, y: memberNodes[index]!.y + nodeDimensions(memberNodes[index]!).height / 2 }]
        : [{ x: junctionX, y: trunk }, { x: memberNodes[index]!.x + nodeDimensions(memberNodes[index]!).width / 2, y: trunk }],
      labels: index === 0 ? structuralLabels(relation) : [], line: { stroke: "#20242a", strokeWidth: 2 },
    })),
  ];
  if (mode === "FAN_EXHIBITION") cells.push({
    kind: "node", id: `${junctionId}.inner`, shape: "polygon", x: junctionX - 4, y: junctionY - 4, width: 8, height: 8, zIndex: 4, angle,
    body: { refPoints: "0,12 6,0 12,12", fill: "#20242a", stroke: "#20242a", strokeWidth: 1, pointerEvents: "none" }, label: { text: "" },
  });
  if (mode === "FAN_CLASSIFICATION") cells.push({
    kind: "node", id: `${junctionId}.inner`, shape: "ellipse", x: junctionX - 2.5, y: junctionY - 2.5, width: 5, height: 5, zIndex: 4,
    body: { fill: "#20242a", stroke: "none", pointerEvents: "none" }, label: { text: "" },
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
