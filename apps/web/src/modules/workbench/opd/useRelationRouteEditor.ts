import { ref } from "vue";
import type { Edge, Graph } from "@antv/x6";
import type { ConsumptionRelation, EdgeRoute, OpdNode } from "@/shared/types/modeling";
import type { createCanvasScene } from "./core/canvas-scene";
import { useSegmentRouteEditor } from "@/shared/canvas/useSegmentRouteEditor";

export function useRelationRouteEditor(input: {
  graph: () => Graph | undefined;
  host: () => HTMLElement | undefined;
  scene: ReturnType<typeof createCanvasScene>;
  relations: () => ConsumptionRelation[];
  selectedId: () => string;
  nodes?: () => OpdNode[];
  selectedFeatureCellId?: () => string;
  editable: () => boolean;
  change: (occurrenceId: string, route: EdgeRoute) => void;
  actions: (occurrenceId: string, x: number, y: number) => void;
}) {
  const menu = ref<{ x: number; y: number; clientX: number; clientY: number; point: { x: number; y: number } } | null>(null);
  function selectedCells() {
    const featureId = input.selectedFeatureCellId?.();
    if (featureId) {
      const edge = input.graph()?.getCellById(featureId);
      return edge?.isEdge() && edge.getData()?.routeEditable === "true" && targetForEdge(edge)
        ? [{ id: featureId, label: "所属连线" }] : [];
    }
    const relation = input.relations().find(item => item.id === input.selectedId());
    const spec = relation && input.scene.relationState().get(relation.occurrenceId)?.spec;
    return spec ? spec.cells.filter(cell => cell.kind === "edge" && cell.data.routeEditable === "true")
      .map(cell => ({ id: cell.id, label: cell.id === spec.primaryCellId ? "主线段" : "分线段" })) : [];
  }
  function targetForEdge(edge: Edge) {
    const occurrenceId = edge.getData()?.routeOccurrenceId;
    return occurrenceId ? input.nodes?.().find(node => node.occurrenceId === occurrenceId) : input.scene.relationForCell(edge.id);
  }
  const editor = useSegmentRouteEditor({ graph: input.graph, cells: selectedCells, editable: input.editable,
    signature: edge => JSON.stringify(targetForEdge(edge)?.edgeRoutes ?? []),
    change: (edge, points) => {
      const relation = targetForEdge(edge), segment = edge.getData()?.routeSegment;
      if (!relation || !segment) return;
      input.change(relation.occurrenceId, { segment, style: "STRAIGHT", mode: points === null ? "AUTO" : "MANUAL", points: points ?? [] });
      menu.value = null;
    } });
  const { activeCellId, toolbar, dragging, getActive, restore, reset } = editor;
  function sync() { editor.sync(); if (!toolbar.value.length) menu.value = null; }
  function commit(edge: Edge, mode: EdgeRoute["mode"] = "MANUAL") { editor.commit(edge, mode === "AUTO"); }
  function open(edge: Edge, clientX: number, clientY: number, bounds: DOMRect) {
    if (!input.editable() || edge.getData()?.routeEditable !== "true") return false;
    activeCellId.value = edge.id;
    const point = input.graph()!.clientToLocal(clientX, clientY);
    menu.value = { x: Math.max(0, Math.min(clientX - bounds.left, bounds.width - 190)), y: Math.max(0, Math.min(clientY - bounds.top, bounds.height - 220)), clientX, clientY, point: { x: point.x, y: point.y } };
    return true;
  }
  function relationActions() {
    const edge = getActive(), relation = edge && targetForEdge(edge), anchor = menu.value;
    if (relation && anchor) input.actions(relation.occurrenceId, anchor.clientX, anchor.clientY);
    menu.value = null;
  }
  return { menu, toolbar, activeCellId, dragging, sync, restore, commit, open, reset, relationActions };
}
