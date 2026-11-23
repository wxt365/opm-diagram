import { onMounted, onBeforeUnmount, type Ref } from "vue";
import { useDraftStatePolling } from "./useDraftStatePolling";
import type { WorkbenchLocation, WorkbenchNavigation } from "@/workbench/internal";
function workbenchLocationQuery(mode: "HEAD" | "EXACT", revision: string, context: string) {
  return mode === "HEAD" ? { context } : { revision, context };
}
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

interface WorkbenchNavigationDependencies {
  store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "layoutDirty" | "draftToken" | "draftSaveState" | "pendingDelivery" | "saving" | "saveDraft" | "isReadonly" | "pollDraftState" | "leaveWorkbench" | "workbench" | "load" | "setViewportZoom" | "undo" | "redo">;
  route: WorkbenchLocation;
  router: WorkbenchNavigation;
  root: Ref<HTMLElement | undefined>;
  globalShortcuts?: boolean;
  canUseModelHistory?: () => boolean;
  hasUnsavedAnalysis?: () => boolean;
  hasPendingInputs?: () => boolean;
  requestHistory?: (redo: boolean) => Promise<void>;
  finishInputs: () => Promise<boolean>;
}

/** 统一保存快捷键、离开清理与 HEAD/EXACT 导航，保持迟到响应保护。 */
export function useWorkbenchNavigation({ store, route, router, finishInputs, root, globalShortcuts, canUseModelHistory = () => true, hasUnsavedAnalysis = () => false, hasPendingInputs = () => false, requestHistory }: WorkbenchNavigationDependencies) {
  let savePreparing = false;
  useDraftStatePolling(
    () => !!store.draftToken && store.workbench.resourceState === "ready" && (!store.isReadonly || store.pendingDelivery),
    () => store.saving || store.pendingDelivery || !!store.draftSaveState?.dirty_since
      || !!store.draftSaveState?.pending_manual_target || (!!store.draftSaveState && store.draftSaveState.in_flight !== "NONE"),
    () => store.pollDraftState(),
  );
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!store.layoutDirty && !hasUnsavedAnalysis() && !hasPendingInputs()) return;
    event.preventDefault(); event.returnValue = "";
  }
  async function requestSave(): Promise<string | null> {
    if (savePreparing || !store.draftToken || store.saving) return null;
    savePreparing = true;
    const location = route.fullPath;
    try {
      if (await finishInputs() && route.fullPath === location) return await store.saveDraft();
      return null;
    } finally { savePreparing = false; }
  }
  function saveKey(event: KeyboardEvent) {
    if (event.target instanceof Element && event.target.closest(".opm-workbench") && !root.value?.contains(event.target)) return;
    if (!globalShortcuts && (!root.value || !(event.target instanceof Node) || !root.value.contains(event.target))) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const key = event.key.toLowerCase();
    if ((key === "z" || key === "y") && !editing) {
      if (!canUseModelHistory()) return;
      event.preventDefault();
      if (!event.isComposing && !event.repeat && !store.isReadonly) void runHistory(event.shiftKey || key === "y");
      return;
    }
    if (key !== "s") return;
    event.preventDefault();
    if (event.isComposing || event.repeat || store.isReadonly) return;
    void requestSave();
  }
  async function runHistory(redo: boolean) {
    if (requestHistory) return requestHistory(redo);
    const location = route.fullPath;
    if (await finishInputs() && route.fullPath === location) await (redo ? store.redo() : store.undo());
  }
  onMounted(() => {
    window.addEventListener("keydown", saveKey);
    window.addEventListener("beforeunload", beforeUnload);
  });
  onBeforeUnmount(() => { window.removeEventListener("keydown", saveKey); window.removeEventListener("beforeunload", beforeUnload); store.leaveWorkbench(); });
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

  return { requestSave, openVersion, openContext, copyPermalink };
}
