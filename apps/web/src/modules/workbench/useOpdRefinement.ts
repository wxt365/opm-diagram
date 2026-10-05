import { computed, nextTick, ref, watch } from "vue";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

/** 子图编辑只管理局部交互；语义提交复用工作台 store。 */
export function useOpdRefinement(input: { store: ReturnType<typeof useWorkbenchRuntimeStore>; route: RouteLocationNormalizedLoaded; openContext: (id: string) => void }) {
  const { store } = input;
  const childContexts = computed(() => store.contexts.filter(context => context.parentId === store.workbench.activeContextId && context.refineeId));
  const refinedElementIds = computed(() => childContexts.value.map(context => context.refineeId!));
  const canRefine = computed(() => Boolean(store.draftToken && !store.isReadonly
    && (store.selectedNode?.kind === "object" || store.selectedNode?.kind === "process")));
  const refinementName = ref("");
  const refinementSubmitting = ref(false);
  const refinementContextId = ref<string | null>(null);
  const refinementInputs = ref<HTMLInputElement[]>([]);
  const canOpenRefinement = computed(() => !!store.draftToken && !store.isReadonly && !store.autoLayoutPreview
    && store.workbench.resourceState === "ready" && store.workbench.commandState !== "submitting"
    && store.relationCandidate.phase === "idle" && store.controlCandidate.phase === "idle" && store.structuralUpdateCandidate.phase === "idle");
  function closeRefinement() { if (!refinementSubmitting.value) refinementContextId.value = null; }
  function navigateContext(id: string) { closeRefinement(); input.openContext(id); }
  function openRefinement(id: string) {
    if (!canOpenRefinement.value || refinementSubmitting.value) return;
    if (refinementContextId.value === id) { closeRefinement(); return; }
    refinementContextId.value = id;
    if (id !== store.workbench.activeContextId) input.openContext(id);
  }
  watch([() => input.route.path, () => store.workbench.locationMode], () => { refinementContextId.value = null; });
  watch(() => store.workbench.activeContextId, id => {
    if (refinementContextId.value && id !== refinementContextId.value) refinementContextId.value = null;
  });
  watch(() => [refinementContextId.value, canRefine.value, store.workbench.activeContextId, store.workbench.resourceState], async () => {
    if (refinementContextId.value !== store.workbench.activeContextId || !canRefine.value || !canOpenRefinement.value) return;
    await nextTick(); refinementInputs.value[0]?.focus();
  });
  watch(() => store.workbench.selectedId, () => {
    const node = store.selectedNode;
    refinementName.value = node && (node.kind === "object" || node.kind === "process") ? `${node.label} 细化` : "";
  });
  async function submitRefinement() {
    if (refinementSubmitting.value || !canRefine.value || !canOpenRefinement.value || refinementContextId.value !== store.workbench.activeContextId) return;
    refinementSubmitting.value = true;
    try {
      const child = await store.createRefinement(refinementName.value);
      if (child) { refinementContextId.value = null; input.openContext(child); }
    } finally { refinementSubmitting.value = false; }
  }
  return { childContexts, refinedElementIds, canRefine, refinementName, refinementSubmitting, refinementContextId, refinementInputs, canOpenRefinement, closeRefinement, navigateContext, openRefinement, submitRefinement };
}
