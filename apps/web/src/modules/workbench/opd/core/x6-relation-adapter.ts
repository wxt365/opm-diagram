import type { Graph } from "@antv/x6";

import type { RelationRenderSpec } from "./relation-render-spec";
import { registerBezierConnector } from "./bezier-connector";

const lineColor = "#8793a1";

function edgeLabels(cell: Extract<RelationRenderSpec["cells"][number], { kind: "edge" }>, selected = false) {
  return cell.labels.map(label => ({ position: { distance: label.position, offset: -14, options: { keepGradient: false } },
    attrs: { body: { fill: "#ffffff", stroke: "none", rx: 2, ry: 2 },
      label: { text: label.text, fill: selected ? "#0b6bcb" : "#20242a", fontSize: label.fontSize, fontWeight: label.fontWeight } } }));
}

function edgeData(cell: Extract<RelationRenderSpec["cells"][number], { kind: "edge" }>) {
  return { ...cell.data, routeLabelDistances: JSON.stringify(cell.labels.map(label => label.position)) };
}

export function relationTerminal(id: string, anchor?: Readonly<{ dx: number; dy: number }>) {
  return anchor ? { cell: id, anchor: { name: "center", args: anchor }, connectionPoint: { name: "anchor" } } : { cell: id };
}

export function addRelationRenderSpec(graph: Graph, spec: RelationRenderSpec) {
  registerBezierConnector();
  spec.cells.forEach((cell) => {
    if (cell.kind === "node") {
      graph.addNode({
        id: cell.id, shape: cell.shape, x: cell.x, y: cell.y, width: cell.width, height: cell.height, zIndex: cell.zIndex, angle: cell.angle,
        attrs: { body: selectionPaint(cell.body, spec.selected) as never, label: selectionPaint(cell.label, spec.selected) as never },
      });
      return;
    }
    graph.addEdge({
      id: cell.id, source: relationTerminal(cell.source, cell.sourceAnchor), target: relationTerminal(cell.target, cell.targetAnchor), zIndex: cell.zIndex ?? 1, data: edgeData(cell),
      vertices: cell.vertices, router: cell.router, connector: cell.connector, labels: edgeLabels(cell, spec.selected),
      attrs: { line: edgeLineAttrs(cell, spec.selected) },
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
    if (!previousState || previousState.cellIds.some(id => !graph.getCellById(id))) {
      if (previousState) removeCells(graph, previousState.cellIds);
      addRelationRenderSpec(graph, spec);
    } else if (previousState.signature !== signature) {
      if (sameCellShape(previousState.spec, spec)) updateRelationRenderSpec(graph, previousState.spec, spec);
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

function updateRelationRenderSpec(graph: Graph, previous: RelationRenderSpec, spec: RelationRenderSpec) {
  spec.cells.forEach((cell, index) => {
    const current = graph.getCellById(cell.id);
    if (cell.kind === "node" && current?.isNode()) {
      current.position(cell.x, cell.y);
      if (cell.angle !== undefined) current.rotate(cell.angle, { absolute: true });
      current.attr({ body: selectionPaint(cell.body, spec.selected) as never, label: selectionPaint(cell.label, spec.selected) as never });
      return;
    }
    if (cell.kind === "edge" && current?.isEdge()) {
      const previousCell = previous.cells[index];
      if (previousCell?.kind === "edge") {
        if (previousCell.source !== cell.source || JSON.stringify(previousCell.sourceAnchor) !== JSON.stringify(cell.sourceAnchor)) current.setSource(relationTerminal(cell.source, cell.sourceAnchor));
        if (previousCell.target !== cell.target || JSON.stringify(previousCell.targetAnchor) !== JSON.stringify(cell.targetAnchor)) current.setTarget(relationTerminal(cell.target, cell.targetAnchor));
      }
      if (previousCell?.kind === "edge" && (previousCell.zIndex ?? 1) !== (cell.zIndex ?? 1)) current.setZIndex(cell.zIndex ?? 1);
      if (previousCell?.kind !== "edge") return;
      const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
      if (changed(edgeData(previousCell), edgeData(cell))) current.setData(edgeData(cell));
      if (changed(previousCell.vertices ?? [], cell.vertices ?? [])) current.setVertices(cell.vertices ? [...cell.vertices] : []);
      if (changed(previousCell.router, cell.router)) {
        if (cell.router) current.setRouter(cell.router as never); else current.removeRouter();
      }
      if (changed(previousCell.connector, cell.connector)) {
        if (cell.connector) current.setConnector(cell.connector as never); else current.removeConnector();
      }
      if (changed(edgeLabels(previousCell, previous.selected), edgeLabels(cell, spec.selected))) current.setLabels(edgeLabels(cell, spec.selected));
      if (changed(edgeLineAttrs(previousCell, previous.selected), edgeLineAttrs(cell, spec.selected))) current.attr({ line: edgeLineAttrs(cell, spec.selected) as never });
    }
  });
}

function edgeLineAttrs(cell: Extract<RelationRenderSpec["cells"][number], { kind: "edge" }>, selected = false) {
  return {
    ...(cell.line.captureAnchor ? {
      "data-opm-capture-cell-id": cell.line.captureAnchor,
      "data-testid": `p03-occurrence-${cell.line.captureAnchor}`,
    } : {}),
    ...(cell.line.findingHighlighted === undefined ? {} : { "data-opm-finding-highlight": cell.line.findingHighlighted ? "true" : "false" }),
    "data-opm-selected": selected ? "true" : "false",
    stroke: selected ? "#0b6bcb" : lineColor,
    strokeWidth: selected ? 2.15 : 1.35,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    sourceMarker: cell.line.sourceMarker ? selectionPaint(cell.line.sourceMarker, selected) : null,
    targetMarker: cell.line.targetMarker ? selectionPaint(cell.line.targetMarker, selected) : null,
  };
}

// 只替换符号前景色，保留空心/实心、白色遮罩和透明背景的区别。
function selectionPaint(attrs: Readonly<Record<string, unknown>>, selected = false) {
  return { ...attrs,
    ...(attrs.stroke === "#20242a" ? { stroke: selected ? "#0b6bcb" : lineColor } : {}),
    ...(attrs.fill === "#20242a" ? { fill: selected ? "#0b6bcb" : lineColor } : {}),
  };
}

function removeCells(graph: Graph, cellIds: readonly string[]) {
  cellIds.forEach((cellId) => graph.getCellById(cellId)?.remove());
}

/** 选择变化只更新符号颜色，不重新计算端点、路径或标签。 */
export function paintRelationSelection(graph: Graph, spec: RelationRenderSpec, selected: boolean) {
  for (const cell of spec.cells) {
    const current = graph.getCellById(cell.id);
    if (cell.kind === "edge") current?.attr({ line: edgeLineAttrs(cell, selected) as never });
    else current?.attr({ body: selectionPaint(cell.body, selected) as never, label: selectionPaint(cell.label, selected) as never });
    if (cell.kind === "edge" && current?.isEdge() && cell.labels.length) current.setLabels(edgeLabels(cell, selected));
  }
}
