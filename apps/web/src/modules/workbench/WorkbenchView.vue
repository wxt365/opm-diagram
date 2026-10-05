<template>
  <section class="workbench" :class="{ 'workbench--bottom-collapsed': !store.workbench.bottomPanelExpanded }" data-testid="p03-workbench">
    <header class="workbench-header">
      <div class="workbench-header__context">
        <button class="back-link" type="button" @click="router.push(`/projects/${projectId}`)">项目 / {{ store.projectName }}</button>
        <strong>{{ store.modelName }}</strong>
        <span class="profile-tag">{{ store.profileLabel }}</span>
      </div>
      <div class="workbench-header__status">
        <span class="revision-tag" :title="`最近版本 / Latest revision: ${store.workbench.revision || '-'}`" data-testid="hs-draft-identity">{{ store.draftToken && store.workbench.locationMode === 'HEAD' ? `活动草稿 · 编辑 ${store.draftToken.edit_seq}` : `${store.workbench.locationMode === 'HEAD' ? '草稿' : '固定版本'} ${store.workbench.revision || '-'}` }}</span>
        <span v-if="store.workbench.resourceState === 'ready' && store.isReadonly" class="readonly-tag" role="status" title="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." aria-label="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." data-testid="p03-readonly-banner"><Lock :size="12" aria-hidden="true" />只读</span>
        <select aria-label="打开版本" data-testid="p03-version-select" :value="store.workbench.locationMode === 'HEAD' ? 'head' : store.workbench.revision" :disabled="store.workbench.resourceState !== 'ready' || store.workbench.commandState === 'submitting'" @change="openVersion(($event.target as HTMLSelectElement).value)">
          <option value="head">活动草稿</option>
          <option v-for="revision in store.revisions" :key="revision.id" :value="revision.id">{{ revision.kind === 'BASELINE' ? 'Baseline' : 'Revision' }} {{ revision.sequence }}</option>
        </select>
        <button v-if="store.workbench.locationMode === 'EXACT'" class="button button--secondary" type="button" data-testid="p03-return-head" @click="openVersion('head')">返回活动草稿</button>
        <button class="button button--secondary" type="button" data-testid="p03-copy-permalink" :disabled="store.workbench.resourceState !== 'ready' || store.saving" @mousedown.prevent @click="copyPermalink">复制永久链接</button>
        <span class="save-tag" role="status" data-testid="hs-save-state">{{ store.saveLabel }}</span>
        <button v-if="store.draftToken && (store.pendingDelivery || store.saveError)" class="button button--secondary" type="button" data-testid="hs-retry-delivery" @click="store.retryDraftDelivery">重新加载 / 恢复待确认</button>
        <button class="button button--secondary" type="button" data-testid="p03-run-validation" :disabled="store.workbench.resourceState !== 'ready'" @click="store.runValidation">运行校验</button>
      </div>
    </header>

    <div class="workbench-main">
      <div class="workbench-notices">
        <p v-if="store.workbench.resourceState === 'loading'" class="command-feedback" role="status">正在读取 Local Runtime 工作台会话。</p>
        <p v-if="store.workbench.resourceState === 'error'" class="command-feedback" role="status" data-testid="p03-command-feedback">{{ store.workbench.commandFeedback }}<code v-if="store.workbench.feedbackCode" data-testid="p03-command-feedback-code">{{ store.workbench.feedbackCode }}</code></p>
      </div>

      <div class="workbench-grid" :class="{ 'workbench-grid--inspector-open': inspectorDockVisible }">
        <aside class="workbench-panel navigator-panel">
          <div class="panel-tabs"><span>Context</span><strong>{{ store.contexts.length }}</strong></div>
          <div class="context-tree">
            <button v-for="context in store.contexts" :key="context.id" class="context-tree__item" :class="{ 'is-current': context.id === store.workbench.activeContextId }" type="button" :data-testid="`p03-context-${context.id}`" @click="openContext(context.id)">
              {{ context.label }}
            </button>
          </div>
          <p class="disabled-reason">{{ store.draftToken ? '已有 Context 可切换；暂不支持创建或删除 Context。' : 'P0 仅支持根系统图；细化和视图由后续包实现。' }}</p>
        </aside>

        <section class="editor-panel">
          <div class="editor-toolbar" role="toolbar" aria-label="OPM 画布工具 / OPM canvas tools" data-testid="p03-canvas-toolchain">
            <div class="tool-group" aria-label="画布工具">
              <button v-if="store.draftToken" class="tool-button tool-button--icon" type="button" title="保存 / Save (Ctrl/Cmd+S)" aria-label="保存 / Save (Ctrl/Cmd+S)" :disabled="store.isReadonly || store.saving" data-testid="hs-save" @mousedown.prevent @click="requestSave"><Save :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': canvasInteractionTool === 'select' }" type="button" title="选择 / Select" aria-label="选择 / Select" :aria-pressed="canvasInteractionTool === 'select'" data-testid="p03-tool-select" @click="setCanvasInteractionTool('select')"><MousePointer2 :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': canvasInteractionTool === 'pan' }" type="button" title="平移画布 / Pan canvas" aria-label="平移画布 / Pan canvas" :aria-pressed="canvasInteractionTool === 'pan'" data-testid="p03-tool-pan" @click="setCanvasInteractionTool('pan')"><Hand :size="18" aria-hidden="true" /></button>
            </div>
            <span class="editor-toolbar__separator" aria-hidden="true" />
            <div class="tool-group" aria-label="P0 建模命令">
              <button class="tool-button tool-button--icon" type="button" title="创建对象 / Create Object" aria-label="创建对象 / Create Object" :disabled="store.isReadonly" data-testid="p03-tool-object" @click="store.addElement('OBJECT')"><ElementToolSymbol kind="object" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建过程 / Create Process" aria-label="创建过程 / Create Process" :disabled="store.isReadonly" data-testid="p03-tool-process" @click="store.addElement('PROCESS')"><ElementToolSymbol kind="process" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建属性 / Create Attribute" aria-label="创建属性 / Create Attribute" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-attribute" @click="store.addFeature('ATTRIBUTE')"><ElementToolSymbol kind="attribute" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建操作 / Create Operation" aria-label="创建操作 / Create Operation" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-operation" @click="store.addFeature('OPERATION')"><ElementToolSymbol kind="operation" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.stateCandidate.phase === 'placing' }" type="button" title="创建状态 / Create State" aria-label="创建状态 / Create State" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'attribute' && store.selectedNode.kind !== 'operation') || !store.stateCreateOption?.enabled" data-testid="p03-tool-state" @click="armStateCreation"><ElementToolSymbol kind="state" /></button>
            </div>
            <span class="editor-toolbar__separator" aria-hidden="true" />
            <RelationToolPalette
              :families="store.relationCatalogFamilies"
              :items="store.relationCatalog.items"
              :readonly="store.isReadonly"
              :active-capability-id="activeRelationCapabilityId"
              @activate="activateRelationCatalogItem"
            />
            <span class="editor-toolbar__separator" aria-hidden="true" />
            <div class="tool-group tool-group--end" aria-label="视口控制">
              <button class="tool-button tool-button--icon" type="button" title="缩小视图 / Zoom out" aria-label="缩小视图 / Zoom out" data-testid="p03-zoom-out" @click="store.setViewportZoom(store.workbench.zoom - 10)"><ZoomOut :size="18" aria-hidden="true" /></button>
              <output data-testid="p03-zoom-output">{{ store.workbench.zoom }}%</output>
              <button class="tool-button tool-button--icon" type="button" title="放大视图 / Zoom in" aria-label="放大视图 / Zoom in" data-testid="p03-zoom-in" @click="store.setViewportZoom(store.workbench.zoom + 10)"><ZoomIn :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="恢复 100% / Reset zoom to 100%" aria-label="恢复 100% / Reset zoom to 100%" data-testid="p03-zoom-fit" @click="store.setViewportZoom(100)"><Maximize :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.rightPanel.open }" type="button" :title="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" :aria-label="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" :disabled="!store.workbench.selectedId" data-testid="p03-right-panel-open" @click="toggleProperties"><PanelRightOpen :size="18" aria-hidden="true" /></button>
            </div>
          </div>
          <div ref="canvasSurface" class="canvas-surface">
            <div class="canvas-frame">
              <OpdCanvas ref="canvasEditor" :key="canvasLocationKey" :readonly="store.isReadonly" :nodes="store.workbench.nodes" :relations="store.workbench.relations" :selected-id="store.workbench.selectedId" :zoom="store.workbench.zoom" :interaction-tool="canvasInteractionTool" :state-placement-owner-id="store.stateCandidate.phase === 'placing' ? store.stateCandidate.ownerId : undefined" :relation-gesture-phase="store.relationCandidate.phase" :relation-preview="relationPreview" :relation-editor-target="relationEditorTarget" :highlighted-finding-target-id="store.highlightedFindingTargetId || undefined" :begin-name-edit="store.beginElementNameEdit" :submit-name-edit="store.renameElement" @select="store.selectConstruct" @move="store.moveElement" @place-state="store.placeState" @relation-intent="store.handleRelationGesture" @construct-actions-menu-requested="requestConstructActions" @relation-editor-anchor="relationEditorAnchor = $event" @relation-label-edit-requested="openRelationLabelEditor" />
              <div class="canvas-state">{{ store.workbench.lastAction }}</div>
            </div>
            <p
              v-if="store.workbench.resourceState !== 'error' && store.workbench.commandFeedback"
              class="editor-command-feedback"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="p03-command-feedback"
            >
              <span>{{ store.workbench.commandFeedback }}</span>
              <code v-if="store.workbench.feedbackCode" data-testid="p03-command-feedback-code">{{ store.workbench.feedbackCode }}</code>
            </p>
            <template v-if="store.constructActions.open">
              <button class="construct-context-menu__dismiss" type="button" aria-label="关闭构造操作菜单" @click="store.cancelConstructDelete" />
              <section class="construct-context-menu" role="menu" aria-label="构造操作" :style="constructMenuStyle" data-testid="p03-construct-actions-menu">
                <button class="construct-context-menu__item construct-context-menu__item--neutral" role="menuitem" type="button" data-testid="p03-construct-open-properties" @click="openConstructProperties">
                  <PanelRightOpen :size="15" aria-hidden="true" />
                  <span>打开属性</span>
                </button>
                <span v-if="store.constructActions.options.length" class="construct-context-menu__separator" aria-hidden="true" />
                <template v-for="option in store.constructActions.options" :key="option.option_id">
                  <button class="construct-context-menu__item" role="menuitem" type="button" :disabled="!option.enabled" data-testid="p03-construct-delete-action" @click="store.chooseConstructDelete(option)">
                    <Trash2 :size="15" aria-hidden="true" />
                    <span>{{ deleteActionLabel(option) }}</span>
                  </button>
                  <span v-if="option.enabled && option.impact_summary" class="construct-context-menu__reason">影响 {{ option.impact_summary.items?.length ?? 0 }} 项</span>
                  <span v-if="!option.enabled && option.reason_codes.length" class="construct-context-menu__reason">{{ option.reason_codes.join(", ") }}</span>
                </template>
              </section>
            </template>
            <section
              v-if="store.relationCandidate.phase === 'candidate-preview' && store.relationCandidate.selectedOption && !store.relationCandidate.autoCommitting"
              class="relation-parameter-popover"
              :class="{ 'relation-parameter-popover--label': Object.keys(store.relationCandidate.labels).length > 0 }"
              :style="relationEditorStyle"
              data-testid="p03-relation-preview"
            >
              <form ref="relationParameterEditor" data-testid="p03-relation-candidate" @submit.prevent="submitRelationParameterEditor" @keydown.enter.exact.stop.prevent="submitRelationParameterEditor" @keydown.esc.stop.prevent="cancelRelationEditor" @compositionstart="relationComposing = true" @compositionend="relationComposing = false">
                <header class="relation-parameter-popover__header">
                  <strong v-if="!Object.keys(store.relationCandidate.labels).length">关系参数</strong>
                  <button class="relation-parameter-popover__close" type="button" :disabled="relationSubmitting" title="取消关系 / Cancel relation" aria-label="取消关系 / Cancel relation" data-testid="p03-relation-preview-cancel" @click="cancelRelationEditor"><X :size="15" aria-hidden="true" /></button>
                </header>
                <label v-if="store.relationCandidate.selectedOption.required_fields.some((field) => field.field_id === 'duration')" class="form-field"><span>duration</span><input v-model="store.relationCandidate.duration" data-testid="p03-relation-duration" placeholder="PT5M" required @input="store.rebuildRelationPreview"></label>
                <label v-for="(_, slot) in store.relationCandidate.labels" :key="slot" class="form-field"><span>{{ relationLabelTitle(slot, store.relationCandidate.direction) }}</span><input v-model="store.relationCandidate.labels[slot]" :data-testid="`p03-structural-label-${slot}`" :disabled="relationSubmitting" :aria-label="relationLabelTitle(slot, store.relationCandidate.direction)" :title="relationLabelTitle(slot, store.relationCandidate.direction) + ' · Enter 保存 / Save · Escape 取消 / Cancel'" :placeholder="slot === 'reverse_tag' ? '反向关系名称' : '关系名称'" maxlength="256" :required="slot !== 'reverse_tag' || store.relationCandidate.direction === 'BIDIRECTIONAL'" pattern=".*\S.*" @input="store.rebuildRelationPreview"></label>
                <label v-if="(store.relationCandidate.selectedOption.required_fields.find((field) => field.field_id === 'direction')?.allowed_values?.length ?? 0) > 1" class="form-field"><span>direction</span><select v-model="store.relationCandidate.direction" required @change="updateRelationSelectParameter"><option v-for="direction in store.relationCandidate.selectedOption.required_fields.find((field) => field.field_id === 'direction')?.allowed_values ?? []" :key="direction" :value="direction">{{ direction }}</option></select></label>
                <label v-if="store.relationCandidate.selectedOption.required_fields.some((field) => field.field_id === 'collection_completeness')" class="form-field"><span>完整性</span><select v-model="store.relationCandidate.collectionCompleteness" data-testid="p03-structural-completeness" required @change="updateRelationSelectParameter"><option disabled value="">请选择</option><option value="COMPLETE">完整</option><option value="INCOMPLETE">不完整</option></select></label>
              </form>
            </section>
            <section v-if="inlineRelationEditing" class="relation-parameter-popover relation-parameter-popover--label" :style="relationEditorStyle" data-testid="p03-relation-label-editor">
              <form ref="relationLabelEditor" @submit.prevent="submitRelationLabelEditor" @keydown.enter.exact.stop.prevent="submitRelationLabelEditor" @keydown.esc.stop.prevent="cancelRelationEditor" @compositionstart="relationComposing = true" @compositionend="relationComposing = false">
                <header class="relation-parameter-popover__header"><button class="relation-parameter-popover__close" type="button" :disabled="relationSubmitting" title="取消编辑 / Cancel editing" aria-label="取消编辑 / Cancel editing" @click="cancelRelationEditor"><X :size="15" aria-hidden="true" /></button></header>
                <label v-for="(_, slot) in store.structuralUpdateCandidate.labels" :key="slot" class="form-field"><span>{{ relationLabelTitle(slot, store.structuralUpdateCandidate.direction) }}</span><input v-model="store.structuralUpdateCandidate.labels[slot]" :data-testid="`p03-relation-rename-${slot}`" :aria-label="relationLabelTitle(slot, store.structuralUpdateCandidate.direction)" :title="relationLabelTitle(slot, store.structuralUpdateCandidate.direction) + ' · Enter 保存 / Save · Escape 取消 / Cancel'" :placeholder="slot === 'reverse_tag' ? '反向关系名称' : '关系名称'" :disabled="relationSubmitting" maxlength="256" :required="slot !== 'reverse_tag' || store.structuralUpdateCandidate.direction === 'BIDIRECTIONAL'" pattern=".*\S.*"></label>
              </form>
            </section>
          </div>
        </section>

        <WorkbenchInspector v-if="inspectorDockVisible" ref="propertyNameEditor" :store="store" :canvas-location-key="canvasLocationKey" @state-candidate="Object.assign(store.stateCandidate, $event)" @state-editor="Object.assign(store.stateEditor, $event)" @structural-update-candidate="Object.assign(store.structuralUpdateCandidate, $event)" />
      </div>
    </div>

    <WorkbenchBottomPanel :store="store" @toggle="store.workbench.bottomPanelExpanded = !store.workbench.bottomPanelExpanded" @activate-tab="activateBottomTab" />

    <div
      v-if="!store.draftToken"
      class="capture-view-state"
      data-testid="p03-capture-view-state"
      :data-read-revision="store.captureViewState.readRevision"
      :data-selection-kind="store.captureViewState.selectionKind"
      :data-selection-target-id="store.captureViewState.selectionTargetId"
      :data-right-open="String(store.captureViewState.rightOpen)"
      :data-right-mode="store.captureViewState.rightMode"
      :data-bottom-open="String(store.captureViewState.bottomOpen)"
      :data-bottom-mode="store.captureViewState.bottomMode"
      :data-relation-candidate-state="store.captureViewState.relationCandidateState"
      :data-relation-candidate-capability-id="store.captureViewState.relationCandidateCapabilityId"
      :data-relation-candidate-id="store.captureViewState.relationCandidateId"
      :data-relation-candidate-source-target-id="store.captureViewState.relationCandidateSourceTargetId"
      :data-relation-candidate-target-target-id="store.captureViewState.relationCandidateTargetTargetId"
      :data-catalog-open="String(store.captureViewState.catalogOpen)"
      :data-catalog-search="store.captureViewState.catalogSearch"
      :data-catalog-procedural-count="store.captureViewState.catalogProceduralCount"
      :data-catalog-control-count="store.captureViewState.catalogControlCount"
      :data-catalog-structural-count="store.captureViewState.catalogStructuralCount"
      :data-finding-selected-id="store.captureViewState.findingSelectedId"
      :data-finding-highlighted-target-id="store.captureViewState.findingHighlightedTargetId"
      :data-feedback-current-code="store.captureViewState.feedbackCurrentCode"
      aria-hidden="true"
    >
      <span v-for="code in store.captureViewState.historyCodes" :key="code" :data-opm-history-code="code" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Hand, Lock, Maximize, MousePointer2, PanelRightOpen, Save, Trash2, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useWorkbenchNavigation } from "./useWorkbenchNavigation";
import OpdCanvas from "@/modules/workbench/OpdCanvas.vue";
import WorkbenchBottomPanel from "./WorkbenchBottomPanel.vue";
import WorkbenchInspector from "./WorkbenchInspector.vue";
import ElementToolSymbol from "@/modules/workbench/ElementToolSymbol.vue";
import RelationToolPalette from "@/modules/workbench/RelationToolPalette.vue";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const route = useRoute();
const router = useRouter();
const store = useWorkbenchRuntimeStore();
const canvasSurface = ref<HTMLDivElement>();
const canvasEditor = ref<InstanceType<typeof OpdCanvas>>();
const propertyNameEditor = ref<InstanceType<typeof WorkbenchInspector>>();
async function finishInputs(): Promise<boolean> {
  if (relationComposing.value || relationSubmitting.value) return false;
  if (canvasEditor.value && !await canvasEditor.value.finishNameEdit()) return false;
  if (propertyNameEditor.value && !await propertyNameEditor.value.finishNameEdit()) return false;
  if (inlineRelationEditing.value) {
    await submitRelationLabelEditor();
    if (inlineRelationEditing.value) return false;
  }
  if (store.relationCandidate.phase === "candidate-preview") {
    await submitRelationParameterEditor();
    if (store.relationCandidate.phase === "candidate-preview") return false;
  }
  return true;
}
const canvasLocationKey = ref(0);
const relationParameterEditor = ref<HTMLFormElement>();
const relationLabelEditor = ref<HTMLFormElement>();
const relationEditorAnchor = ref<{ clientX: number; clientY: number } | null>(null);
const relationComposing = ref(false);
const relationSubmitting = ref(false);
const inlineRelationEditing = computed(() => store.structuralUpdateCandidate.phase === "editing" && store.structuralUpdateCandidate.inline);
const relationEditorTarget = computed(() => {
  if (inlineRelationEditing.value) return { cellId: store.structuralUpdateCandidate.factId, ratio: 0.35 };
  const preview = store.relationCandidate.previewSpec;
  return preview ? { cellId: preview.primaryCellId, ratio: Object.keys(store.relationCandidate.labels).length ? 0.35 : 0.5 } : undefined;
});
const relationEditorStyle = computed(() => {
  const anchor = relationEditorAnchor.value;
  const bounds = canvasSurface.value?.getBoundingClientRect();
  if (!anchor || !bounds) return { visibility: "hidden" as const };
  const labelOnly = inlineRelationEditing.value || Object.keys(store.relationCandidate.labels).length > 0;
  const width = Math.max(0, Math.min(labelOnly ? 120 : 224, bounds.width - 32));
  const editor = inlineRelationEditing.value ? relationLabelEditor.value : relationParameterEditor.value;
  const height = editor?.parentElement?.getBoundingClientRect().height ?? 76;
  return {
    left: `${Math.max(8, Math.min(anchor.clientX - bounds.left - width / 2, bounds.width - width - 8))}px`,
    top: `${Math.max(8, Math.min(anchor.clientY - bounds.top - (labelOnly ? 12 : 48), bounds.height - height - 8))}px`,
    width: `${width}px`, right: "auto",
  };
});
const canvasInteractionTool = ref<"select" | "pan">("select");
const projectId = computed(() => typeof route.params.projectId === "string" ? route.params.projectId : "");
const modelId = computed(() => typeof route.params.modelId === "string" ? route.params.modelId : "");
const relationPreview = computed(() => store.relationCandidate.previewSpec ?? store.controlCandidate.previewSpec ?? undefined);
const activeRelationCapabilityId = computed(() => store.relationCandidate.catalogItem?.capability_id ?? store.controlCandidate.selectedOption?.capability_ref.capability_id);
const inspectorDockVisible = computed(() => store.rightPanel.open
  || store.stateCandidate.phase === "editing"
  || store.controlCandidate.phase !== "idle"
  || (store.structuralUpdateCandidate.phase === "editing" && !store.structuralUpdateCandidate.inline));
const constructMenuStyle = computed(() => ({ left: `${store.constructActions.anchor.x}px`, top: `${store.constructActions.anchor.y}px` }));

function activateBottomTab(tab: typeof store.workbench.bottomTab) {
  if (store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab) store.workbench.bottomPanelExpanded = false;
  else store.setBottomTab(tab);
}

function requestConstructActions(selectionId: string, anchor?: { clientX: number; clientY: number }, activation: "menu" | "direct" = "menu") {
  const bounds = canvasSurface.value?.getBoundingClientRect();
  const menuWidth = 208;
  const menuHeight = 184;
  const gutter = 8;
  const localX = anchor && bounds ? anchor.clientX - bounds.left : gutter;
  const localY = anchor && bounds ? anchor.clientY - bounds.top : gutter;
  const x = Math.max(gutter, Math.min(localX, Math.max(gutter, (bounds?.width ?? menuWidth + gutter * 2) - menuWidth - gutter)));
  const y = Math.max(gutter, Math.min(localY, Math.max(gutter, (bounds?.height ?? menuHeight + gutter * 2) - menuHeight - gutter)));
  void store.requestConstructActions(selectionId, { x, y }, activation);
}

function openConstructProperties() {
  store.cancelConstructDelete();
  store.openRightPanel();
}

function toggleProperties() {
  if (store.rightPanel.open) store.closeRightPanel();
  else store.openRightPanel();
}

function setCanvasInteractionTool(tool: "select" | "pan") {
  if (relationSubmitting.value) return;
  if (inlineRelationEditing.value) store.cancelStructuralUpdate();
  if (tool === "pan") {
    store.cancelRelationCandidate();
    store.cancelStateCandidate();
  }
  canvasInteractionTool.value = tool;
}

function activateRelationCatalogItem(item: Parameters<typeof store.activateRelationCatalogItem>[0], intent: Parameters<typeof store.activateRelationCatalogItem>[1]) {
  if (relationSubmitting.value) return;
  store.cancelStructuralUpdate();
  canvasInteractionTool.value = "select";
  store.activateRelationCatalogItem(item, intent);
}

function armStateCreation() {
  canvasInteractionTool.value = "select";
  store.armStateCreation();
}

function deleteActionLabel(option: WorkbenchCapabilityOption) {
  if (option.command_type === "UPDATE_FACT") return "移除 Control";
  if (option.delete_mode === "REMOVE_OCCURRENCE") return "从当前 OPD 移除";
  if (option.delete_mode === "CASCADE") return "删除全部受影响内容";
  const target = option.delete_target?.kind;
  if (target === "STATE") return "删除状态";
  if (target === "FACT") return "删除关系";
  if (target === "FEATURE") return store.selectedNode?.kind === "operation" ? "删除操作" : "删除属性";
  if (target === "ELEMENT") return store.selectedNode?.kind === "process" ? "删除过程" : "删除对象";
  return "删除构造";
}

function updateRelationSelectParameter() {
  store.rebuildRelationPreview();
  const option = store.relationCandidate.selectedOption;
  if (!option) return;
  const hasTextParameter = option.required_fields.some((field) => field.field_id === "duration" || field.field_id === "labels");
  if (!hasTextParameter) void store.confirmRelationCandidate();
}

async function submitRelationParameterEditor(event?: Event) {
  if (relationComposing.value || (event instanceof KeyboardEvent && event.isComposing) || relationSubmitting.value || !relationParameterEditor.value?.reportValidity()) return;
  relationSubmitting.value = true;
  try { await store.confirmRelationCandidate(); } finally { relationSubmitting.value = false; }
}

function relationLabelTitle(slot: string, direction: string) {
  return slot === "reverse_tag" ? "反向名称 / Reverse name" : direction === "BIDIRECTIONAL" ? "正向名称 / Forward name" : "关系名称 / Relation name";
}

async function openRelationLabelEditor(relationId: string) {
  if (relationSubmitting.value || store.workbench.commandState === "submitting") return;
  store.cancelRelationCandidate();
  await store.selectConstruct(relationId);
  if (store.workbench.selectedId !== relationId) return;
  await store.armStructuralUpdate(true);
}

function cancelRelationEditor() {
  if (relationSubmitting.value) return;
  store.cancelRelationCandidate();
  store.cancelStructuralUpdate();
}

async function submitRelationLabelEditor(event?: Event) {
  if (relationComposing.value || (event instanceof KeyboardEvent && event.isComposing) || relationSubmitting.value || !relationLabelEditor.value?.reportValidity()) return;
  relationSubmitting.value = true;
  try { await store.submitStructuralUpdate(); } finally { relationSubmitting.value = false; }
}

watch(inlineRelationEditing, async (editing) => {
  relationComposing.value = false;
  if (!editing) return;
  await nextTick();
  const input = relationLabelEditor.value?.querySelector("input");
  input?.focus();
  input?.select();
});

// 等待 X6 的路径首次可观测后再聚焦，避免输入框仍隐藏时丢失焦点。
watch(() => Boolean(relationEditorAnchor.value), async (visible) => {
  if (!visible) return;
  await nextTick();
  const input = (inlineRelationEditing.value ? relationLabelEditor.value : relationParameterEditor.value)?.querySelector<HTMLInputElement>("input");
  input?.focus();
  if (inlineRelationEditing.value) input?.select();
});

watch(() => [projectId.value, modelId.value, store.workbench.selectedId, store.workbench.activeContextId], () => {
  store.cancelStructuralUpdate();
});
watch(() => store.editingIdentity, () => {
  if (!relationSubmitting.value) store.cancelStructuralUpdate();
});

const { requestSave, openVersion, openContext, copyPermalink } = useWorkbenchNavigation({ store, route, router, finishInputs, projectId, modelId, canvasLocationKey, canvasInteractionTool });

watch(() => store.relationCandidate.phase, async (phase) => {
  if (phase !== "candidate-preview" || store.relationCandidate.autoCommitting) return;
  relationComposing.value = false;
  await nextTick();
  relationParameterEditor.value?.querySelector<HTMLElement>("input, select")?.focus();
});

</script>
