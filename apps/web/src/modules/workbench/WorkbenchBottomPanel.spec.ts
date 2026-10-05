import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";
import { localRuntimeApi } from "@/shared/api/localRuntimeApi";
import WorkbenchBottomPanel from "./WorkbenchBottomPanel.vue";

function setup() {
  const store = useWorkbenchRuntimeStore();
  store.modelName = "仓储/演示";
  store.contexts = [{ id: "context.1", label: "订单履约", kind: "SYSTEM_DIAGRAM", depth: 0 }];
  store.workbench.activeContextId = "context.1";
  store.workbench.resourceState = "ready";
  store.workbench.accessMode = "readonly";
  store.textLines = [{ id: "sentence.1", text: "打包 consumes 包装材料.", factIds: [], occurrenceIds: [] },
    { id: "sentence.2", text: "复核 changes 包裹 from 待检 to 合格.", factIds: [], occurrenceIds: [] }];
  return { store, wrapper: mount(WorkbenchBottomPanel, { props: { store } }) };
}

describe("OPL 面板导出", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("只读仍可导出中文文本，逐行顺序与面板一致并安全命名", async () => {
    const { wrapper } = setup();
    const create = vi.fn<(blob: Blob) => string>(() => "blob:opl"); const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { filename = this.download; });
    await wrapper.get('[data-testid="p03-opl-export"]').trigger("click");
    expect(filename).toBe("仓储_演示 - 订单履约.opl.txt");
    const blob = create.mock.calls[0]![0] as unknown as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const content = await new Promise<string>(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsText(blob);
    });
    expect(content).toBe("打包 consumes 包装材料.\n复核 changes 包裹 from 待检 to 合格.\n");
    expect(document.querySelector('a[download]')).toBeNull();
    wrapper.unmount();
  });

  it("空态与加载禁用导出，结构关系空态不再限定过程关系", async () => {
    const { store, wrapper } = setup();
    store.textLines = []; await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="p03-opl-export"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("当前 OPD 尚无可生成的 OPL 关系语句");
    store.textLines = [{ id: "s", text: "Object exhibits Attribute.", factIds: [], occurrenceIds: [] }];
    store.workbench.resourceState = "loading"; await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="p03-opl-export"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("下载失败可见且可以重试", async () => {
    const { wrapper } = setup();
    const create = vi.fn().mockImplementationOnce(() => { throw new Error("download unavailable"); }).mockReturnValue("blob:opl");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await wrapper.get('[data-testid="p03-opl-export"]').trigger("click");
    expect(wrapper.get('[role="alert"]').text()).toBe("OPL 导出失败，请重试。");
    await wrapper.get('[data-testid="p03-opl-export"]').trigger("click");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("问题面板", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("不同校验状态和覆盖范围不把零问题解释成标准符合性", async () => {
    const { store, wrapper } = setup();
    store.draftToken = { draft_id: "draft.1", edit_seq: 1, binding_digest: "a".repeat(64) };
    store.workbench.bottomTab = "findings"; await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="p03-findings-empty"]').text()).toContain("尚未运行");
    expect(wrapper.get('[data-testid="p03-validation-coverage"]').text()).toContain("规则覆盖不完整");
    for (const [state, text] of [["running", "正在检查"], ["current", "已覆盖规则未发现问题"], ["stale", "重新运行"], ["failed", "校验未完成"]] as const) {
      store.workbench.validationState = state; await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="p03-findings-empty"]').text()).toContain(text);
      expect(wrapper.find('[data-testid="p03-finding-locate"]').exists()).toBe(false);
    }
    store.validationError = "连接失败"; await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain("重试");
    store.draftToken = null; await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="p03-validation-coverage"]').text()).toContain("历史版本");
    wrapper.unmount();
  });

  it("问题显示中文详情与修复建议，过期或失败禁止按旧结果定位", async () => {
    const { store, wrapper } = setup();
    store.workbench.bottomTab = "findings";
    store.findings = [{ finding_id: "finding.1", rule_id: "rule.core.INVALID_ENDPOINT", severity: "BLOCKING", category: "INVALID_ENDPOINT",
      context_id: null, entity_id: "fact.1", message: "invalid endpoint" }];
    await wrapper.vm.$nextTick();
    const row = wrapper.get('[data-testid="p03-finding-finding.1"]');
    expect(row.text()).toContain("阻断"); expect(row.text()).toContain("端点");
    expect(wrapper.find('[data-testid="p03-finding-locate"]').exists()).toBe(false);
    await row.trigger("click"); await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="p03-finding-detail"]').text()).toContain("修复建议");
    await wrapper.get('[data-testid="p03-finding-locate"]').trigger("click");
    expect(wrapper.emitted("locateFinding")).toHaveLength(1);
    for (const state of ["stale", "failed", "running"] as const) {
      store.workbench.validationState = state; await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-testid="p03-finding-locate"]').attributes("disabled")).toBeDefined();
    }
    wrapper.unmount();
  });
});

describe("操作历史面板", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("中文记录和时间、旧详情边界、保存版本操作及失败重试", async () => {
    const query = vi.spyOn(localRuntimeApi, "operationHistory").mockResolvedValue({ items: [], next_before: null });
    const { store, wrapper } = setup();
    store.workbench.bottomTab = "history";
    await wrapper.vm.$nextTick(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(wrapper.text()).toContain("尚无操作记录");
    store.operationHistory.items = [{ record_id: "history.save", title: "手动保存模型", operation: "SAVE", occurred_at: "2026-10-03T08:00:00.000Z", status: "SAVED", context_id: null, context_name: null, revision_id: "revision.1", detail_available: true },
      { record_id: "history.edit", title: "移动或调整元素：咖啡豆", operation: "UPDATE_LAYOUT", occurred_at: "2026-10-03T07:59:00.000Z", status: "DURABLE", context_id: "context.1", context_name: "订单履约", revision_id: null, detail_available: true },
      { record_id: "history.old", title: "编辑模型（旧记录未保留操作详情）", operation: "EDIT", occurred_at: "2026-10-03T07:58:00.000Z", status: "DURABLE", context_id: null, context_name: null, revision_id: null, detail_available: false }];
    await wrapper.vm.$nextTick(); expect(wrapper.text()).toContain("已保存"); expect(wrapper.text()).toContain("OPD：订单履约");
    expect(wrapper.get('time').attributes("datetime")).toBe("2026-10-03T08:00:00.000Z");
    await wrapper.get('[data-testid="p03-history-open-version"]').trigger("click");
    expect(wrapper.emitted("openHistoryRevision")).toEqual([["revision.1"]]);
    query.mockRejectedValueOnce(new Error("服务暂不可用"));
    await store.refreshOperationHistory(); await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain("服务暂不可用");
    await wrapper.get('[data-testid="p03-history-retry"]').trigger("click"); await new Promise(resolve => setTimeout(resolve, 0));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false); wrapper.unmount();
  });
});
