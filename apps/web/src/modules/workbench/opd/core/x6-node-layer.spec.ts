import type { Graph } from "@antv/x6";
import { describe, expect, it, vi } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { createX6NodeLayer } from "./x6-node-layer";

describe("节点增量同步", () => {
  it("选择、改名和增删只更新对应图形，拒绝拖动后恢复原几何", () => {
    const { props, graph, cells, layer } = setup([node("a"), node("b")]);
    layer.renderNodes();
    const a = cells.get("a")!, b = cells.get("b")!;
    graph.addNode.mockClear();
    props.selectedId = "a"; layer.syncGraphPresentation();
    expect(a.attr).toHaveBeenCalledWith("body/fill", "#eaf3fc");
    expect(b.attr).not.toHaveBeenCalled(); expect(b.position).not.toHaveBeenCalled();
    expect(graph.addNode).not.toHaveBeenCalled();
    props.nodes = [{ ...props.nodes[0], label: "咖啡豆" }, props.nodes[1], node("c")]; layer.renderNodes();
    expect(a.attr).toHaveBeenCalledWith("label/text", "咖啡豆");
    expect(graph.addNode.mock.calls.map(([value]) => value.id)).toEqual(["c"]);
    a.position(300, 400); a.resize(200, 120);
    props.nodes = props.nodes.map(item => ({ ...item })); layer.renderNodes();
    expect(a.getPosition()).toEqual({ x: 80, y: 80 }); expect(a.getSize()).toEqual({ width: 160, height: 72 });
    props.nodes = props.nodes.filter(item => item.id !== "c"); layer.renderNodes();
    expect(cells.has("c")).toBe(false); expect(cells.get("b")).toBe(b);
  });

  it("对象形状重建恢复默认状态箭头，最终状态轮廓随尺寸同步", () => {
    const state = { ...node("state", "state"), x: 96, y: 112, ownerId: "owner", stateRoles: ["DEFAULT", "FINAL"] as OpdNode["stateRoles"] };
    const { props, cells, layer } = setup([node("owner"), state]);
    layer.renderNodes(); const originalState = cells.get("state");
    props.featureOwnerIds.add("owner"); layer.renderNodes();
    expect(cells.get("state")).toBe(originalState);
    expect(cells.has("state.default.state")).toBe(true);
    props.nodes = [props.nodes[0], { ...state, x: 104, width: 104, height: 32 }]; layer.renderNodes();
    expect(cells.get("state.final-outline.state")!.getPosition()).toEqual({ x: 107, y: 115 });
    expect(cells.get("state.final-outline.state")!.getSize()).toEqual({ width: 98, height: 26 });
  });

  it("选择和改动无关节点保留所属特征连接，成员变化仅重建所属组", () => {
    const { props, graph, cells, layer } = setup([node("owner"), { ...node("feature", "attribute"), ownerId: "owner", x: 320 }, node("other")]);
    props.featureOwnerIds.add("owner"); layer.renderNodes();
    const edgeId = "feature.owner-group.owner.characterization", edge = cells.get(edgeId);
    graph.addEdge.mockClear(); props.selectedId = "feature"; layer.syncGraphPresentation();
    props.nodes = props.nodes.map(item => item.id === "other" ? { ...item, x: 600 } : item); layer.renderNodes();
    expect(cells.get(edgeId)).toBe(edge); expect(graph.addEdge).not.toHaveBeenCalled();
    props.nodes = props.nodes.map(item => item.id === "feature" ? { ...item, y: 240 } : item); layer.renderNodes();
    expect(cells.get(edgeId)).not.toBe(edge);
    expect(cells.has(`${edgeId}.member.feature`)).toBe(true);
  });
});

// 模拟 X6 的邻接边删除及几何存储，检测仅记录调用无法发现的增量回归。
function setup(nodes: OpdNode[]) {
  const props = { nodes, selectedId: "", featureOwnerIds: new Set<string>(), collapsedFeatureOwnerIds: new Set<string>() };
  type Cell = ReturnType<typeof createCell>;
  const cells = new Map<string, Cell>();
  function remove(id: string) {
    cells.delete(id);
    for (const [key, cell] of cells) if (cell.source === id || cell.target === id) cells.delete(key);
  }
  function createCell(value: { id: string; x?: number; y?: number; width?: number; height?: number; source?: string; target?: string }, isNode: boolean) {
    let position = { x: value.x ?? 0, y: value.y ?? 0 }, size = { width: value.width ?? 0, height: value.height ?? 0 };
    return { source: value.source, target: value.target, isNode: () => isNode,
      attr: vi.fn(), remove: () => remove(value.id), getPosition: () => position, getSize: () => size,
      position: vi.fn((x: number, y: number) => { position = { x, y }; }), resize: vi.fn((width: number, height: number) => { size = { width, height }; }) };
  }
  const graph = { addNode: vi.fn(value => { const cell = createCell(value, true); cells.set(value.id, cell); return cell; }),
    addEdge: vi.fn(value => { const cell = createCell(value, false); cells.set(value.id, cell); return cell; }),
    getCellById: (id: string) => cells.get(id) };
  const layer = createX6NodeLayer(props, () => graph as unknown as Graph, () => {});
  return { props, graph, cells, layer };
}

function node(id: string, kind: OpdNode["kind"] = "object"): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, kind, x: 80, y: 80, label: id, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}
