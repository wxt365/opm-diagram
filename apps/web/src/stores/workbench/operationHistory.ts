import { reactive } from "vue";
import type { OperationHistoryItem, OperationHistoryResult } from "@/shared/api/generated/draftWorkspaceContract";

export function createOperationHistory(query: (before: string | null) => Promise<OperationHistoryResult["data"]>) {
  const state = reactive({ items: [] as OperationHistoryItem[], loading: false, error: "", nextBefore: null as string | null });
  let sequence = 0;
  function reset() { sequence++; state.items = []; state.error = ""; state.nextBefore = null; state.loading = false; }
  async function refresh(more = false) {
    if (more && (state.loading || !state.nextBefore)) return;
    const request = ++sequence, cursor = more ? state.nextBefore : null;
    state.loading = true; state.error = "";
    if (!more) { state.items = []; state.nextBefore = null; }
    try {
      const data = await query(cursor);
      if (request !== sequence) return;
      const known = new Set(state.items.map(item => item.record_id));
      state.items = more ? [...state.items, ...data.items.filter(item => !known.has(item.record_id))] : data.items;
      state.nextBefore = data.next_before;
    } catch (error) {
      if (request === sequence) state.error = error instanceof Error ? error.message : "操作历史读取失败";
    } finally { if (request === sequence) state.loading = false; }
  }
  return { state, refresh, reset };
}
