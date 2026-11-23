import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createModelLayout } from "./modelLayout";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
function setup() {
  const token = ref({ draft_id: "draft.test", edit_seq: 0, binding_digest: "sha256:test" } as DraftToken);
  const busy = ref(false), identity = ref("project/model");
  const projection = vi.fn(async (_token, context) => ["a", "b"].map(id => ({ target_kind: "ELEMENT", target_id: `${context}.${id}`, occurrence_id: `occ.${context}.${id}`,
    construct_role: "OBJECT_NODE", label: id, layout: { x: 80, y: 80, width: 170, height: 90 } })));
  const edit = vi.fn(async (current: DraftToken) => ({ result_token: { ...current, edit_seq: current.edit_seq + 1 } }));
  const session = { projection, edit } as unknown as DraftWorkbenchSession;
  const feedback = vi.fn();
  const refresh = vi.fn(async (result: DraftToken) => { token.value = result; });
  const controller = createModelLayout({ token, busy, identity: () => identity.value, session: () => session,
    contexts: ref(["root", "child"].map(id => ({ id, label: id, kind: "SYSTEM_DIAGRAM", depth: 0 }))),
    context: () => "root", allowed: () => !busy.value, feedback, refresh });
  return { ...controller, token, projection, edit, feedback, identity, refresh, busy };
}
describe("全模型整理", () => {
  it("部分撤销失败后仅重试未撤销的图，不重复恢复成功部分", async () => {
    const s = setup(); await s.preview(); await s.apply();
    s.edit.mockImplementationOnce(async current => ({ result_token: { ...current, edit_seq: current.edit_seq + 1 } })).mockRejectedValueOnce(new Error("连接中断"));
    await s.undo(); await nextTick(); expect(s.state.undoAvailable).toBe(true);
    await s.undo();
    expect(s.edit.mock.calls.slice(2).map(call => (call as unknown[])[1])).toEqual(["root", "child", "child"]);
    expect(s.state.undoAvailable).toBe(false);
  });
  it("命令成功但刷新失败时仍保留新 token 并释放忙碌状态", async () => {
    const s = setup(); await s.preview(); s.refresh.mockRejectedValueOnce(new Error("读取中断"));
    await s.apply(); await nextTick();
    expect(s.token.value.edit_seq).toBe(2); expect(s.busy.value).toBe(false);
    expect(s.feedback).toHaveBeenCalledWith(expect.stringContaining("刷新失败"));
    expect(s.state.undoAvailable).toBe(true);
  });
  it("预览读取全部子图而不写入，取消保持原 token", async () => {
    const s = setup(); await s.preview();
    expect(s.state.plans).toHaveLength(2); expect(s.edit).not.toHaveBeenCalled();
    expect(s.state.plans.every(plan => plan.nodes[0]!.y !== plan.nodes[1]!.y || plan.nodes[0]!.x !== plan.nodes[1]!.x)).toBe(true);
    s.cancel(); expect(s.state.preview).toBe(false); expect(s.token.value.edit_seq).toBe(0);
  });
  it("按每图的 context 授权并串行推进 token，支持整批撤销", async () => {
    const s = setup(); await s.preview(); await s.apply(); await nextTick();
    expect(s.edit.mock.calls.map(call => (call as unknown[])[1])).toEqual(["root", "child"]);
    expect(s.edit.mock.calls.map(call => call[0].edit_seq)).toEqual([0, 1]);
    expect(s.state.undoAvailable).toBe(true); expect(s.token.value.edit_seq).toBe(2);
    await s.undo(); expect(s.token.value.edit_seq).toBe(4); expect(s.state.undoAvailable).toBe(false);
  });
  it("部分失败明确反馈并仅撤销已成功的子图", async () => {
    const s = setup(); await s.preview();
    s.edit.mockImplementationOnce(async current => ({ result_token: { ...current, edit_seq: 1 } })).mockRejectedValueOnce(new Error("连接中断"));
    await s.apply(); await nextTick(); expect(s.feedback).toHaveBeenCalledWith(expect.stringContaining("其余未应用"));
    expect(s.state.undoAvailable).toBe(true); await s.undo();
    expect((s.edit.mock.calls[2] as unknown[])[1]).toBe("root"); expect(s.token.value.edit_seq).toBe(2);
  });
  it("草稿变化使预览失效，不用旧 token 写入", async () => {
    const s = setup(); await s.preview(); s.token.value = { ...s.token.value, edit_seq: 8 }; await nextTick();
    await s.apply(); expect(s.edit).not.toHaveBeenCalled(); expect(s.state.preview).toBe(false);
  });
});
