import { describe, expect, it, vi } from "vitest";

import type { Graph } from "@antv/x6";
import { reconcileRelationRenderSpecs } from "./x6-relation-adapter";
import type { RelationRenderSpec } from "./relation-render-spec";

describe("X6 relation adapter", () => {
  it.each(["none", "#ffffff", "#20242a"])("高亮保留端点填充 %s 与形状，控制文字同步着色且取消后还原", fill => {
    const edge = { isEdge: () => true, setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addEdge: vi.fn(), getCellById: vi.fn(() => edge) } as unknown as Graph;
    const initial = spec("occurrence.fact.one", "fact.one");
    const first = initial.cells[0]!;
    if (first.kind !== "edge") throw new Error("测试需要关系线");
    const marker = { name: "circle", r: 5, fill, stroke: "#20242a" };
    const decorated: RelationRenderSpec = { ...initial, cells: [{ ...first, line: { ...first.line, sourceMarker: marker, targetMarker: marker, findingHighlighted: true },
      labels: [{ position: -24, text: "e", fontSize: 13, fontWeight: 700 }] }] };
    const state = reconcileRelationRenderSpecs(graph, new Map(), [{ ...decorated, selected: true }]);
    const line = vi.mocked(graph.addEdge).mock.calls[0]![0]!.attrs!.line;
    expect(line).toMatchObject({ stroke: "#0b6bcb", strokeWidth: 3, "data-opm-finding-highlight": "true",
      sourceMarker: { ...marker, fill: fill === "#20242a" ? "#0b6bcb" : fill, stroke: "#0b6bcb" },
      targetMarker: { ...marker, fill: fill === "#20242a" ? "#0b6bcb" : fill, stroke: "#0b6bcb" } });
    expect(marker.stroke).toBe("#20242a");
    reconcileRelationRenderSpecs(graph, state, [decorated]);
    expect(edge.attr).toHaveBeenLastCalledWith({ line: expect.objectContaining({ stroke: "#20242a", strokeWidth: 2, sourceMarker: marker, targetMarker: marker, "data-opm-selected": "false" }) });
    expect(edge.setLabels).toHaveBeenLastCalledWith([{ position: -24, attrs: { label: { text: "e", fill: "#20242a", fontSize: 13, fontWeight: 700 } } }]);
  });

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
    const edge = { isEdge: () => true, setZIndex: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), setRouter: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
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

  it("状态关系线新增和原位更新时均使用状态层级", () => {
    const edge = { isEdge: () => true, setZIndex: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addNode: vi.fn(), addEdge: vi.fn(), getCellById: vi.fn(() => edge) } as unknown as Graph;
    const initial = spec("occurrence.fact.one", "fact.one");
    const raised: RelationRenderSpec = { ...initial, cells: initial.cells.map((cell) => cell.kind === "edge" ? { ...cell, zIndex: 2.5 } : cell) };

    const state = reconcileRelationRenderSpecs(graph, new Map(), [raised]);
    expect(graph.addEdge).toHaveBeenCalledWith(expect.objectContaining({ zIndex: 2.5 }));

    reconcileRelationRenderSpecs(graph, state, [initial]);
    expect(edge.setZIndex).toHaveBeenCalledWith(1);
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
