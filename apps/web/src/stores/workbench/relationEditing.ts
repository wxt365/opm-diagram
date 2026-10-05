import { reactive, type Ref, type ComputedRef } from "vue";
import { transitionRelationGesture, type RelationGesturePhase } from "@/modules/workbench/opd/core/relation-gesture-state";
import { buildControlRelationPreview, buildCreateRelationPreview } from "@/modules/workbench/opd/core/relation-preview-renderer";
import type { RelationPreviewRenderSpec } from "@/modules/workbench/opd/core/relation-preview-render-spec";
import { relationToolDisplayName } from "@/modules/workbench/opd/core/relation-tool-presentation";
import { matchesTransformationGesture, TRANSFORMATION_TOOL_LABEL, type RelationToolIntent } from "@/modules/workbench/opd/core/transformation-tool";
import type { RelationGestureIntent } from "@/modules/workbench/opd/core/x6-relation-gesture-adapter";

import type { localRuntimeApi, RelationCatalogItemWire } from "@/shared/api/localRuntimeApi";
import type { ConsumptionRelation } from "@/shared/types/modeling";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import type { WorkbenchState } from "./workbenchState";
import { sameRelationOption, relationCandidateNeedsInput, relationFactFamily, relationDirection, requiredStructuralLabelSlots } from "./candidateRules";
import { message } from "./runtimeError";

interface RelationEditingDependencies {
  workbench: WorkbenchState;
  projectId: Ref<string>;
  modelId: Ref<string>;
  isReadonly: ComputedRef<boolean>;
  selectedRelation: ComputedRef<ConsumptionRelation | undefined>;
  allowedCommands: Ref<string[]>;
  rightPanel: { open: boolean };
  relationCatalog: { items: RelationCatalogItemWire[] };
  editingIdentity: ComputedRef<string>;
  queryCapabilities: (project: string, model: string, context: string, revision: string, selection?: string, intent?: string, endpoints?: string[]) => Promise<{ data: { allowed: string[]; options: WorkbenchCapabilityOption[] } }>;
  currentOption: (option: WorkbenchCapabilityOption) => boolean;
  execute: (command: Parameters<typeof localRuntimeApi.executeP0Command>[4]) => Promise<boolean>;
  canEdit: (command: string) => boolean;
  block: (reason: string) => void;
}

/** 候选交互拥有自己的预览状态；会话、能力查询和提交由工作台注入。 */
export function createRelationEditing({ workbench, projectId, modelId, isReadonly, selectedRelation, allowedCommands, rightPanel, relationCatalog, editingIdentity, queryCapabilities, currentOption, execute, canEdit, block }: RelationEditingDependencies) {
  const relationCandidate = reactive({
    phase: "idle" as RelationGesturePhase,
    catalogItem: null as RelationCatalogItemWire | null,
    toolIntent: "SINGLE" as RelationToolIntent,
    sourceId: "",
    targetId: "",
    sourceOccurrenceId: "",
    targetOccurrenceId: "",
    endpointIds: [] as string[],
    endpointOccurrenceIds: [] as string[],
    pointer: { x: 0, y: 0 },
    options: [] as WorkbenchCapabilityOption[],
    selectedOption: null as WorkbenchCapabilityOption | null,
    previewSpec: null as RelationPreviewRenderSpec | null,
    candidateId: "",
    duration: "",
    labels: {} as Record<string, string>,
    collectionCompleteness: "" as "" | "COMPLETE" | "INCOMPLETE",
    direction: "DIRECTED" as "DIRECTED" | "BIDIRECTIONAL",
    autoCommitting: false,
  });
  const controlCandidate = reactive({ phase: "idle" as "idle" | "choosing" | "previewing", factId: "", options: [] as WorkbenchCapabilityOption[], selectedOption: null as WorkbenchCapabilityOption | null, previewSpec: null as RelationPreviewRenderSpec | null });
  const structuralUpdateCandidate = reactive({ phase: "idle" as "idle" | "editing", inline: false, baseRevision: "", factId: "", option: null as WorkbenchCapabilityOption | null, labels: {} as Record<string, string>, collectionCompleteness: "" as "" | "COMPLETE" | "INCOMPLETE", direction: "DIRECTED" as "DIRECTED" | "BIDIRECTIONAL" });
  let structuralEditRequest = 0;

  function transitionRelation(event: Parameters<typeof transitionRelationGesture>[1]) {
    relationCandidate.phase = transitionRelationGesture(relationCandidate.phase, event);
  }

  function activateRelationCatalogItem(item: RelationCatalogItemWire, intent: RelationToolIntent = "SINGLE") {
    if (!item.enabled) return block(`当前关系不可用：${item.reason_codes.join(", ") || "PROFILE_CAPABILITY_DISABLED"}。`);
    if (item.interaction_mode === "UPDATE_SELECTED_FACT") {
      void armControlUpdate(item.capability_id);
      return;
    }
    armRelationCreation(item, intent);
  }

  function armRelationCreation(item?: RelationCatalogItemWire, intent: RelationToolIntent = "SINGLE") {
    if (!item || item.interaction_mode !== "CREATE_FACT") return block("请从 Runtime 关系目录选择要创建的关系。");
    if (isReadonly.value) return block("当前修订为只读版本，不能创建关系。");
    if (relationCandidate.autoCommitting || workbench.commandState === "submitting") return;
    if (relationCandidate.phase !== "idle") cancelRelationCandidate();
    resetRelationCandidateFields();
    relationCandidate.catalogItem = item;
    relationCandidate.toolIntent = intent;
    transitionRelation("ARM");
    workbench.lastAction = `已选择 ${intent === "TRANSFORMATION" ? TRANSFORMATION_TOOL_LABEL : relationToolDisplayName(item.capability_id) ?? "关系"}；请从源节点拖到目标节点。`;
  }

  function cancelRelationCandidate() {
    if (relationCandidate.phase !== "idle") {
      if (relationCandidate.phase !== "confirmed" && relationCandidate.phase !== "cancelled") transitionRelation("CANCEL");
      transitionRelation("RESET");
    }
    resetRelationCandidateFields();
  }

  function resetRelationCandidateFields() {
    relationCandidate.catalogItem = null;
    relationCandidate.toolIntent = "SINGLE";
    relationCandidate.sourceId = "";
    relationCandidate.targetId = "";
    relationCandidate.sourceOccurrenceId = "";
    relationCandidate.targetOccurrenceId = "";
    relationCandidate.endpointIds = [];
    relationCandidate.endpointOccurrenceIds = [];
    relationCandidate.pointer = { x: 0, y: 0 };
    relationCandidate.options = [];
    relationCandidate.selectedOption = null;
    relationCandidate.previewSpec = null;
    relationCandidate.candidateId = "";
    relationCandidate.labels = {};
    relationCandidate.collectionCompleteness = "";
    relationCandidate.direction = "DIRECTED";
    relationCandidate.duration = "";
    relationCandidate.autoCommitting = false;
  }

  function handleRelationGesture(intent: RelationGestureIntent) {
    if (intent.type === "relation-cancelled") {
      cancelRelationCandidate();
      return;
    }
    if (intent.type === "relation-drag-start") {
      if (relationCandidate.phase !== "relation-armed") return;
      const source = workbench.nodes.find((node) => node.occurrenceId === intent.source_occurrence_id);
      if (!source) return cancelRelationCandidate();
      if (relationCandidate.endpointOccurrenceIds.length && !relationCandidate.endpointOccurrenceIds.includes(source.occurrenceId)) {
        block("继续添加 fan 端点时必须从已选端点开始拖动。");
        cancelRelationCandidate();
        return;
      }
      transitionRelation("DRAG_START");
      relationCandidate.sourceId = source.id;
      relationCandidate.sourceOccurrenceId = source.occurrenceId;
      relationCandidate.pointer = intent.pointer;
      if (!relationCandidate.endpointOccurrenceIds.length) {
        relationCandidate.endpointOccurrenceIds.push(source.occurrenceId);
        relationCandidate.endpointIds.push(source.id);
      }
      return;
    }
    if (intent.type === "relation-drag-move") {
      if (relationCandidate.phase !== "dragging") return;
      transitionRelation("DRAG_MOVE");
      relationCandidate.pointer = intent.pointer;
      return;
    }
    if (relationCandidate.phase !== "dragging") return;
    const target = workbench.nodes.find((node) => node.occurrenceId === intent.target_occurrence_id);
    if (!target || relationCandidate.endpointIds.length >= 16) return cancelRelationCandidate();
    transitionRelation("ENDPOINT_SELECTED");
    relationCandidate.targetId = target.id;
    relationCandidate.targetOccurrenceId = target.occurrenceId;
    relationCandidate.pointer = intent.pointer;
    relationCandidate.endpointOccurrenceIds.push(target.occurrenceId);
    relationCandidate.endpointIds.push(target.id);
    const minimumEndpoints = relationCandidate.catalogItem?.endpoint_summary.min_endpoints ?? 2;
    if (relationCandidate.endpointIds.length < minimumEndpoints) {
      transitionRelation("CONTINUE_ENDPOINTS");
      workbench.lastAction = `已选择 ${relationCandidate.endpointIds.length}/${minimumEndpoints} 个端点；请从已选端点继续拖线。`;
      return;
    }
    void resolveRelationCandidates(intent.continue_collection === true, intent.open_parameters === true);
  }

  async function resolveRelationCandidates(continueCollection = false, openParameters = false) {
    if (relationCandidate.phase !== "endpoint-selected" || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId || relationCandidate.endpointIds.length < 2) return;
    transitionRelation("FILTER_CANDIDATES");
    try {
      const result = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, undefined, "CREATE_FACT", relationCandidate.endpointIds);
      relationCandidate.options = result.data.options.filter(matchesActiveRelationTool);
      if (!relationCandidate.options.length) {
        block("所选端点没有与目录项匹配的 Runtime 候选。");
        cancelRelationCandidate();
        return;
      }
      const option = relationCandidate.options[0];
      if (!option) return;
      const directCommit = !continueCollection && relationCandidate.options.length === 1 && !relationCandidateNeedsInput(option) && !openParameters;
      relationCandidate.autoCommitting = directCommit;
      chooseRelationCandidate(option);
      if (continueCollection && relationCandidate.catalogItem?.endpoint_summary.max_endpoints === undefined) {
        continueRelationEndpoints();
        return;
      }
      if (directCommit) {
        await confirmRelationCandidate();
        relationCandidate.autoCommitting = false;
      }
    } catch (error) {
      workbench.commandFeedback = message(error);
      cancelRelationCandidate();
    }
  }

  async function submitRelationCandidate(option: WorkbenchCapabilityOption): Promise<boolean> {
    if (relationCandidate.phase !== "candidate-preview" || !canEdit("CREATE_FACT")) return false;
    const durationRequired = option.required_fields.some((field) => field.field_id === "duration" && field.required);
    if (durationRequired && !relationCandidate.duration.trim()) {
      block("该 Exception Link 必须填写 duration。");
      return false;
    }
    const family = relationFactFamily(option.capability_ref.capability_id);
    if (!family) {
      block("当前 Capability 没有可提交的 Fact family。");
      return false;
    }
    const structural = option.capability_ref.capability_id.startsWith("CAP-ISO-STRUCT-");
    const labels = Object.entries(relationCandidate.labels)
      .filter(([, text]) => text.trim())
      .map(([slot_id, text]) => ({ slot_id, text: text.trim() }));
    const direction = relationDirection(option, relationCandidate.direction);
    if (!direction) {
      block("Runtime 结构关系候选缺少方向约束。");
      return false;
    }
    const requiredLabelSlots = requiredStructuralLabelSlots(option, direction);
    if (structural && option.required_fields.some((field) => field.field_id === "labels" && field.required)
      && requiredLabelSlots.some((slot) => !labels.some((label) => label.slot_id === slot))) {
      block("请填写所有必填关系标签。");
      return false;
    }
    if (structural && option.required_fields.some((field) => field.field_id === "collection_completeness") && !relationCandidate.collectionCompleteness) {
      block("请选择 fan 的完整性。");
      return false;
    }
    return execute({ commandType: "CREATE_FACT", payload: {
      context_id: workbench.activeContextId,
      capability_ref: { capability_id: option.capability_ref.capability_id },
      fact_family: family,
      normalized_endpoints: option.normalized_endpoints,
      direction,
      labels,
      modifiers: durationRequired ? [{ modifier_id: "duration", value: relationCandidate.duration.trim() }] : [],
      logical_groups: [],
      ...(structural ? { collection_completeness: relationCandidate.collectionCompleteness || "NOT_APPLICABLE" } : {}),
      occurrence: { ownership: "OWNED", construct_role: structural ? "STRUCTURAL_LINK" : "PROCEDURAL_LINK" },
      layout: { x: 180, y: 80 },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
  }

  function matchesActiveRelationTool(option: WorkbenchCapabilityOption) {
    return relationCandidate.toolIntent === "TRANSFORMATION"
      ? matchesTransformationGesture(option, relationCatalog.items, relationCandidate.endpointIds)
      : option.command_type === "CREATE_FACT" && option.enabled && option.capability_ref.capability_id === relationCandidate.catalogItem?.capability_id;
  }

  function chooseRelationCandidate(option: WorkbenchCapabilityOption) {
    if (relationCandidate.phase !== "candidate-filtering" || !matchesActiveRelationTool(option)) return;
    relationCandidate.selectedOption = option;
    relationCandidate.labels = {};
    const labels = option.required_fields.find((field) => field.field_id === "labels");
    (labels?.allowed_values ?? []).forEach((slot) => { relationCandidate.labels[slot] = ""; });
    relationCandidate.collectionCompleteness = option.required_fields.some((field) => field.field_id === "collection_completeness") ? "COMPLETE" : "";
    const direction = option.required_fields.find((field) => field.field_id === "direction");
    const allowedDirections = direction?.allowed_values ?? [];
    relationCandidate.direction = allowedDirections.includes("BIDIRECTIONAL") && allowedDirections.length === 1 ? "BIDIRECTIONAL" : "DIRECTED";
    transitionRelation("SHOW_PREVIEW");
    rebuildRelationPreview();
    workbench.lastAction = relationCandidate.autoCommitting
      ? `正在创建${relationToolDisplayName(option.capability_ref.capability_id) ?? "关系"}。`
      : `${relationToolDisplayName(option.capability_ref.capability_id) ?? "关系"}参数待补充；提交后创建。`;
  }

  function rebuildRelationPreview() {
    const option = relationCandidate.selectedOption;
    if (!option || relationCandidate.phase !== "candidate-preview") return;
    try {
      relationCandidate.previewSpec = buildCreateRelationPreview(option, workbench.nodes, {
        duration: relationCandidate.duration.trim() || undefined,
        labels: relationCandidate.labels,
        direction: relationCandidate.direction,
        collectionCompleteness: relationCandidate.collectionCompleteness || undefined,
      });
      relationCandidate.candidateId = relationCandidate.previewSpec.candidateId;
    } catch (error) {
      relationCandidate.previewSpec = null;
      relationCandidate.candidateId = "";
      workbench.feedbackCode = error instanceof Error && "code" in error ? String(error.code) : "OPD_RELATION_PREVIEW_RENDER_SPEC_INVALID";
      block(error instanceof Error ? error.message : "关系候选预览失败。");
    }
  }

  function continueRelationEndpoints() {
    if (relationCandidate.phase !== "candidate-preview") return;
    transitionRelation("CONTINUE_ENDPOINTS");
    relationCandidate.autoCommitting = false;
    relationCandidate.options = [];
    relationCandidate.selectedOption = null;
    relationCandidate.previewSpec = null;
    relationCandidate.candidateId = "";
    workbench.lastAction = "从已选端点拖向下一个 fan 端点。";
  }

  async function confirmRelationCandidate() {
    const option = relationCandidate.selectedOption;
    if (!option || relationCandidate.phase !== "candidate-preview" || !projectId.value || !modelId.value || !workbench.activeContextId) return;
    try {
      const refreshed = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, undefined, "CREATE_FACT", relationCandidate.endpointIds);
      const current = refreshed.data.options.find((candidate) => candidate.option_id === option.option_id && candidate.enabled && sameRelationOption(candidate, option));
      if (!current) return block("关系候选已过期，请重新选择端点。");
      relationCandidate.selectedOption = current;
      rebuildRelationPreview();
      if (!await submitRelationCandidate(current)) return;
      transitionRelation("CONFIRM");
      transitionRelation("RESET");
      resetRelationCandidateFields();
    } catch (error) {
      workbench.commandFeedback = message(error);
    }
  }

  async function armControlUpdate(capabilityId?: string) {
    const relation = selectedRelation.value;
    if (!relation || isReadonly.value || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    try {
      const result = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, relation.id, "UPDATE_FACT");
      allowedCommands.value = result.data.allowed;
      controlCandidate.factId = relation.id;
      controlCandidate.options = result.data.options.filter((option) => option.command_type === "UPDATE_FACT" && option.enabled && option.base_fact_capability_ref?.capability_id === relation.capabilityId
        && (!capabilityId || option.capability_ref.capability_id === capabilityId));
      controlCandidate.phase = controlCandidate.options.length ? "choosing" : "idle";
      if (!controlCandidate.options.length) block("当前基础关系没有可提交的 Control Link。");
      else if (capabilityId) {
        const option = controlCandidate.options[0];
        if (option) chooseControlCandidate(option);
      }
      else workbench.lastAction = "请选择要附加到基础 Fact 的 Control Link。";
    } catch (error) {
      cancelControlCandidate();
      workbench.commandFeedback = message(error);
    }
  }

  function cancelControlCandidate() {
    controlCandidate.phase = "idle";
    controlCandidate.factId = "";
    controlCandidate.options = [];
    controlCandidate.selectedOption = null;
    controlCandidate.previewSpec = null;
  }

  function chooseControlCandidate(option: WorkbenchCapabilityOption) {
    const relation = selectedRelation.value;
    if (controlCandidate.phase !== "choosing" || !relation || option.base_fact_capability_ref?.capability_id !== relation.capabilityId) return;
    try {
      controlCandidate.selectedOption = option;
      controlCandidate.previewSpec = buildControlRelationPreview(relation, option, workbench.nodes);
      controlCandidate.phase = "previewing";
      rightPanel.open = true;
      workbench.lastAction = `${relationToolDisplayName(option.capability_ref.capability_id) ?? "控制关系"}注记正在预览；确认后才会更新基础 Fact。`;
    } catch (error) {
      workbench.feedbackCode = error instanceof Error && "code" in error ? String(error.code) : "OPD_RELATION_PREVIEW_RENDER_SPEC_INVALID";
      block(error instanceof Error ? error.message : "Control 候选预览失败。");
    }
  }

  async function submitControlCandidate(option: WorkbenchCapabilityOption): Promise<boolean> {
    const relation = selectedRelation.value;
    const baseCapabilityId = option.base_fact_capability_ref?.capability_id;
    if (controlCandidate.phase !== "previewing" || !relation || relation.id !== controlCandidate.factId || !baseCapabilityId || !canEdit("UPDATE_FACT")) return false;
    const modifiers = option.allowed_modifiers.map((modifier) => ({ modifier_id: modifier.modifier_id, value: modifier.value_options[0] }));
    if (modifiers.some((modifier) => !modifier.value)) {
      block("Runtime Control 候选缺少固定 Modifier 值。");
      return false;
    }
    return execute({ commandType: "UPDATE_FACT", payload: {
      fact_id: relation.id,
      expected_capability_ref: { capability_id: baseCapabilityId },
      replacement: { modifiers },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
  }

  async function confirmControlCandidate() {
    const relation = selectedRelation.value;
    const option = controlCandidate.selectedOption;
    if (!relation || !option || controlCandidate.phase !== "previewing" || !projectId.value || !modelId.value || !workbench.activeContextId) return;
    try {
      const refreshed = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, relation.id, "UPDATE_FACT");
      const current = refreshed.data.options.find((candidate) => candidate.option_id === option.option_id && candidate.enabled && sameRelationOption(candidate, option));
      if (!current) return block("Control 候选已过期，请重新打开关系目录。");
      controlCandidate.selectedOption = current;
      controlCandidate.previewSpec = buildControlRelationPreview(relation, current, workbench.nodes);
      if (await submitControlCandidate(current)) cancelControlCandidate();
    } catch (error) {
      workbench.commandFeedback = message(error);
    }
  }

  async function armStructuralUpdate(inline = false) {
    const relation = selectedRelation.value;
    if (!relation?.capabilityId?.startsWith("CAP-ISO-STRUCT-") || isReadonly.value || workbench.commandState === "submitting" || !projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId) return;
    const request = ++structuralEditRequest;
    const revision = editingIdentity.value;
    const context = workbench.activeContextId;
    try {
      const result = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, relation.id, "UPDATE_FACT");
      if (request !== structuralEditRequest || selectedRelation.value?.id !== relation.id || editingIdentity.value !== revision || workbench.activeContextId !== context) return;
      allowedCommands.value = result.data.allowed;
      const option = result.data.options.find((item) => item.command_type === "UPDATE_FACT" && item.enabled && item.capability_ref.capability_id === relation.capabilityId);
      if (!option) return block("当前结构关系没有可提交的更新候选。");
      if (inline && !option.required_fields.some((field) => field.field_id === "labels" && field.allowed_values?.length)) return;
      structuralUpdateCandidate.inline = inline;
      structuralUpdateCandidate.baseRevision = revision;
      structuralUpdateCandidate.factId = relation.id;
      structuralUpdateCandidate.option = option;
      structuralUpdateCandidate.labels = Object.fromEntries((option.required_fields.find((field) => field.field_id === "labels")?.allowed_values ?? [])
        .filter((slot) => !inline || slot !== "reverse_tag" || relation.direction === "BIDIRECTIONAL")
        .map((slot) => [slot, relation.labels?.find((label) => label.slotId === slot)?.text ?? ""]));
      structuralUpdateCandidate.collectionCompleteness = relation.collectionCompleteness === "COMPLETE" || relation.collectionCompleteness === "INCOMPLETE"
        ? relation.collectionCompleteness : "";
      structuralUpdateCandidate.direction = relation.direction === "BIDIRECTIONAL" ? "BIDIRECTIONAL" : "DIRECTED";
      structuralUpdateCandidate.phase = "editing";
      workbench.lastAction = inline ? "Enter 保存关系名称，Escape 取消。" : "编辑结构关系标签、方向或完整性。";
    } catch (error) {
      if (request !== structuralEditRequest) return;
      cancelStructuralUpdate();
      workbench.commandFeedback = message(error);
    }
  }

  function cancelStructuralUpdate() {
    structuralEditRequest++;
    structuralUpdateCandidate.phase = "idle";
    structuralUpdateCandidate.inline = false;
    structuralUpdateCandidate.baseRevision = "";
    structuralUpdateCandidate.factId = "";
    structuralUpdateCandidate.option = null;
    structuralUpdateCandidate.labels = {};
    structuralUpdateCandidate.collectionCompleteness = "";
    structuralUpdateCandidate.direction = "DIRECTED";
  }

  async function submitStructuralUpdate() {
    const relation = selectedRelation.value;
    const option = structuralUpdateCandidate.option;
    if (structuralUpdateCandidate.phase !== "editing" || !option || !relation || relation.id !== structuralUpdateCandidate.factId || !canEdit("UPDATE_FACT")) return;
    const labels = Object.entries(structuralUpdateCandidate.labels).filter(([, text]) => text.trim())
      .map(([slot_id, text]) => ({ slot_id, text: text.trim() }));
    const direction = relationDirection(option, structuralUpdateCandidate.direction);
    if (!direction) return block("Runtime 结构关系候选缺少方向约束。");
    const requiredLabels = requiredStructuralLabelSlots(option, direction);
    if (option.required_fields.some((field) => field.field_id === "labels" && field.required)
      && requiredLabels.some((slot) => !labels.some((label) => label.slot_id === slot))) {
      return block("请填写所有必填关系标签。");
    }
    if (structuralUpdateCandidate.inline) {
      // 内联编辑只替换标签，保留所有其他 Fact 字段及未编辑的标签槽。
      const replacementLabels = [
        ...(relation.labels ?? []).filter((label) => !(label.slotId in structuralUpdateCandidate.labels)).map((label) => ({ slot_id: label.slotId, text: label.text })),
        ...labels,
      ];
      const original = relation.labels ?? [];
      if (replacementLabels.length === original.length && replacementLabels.every((label) => original.some((item) => item.slotId === label.slot_id && item.text === label.text))) {
        cancelStructuralUpdate();
        return;
      }
      const request = structuralEditRequest;
      const context = workbench.activeContextId;
      const project = projectId.value!;
      const model = modelId.value!;
      try {
        const refreshed = await queryCapabilities(project, model, context, structuralUpdateCandidate.baseRevision, relation.id, "UPDATE_FACT");
        if (request !== structuralEditRequest || structuralUpdateCandidate.baseRevision !== editingIdentity.value || workbench.activeContextId !== context || projectId.value !== project || modelId.value !== model || selectedRelation.value?.id !== relation.id) return;
        const current = refreshed.data.options.find((item) => item.command_type === "UPDATE_FACT" && item.enabled && currentOption(item) && item.option_id === option.option_id && sameRelationOption(item, option)
          && JSON.stringify(item.required_fields) === JSON.stringify(option.required_fields));
        if (!current) return block("关系编辑已过期，请重新打开编辑器。");
        if (await execute({ commandType: "UPDATE_FACT", payload: { fact_id: relation.id, expected_capability_ref: { capability_id: current.capability_ref.capability_id }, replacement: { labels: replacementLabels }, capability_query_id: current.capability_query_id, selected_option_id: current.option_id } })) cancelStructuralUpdate();
      } catch (error) {
        workbench.commandFeedback = message(error);
      }
      return;
    }
    const completenessRequired = option.required_fields.some((field) => field.field_id === "collection_completeness");
    const collectionCompleteness = structuralUpdateCandidate.collectionCompleteness;
    const collectionCompletenessValue = collectionCompleteness === "COMPLETE" || collectionCompleteness === "INCOMPLETE"
      ? collectionCompleteness : undefined;
    if (completenessRequired && !collectionCompletenessValue) return block("请选择 fan 的完整性。");
    await execute({ commandType: "UPDATE_FACT", payload: {
      fact_id: relation.id,
      expected_capability_ref: { capability_id: option.capability_ref.capability_id },
      replacement: {
        direction,
        labels,
        ...(collectionCompletenessValue ? { collection_completeness: collectionCompletenessValue } : {}),
      },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelStructuralUpdate();
  }

  return { relationCandidate, controlCandidate, structuralUpdateCandidate, activateRelationCatalogItem, armRelationCreation, cancelRelationCandidate, handleRelationGesture, resolveRelationCandidates, submitRelationCandidate, chooseRelationCandidate, rebuildRelationPreview, continueRelationEndpoints, confirmRelationCandidate, armControlUpdate, cancelControlCandidate, chooseControlCandidate, submitControlCandidate, confirmControlCandidate, armStructuralUpdate, cancelStructuralUpdate, submitStructuralUpdate };
}
