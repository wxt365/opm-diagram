import { ref } from "vue";
import type { Graph } from "@antv/x6";

export function useBlankCanvasPan(getGraph: () => Graph | undefined, allowed: () => boolean) {
  const dragging = ref(false);
  let gesture: { pointerId: number; element: HTMLElement; x: number; y: number; tx: number; ty: number } | undefined;
  let suppressClick = false;
  function start(event: PointerEvent) {
    suppressClick = false;
    if (!allowed() || event.button !== 0 || event.pointerType !== "mouse"
      || !(event.target instanceof Element) || event.target.closest(".x6-cell")) return;
    const graph = getGraph(), element = event.currentTarget;
    if (!graph || !(element instanceof HTMLElement)) return;
    gesture = { pointerId: event.pointerId, element, x: event.clientX, y: event.clientY, ...graph.translate() };
    element.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!allowed()) { stop(); return; }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!dragging.value && Math.hypot(dx, dy) < 4) return;
    dragging.value = true; suppressClick = true;
    event.preventDefault();
    getGraph()?.translate(gesture.tx + dx, gesture.ty + dy);
  }
  function stop() {
    const current = gesture;
    gesture = undefined; dragging.value = false;
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
  }
  function finish(event: PointerEvent) { if (event.pointerId === gesture?.pointerId) stop(); }
  // X6 在鼠标释放时判断 blank:click；拖动后的合成点击不能清空选择。
  function consumesClick() { return suppressClick; }
  return { dragging, start, move, finish, stop, consumesClick };
}
