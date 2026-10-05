import { reactive, type Ref, type ComputedRef } from "vue";
import type { localRuntimeApi, SuppressedStateWire } from "@/shared/api/localRuntimeApi";
import type { OpdNode } from "@/shared/types/modeling";
import type { ApiEdtStateRole } from "@/shared/api/generated/apiEdtContract";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import type { WorkbenchState } from "./workbenchState";
import { message } from "./runtimeError";

interface ConstructEditingDependencies {
  workbench: WorkbenchState;
  projectId: Ref<string>;
  modelId: Ref<string>;
  isReadonly: ComputedRef<boolean>;
  selectedNode: ComputedRef<OpdNode | undefined>;
  selectedObjectSuppressedStates: ComputedRef<SuppressedStateWire[]>;
  stateCreateOption: Ref<WorkbenchCapabilityOption | null>;
  getLoadSequence: () => number;
  isDraftSession: () => boolean;
  queryCapabilities: (project: string, model: string, context: string, revision: string, selection?: string, intent?: string, endpoints?: string[]) => Promise<{ data: { allowed: string[]; options: WorkbenchCapabilityOption[] } }>;
  execute: (command: Parameters<typeof localRuntimeApi.executeP0Command>[4]) => Promise<boolean>;
  block: (reason: string) => void;
}

/** State 编辑及删除候选；异步有效性依赖会话所有者提供的当前序号。 */
export function createConstructEditing({ workbench, projectId, modelId, isReadonly, selectedNode, selectedObjectSuppressedStates, stateCreateOption, queryCapabilities, execute, block, getLoadSequence, isDraftSession }: ConstructEditingDependencies) {
  const constructActions = reactive({ open: false, selectionId: "", anchor: { x: 16, y: 16 }, options: [] as WorkbenchCapabilityOption[], submitting: false });
  const stateCandidate = reactive({ phase: "idle" as "idle" | "placing" | "editing", ownerId: "", name: "", roles: ["INITIAL"] as ApiEdtStateRole[], x: 0, y: 0 });
  const stateEditor = reactive({ name: "", roles: [] as ApiEdtStateRole[] });
  let constructActionsRequestId = 0;

  function armStateCreation() {
    const owner = selectedNode.value;
    if (isReadonly.value) return block("当前修订为只读版本，不能创建 State。");
    if (!owner || (owner.kind !== "object" && owner.kind !== "attribute" && owner.kind !== "operation")) return block("请先选择一个 Object 或 Feature，再创建 State。");
    if (!stateCreateOption.value?.enabled) return block("当前 Object 不支持创建 State。");
    stateCandidate.phase = "placing";
    stateCandidate.ownerId = owner.id;
    stateCandidate.name = "";
    stateCandidate.roles = ["INITIAL"];
    workbench.lastAction = "请在已选择 Object 内点击 State 位置。";
  }

  function placeState(ownerId: string) {
    const owner = workbench.nodes.find((node) => node.id === ownerId);
    if (stateCandidate.phase !== "placing" || !owner || ownerId !== stateCandidate.ownerId) return;
    const stateCount = workbench.nodes.filter((node) => node.kind === "state" && node.ownerId === ownerId).length;
    stateCandidate.phase = "editing";
    stateCandidate.x = owner.x + 36;
    stateCandidate.y = owner.y + 32 + stateCount * 34;
    workbench.lastAction = "请输入 State 名称并选择角色。";
  }

  function cancelStateCandidate() {
    stateCandidate.phase = "idle";
    stateCandidate.ownerId = "";
  }

  async function submitStateCandidate() {
    const option = stateCreateOption.value;
    if (!option || stateCandidate.phase !== "editing") return;
    if (!stateCandidate.name.trim()) return block("State 名称不能为空。");
    await execute({ commandType: "CREATE_STATE", payload: {
      context_id: workbench.activeContextId,
      owner_ref: { target_kind: selectedNode.value?.kind === "attribute" || selectedNode.value?.kind === "operation" ? "FEATURE" : "ELEMENT", target_id: stateCandidate.ownerId },
      capability_ref: option.capability_ref,
      name_or_value: stateCandidate.name.trim(),
      state_roles: stateCandidate.roles,
      occurrence: { ownership: "OWNED", construct_role: selectedNode.value?.kind === "attribute" || selectedNode.value?.kind === "operation" ? "FEATURE_STATE_NODE" : "STATE_NODE" },
      layout: { x: stateCandidate.x, y: stateCandidate.y },
      capability_query_id: option.capability_query_id,
      selected_option_id: option.option_id,
    } });
    if (workbench.commandState === "idle") cancelStateCandidate();
  }

  async function saveSelectedState() {
    const state = selectedNode.value;
    if (!state || state.kind !== "state" || !state.ownerId) return;
    if (isDraftSession()) {
      const sequence = getLoadSequence();
      const name = stateEditor.name.trim(), roles = [...stateEditor.roles];
      try {
        const result = await queryCapabilities(projectId.value, modelId.value, workbench.activeContextId, workbench.revision, state.id, "UPDATE_STATE");
        if (sequence !== getLoadSequence() || selectedNode.value?.id !== state.id) return;
        const option = result.data.options.find(item => item.command_type === "UPDATE_STATE" && item.enabled);
        if (!option) return block("当前 State 没有更新候选。");
        const owner = workbench.nodes.find(node => node.id === state.ownerId);
        await execute({ commandType: "UPDATE_STATE", payload: { state_id: state.id, expected_owner_ref: { target_kind: owner?.kind === "attribute" || owner?.kind === "operation" ? "FEATURE" : "ELEMENT", target_id: state.ownerId }, changes: { name_or_value: name, state_roles: roles }, capability_query_id: option.capability_query_id, selected_option_id: option.option_id } });
      } catch (error) {
        if (sequence === getLoadSequence() && selectedNode.value?.id === state.id) block(message(error));
      }
      return;
    }
    await execute({ commandType: "UPDATE_STATE", payload: {
      state_id: state.id,
      expected_owner_ref: { target_kind: "ELEMENT", target_id: state.ownerId },
      changes: { name_or_value: stateEditor.name.trim(), state_roles: stateEditor.roles },
      capability_query_id: stateCreateOption.value?.capability_query_id ?? "query.state.update",
      selected_option_id: stateCreateOption.value?.option_id ?? "option.state.update",
    } });
  }

  async function changeStatePresentation(commandType: "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD") {
    const state = selectedNode.value;
    if (!state || state.kind !== "state") return;
    await execute({ commandType, payload: { context_id: workbench.activeContextId, state_id: state.id } });
  }

  async function makeSuppressedStateExplicit(stateId: string) {
    const state = selectedObjectSuppressedStates.value.find((item) => item.state_id === stateId);
    if (!state) return block("该抑制 State 不属于当前选择的 Object。");
    await execute({ commandType: "STATE_EXPLICIT", payload: { context_id: workbench.activeContextId, state_id: state.state_id } });
  }

  async function requestConstructActions(
    selectionId: string,
    anchor: { x: number; y: number } = { x: 16, y: 16 },
    activation: "menu" | "direct" = "menu",
  ) {
    if (isReadonly.value) return;
    if (!projectId.value || !modelId.value || !workbench.revision || !workbench.activeContextId || constructActions.submitting) return;
    const requestId = ++constructActionsRequestId;
    constructActions.selectionId = selectionId;
    constructActions.anchor = Number.isFinite(anchor.x) && Number.isFinite(anchor.y) ? anchor : { x: 16, y: 16 };
    constructActions.options = [];
    constructActions.open = activation === "menu";
    try {
      const relation = workbench.relations.find((item) => item.occurrenceId === selectionId);
      const controlRemoval = relation?.controlCapability;
      const capabilities = await queryCapabilities(
        projectId.value,
        modelId.value,
        workbench.activeContextId,
        workbench.revision,
        controlRemoval ? relation.id : selectionId,
        controlRemoval ? "UPDATE_FACT" : "DELETE_CONSTRUCT",
      );
      if (requestId !== constructActionsRequestId) return;
      constructActions.options = controlRemoval
        ? capabilities.data.options.filter((option) => option.command_type === "UPDATE_FACT" && option.display_name === "移除 Control")
        : capabilities.data.options.filter((option) => option.command_type === "DELETE_CONSTRUCT");
      if (activation === "direct") {
        const option = preferredDirectConstructAction(constructActions.options);
        if (!option) {
          const reason = constructActions.options.flatMap((item) => item.reason_codes)[0] ?? "当前构造不能删除。";
          return block(reason);
        }
        await executeConstructAction(option);
        return;
      }
      constructActions.open = true;
    } catch (error) { block(message(error)); }
  }

  async function chooseConstructDelete(option: WorkbenchCapabilityOption) {
    if (!option.enabled) return block(option.reason_codes.join(", ") || "当前构造不能删除。");
    await executeConstructAction(option);
  }

  function cancelConstructDelete() {
    constructActionsRequestId++;
    constructActions.open = false;
  }

  async function executeConstructAction(option: WorkbenchCapabilityOption) {
    constructActions.open = false;
    constructActions.submitting = true;
    const relation = workbench.relations.find((item) => item.occurrenceId === constructActions.selectionId);
    const committed = option.command_type === "UPDATE_FACT"
      ? relation && option.base_fact_capability_ref
        ? await execute({ commandType: "UPDATE_FACT", payload: {
          fact_id: relation.id,
          expected_capability_ref: option.base_fact_capability_ref,
          replacement: { modifiers: [] },
          capability_query_id: option.capability_query_id,
          selected_option_id: option.option_id,
        } })
        : false
      : option.impact_token && option.delete_mode && option.delete_target
        ? await execute({ commandType: "DELETE_CONSTRUCT", payload: { selection_id: constructActions.selectionId, construct_kind: option.delete_target.kind, construct_id: option.delete_target.id, delete_mode: option.delete_mode, impact_token: option.impact_token } })
        : false;
    constructActions.submitting = false;
    if (committed) cancelConstructDelete();
  }

  function preferredDirectConstructAction(options: readonly WorkbenchCapabilityOption[]) {
    const enabled = options.filter((option) => option.enabled);
    const controlRemoval = enabled.find((option) => option.command_type === "UPDATE_FACT");
    if (controlRemoval) return controlRemoval;
    return (["DELETE_TARGET", "CASCADE", "REMOVE_OCCURRENCE"] as const)
      .map((mode) => enabled.find((option) => option.delete_mode === mode))
      .find((option) => option !== undefined);
  }

  return { constructActions, stateCandidate, stateEditor, armStateCreation, placeState, cancelStateCandidate, submitStateCandidate, saveSelectedState, changeStatePresentation, makeSuppressedStateExplicit, requestConstructActions, chooseConstructDelete, cancelConstructDelete };
}
