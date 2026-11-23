import type { Graph } from "@antv/x6";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { buildRelationRenderSpec } from "./relation-renderer";
import { reconcileRelationRenderSpecs, paintRelationSelection, type X6RelationRenderState } from "./x6-relation-adapter";
import { routeRelations } from "./relation-routing";
import { createBuiltInControlDecoratorRegistry, createBuiltInRelationRegistry } from "../relations/built-in-relation-registries";
import { translatedRelationLayouts } from "@/stores/workbench/relationLayout";
import { changedNodeGeometry, edgeIntersectsChanges } from "./routing-invalidation";
import { withProceduralName } from "./procedural-labels";

/** 模型更新与选择绘制分开，Graph 的生命周期由组件唯一持有。 */
export function createCanvasScene(input: {
  graph: () => Graph | undefined; nodes: () => OpdNode[]; relations: () => ConsumptionRelation[];
  selectedId: () => string; highlightedRelations: () => readonly string[]; findingId: () => string | undefined;
  renderNodes: () => void; updateEditors: () => void;
  refineeId?: () => string | undefined;
  relationNameVisible?: (id: string) => boolean;
}) {
  let state = new Map<string, X6RelationRenderState>();
  let byCell = new Map<string, ConsumptionRelation>();
  let geometry = new Map<string, OpdNode>();
  let committedSignature = "", hasPreview = false;
  const definitions = createBuiltInRelationRegistry(), decorators = createBuiltInControlDecoratorRegistry();
  function selected(id: string) { return id === input.selectedId() || id === input.findingId() || input.highlightedRelations().includes(id); }
  function render(previewNodes?: OpdNode[]) {
    const graph = input.graph(); if (!graph) return;
    const nodes = previewNodes ?? input.nodes(), nodeById = new Map(nodes.map(node => [node.id, node]));
    const changes = changedNodeGeometry(geometry, nodes);
    const signature = previewNodes ? "" : JSON.stringify([input.relations(), input.refineeId?.(), input.findingId(),
      input.relations().map(relation => !!input.relationNameVisible?.(relation.id))]);
    // The final drag preview already contains these exact coordinates. A model
    // acknowledgement must not run the same global routing pass a second time.
    if (!previewNodes && hasPreview && !changes.length && geometry.size === nodes.length && signature === committedSignature
      && nodes.every(node => {
        const old = geometry.get(node.id);
        return old && old.kind === node.kind && old.ownerId === node.ownerId && old.label === node.label
          && old.domainTypeLabel === node.domainTypeLabel && JSON.stringify(old.stateRoles) === JSON.stringify(node.stateRoles);
      })) {
      input.renderNodes(); input.updateEditors(); geometry = nodeById; hasPreview = false; return;
    }
    let relations = input.relations().filter(relation => (relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId]).every(id => nodeById.has(id)));
    const allRelations = relations;
    if (previewNodes) {
      const changedIds = new Set(changes.map(change => change.id));
      const affected = relations.filter(relation => {
        const entry = state.get(relation.occurrenceId);
        return !entry || (relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId]).some(id => changedIds.has(id))
          || entry.cellIds.some(id => edgeIntersectsChanges(graph, id, changes, input.refineeId?.() ? [input.refineeId()!] : []));
      });
      // Include peers at shared endpoints so their distributed attachment ports
      // stay consistent. Unrelated relation cells retain their identity/path.
      const endpoints = new Set(affected.flatMap(relation => relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId]));
      relations = relations.filter(relation => (relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId]).some(id => endpoints.has(id)));
    }
    if (previewNodes && relations.some(relation => relation.edgeRoutes?.some(route => route.mode === "MANUAL"))) {
      const translated = new Map(translatedRelationLayouts(relations, input.nodes(), nodes).map(layout => [layout.occurrence_id, layout.layout.edge_routes]));
      relations = relations.map(relation => translated.has(relation.occurrenceId) ? { ...relation, edgeRoutes: translated.get(relation.occurrenceId) } : relation);
    }
    const changedRelations = previewNodes ? new Set(relations.map(relation => relation.id)) : undefined;
    const updatedRelations = new Map(relations.map(relation => [relation.id, relation]));
    const specs = routeRelations(allRelations.map(original => {
      const relation = updatedRelations.get(original.id) ?? original;
      const cached = state.get(relation.occurrenceId);
      if (previewNodes && cached && !changedRelations!.has(relation.id)) return cached.spec;
      return withProceduralName(buildRelationRenderSpec(relation,
        { nodes, nodeById, highlightedFindingTargetId: input.findingId() }, definitions, decorators), relation.capabilityId, !!input.relationNameVisible?.(relation.id));
    }), allRelations.map(relation => updatedRelations.get(relation.id) ?? relation), nodes, input.refineeId?.(), changedRelations)
      .filter(spec => !changedRelations || changedRelations.has(spec.relationId));
    if (!previewNodes) input.renderNodes();
    const previous = previewNodes ? new Map(relations.flatMap(relation => {
      const entry = state.get(relation.occurrenceId); return entry ? [[relation.occurrenceId, entry] as const] : [];
    })) : state;
    const reconciled = reconcileRelationRenderSpecs(graph, previous, specs.map(spec => ({ ...spec, selected: selected(spec.relationId) })));
    state = previewNodes ? new Map([...state, ...reconciled]) : reconciled;
    const byRelation = new Map(input.relations().map(relation => [relation.id, relation])); byCell = new Map();
    for (const entry of state.values()) for (const id of entry.cellIds) byCell.set(id, byRelation.get(entry.spec.relationId)!);
    input.updateEditors();
    // X6 updates adjacent edges itself. Unrelated obstacles only invalidate paths
    // that cross their old/new corridor, including already expanded feature fans.
    if (geometry.size && changes.length) for (const edge of graph.getEdges?.() ?? []) {
      if (edge.getData()?.routeOccurrenceId) continue; // The node layer owns these paths.
      if (edge.getRouter()?.name !== "manhattan") continue;
      if (!edgeIntersectsChanges(graph, edge.id, changes, input.refineeId?.() ? [input.refineeId()!] : [])) continue;
      const view = graph.findViewByCell(edge); if (view?.isEdgeView()) view.update();
    }
    geometry = nodeById;
    if (previewNodes) hasPreview = true;
    else { committedSignature = signature; hasPreview = false; }
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
  function reset() { state.clear(); byCell.clear(); geometry.clear(); committedSignature = ""; hasPreview = false; }
  return { render: () => render(), preview: (nodes: OpdNode[]) => render(nodes), reset, paintSelection, relationForCell: (id: string) => byCell.get(id), relationState: () => state };
}
