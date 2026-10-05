import { describe, expect, it, vi } from "vitest";

import type { Graph } from "@antv/x6";
import { reconcileRelationRenderSpecs } from "./x6-relation-adapter";
import type { RelationRenderSpec } from "./relation-render-spec";

describe("X6 relation adapter", () => {
  it("按 occurrence 增量 add、保持和移除 Relation Group", () => {
    const remove = vi.fn();
    const graph = {
      addNode: vi.fn(),
      addEdge: vi.fn(),
      getCellById: vi.fn(() => ({ remove })),
    } as unknown as Graph;
    const first = spec("occurrence.fact.one", "fact.one");
    const state = reconcileRelationRenderSpecs(graph, new Map(), [first]);
    expect(graph.addEdge).toHaveBeenCalledTimes(1);

    const unchanged = reconcileRelationRenderSpecs(graph, state, [first]);
    expect(graph.addEdge).toHaveBeenCalledTimes(1);

    reconcileRelationRenderSpecs(graph, unchanged, []);
    expect(graph.getCellById).toHaveBeenCalledWith("fact.one");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("Cell ID 与形状不变时原位更新，不改变 edge 顺序", () => {
    const edge = { isEdge: () => true, setData: vi.fn(), setVertices: vi.fn(), setRouter: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addNode: vi.fn(), addEdge: vi.fn(), getCellById: vi.fn(() => edge) } as unknown as Graph;
    const initial = spec("occurrence.fact.one", "fact.one");
    const state = reconcileRelationRenderSpecs(graph, new Map(), [initial]);
    const changed: RelationRenderSpec = {
      ...initial,
      cells: [{ ...initial.cells[0]!, kind: "edge", vertices: [{ x: 10, y: 20 }], router: { name: "normal", args: {} }, labels: [{ position: 0.88, text: "e", fontSize: 13, fontWeight: 700 }] }],
    };

    reconcileRelationRenderSpecs(graph, state, [changed]);
    expect(graph.addEdge).toHaveBeenCalledTimes(1);
    expect(edge.setLabels).toHaveBeenCalledOnce();
    expect(edge.setVertices).toHaveBeenCalledWith([{ x: 10, y: 20 }]);
    expect(edge.setRouter).toHaveBeenCalledWith({ name: "normal", args: {} });
    expect(edge.setLabels).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ position: 0.88 })]));

    reconcileRelationRenderSpecs(graph, reconcileRelationRenderSpecs(graph, state, [changed]), [initial]);
    expect(edge.setVertices).toHaveBeenLastCalledWith([]);
    expect(edge.removeRouter).toHaveBeenCalledOnce();
  });
});

function spec(occurrenceId: string, relationId: string): RelationRenderSpec {
  return {
    relationId, occurrenceId, family: "PROCEDURAL", symbolId: "symbol.test", primaryCellId: relationId,
    cells: [{
      kind: "edge", id: relationId, source: "object.one", target: "process.one", data: {}, labels: [],
      line: { stroke: "#20242a", strokeWidth: 2, captureAnchor: occurrenceId, findingHighlighted: false },
    }],
  };
}
