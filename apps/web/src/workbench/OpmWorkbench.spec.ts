import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpmWorkbench from "./OpmWorkbench.vue";
import type { WorkbenchHandle, WorkbenchSnapshot } from "./contracts";
import { createRuntimeServices } from "./localRuntimeServices";
import { LocalRuntimeApiError } from "@/shared/api/localRuntimeApi";
import type { WorkbenchRuntimeApi } from "./contracts";
import WorkbenchSurface from "@/modules/workbench/WorkbenchSurface.vue";

const canvas = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, selectedId: { type: String, default: "" }, keyboardScope: Boolean }, emits: ["select"],
  methods: { async finishNameEdit() { return true; }, fitToView() {}, locateConstruct() { return true; } },
  template: `<div data-testid="embedded-canvas" :data-selected="selectedId" :data-scoped="keyboardScope"><button v-for="node in nodes" :key="node.id" @click="$emit('select', node.id)">{{ node.label }}</button></div>`,
});
const global = { stubs: { OpdCanvas: canvas } };
const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); });
function data(label = "对象 A"): WorkbenchSnapshot {
  return { diagrams: [
    { id: "root", label: "SD", kind: "SYSTEM_DIAGRAM", depth: 0, nodes: [{
      id: "element.a", occurrenceId: "occ.a", label, kind: "object", x: 80, y: 80,
      valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "功能", occurrenceRole: "owned",
    }], relations: [], textLines: [{ id: "sentence.a", text: label, factIds: [], occurrenceIds: ["occ.a"] }] },
    { id: "child", label: "子图", kind: "PROCESS_REFINEMENT", depth: 1, parentId: "root", nodes: [], relations: [] },
  ] };
}

describe("OpmWorkbench embedding", () => {
  it.each([false, true])("快照方法面板始终隔离服务（提供宿主服务=%s）", async withServices => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const methodSummary = vi.fn().mockRejectedValue(new Error("快照不得调用宿主服务"));
    const services = withServices ? createRuntimeServices({ methodSummary } as unknown as WorkbenchRuntimeApi) : undefined;
    const wrapper = mount(OpmWorkbench, { global, props: { data: data(), services,
      context: { project: { id: "host.project" }, model: { id: "host.model" }, revision: "host.revision" } } });
    mounted.push(wrapper); await flushPromises();
    await wrapper.get('[data-testid="p03-tab-method"]').trigger("click"); await flushPromises();
    const runtime = wrapper.getComponent(WorkbenchSurface).props("runtime");
    expect(runtime.methodSummary.error).toBe("");
    await wrapper.get('[data-testid="p03-method-refresh"]').trigger("click"); await flushPromises();
    await wrapper.get('[data-testid="p03-tab-method"]').trigger("click");
    await wrapper.get('[data-testid="p03-tab-method"]').trigger("click"); await flushPromises();
    await wrapper.get('[data-testid="p03-context-child"]').trigger("click"); await flushPromises();
    await wrapper.setProps({ data: data("替换快照") }); await flushPromises();
    expect(runtime.methodSummary.error).toBe("");
    expect(runtime.methodSummary.loading).toBe(false);
    expect(methodSummary).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("嵌入头部显示外部名称，默认隐藏 Profile 和版本控制且可以独立启用", async () => {
    const wrapper = mount(OpmWorkbench, { global, props: { showHeader: true, data: data(), context: {
      project: { id: "project.host", name: "外部项目" }, model: { id: "model.host", name: "外部模型" }, profileLabel: "profile.test 0.2.0",
    } } }); mounted.push(wrapper); await flushPromises();
    const header = wrapper.get(".workbench-header");
    expect(header.get('[data-testid="p03-project-name"]').text()).toContain("外部项目");
    expect(header.get("strong").text()).toBe("外部模型");
    expect(header.find("button.back-link").exists()).toBe(false);
    expect(header.find(".profile-tag").exists()).toBe(false);
    expect(header.find('[data-testid="hs-draft-identity"]').exists()).toBe(false);
    expect(header.find('[data-testid="p03-version-select"]').exists()).toBe(false);
    expect(header.find('[data-testid="hs-save-state"]').exists()).toBe(true);
    expect(header.find('[data-testid="p03-run-validation"]').exists()).toBe(true);
    await wrapper.setProps({ showProfile: true });
    expect(header.get(".profile-tag").text()).toBe("profile.test 0.2.0");
    expect(header.find('[data-testid="p03-version-select"]').exists()).toBe(false);
    await wrapper.setProps({ showVersionControls: true, showProfile: false });
    expect(header.find(".profile-tag").exists()).toBe(false);
    expect(header.find('[data-testid="hs-draft-identity"]').exists()).toBe(true);
    expect(header.find('[data-testid="p03-version-select"]').exists()).toBe(true);
  });

  it("宿主名称动态更新且不被内部回读覆盖；未传名称继续使用内部名称", async () => {
    const wrapper = mount(OpmWorkbench, { global, props: { showHeader: true, data: data(), context: {
      project: { id: "project.host", name: "外部项目" }, model: { id: "model.host", name: "外部模型" },
    } } }); mounted.push(wrapper); await flushPromises();
    const runtime = wrapper.getComponent(WorkbenchSurface).props("runtime");
    runtime.projectName = "后端项目"; runtime.modelName = "后端模型";
    await flushPromises();
    expect(wrapper.get(".workbench-header__context").text()).toContain("外部项目");
    expect(wrapper.get(".workbench-header__context strong").text()).toBe("外部模型");
    await wrapper.setProps({ context: { project: { id: "project.host", name: "新项目名" }, model: { id: "model.host", name: "新模型名" } } });
    expect(wrapper.get(".workbench-header__context strong").text()).toBe("新模型名");
    expect(wrapper.get('[data-testid="p03-context-root"]').text()).toContain("新模型名");
    await wrapper.setProps({ context: { project: { id: "project.host" }, model: { id: "model.host" } } });
    runtime.projectName = "后端项目"; runtime.modelName = "后端模型";
    await flushPromises();
    expect(wrapper.get(".workbench-header__context strong").text()).toBe("后端模型");
  });

  it("无需 Router、Pinia 或会话即可显示空白根图，不调用网络", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const wrapper = mount(OpmWorkbench, { global }); mounted.push(wrapper); await flushPromises();
    expect(wrapper.find(".workbench-header").exists()).toBe(false);
    expect(wrapper.text()).toContain("未命名模型");
    expect(wrapper.find('[data-testid="left-tab-assistant"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="editor-mode-analysis"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(wrapper.emitted("ready")).toHaveLength(1);
  });

  it("注入的服务启动加载后，旧响应不能覆盖新快照", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    let finishSession: (value: unknown) => void = () => {};
    const workspaceSession = vi.fn(() => new Promise(resolve => { finishSession = resolve; }));
    const draftQuery = vi.fn().mockRejectedValue(new LocalRuntimeApiError("DRAFT_MODE_REQUIRED", "legacy"));
    const api = { workspaceSession, draftQuery } as unknown as WorkbenchRuntimeApi;
    const wrapper = mount(OpmWorkbench, { global, props: {
      context: { project: { id: "old-project" }, model: { id: "old-model" } },
      services: createRuntimeServices(api),
    } }); mounted.push(wrapper); await flushPromises();
    expect(workspaceSession).toHaveBeenCalledWith("old-project", "old-model", undefined, undefined);
    await wrapper.setProps({ data: data("宿主的新数据"), context: { model: { name: "新模型" } } });
    finishSession({ meta: { read_revision: "old-revision" }, data: { current_context_id: "root" } });
    await flushPromises();
    expect(wrapper.get('[data-testid="embedded-canvas"]').text()).toBe("宿主的新数据");
    expect(wrapper.find('[data-testid="editor-mode-analysis"]').exists()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("传入的跨图问题可从快照定位，不读取后端", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const snapshot = data();
    snapshot.diagrams[1]!.nodes = [{ ...snapshot.diagrams[0]!.nodes[0]!, id: "child.element", occurrenceId: "child.occ", label: "子图对象" }];
    snapshot.findings = [{ finding_id: "finding.child", rule_id: "TEST_RULE", severity: "WARNING", category: "STRUCTURAL", context_id: "child", entity_id: "child.element" }];
    const wrapper = mount(OpmWorkbench, { global, props: { data: snapshot } }); mounted.push(wrapper); await flushPromises();
    await wrapper.get('[data-testid="p03-tab-findings"]').trigger("click");
    await wrapper.get('[data-testid="p03-finding-finding.child"]').trigger("click");
    await wrapper.get('[data-testid="p03-finding-locate"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="embedded-canvas"]').text()).toBe("子图对象");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("宿主可以定位指定视图中的元素，缺失时返回 false", async () => {
    const snapshot = data();
    snapshot.diagrams[1]!.nodes = [{ ...snapshot.diagrams[0]!.nodes[0]!, id: "child.element", occurrenceId: "child.occ", label: "子图对象" }];
    const wrapper = mount(OpmWorkbench, { global, props: { data: snapshot, context: { project: { id: "p" }, model: { id: "m" }, revision: "r1" } } }); mounted.push(wrapper); await flushPromises();
    const handle = wrapper.vm as unknown as WorkbenchHandle;
    expect(await handle.locateConstruct("child.element", "child")).toBe(true);
    await flushPromises();
    expect(wrapper.get('[data-testid="embedded-canvas"]').attributes("data-selected")).toBe("child.element");
    expect(await handle.locateConstruct("missing", "child")).toBe(false);
  });

  it("上下文、子图与快照替换受控，且不修改输入", async () => {
    const input = data(), original = JSON.stringify(input);
    const wrapper = mount(OpmWorkbench, { global, props: { context: {
      project: { id: "p1", name: "宿主项目" }, model: { id: "m1", name: "宿主模型" },
    }, data: input, showHeader: true, projectNavigation: true } }); mounted.push(wrapper); await flushPromises();
    expect(wrapper.text()).toContain("宿主项目"); expect(wrapper.text()).toContain("宿主模型");
    await wrapper.get(".back-link").trigger("click"); expect(wrapper.emitted("navigateProject")).toEqual([["p1"]]);
    await wrapper.get('[data-testid="embedded-canvas"] button').trigger("click");
    expect(wrapper.emitted("selectionChange")?.at(-1)).toEqual([["element.a"]]);
    await wrapper.get('[data-testid="p03-context-child"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="embedded-canvas"]').text()).toBe("");
    expect(wrapper.emitted("contextChange")?.at(-1)).toEqual(["child"]);
    await wrapper.setProps({ context: { model: { id: "m2", name: "新模型" }, activeContextId: "root" }, data: data("对象 B") });
    await flushPromises(); expect(wrapper.get('[data-testid="embedded-canvas"]').text()).toBe("对象 B");
    expect(wrapper.get('[data-testid="embedded-canvas"]').attributes("data-selected")).toBe("");
    expect(JSON.stringify(input)).toBe(original);
  });

  it("同页实例选择、OPD、DOM 标识和卸载互不干扰", async () => {
    const first = mount(OpmWorkbench, { global, attachTo: document.body, props: { data: data("第一实例") } });
    const second = mount(OpmWorkbench, { global, attachTo: document.body, props: { data: data("第二实例") } });
    mounted.push(second); await flushPromises();
    await first.get('[data-testid="embedded-canvas"] button').trigger("click");
    expect(second.get('[data-testid="embedded-canvas"]').attributes("data-selected")).toBe("");
    expect(first.get('[data-testid="left-tab-navigation"]').attributes("id")).not.toBe(second.get('[data-testid="left-tab-navigation"]').attributes("id"));
    await first.get('[data-testid="p03-context-child"]').trigger("click"); await flushPromises();
    expect(second.get('[data-testid="embedded-canvas"]').text()).toBe("第二实例");
    first.unmount();
    await second.get('[data-testid="embedded-canvas"] button').trigger("click");
    expect(second.get('[data-testid="embedded-canvas"]').attributes("data-selected")).toBe("element.a");
  });
});
