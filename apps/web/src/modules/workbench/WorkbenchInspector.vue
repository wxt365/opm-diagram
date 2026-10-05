<template>
  <aside class="workbench-panel inspector-panel" data-testid="p03-right-panel">
    <header class="panel-heading">
      <div class="inspector-panel__title"><span>属性面板</span><strong>{{ selectionKind }}</strong></div>
      <div class="inspector-panel__heading-actions"><span class="profile-tag">{{ store.draftToken ? `草稿 · 编辑 ${store.draftToken.edit_seq}` : store.workbench.revision }}</span><button v-if="store.rightPanel.open" class="inspector-panel__close" type="button" title="关闭属性 / Close properties" aria-label="关闭属性 / Close properties" data-testid="p03-right-panel-close" @click="store.closeRightPanel"><PanelRightClose :size="17" aria-hidden="true" /></button></div>
    </header>
    <div class="inspector-panel__body">
      <section v-if="store.rightPanel.open && store.selectedNode?.kind === 'state'" class="inspector-content" data-testid="p03-state-inspector">
        <section class="inspector-section inspector-section--primary">
          <div class="inspector-section__heading"><span>基本信息</span></div>
          <label class="form-field"><span>名称</span><input v-model="stateName" data-testid="p03-state-inspector-name" maxlength="256"></label>
        </section>
        <section class="inspector-section">
          <div class="inspector-section__heading"><span>状态角色</span></div>
          <fieldset class="state-role-group"><legend class="sr-only">状态角色</legend><label v-for="role in stateRoles" :key="role"><input v-model="stateRolesValue" type="checkbox" :value="role"><span>{{ role }}</span></label></fieldset>
          <div class="inspector-actions inspector-actions--single"><button class="button button--primary" type="button" @click="store.saveSelectedState">保存 State</button></div>
        </section>
        <section class="inspector-section">
          <div class="inspector-section__heading"><span>显示方式</span></div>
          <div class="state-presentation-actions"><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.explicitness === 'SUPPRESSED' ? 'STATE_EXPLICIT' : 'STATE_SUPPRESS')">{{ store.selectedNode.explicitness === 'SUPPRESSED' ? '显式' : '抑制' }}</button><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.foldState === 'FOLDED' ? 'UNFOLD' : 'FOLD')">{{ store.selectedNode.foldState === 'FOLDED' ? '展开' : '折叠' }}</button></div>
        </section>
        <section class="inspector-section inspector-section--meta">
          <div class="inspector-section__heading"><span>标识信息</span></div>
          <div class="form-readonly"><span>State ID</span><code>{{ store.selectedNode.id }}</code></div>
          <div class="form-readonly"><span>Owner</span><code>{{ store.selectedNode.ownerId }}</code></div>
        </section>
      </section>
      <section v-else-if="store.rightPanel.open && store.selectedNode" class="inspector-content">
        <section class="inspector-section inspector-section--primary">
          <div class="inspector-section__heading"><span>基本信息</span></div>
          <ElementNameProperty
            :key="`${canvasLocationKey}:${store.selectedNode.id}`"
            ref="propertyNameEditor"
            :element-id="store.selectedNode.id"
            :name="store.selectedNode.label"
            :readonly="store.isReadonly"
            :failure-message="store.workbench.commandFeedback"
            :submit-name-edit="store.renameElement"
          />
        </section>
        <section class="inspector-section inspector-section--meta">
          <div class="inspector-section__heading"><span>标识信息</span></div>
          <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedNode.id }}</code></div>
          <div class="form-readonly"><span>Occurrence</span><code>{{ store.selectedNode.occurrenceId }}</code></div>
        </section>
        <section v-if="store.selectedObjectSuppressedStates.length" class="inspector-section" data-testid="p03-suppressed-states">
          <div class="inspector-section__heading"><span>已抑制 State</span></div>
          <div class="state-presentation-actions"><button v-for="state in store.selectedObjectSuppressedStates" :key="state.state_id" class="button button--secondary" type="button" :data-testid="`p03-suppressed-state-${state.state_id}`" @click="store.makeSuppressedStateExplicit(state.state_id)">显式 {{ state.name_or_value }}</button></div>
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
      <div v-else class="empty-inspector"><p>从画布选择元素或关系。</p></div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PanelRightClose } from "@lucide/vue";
import ElementNameProperty from "./ElementNameProperty.vue";
import { relationName } from "./workbenchPresentation";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const props = defineProps<{ store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "draftToken" | "workbench" | "rightPanel" | "closeRightPanel" | "selectedNode" | "stateEditor" | "saveSelectedState" | "changeStatePresentation" | "isReadonly" | "renameElement" | "selectedObjectSuppressedStates" | "makeSuppressedStateExplicit" | "selectedRelation" | "structuralUpdateCandidate" | "submitStructuralUpdate" | "cancelStructuralUpdate" | "armStructuralUpdate" | "controlCandidate" | "chooseControlCandidate" | "cancelControlCandidate" | "confirmControlCandidate" | "armControlUpdate">; canvasLocationKey: number }>();
const emit = defineEmits<{
  stateEditor: [patch: Partial<typeof props.store.stateEditor>];
  structuralUpdateCandidate: [patch: Partial<typeof props.store.structuralUpdateCandidate>];
}>();
const propertyNameEditor = ref<InstanceType<typeof ElementNameProperty>>();
const stateRoles = ["INITIAL", "DEFAULT", "FINAL"] as const;
const selectionKind = computed(() => {
  if (props.store.selectedRelation) return "关系";
  switch (props.store.selectedNode?.kind) {
    case "object": return "对象";
    case "process": return "过程";
    case "attribute": return "属性";
    case "operation": return "操作";
    case "state": return "状态";
    default: return "未选择";
  }
});
defineExpose({ finishNameEdit: () => propertyNameEditor.value?.finishNameEdit() ?? Promise.resolve(true) });
const stateName = computed({ get: () => props.store.stateEditor.name, set: (value) => emit("stateEditor", { name: value }) });
const stateRolesValue = computed({ get: () => props.store.stateEditor.roles, set: (value) => emit("stateEditor", { roles: value }) });
const structuralDirection = computed({ get: () => props.store.structuralUpdateCandidate.direction, set: (value) => emit("structuralUpdateCandidate", { direction: value }) });
const structuralCompleteness = computed({ get: () => props.store.structuralUpdateCandidate.collectionCompleteness, set: (value) => emit("structuralUpdateCandidate", { collectionCompleteness: value }) });
</script>
