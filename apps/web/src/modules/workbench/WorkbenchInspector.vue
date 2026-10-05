<template>
  <aside class="workbench-panel inspector-panel" data-testid="p03-right-panel">
    <div class="panel-heading"><div><span>选择与属性</span><strong>{{ selectionKind }}</strong></div><div class="inspector-panel__heading-actions"><span class="profile-tag">{{ store.draftToken ? `草稿 · 编辑 ${store.draftToken.edit_seq}` : store.workbench.revision }}</span><button v-if="store.rightPanel.open" class="inspector-panel__close" type="button" title="关闭属性 / Close properties" aria-label="关闭属性 / Close properties" data-testid="p03-right-panel-close" @click="store.closeRightPanel"><PanelRightClose :size="17" aria-hidden="true" /></button></div></div>
    <form v-if="store.stateCandidate.phase === 'editing'" class="state-editor" data-testid="p03-state-candidate" @submit.prevent="store.submitStateCandidate">
      <div class="form-readonly"><span>Owner</span><code>{{ store.stateCandidate.ownerId }}</code></div>
      <label class="form-field"><span>State 名称</span><input v-model="candidateName" data-testid="p03-state-name" maxlength="256" autofocus></label>
      <fieldset class="state-role-group"><legend>角色</legend><label v-for="role in stateRoles" :key="role"><input v-model="candidateRoles" type="checkbox" :value="role">{{ role }}</label></fieldset>
      <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelStateCandidate">取消</button><button class="button" type="submit" :disabled="store.workbench.commandState === 'submitting'">创建</button></div>
    </form>
    <section v-else-if="store.rightPanel.open && store.selectedNode?.kind === 'state'" data-testid="p03-state-inspector">
      <div class="form-readonly"><span>State ID</span><code>{{ store.selectedNode.id }}</code></div>
      <div class="form-readonly"><span>Owner</span><code>{{ store.selectedNode.ownerId }}</code></div>
      <label class="form-field"><span>名称</span><input v-model="stateName" data-testid="p03-state-inspector-name" maxlength="256"></label>
      <fieldset class="state-role-group"><legend>角色</legend><label v-for="role in stateRoles" :key="role"><input v-model="stateRolesValue" type="checkbox" :value="role">{{ role }}</label></fieldset>
      <div class="state-editor__actions"><button class="button" type="button" @click="store.saveSelectedState">保存 State</button></div>
      <div class="state-presentation-actions"><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.explicitness === 'SUPPRESSED' ? 'STATE_EXPLICIT' : 'STATE_SUPPRESS')">{{ store.selectedNode.explicitness === 'SUPPRESSED' ? '显式' : '抑制' }}</button><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.foldState === 'FOLDED' ? 'UNFOLD' : 'FOLD')">{{ store.selectedNode.foldState === 'FOLDED' ? '展开' : '折叠' }}</button></div>
    </section>
    <template v-else-if="store.rightPanel.open && store.selectedNode">
      <ElementNameProperty
        v-if="store.selectedNode.kind === 'object' || store.selectedNode.kind === 'process'"
        :key="`${canvasLocationKey}:${store.selectedNode.id}`"
        ref="propertyNameEditor"
        :element-id="store.selectedNode.id"
        :name="store.selectedNode.label"
        :readonly="store.isReadonly"
        :failure-message="store.workbench.commandFeedback"
        :submit-name-edit="store.renameElement"
      />
      <div v-else class="form-readonly"><span>名称</span><strong>{{ store.selectedNode.label }}</strong></div>
      <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedNode.id }}</code></div>
      <div class="form-readonly"><span>Occurrence</span><code>{{ store.selectedNode.occurrenceId }}</code></div>
      <section v-if="store.selectedObjectSuppressedStates.length" class="state-presentation-actions" data-testid="p03-suppressed-states">
        <button v-for="state in store.selectedObjectSuppressedStates" :key="state.state_id" class="button button--secondary" type="button" :data-testid="`p03-suppressed-state-${state.state_id}`" @click="store.makeSuppressedStateExplicit(state.state_id)">显式 {{ state.name_or_value }}</button>
      </section>
      <p v-if="store.selectedNode.kind === 'attribute' || store.selectedNode.kind === 'operation'" class="disabled-reason">此类元素暂不支持名称编辑。</p>
    </template>
    <template v-else-if="store.rightPanel.open && store.selectedRelation">
      <div class="form-readonly"><span>关系</span><strong>{{ store.selectedRelation.capabilityId ?? 'Consumption' }}</strong></div>
      <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedRelation.id }}</code></div>
      <div v-for="endpoint in store.selectedRelation.endpoints ?? []" :key="`${endpoint.ordinal}-${endpoint.role}`" class="form-readonly"><span>{{ endpoint.role }}</span><code>{{ endpoint.targetId }}</code></div>
      <div v-if="store.selectedRelation.duration" class="form-readonly"><span>duration</span><code>{{ store.selectedRelation.duration }}</code></div>
      <div v-if="store.selectedRelation.controlCapability" class="form-readonly"><span>Control</span><code>{{ store.selectedRelation.controlCapability }}</code></div>
      <form v-if="store.structuralUpdateCandidate.phase === 'editing' && !store.structuralUpdateCandidate.inline" class="state-editor" data-testid="p03-structural-update" @submit.prevent="store.submitStructuralUpdate">
        <div class="form-readonly"><span>关系</span><strong>{{ relationName(store.structuralUpdateCandidate.option?.capability_ref.capability_id, store.structuralUpdateCandidate.option?.display_name) }}</strong></div>
        <label v-for="(_, slot) in store.structuralUpdateCandidate.labels" :key="slot" class="form-field"><span>{{ slot }}</span><input :value="store.structuralUpdateCandidate.labels[slot]" :data-testid="`p03-structural-update-label-${slot}`" maxlength="256" @input="emit('structuralUpdateCandidate', { labels: { ...store.structuralUpdateCandidate.labels, [slot]: ($event.target as HTMLInputElement).value } })"></label>
        <label v-if="(store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values?.length ?? 0) !== 1" class="form-field"><span>direction</span><select v-model="structuralDirection"><option v-for="direction in store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values ?? []" :key="direction" :value="direction">{{ direction }}</option></select></label>
        <label v-if="store.structuralUpdateCandidate.option?.required_fields.some((field) => field.field_id === 'collection_completeness')" class="form-field"><span>完整性</span><select v-model="structuralCompleteness" data-testid="p03-structural-update-completeness"><option disabled value="">请选择</option><option value="COMPLETE">完整</option><option value="INCOMPLETE">不完整</option></select></label>
        <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelStructuralUpdate">取消</button><button class="button" type="submit" :disabled="store.workbench.commandState === 'submitting'">保存</button></div>
      </form>
      <template v-else-if="store.selectedRelation.capabilityId?.startsWith('CAP-ISO-STRUCT-')">
        <div v-for="label in store.selectedRelation.labels ?? []" :key="label.slotId" class="form-readonly"><span>{{ label.slotId }}</span><strong>{{ label.text }}</strong></div>
        <div v-if="store.selectedRelation.collectionCompleteness && store.selectedRelation.collectionCompleteness !== 'NOT_APPLICABLE'" class="form-readonly"><span>完整性</span><strong>{{ store.selectedRelation.collectionCompleteness === 'COMPLETE' ? '完整' : '不完整' }}</strong></div>
        <button class="button" type="button" :disabled="store.isReadonly" data-testid="p03-structural-update-open" @click="store.armStructuralUpdate()">编辑结构关系</button>
      </template>
      <template v-else>
        <section v-if="store.controlCandidate.phase === 'choosing'" class="relation-candidate" data-testid="p03-control-catalog">
          <div class="relation-candidate__options">
            <button v-for="option in store.controlCandidate.options" :key="option.option_id" class="relation-candidate__option" type="button" :data-testid="`p03-control-option-${option.capability_ref.capability_id}`" @click="store.chooseControlCandidate(option)">
              <strong>{{ relationName(option.capability_ref.capability_id, option.display_name) }}</strong><span>{{ option.capability_ref.capability_id }}</span>
            </button>
          </div>
          <button class="button button--secondary" type="button" @click="store.cancelControlCandidate">取消</button>
        </section>
        <section v-else-if="store.controlCandidate.phase === 'previewing'" class="relation-candidate" data-testid="p03-control-preview">
          <div class="form-readonly"><span>Control</span><strong>{{ relationName(store.controlCandidate.selectedOption?.capability_ref.capability_id, store.controlCandidate.selectedOption?.display_name) }}</strong></div>
          <p class="disabled-reason">临时 e/c 注记尚未写入基础 Fact。</p>
          <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelControlCandidate">取消</button><button class="button" type="button" data-testid="p03-control-preview-confirm" @click="store.confirmControlCandidate">确认附加</button></div>
        </section>
        <button v-else class="button" type="button" :disabled="store.isReadonly" data-testid="p03-control-open" @click="store.armControlUpdate()">添加 Control</button>
      </template>
    </template>
    <p v-else class="empty-inspector">从画布选择元素或关系。</p>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PanelRightClose } from "@lucide/vue";
import ElementNameProperty from "./ElementNameProperty.vue";
import { relationName } from "./workbenchPresentation";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const props = defineProps<{ store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "draftToken" | "workbench" | "rightPanel" | "closeRightPanel" | "stateCandidate" | "submitStateCandidate" | "cancelStateCandidate" | "selectedNode" | "stateEditor" | "saveSelectedState" | "changeStatePresentation" | "isReadonly" | "renameElement" | "selectedObjectSuppressedStates" | "makeSuppressedStateExplicit" | "selectedRelation" | "structuralUpdateCandidate" | "submitStructuralUpdate" | "cancelStructuralUpdate" | "armStructuralUpdate" | "controlCandidate" | "chooseControlCandidate" | "cancelControlCandidate" | "confirmControlCandidate" | "armControlUpdate">; canvasLocationKey: number }>();
const emit = defineEmits<{
  stateCandidate: [patch: Partial<typeof props.store.stateCandidate>];
  stateEditor: [patch: Partial<typeof props.store.stateEditor>];
  structuralUpdateCandidate: [patch: Partial<typeof props.store.structuralUpdateCandidate>];
}>();
const propertyNameEditor = ref<InstanceType<typeof ElementNameProperty>>();
const stateRoles = ["INITIAL", "DEFAULT", "FINAL"] as const;
const selectionKind = computed(() => props.store.selectedRelation ? "关系" : props.store.selectedNode?.kind === "process" ? "过程" : props.store.selectedNode?.kind === "state" ? "状态" : props.store.selectedNode ? "对象" : "未选择");
defineExpose({ finishNameEdit: () => propertyNameEditor.value?.finishNameEdit() ?? Promise.resolve(true) });
const candidateName = computed({ get: () => props.store.stateCandidate.name, set: (value) => emit("stateCandidate", { name: value }) });
const candidateRoles = computed({ get: () => props.store.stateCandidate.roles, set: (value) => emit("stateCandidate", { roles: value }) });
const stateName = computed({ get: () => props.store.stateEditor.name, set: (value) => emit("stateEditor", { name: value }) });
const stateRolesValue = computed({ get: () => props.store.stateEditor.roles, set: (value) => emit("stateEditor", { roles: value }) });
const structuralDirection = computed({ get: () => props.store.structuralUpdateCandidate.direction, set: (value) => emit("structuralUpdateCandidate", { direction: value }) });
const structuralCompleteness = computed({ get: () => props.store.structuralUpdateCandidate.collectionCompleteness, set: (value) => emit("structuralUpdateCandidate", { collectionCompleteness: value }) });
</script>
