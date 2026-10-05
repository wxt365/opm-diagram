import { watch, onMounted, onBeforeUnmount, type Ref, type ComputedRef } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { parseWorkbenchLocation, workbenchLocationQuery } from "@/app/workbenchLocation";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

interface WorkbenchNavigationDependencies {
  store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "draftToken" | "saving" | "saveDraft" | "isReadonly" | "pollDraftState" | "leaveWorkbench" | "workbench" | "load" | "setViewportZoom" | "undoLayout" | "redoLayout">;
  route: RouteLocationNormalizedLoaded;
  router: Router;
  finishInputs: () => Promise<boolean>;
  projectId: ComputedRef<string>;
  modelId: ComputedRef<string>;
  canvasLocationKey: Ref<number>;
  canvasInteractionTool: Ref<"select" | "pan">;
}

/** 统一保存快捷键、离开清理与 HEAD/EXACT 导航，保持迟到响应保护。 */
export function useWorkbenchNavigation({ store, route, router, finishInputs, projectId, modelId, canvasLocationKey, canvasInteractionTool }: WorkbenchNavigationDependencies) {
  let savePreparing = false;
  let saveStateTimer: ReturnType<typeof setInterval> | undefined;
  async function requestSave() {
    if (savePreparing || !store.draftToken || store.saving) return;
    savePreparing = true;
    const location = route.fullPath;
    try { if (await finishInputs() && route.fullPath === location) await store.saveDraft(); } finally { savePreparing = false; }
  }
  function saveKey(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const key = event.key.toLowerCase();
    if ((key === "z" || key === "y") && !editing) {
      event.preventDefault();
      if (!event.isComposing && !event.repeat && !store.isReadonly) void (event.shiftKey || key === "y" ? store.redoLayout() : store.undoLayout());
      return;
    }
    if (key !== "s") return;
    event.preventDefault();
    if (event.isComposing || event.repeat || store.isReadonly) return;
    void requestSave();
  }
  onMounted(() => {
    window.addEventListener("keydown", saveKey);
    saveStateTimer = setInterval(() => { void store.pollDraftState(); }, 2000);
  });
  onBeforeUnmount(() => { window.removeEventListener("keydown", saveKey); clearInterval(saveStateTimer); store.leaveWorkbench(); });
  function openVersion(revision: string) {
    void router.push({ query: workbenchLocationQuery(revision === "head" ? "HEAD" : "EXACT", revision, store.workbench.activeContextId), hash: "" });
  }

  function openContext(context: string) {
    void router.push({ query: workbenchLocationQuery(store.workbench.locationMode, store.workbench.revision, context), hash: "" });
  }

  async function copyPermalink() {
    if (store.workbench.resourceState !== "ready") return;
    const path = route.path, context = store.workbench.activeContextId;
    try {
      if (store.draftToken && !await finishInputs()) return;
      if (path !== route.path || context !== store.workbench.activeContextId) return;
      const revision = store.draftToken ? await store.saveDraft(true) : store.workbench.revision;
      if (!revision || path !== route.path || context !== store.workbench.activeContextId) return;
      const href = router.resolve({ path, query: workbenchLocationQuery("EXACT", revision, context) }).href;
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      store.workbench.commandFeedback = "已复制此版本的永久链接，打开后为只读。";
    } catch {
      store.workbench.commandFeedback = "无法访问剪贴板，请允许浏览器复制后重试。";
    }
  }

  let canonicalLocation = "";
  let navigationSequence = 0;
  watch(() => route.fullPath, async (fullPath) => {
    const sequence = ++navigationSequence;
    if (fullPath === canonicalLocation) { canonicalLocation = ""; return; }
    canonicalLocation = "";
    if (!projectId.value || !modelId.value) return;
    const { context, revision } = parseWorkbenchLocation(route.query);
    canvasLocationKey.value += 1;
    canvasInteractionTool.value = "select";
    store.setViewportZoom(100);
    const loaded = await store.load(projectId.value, modelId.value, context, revision);
    if (!loaded || sequence !== navigationSequence || route.fullPath !== fullPath) return;
    const target = { path: route.path, query: workbenchLocationQuery(store.workbench.locationMode, store.workbench.revision, store.workbench.activeContextId), hash: "" };
    const canonical = router.resolve(target).fullPath;
    if (canonical !== fullPath) {
      canonicalLocation = canonical;
      await router.replace(target);
    }
  }, { immediate: true });

  return { requestSave, openVersion, openContext, copyPermalink };
}
