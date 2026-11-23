import { describe, expect, it, vi } from "vitest";

import type { Graph } from "@antv/x6";
import { reconcileRelationRenderSpecs } from "./x6-relation-adapter";
import type { RelationRenderSpec } from "./relation-render-spec";

describe("X6 relation adapter", () => {
  it.each(["none", "#ffffff", "#20242a"])("高亮保留端点填充 %s 与形状，控制文字同步着色且取消后还原", fill => {
    const edge = { isEdge: () => true, setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setConnector: vi.fn(), removeConnector: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addEdge: vi.fn(), getCellById: vi.fn(() => edge) } as unknown as Graph;
    const initial = spec("occurrence.fact.one", "fact.one");
    const first = initial.cells[0]!;
    if (first.kind !== "edge") throw new Error("测试需要关系线");
    const marker = { name: "circle", r: 5, fill, stroke: "#20242a" };
    const decorated: RelationRenderSpec = { ...initial, cells: [{ ...first, line: { ...first.line, sourceMarker: marker, targetMarker: marker, findingHighlighted: true },
      labels: [{ position: -24, text: "e", fontSize: 13, fontWeight: 700 }] }] };
    const state = reconcileRelationRenderSpecs(graph, new Map(), [{ ...decorated, selected: true }]);
    const line = vi.mocked(graph.addEdge).mock.calls[0]![0]!.attrs!.line;
    expect(line).toMatchObject({ stroke: "#0b6bcb", strokeWidth: 2.15, "data-opm-finding-highlight": "true",
      sourceMarker: { ...marker, fill: fill === "#20242a" ? "#0b6bcb" : fill, stroke: "#0b6bcb" },
      targetMarker: { ...marker, fill: fill === "#20242a" ? "#0b6bcb" : fill, stroke: "#0b6bcb" } });
    expect(marker.stroke).toBe("#20242a");
    reconcileRelationRenderSpecs(graph, state, [decorated]);
    const grayMarker = { ...marker, stroke: "#8793a1", fill: fill === "#20242a" ? "#8793a1" : fill };
    expect(edge.attr).toHaveBeenLastCalledWith({ line: expect.objectContaining({ stroke: "#8793a1", strokeWidth: 1.35, sourceMarker: grayMarker, targetMarker: grayMarker, "data-opm-selected": "false" }) });
    expect(edge.setLabels).toHaveBeenLastCalledWith([{ position: { distance: -24, offset: -14, options: { keepGradient: false } }, attrs: {
      body: { fill: "#ffffff", stroke: "none", rx: 2, ry: 2 }, label: { text: "e", fill: "#20242a", fontSize: 13, fontWeight: 700 } } }]);
  });
  it("updates boundary anchors in place after a node moves and removes them when switching to a legacy style", () => {
    const edge = { isEdge: () => true, setSource: vi.fn(), setTarget: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setConnector: vi.fn(), removeConnector: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addEdge: vi.fn(), getCellById: vi.fn(() => edge) } as unknown as Graph;
    const initial = spec("o", "f"), first = initial.cells[0]!;
    if (first.kind !== "edge") throw new Error("edge expected");
    const anchored = { ...initial, cells: [{ ...first, sourceAnchor: { dx: 80, dy: 0 }, targetAnchor: { dx: -80, dy: 12 } }] };
    const state = reconcileRelationRenderSpecs(graph, new Map(), [anchored]);
    expect(graph.addEdge).toHaveBeenCalledWith(expect.objectContaining({ source: { cell: "object.one", anchor: { name: "center", args: { dx: 80, dy: 0 } }, connectionPoint: { name: "anchor" } } }));
    const next = { ...initial, cells: [{ ...first, sourceAnchor: { dx: 0, dy: 36 }, targetAnchor: { dx: 8, dy: -36 } }] };
    const updated = reconcileRelationRenderSpecs(graph, state, [next]);
    expect(edge.setSource).toHaveBeenLastCalledWith(expect.objectContaining({ anchor: { name: "center", args: { dx: 0, dy: 36 } } }));
    reconcileRelationRenderSpecs(graph, updated, [initial]);
    expect(edge.setSource).toHaveBeenLastCalledWith({ cell: "object.one" });
    expect(edge.setTarget).toHaveBeenLastCalledWith({ cell: "process.one" });
    expect(graph.addEdge).toHaveBeenCalledTimes(1);
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
  it("只改变端口时不重设路径、路由器和标签", () => {
    const edge = { isEdge: () => true, setSource: vi.fn(), setTarget: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), setRouter: vi.fn(), removeRouter: vi.fn(), setConnector: vi.fn(), removeConnector: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
    const graph = { addEdge: vi.fn(), getCellById: () => edge } as unknown as Graph;
    const initial = spec("occ", "fact"), first = initial.cells[0]!;
    if (first.kind !== "edge") throw new Error("edge expected");
    const state = reconcileRelationRenderSpecs(graph, new Map(), [initial]);
    reconcileRelationRenderSpecs(graph, state, [{ ...initial, cells: [{ ...first, sourceAnchor: { dx: 80, dy: 10 } }] }]);
    expect(edge.setSource).toHaveBeenCalledOnce();
    expect(edge.setVertices).not.toHaveBeenCalled();
    expect(edge.removeRouter).not.toHaveBeenCalled();
    expect(edge.setLabels).not.toHaveBeenCalled();
  });

  it("Cell ID 与形状不变时原位更新，不改变 edge 顺序", () => {
    const edge = { isEdge: () => true, setZIndex: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), setRouter: vi.fn(), removeRouter: vi.fn(), setConnector: vi.fn(), removeConnector: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
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
    expect(edge.setLabels).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ position: expect.objectContaining({ distance: 0.88, offset: -14 }) })]));

    reconcileRelationRenderSpecs(graph, reconcileRelationRenderSpecs(graph, state, [changed]), [initial]);
    expect(edge.setVertices).toHaveBeenLastCalledWith([]);
    expect(edge.removeRouter).toHaveBeenCalledOnce();
  });

  it("状态关系线新增和原位更新时均使用状态层级", () => {
    const edge = { isEdge: () => true, setZIndex: vi.fn(), setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setConnector: vi.fn(), removeConnector: vi.fn(), setLabels: vi.fn(), attr: vi.fn() };
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
