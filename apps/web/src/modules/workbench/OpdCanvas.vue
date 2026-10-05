<template>
  <div ref="canvasHost" class="opd-canvas-host">
    <div
      ref="canvasElement"
      class="opd-canvas"
      :class="{ 'opd-canvas--dragging-blank': blankPan.dragging.value }"
      data-testid="p03-canvas"
      title="滚轮缩放，以鼠标位置为中心；拖动空白处平移画布"
      :data-canvas-tool="interactionTool ?? 'select'"
      :data-relation-gesture-phase="relationGesturePhase ?? 'idle'"
      :data-relation-preview-id="relationPreview?.candidateId ?? ''"
      @pointerdown="startCanvasPointer"
      @pointermove="blankPan.move"
      @pointerup="blankPan.finish"
      @pointercancel="blankPan.finish"
      @lostpointercapture="blankPan.finish"
    />
    <input
      v-if="nameEditor.active"
      ref="nameInput"
      v-model="nameEditor.value"
      class="opd-name-editor"
      data-testid="p03-name-editor"
      aria-label="编辑名称 / Edit name"
      title="Enter 或点击画布完成 / Finish · Escape 取消 / Cancel"
      :aria-busy="nameEditor.submitting"
      :disabled="nameEditor.submitting"
      :style="nameEditor.style"
      @blur="handleNameBlur"
      @compositionend="handleNameCompositionEnd"
      @compositionstart="nameEditor.composing = true"
      @dblclick.stop
      @keydown="handleNameKeydown"
      @mousedown.stop
    >
  </div>
</template>

<script setup lang="ts">
import { createCanvasMovement } from "./opd/core/canvas-movement";
import { createCanvasScene } from "./opd/core/canvas-scene";
import { Graph, type EdgeView } from "@antv/x6";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useCanvasNameEditor } from "./opd/useCanvasNameEditor";
import { createX6NodeLayer } from "./opd/core/x6-node-layer";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import type { RelationGesturePhase } from "./opd/core/relation-gesture-state";
import { addRelationPreviewRenderSpec } from "./opd/core/relation-preview-renderer";
import type { RelationPreviewRenderSpec } from "./opd/core/relation-preview-render-spec";
import { createX6RelationGestureAdapter, type RelationGestureIntent } from "./opd/core/x6-relation-gesture-adapter";
import type { NodeLayout } from "@/stores/workbench/layoutSelection";
import { createCanvasViewport } from "./opd/core/canvas-viewport";
import { useBlankCanvasPan } from "./opd/useBlankCanvasPan";

const props = defineProps<{
  nodes: OpdNode[];
  relations: ConsumptionRelation[];
  selectedId: string;
  selectedIds?: string[];
  highlightedTextNodeIds?: readonly string[];
  highlightedTextRelationIds?: readonly string[];
  refinedElementIds?: readonly string[];
  zoom: number;
  readonly?: boolean;
  keyboardDisabled?: boolean;
  interactionTool?: "select" | "pan";
  relationGesturePhase?: RelationGesturePhase;
  relationPreview?: RelationPreviewRenderSpec;
  highlightedFindingTargetId?: string;
  highlightedFindingNodeIds?: readonly string[];
  beginNameEdit?: (elementId: string) => Promise<boolean>;
  submitNameEdit?: (elementId: string, value: string) => Promise<boolean>;
  relationEditorTarget?: { cellId: string; ratio: number };
  layoutPreview?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  selection: [ids: string[]];
  viewportZoom: [zoom: number];
  moveBatch: [layouts: NodeLayout[]];
  move: [occurrenceId: string, x: number, y: number];
  relationIntent: [intent: RelationGestureIntent];
  relationLabelEditRequested: [relationId: string];
  relationEditorAnchor: [anchor: { clientX: number; clientY: number } | null];
  blankMenuRequested: [anchor: { clientX: number; clientY: number }];
  constructActionsMenuRequested: [occurrenceId: string, anchor: { clientX: number; clientY: number }, activation: "menu" | "direct"];
}>();

const canvasHost = ref<HTMLDivElement>();
const canvasElement = ref<HTMLDivElement>();
const nameInput = ref<HTMLInputElement>();
const collapsedFeatureOwnerIds = ref(new Set(countFeaturesByOwner(props.nodes).keys()));
let featureCountsByOwner = countFeaturesByOwner(props.nodes);
const featureOwnerIds = computed(() => new Set(props.nodes
  .filter((node) => isFeature(node) && node.ownerId)
  .map((node) => node.ownerId as string)));
const effectiveCollapsedFeatureOwnerIds = computed(() => {
  const collapsed = new Set(collapsedFeatureOwnerIds.value);
  props.nodes.filter(node => isFeature(node) && (props.highlightedTextNodeIds?.includes(node.id) || props.highlightedFindingNodeIds?.includes(node.id)))
    .forEach(node => { if (node.ownerId) collapsed.delete(node.ownerId); });
  return collapsed;
});
const visibleNodes = computed(() => {
  const hiddenFeatureIds = new Set(props.nodes
    .filter((node) => isFeature(node) && node.ownerId && effectiveCollapsedFeatureOwnerIds.value.has(node.ownerId))
    .map((node) => node.id));
  return props.nodes.filter((node) => !hiddenFeatureIds.has(node.id)
    && !(node.kind === "state" && node.ownerId && hiddenFeatureIds.has(node.ownerId)));
});
let graph: Graph | undefined;
const blankPan = useBlankCanvasPan(() => graph, () => (props.interactionTool ?? "select") === "select"
  && (props.relationGesturePhase ?? "idle") === "idle");
let pointerPressed = false;
function startCanvasPointer(event: PointerEvent) { pointerPressed = true; blankPan.start(event); }
function releaseCanvasPointer() { pointerPressed = false; }
const { nameEditor, updateNameEditorPosition, openNameEditor, closeNameEditor, finishNameEdit, handleNameKeydown, handleNameBlur, handleNameCompositionEnd } = useCanvasNameEditor(props, canvasHost, nameInput, () => graph, updateRelationEditorAnchor);
const viewport = createCanvasViewport(() => graph, () => canvasElement.value, zoom => emit("viewportZoom", zoom),
  () => props.layoutPreview && window.innerWidth > 820 ? 88 : 32);
defineExpose({ finishNameEdit, fitToView: viewport.fitToView, resetZoom: viewport.resetZoom,
  captureViewport: viewport.captureViewport, restoreViewport: viewport.restoreViewport, locateConstruct });
function locateConstruct(id: string) {
  const cell = graph?.getCellById(id);
  if (cell) graph?.centerCell(cell);
}
let viewportObserver: ResizeObserver | undefined;
const nodeLayerProps = {
  get nodes() { return visibleNodes.value; },
  get selectedId() { return props.selectedId; },
  get selectedIds() { return props.selectedIds; },
  get highlightedTextNodeIds() { return props.highlightedTextNodeIds; },
  get highlightedFindingNodeIds() { return props.highlightedFindingNodeIds; },
  get refinedElementIds() { return props.refinedElementIds; },
  get featureOwnerIds() { return featureOwnerIds.value; },
  get collapsedFeatureOwnerIds() { return effectiveCollapsedFeatureOwnerIds.value; },
};
const { renderNodes, reset: resetNodeLayer, syncGraphPresentation, movePresentation, syncOwnedFeatureRelations } = createX6NodeLayer(nodeLayerProps, () => graph, updateNameEditorPosition);
let suppressDragClick = false;
function selectionForDrag(id: string) { return props.selectedIds?.includes(id) ? props.selectedIds : [id]; }
const movement = createCanvasMovement({ graph: () => graph, nodes: () => props.nodes, visibleNodes: () => visibleNodes.value, selection: selectionForDrag, syncFeatures: syncOwnedFeatureRelations });
let renderedCandidateCellIds: string[] = [];
const scene = createCanvasScene({ graph: () => graph, nodes: () => visibleNodes.value, relations: () => props.relations,
  selectedId: () => props.selectedId, highlightedRelations: () => props.highlightedTextRelationIds ?? [], findingId: () => props.highlightedFindingTargetId,
  renderNodes, updateEditors: updateNameEditorPosition });
const relationForCell = scene.relationForCell;
const relationGestureAdapter = createX6RelationGestureAdapter((intent) => emit("relationIntent", intent));
const dragCellId = "candidate.relation.drag";
function renderGraph() {
  try { scene.render(); reconcileCandidatePreview(); }
  catch (error) {
    graph?.clearCells(); resetNodeLayer(); scene.reset(); renderedCandidateCellIds = [];
    throw error;
  }
}

function toggleOwnedFeatures(ownerId: string, wasCollapsed = effectiveCollapsedFeatureOwnerIds.value.has(ownerId)) {
  const owner = props.nodes.find((node) => node.id === ownerId);
  if (!owner || (owner.kind !== "object" && owner.kind !== "process")
    || !props.nodes.some((node) => isFeature(node) && node.ownerId === ownerId)) return;
  const next = new Set(collapsedFeatureOwnerIds.value);
  if (wasCollapsed) next.delete(ownerId);
  else next.add(ownerId);
  collapsedFeatureOwnerIds.value = next;
  renderGraph();
  viewport.scheduleFit();
}

function isFeature(node: OpdNode) {
  return node.kind === "attribute" || node.kind === "operation";
}

function countFeaturesByOwner(nodes: readonly OpdNode[]) {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    if (isFeature(node) && node.ownerId) counts.set(node.ownerId, (counts.get(node.ownerId) ?? 0) + 1);
  });
  return counts;
}

function reconcileCandidatePreview() {
  if (!props.relationPreview && !renderedCandidateCellIds.length) return;
  const candidateCellIds = new Set(renderedCandidateCellIds);
  graph?.getCells().forEach((cell) => {
    if (cell.id !== dragCellId && (cell.id.startsWith("candidate.relation.") || cell.id.startsWith("candidate.control."))) {
      candidateCellIds.add(cell.id);
    }
  });
  const nextCellIds = new Set(props.relationPreview?.cells.map((cell) => cell.id) ?? []);
  const staleCellIds = [...candidateCellIds].filter((cellId) => !nextCellIds.has(cellId));
  if (staleCellIds.length) graph?.removeCells(staleCellIds);
  renderedCandidateCellIds = [];
  if (!graph || !props.relationPreview) return;
  addRelationPreviewRenderSpec(graph, props.relationPreview);
  renderedCandidateCellIds = props.relationPreview.cells.map((cell) => cell.id);
}

function canMoveNode(node: OpdNode | undefined) {
  return Boolean(node && node.occurrenceRole === "owned" && !props.readonly
    && (props.interactionTool ?? "select") === "select" && (props.relationGesturePhase ?? "idle") === "idle"
    && nameEditor.elementId !== node.id
    && (node.kind !== "state" || props.nodes.some((owner) => owner.id === node.ownerId && owner.occurrenceRole === "owned")));
}

function updateRelationEditorAnchor() {
  const target = props.relationEditorTarget;
  const cell = target && graph?.getCellById(target.cellId);
  const view = cell?.isEdge() ? graph?.findViewByCell(cell) as EdgeView | undefined : undefined;
  const point = target && view?.getPointAtRatio?.(target.ratio);
  const client = point && graph?.localToClient(point);
  emit("relationEditorAnchor", client ? { clientX: client.x, clientY: client.y } : null);
}

function pointer(x: number, y: number) {
  return { x, y };
}

function startRelationDrag(nodeId: string, x: number, y: number) {
  if (!graph || props.relationGesturePhase !== "relation-armed") return;
  const model = props.nodes.find((node) => node.id === nodeId);
  if (!model) return;
  graph.getCellById(dragCellId)?.remove();
  graph.addEdge({
    id: dragCellId,
    source: nodeId,
    target: pointer(x, y),
    zIndex: 4,
    attrs: {
      wrap: { pointerEvents: "none" },
      line: { pointerEvents: "none", stroke: "#2f7abf", strokeDasharray: "6 4", strokeWidth: 2, targetMarker: null },
    },
  });
  relationGestureAdapter.start(model.occurrenceId, pointer(x, y));
}

function moveRelationDrag(x: number, y: number) {
  if (!relationGestureAdapter.activeSourceOccurrenceId()) return;
  graph?.getCellById(dragCellId)?.setProp("target", pointer(x, y));
  relationGestureAdapter.move(pointer(x, y));
}

function finishRelationDrag(x: number, y: number, event?: { shiftKey?: boolean; altKey?: boolean }) {
  if (!relationGestureAdapter.activeSourceOccurrenceId()) return;
  const target = graph?.getNodesFromPoint(pointer(x, y))
    .filter((node) => props.nodes.some((model) => model.id === node.id))
    .sort((left, right) => (right.getZIndex() ?? 0) - (left.getZIndex() ?? 0))[0];
  const model = target ? props.nodes.find((node) => node.id === target.id) : undefined;
  graph?.getCellById(dragCellId)?.remove();
  if (!model) relationGestureAdapter.cancel("INVALID_CELL");
  else relationGestureAdapter.selectEndpoint(model.occurrenceId, pointer(x, y), {
    continueCollection: event?.shiftKey,
    openParameters: event?.altKey,
  });
}

function cancelRelationDrag(reason: "EMPTY_RELEASE" | "INVALID_CELL" | "ESCAPE" | "TOOL_CHANGED" | "CONTEXT_CHANGED") {
  graph?.getCellById(dragCellId)?.remove();
  relationGestureAdapter.cancel(reason);
}

function handleCanvasKeydown(event: KeyboardEvent) {
  if (props.keyboardDisabled || event.defaultPrevented) return;
  if (event.key === "Escape" && props.relationGesturePhase && props.relationGesturePhase !== "idle") cancelRelationDrag("ESCAPE");
  if ((event.key === "Delete" || event.key === "Backspace") && !nameEditor.active && !isTextEntryTarget(event.target)) {
    event.preventDefault();
    const node = props.nodes.find((item) => item.id === props.selectedId);
    const relation = props.relations.find((item) => item.id === props.selectedId);
    if (node || relation) {
      const selectedCellId = node?.id ?? (relation ? scene.relationState().get(relation.occurrenceId)?.spec.primaryCellId : undefined);
      emit("constructActionsMenuRequested", (node ?? relation)?.occurrenceId ?? "", constructMenuAnchor(selectedCellId), "direct");
    }
  }
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function constructMenuAnchor(cellId?: string) {
  const canvasBounds = canvasElement.value?.getBoundingClientRect();
  const cell = cellId ? graph?.getCellById(cellId) : undefined;
  const cellBounds = cell ? graph?.findViewByCell(cell)?.container.getBoundingClientRect() : undefined;
  return {
    clientX: cellBounds?.right ?? ((canvasBounds?.left ?? 0) + (canvasBounds?.width ?? 0) / 2),
    clientY: cellBounds?.top ?? ((canvasBounds?.top ?? 0) + (canvasBounds?.height ?? 0) / 2),
  };
}

onMounted(() => {
  if (!canvasElement.value) return;
  graph = new Graph({
    container: canvasElement.value,
    autoResize: true,
    scaling: { min: 0.0001, max: 4 },
    mousewheel: {
      enabled: true,
      global: false,
      zoomAtMousePosition: true,
      minScale: 0.0001,
      maxScale: 4,
      guard: (event) => !pointerPressed && !event.buttons && Number.isFinite(event.deltaY) && event.deltaY !== 0 && !isTextEntryTarget(event.target),
    },
    background: { color: "#fbfcfd" },
    grid: { visible: true, size: 16 },
    interacting: {
      nodeMovable: (cellView) => {
        const node = props.nodes.find((item) => item.id === cellView.cell.id);
        return canMoveNode(node);
      },
      edgeMovable: false,
      edgeLabelMovable: false,
      arrowheadMovable: false,
      vertexMovable: false,
    },
    panning: {
      enabled: (props.interactionTool ?? "select") === "pan",
      eventTypes: ["leftMouseDown"],
    },
  });
  graph.on("node:click", ({ node, e }) => {
    if ((props.interactionTool ?? "select") === "pan") return;
    if (props.relationGesturePhase && props.relationGesturePhase !== "idle") return;
    if (suppressDragClick) return;
    const relation = relationForCell(node.id);
    if (relation) { emit("select", relation.id); return; }
    if (props.selectedIds !== undefined && (e?.shiftKey || e?.ctrlKey || e?.metaKey)) {
      const ids = new Set(props.selectedIds);
      if (ids.has(node.id)) ids.delete(node.id); else ids.add(node.id);
      emit("selection", [...ids]);
    } else emit("select", node.id);
  });
  graph.on("blank:click", () => {
    if (blankPan.consumesClick()) return;
    if ((props.interactionTool ?? "select") === "select" && (props.relationGesturePhase ?? "idle") === "idle") emit("selection", []);
  });
  graph.on("node:toggle-features", ({ node, e }: { node: { id: string }; e?: { stopPropagation?: () => void } }) => {
    e?.stopPropagation?.();
    const wasCollapsed = effectiveCollapsedFeatureOwnerIds.value.has(node.id);
    emit("select", node.id);
    toggleOwnedFeatures(node.id, wasCollapsed);
  });
  graph.on("node:mousedown", ({ node, x, y }) => {
    movement.start(node.id);
    startRelationDrag(node.id, x, y);
  });
  graph.on("node:mousemove", ({ x, y }) => moveRelationDrag(x, y));
  graph.on("blank:mousemove", ({ x, y }) => moveRelationDrag(x, y));
  graph.on("edge:mousemove", ({ edge, x, y }) => {
    if (edge.id === dragCellId) moveRelationDrag(x, y);
  });
  graph.on("node:mouseup", ({ x, y, e }) => finishRelationDrag(x, y, e));
  graph.on("blank:mouseup", ({ x, y, e }) => finishRelationDrag(x, y, e));
  graph.on("edge:mouseup", ({ edge, x, y, e }) => {
    if (edge.id === dragCellId) finishRelationDrag(x, y, e);
  });
  graph.on("node:dblclick", ({ node }) => {
    if ((props.interactionTool ?? "select") === "pan") return;
    const model = props.nodes.find((item) => item.id === node.id);
    if (!model || model.kind === "state") return;
    emit("select", model.id);
    void openNameEditor(model);
  });
  graph.on("node:moved", ({ node }) => {
    const model = props.nodes.find((item) => item.id === node.id);
    if (!model || !canMoveNode(model)) return;
    suppressDragClick = true;
    setTimeout(() => { suppressDragClick = false; }, 0);
    if (props.selectedIds !== undefined) {
      emit("moveBatch", movement.finish(node.id, node.getPosition()));
    } else {
      const position = movePresentation(model, node.getPosition());
      emit("move", model.occurrenceId, position.x, position.y);
    }
    movement.cancel();
    updateNameEditorPosition();
  });
  graph.on("node:moving", ({ node }) => {
    const model = props.nodes.find((item) => item.id === node.id);
    if (model && canMoveNode(model)) {
      if (props.selectedIds !== undefined) movement.schedule(node.id, node.getPosition());
      else movePresentation(model, node.getPosition());
    }
  });
  graph.on("edge:click", ({ edge }) => {
    if ((props.interactionTool ?? "select") === "pan" || (props.relationGesturePhase ?? "idle") !== "idle") return;
    const relation = relationForCell(edge.id);
    if (relation) emit("select", relation.id);
  });
  graph.on("edge:dblclick", ({ edge }) => {
    if ((props.interactionTool ?? "select") === "pan" || (props.relationGesturePhase ?? "idle") !== "idle") return;
    const relation = props.relations.find((item) => item.id === (edge.getData()?.relationId ?? edge.id));
    if (relation) emit("relationLabelEditRequested", relation.id);
  });
  graph.on("render:done", updateRelationEditorAnchor);
  // 单独 addEdge 不触发批量 render:done，等新视图挂载并完成路径更新后再定位。
  graph.on("view:mounted", () => { void nextTick(updateRelationEditorAnchor); });
  graph.on("blank:contextmenu", ({ e }) => {
    e.preventDefault();
    emit("blankMenuRequested", { clientX: e.clientX, clientY: e.clientY });
  });
  graph.on("node:contextmenu", ({ node, e }) => {
    const model = props.nodes.find((item) => item.id === node.id) ?? relationForCell(node.id);
    if (!model) return;
    e.preventDefault();
    emit("select", model.id);
    emit("constructActionsMenuRequested", model.occurrenceId, { clientX: e.clientX, clientY: e.clientY }, "menu");
  });
  graph.on("edge:contextmenu", ({ edge, e }) => {
    const relation = props.relations.find((item) => item.id === (edge.getData()?.relationId ?? edge.id));
    if (!relation) return;
    e.preventDefault();
    emit("select", relation.id);
    emit("constructActionsMenuRequested", relation.occurrenceId, { clientX: e.clientX, clientY: e.clientY }, "menu");
  });
  graph.on("scale", updateNameEditorPosition);
  graph.on("translate", updateNameEditorPosition);
  graph.on("resize", updateNameEditorPosition);
  graph.on("scale", viewport.viewportChanged);
  graph.on("scale", ({ sx }) => emit("viewportZoom", Math.round(sx * 10000) / 100));
  graph.on("translate", viewport.viewportChanged);
  graph.on("resize", viewport.scheduleFit);
  graph.on("render:done", viewport.scheduleFit);
  if (typeof ResizeObserver !== "undefined") {
    viewportObserver = new ResizeObserver(viewport.scheduleFit);
    if (canvasHost.value?.parentElement) viewportObserver.observe(canvasHost.value.parentElement);
  }
  window.addEventListener("resize", updateNameEditorPosition);
  window.addEventListener("keydown", handleCanvasKeydown);
  window.addEventListener("blur", blankPan.stop);
  window.addEventListener("blur", releaseCanvasPointer);
  window.addEventListener("pointerup", releaseCanvasPointer);
  window.addEventListener("pointercancel", releaseCanvasPointer);
  renderGraph();
  viewport.setZoom(props.zoom);
});

onBeforeUnmount(() => {
  movement.cancel();
  closeNameEditor();
  blankPan.stop();
  window.removeEventListener("blur", blankPan.stop);
  window.removeEventListener("blur", releaseCanvasPointer);
  window.removeEventListener("pointerup", releaseCanvasPointer);
  window.removeEventListener("pointercancel", releaseCanvasPointer);
  viewportObserver?.disconnect();
  viewport.dispose();
  window.removeEventListener("resize", updateNameEditorPosition);
  window.removeEventListener("keydown", handleCanvasKeydown);
  graph?.getCellById(dragCellId)?.remove();
  graph?.dispose();
});

watch(() => [props.nodes, props.relations, props.highlightedTextNodeIds, props.highlightedFindingNodeIds], () => {
  movement.cancel();
  const nextFeatureCounts = countFeaturesByOwner(props.nodes);
  const nextCollapsed = new Set(collapsedFeatureOwnerIds.value);
  nextCollapsed.forEach((ownerId) => {
    if (!nextFeatureCounts.has(ownerId)) nextCollapsed.delete(ownerId);
  });
  nextFeatureCounts.forEach((count, ownerId) => {
    if (count > (featureCountsByOwner.get(ownerId) ?? 0)) nextCollapsed.add(ownerId);
  });
  featureCountsByOwner = nextFeatureCounts;
  collapsedFeatureOwnerIds.value = nextCollapsed;
  renderGraph();
}, { deep: true });
watch(() => [props.selectedId, props.selectedIds, props.refinedElementIds, props.highlightedTextRelationIds, props.highlightedFindingTargetId], () => {
  syncGraphPresentation(); scene.paintSelection();
}, { deep: true });
watch(() => [props.nodes, props.relations, props.layoutPreview], viewport.scheduleFit, { deep: true, flush: "post" });
watch(() => props.zoom, viewport.setZoom);
watch(() => props.relationPreview, () => { reconcileCandidatePreview(); void nextTick(updateRelationEditorAnchor); }, { deep: true, flush: "sync" });
watch(() => props.relationEditorTarget, () => { void nextTick(updateRelationEditorAnchor); }, { deep: true });
watch(() => props.relationGesturePhase, (phase) => {
  blankPan.stop();
  if (phase !== "dragging") graph?.getCellById(dragCellId)?.remove();
});
watch(() => props.interactionTool, (tool) => {
  blankPan.stop();
  if (tool === "pan") graph?.enablePanning();
  else graph?.disablePanning();
});
</script>

<style scoped>
.opd-canvas--dragging-blank,
.opd-canvas--dragging-blank :deep(*) { cursor: grabbing !important; }
</style>
