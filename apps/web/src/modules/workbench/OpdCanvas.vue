<template>
  <div ref="canvasHost" class="opd-canvas-host">
    <div
      ref="canvasElement"
      class="opd-canvas"
      data-testid="p03-canvas"
      :data-blank-dragging="blankPan.dragging.value"
      title="滚轮缩放，以鼠标位置为中心；拖动空白处平移画布"
      :data-canvas-tool="interactionTool ?? 'select'"
      :data-relation-gesture-phase="relationGesturePhase ?? 'idle'"
      :data-relation-preview-id="relationPreview?.candidateId ?? ''"
      @pointerdown="startCanvasPointer"
      @pointermove="blankPan.move"
      @pointerup="blankPan.finish"
      @pointercancel="blankPan.finish"
      @lostpointercapture="blankPan.finish"
      @dragstart.prevent
    />
    <button
      v-for="handle in junctionEditor.handles.value" :key="handle.id" type="button"
      class="opd-junction-handle" :class="{ 'is-selected': junctionEditor.selectedId.value === handle.id, 'is-dragging': junctionEditor.dragging.value }"
      data-testid="p03-junction-handle" :data-cell-id="handle.id"
      :style="{ left: `${handle.x}px`, top: `${handle.y}px` }"
      title="拖动三角调整汇合位置；Esc 取消" aria-label="拖动所属三角标记"
      @pointerdown.stop.prevent="junctionEditor.start(handle.ownerId, $event)"
      @lostpointercapture="junctionEditor.cancel" @click.stop @contextmenu.stop.prevent
    />
    <div v-if="junctionEditor.selectedId.value" class="opd-route-toolbar" data-testid="p03-junction-toolbar" @pointerdown.stop>
      <span>所属三角标记</span>
      <button type="button" @click="junctionEditor.reset">恢复自动位置</button>
      <small>拖动三角调整汇合位置；调整后保存草稿</small>
    </div>
    <div v-if="routeEditor.toolbar.value.length" class="opd-route-toolbar" data-testid="p03-route-toolbar" @pointerdown.stop>
      <select v-if="routeEditor.toolbar.value.length > 1" v-model="routeEditor.activeCellId.value" aria-label="选择关系线段">
        <option v-for="(cell, index) in routeEditor.toolbar.value" :key="cell.id" :value="cell.id">线段 {{ index + 1 }}</option>
      </select>
      <span>正交折线</span>
      <button type="button" @click="routeEditor.reset">恢复自动</button>
      <small>拖动线段上的蓝色手柄调整路径；调整后保存草稿，重新打开可恢复</small>
    </div>
    <div v-if="routeEditor.menu.value" class="opd-route-menu" data-testid="p03-route-menu" :style="{ left: `${routeEditor.menu.value.x}px`, top: `${routeEditor.menu.value.y}px` }" @pointerdown.stop @contextmenu.prevent>
      <button type="button" @click="routeEditor.reset">恢复自动走线</button>
      <button v-if="!selectedFeatureRouteId" type="button" @click="routeEditor.relationActions">关系操作…</button>
      <button type="button" @click="routeEditor.menu.value = null">关闭</button>
    </div>
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
import { createFeatureToggleClipping } from "./opd/core/feature-toggle-clipping";
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
import { useRelationRouteEditor } from "./opd/useRelationRouteEditor";
import { useFeatureJunctionEditor } from "./opd/useFeatureJunctionEditor";
import { layoutRelationLabels } from "./opd/core/orthogonal-labels";
import { fitRefinementEnvelope } from "./opd/core/refinement-envelope";
import type { EdgeRoute } from "@/shared/types/modeling";
import type { NodeColorPalette } from "@/shared/nodeAppearance";

const props = defineProps<{
  showRelationNames?: boolean;
  nodes: OpdNode[];
  nodeColors?: NodeColorPalette;
  collapsedFeatures?: readonly string[];
  relations: ConsumptionRelation[];
  selectedId: string;
  selectedIds?: string[];
  highlightedTextNodeIds?: readonly string[];
  highlightedTextRelationIds?: readonly string[];
  refinedElementIds?: readonly string[];
  refineeId?: string;
  zoom: number;
  readonly?: boolean;
  keyboardDisabled?: boolean;
  keyboardScope?: boolean;
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
  featureCollapseChange: [ids: string[]];
  selection: [ids: string[]];
  viewportZoom: [zoom: number];
  moveBatch: [layouts: NodeLayout[]];
  routeChange: [occurrenceId: string, route: EdgeRoute];
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
const selectedFeatureRouteId = ref("");
const collapsedFeatureOwnerIds = ref(new Set(props.collapsedFeatures));
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
  const children = new Map<string, string[]>();
  for (const node of props.nodes) if (node.ownerId && (isFeature(node) || node.kind === "state")) {
    const ids = children.get(node.ownerId) ?? []; ids.push(node.id); children.set(node.ownerId, ids);
  }
  const hidden = new Set<string>(), queue = props.nodes.filter(node => isFeature(node) && node.ownerId
    && effectiveCollapsedFeatureOwnerIds.value.has(node.ownerId)).map(node => node.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!; if (hidden.has(id)) continue;
    hidden.add(id); queue.push(...children.get(id) ?? []);
  }
  return fitRefinementEnvelope(props.nodes.filter(node => !hidden.has(node.id)), props.refineeId);
});
let graph: Graph | undefined;
const blankPan = useBlankCanvasPan(() => graph, () => (props.interactionTool ?? "select") === "select"
  && (props.relationGesturePhase ?? "idle") === "idle");
let pointerPressed = false;
function startCanvasPointer(event: PointerEvent) { pointerPressed = true; blankPan.start(event); }
function releaseCanvasPointer() { pointerPressed = false; if (nodeDragging) { nodeDragging = false; scheduleLabels(); } }
const { nameEditor, updateNameEditorPosition, openNameEditor, closeNameEditor, finishNameEdit, handleNameKeydown, handleNameBlur, handleNameCompositionEnd } = useCanvasNameEditor(props, canvasHost, nameInput, () => graph, updateRelationEditorAnchor);
const viewport = createCanvasViewport(() => graph, () => canvasElement.value, zoom => emit("viewportZoom", zoom),
  () => props.layoutPreview && window.innerWidth > 820 ? 88 : 32);
defineExpose({ finishNameEdit, fitToView: viewport.fitToView, resetZoom: viewport.resetZoom,
  getElementPosition: viewport.getElementPosition,
  captureViewport: viewport.captureViewport, restoreViewport: viewport.restoreViewport, locateConstruct });
function locateConstruct(id: string) {
  const relation = props.relations.find(item => item.id === id);
  const primaryId = relation ? scene.relationState().get(relation.occurrenceId)?.spec.primaryCellId : undefined;
  const cell = graph?.getCellById(primaryId ?? id);
  if (!cell || !graph) return false;
  graph.centerCell(cell);
  return true;
}
let viewportObserver: ResizeObserver | undefined;
const nodeLayerProps = {
  get nodeColors() { return props.nodeColors; },
  get nodes() { return visibleNodes.value; },
  get selectedId() { return props.selectedId; },
  get selectedIds() { return props.selectedIds; },
  get highlightedTextNodeIds() { return props.highlightedTextNodeIds; },
  get highlightedFindingNodeIds() { return props.highlightedFindingNodeIds; },
  get refinedElementIds() { return props.refinedElementIds; },
  get refineeId() { return props.refineeId; },
  get featureOwnerIds() { return featureOwnerIds.value; },
  get collapsedFeatureOwnerIds() { return effectiveCollapsedFeatureOwnerIds.value; },
  get selectedFeatureRouteId() { return selectedFeatureRouteId.value; },
};
const { renderNodes, reset: resetNodeLayer, syncGraphPresentation, movePresentation, syncOwnedFeatureRelations } = createX6NodeLayer(nodeLayerProps, () => graph, updateNameEditorPosition);
const syncFeatureToggleClipping = createFeatureToggleClipping(() => graph, () => featureOwnerIds.value);
let suppressDragClick = false;
function selectionForDrag(id: string) { return props.selectedIds?.includes(id) ? props.selectedIds : [id]; }
const movement = createCanvasMovement({ graph: () => graph, nodes: () => props.nodes, visibleNodes: () => visibleNodes.value, selection: selectionForDrag,
  syncFeatures: syncOwnedFeatureRelations, syncRoutes: nodes => scene.preview(nodes) });
let renderedCandidateCellIds: string[] = [];
const scene = createCanvasScene({ graph: () => graph, nodes: () => visibleNodes.value, relations: () => props.relations,
  selectedId: () => props.selectedId, highlightedRelations: () => props.highlightedTextRelationIds ?? [], findingId: () => props.highlightedFindingTargetId,
  renderNodes, updateEditors: () => { updateNameEditorPosition(); syncFeatureToggleClipping(); }, refineeId: () => props.refineeId, relationNameVisible: () => !!props.showRelationNames });
const routeEditor = useRelationRouteEditor({ graph: () => graph, host: () => canvasHost.value, scene, relations: () => props.relations, selectedId: () => props.selectedId,
  nodes: () => props.nodes, selectedFeatureCellId: () => selectedFeatureRouteId.value,
  editable: canEditRoutes,
  change: (id, route) => emit("routeChange", id, route), actions: (id, clientX, clientY) => emit("constructActionsMenuRequested", id, { clientX, clientY }, "menu") });
function canEditRoutes() { return !props.readonly && !props.layoutPreview && (props.interactionTool ?? "select") === "select" && (props.relationGesturePhase ?? "idle") === "idle"; }
const junctionEditor = useFeatureJunctionEditor({ graph: () => graph, host: () => canvasHost.value, nodes: () => visibleNodes.value,
  editable: canEditRoutes, preview: syncOwnedFeatureRelations, change: (id, route) => emit("routeChange", id, route),
  select: () => { selectedFeatureRouteId.value = ""; routeEditor.restore(); routeEditor.menu.value = null; emit("selection", []); } });
const relationForCell = scene.relationForCell;
const relationGestureAdapter = createX6RelationGestureAdapter((intent) => emit("relationIntent", intent));
const dragCellId = "candidate.relation.drag";
let labelFrame = 0;
let nodeDragging = false;
function scheduleLabels() {
  if (!nodeDragging && !labelFrame) labelFrame = requestAnimationFrame(() => { labelFrame = 0; if (!nodeDragging) layoutRelationLabels(graph); });
}
function renderGraph() {
  try {
    junctionEditor.cancel();
    routeEditor.restore(); scene.render(); reconcileCandidatePreview();
    if (selectedFeatureRouteId.value && !graph?.getCellById(selectedFeatureRouteId.value)) selectedFeatureRouteId.value = "";
    void nextTick(routeEditor.sync);
    void nextTick(junctionEditor.refresh);
  }
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
  emit("featureCollapseChange", [...next]);
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
  return Boolean(node && node.id !== props.refineeId && node.occurrenceRole === "owned" && !props.readonly
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
let relationReleaseTimer: ReturnType<typeof setTimeout> | undefined;
function releaseRelationOutsideGraph() {
  // Mouseup over a toolbar or outside the graph does not emit X6's blank/node
  // event. Do not leave a transient gesture active after the button is released.
  clearTimeout(relationReleaseTimer);
  relationReleaseTimer = setTimeout(() => {
    if (relationGestureAdapter.activeSourceOccurrenceId()) cancelRelationDrag("EMPTY_RELEASE");
    else if (props.relationGesturePhase === "dragging") cancelRelationDrag("INVALID_CELL");
  }, 0);
}

function handleCanvasKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") routeEditor.menu.value = null;
  const scope = canvasHost.value?.closest(".opm-workbench");
  if (props.keyboardScope && (!scope || !(event.target instanceof Node) || !scope.contains(event.target))) return;
  if (props.keyboardDisabled || event.defaultPrevented) return;
  if ((selectedFeatureRouteId.value || junctionEditor.selectedId.value) && !isTextEntryTarget(event.target) && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); return; }
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
    autoResize: false,
    scaling: { min: 0.0001, max: 4 },
    mousewheel: {
      enabled: true,
      global: false,
      zoomAtMousePosition: true,
      minScale: 0.0001,
      maxScale: 4,
      guard: (event) => !pointerPressed && !routeEditor.dragging.value && !junctionEditor.dragging.value && !event.buttons && Number.isFinite(event.deltaY) && event.deltaY !== 0 && !isTextEntryTarget(event.target),
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
      vertexMovable: () => !props.readonly && !props.layoutPreview && (props.relationGesturePhase ?? "idle") === "idle",
      vertexAddable: () => !props.readonly && !props.layoutPreview,
      vertexDeletable: () => !props.readonly && !props.layoutPreview,
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
    junctionEditor.clear();
    selectedFeatureRouteId.value = "";
    const relation = relationForCell(node.id);
    if (relation) { emit("select", relation.id); return; }
    if (props.selectedIds !== undefined && (e?.shiftKey || e?.ctrlKey || e?.metaKey)) {
      const ids = new Set(props.selectedIds);
      if (ids.has(node.id)) ids.delete(node.id); else ids.add(node.id);
      emit("selection", [...ids]);
    } else emit("select", node.id);
  });
  graph.on("blank:click", () => {
    routeEditor.menu.value = null;
    if (blankPan.consumesClick()) return;
    junctionEditor.clear();
    selectedFeatureRouteId.value = "";
    if ((props.interactionTool ?? "select") === "select" && (props.relationGesturePhase ?? "idle") === "idle") emit("selection", []);
  });
  graph.on("node:toggle-features", ({ node, e }: { node: { id: string }; e?: { stopPropagation?: () => void } }) => {
    e?.stopPropagation?.();
    const wasCollapsed = effectiveCollapsedFeatureOwnerIds.value.has(node.id);
    junctionEditor.clear();
    selectedFeatureRouteId.value = "";
    emit("select", node.id);
    toggleOwnedFeatures(node.id, wasCollapsed);
  });
  graph.on("node:mousedown", ({ node, x, y }) => {
    routeEditor.restore();
    movement.start(node.id);
    startRelationDrag(node.id, x, y);
  });
  graph.on("node:mousemove", ({ x, y }) => moveRelationDrag(x, y));
  graph.on("blank:mousemove", ({ x, y }) => moveRelationDrag(x, y));
  graph.on("edge:mousemove", ({ edge, x, y }) => {
    if (edge.id === dragCellId) moveRelationDrag(x, y);
  });
  graph.on("node:mouseup", ({ x, y, e }) => { nodeDragging = false; finishRelationDrag(x, y, e); scheduleLabels(); });
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
    nodeDragging = false; scheduleLabels();
    updateNameEditorPosition();
  });
  graph.on("node:moving", ({ node }) => {
    const model = props.nodes.find((item) => item.id === node.id);
    if (model && canMoveNode(model)) {
      nodeDragging = true;
      if (props.selectedIds !== undefined) movement.schedule(node.id, node.getPosition());
      else movePresentation(model, node.getPosition());
    }
  });
  graph.on("edge:click", ({ edge }) => {
    if ((props.interactionTool ?? "select") === "pan" || (props.relationGesturePhase ?? "idle") !== "idle") return;
    junctionEditor.clear();
    if (edge.getData?.()?.routeOccurrenceId) {
      emit("selection", []); selectedFeatureRouteId.value = edge.id; return;
    }
    selectedFeatureRouteId.value = "";
    const relation = relationForCell(edge.id);
    if (relation) emit("select", relation.id);
  });
  graph.on("edge:dblclick", ({ edge }) => {
    if ((props.interactionTool ?? "select") === "pan" || (props.relationGesturePhase ?? "idle") !== "idle") return;
    const relation = props.relations.find((item) => item.id === (edge.getData()?.relationId ?? edge.id));
    if (relation) emit("relationLabelEditRequested", relation.id);
  });
  graph.on("render:done", updateRelationEditorAnchor);
  graph.on("render:done", scheduleLabels);
  // 单独 addEdge 不触发批量 render:done，等新视图挂载并完成路径更新后再定位。
  graph.on("view:mounted", () => { scheduleLabels(); void nextTick(updateRelationEditorAnchor); void nextTick(junctionEditor.refresh); });
  graph.on("blank:contextmenu", ({ e }) => {
    e.preventDefault();
    emit("blankMenuRequested", { clientX: e.clientX, clientY: e.clientY });
  });
  graph.on("node:contextmenu", ({ node, e }) => {
    junctionEditor.clear();
    const model = props.nodes.find((item) => item.id === node.id) ?? relationForCell(node.id);
    if (!model) return;
    e.preventDefault();
    emit("select", model.id);
    emit("constructActionsMenuRequested", model.occurrenceId, { clientX: e.clientX, clientY: e.clientY }, "menu");
  });
  graph.on("edge:contextmenu", ({ edge, e }) => {
    junctionEditor.clear();
    if (edge.getData()?.routeOccurrenceId) {
      e.preventDefault(); emit("selection", []); selectedFeatureRouteId.value = edge.id;
      if (canvasHost.value) routeEditor.open(edge, e.clientX, e.clientY, canvasHost.value.getBoundingClientRect());
      return;
    }
    selectedFeatureRouteId.value = "";
    const relation = props.relations.find((item) => item.id === (edge.getData()?.relationId ?? edge.id));
    if (!relation) return;
    e.preventDefault();
    emit("select", relation.id);
    if (canvasHost.value && routeEditor.open(edge, e.clientX, e.clientY, canvasHost.value.getBoundingClientRect())) return;
    emit("constructActionsMenuRequested", relation.occurrenceId, { clientX: e.clientX, clientY: e.clientY }, "menu");
  });
  graph.on("scale", updateNameEditorPosition);
  graph.on("translate", updateNameEditorPosition);
  graph.on("resize", updateNameEditorPosition);
  for (const event of ["scale", "translate", "resize", "render:done"]) graph.on(event, junctionEditor.refresh);
  graph.on("scale", viewport.viewportChanged);
  graph.on("scale", ({ sx }) => emit("viewportZoom", Math.round(sx * 10000) / 100));
  graph.on("translate", viewport.viewportChanged);
  graph.on("resize", viewport.scheduleFit);
  graph.on("render:done", viewport.scheduleFit);
  viewport.observePresentation();
  const resizeCanvas = () => {
    const bounds = canvasHost.value?.getBoundingClientRect();
    if (!graph || !bounds || bounds.width <= 0 || bounds.height <= 0) return;
    // 向下取整，避免小数尺寸被 X6 四舍五入后撑出滚动条并触发尺寸循环。
    const width = Math.floor(bounds.width), height = Math.floor(bounds.height);
    if (graph.options.width !== width || graph.options.height !== height) graph.resize(width, height);
  };
  resizeCanvas();
  if (typeof ResizeObserver !== "undefined") {
    viewportObserver = new ResizeObserver(() => { resizeCanvas(); viewport.scheduleFit(); });
    if (canvasHost.value) viewportObserver.observe(canvasHost.value);
  }
  window.addEventListener("resize", updateNameEditorPosition);
  window.addEventListener("resize", junctionEditor.refresh);
  window.addEventListener("keydown", handleCanvasKeydown);
  window.addEventListener("blur", blankPan.stop);
  window.addEventListener("blur", releaseCanvasPointer);
  window.addEventListener("pointerup", releaseCanvasPointer);
  window.addEventListener("pointercancel", releaseCanvasPointer);
  window.addEventListener("mouseup", releaseRelationOutsideGraph, true);
  window.addEventListener("pointerup", releaseRelationOutsideGraph, true);
  renderGraph();
  viewport.setZoom(props.zoom);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(labelFrame);
  junctionEditor.clear();
  routeEditor.restore();
  movement.cancel();
  closeNameEditor();
  blankPan.stop();
  window.removeEventListener("blur", blankPan.stop);
  window.removeEventListener("blur", releaseCanvasPointer);
  window.removeEventListener("pointerup", releaseCanvasPointer);
  window.removeEventListener("pointercancel", releaseCanvasPointer);
  window.removeEventListener("mouseup", releaseRelationOutsideGraph, true);
  window.removeEventListener("pointerup", releaseRelationOutsideGraph, true);
  clearTimeout(relationReleaseTimer);
  viewportObserver?.disconnect();
  viewport.dispose();
  window.removeEventListener("resize", updateNameEditorPosition);
  window.removeEventListener("resize", junctionEditor.refresh);
  window.removeEventListener("keydown", handleCanvasKeydown);
  graph?.getCellById(dragCellId)?.remove();
  graph?.dispose();
});

watch(() => [props.nodes, props.relations], () => {
  movement.cancel();
  nodeDragging = false;
  const nextFeatureCounts = countFeaturesByOwner(props.nodes);
  const nextCollapsed = new Set(collapsedFeatureOwnerIds.value);
  // Restore the host's explicit choices, including owners loaded asynchronously.
  for (const ownerId of props.collapsedFeatures ?? []) if (!featureCountsByOwner.has(ownerId)) nextCollapsed.add(ownerId);
  nextCollapsed.forEach((ownerId) => {
    if (!nextFeatureCounts.has(ownerId)) nextCollapsed.delete(ownerId);
  });
  nextFeatureCounts.forEach((count, ownerId) => {
    const previous = featureCountsByOwner.get(ownerId);
    if (props.collapsedFeatures !== undefined && previous !== undefined && count > previous) nextCollapsed.add(ownerId);
  });
  featureCountsByOwner = nextFeatureCounts;
  collapsedFeatureOwnerIds.value = nextCollapsed;
  if (JSON.stringify([...nextCollapsed].sort()) !== JSON.stringify([...(props.collapsedFeatures ?? [])].sort())) emit("featureCollapseChange", [...nextCollapsed]);
  renderGraph();
}, { deep: true });
watch(() => props.collapsedFeatures, ids => {
  if (JSON.stringify([...(ids ?? [])].sort()) === JSON.stringify([...collapsedFeatureOwnerIds.value].sort())) return;
  collapsedFeatureOwnerIds.value = new Set(ids); renderGraph();
}, { deep: true, flush: "sync" });
watch(() => [props.selectedId, props.selectedIds, selectedFeatureRouteId.value, props.refinedElementIds, props.highlightedTextNodeIds, props.highlightedFindingNodeIds, props.highlightedTextRelationIds, props.highlightedFindingTargetId, props.readonly, props.layoutPreview, props.interactionTool, props.relationGesturePhase], () => {
  syncGraphPresentation(); scene.paintSelection(); void nextTick(routeEditor.sync);
}, { deep: true });
watch(() => props.selectedId, id => { if (id) { selectedFeatureRouteId.value = ""; junctionEditor.clear(); } });
watch(() => props.showRelationNames, () => { renderGraph(); scheduleLabels(); });
watch(() => props.nodeColors, () => syncGraphPresentation(), { deep: true });
watch(canEditRoutes, () => { junctionEditor.cancel(); junctionEditor.refresh(); });
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
.opd-canvas[data-blank-dragging="true"],
.opd-canvas[data-blank-dragging="true"] :deep(*) { cursor: grabbing !important; }
.opd-route-toolbar { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 10; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: fit-content; max-width: calc(100% - 24px); padding: 8px 12px; border: 1px solid #d5e0eb; border-radius: 8px; background: #ffffffed; box-shadow: 0 2px 8px #26394d14; font-size: 12px; }
.opd-route-toolbar small { color: #66778a; }
.opd-junction-handle { position: absolute; z-index: 7; width: 32px; height: 32px; padding: 0; transform: translate(-50%, -50%); border: 1px solid transparent; border-radius: 4px; background: transparent; cursor: grab; touch-action: none; }
.opd-junction-handle:hover, .opd-junction-handle:focus-visible, .opd-junction-handle.is-selected { border-color: #0b6bcb; box-shadow: 0 0 0 2px #0b6bcb1c; outline: none; }
.opd-junction-handle.is-dragging { cursor: grabbing; }
.opd-route-toolbar button, .opd-route-menu button { border: 0; border-radius: 4px; background: #edf4fb; color: #0b6bcb; padding: 5px 8px; cursor: pointer; font: inherit; }
.opd-route-menu { position: absolute; z-index: 20; display: grid; min-width: 180px; gap: 4px; padding: 8px; background: white; border: 1px solid #d5e0eb; border-radius: 8px; box-shadow: 0 4px 16px #26394d24; }
.opd-route-menu button { text-align: left; background: white; }
.opd-route-menu button:hover { background: #edf4fb; }
</style>
