import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

type GraphMock = {
  addEdge: ReturnType<typeof vi.fn>;
  addNode: ReturnType<typeof vi.fn>;
  clearCells: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disablePanning: ReturnType<typeof vi.fn>;
  enablePanning: ReturnType<typeof vi.fn>;
  findViewByCell: ReturnType<typeof vi.fn>;
  getCellById: ReturnType<typeof vi.fn>;
  getCells: ReturnType<typeof vi.fn>;
  getNodesFromPoint: ReturnType<typeof vi.fn>;
  localToClient: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  options: unknown;
  removeCells: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  zoomTo: ReturnType<typeof vi.fn>;
};

const graphInstances = vi.hoisted(() => [] as GraphMock[]);

vi.mock("@antv/x6", () => ({
  Graph: class {
    addEdge = vi.fn();
    addNode = vi.fn();
    clearCells = vi.fn();
    dispose = vi.fn();
    disablePanning = vi.fn();
    enablePanning = vi.fn();
    findViewByCell = vi.fn(() => ({ container: { getBoundingClientRect: () => ({ top: 80, right: 240 }) } }));
    getCellById = vi.fn(() => ({
      isNode: () => true,
      isEdge: () => true,
      position: vi.fn(),
      rotate: vi.fn(),
      attr: vi.fn(),
      setData: vi.fn(),
      setVertices: vi.fn(),
      setRouter: vi.fn(),
      removeRouter: vi.fn(),
      setLabels: vi.fn(),
      remove: vi.fn(),
    }));
    getCells = vi.fn(() => []);
    getNodesFromPoint = vi.fn(() => []);
    localToClient = vi.fn(({ x, y, width, height }) => ({ x: x + 100, y: y + 40, width: width * 2, height: height * 2 }));
    on = vi.fn();
    options: unknown;
    removeCells = vi.fn();
    zoomTo = vi.fn();
    scale = vi.fn(() => ({ sx: 1, sy: 1 }));

    constructor(options: unknown) {
      this.options = options;
      graphInstances.push(this);
    }
  },
}));

import OpdCanvas from "./OpdCanvas.vue";

describe("OpdCanvas", () => {
  it("定位临时展开的属性可以按可见减号收起，取消定位后保持收起", async () => {
    graphInstances.length = 0;
    const feature = { ...createNode("feature.weight", "attribute", 420, 120), ownerId: "element.object" };
    const wrapper = mount(OpdCanvas, { props: { nodes: [...nodes(), feature], relations: [], selectedId: "", selectedIds: [],
      highlightedTextNodeIds: ["element.object", feature.id], zoom: 100 } });
    const graph = graphInstances[0];
    expect(node(graph, feature.id)).toBeDefined();
    expect(node(graph, "element.object").attrs.featureToggle["aria-label"]).toBe("收起所属特征 / Collapse features");
    graphEvent(graph, "node:toggle-features")({ node: { id: "element.object" }, e: { stopPropagation: vi.fn() } });
    const offset = graph.addNode.mock.calls.length;
    await wrapper.setProps({ highlightedTextNodeIds: [] });
    expect(graph.addNode.mock.calls.slice(offset).map(([value]) => value.id)).not.toContain(feature.id);
    expect(wrapper.emitted("select")).toEqual([["element.object"]]);
    wrapper.unmount();
  });
  it("OPL 定位高亮节点与关系，不变成节点编辑多选，取消后恢复边框与背景", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "fact.simple", selectedIds: [],
      highlightedTextNodeIds: ["element.object", "element.process"], highlightedTextRelationIds: ["fact.simple"], zoom: 100, readonly: true } });
    const graph = graphInstances[0];
    expect(node(graph, "element.object").attrs.body).toMatchObject({ fill: "#eaf3fc", stroke: "#0b6bcb", "data-opm-text-highlighted": "true" });
    expect(node(graph, "element.process").attrs.body.stroke).toBe("#0b6bcb");
    expect(node(graph, "element.part-a").attrs.body.fill).toBe("#ffffff");
    const attr = vi.fn();
    graph.getCellById.mockImplementation(() => ({ isNode: () => true, isEdge: () => true, position: vi.fn(), rotate: vi.fn(), attr,
      setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), remove: vi.fn() }));
    graph.clearCells.mockClear();
    await wrapper.setProps({ highlightedTextNodeIds: [], highlightedTextRelationIds: [], selectedId: "" });
    expect(attr).toHaveBeenCalledWith("body/fill", "#ffffff");
    expect(attr).toHaveBeenCalledWith("body/stroke", "#20242a");
    expect(attr).toHaveBeenCalledWith("body/data-opm-text-highlighted", "false");
    expect(graph.clearCells).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(["fact.simple", "fact.effect", "fact.fan"])("关系 %s 选中时整组高亮，改选节点恢复且不重建画布", async selectedId => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId, zoom: 100, readonly: true } });
    const graph = graphInstances[0];
    const selectedEdges = graph.addEdge.mock.calls.map(([value]) => value).filter(value => value.data?.relationId === selectedId);
    expect(selectedEdges.length).toBe(selectedId === "fact.effect" ? 2 : selectedId === "fact.fan" ? 3 : 1);
    selectedEdges.forEach(edge => expect(edge.attrs.line).toMatchObject({ stroke: "#0b6bcb", strokeWidth: 3, "data-opm-selected": "true" }));
    if (selectedId === "fact.fan") expect(node(graph, "fact.fan.junction").attrs.body).toMatchObject({ fill: "#0b6bcb", stroke: "#0b6bcb" });
    const attr = vi.fn();
    graph.getCellById.mockImplementation(() => ({ isNode: () => true, isEdge: () => true, position: vi.fn(), rotate: vi.fn(), attr,
      setData: vi.fn(), setVertices: vi.fn(), removeRouter: vi.fn(), setLabels: vi.fn(), remove: vi.fn() }));
    graph.clearCells.mockClear(); graph.addEdge.mockClear();
    await wrapper.setProps({ selectedId: "element.object" });
    expect(attr.mock.calls.filter(([value]) => value?.line?.stroke === "#20242a")).toHaveLength(selectedEdges.length);
    expect(graph.clearCells).not.toHaveBeenCalled(); expect(graph.addEdge).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("关系分支和三角装饰选择同一个关系，平移及绘制期间不改选", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", selectedIds: [], zoom: 100 } });
    const graph = graphInstances[0];
    graphEvent(graph, "edge:click")({ edge: { id: "fact.fan.member.1" } });
    graphEvent(graph, "node:click")({ node: { id: "fact.fan.junction" }, e: { ctrlKey: true } });
    expect(wrapper.emitted("select")).toEqual([["fact.fan"], ["fact.fan"]]);
    expect(wrapper.emitted("selection")).toBeUndefined();
    graphEvent(graph, "node:contextmenu")({ node: { id: "fact.fan.junction" }, e: { preventDefault: vi.fn(), clientX: 42, clientY: 56 } });
    expect(wrapper.emitted("constructActionsMenuRequested")?.at(-1)?.[0]).toBe("occurrence.fact.fan");
    const count = wrapper.emitted("select")?.length;
    await wrapper.setProps({ interactionTool: "pan" }); graphEvent(graph, "edge:click")({ edge: { id: "fact.simple" } });
    await wrapper.setProps({ interactionTool: "select", relationGesturePhase: "relation-armed" });
    graphEvent(graph, "edge:click")({ edge: { id: "fact.simple" } });
    expect(wrapper.emitted("select")).toHaveLength(count!);
    wrapper.unmount();
  });

  it("子图标记独立于选择，细化列表变化同步边框且保留状态样式", async () => {
    graphInstances.length = 0;
    const modelNodes = [...nodes(), { ...createNode("state.initial", "state", 120, 90), ownerId: "element.object", stateRoles: ["INITIAL" as const] }];
    const wrapper = mount(OpdCanvas, { props: { nodes: modelNodes, relations: [], selectedId: "", zoom: 100,
      refinedElementIds: ["element.object", "element.process", "state.final"] } });
    const graph = graphInstances[0];
    expect(node(graph, "element.object").attrs.body.strokeWidth).toBe(4);
    expect(node(graph, "element.process").attrs.body.strokeWidth).toBe(4);
    expect(node(graph, "element.part-a").attrs.body.strokeWidth).toBe(2);
    expect(node(graph, "state.initial").attrs.body.strokeWidth).toBe(4);
    expect(node(graph, "state.final").attrs.body["data-opm-has-child-opd"]).toBe("false");
    expect(node(graph, "state.final-outline.state.final")).toBeDefined();
    const objectCell = { isNode: () => true, position: vi.fn(), attr: vi.fn() };
    graph.getCellById.mockImplementation(id => id === "element.object" ? objectCell : undefined);
    graph.clearCells.mockClear();
    await wrapper.setProps({ refinedElementIds: [], selectedId: "element.object" });
    expect(objectCell.attr).toHaveBeenCalledWith("body", expect.objectContaining({ strokeWidth: 2, "data-opm-has-child-opd": "false", title: "" }));
    expect(objectCell.attr).toHaveBeenCalledWith("body/fill", "#eaf3fc");
    expect(graph.clearCells).not.toHaveBeenCalled();
    await wrapper.setProps({ refinedElementIds: ["element.object"], readonly: true, selectedId: "" });
    expect(objectCell.attr).toHaveBeenLastCalledWith("body", expect.objectContaining({ strokeWidth: 4, "data-opm-has-child-opd": "true" }));
    wrapper.unmount();
  });
  it("只读版本禁止节点移动但仍允许选择和平移", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100, readonly: true } });
    const graph = graphInstances[0];
    const options = graph.options as { interacting: { nodeMovable: (view: { cell: { id: string } }) => boolean } };
    expect(options.interacting.nodeMovable({ cell: { id: "element.object" } })).toBe(false);
    graphEvent(graph, "node:click")({ node: { id: "element.object" } });
    expect(wrapper.emitted("select")).toEqual([["element.object"]]);
    await wrapper.setProps({ interactionTool: "pan" });
    expect(graph.enablePanning).toHaveBeenCalled();
    await wrapper.setProps({ readonly: false, interactionTool: "select" });
    expect(options.interacting.nodeMovable({ cell: { id: "element.object" } })).toBe(true);
    wrapper.unmount();
  });
  it("关系编辑锚点来自实际路径且随视口更新，双击仅上送 committed 关系意图", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100 } });
    const graph = graphInstances[0];
    const getPointAtRatio = vi.fn(() => ({ x: 200, y: 120 }));
    graph.findViewByCell.mockReturnValue({ getPointAtRatio });
    await wrapper.setProps({ relationEditorTarget: { cellId: "fact.simple", ratio: 0.35 } });
    await flushPromises();
    expect(getPointAtRatio).toHaveBeenLastCalledWith(0.35);
    expect(wrapper.emitted("relationEditorAnchor")?.at(-1)).toEqual([{ clientX: 300, clientY: 160 }]);
    graph.localToClient.mockImplementation(({ x, y }) => ({ x: x + 400, y: y + 200 }));
    for (const event of ["scale", "translate", "resize", "render:done"]) {
      graphEvent(graph, event)();
      expect(wrapper.emitted("relationEditorAnchor")?.at(-1)).toEqual([{ clientX: 600, clientY: 320 }]);
    }
    const doubleClick = graphEvent(graph, "edge:dblclick");
    doubleClick({ edge: { id: "candidate.cell", getData: () => ({}) } });
    expect(wrapper.emitted("relationLabelEditRequested")).toBeUndefined();
    doubleClick({ edge: { id: "fact.simple", getData: () => ({ relationId: "fact.simple" }) } });
    expect(wrapper.emitted("relationLabelEditRequested")).toEqual([["fact.simple"]]);
    await wrapper.setProps({ interactionTool: "pan" });
    doubleClick({ edge: { id: "fact.simple", getData: () => ({}) } });
    expect(wrapper.emitted("relationLabelEditRequested")).toHaveLength(1);
    graph.findViewByCell.mockReturnValue(null);
    graphEvent(graph, "render:done")();
    expect(wrapper.emitted("relationEditorAnchor")?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it("只为语义节点和 Fact 写入 occurrence capture anchor 与 action testid", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100 } });
    await nextTick();

    const graph = graphInstances[0];
    expect(graph).toBeDefined();
    expect(graph.options).toMatchObject({ autoResize: true });
    const initialAnchors = captureAnchors(graph);
    expect(initialAnchors).toEqual([
      "occurrence.element.object", "occurrence.element.part-a", "occurrence.element.part-b", "occurrence.element.process", "occurrence.fact.effect", "occurrence.fact.fan", "occurrence.fact.simple", "occurrence.state.final",
    ]);
    expectSemanticCell(node(graph, "element.object"), "body", "occurrence.element.object");
    expectSemanticCell(edge(graph, "fact.simple"), "line", "occurrence.fact.simple");
    expectSemanticCell(edge(graph, "fact.effect.input"), "line", "occurrence.fact.effect");
    expectSemanticCell(edge(graph, "fact.fan.root"), "line", "occurrence.fact.fan");
    expectDecorativeCell(node(graph, "state.final-outline.state.final"), "body");
    expectDecorativeCell(edge(graph, "state.default.state.final"), "line");
    expectDecorativeCell(edge(graph, "fact.effect.output"), "line");
    expectDecorativeCell(edge(graph, "fact.fan.member.0"), "line");
    expectDecorativeCell(node(graph, "fact.fan.junction"), "body");
    expect(node(graph, "state.final").zIndex).toBeGreaterThan(node(graph, "element.object").zIndex);

    const clearCalls = graph.clearCells.mock.calls.length;
    await wrapper.setProps({ zoom: 400 });
    await nextTick();

    expect(graph.clearCells).toHaveBeenCalledTimes(clearCalls);
    expect(graph.zoomTo).toHaveBeenLastCalledWith(4, { center: { x: 0, y: 0 } });
    const zoomCalls = graph.zoomTo.mock.calls.length;
    await wrapper.setProps({ selectedId: "element.object" });
    expect(graph.zoomTo).toHaveBeenCalledTimes(zoomCalls);
    wrapper.unmount();
  });

  it("候选预览只渲染 transient Cell，Finding 高亮不改变 committed anchor", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, {
      props: {
        nodes: nodes(), relations: relations(), selectedId: "", zoom: 100,
        relationPreview: {
          candidateId: "candidate.visual.candidate-layer",
          capabilityId: "CAP-ISO-PROC-001",
          symbolDescriptor: { id: "symbol.link.consumption", version: "0.1.0", digest: "0".repeat(64) },
          normalizedEndpoints: [],
          cells: [{
            kind: "edge", id: "candidate.visual.candidate-layer.cell.0", source: "element.object", target: "element.process", data: {},
            line: { stroke: "#20242a", strokeWidth: 2 }, labels: [],
          }],
          primaryCellId: "candidate.visual.candidate-layer.cell.0",
          ephemeral: true,
        },
        highlightedFindingTargetId: "fact.simple",
      },
    });
    await nextTick();

    const graph = graphInstances[0];
    const candidate = edge(graph, "candidate.visual.candidate-layer.cell.0");
    expect(candidate.attrs.line["data-opm-candidate-cell-id"]).toBe("candidate.visual.candidate-layer");
    expect(candidate.attrs.line["data-testid"]).toBe("p03-candidate-candidate.visual.candidate-layer");
    expect(candidate.attrs.line["data-opm-capture-cell-id"]).toBeUndefined();
    expect(edge(graph, "fact.simple").attrs.line["data-opm-finding-highlight"]).toBe("true");
    expect(edge(graph, "fact.effect.input").attrs.line["data-opm-finding-highlight"]).toBe("false");

    const preview = wrapper.props("relationPreview");
    graph.getCells.mockReturnValue([{ id: "candidate.visual.candidate-layer.cell.0" }]);
    await wrapper.setProps({ relationPreview: { ...preview, cells: preview?.cells.map((cell) => cell.kind === "edge" ? { ...cell, labels: [{ text: "更新", position: 0.5 }] } : cell) } });
    await nextTick();
    expect(graph.addEdge.mock.calls.filter(([value]) => value.id === "candidate.visual.candidate-layer.cell.0")).toHaveLength(1);
    expect(graph.getCellById).toHaveBeenCalledWith("candidate.visual.candidate-layer.cell.0");

    await wrapper.setProps({ selectedId: "element.object" });
    await nextTick();
    expect(graph.addEdge.mock.calls.filter(([value]) => value.id === "candidate.visual.candidate-layer.cell.0")).toHaveLength(1);

    await wrapper.setProps({ relationPreview: undefined });
    await nextTick();
    expect(graph.removeCells).toHaveBeenCalledWith(["candidate.visual.candidate-layer.cell.0"]);
    wrapper.unmount();
  });

  it("元素拖动仅在选择模式启用，平移工具禁止移动元素", async () => {
    graphInstances.length = 0;
    const movableNodes = [
      ...nodes(),
      createNode("feature.attribute", "attribute", 260, 160),
      createNode("feature.operation", "operation", 260, 240),
    ];
    const wrapper = mount(OpdCanvas, { props: { nodes: movableNodes, relations: relations(), selectedId: "", zoom: 100 } });
    await nextTick();

    const graph = graphInstances[0];
    const options = graph.options as { interacting: { nodeMovable: (cellView: { cell: { id: string } }) => boolean }; panning: { enabled: boolean; eventTypes: string[] } };
    expect(options.panning).toEqual({ enabled: false, eventTypes: ["leftMouseDown"] });
    expect(options.interacting.nodeMovable({ cell: { id: "element.object" } })).toBe(true);
    expect(options.interacting.nodeMovable({ cell: { id: "element.process" } })).toBe(true);
    expect(options.interacting.nodeMovable({ cell: { id: "feature.attribute" } })).toBe(true);
    expect(options.interacting.nodeMovable({ cell: { id: "feature.operation" } })).toBe(true);
    expect(options.interacting.nodeMovable({ cell: { id: "state.final" } })).toBe(true);
    expect(graph.addNode.mock.calls.find(([node]) => node.id === "feature.operation")?.[0].shape).toBe("ellipse");

    const select = graph.on.mock.calls.find(([event]) => event === "node:click")?.[1];
    const moved = graph.on.mock.calls.find(([event]) => event === "node:moved")?.[1];
    await wrapper.setProps({ interactionTool: "pan" });
    await nextTick();
    expect(graph.enablePanning).toHaveBeenCalledTimes(1);
    expect(options.interacting.nodeMovable({ cell: { id: "element.object" } })).toBe(false);
    select({ node: { id: "element.object" } });
    expect(wrapper.emitted("select")).toBeUndefined();

    await wrapper.setProps({ interactionTool: "select" });
    await nextTick();
    expect(graph.disablePanning).toHaveBeenCalledTimes(1);
    select({ node: { id: "element.object" } });
    moved({ node: { id: "element.object", getPosition: () => ({ x: 240, y: 180 }) } });
    moved({ node: { id: "feature.attribute", getPosition: () => ({ x: 300, y: 220 }) } });
    moved({ node: { id: "feature.operation", getPosition: () => ({ x: 12, y: 24 }) } });
    moved({ node: { id: "state.final", getPosition: () => ({ x: 10, y: 10 }) } });

    expect(wrapper.emitted("select")).toEqual([["element.object"]]);
    expect(wrapper.emitted("move")).toEqual([
      ["occurrence.element.object", 240, 180],
      ["occurrence.feature.attribute", 300, 220],
      ["occurrence.feature.operation", 12, 24],
      ["occurrence.state.final", 88, 108],
    ]);
    wrapper.unmount();
  });

  it("关系释放按坐标命中最高层语义节点且只上送意图", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100, relationGesturePhase: "relation-armed" } });
    await nextTick();

    const graph = graphInstances[0];
    graph.getNodesFromPoint.mockReturnValue([
      { id: "element.object", getZIndex: () => 1 },
      { id: "element.process", getZIndex: () => 2 },
    ]);
    graphEvent(graph, "node:mousedown")({ node: { id: "element.object" }, x: 100, y: 100 });
    const dragEdge = edge(graph, "candidate.relation.drag");
    expect(dragEdge.attrs.wrap.pointerEvents).toBe("none");
    expect(dragEdge.attrs.line.pointerEvents).toBe("none");
    graphEvent(graph, "edge:mouseup")({ edge: { id: "candidate.relation.drag" }, x: 460, y: 120, e: { shiftKey: true, altKey: false } });

    expect(wrapper.emitted("relationIntent")).toEqual([
      [{ type: "relation-drag-start", source_occurrence_id: "occurrence.element.object", pointer: { x: 100, y: 100 } }],
      [{ type: "relation-endpoint-selected", source_occurrence_id: "occurrence.element.object", target_occurrence_id: "occurrence.element.process", pointer: { x: 460, y: 120 }, continue_collection: true, open_parameters: false }],
    ]);
    wrapper.unmount();
  });

  it("结构未变化时只同步坐标与选中态，不清空画布", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100 } });
    await nextTick();

    const graph = graphInstances[0];
    const clearCalls = graph.clearCells.mock.calls.length;
    const movedNodes = nodes().map((node) => node.id === "element.object" ? { ...node, x: 240, y: 180 } : node);
    await wrapper.setProps({ nodes: movedNodes, selectedId: "element.object" });
    await nextTick();

    expect(graph.clearCells).toHaveBeenCalledTimes(clearCalls);
    const objectCell = graph.getCellById.mock.results
      .map((result) => result.value)
      .find((cell) => cell.position.mock.calls.some(([x, y]: [number, number]) => x === 240 && y === 180));
    expect(objectCell.position).toHaveBeenCalledWith(240, 180);
    expect(objectCell.attr).toHaveBeenCalledWith("body/fill", "#eaf3fc");
    wrapper.unmount();
  });

  it("Attribute 与 Operation 默认连接 owner，Element 控件可展开且新增 Feature 后自动收起", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: [], selectedId: "", zoom: 100 } });
    await nextTick();

    const graph = graphInstances[0];
    const click = graphEvent(graph, "node:click");
    const toggle = graphEvent(graph, "node:toggle-features");
    const clearCallsBeforeSelection = graph.clearCells.mock.calls.length;
    click({ node: { id: "element.object" } });
    expect(wrapper.emitted("select")).toEqual([["element.object"]]);
    expect(graph.clearCells).toHaveBeenCalledTimes(clearCallsBeforeSelection);

    const attributes = [
      { ...createNode("feature.attribute-1", "attribute", 280, 94), ownerId: "element.object" },
      { ...createNode("feature.attribute-2", "attribute", 280, 190), ownerId: "element.object" },
      { ...createNode("feature.attribute-3", "attribute", 280, 286), ownerId: "element.object" },
    ];
    const operations = [
      { ...createNode("feature.operation-1", "operation", 620, 100), ownerId: "element.process" },
      { ...createNode("feature.operation-2", "operation", 620, 196), ownerId: "element.process" },
    ];
    const operationState = { ...createNode("state.operation.ready", "state", 650, 130), ownerId: "feature.operation-1" };
    const otherAttribute = { ...createNode("feature.other-attribute", "attribute", 780, 40), ownerId: "element.part-a" };
    const orphanAttribute = { ...createNode("feature.orphan-attribute", "attribute", 780, 120), ownerId: "element.missing" };
    const nodeOffset = graph.addNode.mock.calls.length;
    const edgeOffset = graph.addEdge.mock.calls.length;
    await wrapper.setProps({ nodes: [...nodes(), ...attributes, ...operations, operationState, otherAttribute, orphanAttribute] });
    await nextTick();

    const addedNodeSpecs = graph.addNode.mock.calls.slice(nodeOffset).map(([value]) => value);
    const addedNodes = addedNodeSpecs.map((value) => value.id);
    const addedEdges = graph.addEdge.mock.calls.slice(edgeOffset).map(([value]) => value);
    expect(addedNodes).not.toContain("feature.attribute-1");
    expect(addedNodes).not.toContain("feature.operation-1");
    expect(addedNodes).not.toContain("state.operation.ready");
    expect(addedNodeSpecs.find((value) => value.id === "element.object")?.attrs).toMatchObject({
      featureToggle: { "aria-label": "展开所属特征 / Expand features", event: "node:toggle-features" },
      featureToggleGlyph: { d: "M144 13H150M147 10V16", pointerEvents: "none" },
    });
    expect(addedNodeSpecs.find((value) => value.id === "element.process")?.markup[0]).toEqual({ tagName: "ellipse", selector: "body" });
    expect(addedEdges.map((value) => value.id)).not.toContain("feature.owner-group.element.object.characterization");
    expect(addedEdges.map((value) => value.id)).not.toContain("feature.owner-group.element.process.composition");
    expect(addedEdges.map((value) => value.id)).not.toContain("feature.owner.feature.orphan-attribute");

    const expandedNodeOffset = graph.addNode.mock.calls.length;
    const expandedEdgeOffset = graph.addEdge.mock.calls.length;
    const stopPropagation = vi.fn();
    toggle({ node: { id: "element.object" }, e: { stopPropagation } });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(graph.addNode.mock.calls.slice(expandedNodeOffset).map(([value]) => value.id)).toEqual(expect.arrayContaining(attributes.map((attribute) => attribute.id)));
    const expandedEdges = graph.addEdge.mock.calls.slice(expandedEdgeOffset).map(([value]) => value);
    const attributeRelationId = "feature.owner-group.element.object.characterization";
    expect(expandedEdges).toContainEqual(expect.objectContaining({
      id: attributeRelationId,
      source: "element.object",
      target: `${attributeRelationId}.junction`,
      attrs: {
        wrap: { pointerEvents: "none" },
        line: expect.objectContaining({ pointerEvents: "none", sourceMarker: null, targetMarker: null, strokeDasharray: undefined }),
      },
    }));
    expectDecorativeCell(expandedEdges.find((value) => value.id === attributeRelationId), "line");
    attributes.forEach((attribute) => expect(expandedEdges).toContainEqual(expect.objectContaining({
      id: `${attributeRelationId}.member.${attribute.id}`,
      source: `${attributeRelationId}.junction`,
      target: attribute.id,
      vertices: [{ x: 253, y: attribute.y + 22 }],
    })));
    expect(expandedEdges.filter((value) => value.id.startsWith(`${attributeRelationId}.member.`))).toHaveLength(3);
    const attributeMarker = node(graph, `${attributeRelationId}.junction`);
    const attributeInnerMarker = node(graph, `${attributeRelationId}.junction.inner`);
    expect(attributeMarker).toMatchObject({ shape: "polygon", x: 241, y: 104, angle: 270, attrs: { body: { fill: "#ffffff", pointerEvents: "none" } } });
    expect(attributeInnerMarker).toMatchObject({ shape: "polygon", angle: attributeMarker.angle, attrs: { body: { fill: "#20242a", pointerEvents: "none" } } });
    expectDecorativeCell(attributeMarker, "body");
    expectDecorativeCell(attributeInnerMarker, "body");
    expect(graph.addNode.mock.calls.slice(expandedNodeOffset).map(([value]) => value.id).filter((id) => id === `${attributeRelationId}.junction`)).toHaveLength(1);

    const processExpandedNodeOffset = graph.addNode.mock.calls.length;
    const processExpandedEdgeOffset = graph.addEdge.mock.calls.length;
    toggle({ node: { id: "element.process" }, e: { stopPropagation: vi.fn() } });
    const processExpandedNodes = graph.addNode.mock.calls.slice(processExpandedNodeOffset).map(([value]) => value.id);
    expect(processExpandedNodes).toEqual(expect.arrayContaining(operations.map((operation) => operation.id)));
    expect(processExpandedNodes).toContain("state.operation.ready");
    const processExpandedEdges = graph.addEdge.mock.calls.slice(processExpandedEdgeOffset).map(([value]) => value);
    const operationRelationId = "feature.owner-group.element.process.composition";
    expect(processExpandedEdges).toContainEqual(expect.objectContaining({
      id: operationRelationId,
      source: "element.process",
      target: `${operationRelationId}.junction`,
    }));
    operations.forEach((operation) => expect(processExpandedEdges).toContainEqual(expect.objectContaining({
      id: `${operationRelationId}.member.${operation.id}`,
      source: `${operationRelationId}.junction`,
      target: operation.id,
      vertices: [{ x: 595, y: operation.y + 22 }],
    })));
    expect(processExpandedEdges.filter((value) => value.id.startsWith(`${operationRelationId}.member.`))).toHaveLength(2);
    const operationMarker = node(graph, `${operationRelationId}.junction`);
    expect(operationMarker).toMatchObject({ shape: "polygon", x: 583, y: 110, angle: 270, attrs: { body: { fill: "#20242a", pointerEvents: "none" } } });
    expect(graph.addNode.mock.calls.map(([value]) => value.id)).not.toContain(`${operationRelationId}.junction.inner`);
    expectDecorativeCell(operationMarker, "body");
    expect(processExpandedNodes.filter((id) => id === `${operationRelationId}.junction`)).toHaveLength(1);

    const newlyCreatedAttribute = { ...createNode("feature.attribute-4", "attribute", 280, 382), ownerId: "element.object" };
    const createdNodeOffset = graph.addNode.mock.calls.length;
    const createdEdgeOffset = graph.addEdge.mock.calls.length;
    const newlyCreatedOperation = { ...createNode("feature.operation-3", "operation", 620, 292), ownerId: "element.process" };
    await wrapper.setProps({ nodes: [...nodes(), ...attributes, newlyCreatedAttribute, ...operations, newlyCreatedOperation, operationState, otherAttribute, orphanAttribute] });
    await nextTick();
    expect(graph.addNode.mock.calls.slice(createdNodeOffset).map(([value]) => value.id)).not.toContain("feature.attribute-1");
    expect(graph.addNode.mock.calls.slice(createdNodeOffset).map(([value]) => value.id)).not.toContain("feature.operation-1");
    expect(graph.addEdge.mock.calls.slice(createdEdgeOffset).map(([value]) => value.id)).not.toContain(attributeRelationId);
    expect(graph.addEdge.mock.calls.slice(createdEdgeOffset).map(([value]) => value.id)).not.toContain(operationRelationId);

    const reexpandedNodeOffset = graph.addNode.mock.calls.length;
    const reexpandedEdgeOffset = graph.addEdge.mock.calls.length;
    toggle({ node: { id: "element.object" }, e: { stopPropagation: vi.fn() } });
    expect(graph.addNode.mock.calls.slice(reexpandedNodeOffset).map(([value]) => value.id)).toEqual(expect.arrayContaining([...attributes.map((attribute) => attribute.id), newlyCreatedAttribute.id]));
    const reexpandedEdges = graph.addEdge.mock.calls.slice(reexpandedEdgeOffset).map(([value]) => value);
    expect(reexpandedEdges.filter((value) => value.id === attributeRelationId)).toHaveLength(1);
    expect(reexpandedEdges.filter((value) => value.id.startsWith(`${attributeRelationId}.member.`))).toHaveLength(4);
    wrapper.unmount();
  });

  it.each([
    ["feature.attribute", "attribute", "Renamed Attribute"],
    ["feature.operation", "operation", "Renamed Operation"],
  ] as const)("双击 %s 使用现有名称输入层提交", async (id, kind, renamed) => {
    graphInstances.length = 0;
    const beginNameEdit = vi.fn().mockResolvedValue(true);
    const submitNameEdit = vi.fn().mockResolvedValue(true);
    const feature = { ...createNode(id, kind, 280, 96), ownerId: kind === "attribute" ? "element.object" : "element.process" };
    const wrapper = mount(OpdCanvas, { props: { nodes: [...nodes(), feature], relations: [], selectedId: "", zoom: 100, beginNameEdit, submitNameEdit } });
    await nextTick();
    graphEvent(graphInstances[0], "node:toggle-features")({ node: { id: feature.ownerId }, e: { stopPropagation: vi.fn() } });
    graphEvent(graphInstances[0], "node:dblclick")({ node: { id } });
    await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    await input.setValue(renamed);
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(beginNameEdit).toHaveBeenCalledWith(id);
    expect(submitNameEdit).toHaveBeenCalledWith(id, renamed);
    wrapper.unmount();
  });

  it("双击 Object 后按视口坐标定位名称输入并在 Enter 成功后关闭", async () => {
    graphInstances.length = 0;
    const beginNameEdit = vi.fn().mockResolvedValue(true);
    const submitNameEdit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(OpdCanvas, {
      attachTo: document.body,
      props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100, beginNameEdit, submitNameEdit },
    });
    await nextTick();

    const graph = graphInstances[0];
    graphEvent(graph, "node:dblclick")({ node: { id: "element.object" } });
    await flushPromises();

    expect(beginNameEdit).toHaveBeenCalledWith("element.object");
    expect(wrapper.emitted("select")).toEqual([["element.object"]]);
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    expect(input.element.value).toBe("element.object");
    expect(input.attributes("style")).toContain("left: 196px");
    expect(input.attributes("style")).toContain("top: 166px");
    expect(input.attributes("style")).toContain("width: 288px");
    expect(input.attributes("style")).toContain("height: 52px");
    expect(input.attributes("style")).toContain("font-size: 26px");

    const positionCalls = graph.localToClient.mock.calls.length;
    graphEvent(graph, "scale")();
    graphEvent(graph, "translate")();
    expect(graph.localToClient).toHaveBeenCalledTimes(positionCalls + 2);

    await input.setValue("Renamed Object");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledWith("element.object", "Renamed Object");
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("保存入口等待名称提交，IME和失败时保留输入", async () => {
    graphInstances.length = 0;
    const submitNameEdit = vi.fn().mockResolvedValue(false);
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100, beginNameEdit: vi.fn().mockResolvedValue(true), submitNameEdit } });
    await nextTick();
    graphEvent(graphInstances[0], "node:dblclick")({ node: { id: "element.object" } }); await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]'); await input.setValue("新名称");
    await input.trigger("compositionstart"); expect(await wrapper.vm.finishNameEdit()).toBe(false); expect(submitNameEdit).not.toHaveBeenCalled();
    await input.trigger("compositionend"); expect(await wrapper.vm.finishNameEdit()).toBe(false); expect(input.element.value).toBe("新名称");
    submitNameEdit.mockResolvedValue(true); expect(await wrapper.vm.finishNameEdit()).toBe(true);
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false); wrapper.unmount();
  });

  it("名称输入处理 IME、失败保留、Escape 与同名失焦关闭", async () => {
    graphInstances.length = 0;
    const submitNameEdit = vi.fn().mockResolvedValue(false);
    const wrapper = mount(OpdCanvas, {
      attachTo: document.body,
      props: {
        nodes: nodes(), relations: relations(), selectedId: "", zoom: 100,
        beginNameEdit: vi.fn().mockResolvedValue(true), submitNameEdit,
      },
    });
    await nextTick();
    const graph = graphInstances[0];
    const open = async () => {
      graphEvent(graph, "node:dblclick")({ node: { id: "element.process" } });
      await flushPromises();
      return wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    };

    let input = await open();
    await input.setValue("处理中");
    await input.trigger("compositionstart");
    await input.trigger("keydown", { key: "Enter", isComposing: true });
    expect(submitNameEdit).not.toHaveBeenCalled();
    await input.trigger("compositionend");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    expect(submitNameEdit).toHaveBeenCalledWith("element.process", "处理中");
    expect(input.element.value).toBe("处理中");
    expect(document.activeElement).toBe(input.element);

    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false);

    input = await open();
    await input.trigger("blur");
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("改名失焦提交一次，失败保留输入而不是丢弃", async () => {
    graphInstances.length = 0;
    const submitNameEdit = vi.fn().mockResolvedValue(false);
    const wrapper = mount(OpdCanvas, { attachTo: document.body, props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100,
      beginNameEdit: vi.fn().mockResolvedValue(true), submitNameEdit } });
    graphEvent(graphInstances[0], "node:dblclick")({ node: { id: "element.object" } }); await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    await input.setValue("咖啡豆"); await input.trigger("blur"); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledExactlyOnceWith("element.object", "咖啡豆");
    expect(input.element.value).toBe("咖啡豆"); expect(document.activeElement).toBe(input.element);
    submitNameEdit.mockResolvedValue(true); await input.trigger("blur"); await flushPromises();
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false); wrapper.unmount();
  });

  it("IME失焦等待最终输入，保存入口等待同一个在途提交", async () => {
    graphInstances.length = 0;
    let resolve!: (success: boolean) => void;
    const submitNameEdit = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100,
      beginNameEdit: vi.fn().mockResolvedValue(true), submitNameEdit } });
    graphEvent(graphInstances[0], "node:dblclick")({ node: { id: "element.object" } }); await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    await input.trigger("compositionstart"); input.element.value = "kafei"; await input.trigger("input"); await input.trigger("blur");
    expect(submitNameEdit).not.toHaveBeenCalled();
    input.element.value = "咖啡豆"; await input.trigger("compositionend"); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledExactlyOnceWith("element.object", "咖啡豆");
    await input.trigger("blur"); await input.trigger("keydown", { key: "Enter" });
    const finish = wrapper.vm.finishNameEdit();
    expect(submitNameEdit).toHaveBeenCalledTimes(1);
    resolve(true); expect(await finish).toBe(true);
    expect(wrapper.find('[data-testid="p03-name-editor"]').exists()).toBe(false); wrapper.unmount();
  });

  it("切换编辑目标前保留失败的旧名称，卸载后不恢复旧焦点", async () => {
    graphInstances.length = 0;
    let resolve!: (success: boolean) => void;
    const beginNameEdit = vi.fn().mockResolvedValue(true);
    const submitNameEdit = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const wrapper = mount(OpdCanvas, { attachTo: document.body, props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100, beginNameEdit, submitNameEdit } });
    const doubleClick = graphEvent(graphInstances[0], "node:dblclick");
    doubleClick({ node: { id: "element.object" } }); await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="p03-name-editor"]');
    await input.setValue("保留输入"); await input.trigger("blur"); doubleClick({ node: { id: "element.process" } });
    resolve(false); await flushPromises();
    expect(beginNameEdit).toHaveBeenCalledTimes(1); expect(input.element.value).toBe("保留输入");
    await input.trigger("blur"); wrapper.unmount(); resolve(false); await flushPromises();
    expect(document.activeElement).not.toBe(input.element);
  });

  it("空白右键只请求画布菜单，不清空选择，平移和只读模式同样支持", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "element.object", zoom: 100 } });
    const preventDefault = vi.fn();
    const open = () => graphEvent(graphInstances[0], "blank:contextmenu")({ e: { clientX: 120, clientY: 140, preventDefault } });
    open();
    await wrapper.setProps({ readonly: true, interactionTool: "pan" }); open();
    expect(wrapper.emitted("blankMenuRequested")).toEqual([[{ clientX: 120, clientY: 140 }], [{ clientX: 120, clientY: 140 }]]);
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("constructActionsMenuRequested")).toBeUndefined();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("右键请求菜单，Backspace 直接请求删除且不影响输入框", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, {
      attachTo: document.body,
      props: { nodes: nodes(), relations: relations(), selectedId: "element.object", zoom: 100 },
    });
    await nextTick();
    const graph = graphInstances[0];
    const preventDefault = vi.fn();

    graphEvent(graph, "node:contextmenu")({ node: { id: "element.object" }, e: { clientX: 120, clientY: 140, preventDefault } });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(wrapper.emitted("constructActionsMenuRequested")?.[0]).toEqual([
      "occurrence.element.object", { clientX: 120, clientY: 140 }, "menu",
    ]);

    const backspace = new KeyboardEvent("keydown", { key: "Backspace", cancelable: true });
    window.dispatchEvent(backspace);
    expect(backspace.defaultPrevented).toBe(true);
    expect(wrapper.emitted("constructActionsMenuRequested")?.[1]).toEqual([
      "occurrence.element.object", { clientX: 240, clientY: 80 }, "direct",
    ]);

    const input = document.createElement("input");
    document.body.append(input);
    const inputBackspace = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    input.dispatchEvent(inputBackspace);
    expect(inputBackspace.defaultPrevented).toBe(false);
    expect(wrapper.emitted("constructActionsMenuRequested")).toHaveLength(2);
    input.remove();
    wrapper.unmount();
  });
  it("非活动画布与已处理的快捷键不会请求删除正式元素", async () => {
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: 'element.object', zoom: 100, keyboardDisabled: true } });
    await nextTick(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
    expect(wrapper.emitted('constructActionsMenuRequested')).toBeUndefined();
    await wrapper.setProps({ keyboardDisabled: false }); const handled = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }); handled.preventDefault(); window.dispatchEvent(handled);
    expect(wrapper.emitted('constructActionsMenuRequested')).toBeUndefined(); wrapper.unmount();
  });
});

function graphEvent(graph: GraphMock, eventName: string) {
  const handler = graph.on.mock.calls.find(([event]) => event === eventName)?.[1];
  if (!handler) throw new Error(`缺少 X6 事件处理器：${eventName}`);
  return handler;
}

function captureAnchors(graph: GraphMock, nodeOffset = 0, edgeOffset = 0) {
  return [
    ...graph.addNode.mock.calls.slice(nodeOffset).map(([value]) => value.attrs.body["data-opm-capture-cell-id"]),
    ...graph.addEdge.mock.calls.slice(edgeOffset).map(([value]) => value.attrs.line["data-opm-capture-cell-id"]),
  ].filter((value): value is string => typeof value === "string").sort();
}

function expectSemanticCell(cell: Record<string, { [key: string]: string }>, attribute: "body" | "line", occurrenceId: string) {
  expect(cell.attrs[attribute]["data-opm-capture-cell-id"]).toBe(occurrenceId);
  expect(cell.attrs[attribute]["data-testid"]).toBe(`p03-occurrence-${occurrenceId}`);
}

function expectDecorativeCell(cell: Record<string, { [key: string]: string }>, attribute: "body" | "line") {
  expect(cell.attrs[attribute]["data-opm-capture-cell-id"]).toBeUndefined();
  expect(cell.attrs[attribute]["data-testid"]).toBeUndefined();
}

function node(graph: GraphMock, id: string) {
  return graph.addNode.mock.calls.map(([value]) => value).find((value) => value.id === id);
}

function edge(graph: GraphMock, id: string) {
  return graph.addEdge.mock.calls.map(([value]) => value).find((value) => value.id === id);
}

function nodes(): OpdNode[] {
  return [
    createNode("element.object", "object", 80, 80),
    createNode("element.process", "process", 420, 80),
    createNode("element.part-a", "object", 620, 40),
    createNode("element.part-b", "object", 620, 220),
    { ...createNode("state.final", "state", 120, 150), ownerId: "element.object", stateRoles: ["DEFAULT", "FINAL"] },
  ];
}

function createNode(id: string, kind: OpdNode["kind"], x: number, y: number): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, label: id, kind, x, y, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}

function relations(): ConsumptionRelation[] {
  return [
    { id: "fact.simple", occurrenceId: "occurrence.fact.simple", sourceId: "element.object", targetId: "element.process", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.process", symbolRef: "symbol.link.consumption", layoutRef: "layout.fact.simple", capabilityId: "CAP-ISO-PROC-001" },
    {
      id: "fact.effect", occurrenceId: "occurrence.fact.effect", sourceId: "element.object", targetId: "element.process", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.process", symbolRef: "symbol.link.effect", layoutRef: "layout.fact.effect", capabilityId: "CAP-ISO-PROC-003",
      endpoints: [endpoint("AFFECTEE", "element.object", 0), endpoint("AFFECTING_PROCESS", "element.process", 1), endpoint("AFFECTED", "element.part-a", 2)],
    },
    {
      id: "fact.fan", occurrenceId: "occurrence.fact.fan", sourceId: "element.object", targetId: "element.part-a", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.part-a", symbolRef: "symbol.link.structural.aggregation", layoutRef: "layout.fact.fan", capabilityId: "CAP-ISO-STRUCT-005", collectionCompleteness: "INCOMPLETE",
      endpoints: [endpoint("WHOLE_THING", "element.object", 0), endpoint("PART_THING", "element.part-a", 1), endpoint("PART_THING", "element.part-b", 2)],
    },
  ];
}

function endpoint(role: string, targetId: string, ordinal: number) {
  return { role, targetId, targetKind: "ELEMENT" as const, ordinal };
}
