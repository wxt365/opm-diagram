import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
import type { DraftFinding, DraftFindingsData, DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { ProjectionConstructWire } from "@/shared/api/localRuntimeApi";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const initialToken: DraftToken = { draft_id: "draft.test", edit_seq: 1, binding_digest: "a".repeat(64) };
const finding: DraftFinding = { finding_id: "finding.bad", rule_id: "rule.model.STATE_OWNER_MISMATCH", severity: "BLOCKING",
  category: "STATE_OWNER_MISMATCH", entity_id: "object.child", context_id: null, message: "状态改变关系的输入与输出必须属于同一个对象。" };
function result(items: DraftFinding[] = [finding]): DraftFindingsData {
  return { items, validation_scope: "MODEL", validation_summary: { blocking: items.length, warning: 0, suggestion: 0, coverage_state: "INCOMPLETE" } };
}
const node: ProjectionConstructWire = { occurrence_id: "occ.child", target_id: "object.child", target_kind: "ELEMENT", construct_role: "OBJECT_NODE",
  label: "咖啡豆", capability_id: "CAP-OBJECT-001", layout: { x: 100, y: 100, width: 160, height: 72, z_order: 0 } };

async function setup() {
  let token = { ...initialToken };
  vi.spyOn(DraftWorkbenchSession.prototype, "recover").mockResolvedValue(undefined);
  const open = vi.spyOn(DraftWorkbenchSession.prototype, "open").mockImplementation(async context => ({ draft_token: token, context_id: context ?? "context.root" } as never));
  vi.spyOn(DraftWorkbenchSession.prototype, "read").mockImplementation(async opened => ({
    opened, project: { name: "项目" }, model: { name: "模型", head_revision: "revision.1", profile_id: "profile.test", profile_version: "0.2" }, history: [],
    navigation: { process_tree: [{ context_id: "context.root", label: "根图", context_kind: "SYSTEM_DIAGRAM", has_children: true },
      { context_id: "context.child", label: "烘焙子图", context_kind: "MODEL_VIEW", parent_context_id: "context.root", has_children: false }], object_forest: [], views: [] },
    constructs: opened.context_id === "context.child" ? [node] : [], suppressed: [], text: { sentences: [], traces: [] }, findings: result(), catalog: [],
  } as never));
  const query = vi.spyOn(DraftWorkbenchSession.prototype, "findings").mockResolvedValue(result());
  const projection = vi.spyOn(DraftWorkbenchSession.prototype, "projection").mockImplementation(async (_token, context) => context === "context.child" ? [node] : []);
  const store = useWorkbenchRuntimeStore();
  await store.load("project.test", "model.test"); await nextTick();
  return { store, query, projection, open, setToken: (seq: number) => { token = { ...token, edit_seq: seq }; } };
}

describe("模型问题工作流", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("实际查询精确token，完成后显示中文问题、所属图且不提交模型编辑", async () => {
    const { store, query } = await setup();
    expect(store.validationLabel).toBe("尚未运行校验");
    await store.runValidation();
    expect(query).toHaveBeenCalledWith(initialToken, "context.root");
    expect(store.workbench.validationState).toBe("current"); expect(store.workbench.validationProgress).toBe(100);
    expect(store.workbench.bottomTab).toBe("findings");
    expect(store.findingRows[0]).toMatchObject({ severity: "阻断", entityLabel: "咖啡豆", contextLabel: "烘焙子图" });
    expect(store.draftToken).toEqual(initialToken);
  });

  it("校验失败保留问题并可重试，成功后清除错误", async () => {
    const { store, query } = await setup();
    query.mockRejectedValueOnce(new Error("连接失败"));
    await store.runValidation(); expect(store.workbench.validationState).toBe("failed");
    expect(store.validationError).toContain("本地请求失败"); expect(store.canRunValidation).toBe(true);
    query.mockResolvedValueOnce(result([])); await store.runValidation();
    expect(store.validationError).toBe(""); expect(store.findings).toEqual([]);
    expect(store.workbench.blockingFindings).toBe(0);
  });

  it("同token跨图定位保留结果，导航完成后恢复目标，新编辑使结果过期", async () => {
    const { store, setToken } = await setup();
    await store.runValidation(); store.selectFinding(finding.finding_id);
    expect(await store.locateFinding()).toBe("context.child");
    await store.load("project.test", "model.test", "context.child"); await nextTick();
    expect(store.highlightedFindingTargetId).toBe("object.child");
    expect(store.highlightedFindingNodeIds).toEqual(["object.child"]);
    expect(store.selectedFindingId).toBe(finding.finding_id); expect(store.workbench.validationState).toBe("current");
    setToken(2); await store.load("project.test", "model.test", "context.child"); await nextTick();
    expect(store.highlightedFindingTargetId).toBe(""); expect(store.workbench.validationState).toBe("stale");
    store.selectFinding(finding.finding_id); expect(await store.locateFinding()).toBeUndefined();
    expect(store.workbench.commandFeedback).toContain("重新运行校验");
    await store.runValidation(); expect(store.workbench.validationState).toBe("current");
  });

  it("运行期间禁重复点击，导航后的迟到结果不覆盖新图", async () => {
    const { store, query } = await setup();
    let resolve!: (data: DraftFindingsData) => void;
    query.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const request = store.runValidation(); expect(store.canRunValidation).toBe(false);
    await store.runValidation(); expect(query).toHaveBeenCalledTimes(1);
    await store.load("project.test", "model.test", "context.child"); await nextTick();
    resolve(result([])); await request;
    expect(store.findings).toEqual([finding]); expect(store.workbench.validationState).toBe("unvalidated");
  });

  it("不可见目标有明确反馈，定位失败可以重试，另选清除高亮", async () => {
    const { store, projection } = await setup();
    store.findings = [{ ...finding, entity_id: "object.absent" }]; store.selectFinding(finding.finding_id);
    projection.mockRejectedValueOnce(new Error("读取失败"));
    expect(await store.locateFinding()).toBeUndefined(); expect(store.findingLocationBusy).toBe(false);
    expect(store.workbench.commandFeedback).toContain("定位失败");
    expect(await store.locateFinding()).toBeUndefined(); expect(store.workbench.commandFeedback).toContain("没有可见");
    store.highlightedFindingTargetId = "object.child"; store.selectNodes([]);
    expect(store.highlightedFindingTargetId).toBe("");
  });
});
