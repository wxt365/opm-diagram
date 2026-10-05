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

    constructor(options: unknown) {
      this.options = options;
      graphInstances.push(this);
    }
  },
}));

import OpdCanvas from "./OpdCanvas.vue";

describe("OpdCanvas", () => {
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
    expect(graph.zoomTo).toHaveBeenLastCalledWith(4);
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

  it("选择与平移模式互斥，且选择模式只上送可移动构造的 occurrence 与坐标", async () => {
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
    expect(options.panning).toEqual({ enabled: false, eventTypes: ["leftMouseDown", "mouseWheel"] });
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
