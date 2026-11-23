import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import type { GraphEdge, GraphNode } from "@/shared/api/generated/draftWorkspaceContract";
import GraphAnalysisCanvas from "./GraphAnalysisCanvas.vue";
import { graphRelationColor } from "./graphAnalysisModel";

const state = vi.hoisted(() => ({ graph: null as GraphDouble | null, resized: vi.fn(), observed: vi.fn(), onResize: () => {} }));
type Cell = {
  id: string; attrs: Record<string, unknown>; labels: unknown[];
  isNode: () => boolean; isEdge: () => boolean;
  getPosition: () => { x: number; y: number };
  position: (x: number, y: number) => void;
  attr: (key: string, value: unknown) => void;
  setLabels: (labels: unknown[]) => void; setVertices: () => void; setConnector: () => void;
};
type GraphDouble = {
  cells: Map<string, Cell>; handlers: Map<string, (event: { node: Cell; edge: Cell }) => void>;
  scale: number; zoomTo: (scale: number) => void; offsetX: number;
};
vi.mock("@antv/x6", () => ({
  Graph: class {
    cells = new Map<string, Cell>();
    handlers = new Map<string, (event: { node: Cell; edge: Cell }) => void>();
    scale = 1;
    offsetX = 0;
    localToGraph(x: number, y: number) { return { x: x * this.scale + this.offsetX, y: y * this.scale }; }
    constructor() { state.graph = this; }
    on(name: string, handler: (event: { node: Cell; edge: Cell }) => void) { this.handlers.set(name, handler); }
    getCellById(id: string) { return this.cells.get(id); }
    getCells() { return [...this.cells.values()]; }
    removeCells(cells: Cell[]) { cells.forEach(cell => this.cells.delete(cell.id)); }
    addNode(input: { id: string; x: number; y: number }) { this.addCell(input, true); }
    addEdge(input: { id: string; labels: unknown[] }) { this.addCell(input, false); }
    addCell(input: { id: string; x?: number; y?: number; labels?: unknown[] }, node: boolean) {
      let position = { x: input.x ?? 0, y: input.y ?? 0 };
      const cell: Cell = { id: input.id, attrs: {}, labels: input.labels ?? [],
        isNode: () => node, isEdge: () => !node, getPosition: () => position,
        position: (x, y) => { position = { x, y }; }, attr: (key, value) => { cell.attrs[key] = value; },
        setLabels: labels => { cell.labels = labels; }, setVertices: () => {}, setConnector: () => {},
      };
      this.cells.set(cell.id, cell);
    }
    zoom() { return this.scale; }
    zoomTo(scale: number) { this.scale = scale; this.handlers.get("scale")?.({} as never); }
    centerContent() {} resize(width: number, height: number) { state.resized(width, height); } dispose() {}
  },
}));

function setup(edgeCount = 1) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { state.onResize = callback; }
    observe(element: Element) { state.observed(element); } disconnect() {}
  });
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: unknown }) => void;
    postMessage(input: { ids: string[] }) {
      queueMicrotask(() => this.onmessage?.({ data: { positions: Object.fromEntries(input.ids.map((id, index) => [id, { x: index * 100, y: 0 }])), done: true } }));
    }
    terminate() {}
  });
  const nodes: GraphNode[] = ["a", "b"].map(id => ({ id, kind: "OBJECT", label: id, owner_id: null, boundary: false, source_refs: [] }));
  const edges: GraphEdge[] = Array.from({ length: edgeCount }, (_, index) => ({ id: `e${index}`, source: "a", target: "b", relation_type: "TEST", label: `关系${index}`,
    direction: "DIRECTED", derived: false, fact_id: null, group_id: `e${index}`, endpoints: [], source_refs: [] }));
  return mount(GraphAnalysisCanvas, { props: { nodes, edges, selectedId: "", searchIds: [], labels: true, active: true, identity: "test" } });
}
function hover(id: string, entering: boolean) {
  const graph = state.graph!, cell = graph.cells.get(id)!;
  graph.handlers.get(`${id.startsWith("node:") ? "node" : "edge"}:mouse${entering ? "enter" : "leave"}`)?.({ node: cell, edge: cell });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("箭头比线身清晰，方向正确且选中无关关系时仍淡化", async () => {
  const wrapper = setup(); await flushPromises();
  const graph = state.graph!, edge = graph.cells.get("edge:e0")!;
  const marker = () => edge.attrs["line/targetMarker"] as Record<string, unknown>;
  expect(edge.attrs["line/strokeOpacity"]).toBe(0.25);
  expect(marker()).toMatchObject({ size: 5, 'fill-opacity': 0.55, fill: graphRelationColor("TEST") });
  await wrapper.setProps({ edges: [{ ...wrapper.props("edges")[0]!, direction: "BIDIRECTIONAL" }] });
  expect(edge.attrs["line/sourceMarker"]).toEqual(marker());
  await wrapper.setProps({ edges: [{ ...wrapper.props("edges")[0]!, direction: "UNDIRECTED" }] });
  expect(edge.attrs["line/targetMarker"]).toBeNull(); expect(edge.attrs["line/sourceMarker"]).toBeNull();
  const node = { ...wrapper.props("nodes")[0]!, id: "isolated" };
  await wrapper.setProps({ nodes: [...wrapper.props("nodes"), node], edges: [{ ...wrapper.props("edges")[0]!, direction: "DIRECTED" }], selectedId: "isolated" }); await flushPromises();
  expect(marker()['fill-opacity']).toBe(0.08);
  await wrapper.setProps({ selectedId: "e0" }); expect(marker()['fill-opacity']).toBe(1);
  wrapper.unmount();
});

it("空白右键和键盘菜单入口发送屏幕坐标，不改变当前选择", async () => {
  const wrapper = setup(); await flushPromises();
  const preventDefault = vi.fn();
  state.graph!.handlers.get("blank:contextmenu")!({ e: { clientX: 120, clientY: 180, preventDefault } } as never);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(wrapper.emitted("contextMenu")?.[0]).toEqual([{ clientX: 120, clientY: 180 }]);
  await wrapper.get('[data-testid="graph-analysis-canvas"]').trigger("keydown", { key: "F10", shiftKey: true });
  expect(wrapper.emitted("contextMenu")).toHaveLength(2);
  expect(wrapper.emitted("select")).toBeUndefined(); wrapper.unmount();
});

it("关系类型配色不同，选择及过滤重绘保持颜色", async () => {
  const wrapper = setup(2); await flushPromises();
  const edges = wrapper.props("edges").map((edge, index) => ({ ...edge, relation_type: index ? "CAP-ISO-PROC-003" : "CAP-ISO-PROC-002" }));
  await wrapper.setProps({ edges });
  const graph = state.graph!, generated = graph.cells.get("edge:e0")!, effect = graph.cells.get("edge:e1")!;
  expect(generated.attrs["line/stroke"]).toBe(graphRelationColor("CAP-ISO-PROC-002"));
  expect(effect.attrs["line/stroke"]).toBe(graphRelationColor("CAP-ISO-PROC-003"));
  expect(generated.attrs["line/stroke"]).not.toBe(effect.attrs["line/stroke"]);
  await wrapper.setProps({ selectedId: "e0" }); expect(generated.attrs["line/stroke"]).toBe(graphRelationColor("CAP-ISO-PROC-002"));
  await wrapper.setProps({ edges: [edges[0]!] });
  expect(generated.attrs["line/stroke"]).toBe(graphRelationColor("CAP-ISO-PROC-002"));
  wrapper.unmount();
});

it("低于30%隐藏所有标签，选择搜索悬停不绕过阈值，放大后恢复", async () => {
  const wrapper = setup(); await flushPromises();
  const graph = state.graph!, a = graph.cells.get("node:a")!, b = graph.cells.get("node:b")!, edge = graph.cells.get("edge:e0")!;
  for (const selectedId of ["", "a", "e0"]) {
    await wrapper.setProps({ selectedId, searchIds: ["b"] });
    for (const scale of [0.1, 0.2, 0.29]) {
      graph.zoomTo(scale); hover("node:a", true); hover("edge:e0", true);
      expect(a.attrs["label/text"]).toBe(""); expect(b.attrs["label/text"]).toBe(""); expect(edge.labels).toHaveLength(0);
      expect(graph.cells.size).toBe(3);
      hover("node:a", false); hover("edge:e0", false);
    }
    for (const scale of [0.3, 0.35, 0.5, 0.7]) {
      graph.zoomTo(scale);
      expect(a.attrs["label/text"]).toBe("a"); expect(b.attrs["label/text"]).toBe("b"); expect(edge.labels).toHaveLength(1);
    }
  }
  await wrapper.setProps({ labels: false }); graph.zoomTo(1);
  expect(a.attrs["label/text"]).toBe(""); expect(edge.labels).toHaveLength(0);
  wrapper.unmount();
});

it("画布不再生成旧工具栏或静态图例，取消选择仍独立展示", async () => {
  const wrapper = setup(); await flushPromises();
  expect(wrapper.find(".graph-zoom").exists()).toBe(false);
  expect(wrapper.find(".graph-legend").exists()).toBe(false);
  expect(wrapper.text()).not.toContain("全图概览"); expect(wrapper.text()).not.toContain("清晰浏览");
  await wrapper.setProps({ selectedId: "a" });
  expect(wrapper.get(".graph-clear-selection").text()).toBe("取消选择");
  wrapper.unmount();
});

it("视口外节点不占标签名额，平移后按实际视野重新分配", async () => {
  const wrapper = setup(); await flushPromises();
  const template = wrapper.props("nodes")[0]!;
  const nodes = Array.from({ length: 70 }, (_, index) => ({ ...template, id: `n${index}`, label: `节点${index}` }));
  await wrapper.setProps({ nodes, edges: [] }); await flushPromises();
  const graph = state.graph!;
  for (let i = 0; i < 70; i++) graph.cells.get(`node:n${i}`)!.position(i < 60 ? 2000 + (i % 10) * 70 : (i - 60) * 65, Math.floor(i / 10) * 30);
  graph.zoomTo(1);
  expect(graph.cells.get("node:n0")!.attrs["label/text"]).toBe("");
  expect(graph.cells.get("node:n69")!.attrs["label/text"]).toBe("节点69");
  graph.offsetX = -2000; graph.handlers.get("translate")!({} as never);
  expect(graph.cells.get("node:n0")!.attrs["label/text"]).toBe("节点0");
  expect(graph.cells.get("node:n69")!.attrs["label/text"]).toBe("");
  graph.offsetX = 0; graph.handlers.get("translate")!({} as never);
  expect(graph.cells.get("node:n69")!.attrs["label/text"]).toBe("节点69");
  wrapper.unmount();
});

it("节点按平方根缓慢缩放，选择和关闭标签不改变尺寸或节点数量", async () => {
  const wrapper = setup(180); await flushPromises();
  await wrapper.setProps({ nodes: wrapper.props("nodes").map((node, index) => ({ ...node, kind: index ? "STATE" : "PROCESS" })) });
  const graph = state.graph!;
  for (const selectedId of ["", "a", "e0"]) {
    await wrapper.setProps({ selectedId, labels: false });
    for (const scale of [0.1, 0.35, 0.7, 1, 3]) {
      graph.zoomTo(scale);
      const nodes = [...graph.cells.values()].filter(cell => cell.isNode());
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        const baseDiameter = node.id === "node:b" ? 11 : 14;
        expect(Number(node.attrs["body/r"]) * scale * 2).toBeCloseTo(baseDiameter * Math.sqrt(scale));
        expect((Number(node.attrs["label/refX"]) - 10) * scale).toBeCloseTo(baseDiameter / 2 * Math.sqrt(scale) + 5);
        expect(node.attrs["label/text"]).toBe("");
        expect(node.attrs["body/opacity"]).toBe(1);
      }
    }
  }
  wrapper.unmount();
});

it("详情栏开关使用父区域尺寸，忽略X6固定host宽度，激活后重新同步", async () => {
  const wrapper = setup(); await flushPromises();
  const container = wrapper.get(".graph-canvas-wrap").element, host = wrapper.get(".graph-canvas").element;
  let width = 1100;
  Object.defineProperties(container, { clientWidth: { get: () => width }, clientHeight: { get: () => 440 } });
  Object.defineProperty(host, "clientWidth", { value: 800 });
  expect(state.observed).toHaveBeenLastCalledWith(container);
  const graph = state.graph!, position = graph.cells.get("node:a")!.getPosition(); graph.zoomTo(0.7);
  state.onResize(); expect(state.resized).toHaveBeenLastCalledWith(1100, 440);
  width = 800; state.onResize(); expect(state.resized).toHaveBeenLastCalledWith(800, 440);
  await wrapper.setProps({ active: false }); width = 1200;
  await wrapper.setProps({ active: true }); await flushPromises();
  expect(state.resized).toHaveBeenLastCalledWith(1200, 440);
  expect(graph.scale).toBe(0.7); expect(graph.cells.get("node:a")!.getPosition()).toEqual(position);
  wrapper.unmount();
});

it("大图选中节点显示直接关联线名称，缩放保持字号，取消及标签关闭恢复隐藏", async () => {
  const wrapper = setup(180); await flushPromises();
  const template = wrapper.props("edges")[0]!;
  await wrapper.setProps({ edges: [...wrapper.props("edges"), { ...template, id: "unrelated", source: "b", target: "b" }] });
  const graph = state.graph!, edge = graph.cells.get("edge:e0")!, unrelated = graph.cells.get("edge:unrelated")!;
  expect(edge.labels).toHaveLength(0);
  await wrapper.setProps({ selectedId: "a" });
  expect(edge.labels).toHaveLength(1); expect(unrelated.labels).toHaveLength(0);
  for (const scale of [0.5, 0.7, 1.5]) {
    graph.zoomTo(scale);
    const label = edge.labels[0] as { attrs: { label: { fontSize: number } } };
    expect(label.attrs.label.fontSize * scale).toBeCloseTo(12);
  }
  hover("edge:e0", true);
  expect((edge.labels[0] as { attrs: { label: { fontSize: number } } }).attrs.label.fontSize * graph.scale).toBeCloseTo(13);
  hover("edge:e0", false); expect(edge.labels).toHaveLength(1);
  await wrapper.setProps({ labels: false }); expect(edge.labels).toHaveLength(0);
  await wrapper.setProps({ labels: true, selectedId: "" }); expect(edge.labels).toHaveLength(0);
  wrapper.unmount();
});

it("选中和搜索节点的描边在悬停及缩放后仍突出，取消后恢复", async () => {
  const wrapper = setup(); await flushPromises();
  const graph = state.graph!, a = graph.cells.get("node:a")!, b = graph.cells.get("node:b")!;
  await wrapper.setProps({ selectedId: "a", searchIds: ["b"] });
  graph.zoomTo(1); hover("node:a", true); hover("node:a", false);
  expect(a.attrs["body/strokeWidth"]).toBe(4); expect(b.attrs["body/strokeWidth"]).toBe(4);
  graph.zoomTo(0.5);
  expect(a.attrs["body/strokeWidth"]).toBe(8); expect(b.attrs["body/strokeWidth"]).toBe(8);
  await wrapper.setProps({ selectedId: "", searchIds: [] });
  expect(a.attrs["body/strokeWidth"]).toBeCloseTo(1.4); expect(b.attrs["body/strokeWidth"]).toBeCloseTo(1.4);
  wrapper.unmount();
});

it("关闭标签后悬停和选择不显示关系名称，开启后恢复", async () => {
  const wrapper = setup(); await flushPromises();
  const edge = state.graph!.cells.get("edge:e0")!;
  await wrapper.setProps({ labels: false }); hover("edge:e0", true);
  expect(edge.labels).toHaveLength(0);
  await wrapper.setProps({ selectedId: "e0" }); expect(edge.labels).toHaveLength(0);
  hover("edge:e0", false); await wrapper.setProps({ labels: true });
  expect(edge.labels).toHaveLength(1); wrapper.unmount();
});

it("密集图选中关系显示标签且移出后保留，切换和取消选择正确更新", async () => {
  const wrapper = setup(180); await flushPromises();
  const graph = state.graph!, a = graph.cells.get("edge:e0")!, b = graph.cells.get("edge:e1")!;
  expect(a.labels).toHaveLength(0);
  await wrapper.setProps({ selectedId: "e0" }); expect(a.labels).toHaveLength(1);
  hover("edge:e0", true); hover("edge:e0", false); expect(a.labels).toHaveLength(1);
  await wrapper.setProps({ selectedId: "e1" }); expect(a.labels).toHaveLength(0); expect(b.labels).toHaveLength(1);
  hover("edge:e0", true); expect(a.labels).toHaveLength(1);
  hover("edge:e0", false); expect(a.labels).toHaveLength(0);
  await wrapper.setProps({ selectedId: "" }); expect(b.labels).toHaveLength(0);
  wrapper.unmount();
});

it("节点只突出直接连线，关系选择突出端点，背景标签隐藏", async () => {
  const wrapper = setup(); await flushPromises();
  const nodes = [...wrapper.props("nodes"), { ...wrapper.props("nodes")[0]!, id: "c", label: "背景" }];
  await wrapper.setProps({ nodes }); await flushPromises();
  const graph = state.graph!, a = graph.cells.get("node:a")!, c = graph.cells.get("node:c")!;
  await wrapper.setProps({ selectedId: "e0" });
  expect(a.attrs["body/stroke"]).toBe("#0f172a");
  expect(a.attrs["body/opacity"]).toBe(1); expect(c.attrs["body/opacity"]).toBe(0.18);
  expect(c.attrs["label/text"]).toBe("");
  hover("node:c", true); expect(c.attrs["label/text"]).toBe("背景"); expect(c.attrs["body/opacity"]).toBe(1);
  hover("node:c", false); expect(c.attrs["label/text"]).toBe("");
  const edge = wrapper.props("edges")[0]!;
  await wrapper.setProps({ edges: [edge, { ...edge, id: "ac", target: "c" }, { ...edge, id: "bc", source: "b", target: "c" }], selectedId: "a" });
  expect(graph.cells.get("edge:bc")!.attrs["line/strokeOpacity"]).toBe(0.05);
  expect(graph.cells.get("edge:ac")!.attrs["line/strokeOpacity"]).toBe(0.8);
  wrapper.unmount();
});

it("再次点击同一元素、Esc 和可见按钮都可以取消选择", async () => {
  const wrapper = setup(); await flushPromises(); await wrapper.setProps({ selectedId: "a" });
  const graph = state.graph!, node = graph.cells.get("node:a")!;
  graph.handlers.get("node:click")!({ node, edge: node });
  expect(wrapper.emitted("select")?.at(-1)).toEqual([""]);
  await wrapper.get(".graph-canvas-wrap").trigger("keydown", { key: "Escape" });
  expect(wrapper.emitted("select")).toHaveLength(2);
  await wrapper.findAll("button").find(button => button.text() === "取消选择")!.trigger("click");
  expect(wrapper.emitted("select")).toHaveLength(3);
  wrapper.unmount();
});

it("选中关系的重合端点名称始终显示并错开，缩放及取消后正确恢复", async () => {
  const wrapper = setup(); await flushPromises();
  const graph = state.graph!, a = graph.cells.get("node:a")!, b = graph.cells.get("node:b")!;
  a.position(0, 0); b.position(0, 0);
  await wrapper.setProps({ selectedId: "e0" });
  expect(a.attrs["label/text"]).toBe("a"); expect(b.attrs["label/text"]).toBe("b");
  expect(Math.abs(Number(a.attrs["label/refY"]) - Number(b.attrs["label/refY"]))).toBeGreaterThanOrEqual(24 / graph.scale);
  graph.zoomTo(0.5);
  expect(a.attrs["label/text"]).toBe("a"); expect(b.attrs["label/text"]).toBe("b");
  expect(Math.abs(Number(a.attrs["label/refY"]) - Number(b.attrs["label/refY"])) * graph.scale).toBeGreaterThanOrEqual(24);
  hover("node:b", true); hover("node:b", false);
  expect(a.attrs["label/text"]).toBe("a"); expect(b.attrs["label/text"]).toBe("b");
  await wrapper.setProps({ labels: false });
  expect(a.attrs["label/text"]).toBe(""); expect(b.attrs["label/text"]).toBe("");
  await wrapper.setProps({ labels: true, selectedId: "" });
  expect(a.attrs["label/refY"]).toBe(10); expect(b.attrs["label/refY"]).toBe(10);
  wrapper.unmount();
});
