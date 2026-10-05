import { computed, watch, type Ref, type ComputedRef } from "vue";
import { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
import { localRuntimeApi, type FindingWire } from "@/shared/api/localRuntimeApi";
import type { DraftToken, DraftFinding } from "@/shared/api/generated/draftWorkspaceContract";
import type { WorkbenchState } from "./workbenchState";
import type { RuntimeContext } from "./projectionMapping";
import { findingDetails } from "./findingDetails";
import { message } from "./runtimeError";

/** 校验与跨图定位共用模型身份，过期结果不得回写工作台。 */
export function createFindingsWorkflow(input: {
  workbench: WorkbenchState; projectId: Ref<string>; modelId: Ref<string>; contexts: Ref<RuntimeContext[]>;
  findings: Ref<Array<FindingWire | DraftFinding>>; draftToken: Ref<DraftToken | null>; pendingDelivery: Ref<boolean>;
  selectedFindingId: Ref<string>; highlightedFindingTargetId: Ref<string>; selectedTextLineId: Ref<string>;
  validationError: Ref<string>; findingLocationBusy: Ref<boolean>; validatedInput: Ref<string>; validationInput: ComputedRef<string>;
  findingLocations: Ref<Record<string, { contextId: string; targetId: string; label: string }>>;
  getDraftSession: () => DraftWorkbenchSession | null; getLoadSequence: () => number;
  clearMethodHighlight: () => void; block: (text: string) => void;
}) {
  const { workbench, projectId, modelId, contexts, findings, draftToken, pendingDelivery, selectedFindingId,
    highlightedFindingTargetId, selectedTextLineId, validationError, findingLocationBusy, validatedInput, validationInput,
    findingLocations, getDraftSession, getLoadSequence, clearMethodHighlight, block } = input;
  let pendingFinding: { input: string; contextId: string; findingId: string; targetId: string } | null = null;
  const canRunValidation = computed(() => !!draftToken.value && workbench.resourceState === "ready"
    && workbench.commandState !== "submitting" && workbench.validationState !== "running" && !pendingDelivery.value);
  const validationLabel = computed(() => workbench.validationState === "running" ? "校验中"
    : workbench.validationState === "failed" ? "校验失败，可重试" : workbench.validationState === "current" ? "已完成 · 部分规则"
    : workbench.validationState === "stale" ? "内容已修改，需重新校验" : "尚未运行校验");
  const findingRows = computed(() => findings.value.map(finding => {
    const location = findingLocations.value[finding.entity_id];
    const contextId = location?.contextId ?? finding.context_id;
    return { ...finding, ...findingDetails(finding), entityLabel: location?.label ?? workbench.nodes.find(node => node.id === finding.entity_id)?.label ?? finding.entity_id,
      contextLabel: contexts.value.find(context => context.id === contextId)?.label ?? "所属 OPD 待定位" };
  }));
  const highlightedFindingNodeIds = computed(() => {
    const id = highlightedFindingTargetId.value;
    if (!id) return [];
    const relation = workbench.relations.find(item => item.id === id);
    const ids = new Set(relation ? relation.endpoints?.map(endpoint => endpoint.targetId) ?? [relation.sourceId, relation.targetId] : [id]);
    for (const target of ids) { const owner = workbench.nodes.find(node => node.id === target)?.ownerId; if (owner) ids.add(owner); }
    return workbench.nodes.filter(node => ids.has(node.id)).map(node => node.id);
  });
  watch(validationInput, (input, previous) => {
    if (input === previous) return;
    selectedFindingId.value = ""; highlightedFindingTargetId.value = ""; findingLocations.value = {};
    validationError.value = ""; findingLocationBusy.value = false;
    if (pendingFinding?.input !== input) pendingFinding = null;
    workbench.validationState = validatedInput.value === input ? "current" : validatedInput.value ? "stale" : "unvalidated";
    workbench.validationProgress = workbench.validationState === "current" ? 100 : 0;
  });

  async function runValidation() {
    const session = getDraftSession(), token = draftToken.value;
    if (!session || !token || !canRunValidation.value) return;
    const input = validationInput.value, sequence = getLoadSequence(), context = workbench.activeContextId;
    const current = () => input === validationInput.value && sequence === getLoadSequence() && session === getDraftSession();
    workbench.validationState = "running";
    workbench.validationProgress = 0; validationError.value = "";
    highlightedFindingTargetId.value = ""; selectedFindingId.value = "";
    workbench.bottomTab = "findings"; workbench.bottomPanelExpanded = true;
    try {
      const result = await session.findings(token, context);
      if (!current()) return;
      findings.value = result.items; workbench.blockingFindings = result.validation_summary.blocking;
      validatedInput.value = input; workbench.validationState = "current"; workbench.validationProgress = 100;
      workbench.lastAction = `模型校验已完成：阻断 ${result.validation_summary.blocking}；规则覆盖不完整`;
      if (result.items.length) {
        try { await indexFindingLocations(current); }
        catch (error) { if (current()) workbench.commandFeedback = `校验完成，问题位置读取失败，可点击定位重试：${message(error)}`; }
      }
    } catch (error) {
      if (!current()) return;
      workbench.validationState = "failed";
      validationError.value = message(error);
    }
  }

  async function indexFindingLocations(current: () => boolean) {
    const session = getDraftSession(), token = draftToken.value;
    const project = projectId.value, model = modelId.value, revision = workbench.revision;
    const locations: typeof findingLocations.value = {};
    const ordered = [...contexts.value].sort((a, b) => Number(b.id === workbench.activeContextId) - Number(a.id === workbench.activeContextId));
    for (const context of ordered) {
      const constructs = session && token ? await session.projection(token, context.id)
        : (await localRuntimeApi.projection(project, model, context.id, revision)).data.constructs;
      if (!current()) return;
      const byTarget = new Map<string, (typeof constructs)[number]>();
      for (const construct of constructs) if (!byTarget.has(construct.target_id)) byTarget.set(construct.target_id, construct);
      for (const construct of constructs) {
        const label = construct.endpoints?.map(endpoint => byTarget.get(endpoint.target_id)?.label ?? endpoint.target_id).join(" → ");
        const location = { contextId: context.id, targetId: construct.target_id, label: label || construct.label || construct.target_id };
        for (const id of [construct.target_id, construct.occurrence_id, ...(construct.layout_ref ? [construct.layout_ref] : [])]) {
          if (!locations[id]) locations[id] = location;
        }
      }
    }
    if (current()) findingLocations.value = locations;
  }

  function resumeFindingLocation() {
    if (pendingFinding?.input !== validationInput.value || pendingFinding.contextId !== workbench.activeContextId) return;
    selectedFindingId.value = pendingFinding.findingId; highlightedFindingTargetId.value = pendingFinding.targetId;
    pendingFinding = null;
  }

  function selectFinding(findingId: string) {
    clearMethodHighlight();
    if (!findings.value.some((finding) => finding.finding_id === findingId)) return;
    selectedFindingId.value = findingId;
    pendingFinding = null; findingLocationBusy.value = false;
    highlightedFindingTargetId.value = ""; selectedTextLineId.value = "";
    workbench.lastAction = `已选择 Finding ${findingId}`;
  }

  async function locateFinding(): Promise<string | undefined> {
    const finding = findings.value.find((item) => item.finding_id === selectedFindingId.value);
    if (!finding || findingLocationBusy.value) return;
    if (["stale", "running", "failed"].includes(workbench.validationState)) { block("请先重新运行校验，再定位问题。"); return; }
    const input = validationInput.value, sequence = getLoadSequence();
    const current = () => input === validationInput.value && sequence === getLoadSequence() && finding.finding_id === selectedFindingId.value;
    findingLocationBusy.value = true;
    try {
      let target = finding.entity_id;
      let contextId = workbench.activeContextId;
      if (!workbench.nodes.some(node => node.id === target) && !workbench.relations.some(relation => relation.id === target)) {
        if (!findingLocations.value[target]) await indexFindingLocations(current);
        if (!current()) return;
        const location = findingLocations.value[target];
        if (location) { target = location.targetId; contextId = location.contextId; }
        else {
          const diagram = contexts.value.find(context => context.id === target);
          if (!diagram) { block("该问题没有可见的画布构造，请查看问题详情和规则编号。"); return; }
          contextId = diagram.id; target = "";
        }
      }
      if (contextId !== workbench.activeContextId) pendingFinding = { input, contextId, findingId: finding.finding_id, targetId: target };
      else highlightedFindingTargetId.value = target;
      workbench.lastAction = target ? "已定位问题关联的构造" : "该问题属于 OPD 结构，请检查图层级";
      return contextId;
    } catch (error) { if (current()) { workbench.commandFeedback = `问题定位失败：${message(error)}`; } }
    finally { if (current()) findingLocationBusy.value = false; }
  }

  function clearPendingFinding() { pendingFinding = null; }
  return { canRunValidation, validationLabel, findingRows, highlightedFindingNodeIds, runValidation, resumeFindingLocation, selectFinding, locateFinding, clearPendingFinding };
}
