import type { Graph } from "@antv/x6";

import type { RelationRenderSpec } from "./relation-render-spec";

export function addRelationRenderSpec(graph: Graph, spec: RelationRenderSpec) {
  spec.cells.forEach((cell) => {
    if (cell.kind === "node") {
      graph.addNode({
        id: cell.id, shape: cell.shape, x: cell.x, y: cell.y, width: cell.width, height: cell.height, zIndex: cell.zIndex, angle: cell.angle,
        attrs: { body: cell.body as never, label: cell.label as never },
      });
      return;
    }
    graph.addEdge({
      id: cell.id, source: cell.source, target: cell.target, zIndex: 1, data: cell.data,
      vertices: cell.vertices, router: cell.router, labels: cell.labels.map((label) => ({
        position: label.position,
        attrs: { label: { text: label.text, fill: "#20242a", fontSize: label.fontSize, fontWeight: label.fontWeight } },
      })),
      attrs: { line: edgeLineAttrs(cell) },
    });
  });
}

export interface X6RelationRenderState {
  readonly signature: string;
  readonly cellIds: readonly string[];
  readonly spec: RelationRenderSpec;
}

export function reconcileRelationRenderSpecs(
  graph: Graph,
  previous: ReadonlyMap<string, X6RelationRenderState>,
  nextSpecs: readonly RelationRenderSpec[],
) {
  const next = new Map<string, X6RelationRenderState>();
  const nextOccurrenceIds = new Set(nextSpecs.map((spec) => spec.occurrenceId));
  previous.forEach((state, occurrenceId) => {
    if (!nextOccurrenceIds.has(occurrenceId)) removeCells(graph, state.cellIds);
  });
  nextSpecs.forEach((spec) => {
    const signature = JSON.stringify(spec);
    const previousState = previous.get(spec.occurrenceId);
    if (!previousState) {
      addRelationRenderSpec(graph, spec);
    } else if (previousState.signature !== signature) {
      if (sameCellShape(previousState.spec, spec)) updateRelationRenderSpec(graph, spec);
      else {
        removeCells(graph, previousState.cellIds);
        addRelationRenderSpec(graph, spec);
      }
    }
    next.set(spec.occurrenceId, { signature, cellIds: spec.cells.map((cell) => cell.id), spec });
  });
  return next;
}

function sameCellShape(previous: RelationRenderSpec, next: RelationRenderSpec) {
  return previous.cells.length === next.cells.length
    && previous.cells.every((cell, index) => cell.id === next.cells[index]?.id && cell.kind === next.cells[index]?.kind);
}

function updateRelationRenderSpec(graph: Graph, spec: RelationRenderSpec) {
  spec.cells.forEach((cell) => {
    const current = graph.getCellById(cell.id);
    if (cell.kind === "node" && current?.isNode()) {
      current.position(cell.x, cell.y);
      if (cell.angle !== undefined) current.rotate(cell.angle, { absolute: true });
      current.attr({ body: cell.body as never, label: cell.label as never });
      return;
    }
    if (cell.kind === "edge" && current?.isEdge()) {
      current.setData(cell.data);
      current.setVertices(cell.vertices ? [...cell.vertices] : []);
      if (cell.router) current.setRouter(cell.router as never);
      else current.removeRouter();
      current.setLabels(cell.labels.map((label) => ({
        position: label.position,
        attrs: { label: { text: label.text, fill: "#20242a", fontSize: label.fontSize, fontWeight: label.fontWeight } },
      })));
      current.attr({ line: edgeLineAttrs(cell) as never });
    }
  });
}

function edgeLineAttrs(cell: Extract<RelationRenderSpec["cells"][number], { kind: "edge" }>) {
  return {
    ...(cell.line.captureAnchor ? {
      "data-opm-capture-cell-id": cell.line.captureAnchor,
      "data-testid": `p03-occurrence-${cell.line.captureAnchor}`,
    } : {}),
    ...(cell.line.findingHighlighted === undefined ? {} : { "data-opm-finding-highlight": cell.line.findingHighlighted ? "true" : "false" }),
    stroke: cell.line.stroke,
    strokeWidth: cell.line.strokeWidth,
    sourceMarker: cell.line.sourceMarker ?? null,
    targetMarker: cell.line.targetMarker ?? null,
  };
}

function removeCells(graph: Graph, cellIds: readonly string[]) {
  cellIds.forEach((cellId) => graph.getCellById(cellId)?.remove());
}
