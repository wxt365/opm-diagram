import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";
import { localRuntimeApi } from "@/shared/api/localRuntimeApi";
import type { MethodRole, MethodSummaryResult } from "@/shared/api/generated/draftWorkspaceContract";
import WorkbenchMethodPanel from "./WorkbenchMethodPanel.vue";

const data: MethodSummaryResult["data"] = { coverage: "RELATION_EVIDENCE_ONLY", architecture_links: [], contexts: [{ context_id: "context.root", name: "根图", architecture_level: "MISSION" }, { context_id: "context.child", name: "子图", architecture_level: null }], refinements: [{ refinement_id: "refinement.1", parent_context_id: "context.root", child_context_id: "context.child", refinee_element_id: "process.root", refinee_name: "烘焙", refinement_kind: "PROCESS" }], processes: [
  { process_id: "process.root", name: "烘焙", context_ids: ["context.root"], roles: ["SUBJECT", "OBJECT", "INSTRUMENT", "RESOURCE", "ENVIRONMENT", "INFORMATION"].map(role => ({
    role, status: role === "RESOURCE" ? "EVIDENCE" : role === "ENVIRONMENT" || role === "INFORMATION" ? "MANUAL" : "NO_EVIDENCE", guidance: "请确认实际用途",
    evidence: role === "RESOURCE" ? [{ fact_id: "fact.1", capability_id: "CAP-ISO-PROC-001", description: "消耗关系：咖啡豆", context_ids: ["context.child"], target_ids: ["object.1", "process.root"] }] : [],
  } as MethodRole)) },
  { process_id: "process.child", name: "烘焙", context_ids: ["context.child"], roles: [] },
] };
function setup() {
  const store = useWorkbenchRuntimeStore(); store.projectId = "project.test"; store.modelId = "model.test";
  store.workbench.activeContextId = "context.root"; store.workbench.revision = "revision.1"; store.workbench.resourceState = "ready";
  store.contexts = [{ id: "context.root", kind: "SYSTEM_DIAGRAM", label: "根图", depth: 0 }, { id: "context.child", kind: "PROCESS_REFINEMENT", label: "子图", depth: 1 }];
  store.methodSummary.data = structuredClone(data);
  return { store, wrapper: mount(WorkbenchMethodPanel, { props: { store } }) };
}
describe("架构方法面板", () => {
  beforeEach(() => setActivePinia(createPinia())); afterEach(() => vi.restoreAllMocks());
  it("六类提示、同名过程隔离、范围切换和历史只读定位", async () => {
    const { store, wrapper } = setup(); await flushPromises(); store.methodSummary.data = structuredClone(data); await flushPromises();
    expect(wrapper.findAll("article")).toHaveLength(6); expect(wrapper.text()).toContain("当前历史版本");
    expect(wrapper.text()).toContain("有关系 · 待确认"); expect(wrapper.text()).toContain("需人工确认"); expect(wrapper.text()).toContain("OPD：子图");
    expect(wrapper.get('[data-testid="p03-method-process"]').findAll("option")).toHaveLength(1);
    await wrapper.get('[data-testid="p03-method-locate"]').trigger("click");
    expect(wrapper.emitted("locate")![0]![0]).toEqual(data.processes[0]!.roles[3]!.evidence[0]);
    await wrapper.get('[data-testid="p03-method-scope"]').setValue("model"); expect(wrapper.get('[data-testid="p03-method-process"]').findAll("option")).toHaveLength(2);
    wrapper.unmount();
  });
  it("分类控件在历史禁改，细化导航携带父图及元素，草稿失败前不提前显示成功", async () => {
    vi.spyOn(localRuntimeApi, "methodSummary").mockResolvedValue(data);
    const { store, wrapper } = setup(); await flushPromises(); store.methodSummary.data = structuredClone(data); await flushPromises();
    expect(wrapper.get('[data-testid="p03-method-level"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="p03-method-parent-refinement.1"]').trigger("click");
    expect(wrapper.emitted("navigate")![0]).toEqual(["context.root", "process.root"]);
    store.draftToken = { draft_id: "draft.test", edit_seq: 0, binding_digest: "a".repeat(64) }; store.workbench.accessMode = "editable";
    await flushPromises(); store.methodSummary.data = structuredClone(data); await flushPromises();
    await wrapper.get('[data-testid="p03-method-level"]').setValue("FUNCTION");
    expect(wrapper.emitted("classify")![0]).toEqual(["FUNCTION"]);
    expect((wrapper.get('[data-testid="p03-method-level"]').element as HTMLSelectElement).value).toBe("MISSION");
    const identity = store.editingIdentity;
    expect(store.locateMethodContext("context.root", "process.root")).toBe("context.root");
    expect(store.highlightedMethodNodeIds).toEqual([]); expect(store.editingIdentity).toBe(identity);
    expect(store.locateMethodContext("context.root", "process.invalid")).toBeUndefined();
    wrapper.unmount();
  });
  it("失败重试和空态，方法查询不改语言校验状态或阻断数", async () => {
    const query = vi.spyOn(localRuntimeApi, "methodSummary").mockRejectedValueOnce(new Error("连接中断")).mockResolvedValue({ coverage: "RELATION_EVIDENCE_ONLY", architecture_links: [], contexts: [{ context_id: "context.root", name: "根图", architecture_level: "MISSION" }, { context_id: "context.child", name: "子图", architecture_level: null }], refinements: [{ refinement_id: "refinement.1", parent_context_id: "context.root", child_context_id: "context.child", refinee_element_id: "process.root", refinee_name: "烘焙", refinement_kind: "PROCESS" }], processes: [] });
    const { store, wrapper } = setup(); await flushPromises(); store.workbench.validationState = "current"; store.workbench.blockingFindings = 2;
    await wrapper.get('[data-testid="p03-method-refresh"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("连接中断");
    await wrapper.get('[data-testid="p03-method-refresh"]').trigger("click"); await flushPromises();
    expect(query).toHaveBeenCalledTimes(2); expect(wrapper.get('[data-testid="p03-method-empty"]').text()).toContain("尚无过程");
    expect(store.workbench.validationState).toBe("current"); expect(store.workbench.blockingFindings).toBe(2); wrapper.unmount();
  });
  it("输入变化清除旧定位，跨图定位只在同一输入恢复", async () => {
    vi.spyOn(localRuntimeApi, "methodSummary").mockResolvedValue(data);
    const { store, wrapper } = setup(); await flushPromises(); store.methodSummary.data = structuredClone(data);
    const evidence = store.methodSummary.data.processes[0]!.roles[3]!.evidence[0]!;
    expect(store.locateMethodEvidence(evidence)).toBe("context.child");
    store.workbench.activeContextId = "context.child";
    await flushPromises(); expect(store.highlightedMethodFactId).toBe("fact.1");
    store.draftToken = { draft_id: "draft.test", edit_seq: 1, binding_digest: "a".repeat(64) };
    await flushPromises(); expect(store.highlightedMethodFactId).toBe("");
    expect(store.methodSummary.data).toBeNull(); wrapper.unmount();
  });
});
