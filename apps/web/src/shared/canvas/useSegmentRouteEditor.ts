import { computed, ref } from "vue";
import type { Edge, Graph } from "@antv/x6";
import { simplifyOrthogonalPoints } from "./orthogonal";

/** X6 正交线段交互；不识别建模语言或持久化契约。 */
export function useSegmentRouteEditor(input: {
  graph: () => Graph | undefined;
  cells: () => { id: string; label: string }[];
  editable: () => boolean;
  signature: (edge: Edge) => string;
  change: (edge: Edge, points: { x: number; y: number }[] | null) => void;
}) {
  const activeCellId = ref("");
  const version = ref(0);
  const toolbar = computed(() => { void version.value; return input.editable() ? input.cells() : []; });
  let generation = 0;
  let tools = new Map<string, { vertices: ReturnType<Edge["getVertices"]>; router: ReturnType<Edge["getRouter"]>;
    source?: ReturnType<Edge["getSource"]>; target?: ReturnType<Edge["getTarget"]>; signature: string }>();
  const dragging = ref(false);
  function signature(edge: Edge) { return input.signature(edge); }
  function restore() {
    dragging.value = false;
    generation++;
    for (const [id, previous] of tools) {
      const edge = input.graph()?.getCellById(id);
      if (!edge?.isEdge()) continue;
      edge.removeTools?.();
      if (previous.source) edge.setSource(previous.source);
      if (previous.target) edge.setTarget(previous.target);
      if (previous.signature === signature(edge)) {
        edge.setVertices(previous.vertices);
        if (previous.router) edge.setRouter(previous.router); else edge.removeRouter();
      }
    }
    tools = new Map();
  }
  function sync() {
    restore();
    version.value++;
    const graph = input.graph();
    if (!graph || !input.editable()) { return; }
    const cells = input.cells();
    if (!cells.length) { return; }
    for (const cell of cells) {
      const edge = graph.getCellById(cell.id);
      if (!edge?.isEdge()) continue;
      const previous = { vertices: edge.getVertices(), router: edge.getRouter(), source: edge.getSource?.(), target: edge.getTarget?.(), signature: signature(edge) };
      tools.set(edge.id, previous);
      const view = graph.findViewByCell(edge);
      if (previous.router && view?.isEdgeView()) {
        // 先刷新 X6 异步几何，避免手柄沿用节点移动前的路径。
        view.update?.();
        // 仅选中期间物化折点；两端短桩允许直线拖出正交折线。
        const points = simplifyOrthogonalPoints([view.sourcePoint, ...view.routePoints, view.targetPoint]);
        const stub = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          const length = Math.hypot(b.x - a.x, b.y - a.y), ratio = Math.min(24, length / 3) / (length || 1);
          return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
        };
        edge.setVertices([stub(points[0]!, points[1] ?? points[0]!), ...points.slice(1, -1),
          stub(points.at(-1)!, points.at(-2) ?? points.at(-1)!)]);
        edge.removeRouter();
        view.update?.();
      }
      const token = generation;
      edge.addTools?.([{ name: "segments", args: { attrs: (handle: { options: { index?: number } }) => ({ width: 16, height: 7, x: -8, y: -3.5, rx: 2, ry: 2,
        fill: "#ffffff", stroke: "#0b6bcb", "stroke-width": 1.5,
        opacity: handle.options.index === 0 || handle.options.index === edge.getVertices().length ? 0 : 1,
        "pointer-events": handle.options.index === 0 || handle.options.index === edge.getVertices().length ? "none" : "all" }),
        anchor: null, snapRadius: 8, threshold: 16,
        removeRedundancies: false, stopPropagation: true,
        processHandle: (handle: { on: (event: string, callback: () => void) => unknown }) => {
          handle.on("change", () => { dragging.value = true; activeCellId.value = edge.id; });
        },
        onChanged: () => { dragging.value = false; queueMicrotask(() => { if (token === generation) commit(edge); }); } } }]);
    }
    if (!tools.has(activeCellId.value)) activeCellId.value = tools.keys().next().value ?? "";
  }
  function getActive() { const edge = input.graph()?.getCellById(activeCellId.value); return edge?.isEdge() ? edge : undefined; }
  function commit(edge: Edge, automatic = false) {
    if (!input.editable()) { sync(); return; }
    input.change(edge, automatic ? null : simplifyOrthogonalPoints(edge.getVertices()).map(point => ({ x: point.x, y: point.y })));
  }
  function reset() { const edge = getActive(); if (edge) commit(edge, true); }
  return { toolbar, activeCellId, dragging, sync, restore, getActive, commit, reset };
}
