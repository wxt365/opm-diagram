<template>
  <aside class="workbench-panel inspector-panel" data-testid="p03-right-panel">
    <header class="panel-heading">
      <div class="inspector-panel__title"><span>属性面板</span><strong>{{ selectionKind }}</strong></div>
      <div class="inspector-panel__heading-actions"><span v-if="!store.selectedNode" class="profile-tag">{{ store.draftToken ? `草稿 · 编辑 ${store.draftToken.edit_seq}` : store.workbench.revision }}</span><button v-if="store.rightPanel.open" class="inspector-panel__close" type="button" title="关闭属性 / Close properties" aria-label="关闭属性 / Close properties" data-testid="p03-right-panel-close" @click="closePanel"><PanelRightClose :size="17" aria-hidden="true" /></button></div>
    </header>
    <div class="inspector-panel__body">
      <section v-if="store.rightPanel.open && store.selectedNode" class="inspector-content" :data-testid="store.selectedNode.kind === 'state' ? 'p03-state-inspector' : 'p03-node-inspector'">
        <section class="inspector-section inspector-section--primary">
          <div class="inspector-section__heading"><span>基本信息</span></div>
          <ElementNameProperty
            v-if="store.selectedNode.kind !== 'state'"
            :key="`${canvasLocationKey}:${store.selectedNode.id}`"
            ref="propertyNameEditor"
            :element-id="store.selectedNode.id"
            :name="store.selectedNode.label"
            :readonly="store.isReadonly"
            :failure-message="store.workbench.commandFeedback"
            :submit-name-edit="submitName"
          />
          <form v-if="store.selectedNode.kind === 'state'" class="state-editor" @submit.prevent="finishStateEdit">
            <label class="form-field"><span>状态名称</span><input data-testid="p03-state-inspector-name" :value="store.stateEditor.name" :disabled="stateEditingDisabled" @input="emit('stateEditor', { name: ($event.target as HTMLInputElement).value })" @compositionstart="stateComposing = true" @compositionend="finishStateComposition"></label>
            <fieldset :disabled="stateEditingDisabled">
              <legend>状态角色</legend>
              <label v-for="role in stateRoles" :key="role"><input type="checkbox" :checked="store.stateEditor.roles.includes(role)" @change="toggleStateRole(role, ($event.target as HTMLInputElement).checked)">{{ role }}</label>
            </fieldset>
            <div class="inspector-actions"><button type="submit" class="button button--primary" :disabled="stateEditingDisabled || !store.stateEditor.name.trim()">保存 State</button></div>
          </form>
          <ElementNameProperty
            :key="`remark:${canvasLocationKey}:${store.selectedNode.id}`"
            ref="propertyRemarkEditor"
            field="remark"
            :element-id="store.selectedNode.id"
            :name="store.selectedNode.remark ?? ''"
            :readonly="store.isReadonly"
            :failure-message="store.workbench.commandFeedback"
            :submit-name-edit="submitRemark"
          />
          <ElementAppearanceProperty
            :node="store.selectedNode"
            :appearance="store.nodeColors?.palette[store.selectedNode.kind]"
            :saving="store.nodeColors?.saving"
            :error="store.nodeColors?.error"
            :readonly="store.isReadonly || !store.draftToken || store.saving || !!store.autoLayoutPreview || store.workbench.commandState === 'submitting' || store.selectedNode.occurrenceRole !== 'owned' || !store.nodeColors?.loaded || store.nodeColors.saving"
            @change="store.editNodeAppearance(store.selectedNode.occurrenceId, $event)"
          />
        </section>
      </section>
      <section v-else-if="store.rightPanel.open && store.selectedRelation" class="inspector-content">
        <section class="inspector-section inspector-section--primary">
          <div class="inspector-section__heading"><span>关系信息</span></div>
          <div class="form-readonly"><span>关系</span><strong>{{ store.selectedRelation.capabilityId ?? 'Consumption' }}</strong></div>
          <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedRelation.id }}</code></div>
        </section>
        <section v-if="(store.selectedRelation.endpoints?.length ?? 0) || store.selectedRelation.duration || store.selectedRelation.controlCapability" class="inspector-section inspector-section--meta">
          <div class="inspector-section__heading"><span>端点与约束</span></div>
          <div v-for="endpoint in store.selectedRelation.endpoints ?? []" :key="`${endpoint.ordinal}-${endpoint.role}`" class="form-readonly"><span>{{ endpoint.role }}</span><code>{{ endpoint.targetId }}</code></div>
          <div v-if="store.selectedRelation.duration" class="form-readonly"><span>duration</span><code>{{ store.selectedRelation.duration }}</code></div>
          <div v-if="store.selectedRelation.controlCapability" class="form-readonly"><span>Control</span><code>{{ store.selectedRelation.controlCapability }}</code></div>
        </section>
        <form v-if="store.structuralUpdateCandidate.phase === 'editing' && !store.structuralUpdateCandidate.inline" class="inspector-section state-editor" data-testid="p03-structural-update" @submit.prevent="store.submitStructuralUpdate">
          <div class="inspector-section__heading"><span>编辑结构关系</span></div>
          <div class="form-readonly"><span>关系</span><strong>{{ relationName(store.structuralUpdateCandidate.option?.capability_ref.capability_id, store.structuralUpdateCandidate.option?.display_name) }}</strong></div>
          <label v-for="(_, slot) in store.structuralUpdateCandidate.labels" :key="slot" class="form-field"><span>{{ slot }}</span><input :value="store.structuralUpdateCandidate.labels[slot]" :data-testid="`p03-structural-update-label-${slot}`" maxlength="256" @input="emit('structuralUpdateCandidate', { labels: { ...store.structuralUpdateCandidate.labels, [slot]: ($event.target as HTMLInputElement).value } })"></label>
          <label v-if="(store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values?.length ?? 0) !== 1" class="form-field"><span>direction</span><select v-model="structuralDirection"><option v-for="direction in store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values ?? []" :key="direction" :value="direction">{{ direction }}</option></select></label>
          <label v-if="store.structuralUpdateCandidate.option?.required_fields.some((field) => field.field_id === 'collection_completeness')" class="form-field"><span>完整性</span><select v-model="structuralCompleteness" data-testid="p03-structural-update-completeness"><option disabled value="">请选择</option><option value="COMPLETE">完整</option><option value="INCOMPLETE">不完整</option></select></label>
          <div class="inspector-actions"><button class="button button--secondary" type="button" @click="store.cancelStructuralUpdate">取消</button><button class="button button--primary" type="submit" :disabled="store.workbench.commandState === 'submitting'">保存</button></div>
        </form>
        <section v-else-if="store.selectedRelation.capabilityId?.startsWith('CAP-ISO-STRUCT-')" class="inspector-section">
          <div class="inspector-section__heading"><span>结构属性</span></div>
          <div v-for="label in store.selectedRelation.labels ?? []" :key="label.slotId" class="form-readonly"><span>{{ label.slotId }}</span><strong>{{ label.text }}</strong></div>
          <div v-if="store.selectedRelation.collectionCompleteness && store.selectedRelation.collectionCompleteness !== 'NOT_APPLICABLE'" class="form-readonly"><span>完整性</span><strong>{{ store.selectedRelation.collectionCompleteness === 'COMPLETE' ? '完整' : '不完整' }}</strong></div>
          <div class="inspector-actions inspector-actions--single"><button class="button button--primary" type="button" :disabled="store.isReadonly" data-testid="p03-structural-update-open" @click="store.armStructuralUpdate()">编辑结构关系</button></div>
        </section>
        <section v-else-if="store.controlCandidate.phase === 'choosing'" class="inspector-section relation-candidate" data-testid="p03-control-catalog">
          <div class="inspector-section__heading"><span>选择 Control</span></div>
          <div class="relation-candidate__options">
            <button v-for="option in store.controlCandidate.options" :key="option.option_id" class="relation-candidate__option" type="button" :data-testid="`p03-control-option-${option.capability_ref.capability_id}`" @click="store.chooseControlCandidate(option)">
              <strong>{{ relationName(option.capability_ref.capability_id, option.display_name) }}</strong><span>{{ option.capability_ref.capability_id }}</span>
            </button>
          </div>
          <div class="inspector-actions inspector-actions--single"><button class="button button--secondary" type="button" @click="store.cancelControlCandidate">取消</button></div>
        </section>
        <section v-else-if="store.controlCandidate.phase === 'previewing'" class="inspector-section relation-candidate" data-testid="p03-control-preview">
          <div class="inspector-section__heading"><span>确认 Control</span></div>
          <div class="form-readonly"><span>Control</span><strong>{{ relationName(store.controlCandidate.selectedOption?.capability_ref.capability_id, store.controlCandidate.selectedOption?.display_name) }}</strong></div>
          <p class="disabled-reason">临时 e/c 注记尚未写入基础 Fact。</p>
          <div class="inspector-actions"><button class="button button--secondary" type="button" @click="store.cancelControlCandidate">取消</button><button class="button button--primary" type="button" data-testid="p03-control-preview-confirm" @click="store.confirmControlCandidate">确认附加</button></div>
        </section>
        <section v-else class="inspector-section">
          <div class="inspector-section__heading"><span>Control</span></div>
          <div class="inspector-actions inspector-actions--single"><button class="button button--primary" type="button" :disabled="store.isReadonly" data-testid="p03-control-open" @click="store.armControlUpdate()">添加 Control</button></div>
        </section>
      </section>
      <section v-else class="inspector-content" data-testid="canvas-properties">
        <section class="inspector-section">
          <div class="inspector-section__heading"><span>基本信息</span></div>
          <div class="canvas-property-name"><span>名称</span><strong>{{ store.contexts.find(context => context.id === store.workbench.activeContextId)?.label ?? '当前画布' }}</strong></div>
        </section>
        <section class="inspector-section">
          <CanvasColorPalette inline :palette="store.nodeColors?.palette ?? {}" :loaded="!!store.nodeColors?.loaded" :saving="!!store.nodeColors?.saving" :readonly="store.isReadonly" :error="store.nodeColors?.error" @save="store.saveNodeColors" />
        </section>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PanelRightClose } from "@lucide/vue";
import ElementNameProperty from "./ElementNameProperty.vue";
import ElementAppearanceProperty from "./ElementAppearanceProperty.vue";
import CanvasColorPalette from "./CanvasColorPalette.vue";
import { relationName } from "./workbenchPresentation";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const props = defineProps<{ store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "contexts" | "saveNodeColors" | "nodeColors" | "editNodeAppearance" | "draftToken" | "saving" | "autoLayoutPreview" | "workbench" | "rightPanel" | "closeRightPanel" | "selectedNode" | "stateEditor" | "saveSelectedState" | "changeStatePresentation" | "isReadonly" | "renameElement" | "updateElementRemark" | "selectedObjectSuppressedStates" | "makeSuppressedStateExplicit" | "selectedRelation" | "structuralUpdateCandidate" | "submitStructuralUpdate" | "cancelStructuralUpdate" | "armStructuralUpdate" | "controlCandidate" | "chooseControlCandidate" | "cancelControlCandidate" | "confirmControlCandidate" | "armControlUpdate">; canvasLocationKey: number }>();
const emit = defineEmits<{
  stateEditor: [patch: Partial<typeof props.store.stateEditor>];
  structuralUpdateCandidate: [patch: Partial<typeof props.store.structuralUpdateCandidate>];
}>();
const propertyNameEditor = ref<InstanceType<typeof ElementNameProperty>>();
const propertyRemarkEditor = ref<InstanceType<typeof ElementNameProperty>>();
const stateRoles = ["INITIAL", "DEFAULT", "FINAL"] as const;
const stateSubmitting = ref(false);
const stateComposing = ref(false);
function finishStateComposition(event: CompositionEvent) {
  emit("stateEditor", { name: (event.target as HTMLInputElement).value });
  stateComposing.value = false;
}
const stateEditingDisabled = computed(() => props.store.isReadonly || props.store.saving || !!props.store.autoLayoutPreview
  || stateSubmitting.value || props.store.workbench.commandState === "submitting" || props.store.selectedNode?.occurrenceRole !== "owned");
function sameRoles(left: readonly string[], right: readonly string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
const hasPendingStateEdit = computed(() => {
  const node = props.store.selectedNode;
  return stateSubmitting.value || stateComposing.value || (node?.kind === "state" && (props.store.stateEditor.name.trim() !== node.label
    || !sameRoles(props.store.stateEditor.roles, node.stateRoles ?? [])));
});
let stateSubmission: Promise<boolean> | undefined;
function finishStateEdit(): Promise<boolean> {
  if (stateComposing.value) return Promise.resolve(false);
  if (stateSubmission) return stateSubmission;
  const node = props.store.selectedNode;
  if (node?.kind !== "state") return Promise.resolve(true);
  const name = props.store.stateEditor.name.trim(), roles = [...props.store.stateEditor.roles];
  if (name === node.label && sameRoles(roles, node.stateRoles ?? [])) return Promise.resolve(true);
  if (!name || stateEditingDisabled.value) return Promise.resolve(false);
  const id = node.id;
  stateSubmitting.value = true;
  stateSubmission = (async () => {
    try {
      await props.store.saveSelectedState();
      const saved = props.store.selectedNode;
      return saved?.id === id && saved.label === name && sameRoles(saved.stateRoles ?? [], roles);
    } catch { return false; }
    finally { stateSubmitting.value = false; stateSubmission = undefined; }
  })();
  return stateSubmission;
}
function toggleStateRole(role: typeof stateRoles[number], checked: boolean) {
  const roles = new Set(props.store.stateEditor.roles);
  if (checked) roles.add(role); else roles.delete(role);
  emit("stateEditor", { roles: [...roles] });
}
let pendingEdit = Promise.resolve(true);
function enqueue(edit: () => Promise<boolean>) { pendingEdit = pendingEdit.then(edit, edit); return pendingEdit; }
function submitName(id: string, value: string) { return enqueue(() => props.store.renameElement(id, value)); }
function submitRemark(id: string, value: string) { return enqueue(() => props.store.updateElementRemark(id, value)); }
const selectionKind = computed(() => {
  if (props.store.selectedRelation) return "关系";
  switch (props.store.selectedNode?.kind) {
    case "object": return "对象";
    case "process": return "过程";
    case "attribute": return "属性";
    case "operation": return "操作";
    case "state": return "状态";
    default: return "画布属性";
  }
});
async function finishNameEdit() {
  if (!await finishStateEdit()) return false;
  if (propertyNameEditor.value && !await propertyNameEditor.value.finishNameEdit()) return false;
  return propertyRemarkEditor.value?.finishNameEdit() ?? true;
}
async function closePanel() { if (await finishNameEdit()) props.store.closeRightPanel(); }
defineExpose({ finishNameEdit, hasPendingStateEdit });
const structuralDirection = computed({ get: () => props.store.structuralUpdateCandidate.direction, set: (value) => emit("structuralUpdateCandidate", { direction: value }) });
const structuralCompleteness = computed({ get: () => props.store.structuralUpdateCandidate.collectionCompleteness, set: (value) => emit("structuralUpdateCandidate", { collectionCompleteness: value }) });
</script>

<style scoped>
.inspector-panel { background: #fff; }
.canvas-property-name { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: baseline; gap: 8px; }
.canvas-property-name span { color: #7b8898; font-size: 11px; }
.canvas-property-name strong { color: #354b63; font-size: 12px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
.panel-heading { min-height: 58px; padding: 10px 16px; background: #f8fafc; border-bottom-color: #e7edf3; }
.inspector-panel__title > span { margin-bottom: 5px; color: #8090a2; font-size: 11px; font-weight: 400; letter-spacing: .5px; }
.inspector-panel__title strong { color: #203247; font-size: 17px; font-weight: 650; }
.inspector-panel__close { border: 1px solid #e2e9f0; border-radius: 7px; background: #fff; }
.inspector-panel__close:hover { background: #edf5ff; color: #1769c2; border-color: #bed7f3; }
.inspector-section { padding: 14px 16px; }
.inspector-section__heading, :deep(.element-colors .inspector-section__heading) { margin-bottom: 8px; color: #24394f; font-size: 12px; font-weight: 650; letter-spacing: .3px; }
:deep(.element-colors .inspector-section__heading) { margin-bottom: 0; }
:deep(.element-name-property) { padding: 0; margin-bottom: 10px; border: 0; }
:deep(.element-name-property__row) { flex-direction: column; align-items: stretch; gap: 4px; }
:deep(.element-name-property__row span) { flex: none; padding: 0; color: #6a7b8e; font-size: 12px; }
:deep(.element-name-property__row input), :deep(.element-name-property__row textarea) { box-sizing: border-box; width: 100%; border-radius: 7px; border-color: #dfe7ef; padding: 8px 10px; background: #fbfcfe; transition: border-color .15s, box-shadow .15s; }
:deep(.element-name-property__row input) { height: 32px; padding-top: 5px; padding-bottom: 5px; }
:deep(.element-name-property__row textarea) { height: 76px; min-height: 76px; line-height: 1.5; }
:deep(.element-name-property__row input:focus-visible), :deep(.element-name-property__row textarea:focus-visible) { background: #fff; border-color: #80b4ec; box-shadow: 0 0 0 3px #eaf3fe; }
</style>
