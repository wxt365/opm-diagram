import { describe, expect, it, vi } from "vitest";
import { createOperationHistory } from "./operationHistory";
import type { OperationHistoryResult } from "@/shared/api/generated/draftWorkspaceContract";
type Data = OperationHistoryResult["data"];
const row = (id: string) => ({ record_id: id, operation: "UPDATE_LAYOUT", title: "移动对象", context_id: null, context_name: null,
  occurred_at: "2026-10-03T08:00:00.000Z", status: "DURABLE", revision_id: null, detail_available: true });
const deferred = () => { let resolve!: (data: Data) => void; const promise = new Promise<Data>(r => { resolve = r; }); return { resolve, promise }; };

describe("模型操作历史加载", () => {
  it("切换模型后迟到的响应与完成状态不能覆盖新列表", async () => {
    const old = deferred(), current = deferred();
    const loader = createOperationHistory(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
    const first = loader.refresh(); loader.reset(); const second = loader.refresh();
    old.resolve({ items: [row("old")], next_before: null }); await first;
    expect(loader.state.items).toEqual([]); expect(loader.state.loading).toBe(true);
    current.resolve({ items: [row("new")], next_before: null }); await second;
    expect(loader.state.items.map(item => item.record_id)).toEqual(["new"]); expect(loader.state.loading).toBe(false);
  });
  it("分页失败保留列表与游标，重试去重且加载中不会重复追加", async () => {
    const pending = deferred();
    const query = vi.fn().mockResolvedValueOnce({ items: [row("first")], next_before: "cursor" })
      .mockRejectedValueOnce(new Error("连接中断")).mockReturnValueOnce(pending.promise);
    const loader = createOperationHistory(query); await loader.refresh(); await loader.refresh(true);
    expect(loader.state.error).toBe("连接中断"); expect(loader.state.nextBefore).toBe("cursor"); expect(loader.state.items).toHaveLength(1);
    const retry = loader.refresh(true); await loader.refresh(true); expect(query).toHaveBeenCalledTimes(3);
    pending.resolve({ items: [row("first"), row("second")], next_before: null }); await retry;
    expect(loader.state.items).toHaveLength(2); expect(loader.state.error).toBe(""); expect(loader.state.nextBefore).toBeNull();
  });
});
