import type { Graph } from "@antv/x6";
import { describe, expect, it, vi } from "vitest";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { createCanvasScene } from "./canvas-scene";

describe("画布拖动局部路径刷新", () => {
  it("只刷新被移动障碍覆盖的连线，远处连线保持不动", () => {
    const nodes = [node("a", 0, 0), node("b", 600, 0), node("c", 0, 500), node("d", 600, 500), node("obstacle", 1000, 800)];
    const relations = [relation("first", "a", "b"), relation("far", "c", "d")];
    const cells = new Map<string, ReturnType<typeof edge>>();
    function edge(metadata: { id: string; source: { cell: string }; target: { cell: string }; router: unknown; data: unknown }) {
      const y = metadata.id === "first" ? 36 : 536;
      const view = { isEdgeView: () => true, sourcePoint: { x: 160, y }, routePoints: [], targetPoint: { x: 600, y }, update: vi.fn() };
      return { id: metadata.id, view, setVertices: vi.fn(), isNode: () => false, isEdge: () => true, getRouter: () => metadata.router, getData: () => metadata.data,
        getSourceCellId: () => metadata.source.cell, getTargetCellId: () => metadata.target.cell };
    }
    const graph = { addEdge: vi.fn(metadata => { const cell = edge(metadata); cells.set(cell.id, cell); return cell; }),
      getCellById: (id: string) => cells.get(id), getEdges: () => [...cells.values()], findViewByCell: (cell: ReturnType<typeof edge>) => cell.view } as unknown as Graph;
    const scene = createCanvasScene({ graph: () => graph, nodes: () => nodes, relations: () => relations,
      selectedId: () => "", highlightedRelations: () => [], findingId: () => undefined, renderNodes: () => {}, updateEditors: () => {} });
    scene.render();
    const farState = scene.relationState().get("occ.far");
    scene.preview(nodes.map(n => n.id === "obstacle" ? { ...n, x: 300, y: 10 } : n));
    expect(scene.relationState().get("occ.far")).toBe(farState);
    expect(cells.get("first")!.setVertices).toHaveBeenCalledOnce();
    expect(cells.get("first")!.setVertices.mock.lastCall?.[0].length).toBeGreaterThan(0);
    expect(cells.get("far")!.setVertices).not.toHaveBeenCalled();
    expect(cells.get("far")!.view.update).not.toHaveBeenCalled();
    scene.preview(nodes); // Leaving the previous corridor must also invalidate it.
    expect(scene.relationState().get("occ.far")).toBe(farState);
    expect(cells.get("first")!.setVertices).toHaveBeenCalledTimes(2);
    expect(cells.get("first")!.setVertices).toHaveBeenLastCalledWith([]);
    expect(cells.get("far")!.view.update).not.toHaveBeenCalled();
    scene.render(); // Acknowledging the final geometry must not reroute the whole graph again.
    expect(scene.relationState().get("occ.far")).toBe(farState);
    expect(cells.get("first")!.setVertices).toHaveBeenCalledTimes(2);
  });
});

function node(id: string, x: number, y: number): OpdNode {
  return { id, occurrenceId: `occ.${id}`, kind: "object", label: id, x, y, width: 160, height: 72,
    valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}
function relation(id: string, sourceId: string, targetId: string): ConsumptionRelation {
  return { id, occurrenceId: `occ.${id}`, sourceId, targetId, sourceOccurrenceId: `occ.${sourceId}`, targetOccurrenceId: `occ.${targetId}`,
    capabilityId: "CAP-ISO-STRUCT-002", symbolRef: "symbol.link.structural.null-tagged.unidirectional", layoutRef: `layout.${id}`,
    endpoints: [sourceId, targetId].map((targetId, ordinal) => ({ targetId, ordinal, targetKind: "ELEMENT", role: ordinal ? "STRUCTURAL_TARGET" : "STRUCTURAL_SOURCE" })) };
}
