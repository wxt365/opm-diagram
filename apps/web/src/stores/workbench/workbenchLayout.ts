import { computed, ref, watch, type Ref, type ComputedRef } from "vue";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { LayoutBatchCommand } from "@/shared/api/draftWorkbenchSession";
import type { WorkbenchState } from "./workbenchState";
import { autoLayout, type AutoLayoutDirection } from "./autoLayout";
import { arrangeLayouts, arrangementSelection, type LayoutAction } from "./layoutArrangement";
import { captureLayouts, type NodeLayout } from "./layoutSelection";

/** 布局预览、对齐和历史共用工作台命令入口，不持有独立提交队列。 */
export function createWorkbenchLayout(input: {
  workbench: WorkbenchState; draftToken: Ref<DraftToken | null>; isReadonly: ComputedRef<boolean>;
  selectedIds: Ref<string[]>; projectId: Ref<string>; modelId: Ref<string>; editingIdentity: ComputedRef<string>;
  relationCandidate: { phase: string }; controlCandidate: { phase: string }; structuralUpdateCandidate: { phase: string };
  getLoadSequence: () => number; hasDraftSession: () => boolean; canEdit: (command: string) => boolean;
  execute: (command: LayoutBatchCommand) => Promise<boolean>; block: (text: string) => void;
}) {
  const { workbench, draftToken, isReadonly, selectedIds, projectId, modelId, editingIdentity,
    relationCandidate, controlCandidate, structuralUpdateCandidate, getLoadSequence, hasDraftSession, canEdit, execute, block } = input;
  const undoLayouts = ref<Array<{ before: NodeLayout[]; after: NodeLayout[] }>>([]);
  const redoLayouts = ref<Array<{ before: NodeLayout[]; after: NodeLayout[] }>>([]);
  const canUndoLayout = computed(() => !!draftToken.value && !isReadonly.value && workbench.commandState !== "submitting" && undoLayouts.value.length > 0);
  const canRedoLayout = computed(() => !!draftToken.value && !isReadonly.value && workbench.commandState !== "submitting" && redoLayouts.value.length > 0);
  function clearLayoutHistory() { undoLayouts.value = []; redoLayouts.value = []; }
  const autoLayoutPreview = ref<{ direction: AutoLayoutDirection; layouts: NodeLayout[]; identity: string } | null>(null);
  const applyingAutoLayout = ref(false);
  const canAutoLayout = computed(() => !!draftToken.value && !isReadonly.value && workbench.resourceState === "ready"
    && workbench.commandState !== "submitting" && !applyingAutoLayout.value
    && relationCandidate.phase === "idle" && controlCandidate.phase === "idle" && structuralUpdateCandidate.phase === "idle"
    && workbench.nodes.some(node => node.occurrenceRole === "owned" && node.kind !== "state"));
  const layoutIdentity = computed(() => JSON.stringify([projectId.value, modelId.value, workbench.activeContextId,
    editingIdentity.value, workbench.nodes, workbench.relations]));
  const autoLayoutNodes = computed(() => {
    if (!autoLayoutPreview.value) return workbench.nodes;
    const layouts = new Map(autoLayoutPreview.value.layouts.map(item => [item.occurrence_id, item.layout]));
    return workbench.nodes.map(node => ({ ...node, ...layouts.get(node.occurrenceId) }));
  });
  function cancelAutoLayout() { autoLayoutPreview.value = null; }
  function previewAutoLayout(direction: AutoLayoutDirection = "right") {
    if (!canAutoLayout.value) return;
    const result = autoLayout(workbench.nodes, workbench.relations, direction);
    if (result.reason) { cancelAutoLayout(); block(result.reason); return; }
    if (!result.layouts.length) { cancelAutoLayout(); workbench.commandFeedback = "当前图已符合该自动布局。"; return; }
    autoLayoutPreview.value = { direction, layouts: result.layouts, identity: layoutIdentity.value };
  }
  async function applyAutoLayout() {
    const preview = autoLayoutPreview.value;
    if (!preview || applyingAutoLayout.value) return;
    if (!canAutoLayout.value || preview.identity !== layoutIdentity.value) { cancelAutoLayout(); return; }
    applyingAutoLayout.value = true;
    try { await moveElements(preview.layouts); }
    finally { applyingAutoLayout.value = false; cancelAutoLayout(); }
  }
  // 预览绑定原始草稿和几何；任何外部推进、语义编辑或图切换都使其失效。
  watch([layoutIdentity, canAutoLayout], ([identity, can]) => {
    if (autoLayoutPreview.value && (autoLayoutPreview.value.identity !== identity || (!can && !applyingAutoLayout.value))) cancelAutoLayout();
  });

  const layoutArrangement = computed(() => {
    const selection = arrangementSelection(workbench.nodes, selectedIds.value);
    const blocked = !draftToken.value || isReadonly.value || workbench.commandState === "submitting"
      || relationCandidate.phase !== "idle" || controlCandidate.phase !== "idle" || structuralUpdateCandidate.phase !== "idle";
    const reason = blocked ? "请在可编辑草稿中完成当前操作后整理布局。" : selection.reason;
    return { canAlign: !reason && selection.targets.length >= 2, canDistribute: !reason && selection.targets.length >= 3,
      reason, referenceLabel: selection.targets.at(-1)?.label ?? "", count: selection.targets.length };
  });

  async function arrangeSelection(action: LayoutAction) {
    const distributed = action.startsWith("distribute-");
    if (distributed ? !layoutArrangement.value.canDistribute : !layoutArrangement.value.canAlign) return;
    const result = arrangeLayouts(workbench.nodes, selectedIds.value, action);
    if (result.reason) { block(result.reason); return; }
    if (!result.layouts.length) { workbench.commandFeedback = "所选元素已符合该布局。"; return; }
    await moveElements(result.layouts);
  }

  async function moveElements(layouts: NodeLayout[]) {
    if (!layouts.length) return;
    const sequence = getLoadSequence();
    const moving = new Set(layouts.map(item => item.occurrence_id));
    const before = captureLayouts(workbench.nodes).filter(item => moving.has(item.occurrence_id));
    if (!hasDraftSession() || !canEdit("UPDATE_LAYOUT_BATCH")) {
      workbench.nodes = workbench.nodes.map(node => ({ ...node })); return;
    }
    const accepted = await execute({ commandType: "UPDATE_LAYOUT_BATCH", payload: { layouts } });
    if (sequence !== getLoadSequence()) return;
    if (accepted) {
      const previousIds = new Set(before.map(item => item.occurrence_id));
      const after = captureLayouts(workbench.nodes).filter(item => previousIds.has(item.occurrence_id));
      undoLayouts.value.push({ before, after });
      if (undoLayouts.value.length > 100) undoLayouts.value.shift();
      redoLayouts.value = [];
    } else {
      clearLayoutHistory();
      // Canvas 的临时移动未写入 store；新数组触发服务器已确认几何的回显。
      workbench.nodes = workbench.nodes.map(node => ({ ...node }));
    }
  }

  async function travelLayout(redo: boolean) {
    if (redo ? !canRedoLayout.value : !canUndoLayout.value) return;
    const from = redo ? redoLayouts.value : undoLayouts.value;
    const to = redo ? undoLayouts.value : redoLayouts.value;
    const entry = from.at(-1)!; const sequence = getLoadSequence();
    if (await execute({ commandType: "UPDATE_LAYOUT_BATCH", payload: { layouts: redo ? entry.after : entry.before } })) {
      if (sequence !== getLoadSequence()) return;
      from.pop(); to.push(entry);
    } else if (sequence === getLoadSequence()) clearLayoutHistory();
  }
  function undoLayout() { return travelLayout(false); }
  function redoLayout() { return travelLayout(true); }

  return { clearLayoutHistory, canUndoLayout, canRedoLayout, autoLayoutPreview, applyingAutoLayout, canAutoLayout, autoLayoutNodes, cancelAutoLayout, previewAutoLayout, applyAutoLayout, layoutArrangement, arrangeSelection, moveElements, undoLayout, redoLayout };
}
