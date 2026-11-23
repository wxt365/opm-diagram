import { ref } from "vue";
import type { Graph } from "@antv/x6";
import type { EdgeRoute, OpdNode } from "@/shared/types/modeling";
import { featureJunctionCellId, featureJunctionPoint, featureJunctionSegment } from "./core/feature-junction";

/** Markers are layout handles, never semantic nodes or relation facts. */
export function useFeatureJunctionEditor(input: {
  graph: () => Graph | undefined; host: () => HTMLElement | undefined;
  nodes: () => OpdNode[]; editable: () => boolean;
  select: () => void; preview: (nodes: OpdNode[]) => void;
  change: (occurrenceId: string, route: EdgeRoute) => void;
}) {
  type Handle = { id: string; ownerId: string; x: number; y: number };
  const handles = ref<Handle[]>([]), selectedId = ref(""), dragging = ref(false);
  let gesture: { owner: OpdNode; pointerId: number; element: HTMLElement; client: { x: number; y: number };
    pointer: { x: number; y: number }; origin: { x: number; y: number }; point: { x: number; y: number }; moved: boolean } | undefined;

  function place(owner: OpdNode, point = featureJunctionPoint(owner)): Handle | undefined {
    const graph = input.graph(), host = input.host();
    if (!graph || !host) return;
    const client = graph.localToClient(point), bounds = host.getBoundingClientRect();
    return { id: featureJunctionCellId(owner), ownerId: owner.id, x: client.x - bounds.left, y: client.y - bounds.top };
  }
  function refresh() {
    if (gesture) return;
    const graph = input.graph();
    handles.value = input.editable() ? input.nodes().flatMap(owner => {
      if (owner.occurrenceRole !== "owned" || (owner.kind !== "object" && owner.kind !== "process")
        || !graph?.getCellById(featureJunctionCellId(owner))) return [];
      const handle = place(owner); return handle ? [handle] : [];
    }) : [];
    if (!handles.value.some(handle => handle.id === selectedId.value)) selectedId.value = "";
  }
  function route(owner: OpdNode, points: EdgeRoute["points"], mode: EdgeRoute["mode"] = "MANUAL"): EdgeRoute {
    return { segment: featureJunctionSegment(owner), style: "STRAIGHT", mode, points };
  }
  function preview(owner: OpdNode, point: { x: number; y: number }) {
    const next = route(owner, [point]);
    input.preview(input.nodes().map(node => node.id === owner.id
      ? { ...node, edgeRoutes: [...(node.edgeRoutes ?? []).filter(value => value.segment !== next.segment), next] } : node));
  }
  function detach() {
    const previous = gesture; gesture = undefined; dragging.value = false;
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", keydown, true);
    if (previous?.element.hasPointerCapture?.(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancel() {
    const previous = detach();
    if (previous?.moved) input.preview(input.nodes());
    refresh();
  }
  function clear() { cancel(); selectedId.value = ""; }
  function start(ownerId: string, event: PointerEvent) {
    if (!input.editable() || event.button !== 0 || gesture || !(event.currentTarget instanceof HTMLElement)) return;
    const graph = input.graph(), owner = input.nodes().find(node => node.id === ownerId && node.occurrenceRole === "owned");
    if (!graph || !owner || !handles.value.some(handle => handle.ownerId === ownerId)) return;
    input.select(); selectedId.value = featureJunctionCellId(owner);
    const origin = featureJunctionPoint(owner), element = event.currentTarget;
    gesture = { owner, element, pointerId: event.pointerId, origin, point: origin, moved: false,
      pointer: graph.clientToLocal(event.clientX, event.clientY), client: { x: event.clientX, y: event.clientY } };
    element.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel);
    window.addEventListener("keydown", keydown, true);
  }
  function move(event: PointerEvent) {
    const current = gesture, graph = input.graph();
    if (!current || !graph || current.pointerId !== event.pointerId) return;
    if (!input.editable()) { cancel(); return; }
    if (!current.moved && Math.hypot(event.clientX - current.client.x, event.clientY - current.client.y) < 3) return;
    event.preventDefault();
    const pointer = graph.clientToLocal(event.clientX, event.clientY);
    current.point = { x: current.origin.x + pointer.x - current.pointer.x, y: current.origin.y + pointer.y - current.pointer.y };
    current.moved = true; dragging.value = true; preview(current.owner, current.point);
    const handle = place(current.owner, current.point);
    if (handle) handles.value = handles.value.map(value => value.id === handle.id ? handle : value);
  }
  function finish(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!input.editable()) { cancel(); return; }
    move(event); const previous = detach();
    if (previous?.moved) {
      input.change(previous.owner.occurrenceId, route(previous.owner, [previous.point]));
      input.preview(input.nodes());
    }
    refresh();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
  }
  function reset() {
    if (!input.editable()) return;
    const owner = input.nodes().find(node => featureJunctionCellId(node) === selectedId.value);
    if (owner) input.change(owner.occurrenceId, route(owner, [], "AUTO"));
  }
  return { handles, selectedId, dragging, refresh, start, cancel, clear, reset };
}
