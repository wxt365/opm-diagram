import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { GraphAnalysisResult, GraphAnalysisRevisionRequest, MethodSource } from "@/shared/api/generated/draftWorkspaceContract";
import type { WorkbenchRuntimeApi } from "@/workbench/contracts";
import { LocalRuntimeApiError } from "@/shared/api/localRuntimeApi";

export interface GraphAnalysisProps { projectId: string; modelId: string; contextId: string; source: MethodSource | null; active: boolean }
export function useGraphAnalysis(props: GraphAnalysisProps, api: WorkbenchRuntimeApi) {
  const result = shallowRef<GraphAnalysisResult | null>(null), loading = ref(false), error = ref(""), stale = ref(false);
  const scope = ref<GraphAnalysisRevisionRequest["scope"]>("MODEL");
  const identity = computed(() => JSON.stringify([props.projectId, props.modelId, scope.value === "MODEL" ? null : props.contextId, props.source]));
  const options = computed(() => ({ scope: scope.value, include_hidden_states: scope.value === "MODEL",
    include_boundary_nodes: false, include_state_ownership: true }));
  let sequence = 0;
  async function refresh() {
    const ticket = ++sequence, source = props.source, input = identity.value, requested = JSON.stringify(options.value);
    error.value = "";
    if (!source) { loading.value = false; error.value = "模型尚未就绪，请先打开模型。"; return; }
    if (!api.graphAnalysis) { error.value = "当前工作台服务不支持图谱分析，请更新前后端版本。"; return; }
    loading.value = true;
    try {
      const value = await api.graphAnalysis(props.projectId, props.modelId, props.contextId, source, options.value);
      if (ticket !== sequence || input !== identity.value || requested !== JSON.stringify(options.value)) return;
      result.value = value; stale.value = false;
    } catch (failure) {
      if (ticket !== sequence) return;
      stale.value = !!result.value;
      error.value = failure instanceof LocalRuntimeApiError && failure.code === "NOT_FOUND"
        ? "模型或图谱接口不存在，请检查模型并确认前后端版本一致。" : failure instanceof Error && /[\u4e00-\u9fff]/.test(failure.message) ? failure.message : "图谱加载失败，请重试。";
    } finally { if (ticket === sequence) loading.value = false; }
  }
  watch(identity, (_value, previous) => {
    sequence++; loading.value = false; error.value = "";
    const before = previous ? JSON.parse(previous) as unknown[] : [];
    if (before[0] !== props.projectId || before[1] !== props.modelId) { result.value = null; scope.value = "MODEL"; }
    stale.value = !!result.value;
    if (props.active && !result.value) void refresh();
  });
  watch(options, () => { sequence++; loading.value = false; stale.value = !!result.value; if (props.active) void refresh(); });
  watch(() => props.active, active => { if (active && !result.value && !loading.value) void refresh(); }, { immediate: true });
  onBeforeUnmount(() => { sequence++; });
  return { result, loading, error, stale, scope, refresh };
}
