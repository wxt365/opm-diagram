import { describe, expect, it, vi } from "vitest";
import { createMethodSummary } from "./methodSummary";
import type { MethodSummaryResult } from "@/shared/api/generated/draftWorkspaceContract";

const empty: MethodSummaryResult["data"] = { coverage: "RELATION_EVIDENCE_ONLY", architecture_links: [], processes: [], contexts: [], refinements: [] };
describe("架构方法加载", () => {
  it("失败可重试，刷新前清除过期证据", async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error("断开连接")).mockResolvedValue(empty);
    const loader = createMethodSummary(query);
    await loader.refresh(); expect(loader.state.error).toBe("断开连接"); expect(loader.state.data).toBeNull();
    await loader.refresh(); expect(loader.state.data).toEqual(empty); expect(loader.state.error).toBe("");
    loader.reset(); expect(loader.state.data).toBeNull();
  });
  it("切模型和连续查询的迟到结果不会覆盖新输入", async () => {
    let resolve!: (data: MethodSummaryResult["data"]) => void;
    const query = vi.fn().mockImplementationOnce(() => new Promise<MethodSummaryResult["data"]>(done => { resolve = done; })).mockResolvedValue(empty);
    const loader = createMethodSummary(query); const previous = loader.refresh();
    loader.reset(); await loader.refresh(); resolve({ ...empty, processes: [{ process_id: "process.old", name: "旧模型过程", context_ids: [], roles: [] }] }); await previous;
    expect(loader.state.loading).toBe(false); expect(loader.state.data).toEqual(empty); expect(loader.state.error).toBe("");
  });
});
