<template>
  <div class="graph-canvas-wrap" tabindex="0" aria-label="图谱画布，按 Esc 取消选择" @keydown.esc.stop="emit('select', '')">
    <div ref="host" class="graph-canvas" data-testid="graph-analysis-canvas" role="img" :aria-label="description ?? '过程、对象和状态关系图；可通过搜索结果和详情进行键盘操作'" tabindex="0" @keydown.context-menu.prevent.stop="openKeyboardMenu" @keydown.shift.f10.prevent.stop="openKeyboardMenu" />
    <p v-if="layoutBusy" class="graph-layout-status" role="status">正在布局…</p>
    <p v-if="layoutError" class="graph-layout-status" role="alert">{{ layoutError }} <button type="button" @click="rearrange">重试布局</button></p>
    <button v-if="selectedId" class="graph-clear-selection" type="button" @click="emit('select', '')">取消选择</button>
    <slot />
    <slot name="legend" :zoom-percent="zoomPercent" :set-zoom="setZoom" :fit="fit" :reset-zoom="() => setZoom(100)" :rearrange="rearrange" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Graph } from "@antv/x6";
import type { GraphNode, GraphEdge } from "@/shared/api/generated/draftWorkspaceContract";
import { graphColors, graphNeighborhood, graphRelationColor } from "./graphAnalysisModel";
import type { GraphPosition } from "./graphAnalysisLayout";
import GraphLayoutWorker from "./graphAnalysisLayout.worker?worker&inline";

type CanvasNode = Pick<GraphNode, 'id' | 'label' | 'boundary'> & { kind: string };
type CanvasEdge = Pick<GraphEdge, 'id' | 'source' | 'target' | 'label' | 'direction' | 'relation_type' | 'derived'>;
const props = defineProps<{
  nodes: CanvasNode[]; edges: CanvasEdge[]; selectedId: string; searchIds: string[];
  labels: boolean; active: boolean; identity: string; colors?: Readonly<Record<string, string>>; description?: string;
}>();
const nodeColor = (kind: string) => props.colors?.[kind] ?? graphColors[kind as GraphNode['kind']] ?? '#64748b';
const emit = defineEmits<{ select: [id: string]; contextMenu: [anchor: { clientX: number; clientY: number }] }>();
const host = ref<HTMLElement>(), layoutBusy = ref(false), layoutError = ref("");
const zoomPercent = ref(100);
const minimumLabelScale = 0.3;
const nodeDegrees = computed(() => {
  const degrees = new Map<string, number>();
  for (const edge of props.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
});
let graph: Graph | undefined, resize: ResizeObserver | undefined, worker: Worker | undefined;
let positions: Record<string, GraphPosition> = {}, needFit = true;
const nodeCell = (id: string) => `node:${id}`, edgeCell = (id: string) => `edge:${id}`;
const selectedEdge = computed(() => props.edges.find(edge => edge.id === props.selectedId));
const selectionNodes = computed(() => {
  if (selectedEdge.value) return new Set([selectedEdge.value.source, selectedEdge.value.target]);
  return props.nodes.some(node => node.id === props.selectedId) ? graphNeighborhood(props.selectedId, props.edges, 1) : null;
});
const selectionEdges = computed(() => new Set(props.edges.filter(edge => selectedEdge.value
  ? edge.id === selectedEdge.value.id : edge.source === props.selectedId || edge.target === props.selectedId).map(edge => edge.id)));
function select(id: string) {
  host.value?.parentElement?.focus({ preventScroll: true });
  emit("select", props.selectedId === id ? "" : id);
}
function openKeyboardMenu() {
  const bounds = host.value?.getBoundingClientRect();
  if (bounds) emit("contextMenu", { clientX: bounds.left + 24, clientY: bounds.top + 24 });
}

function stopLayout() { worker?.terminate(); worker = undefined; layoutBusy.value = false; }
function setZoom(percent: number) { graph?.zoomTo(Math.max(0.0001, Math.min(4, percent / 100))); }
function fit() {
  if (!props.active || !props.nodes.length || !graph || !host.value) return;
  const points = props.nodes.map(node => positions[node.id]).filter((p): p is GraphPosition => !!p);
  if (!points.length) return;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  graph.zoomTo(Math.max(0.1, Math.min(1.2, (host.value.clientWidth - 100) / (Math.max(...xs) - Math.min(...xs) + 160),
    (host.value.clientHeight - 80) / (Math.max(...ys) - Math.min(...ys) + 80))));
  graph.centerContent(); updateLabels();
}
function focus(id: string) { const cell = graph?.getCellById(nodeCell(id)); if (cell) { if (graph!.zoom() < 0.8) graph!.zoomTo(0.8); graph?.centerCell(cell); updateLabels(); } }
let hoveredId = "", hoveredEdgeId = "";
const labelSettings = new Map<string, { text: string; size: number }>();
function updateLabels() {
  if (!graph || !props.active) return;
  const scale = graph.zoom(); zoomPercent.value = Math.round(scale * 10000) / 100;
  const occupied = new Map<string, Array<{ x: number; y: number; width: number }>>();
  const priorityOf = (id: string) => id === props.selectedId || selectedEdge.value && selectionNodes.value?.has(id) ? 4 : id === hoveredId ? 3 : props.searchIds.includes(id) ? 2 : selectionNodes.value?.has(id) ? 1 : 0;
  const ordered = [...props.nodes].sort((a, b) => priorityOf(b.id) - priorityOf(a.id) || (nodeDegrees.value.get(b.id) ?? 0) - (nodeDegrees.value.get(a.id) ?? 0));
  const viewportWidth = host.value?.clientWidth || 800, viewportHeight = host.value?.clientHeight || 400;
  const labelBudget = Math.max(12, Math.floor(viewportWidth * viewportHeight / 6500));
  let shown = 0;
  for (const node of ordered) {
    const cell = graph.getCellById(nodeCell(node.id)); if (!cell?.isNode()) continue;
    const chosen = props.selectedId === node.id || !!selectedEdge.value && selectionNodes.value?.has(node.id);
    const p = cell.getPosition(), radius = (node.kind === "STATE" ? 5.5 : 7) * Math.sqrt(scale);
    cell.attr('body/refR', null);
    cell.attr('body/r', radius / scale);
    cell.attr('body/strokeWidth', (props.selectedId === node.id || props.searchIds.includes(node.id) ? 4 : 0.7) / scale);
    cell.attr('label/refX', 10 + (radius + 5) / scale);
    const point = graph.localToGraph(p.x + 10, p.y + 10);
    const x = point.x + radius + 5;
    let y = point.y, labelOffsetY = 0;
    const width = Math.min(145, [...node.label].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 12 : 7), 0));
    const priority = priorityOf(node.id);
    const gx = Math.floor(x / 240);
    const collides = () => {
      const gy = Math.floor(y / 24);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++)
        if ((occupied.get(`${gx + ox},${gy + oy}`) ?? []).some(box => x < box.x + box.width + 8 && x + width + 8 > box.x && Math.abs(y - box.y) < 19)) return true;
      return false;
    };
    const inViewport = x < viewportWidth && x + width > 0 && y + 9 > 0 && y - 9 < viewportHeight;
    if (inViewport && selectedEdge.value && chosen) while (collides()) { y += 24; labelOffsetY += 24; }
    cell.attr('label/refY', 10 + labelOffsetY / scale);
    const collision = collides(), gy = Math.floor(y / 24);
    const visible = props.labels && scale >= minimumLabelScale && inViewport && (!selectionNodes.value || priority > 0)
      && (priority === 4 || (!selectedEdge.value && priority >= 2) || !collision && shown < labelBudget);
    const text = visible ? node.label : "", size = 12 / scale, previous = labelSettings.get(node.id);
    if (previous?.text !== text) { cell.attr("label/text", text); cell.attr('label/display', visible ? '' : 'none'); }
    if (previous?.size !== size) {
      cell.attr("label/fontSize", size);
      cell.attr("label/textWrap", { width: 145 / scale, height: 18 / scale, ellipsis: true });
    }
    labelSettings.set(node.id, { text, size });
    if (visible) { shown++; const key = `${gx},${gy}`, bucket = occupied.get(key) ?? []; bucket.push({ x, y, width }); occupied.set(key, bucket); }
  }
  for (const edge of props.edges) {
    const cell = graph.getCellById(edgeCell(edge.id));
    if (cell?.isEdge()) cell.setLabels(edgeLabels(edge));
  }
}
function edgeLabels(edge: CanvasEdge) {
  return props.labels && (graph?.zoom() ?? 1) >= minimumLabelScale
    && ((!selectionNodes.value && props.edges.length < 180) || selectionEdges.value.has(edge.id) || edge.id === hoveredEdgeId)
    ? [{ attrs: { label: { text: edge.label, fontSize: (edge.id === hoveredEdgeId ? 13 : 12) / (graph?.zoom() ?? 1), fill: "#64748b" }, body: { fill: "#fff", fillOpacity: 0.8 } } }] : [];
}
function styleSelection() {
  if (!graph) return;
  const neighbors = selectionNodes.value;
  for (const node of props.nodes) {
    const cell = graph.getCellById(nodeCell(node.id));
    const prominent = !neighbors || neighbors.has(node.id) || props.searchIds.includes(node.id) || node.id === hoveredId;
    cell?.attr("body/opacity", prominent ? 1 : 0.18);
    cell?.attr("body/stroke", props.selectedId === node.id || selectedEdge.value && neighbors?.has(node.id) ? "#0f172a" : props.searchIds.includes(node.id) ? "#f59e0b" : node.boundary ? "#f0aa32" : "#fff");
    cell?.attr("label/opacity", prominent ? 1 : 0.18);
  }
  for (const edge of props.edges) {
    const chosen = edge.id === props.selectedId;
    const connected = selectionEdges.value.has(edge.id);
    const cell = graph.getCellById(edgeCell(edge.id));
    cell?.attr("line/strokeOpacity", chosen ? 1 : neighbors ? connected ? 0.8 : 0.05 : 0.25);
    const arrowOpacity = neighbors && !connected ? 0.08 : chosen || connected ? 1 : 0.55;
    const marker = { name: "classic", size: 5, fill: graphRelationColor(edge.relation_type), stroke: graphRelationColor(edge.relation_type), 'fill-opacity': arrowOpacity, 'stroke-opacity': arrowOpacity };
    cell?.attr("line/targetMarker", edge.direction === "UNDIRECTED" ? null : marker);
    cell?.attr("line/sourceMarker", edge.direction === "BIDIRECTIONAL" ? marker : null);
    cell?.attr("line/strokeWidth", chosen ? 3 : neighbors && connected ? 2 : 0.8);
  }
  updateLabels();
}
function render() {
  if (!graph || !props.active) return;
  const wanted = new Set([...props.nodes.map(node => nodeCell(node.id)), ...props.edges.map(edge => edgeCell(edge.id))]);
  graph.removeCells(graph.getCells().filter(cell => !wanted.has(cell.id)));
  for (const node of props.nodes) {
    const position = positions[node.id] ?? { x: 0, y: 0 };
    const existing = graph.getCellById(nodeCell(node.id));
    if (existing?.isNode()) {
      existing.position(position.x, position.y);
      existing.attr("body/fill", nodeColor(node.kind));
      continue;
    }
    labelSettings.delete(node.id);
    graph.addNode({ id: nodeCell(node.id), shape: "circle", x: position.x, y: position.y, width: 20, height: 20, zIndex: 2,
      attrs: { body: { fill: nodeColor(node.kind), stroke: node.boundary ? "#f0aa32" : "#fff", strokeDasharray: node.boundary ? "3 2" : undefined },
        label: { text: props.labels ? node.label : "", fill: "#334155", fontSize: 12, refX: 27, refY: 10, textAnchor: "start" } },
    });
  }
  const pairs = new Map<string, CanvasEdge[]>();
  for (const edge of props.edges) { const key = JSON.stringify([edge.source, edge.target].sort()); const group = pairs.get(key) ?? []; group.push(edge); pairs.set(key, group); }
  for (const group of pairs.values()) group.forEach((edge, i) => {
    const start = positions[edge.source] ?? { x: 0, y: 0 }, end = positions[edge.target] ?? { x: 0, y: 0 };
    const dx = end.x - start.x, dy = end.y - start.y, distance = Math.max(1, Math.hypot(dx, dy));
    const offset = (i - (group.length - 1) / 2) * 34;
    const vertices = edge.source === edge.target
      ? [{ x: start.x - 35 - i * 12, y: start.y - 50 - i * 12 }, { x: start.x + 45 + i * 12, y: start.y - 50 - i * 12 }]
      : offset ? [{ x: (start.x + end.x) / 2 - dy / distance * offset, y: (start.y + end.y) / 2 + dx / distance * offset }] : [];
    const existing = graph!.getCellById(edgeCell(edge.id));
    if (existing?.isEdge()) {
      existing.setVertices(vertices);
      existing.setConnector({ name: vertices.length ? "smooth" : "normal" });
      existing.attr("line/stroke", graphRelationColor(edge.relation_type));
      return;
    }
    graph!.addEdge({ id: edgeCell(edge.id), source: nodeCell(edge.source), target: nodeCell(edge.target), vertices, zIndex: 1,
      connector: { name: vertices.length ? "smooth" : "normal" }, attrs: { line: { stroke: graphRelationColor(edge.relation_type), strokeWidth: 0.8,
        strokeDasharray: edge.derived ? "4 3" : undefined } },
    });
  });
  styleSelection();
  if (needFit && props.nodes.length) { needFit = false; void nextTick(fit); }
}
function startLayout(relax = false, fixedIds: string[] = []) {
  stopLayout(); layoutError.value = "";
  if (!props.active || !graph) return;
  const missing = props.nodes.some(node => !positions[node.id]);
  if (!missing && !relax) { render(); return; }
  layoutBusy.value = true;
  try {
    const current = new GraphLayoutWorker(); worker = current;
    current.onmessage = (event: MessageEvent<{ positions: Record<string, GraphPosition>; done: boolean }>) => {
      if (worker !== current) return;
      positions = { ...positions, ...event.data.positions };
      if (event.data.done) stopLayout();
      render();
    };
    current.onerror = () => { if (worker !== current) return; stopLayout(); layoutError.value = "图谱布局失败，请重试。"; };
    current.postMessage({ ids: props.nodes.map(node => node.id), edges: props.edges.map(edge => ({ source: edge.source, target: edge.target })), previous: positions,
      relax, fixedIds });
  } catch { stopLayout(); layoutError.value = "当前环境无法启动图谱布局，请重试。"; }
}
function rearrange() { positions = {}; needFit = true; startLayout(); }
function resizeCanvas() {
  const container = host.value?.parentElement;
  if (!props.active || !graph || !container || !container.clientWidth || !container.clientHeight) return;
  graph.resize(container.clientWidth, container.clientHeight);
  updateLabels();
}
onMounted(() => {
  if (!host.value) return;
  graph = new Graph({ container: host.value, background: { color: "#fbfcfd" }, grid: { visible: true, size: 16 }, panning: true,
    mousewheel: { enabled: true, minScale: 0.0001, maxScale: 4 }, interacting: { nodeMovable: true, edgeMovable: false, arrowheadMovable: false, vertexMovable: false, vertexAddable: false, vertexDeletable: false } });
  graph.on("node:click", ({ node }) => select(node.id.slice(5)));
  graph.on("edge:click", ({ edge }) => select(edge.id.slice(5)));
  graph.on("blank:click", () => emit("select", ""));
  graph.on("blank:contextmenu", ({ e }) => { e.preventDefault(); emit("contextMenu", { clientX: e.clientX, clientY: e.clientY }); });
  graph.on("node:mousedown", stopLayout);
  graph.on("node:moved", ({ node }) => {
    const id = node.id.slice(5); positions[id] = node.getPosition(); updateLabels(); startLayout(true, [id]);
  });
  graph.on("node:mouseenter", ({ node }) => { hoveredId = node.id.slice(5); styleSelection(); });
  graph.on("node:mouseleave", () => { hoveredId = ""; styleSelection(); });
  graph.on("scale", updateLabels);
  graph.on("translate", updateLabels);
  graph.on("edge:mouseenter", ({ edge }) => { hoveredEdgeId = edge.id.slice(5); const item = props.edges.find(value => value.id === hoveredEdgeId); if (item) edge.setLabels(edgeLabels(item)); });
  graph.on("edge:mouseleave", ({ edge }) => { hoveredEdgeId = ""; const item = props.edges.find(value => edgeCell(value.id) === edge.id); if (item) edge.setLabels(edgeLabels(item)); });
  resize = new ResizeObserver(resizeCanvas);
  if (host.value.parentElement) resize.observe(host.value.parentElement);
  resizeCanvas(); startLayout();
});
watch(() => [props.nodes, props.edges], () => startLayout());
watch(() => [props.selectedId, props.searchIds], styleSelection);
watch(() => props.labels, updateLabels);
watch(() => props.identity, () => { positions = {}; needFit = true; startLayout(); });
watch(() => props.active, async active => { if (!active) { stopLayout(); return; } await nextTick(); resizeCanvas(); startLayout(); });
onBeforeUnmount(() => { stopLayout(); resize?.disconnect(); graph?.dispose(); });
defineExpose({ focus });
</script>

<style scoped>
.graph-canvas-wrap { position:relative; flex:1; min-width:0; min-height:360px; overflow:hidden; }
.graph-canvas { width:100%; height:100%; position:absolute; inset:0; }
.graph-canvas-wrap button { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-width:32px; min-height:32px; padding:4px 8px; color:#4a5762; font:inherit; font-size:12px; border:1px solid transparent; border-radius:3px; background:#fff; cursor:pointer; }
.graph-canvas-wrap button:hover:not(:disabled) { color:#0b5fae; background:#eaf3fc; border-color:#bfd9f2; }
.graph-canvas-wrap button:focus-visible { outline:2px solid #0b6bcb; outline-offset:2px; }
.graph-canvas-wrap button:disabled { cursor:not-allowed; opacity:.48; }
.graph-clear-selection { position:absolute; bottom:12px; left:12px; }
.graph-layout-status { position:absolute; top:12px; left:12px; background:#fff; padding:8px; border-radius:4px; }
</style>
