import type { Graph } from "@antv/x6";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "./node-geometry";
import { buildRelationRenderSpec } from "./relation-renderer";
import { reconcileRelationRenderSpecs, paintRelationSelection, type X6RelationRenderState } from "./x6-relation-adapter";
import { layoutParallelBinaryRelations } from "./parallel-relation-layout";
import { createBuiltInControlDecoratorRegistry, createBuiltInRelationRegistry } from "../relations/built-in-relation-registries";

/** 模型更新与选择绘制分开，Graph 的生命周期由组件唯一持有。 */
export function createCanvasScene(input: {
  graph: () => Graph | undefined; nodes: () => OpdNode[]; relations: () => ConsumptionRelation[];
  selectedId: () => string; highlightedRelations: () => readonly string[]; findingId: () => string | undefined;
  renderNodes: () => void; updateEditors: () => void;
}) {
  let state = new Map<string, X6RelationRenderState>();
  let byCell = new Map<string, ConsumptionRelation>();
  const definitions = createBuiltInRelationRegistry(), decorators = createBuiltInControlDecoratorRegistry();
  function selected(id: string) { return id === input.selectedId() || id === input.findingId() || input.highlightedRelations().includes(id); }
  function render() {
    const graph = input.graph(); if (!graph) return;
    const nodes = input.nodes(), nodeById = new Map(nodes.map(node => [node.id, node]));
    const nodeCenter = (id: string) => {
      const node = nodeById.get(id); if (!node) return;
      const size = nodeDimensions(node); return { x: node.x + size.width / 2, y: node.y + size.height / 2, ...size };
    };
    const relations = input.relations().filter(relation => (relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId]).every(id => nodeById.has(id)));
    const specs = layoutParallelBinaryRelations(relations.map(relation => buildRelationRenderSpec(relation,
      { nodes, nodeById, highlightedFindingTargetId: input.findingId() }, definitions, decorators)), nodeCenter);
    input.renderNodes();
    state = reconcileRelationRenderSpecs(graph, state, specs.map(spec => ({ ...spec, selected: selected(spec.relationId) })));
    const byRelation = new Map(relations.map(relation => [relation.id, relation])); byCell = new Map();
    for (const entry of state.values()) for (const id of entry.cellIds) byCell.set(id, byRelation.get(entry.spec.relationId)!);
    input.updateEditors();
  }
  function paintSelection() {
    const graph = input.graph(); if (!graph) return;
    for (const [id, entry] of state) {
      const nextSelected = selected(entry.spec.relationId);
      const findingHighlighted = entry.spec.relationId === input.findingId();
      const findingChanged = entry.spec.cells.some(cell => cell.kind === "edge" && cell.line.findingHighlighted !== undefined && cell.line.findingHighlighted !== findingHighlighted);
      if (!!entry.spec.selected === nextSelected && !findingChanged) continue;
      const spec = { ...entry.spec, selected: nextSelected, cells: entry.spec.cells.map(cell => cell.kind === "edge" && cell.line.findingHighlighted !== undefined
        ? { ...cell, line: { ...cell.line, findingHighlighted } } : cell) };
      paintRelationSelection(graph, spec, nextSelected);
      state.set(id, { ...entry, spec, signature: JSON.stringify(spec) });
    }
  }
  function reset() { state.clear(); byCell.clear(); }
  return { render, reset, paintSelection, relationForCell: (id: string) => byCell.get(id), relationState: () => state };
}
