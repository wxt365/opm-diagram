import { computed, ref, watch, type Ref, type ComputedRef } from "vue";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { LayoutBatchCommand } from "@/shared/api/draftWorkbenchSession";
import type { WorkbenchState } from "./workbenchState";
import { autoLayout, type AutoLayoutDirection } from "./autoLayout";
import { arrangeLayouts, arrangementSelection, type LayoutAction } from "./layoutArrangement";
import { captureLayouts, type NodeLayout } from "./layoutSelection";
import { fitStateContainers, repairStateContainers } from "./stateLayout";
import type { EdgeRoute, NodeAppearance, OpdNode } from "@/shared/types/modeling";
import { normalizeNodeAppearance } from "@/shared/nodeAppearance";
import { captureRelationLayouts, replaceSegmentRoute, translatedRelationLayouts } from "./relationLayout";
import { translatedFeatureLayouts } from "./featureOwnerLayout";
import { placeExpandedGroup } from "./ownedNodePlacement";

/** 布局先在本地整理，手动保存时复用工作台批量命令入口。 */
export function createWorkbenchLayout(input: {
  workbench: WorkbenchState; draftToken: Ref<DraftToken | null>; isReadonly: ComputedRef<boolean>;
  selectedIds: Ref<string[]>; projectId: Ref<string>; modelId: Ref<string>; editingIdentity: ComputedRef<string>;
  relationCandidate: { phase: string }; controlCandidate: { phase: string }; structuralUpdateCandidate: { phase: string };
  getLoadSequence: () => number; hasDraftSession: () => boolean; canEdit: (command: string) => boolean;
  execute: (command: LayoutBatchCommand) => Promise<boolean>; block: (text: string) => void;
  saving: Ref<boolean>;
  onLocalEdit?: () => void;
  refineeId?: () => string | undefined;
}) {
  const { workbench, draftToken, isReadonly, selectedIds, projectId, modelId, editingIdentity,
    relationCandidate, controlCandidate, structuralUpdateCandidate, getLoadSequence, hasDraftSession, canEdit, execute, block } = input;
  const undoLayouts = ref<Array<{ before: NodeLayout[]; after: NodeLayout[] }>>([]);
  const pendingLayouts = ref(new Map<string, { before: NodeLayout; after: NodeLayout }>());
  let pendingRepairs = new Map<string, NodeLayout>();
  const layoutDirty = computed(() => pendingLayouts.value.size > 0);
  function captureAll() { return [...captureLayouts(workbench.nodes), ...captureRelationLayouts(workbench.relations)]; }
  function applyLocal(layouts: NodeLayout[]) {
    const byOccurrence = new Map(layouts.map(item => [item.occurrence_id, item.layout]));
    workbench.nodes = workbench.nodes.map(node => byOccurrence.has(node.occurrenceId)
      ? { ...node, ...byOccurrence.get(node.occurrenceId)!, edgeRoutes: byOccurrence.get(node.occurrenceId)!.edge_routes,
        appearance: normalizeNodeAppearance(byOccurrence.get(node.occurrenceId)!.appearance) } : node);
    workbench.relations = workbench.relations.map(relation => {
      const layout = byOccurrence.get(relation.occurrenceId);
      return layout ? { ...relation, layout, edgeRoutes: layout.edge_routes } : relation;
    });
  }
  function stageLayouts(layouts: NodeLayout[]) {
    const current = new Map(captureAll().map(item => [item.occurrence_id, item]));
    for (const after of layouts) {
      const previous = current.get(after.occurrence_id);
      if (!previous) continue;
      const before = pendingLayouts.value.get(after.occurrence_id)?.before ?? previous;
      if (JSON.stringify(before.layout) === JSON.stringify(after.layout)) pendingLayouts.value.delete(after.occurrence_id);
      else pendingLayouts.value.set(after.occurrence_id, { before, after: { ...after, layout: { ...after.layout } } });
    }
    applyLocal(layouts);
  }
  function overlayPendingLayouts() {
    const current = new Map(captureAll().map(item => [item.occurrence_id, item]));
    for (const [id, entry] of pendingLayouts.value) {
      const server = current.get(id);
      if (!server) { pendingLayouts.value.delete(id); continue; }
      const layout = { ...server.layout };
      for (const key of ["x", "y", "width", "height"] as const)
        if (entry.before.layout[key] !== entry.after.layout[key]) layout[key] = entry.after.layout[key];
      if (JSON.stringify(entry.before.layout.edge_routes) !== JSON.stringify(entry.after.layout.edge_routes)) layout.edge_routes = entry.after.layout.edge_routes;
      if (JSON.stringify(entry.before.layout.appearance) !== JSON.stringify(entry.after.layout.appearance)) {
        if (entry.after.layout.appearance) layout.appearance = entry.after.layout.appearance;
        else delete layout.appearance;
      }
      if (JSON.stringify(layout) === JSON.stringify(server.layout)) pendingLayouts.value.delete(id);
      else pendingLayouts.value.set(id, { before: server, after: { occurrence_id: id, layout } });
    }
    // 新增的所属状态也随本地 owner 平移；保持服务器更新后的容器尺寸。
    const byNode = new Map(workbench.nodes.map(node => [node.id, node]));
    for (const node of workbench.nodes) {
      if (node.kind !== "state" || !node.ownerId || pendingLayouts.value.has(node.occurrenceId)) continue;
      const owner = byNode.get(node.ownerId), server = current.get(node.occurrenceId);
      const moved = owner && pendingLayouts.value.get(owner.occurrenceId);
      if (!owner || !server || !moved) continue;
      const dx = moved.after.layout.x - owner.x, dy = moved.after.layout.y - owner.y;
      if (dx || dy) pendingLayouts.value.set(node.occurrenceId, { before: server, after: { occurrence_id: node.occurrenceId,
        layout: { ...server.layout, x: server.layout.x + dx, y: server.layout.y + dy } } });
    }
    applyLocal([...pendingLayouts.value.values()].map(item => item.after));
    // 语义编辑清理旧历史后，用新投影基线恢复尚未保存的布局，避免撤销覆盖服务端尺寸等变化。
    if (pendingLayouts.value.size && !undoLayouts.value.length && !redoLayouts.value.length) {
      const pending = [...pendingLayouts.value.values()];
      undoLayouts.value.push({ before: pending.map(item => item.before), after: pending.map(item => item.after) });
    }
  }
  function repairLoadedStates(persist: boolean) {
    const previous = new Map(captureLayouts(workbench.nodes).map(item => [item.occurrence_id, item]));
    const repaired = repairStateContainers(workbench.nodes);
    // 加载修正作为显示基线；显式保存时持久化，不触发用户离开保护。
    pendingRepairs = new Map(persist ? captureLayouts(repaired)
      .filter(item => JSON.stringify(previous.get(item.occurrence_id)?.layout) !== JSON.stringify(item.layout))
      .map(item => [item.occurrence_id, item]) : []);
    workbench.nodes = repaired;
  }
  function discardLayouts() {
    applyLocal([...pendingLayouts.value.values()].map(item => item.before));
    pendingLayouts.value.clear(); clearLayoutHistory(); cancelAutoLayout();
  }
  async function flushLayouts() {
    if (!layoutDirty.value && !pendingRepairs.size) return true;
    const captured = new Map(pendingLayouts.value), sequence = getLoadSequence();
    const layouts = new Map(pendingRepairs);
    for (const [id, item] of captured) layouts.set(id, item.before.layout.appearance && !item.after.layout.appearance
      ? { ...item.after, layout: { ...item.after.layout, appearance: {} } } : item.after);
    if (!await execute({ commandType: "UPDATE_LAYOUT_BATCH", payload: { layouts: [...layouts.values()] } })) return false;
    if (sequence !== getLoadSequence()) return false;
    for (const [id, value] of captured) if (JSON.stringify(pendingLayouts.value.get(id)?.after) === JSON.stringify(value.after)) pendingLayouts.value.delete(id);
    clearLayoutHistory();
    return true;
  }
  const redoLayouts = ref<Array<{ before: NodeLayout[]; after: NodeLayout[] }>>([]);
  const canUndoLayout = computed(() => !!draftToken.value && !isReadonly.value && !input.saving.value && workbench.commandState !== "submitting" && undoLayouts.value.length > 0);
  const canRedoLayout = computed(() => !!draftToken.value && !isReadonly.value && !input.saving.value && workbench.commandState !== "submitting" && redoLayouts.value.length > 0);
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
    return workbench.nodes.map(node => {
      const layout = layouts.get(node.occurrenceId);
      return layout ? { ...node, ...layout, edgeRoutes: layout.edge_routes ?? node.edgeRoutes } : node;
    });
  });
  const autoLayoutRelations = computed(() => {
    if (!autoLayoutPreview.value) return workbench.relations;
    const layouts = new Map(autoLayoutPreview.value.layouts.map(item => [item.occurrence_id, item.layout]));
    return workbench.relations.map(relation => {
      const layout = layouts.get(relation.occurrenceId);
      return layout ? { ...relation, edgeRoutes: layout.edge_routes ?? relation.edgeRoutes } : relation;
    });
  });
  function cancelAutoLayout() { autoLayoutPreview.value = null; }
  function previewAutoLayout(direction: AutoLayoutDirection = "right") {
    if (!canAutoLayout.value) return;
    const result = autoLayout(workbench.nodes, workbench.relations, direction, input.refineeId?.());
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
    const moving = new Set(layouts.map(item => item.occurrence_id));
    const nodesBefore = workbench.nodes;
    const before = captureAll().filter(item => moving.has(item.occurrence_id));
    const beforeById = new Map(before.map(item => [item.occurrence_id, item]));
    if (isReadonly.value || input.saving.value || workbench.commandState === "submitting" || !hasDraftSession() || !canEdit("UPDATE_LAYOUT_BATCH")) {
      workbench.nodes = workbench.nodes.map(node => ({ ...node })); return;
    }
    const changes = layouts.map(item => {
      const previous = beforeById.get(item.occurrence_id);
      const layout = { ...item.layout };
      if (previous?.layout.edge_routes && layout.edge_routes === undefined) layout.edge_routes = previous.layout.edge_routes;
      const appearance = normalizeNodeAppearance(layout.appearance ?? previous?.layout.appearance);
      if (appearance) layout.appearance = appearance; else delete layout.appearance;
      return { ...item, layout };
    }).filter(item => {
      const previous = beforeById.get(item.occurrence_id);
      return previous && JSON.stringify(previous.layout) !== JSON.stringify(item.layout);
    });
    if (changes.length) {
      input.onLocalEdit?.();
      stageLayouts(changes);
      const featurePaths = translatedFeatureLayouts(nodesBefore, workbench.nodes);
      const capturedIds = new Set(before.map(item => item.occurrence_id));
      before.push(...captureLayouts(nodesBefore).filter(item => !capturedIds.has(item.occurrence_id) && featurePaths.some(next => next.occurrence_id === item.occurrence_id)));
      stageLayouts(featurePaths);
      const translated = translatedRelationLayouts(workbench.relations, nodesBefore, workbench.nodes);
      const relationBefore = captureRelationLayouts(workbench.relations).filter(item => translated.some(next => next.occurrence_id === item.occurrence_id));
      before.push(...relationBefore); stageLayouts(translated);
      const previousIds = new Set(before.map(item => item.occurrence_id));
      const after = captureAll().filter(item => previousIds.has(item.occurrence_id));
      undoLayouts.value.push({ before, after });
      if (undoLayouts.value.length > 100) undoLayouts.value.shift();
      redoLayouts.value = [];
    }
  }

  async function reflowStates(ownerId: string, previousNodes: readonly OpdNode[]) {
    if (!hasDraftSession() || isReadonly.value) return;
    const fitted = fitStateContainers(workbench.nodes, new Set([ownerId]), new Set(), previousNodes);
    await moveElements(captureLayouts(placeExpandedGroup(fitted, ownerId, input.refineeId?.())));
  }

  async function editNodeAppearance(occurrenceId: string, appearance: NodeAppearance) {
    if (autoLayoutPreview.value || relationCandidate.phase !== "idle" || controlCandidate.phase !== "idle" || structuralUpdateCandidate.phase !== "idle") return;
    const layout = captureLayouts(workbench.nodes).find(item => item.occurrence_id === occurrenceId);
    if (layout) await moveElements([{ ...layout, layout: { ...layout.layout, appearance } }]);
  }

  async function editRelationRoute(occurrenceId: string, route: EdgeRoute) {
    if (autoLayoutPreview.value || relationCandidate.phase !== "idle" || controlCandidate.phase !== "idle" || structuralUpdateCandidate.phase !== "idle") return;
    const relation = workbench.relations.find(item => item.occurrenceId === occurrenceId);
    const node = workbench.nodes.find(item => item.occurrenceId === occurrenceId && item.occurrenceRole === "owned");
    if (node) {
      const allowed = node.kind === "attribute" || node.kind === "operation" ? "feature.owner"
        : node.kind === "object" ? "feature.characterization" : node.kind === "process" ? "feature.composition" : "";
      const layout = captureLayouts([node])[0];
      const junction = (node.kind === "object" || node.kind === "process") && route.segment === `${allowed}.junction`;
      if (layout && (allowed === route.segment || junction)) {
        if (junction && (route.mode === "MANUAL" ? route.points.length !== 1 : route.points.length !== 0)) return;
        await moveElements([{ ...layout, layout: { ...layout.layout, edge_routes: replaceSegmentRoute(node, route) } }]);
      }
      return;
    }
    const layout = captureRelationLayouts(workbench.relations).find(item => item.occurrence_id === occurrenceId);
    if (relation && layout) await moveElements([{ ...layout, layout: { ...layout.layout, edge_routes: replaceSegmentRoute(relation, route) } }]);
  }

  async function travelLayout(redo: boolean) {
    if (redo ? !canRedoLayout.value : !canUndoLayout.value) return;
    const from = redo ? redoLayouts.value : undoLayouts.value;
    const to = redo ? undoLayouts.value : redoLayouts.value;
    if (input.saving.value) return;
    const entry = from.at(-1)!;
    stageLayouts(redo ? entry.after : entry.before);
    from.pop(); to.push(entry);
  }
  function undoLayout() { return travelLayout(false); }
  function redoLayout() { return travelLayout(true); }

  return { editNodeAppearance, editRelationRoute, layoutDirty, overlayPendingLayouts, repairLoadedStates, discardLayouts, flushLayouts, clearLayoutHistory, canUndoLayout, canRedoLayout, autoLayoutPreview, applyingAutoLayout, canAutoLayout, autoLayoutNodes, autoLayoutRelations, cancelAutoLayout, previewAutoLayout, applyAutoLayout, layoutArrangement, arrangeSelection, moveElements, reflowStates, undoLayout, redoLayout };
}
