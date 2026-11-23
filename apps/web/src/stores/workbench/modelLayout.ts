import { computed, reactive, watch, type Ref } from "vue";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { sameDraftToken } from "@/shared/api/draftRequestIdentity";
import { autoLayout, type AutoLayoutDirection } from "./autoLayout";
import { captureLayouts, type NodeLayout } from "./layoutSelection";
import { captureRelationLayouts } from "./relationLayout";
import { toNode, toConsumption, type RuntimeContext } from "./projectionMapping";
import { overlappingNodeIds } from "./layoutOverlap";

type Plan = { id: string; label: string; refineeId?: string; nodes: OpdNode[]; relations: ConsumptionRelation[]; before: NodeLayout[]; after: NodeLayout[] };

/** Each context retains its own authorization; preview reads never advance the draft token. */
export function createModelLayout(input: {
  token: Ref<DraftToken | null>; contexts: Ref<RuntimeContext[]>; allowed: () => boolean; identity: () => string;
  session: () => DraftWorkbenchSession | null; context: () => string;
  busy: Ref<boolean>; feedback: (message: string) => void; refresh: (token: DraftToken) => Promise<void>;
}) {
  const state = reactive({ preview: false, loading: false, applying: false, direction: "right" as AutoLayoutDirection,
    context: "", plans: [] as Plan[], progress: "", error: "", undoAvailable: false });
  let generation = 0, previewToken: DraftToken | null = null;
  let history: { plans: Plan[]; token: DraftToken; identity: string } | null = null;
  const selected = computed(() => state.plans.find(plan => plan.id === state.context));
  function cancel() { if (state.applying) return; generation++; state.preview = false; state.loading = false; state.plans = []; state.error = ""; }
  watch(input.identity, () => { cancel(); history = null; state.undoAvailable = false; });
  watch(() => input.token.value, token => {
    if (state.applying) return;
    if (previewToken && (!token || !sameDraftToken(token, previewToken))) cancel();
    if (history && (!token || !sameDraftToken(token, history.token))) { history = null; state.undoAvailable = false; }
  });
  async function preview(direction: AutoLayoutDirection = "right") {
    if (!input.allowed()) return;
    const session = input.session(), token = input.token.value;
    if (!session || !token) return;
    const current = ++generation, identity = input.identity();
    Object.assign(state, { preview: true, loading: true, direction, error: "", progress: "正在读取全部图…" });
    previewToken = { ...token };
    const plans: Plan[] = [];
    try {
      for (const context of input.contexts.value) {
        const constructs = await session.projection(token, context.id);
        if (current !== generation || identity !== input.identity()) return;
        const nodes = constructs.filter(item => item.target_kind !== "FACT").map(toNode);
        const relations = constructs.filter(item => item.target_kind === "FACT").flatMap(item => toConsumption(item, nodes));
        const result = nodes.some(node => node.occurrenceRole === "owned" && node.id !== context.refineeId)
          ? autoLayout(nodes, relations, direction, context.refineeId) : { layouts: [], reason: "" };
        if (result.reason) throw new Error(`${context.label}：${result.reason}`);
        const changes = new Map(result.layouts.map(item => [item.occurrence_id, item.layout]));
        const placed = nodes.map(node => changes.has(node.occurrenceId) ? { ...node, ...changes.get(node.occurrenceId)!, edgeRoutes: changes.get(node.occurrenceId)!.edge_routes } : node);
        if (overlappingNodeIds(placed, context.refineeId).length) throw new Error(`${context.label}：仍有不可移动元素重叠，请先检查所属关系。`);
        plans.push({ id: context.id, label: context.label, refineeId: context.refineeId, nodes: placed,
          relations: relations.map(relation => changes.has(relation.occurrenceId) ? { ...relation, edgeRoutes: changes.get(relation.occurrenceId)!.edge_routes } : relation),
          before: [...captureLayouts(nodes), ...captureRelationLayouts(relations)].filter(item => changes.has(item.occurrence_id)), after: result.layouts });
        state.progress = `已检查 ${plans.length} / ${input.contexts.value.length} 张图`;
      }
      if (current !== generation || identity !== input.identity()) return;
      state.plans = plans; state.context = plans.some(plan => plan.id === input.context()) ? input.context() : plans[0]?.id ?? "";
    } catch (error) { if (current === generation) { state.error = error instanceof Error ? error.message : String(error); state.plans = []; } }
    finally { if (current === generation) state.loading = false; }
  }
  async function write(plans: Plan[], undo: boolean) {
    const session = input.session(); let token = input.token.value;
    if (!session || !token || state.applying || !input.allowed()) return;
    if (!undo && (!previewToken || !sameDraftToken(token, previewToken))) return cancel();
    const identity = input.identity(), completed: Plan[] = [];
    state.applying = true; input.busy.value = true; state.error = "";
    try {
      for (const plan of plans.filter(plan => plan.after.length)) {
        if (identity !== input.identity() || session !== input.session()) throw new Error("模型已切换，整理已停止。");
        const layouts = undo ? plan.before : plan.after;
        // The existing batch contract limits one command to 1000 occurrences.
        for (let offset = 0; offset < layouts.length; offset += 1000) {
          const batch = layouts.slice(offset, offset + 1000);
          const result = await session.edit(token, plan.id, { commandType: "UPDATE_LAYOUT_BATCH", payload: { layouts: batch } });
          token = result.result_token;
          completed.push({ ...plan, after: batch, before: plan.before.filter(item => batch.some(value => value.occurrence_id === item.occurrence_id)) });
        }
        state.progress = `${undo ? "正在撤销" : "正在整理"}：${plan.label}`;
      }
      history = undo ? null : { plans: completed, token, identity };
      state.undoAvailable = !undo && completed.length > 0;
      state.preview = false;
      state.progress = undo ? "已撤销全模型整理，请保存草稿。" : `已整理 ${plans.filter(plan => plan.after.length).length} 张图，请保存草稿。`;
    } catch (error) {
      if (undo && history) {
        const remaining = history.plans.map(plan => {
          const restored = new Set(completed.filter(batch => batch.id === plan.id).flatMap(batch => batch.after.map(item => item.occurrence_id)));
          return { ...plan, before: plan.before.filter(item => !restored.has(item.occurrence_id)), after: plan.after.filter(item => !restored.has(item.occurrence_id)) };
        }).filter(plan => plan.after.length);
        history = remaining.length ? { plans: remaining, token, identity } : null;
      } else if (completed.length) history = { plans: completed, token, identity };
      state.undoAvailable = !!history;
      state.error = undo ? `已撤销 ${completed.length} 个布局批次，其余尚未撤销。${error instanceof Error ? error.message : String(error)} 可再次撤销剩余部分。`
        : `已完成 ${completed.length} 个布局批次，其余未应用。${error instanceof Error ? error.message : String(error)} 可撤销已完成部分。`;
      state.preview = false;
    } finally {
      try {
        if (identity === input.identity() && session === input.session()) {
          input.token.value = token;
          try { await input.refresh(token); }
          catch (error) { state.error = `布局命令已执行，但刷新失败，请重新加载工作台。${error instanceof Error ? error.message : String(error)}`; }
          input.feedback(state.error || state.progress);
        }
      }
      finally { state.applying = false; input.busy.value = false; }
    }
  }
  return { state, selected, preview, cancel, apply: () => write(state.plans, false),
    undo: () => history && input.token.value && sameDraftToken(history.token, input.token.value) ? write(history.plans, true) : Promise.resolve() };
}
