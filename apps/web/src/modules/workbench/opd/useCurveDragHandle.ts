import { ref } from "vue";
import type { Edge, Graph } from "@antv/x6";
import { BEZIER_CONNECTOR } from "./core/bezier-connector";
import type { Point } from "./core/bezier-geometry";

export interface CurveHandle { id: string; x: number; y: number }

/** A virtual midpoint handle: selecting an automatic curve must never materialize a route. */
export function useCurveDragHandle(input: {
  graph: () => Graph | undefined;
  host: () => HTMLElement | undefined;
  edges: () => Edge[];
  editable: () => boolean;
  commit: (edge: Edge) => void;
}) {
  const handles = ref<CurveHandle[]>([]);
  const dragging = ref(false);
  let gesture: { edge: Edge; pointerId: number; element: HTMLElement; pointer: Point; midpoint: Point;
    client: Point; vertices: ReturnType<Edge["getVertices"]>; moved: boolean } | undefined;

  function place(id: string, point: Point): CurveHandle | undefined {
    const graph = input.graph(), host = input.host();
    if (!graph || !host) return;
    const client = graph.localToClient(point), bounds = host.getBoundingClientRect();
    return { id, x: client.x - bounds.left, y: client.y - bounds.top };
  }
  function refresh() {
    if (gesture) return;
    if (!input.editable()) { handles.value = []; return; }
    const graph = input.graph();
    handles.value = input.edges().flatMap(edge => {
      if (edge.getConnector?.()?.name !== BEZIER_CONNECTOR || edge.getVertices().length) return [];
      const view = graph?.findViewByCell(edge);
      const point = view?.isEdgeView?.() ? view.getPointAtRatio(0.5) : null;
      const handle = point && place(edge.id, point);
      return handle ? [handle] : [];
    });
  }
  function detach() {
    const previous = gesture;
    gesture = undefined; dragging.value = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", keydown, true);
    if (previous?.element.hasPointerCapture?.(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancel() {
    const previous = detach();
    if (previous?.moved) previous.edge.setVertices(previous.vertices);
    refresh();
  }
  function start(id: string, event: PointerEvent) {
    if (!input.editable() || event.button !== 0 || gesture || !(event.currentTarget instanceof HTMLElement)) return;
    const graph = input.graph(), edge = input.edges().find(value => value.id === id);
    if (!graph || !edge || edge.getVertices().length) return;
    const view = graph.findViewByCell(edge), midpoint = view?.isEdgeView?.() ? view.getPointAtRatio(0.5) : null;
    if (!midpoint) return;
    const element = event.currentTarget;
    gesture = { edge, pointerId: event.pointerId, element, midpoint, vertices: edge.getVertices(), moved: false,
      pointer: graph.clientToLocal(event.clientX, event.clientY), client: { x: event.clientX, y: event.clientY } };
    event.preventDefault(); event.stopPropagation();
    element.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", keydown, true);
  }
  function move(event: PointerEvent) {
    const current = gesture, graph = input.graph();
    if (!current || !graph || event.pointerId !== current.pointerId) return;
    if (!input.editable()) { cancel(); return; }
    if (!current.moved && Math.hypot(event.clientX - current.client.x, event.clientY - current.client.y) < 3) return;
    event.preventDefault();
    const pointer = graph.clientToLocal(event.clientX, event.clientY);
    const point = { x: current.midpoint.x + pointer.x - current.pointer.x, y: current.midpoint.y + pointer.y - current.pointer.y };
    current.moved = true; dragging.value = true;
    current.edge.setVertices([point]);
    const handle = place(current.edge.id, point);
    if (handle) handles.value = handles.value.map(value => value.id === handle.id ? handle : value);
  }
  function finish(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!input.editable()) { cancel(); return; }
    // Include the release location even if a browser coalesced the last pointermove.
    move(event);
    const previous = detach();
    if (previous?.moved) input.commit(previous.edge);
    refresh();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); cancel();
  }
  function clear() { cancel(); handles.value = []; }
  return { handles, dragging, start, refresh, clear, cancel };
}
