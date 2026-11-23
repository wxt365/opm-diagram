import type { Graph } from "@antv/x6";
import { describe, expect, it, vi } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { createX6NodeLayer } from "./x6-node-layer";
import type { NodeColorPalette } from "@/shared/nodeAppearance";

describe("节点增量同步", () => {
  it("所属状态出现后，框外分类标题拥有命中区域，容器变宽时同步且不替换 owner", () => {
    const { props, graph, cells, layer } = setup([node("owner")]);
    layer.renderNodes();
    const owner = cells.get("owner"); graph.addNode.mockClear();
    props.nodes = [{ ...node("owner"), width: 240 }, { ...node("state", "state"), ownerId: "owner" }];
    layer.renderNodes();
    expect(cells.get("owner")).toBe(owner);
    expectPaint(owner!, "captionHitArea", { y: -20, width: 240, height: 20 });
    expect(graph.addNode.mock.calls.map(([value]) => value.id)).toEqual(["state"]);
    props.nodes = [node("owner")]; layer.renderNodes();
    expectPaint(owner!, "captionHitArea", { y: 0, width: 160, height: 0 });
  });
  it("类型配色同步所有同类元素且不重新创建节点或调整几何", () => {
    const { props, graph, cells, layer } = setup([
      { ...node("a"), appearance: { stroke: "#ff0000" } }, node("b"), node("p", "process"),
      { ...node("s", "state"), stateRoles: ["FINAL"] },
    ]);
    props.nodeColors = {}; layer.renderNodes();
    graph.addNode.mockClear(); graph.addEdge.mockClear();
    props.nodeColors = { object: { stroke: "#0000ff", fill: "#222222" }, state: { stroke: "#123456" } };
    layer.syncGraphPresentation();
    for (const id of ["a", "b"]) {
      expectPaint(cells.get(id)!, "body/stroke", id === "a" ? "#ff0000" : "#0000ff");
      expectPaint(cells.get(id)!, "body/fill", "#222222");
      expectPaint(cells.get(id)!, "label/fill", "#ffffff");
      expect(cells.get(id)!.position).not.toHaveBeenCalled();
    }
    expect(cells.get("p")!.attr).not.toHaveBeenCalled();
    expect(cells.get("state.final-outline.s")!.attr).toHaveBeenCalledWith("body/stroke", "#123456");
    expect(graph.addNode).not.toHaveBeenCalled(); expect(graph.addEdge).not.toHaveBeenCalled();
    props.nodes.push(node("new")); layer.syncGraphPresentation();
    expect(graph.addNode.mock.calls.at(-1)![0].attrs.body.stroke).toBe("#0000ff");
    props.nodeColors = {}; layer.syncGraphPresentation();
    expectPaint(cells.get("a")!, "classification/fill", "#64748b");
    expectPaint(cells.get("a")!, "body/stroke", "#ff0000");
  });
  it("颜色立即增量更新，选中保留自定义填充，最终状态内框跟随", () => {
    const state = { ...node("state", "state"), stateRoles: ["FINAL"] as OpdNode["stateRoles"], appearance: { stroke: "#123456", fill: "#111111" } };
    const { props, graph, cells, layer } = setup([state]);
    layer.renderNodes();
    expect(graph.addNode.mock.calls[0]![0].attrs.body.fill).toBe("#111111");
    expect(graph.addNode.mock.calls[0]![0].attrs.label.fill).toBe("#ffffff");
    props.selectedId = "state"; layer.syncGraphPresentation();
    expectPaint(cells.get("state")!, "body/fill", "#111111");
    props.nodes = [{ ...state, appearance: { stroke: "#654321", fill: "#ffffff" } }];
    layer.syncGraphPresentation();
    expectPaint(cells.get("state")!, "body/stroke", "#654321");
    expect(cells.get("state.final-outline.state")!.attr).toHaveBeenCalledWith("body/stroke", "#654321");
    expectPaint(cells.get("state")!, "label/fill", "#171a1f");
    expect(graph.addNode).toHaveBeenCalledTimes(2);
  });
  it("renders classification separately from names and keeps state names unmodified", () => {
    const attribute = { ...node("feature", "attribute"), label: "事件标识", domainTypeLabel: "文本属性\n(Text Property)" };
    const { graph, layer } = setup([attribute, node("state", "state")]); layer.renderNodes();
    const rendered = graph.addNode.mock.calls.map(([value]) => value);
    expect(rendered[0]?.label).toBe("事件标识");
    expect(rendered[0]?.attrs.classification.text).toBe("文本属性");
    expect(rendered[0]?.attrs.classification.title).toBe(attribute.domainTypeLabel);
    expect(rendered[1]?.attrs.classification.text).toBe("");
  });
  it("折叠展开只改切换按钮，保留 owner 及邻接关系的身份", () => {
    const { props, cells, layer, graph } = setup([node("owner")]);
    props.featureOwnerIds.add("owner"); props.collapsedFeatureOwnerIds.add("owner"); layer.renderNodes();
    const owner = cells.get("owner"); graph.addNode.mockClear();
    props.collapsedFeatureOwnerIds.delete("owner"); layer.renderNodes();
    expect(cells.get("owner")).toBe(owner);
    expect(graph.addNode).not.toHaveBeenCalled();
    expectPaint(owner!, "featureToggle/aria-label", "收起所属特征 / Collapse features");
  });
  it.each(["object", "process"] as const)("%s restores the saved junction independently of root and branch bends", kind => {
    const segment = `feature.${kind === "object" ? "characterization" : "composition"}.junction`;
    const owner = { ...node("owner", kind), edgeRoutes: [{ segment, style: "CURVE" as const, mode: "MANUAL" as const, points: [{ x: 480, y: 320 }] }] };
    const feature = { ...node("feature", kind === "object" ? "attribute" : "operation"), ownerId: owner.id, x: 600 };
    const { props, cells, layer } = setup([owner, feature]); layer.renderNodes();
    const id = `feature.owner-group.owner.${kind === "object" ? "characterization" : "composition"}.junction`;
    expect(cells.get(id)!.getPosition()).toEqual({ x: 472, y: 312 });
    if (kind === "object") expect(cells.get(`${id}.inner`)!.getPosition()).toEqual({ x: 476, y: 316 });
    props.nodes = [{ ...owner, edgeRoutes: [{ ...owner.edgeRoutes[0]!, mode: "AUTO", points: [] }] }, feature]; layer.renderNodes();
    expect(cells.get(id)!.getPosition()).toEqual(kind === "object" ? { x: 260, y: 108 } : { x: 268, y: 114 });
  });
  it("owner lines carry occurrence route identities and restore saved root/branch points when features reopen", () => {
    const route = { style: "CURVE" as const, mode: "MANUAL" as const, points: [{ x: 280, y: 250 }] };
    const owner = { ...node("owner"), edgeRoutes: [{ ...route, segment: "feature.characterization" }] };
    const feature = { ...node("feature", "attribute"), ownerId: owner.id, x: 400, edgeRoutes: [{ ...route, segment: "feature.owner" }] };
    const { props, graph, layer } = setup([owner, feature]); layer.renderNodes();
    const rootId = "feature.owner-group.owner.characterization", branchId = `${rootId}.member.feature`;
    expect(graph.addEdge.mock.calls.map(([value]) => value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rootId, vertices: route.points, data: { routeOccurrenceId: owner.occurrenceId, routeSegment: "feature.characterization", routeEditable: "true" } }),
      expect.objectContaining({ id: branchId, vertices: route.points, data: { routeOccurrenceId: feature.occurrenceId, routeSegment: "feature.owner", routeEditable: "true" },
        attrs: expect.objectContaining({ line: expect.objectContaining({ pointerEvents: "stroke" }) }) }),
    ]));
    props.nodes = [owner]; layer.renderNodes(); graph.addEdge.mockClear();
    props.nodes = [owner, feature]; layer.renderNodes();
    expect(graph.addEdge.mock.calls.find(([value]) => value.id === branchId)?.[0].vertices).toEqual(route.points);
  });
  it("选择、改名和增删只更新对应图形，拒绝拖动后恢复原几何", () => {
    const { props, graph, cells, layer } = setup([node("a"), node("b")]);
    layer.renderNodes();
    const a = cells.get("a")!, b = cells.get("b")!;
    graph.addNode.mockClear();
    props.selectedId = "a"; layer.syncGraphPresentation();
    expectPaint(a, "body/fill", "#eaf3fc");
    expect(b.attr).not.toHaveBeenCalled(); expect(b.position).not.toHaveBeenCalled();
    expect(a.attr).toHaveBeenCalledOnce();
    expect(graph.addNode).not.toHaveBeenCalled();
    props.nodes = [{ ...props.nodes[0], label: "咖啡豆" }, props.nodes[1], node("c")]; layer.renderNodes();
    expectPaint(a, "label/text", "咖啡豆");
    expectPaint(a, "label/textWrap", expect.objectContaining({ text: "咖啡豆" }));
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
    expect(cells.get(edgeId)).toBe(edge);
    expect(cells.get(`${edgeId}.member.feature`)!.setVertices).toHaveBeenLastCalledWith([{ x: 296, y: 116 }, { x: 296, y: 262 }]);
    expect(cells.has(`${edgeId}.member.feature`)).toBe(true);
  });
  it("移动远处无关对象不会更新已展开的属性路径", () => {
    const { props, cells, layer } = setup([node("owner"), { ...node("feature", "attribute"), ownerId: "owner", x: 320 }, { ...node("other"), x: 1200 }]);
    layer.renderNodes();
    const root = cells.get("feature.owner-group.owner.characterization")!;
    const branch = cells.get("feature.owner-group.owner.characterization.member.feature")!;
    root.setVertices.mockClear(); branch.setVertices.mockClear();
    props.nodes = props.nodes.map(item => item.id === "other" ? { ...item, x: 1400 } : item);
    layer.syncOwnedFeatureRelations();
    expect(root.setVertices).not.toHaveBeenCalled();
    expect(branch.setVertices).not.toHaveBeenCalled();
  });
  it.each(["object", "process"] as const)("%s 七个特征使用固定右侧接点，不随数量向下翻转", kind => {
    const owner = { ...node("owner", kind), width: 600, height: 100 };
    const features = Array.from({ length: 7 }, (_, i) => ({ ...node(`f${i}`, kind === "object" ? "attribute" : "operation"),
      ownerId: owner.id, x: 736, y: 280 + i * 144, width: 160, height: 72 }));
    const { props, graph, cells, layer } = setup([owner, features[0]!]);
    const id = `feature.owner-group.owner.${kind === "object" ? "characterization" : "composition"}`;
    layer.renderNodes();
    const initial = graph.addNode.mock.calls.find(([value]) => value.id === `${id}.junction`)![0];
    props.nodes = [owner, ...features]; layer.renderNodes();
    const junctions = graph.addNode.mock.calls.filter(([value]) => value.id === `${id}.junction`).map(([value]) => value);
    expect(junctions.at(-1)).toMatchObject({ x: initial.x, y: initial.y, angle: 270 });
    expect(initial.x).toBeGreaterThan(owner.x + owner.width);
    expect(initial.width).toBe(16); expect(initial.height).toBe(16);
    expect(initial.y + initial.height! / 2).toBe(owner.y + owner.height / 2);
    expect(cells.get(`${id}.junction`)!.getPosition()).toEqual({ x: initial.x, y: initial.y });
    const branches = graph.addEdge.mock.calls.filter(([value]) => value.id.startsWith(`${id}.member.`)).slice(-7).map(([value]) => value);
    expect(branches.map(edge => edge.vertices[0].x)).toEqual(Array(7).fill(initial.x! + initial.width! / 2 + 16));
  });
});

// 模拟 X6 的邻接边删除及几何存储，检测仅记录调用无法发现的增量回归。
function setup(nodes: OpdNode[]) {
  const props = { nodes, selectedId: "", featureOwnerIds: new Set<string>(), collapsedFeatureOwnerIds: new Set<string>(), nodeColors: undefined as NodeColorPalette | undefined };
  type Cell = ReturnType<typeof createCell>;
  const cells = new Map<string, Cell>();
  function remove(id: string) {
    cells.delete(id);
    for (const [key, cell] of cells) if (cell.source === id || cell.target === id) cells.delete(key);
  }
  function createCell(value: { id: string; x?: number; y?: number; width?: number; height?: number; source?: string; target?: string }, isNode: boolean) {
    let position = { x: value.x ?? 0, y: value.y ?? 0 }, size = { width: value.width ?? 0, height: value.height ?? 0 };
    return { source: value.source, target: value.target, isNode: () => isNode,
      attr: vi.fn(), setVertices: vi.fn(), remove: () => remove(value.id), getPosition: () => position, getSize: () => size,
      position: vi.fn((x: number, y: number) => { position = { x, y }; }), resize: vi.fn((width: number, height: number) => { size = { width, height }; }) };
  }
  const graph = { addNode: vi.fn(value => { const cell = createCell(value, true); cells.set(value.id, cell); return cell; }),
    addEdge: vi.fn(value => { const cell = createCell(value, false); cells.set(value.id, cell); return cell; }),
    getCellById: (id: string) => cells.get(id) };
  const layer = createX6NodeLayer(props, () => graph as unknown as Graph, () => {});
  return { props, graph, cells, layer };
}

function expectPaint(cell: { attr: ReturnType<typeof vi.fn> }, path: string, value: unknown) {
  const [selector, key] = path.split("/");
  expect(cell.attr).toHaveBeenCalledWith(expect.objectContaining({ [selector!]: key
    ? expect.objectContaining({ [key]: value }) : value }), { async: false });
}

function node(id: string, kind: OpdNode["kind"] = "object"): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, kind, x: 80, y: 80, label: id, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}
