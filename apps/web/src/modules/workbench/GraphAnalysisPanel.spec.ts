import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { defineComponent, type PropType } from "vue";
import GraphAnalysisPanel from "./GraphAnalysisPanel.vue";
import { graphNeighborhood, filterGraph, localizeGraph, graphRelationName, graphEndpointName } from "./graphAnalysisModel";
import { layoutGraph } from "./graphAnalysisLayout";
import { workbenchServicesKey } from "@/workbench/services";
import type { WorkbenchServices } from "@/workbench/contracts";
import type { GraphAnalysisResult } from "@/shared/api/generated/draftWorkspaceContract";

const token = { draft_id: "draft.test", edit_seq: 0, binding_digest: "a".repeat(64) };
const props = { projectId: "project.test", modelId: "model.test", contextId: "context.test", source: { draft_token: token }, active: true };
function data(): GraphAnalysisResult {
  const source_refs = [{ context_id: "context.test", context_name: "SD", occurrence_id: "occurrence.test", target_id: "object.test" }];
  return {
    source: { project_id: props.projectId, model_id: props.modelId, request_id: "request.test", context_id: props.contextId, scope: "MODEL", draft_token: token, revision_id: null, binding: "test", projection_version: 1 },
    nodes: [{ id: "object.test", kind: "OBJECT", label: "原料", owner_id: null, boundary: false, source_refs },
      { id: "process.test", kind: "PROCESS", label: "加工", owner_id: null, boundary: false, source_refs: [] },
      { id: "state.test", kind: "STATE", label: "原料 · 待加工", owner_id: "object.test", boundary: false, source_refs: [] }],
    edges: [{ id: "edge.test", source: "object.test", target: "process.test", relation_type: "consumption", label: "消耗", direction: "DIRECTED", fact_id: "fact.test", group_id: "fact.test", derived: false, endpoints: [], source_refs }],
    relation_types: [{ id: "consumption", label: "消耗", count: 1 }], statistics: { node_count: 3, fact_count: 1, derived_count: 0, edge_count: 1, excluded_count: 0 }, warnings: [],
  };
}
function setup(query = vi.fn().mockResolvedValue(data())) {
  return { query, wrapper: mount(GraphAnalysisPanel, { props, global: {
    provide: { [workbenchServicesKey as symbol]: { api: { graphAnalysis: query } } as unknown as WorkbenchServices },
    stubs: { GraphAnalysisCanvas: defineComponent({ name: "GraphAnalysisCanvas", props: { nodes: { type: Array as PropType<GraphAnalysisResult["nodes"]>, required: true }, edges: { type: Array as PropType<GraphAnalysisResult["edges"]>, required: true } }, emits: ["select", "contextMenu"], methods: { focus: vi.fn() }, template: '<div><button v-for="node in nodes" :key="node.id" @click="$emit(\'select\', node.id)">{{node.label}}</button><slot /><slot name="legend" :zoom-percent="100" :set-zoom="() => {}" :fit="() => {}" :reset-zoom="() => {}" :rearrange="() => {}" /></div>' }) },
  } }) };
}

it("首次查询、筛选计数、搜索恢复节点和来源定位", async () => {
  const { wrapper, query } = setup(); await flushPromises();
  expect(query).toHaveBeenCalledOnce(); expect(wrapper.text()).toContain("显示 3 / 3 个节点");
  await wrapper.get(".graph-tools-toggle").trigger("click");
  await wrapper.get('button[data-kind="OBJECT"]').trigger("click"); expect(wrapper.text()).toContain("显示 2 / 3 个节点");
  await wrapper.get('[aria-label="搜索图谱节点"]').setValue("原料");
  await wrapper.findAll(".graph-search-result")[0]!.trigger("click");
  expect(wrapper.get('button[data-kind="OBJECT"]').attributes("aria-pressed")).toBe("true");
  await wrapper.get(".graph-details .graph-source").trigger("click"); expect(wrapper.emitted("locate")?.[0]?.[0]).toMatchObject({ occurrence_id: "occurrence.test" });
  wrapper.unmount();
});

it("草稿变化标记过期并禁用定位，刷新后恢复", async () => {
  const { wrapper, query } = setup(); await flushPromises();
  await wrapper.get('[aria-label="搜索图谱节点"]').setValue("原料"); await wrapper.findAll(".graph-search-result")[0]!.trigger("click");
  await wrapper.setProps({ source: { draft_token: { ...token, edit_seq: 1 } } });
  expect(wrapper.find('[data-testid="graph-stale"]').exists()).toBe(true); expect(wrapper.get(".graph-details .graph-source").attributes("disabled")).toBeDefined();
  expect(query).toHaveBeenCalledOnce(); await wrapper.get('[data-testid="graph-stale"] button').trigger("click"); await flushPromises();
  expect(wrapper.find('[data-testid="graph-stale"]').exists()).toBe(false); wrapper.unmount();
});

it("模型切换丢弃迟到响应，失败提供重试", async () => {
  let resolveFirst!: (result: GraphAnalysisResult) => void;
  const query = vi.fn().mockImplementationOnce(() => new Promise<GraphAnalysisResult>(resolve => { resolveFirst = resolve; })).mockRejectedValueOnce(new Error("网络失败")).mockResolvedValue(data());
  const { wrapper } = setup(query); await flushPromises();
  await wrapper.setProps({ modelId: "model.next" }); await flushPromises(); resolveFirst(data()); await flushPromises();
  expect(wrapper.text()).toContain("网络失败"); expect(wrapper.text()).toContain("显示 0 / 0 个节点");
  await wrapper.get('.graph-error button').trigger("click"); await flushPromises(); expect(wrapper.text()).toContain("显示 3 / 3 个节点"); wrapper.unmount();
});

it("类型过滤无悬空边且邻域按跳数计算", () => {
  const value = data(); expect(filterGraph(value, { kinds: ["PROCESS"], relations: ["consumption"] }).edges).toHaveLength(0);
  expect([...graphNeighborhood("object.test", value.edges, 1)]).toEqual(["object.test", "process.test"]);
  expect(filterGraph(value, { kinds: ["OBJECT", "STATE", "PROCESS"], relations: [] }).nodes).toHaveLength(3);
});

it("头部侧栏按钮隐藏与恢复详情时保留选择，范围说明已删除", async () => {
  const { wrapper } = setup(); await flushPromises();
  expect(wrapper.find(".graph-readonly").exists()).toBe(false);
  const canvas = wrapper.findComponent({ name: "GraphAnalysisCanvas" });
  canvas.vm.$emit("select", "object.test"); await flushPromises();
  await wrapper.get('[aria-label="切换图谱右侧栏"]').trigger("click");
  expect(wrapper.find(".graph-details").exists()).toBe(false);
  expect(canvas.attributes("selected-id")).toBe("object.test");
  await wrapper.get('[aria-label="切换图谱右侧栏"]').trigger("click");
  expect(wrapper.get(".graph-details").text()).toContain("原料"); wrapper.unmount();
});

it("图例和视口工具合并，工具只保留图标提示，横向展开收起", async () => {
  const { wrapper } = setup(); await flushPromises();
  const toggle = wrapper.get(".graph-tools-toggle");
  expect(toggle.attributes("aria-expanded")).toBe("false");
  expect(wrapper.find(".graph-legend-controls").exists()).toBe(false);
  expect(wrapper.find('[aria-label="\u91cd\u65b0\u5e03\u5c40"]').exists()).toBe(false);
  await toggle.trigger("click");
  const controls = wrapper.get(".graph-legend-controls");
  expect(controls.text()).not.toContain("缩小"); expect(controls.text()).not.toContain("放大"); expect(controls.text()).not.toContain("重新布局");
  expect(toggle.text()).toBe("");
  expect(wrapper.findAll(".graph-view-tools svg")).toHaveLength(3);
  await toggle.trigger("click"); expect(wrapper.get(".graph-tools-toggle").attributes("aria-expanded")).toBe("false"); expect(wrapper.find(".graph-legend-controls").exists()).toBe(false);
  expect(wrapper.get(".graph-view-tools").isVisible()).toBe(true);
  expect(wrapper.get('[data-testid="p03-zoom-output"]').element).toHaveProperty("value", "100%");
  expect(wrapper.findAll(".graph-view-tools button")).toHaveLength(3);
  await wrapper.get(".graph-tools-toggle").trigger("click"); expect(wrapper.get(".graph-legend-controls").isVisible()).toBe(true);
  wrapper.unmount();
});

it("顶部复用全屏按钮，目标为图谱面板且收起图例后仍可用", async () => {
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  const { wrapper } = setup(); await flushPromises();
  const target = wrapper.get('[data-testid="graph-analysis-panel"]').element as HTMLElement;
  const request = vi.fn().mockResolvedValue(undefined); target.requestFullscreen = request;
  await wrapper.get(".graph-tools-toggle").trigger("click");
  await wrapper.get('[data-testid="p03-canvas-fullscreen"]').trigger("click"); await flushPromises();
  expect(request).toHaveBeenCalledOnce(); wrapper.unmount();
});

it("无左侧栏，画布统计和图例保留筛选入口，标签由右键菜单控制", async () => {
  const { wrapper } = setup(); await flushPromises();
  expect(wrapper.find(".graph-filters").exists()).toBe(false);
  expect(wrapper.get('[aria-label="图谱统计"]').text()).toContain("3节点");
  await wrapper.get(".graph-tools-toggle").trigger("click");
  const legend = wrapper.get('[aria-label="图谱图例与筛选"]');
  expect(legend.find('input[type="checkbox"]').exists()).toBe(false);
  expect(legend.find("summary").exists()).toBe(false);
  expect(legend.find(".graph-filter-actions").exists()).toBe(false);
  expect(legend.text()).not.toContain("展示选项");
  expect(legend.text()).not.toContain("隐藏孤立节点");
  expect(legend.text()).not.toContain("包含边界节点");
  await legend.get('button[data-kind="OBJECT"]').trigger("click");
  expect(wrapper.text()).toContain("显示 2 / 3 个节点");
  await legend.get('button[data-kind="OBJECT"]').trigger("click");
  await legend.get('button[data-relation="consumption"]').trigger("click");
  expect(legend.find('button[data-relation="consumption"]').exists()).toBe(true);
  await legend.get('button[data-relation="consumption"]').trigger("click");
  expect(wrapper.text()).toContain("1 / 1 条边");
  const canvas = wrapper.findComponent({ name: "GraphAnalysisCanvas" });
  canvas.vm.$emit("contextMenu", { clientX: 100, clientY: 100 }); await flushPromises();
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="图谱画布操作"] button')!;
  expect(toggle.textContent).toBe("隐藏标签"); toggle.click(); await flushPromises();
  expect(canvas.attributes("labels")).toBe("false");
  expect(document.querySelector('[aria-label="图谱画布操作"]')).toBeNull();
  wrapper.unmount();
});

it("筛选隐藏当前节点后清除选择，详情关联节点遵循当前关系筛选", async () => {
  const { wrapper } = setup(); await flushPromises();
  const canvas = wrapper.findComponent({ name: "GraphAnalysisCanvas" });
  canvas.vm.$emit("select", "object.test"); await flushPromises();
  expect(wrapper.get(".graph-details").text()).toContain("加工");
  await wrapper.get(".graph-tools-toggle").trigger("click");
  await wrapper.get('button[data-relation="consumption"]').trigger("click");
  expect(wrapper.get(".graph-details").text()).not.toContain("加工");
  await wrapper.get('button[data-kind="OBJECT"]').trigger("click");
  expect(wrapper.find(".graph-details").exists()).toBe(false);
  expect(canvas.attributes("selected-id")).toBe("");
  wrapper.unmount();
});

it("默认完整模型覆盖所有 OPD，切换当前图不使全模型结果过期", async () => {
  const { wrapper, query } = setup(); await flushPromises();
  expect(query.mock.calls[0]?.[4]).toMatchObject({ scope: "MODEL", include_hidden_states: true, include_boundary_nodes: false, include_state_ownership: true });
  expect(wrapper.get('[aria-label="图谱分析范围"]').element).toHaveProperty("value", "MODEL");
  await wrapper.setProps({ contextId: "context.sibling" }); await flushPromises();
  expect(wrapper.find('[data-testid="graph-stale"]').exists()).toBe(false); expect(query).toHaveBeenCalledOnce();
  await wrapper.get('[aria-label="图谱分析范围"]').setValue("CONTEXT"); await flushPromises();
  expect(query.mock.calls.at(-1)?.[4]).toMatchObject({ scope: "CONTEXT", include_hidden_states: false, include_boundary_nodes: false, include_state_ownership: true });
  await wrapper.setProps({ contextId: "context.child" }); await flushPromises();
  expect(wrapper.find('[data-testid="graph-stale"]').exists()).toBe(true);
  await wrapper.setProps({ modelId: "model.another" }); await flushPromises();
  expect(wrapper.get('[aria-label="图谱分析范围"]').element).toHaveProperty("value", "MODEL");
  expect(query.mock.calls.at(-1)?.[4]).toMatchObject({ scope: "MODEL" }); wrapper.unmount();
});

it("系统关系和角色使用中文，保留自定义标签及真实标识", async () => {
  const value = data();
  value.edges[0] = { ...value.edges[0]!, relation_type: "CAP-ISO-PROC-001", label: "Consumption", endpoints: [{ role: "CONSUMED_OBJECT", target_id: "object.test", ordinal: 0 }] };
  value.relation_types = [{ id: "CAP-ISO-PROC-001", label: "Consumption", count: 1 }];
  const translated = localizeGraph(value);
  expect(translated.edges[0]?.label).toBe("消耗"); expect(translated.edges[0]?.id).toBe("edge.test");
  expect(translated.edges[0]?.endpoints[0]?.role).toBe("CONSUMED_OBJECT"); expect(graphEndpointName("CONSUMED_OBJECT")).toBe("被消耗对象");
  value.edges[0]!.label = "custom dependency"; expect(localizeGraph(value).edges[0]?.label).toBe("custom dependency"); value.edges[0]!.label = "Consumption";
  for (const [prefix, count] of [["PROC", 16], ["STRUCT", 10]] as const)
    for (let i = 1; i <= count; i++) expect(graphRelationName(`CAP-ISO-${prefix}-${String(i).padStart(3, "0")}`)).toMatch(/[\u4e00-\u9fff]/);
  const { wrapper } = setup(vi.fn().mockResolvedValue(value)); await flushPromises();
  expect(wrapper.text()).not.toContain("Consumption");
  const canvasStub = wrapper.findComponent({ name: "GraphAnalysisCanvas" });
  canvasStub.vm.$emit("select", "edge.test"); await flushPromises();
  expect(wrapper.text()).toContain("被消耗对象 → 原料");
  await wrapper.get('[aria-label="搜索图谱节点"]').setValue("原料"); await wrapper.findAll(".graph-search-result")[0]!.trigger("click");
  expect(wrapper.text()).toContain("来源建模图"); expect(wrapper.get(".graph-identifiers summary").text()).toBe("查看技术标识"); wrapper.unmount();
});

it("布局确定性、保留固定节点，大图计算有界", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `node.${i}`);
  const input = { ids, edges: Array.from({ length: 1000 }, (_, i) => ({ source: ids[i % 300]!, target: ids[(i * 7 + 1) % 300]! })), previous: { "node.0": { x: 12, y: 18 } } };
  const start = performance.now(), positions = layoutGraph(input), elapsed = performance.now() - start;
  expect(positions["node.0"]).toEqual({ x: 12, y: 18 }); expect(positions).toEqual(layoutGraph(input)); expect(Object.keys(positions)).toHaveLength(300);
  expect(elapsed).toBeLessThan(2000); console.info(`Graph layout 300 nodes/1000 edges ${Math.round(elapsed)}ms`);
});

it("力导向：斥力分离、弹簧收缩、中心约束、锚点保持且邻居重平衡", () => {
  const ids = ["a", "b", "c"];
  const previous = { a: { x: -1200, y: 0 }, b: { x: 1200, y: 0 }, c: { x: 0, y: 1600 } };
  const linked = layoutGraph({ ids, previous, relax: true, edges: [{ source: "a", target: "b" }] });
  const unlinked = layoutGraph({ ids, previous, relax: true, edges: [] });
  expect(Math.abs(linked.a!.x - linked.b!.x)).toBeLessThan(Math.abs(unlinked.a!.x - unlinked.b!.x));
  expect(Math.abs(unlinked.c!.y)).toBeLessThan(1600);
  const overlapping = layoutGraph({ ids: ["a", "b"], previous: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }, relax: true, edges: [] });
  expect(Math.hypot(overlapping.a!.x - overlapping.b!.x, overlapping.a!.y - overlapping.b!.y)).toBeGreaterThan(40);
  const frames: unknown[] = [];
  const moved = layoutGraph({ ids, previous, relax: true, fixedIds: ["a"], edges: [{ source: "a", target: "b" }] }, frame => frames.push(frame));
  expect(moved.a).toEqual(previous.a); expect(moved.b).not.toEqual(previous.b); expect(frames.length).toBeGreaterThan(0);
  expect(previous.b).toEqual({ x: 1200, y: 0 });
});

it("相连节点形成紧凑局部群体", () => {
  const ids = ["hub", "a", "b", "c", "isolated"];
  const edges = ["a", "b", "c"].map(target => ({ source: "hub", target }));
  const positions = layoutGraph({ ids, edges, previous: {} });
  const distance = (a: string, b: string) => Math.hypot(positions[a]!.x - positions[b]!.x, positions[a]!.y - positions[b]!.y);
  const linked = ["a", "b", "c"].map(id => distance("hub", id));
  expect(linked.every(value => Number.isFinite(value) && value > 20)).toBe(true);
  expect(linked.reduce((sum, value) => sum + value, 0) / linked.length).toBeLessThan(distance("hub", "isolated"));
});
