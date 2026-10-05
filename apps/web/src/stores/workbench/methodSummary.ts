import { reactive } from "vue";
import type { MethodSummaryResult } from "@/shared/api/generated/draftWorkspaceContract";

export function createMethodSummary(query: () => Promise<MethodSummaryResult["data"]>) {
  const state = reactive({ data: null as MethodSummaryResult["data"] | null, loading: false, error: "" });
  let sequence = 0;
  function reset() { sequence++; state.data = null; state.error = ""; state.loading = false; }
  async function refresh() {
    const request = ++sequence;
    state.data = null; state.loading = true; state.error = "";
    try {
      const data = await query();
      if (request === sequence) state.data = data;
    } catch (error) {
      if (request === sequence) state.error = error instanceof Error ? error.message : "架构方法读取失败";
    } finally { if (request === sequence) state.loading = false; }
  }
  return { state, refresh, reset };
}
