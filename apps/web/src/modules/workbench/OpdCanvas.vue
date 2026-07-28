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
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

const canvasElement = ref<HTMLDivElement>();
let graph: Graph | undefined;

function renderGraph() {
  if (!graph) return;
  graph.clearCells();
  props.nodes.forEach((node) => {
    graph?.addNode({
      id: node.id,
      shape: node.kind === "process" ? "ellipse" : "rect",
      x: node.x,
      y: node.y,
      width: node.kind === "process" ? 148 : 168,
      height: 58,
      label: node.label,
      attrs: {
        body: {
          fill: node.id === props.selectedId ? "#eaf3fc" : "#ffffff",
          stroke: node.id === props.selectedId ? "#0b6bcb" : "#59636d",
          strokeWidth: node.id === props.selectedId ? 2.5 : 1.5,
        },
        label: {
          fill: "#1d242a",
          fontSize: 13,
          fontWeight: 600,
        },
      },
    });
  });
  props.relations.forEach((relation) => {
    graph?.addEdge({
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      data: {
        sourceOccurrenceId: relation.sourceOccurrenceId,
        targetOccurrenceId: relation.targetOccurrenceId,
        symbolRef: relation.symbolRef,
        layoutRef: relation.layoutRef,
      },
      attrs: {
        line: {
          stroke: props.selectedId === relation.id ? "#0b6bcb" : "#59636d",
          strokeWidth: props.selectedId === relation.id ? 2.5 : 1.5,
          targetMarker: {
            name: "block",
            width: 10,
            height: 7,
          },
        },
      },
      labels: [
        {
          attrs: {
            label: {
              text: "consumes",
              fill: "#59636d",
              fontSize: 12,
            },
          },
        },
      ],
    });
  });
  graph.zoomTo(props.zoom / 100);
}

onMounted(() => {
  if (!canvasElement.value) return;
  graph = new Graph({
    container: canvasElement.value,
    background: { color: "#fbfcfd" },
    grid: { visible: true, size: 16 },
    interacting: false,
    panning: false,
  });
  graph.on("node:click", ({ node }) => emit("select", node.id));
  graph.on("edge:click", ({ edge }) => emit("select", edge.id));
  renderGraph();
});

onBeforeUnmount(() => graph?.dispose());

watch(() => [props.nodes, props.relations, props.selectedId, props.zoom], renderGraph, { deep: true });
</script>
