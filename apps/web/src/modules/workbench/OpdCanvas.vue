<template>
  <div
    ref="canvasElement"
    class="opd-canvas"
    data-testid="p03-canvas"
  />
</template>

<script setup lang="ts">
import { Graph } from "@antv/x6";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

const props = defineProps<{
  nodes: OpdNode[];
  relations: ConsumptionRelation[];
  selectedId: string;
  zoom: number;
  statePlacementOwnerId?: string;
  relationPreview?: { candidateId: string; sourceId: string; targetId: string };
  highlightedFindingTargetId?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  placeState: [ownerId: string];
}>();

const canvasElement = ref<HTMLDivElement>();
let graph: Graph | undefined;

function renderGraph() {
  if (!graph) return;
  graph.clearCells();
  props.nodes.forEach((node) => {
    const isState = node.kind === "state";
    const isFeature = node.kind === "attribute" || node.kind === "operation";
    const isInitial = node.stateRoles?.includes("INITIAL");
    const isFinal = node.stateRoles?.includes("FINAL");
    graph?.addNode({
      id: node.id,
      shape: node.kind === "process" ? "ellipse" : "rect",
      x: node.x,
      y: node.y,
      width: node.kind === "process" ? 168 : isState ? 88 : isFeature ? 132 : 160,
      height: node.kind === "process" ? 84 : isState ? 28 : isFeature ? 44 : 72,
      zIndex: 2,
      label: node.label,
      attrs: {
        body: {
          "data-opm-capture-cell-id": node.occurrenceId,
          "data-testid": `p03-occurrence-${node.occurrenceId}`,
          fill: node.id === props.selectedId ? "#eaf3fc" : "#ffffff",
          stroke: "#20242a",
          strokeWidth: isInitial ? 4 : 2,
          rx: isState ? 14 : isFeature ? 4 : 0,
          ry: isState ? 14 : isFeature ? 4 : 0,
        },
        label: {
          fill: "#171a1f",
          fontSize: isState ? 11 : 13,
          fontWeight: 600,
        },
      },
    });
    if (isState && isFinal) {
      graph?.addNode({ id: `state.final-outline.${node.id}`, shape: "rect", x: node.x + 3, y: node.y + 3, width: 82, height: 22, zIndex: 4, attrs: { body: { fill: "transparent", stroke: "#20242a", strokeWidth: 1, rx: 11, ry: 11 }, label: { text: "" } } });
    }
    if (isState && node.stateRoles?.includes("DEFAULT") && node.ownerId) {
      graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, attrs: { line: { stroke: "#20242a", strokeWidth: 1.5, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#20242a" } } } });
    }
  });
  props.relations.forEach((relation) => {
    const endpoints = relation.endpoints?.slice().sort((left, right) => left.ordinal - right.ordinal) ?? [];
    if (endpoints.length === 3 && relation.symbolRef.startsWith("symbol.link.effect")) {
      const [input, process, output] = endpoints;
      if (!input || !process || !output) return;
      addRelationEdge(`${relation.id}.input`, input.targetId, process.targetId, relation, true, true, relation.occurrenceId);
      addRelationEdge(`${relation.id}.output`, process.targetId, output.targetId, relation, true, false);
      return;
    }
    if (relation.symbolRef.startsWith("symbol.link.structural")) {
      addStructuralRelation(relation, endpoints);
      return;
    }
    addRelationEdge(relation.id, relation.sourceId, relation.targetId, relation, false, true, relation.occurrenceId);
  });
  if (props.relationPreview) addCandidatePreview(props.relationPreview);
  graph.zoomTo(props.zoom / 100);
}

function addCandidatePreview(preview: NonNullable<typeof props.relationPreview>) {
  graph?.addEdge({
    id: preview.candidateId,
    source: preview.sourceId,
    target: preview.targetId,
    zIndex: 3,
    attrs: {
      line: {
        "data-opm-candidate-cell-id": preview.candidateId,
        "data-testid": `p03-candidate-${preview.candidateId}`,
        stroke: "#2f7abf",
        strokeDasharray: "6 4",
        strokeWidth: 2,
        targetMarker: { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#2f7abf" },
      },
    },
  });
}

function addStructuralRelation(relation: ConsumptionRelation, endpoints: NonNullable<ConsumptionRelation["endpoints"]>) {
  const isFan = relation.symbolRef.includes("aggregation") || relation.symbolRef.includes("exhibition")
    || relation.symbolRef.includes("generalization") || relation.symbolRef.includes("classification");
  if (isFan) {
    addStructuralFan(relation, endpoints);
    return;
  }
  const source = endpoints[0];
  const target = endpoints[1];
  if (!source || !target) return;
  const bidirectional = relation.symbolRef.includes("bidirectional") || relation.symbolRef.includes("reciprocal");
  const marker = { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#20242a" };
  graph?.addEdge({
    id: relation.id,
    source: source.targetId,
    target: target.targetId,
    zIndex: 1,
    data: relationData(relation),
    labels: structuralLabels(relation),
    attrs: {
      line: {
        "data-opm-capture-cell-id": relation.occurrenceId,
        "data-testid": `p03-occurrence-${relation.occurrenceId}`,
        "data-opm-finding-highlight": findingHighlight(relation),
        stroke: "#20242a",
        strokeWidth: 2,
        sourceMarker: bidirectional ? marker : undefined,
        targetMarker: marker,
      },
    },
  });
}

function addStructuralFan(relation: ConsumptionRelation, endpoints: NonNullable<ConsumptionRelation["endpoints"]>) {
  const root = endpoints[0];
  const members = endpoints.slice(1);
  const rootNode = root ? props.nodes.find((node) => node.id === root.targetId) : undefined;
  if (!root || !rootNode || !members.length) return;
  const memberNodes = members.map((member) => props.nodes.find((node) => node.id === member.targetId)).filter((node): node is OpdNode => Boolean(node));
  if (!memberNodes.length) return;
  const averageX = memberNodes.reduce((total, node) => total + node.x + 80, 0) / memberNodes.length;
  const averageY = memberNodes.reduce((total, node) => total + node.y + 36, 0) / memberNodes.length;
  const junctionId = `${relation.id}.junction`;
  const junctionX = (rootNode.x + 80 + averageX) / 2;
  const junctionY = (rootNode.y + 36 + averageY) / 2;
  const open = relation.symbolRef.includes("generalization") || relation.symbolRef.includes("classification");
  graph?.addNode({
    id: junctionId,
    shape: "polygon",
    x: junctionX - 10,
    y: junctionY - 9,
    width: 20,
    height: 18,
    zIndex: 3,
    attrs: {
      body: { refPoints: "0,18 10,0 20,18", fill: open ? "#ffffff" : "#20242a", stroke: "#20242a", strokeWidth: 1.5 },
      label: { text: "" },
    },
  });
  graph?.addEdge({ id: `${relation.id}.root`, source: root.targetId, target: junctionId, zIndex: 1, data: relationData(relation), attrs: { line: { "data-opm-capture-cell-id": relation.occurrenceId, "data-testid": `p03-occurrence-${relation.occurrenceId}`, "data-opm-finding-highlight": findingHighlight(relation), stroke: "#20242a", strokeWidth: 2 } } });
  members.forEach((member, index) => {
    graph?.addEdge({
      id: `${relation.id}.member.${index}`,
      source: junctionId,
      target: member.targetId,
      zIndex: 1,
      data: relationData(relation),
      labels: index === 0 ? structuralLabels(relation) : [],
      attrs: { line: { stroke: "#20242a", strokeWidth: 2 } },
    });
  });
  if (relation.collectionCompleteness === "INCOMPLETE") {
    graph?.addNode({
      id: `${relation.id}.incomplete`,
      shape: "rect",
      x: junctionX - 10,
      y: junctionY + 14,
      width: 20,
      height: 12,
      zIndex: 4,
      attrs: { body: { fill: "transparent", stroke: "transparent" }, label: { text: "...", fill: "#20242a", fontSize: 12, fontWeight: 700 } },
    });
  }
}

function relationData(relation: ConsumptionRelation) {
  return { relationId: relation.id, sourceOccurrenceId: relation.sourceOccurrenceId, targetOccurrenceId: relation.targetOccurrenceId, symbolRef: relation.symbolRef, layoutRef: relation.layoutRef };
}

function findingHighlight(relation: ConsumptionRelation) {
  return relation.id === props.highlightedFindingTargetId ? "true" : "false";
}

function structuralLabels(relation: ConsumptionRelation) {
  return (relation.labels ?? []).map((label) => ({
    position: label.slotId === "forward_tag" ? 0.35 : label.slotId === "reverse_tag" ? 0.65 : 0.5,
    attrs: { label: { text: label.text, fill: "#20242a", fontSize: 11, fontWeight: 600 } },
  }));
}

function addRelationEdge(id: string, source: string, target: string, relation: ConsumptionRelation, effectSegment: boolean, processInputSegment: boolean, captureCellId?: string) {
  const symbol = relation.symbolRef;
  const isAgent = symbol === "symbol.link.agent" || symbol === "symbol.link.agent.state";
  const isInstrument = symbol === "symbol.link.instrument" || symbol === "symbol.link.instrument.state";
  const isInvocation = symbol.startsWith("symbol.link.invocation");
  const isSelfInvocation = symbol === "symbol.link.invocation.self";
  const exceptionAnnotation = symbol === "symbol.link.exception.overtime" ? "/" : symbol === "symbol.link.exception.undertime" ? "//" : "";
  const controlAnnotation = processInputSegment && relation.controlSegment === "PROCESS_INPUT"
    ? relation.controlCapability?.match(/^CAP-ISO-CTRL-00[1-4]$/) ? "e" : relation.controlCapability?.match(/^CAP-ISO-CTRL-00[5-8]$/) ? "c" : ""
    : "";
  const marker = isAgent ? { name: "circle", r: 5, fill: "#20242a", stroke: "#20242a" }
    : isInstrument ? { name: "circle", r: 5, fill: "#ffffff", stroke: "#20242a" }
      : { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#20242a" };
  graph?.addEdge({
    id,
    source,
    target,
    zIndex: 1,
    data: { relationId: relation.id, sourceOccurrenceId: relation.sourceOccurrenceId, targetOccurrenceId: relation.targetOccurrenceId, symbolRef: symbol, layoutRef: relation.layoutRef },
    vertices: isInvocation && !isSelfInvocation ? lightningVertices(source, target) : undefined,
    router: isSelfInvocation ? { name: "loop", args: { position: "top", width: 36, height: 28 } } : undefined,
    labels: [
      ...(relation.duration ? [{ position: 0.82, attrs: { label: { text: `${exceptionAnnotation} ${relation.duration}`, fill: "#20242a", fontSize: 11 } } }] : []),
      ...(controlAnnotation ? [{ position: 0.88, attrs: { label: { text: controlAnnotation, fill: "#20242a", fontSize: 13, fontWeight: 700 } } }] : []),
    ],
    attrs: {
      line: {
        ...(captureCellId ? { "data-opm-capture-cell-id": captureCellId, "data-testid": `p03-occurrence-${captureCellId}` } : {}),
        "data-opm-finding-highlight": findingHighlight(relation),
        stroke: "#20242a",
        strokeWidth: 2,
        sourceMarker: effectSegment ? { name: "classic", width: 10, height: 8, fill: "#ffffff", stroke: "#20242a" } : undefined,
        targetMarker: marker,
      },
    },
  });
}

function lightningVertices(sourceId: string, targetId: string) {
  const source = props.nodes.find((node) => node.id === sourceId);
  const target = props.nodes.find((node) => node.id === targetId);
  if (!source || !target) return [];
  const sourceX = source.x + 84;
  const sourceY = source.y + 42;
  const targetX = target.x + 84;
  const targetY = target.y + 42;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);
  if (length < 48) return [];
  const offsetX = (-dy / length) * 10;
  const offsetY = (dx / length) * 10;
  return [
    { x: sourceX + dx * 0.34 + offsetX, y: sourceY + dy * 0.34 + offsetY },
    { x: sourceX + dx * 0.5 - offsetX, y: sourceY + dy * 0.5 - offsetY },
    { x: sourceX + dx * 0.66 + offsetX, y: sourceY + dy * 0.66 + offsetY },
  ];
}

onMounted(() => {
  if (!canvasElement.value) return;
  graph = new Graph({
    container: canvasElement.value,
    background: { color: "#fbfcfd" },
    grid: { visible: true, size: 16 },
    interacting: false,
    panning: {
      enabled: true,
      eventTypes: ["leftMouseDown", "mouseWheel"],
    },
  });
  graph.on("node:click", ({ node }) => {
    if (props.statePlacementOwnerId === node.id) emit("placeState", node.id);
    else emit("select", node.id);
  });
  graph.on("edge:click", ({ edge }) => emit("select", edge.getData()?.relationId ?? edge.id));
  renderGraph();
});

onBeforeUnmount(() => graph?.dispose());

watch(() => [props.nodes, props.relations, props.selectedId, props.zoom], renderGraph, { deep: true });
</script>
