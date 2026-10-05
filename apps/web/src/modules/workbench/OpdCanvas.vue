<template>
  <div ref="canvasHost" class="opd-canvas-host">
    <div
      ref="canvasElement"
      class="opd-canvas"
      data-testid="p03-canvas"
      :data-canvas-tool="interactionTool ?? 'select'"
      :data-relation-gesture-phase="relationGesturePhase ?? 'idle'"
      :data-relation-preview-id="relationPreview?.candidateId ?? ''"
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
import { Graph, type EdgeView } from "@antv/x6";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useCanvasNameEditor } from "./opd/useCanvasNameEditor";
import { createX6NodeLayer } from "./opd/core/x6-node-layer";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { layoutParallelBinaryRelations } from "./opd/core/parallel-relation-layout";
import type { RelationGesturePhase } from "./opd/core/relation-gesture-state";
import { addRelationPreviewRenderSpec } from "./opd/core/relation-preview-renderer";
import type { RelationPreviewRenderSpec } from "./opd/core/relation-preview-render-spec";
import { buildRelationRenderSpec } from "./opd/core/relation-renderer";
import { reconcileRelationRenderSpecs, type X6RelationRenderState } from "./opd/core/x6-relation-adapter";
import { createX6RelationGestureAdapter, type RelationGestureIntent } from "./opd/core/x6-relation-gesture-adapter";
import { createBuiltInControlDecoratorRegistry, createBuiltInRelationRegistry } from "./opd/relations/built-in-relation-registries";
import { nodeDimensions } from "./opd/core/node-geometry";

const props = defineProps<{
  nodes: OpdNode[];
  relations: ConsumptionRelation[];
  selectedId: string;
  zoom: number;
  readonly?: boolean;
  interactionTool?: "select" | "pan";
  statePlacementOwnerId?: string;
  relationGesturePhase?: RelationGesturePhase;
  relationPreview?: RelationPreviewRenderSpec;
  highlightedFindingTargetId?: string;
  beginNameEdit?: (elementId: string) => Promise<boolean>;
  submitNameEdit?: (elementId: string, value: string) => Promise<boolean>;
  relationEditorTarget?: { cellId: string; ratio: number };
}>();

const emit = defineEmits<{
  select: [id: string];
  move: [occurrenceId: string, x: number, y: number];
  placeState: [ownerId: string];
  relationIntent: [intent: RelationGestureIntent];
  relationLabelEditRequested: [relationId: string];
  relationEditorAnchor: [anchor: { clientX: number; clientY: number } | null];
  constructActionsMenuRequested: [occurrenceId: string, anchor: { clientX: number; clientY: number }, activation: "menu" | "direct"];
}>();

const canvasHost = ref<HTMLDivElement>();
const canvasElement = ref<HTMLDivElement>();
const nameInput = ref<HTMLInputElement>();
let graph: Graph | undefined;
const { nameEditor, updateNameEditorPosition, openNameEditor, closeNameEditor, finishNameEdit, handleNameKeydown, handleNameBlur, handleNameCompositionEnd } = useCanvasNameEditor(props, canvasHost, nameInput, () => graph, updateRelationEditorAnchor);
defineExpose({ finishNameEdit });
const { renderNodes, graphNodeStructure, syncGraphPresentation, movePresentation } = createX6NodeLayer(props, () => graph, updateNameEditorPosition);
let renderedNodeStructure = "";
let renderedCandidateCellIds: string[] = [];
let relationRenderState = new Map<string, X6RelationRenderState>();
const relationDefinitions = createBuiltInRelationRegistry();
const controlDecorators = createBuiltInControlDecoratorRegistry();
const relationGestureAdapter = createX6RelationGestureAdapter((intent) => emit("relationIntent", intent));
const dragCellId = "candidate.relation.drag";

function nodeCenter(nodeId: string) {
  const node = props.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  const size = nodeDimensions(node);
  return { x: node.x + size.width / 2, y: node.y + size.height / 2 };
}

function renderGraph() {
  if (!graph) return;
  let relationSpecs;
  try {
    relationSpecs = layoutParallelBinaryRelations(props.relations.map((relation) => buildRelationRenderSpec(
      relation,
      { nodes: props.nodes, highlightedFindingTargetId: props.highlightedFindingTargetId },
      relationDefinitions,
      controlDecorators,
    )), nodeCenter);
  } catch (error) {
    graph.clearCells();
    renderedNodeStructure = "";
    renderedCandidateCellIds = [];
    relationRenderState = new Map();
    throw error;
  }
  const nodeStructure = graphNodeStructure();
  const rebuiltNodeLayer = nodeStructure !== renderedNodeStructure;
  if (rebuiltNodeLayer) {
    graph.clearCells();
    relationRenderState = new Map();
    renderedCandidateCellIds = [];
    renderNodes();
    renderedNodeStructure = nodeStructure;
  } else {
    syncGraphPresentation();
  }
  relationRenderState = reconcileRelationRenderSpecs(graph, relationRenderState, relationSpecs);
  if (rebuiltNodeLayer && props.relationPreview) reconcileCandidatePreview();
  graph.zoomTo(props.zoom / 100);
  updateNameEditorPosition();
}

function reconcileCandidatePreview() {
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
  if (event.key === "Escape" && props.relationGesturePhase && props.relationGesturePhase !== "idle") cancelRelationDrag("ESCAPE");
  if ((event.key === "Delete" || event.key === "Backspace") && !nameEditor.active && !isTextEntryTarget(event.target)) {
    event.preventDefault();
    const node = props.nodes.find((item) => item.id === props.selectedId);
    const relation = props.relations.find((item) => item.id === props.selectedId);
    if (node || relation) {
      const selectedCellId = node?.id ?? (relation ? relationRenderState.get(relation.occurrenceId)?.spec.primaryCellId : undefined);
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
      eventTypes: ["leftMouseDown", "mouseWheel"],
    },
  });
  graph.on("node:click", ({ node }) => {
    if ((props.interactionTool ?? "select") === "pan") return;
    if (props.relationGesturePhase && props.relationGesturePhase !== "idle") return;
    if (props.statePlacementOwnerId === node.id) emit("placeState", node.id);
    else emit("select", node.id);
  });
  graph.on("node:mousedown", ({ node, x, y }) => startRelationDrag(node.id, x, y));
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
    if (!model || (model.kind !== "object" && model.kind !== "process")) return;
    emit("select", model.id);
    void openNameEditor(model);
  });
  graph.on("node:moved", ({ node }) => {
    const model = props.nodes.find((item) => item.id === node.id);
    if (!model || !canMoveNode(model)) return;
    const position = movePresentation(model, node.getPosition());
    updateNameEditorPosition();
    emit("move", model.occurrenceId, position.x, position.y);
  });
  graph.on("node:moving", ({ node }) => {
    const model = props.nodes.find((item) => item.id === node.id);
    if (model && canMoveNode(model)) movePresentation(model, node.getPosition());
  });
  graph.on("edge:click", ({ edge }) => emit("select", edge.getData()?.relationId ?? edge.id));
  graph.on("edge:dblclick", ({ edge }) => {
    if ((props.interactionTool ?? "select") === "pan" || (props.relationGesturePhase ?? "idle") !== "idle") return;
    const relation = props.relations.find((item) => item.id === (edge.getData()?.relationId ?? edge.id));
    if (relation) emit("relationLabelEditRequested", relation.id);
  });
  graph.on("render:done", updateRelationEditorAnchor);
  // 单独 addEdge 不触发批量 render:done，等新视图挂载并完成路径更新后再定位。
  graph.on("view:mounted", () => { void nextTick(updateRelationEditorAnchor); });
  graph.on("node:contextmenu", ({ node, e }) => {
    const model = props.nodes.find((item) => item.id === node.id);
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
  window.addEventListener("resize", updateNameEditorPosition);
  window.addEventListener("keydown", handleCanvasKeydown);
  renderGraph();
});

onBeforeUnmount(() => {
  closeNameEditor();
  window.removeEventListener("resize", updateNameEditorPosition);
  window.removeEventListener("keydown", handleCanvasKeydown);
  graph?.getCellById(dragCellId)?.remove();
  graph?.dispose();
});

watch(() => [props.nodes, props.relations, props.selectedId, props.zoom, props.highlightedFindingTargetId], renderGraph, { deep: true });
watch(() => props.relationPreview, () => { reconcileCandidatePreview(); void nextTick(updateRelationEditorAnchor); }, { deep: true, flush: "sync" });
watch(() => props.relationEditorTarget, () => { void nextTick(updateRelationEditorAnchor); }, { deep: true });
watch(() => props.relationGesturePhase, (phase) => {
  if (phase !== "dragging") graph?.getCellById(dragCellId)?.remove();
});
watch(() => props.interactionTool, (tool) => {
  if (tool === "pan") graph?.enablePanning();
  else graph?.disablePanning();
});
</script>
