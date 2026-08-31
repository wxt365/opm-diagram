<template>
  <section class="workbench" data-testid="p03-workbench">
    <header class="workbench-header">
      <div class="workbench-header__context">
        <button class="back-link" type="button" @click="router.push(`/projects/${projectId}`)">项目 / {{ store.projectName }}</button>
        <strong>{{ store.modelName }}</strong>
        <span class="profile-tag">{{ store.profileLabel }}</span>
      </div>
      <div class="workbench-header__status">
        <span class="revision-tag">草稿 {{ store.workbench.revision || "-" }}</span>
        <span class="save-tag">{{ store.workbench.autosaveState === "saved" ? "已保存" : "保存失败" }}</span>
        <button class="button button--secondary" type="button" data-testid="p03-run-validation" :disabled="store.workbench.resourceState !== 'ready'" @click="store.runValidation">运行校验</button>
      </div>
    </header>

    <div class="workbench-main">
      <div class="workbench-notices">
        <p v-if="store.workbench.resourceState === 'loading'" class="command-feedback" role="status">正在读取 Local Runtime 工作台会话。</p>
        <p v-if="store.workbench.resourceState === 'error' || store.workbench.commandFeedback" class="command-feedback" role="status">{{ store.workbench.commandFeedback }}</p>
        <div v-if="store.isReadonly" class="readonly-banner" data-testid="p03-readonly-banner">当前修订只读，语义写入已禁用。</div>
      </div>

      <div class="workbench-grid">
        <aside class="workbench-panel navigator-panel">
          <div class="panel-tabs"><span>Context</span><strong>{{ store.contexts.length }}</strong></div>
          <div class="context-tree">
            <button v-for="context in store.contexts" :key="context.id" class="context-tree__item" :class="{ 'is-current': context.id === store.workbench.activeContextId }" type="button" :data-testid="`p03-context-${context.id}`" @click="store.selectContext(context.id)">
              {{ context.label }}
            </button>
          </div>
          <p class="disabled-reason">P0 仅支持根系统图；细化和视图由后续包实现。</p>
        </aside>

        <section class="editor-panel">
          <div class="editor-toolbar" data-testid="p03-canvas-toolchain">
            <div class="tool-group" aria-label="画布工具">
              <button class="tool-button tool-button--icon is-active" type="button" title="选择" aria-label="选择" data-testid="p03-tool-select"><MousePointer2 :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="平移画布" aria-label="平移画布" data-testid="p03-tool-pan"><Hand :size="18" aria-hidden="true" /></button>
            </div>
            <div class="tool-group" aria-label="P0 建模命令">
              <button class="tool-button tool-button--icon" type="button" title="创建 Object" aria-label="创建 Object" :disabled="store.isReadonly" data-testid="p03-tool-object" @click="store.addElement('OBJECT')"><Box :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建 Process" aria-label="创建 Process" :disabled="store.isReadonly" data-testid="p03-tool-process" @click="store.addElement('PROCESS')"><CircleDashed :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建 Attribute" aria-label="创建 Attribute" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-attribute" @click="store.addFeature('ATTRIBUTE')"><ListTree :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建 Operation" aria-label="创建 Operation" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-operation" @click="store.addFeature('OPERATION')"><Cog :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建 Consumption" aria-label="创建 Consumption" :disabled="store.isReadonly" data-testid="p03-tool-consumption" @click="store.addConsumption"><Workflow :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.relationCandidate.phase !== 'idle' }" type="button" title="创建过程关系" aria-label="创建过程关系" :disabled="store.isReadonly || !store.selectedNode" data-testid="p03-tool-procedural-relation" @click="store.armRelationCreation"><GitFork :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.relationCandidate.phase !== 'idle' }" type="button" title="创建结构关系" aria-label="创建结构关系" :disabled="store.isReadonly || !store.selectedNode" data-testid="p03-tool-structural-relation" @click="store.armRelationCreation"><Network :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.stateCandidate.phase === 'placing' }" type="button" title="创建 State" aria-label="创建 State" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'attribute' && store.selectedNode.kind !== 'operation') || !store.stateCreateOption?.enabled" data-testid="p03-tool-state" @click="store.armStateCreation"><CircleDotDashed :size="18" aria-hidden="true" /></button>
            </div>
            <div class="tool-group tool-group--end" aria-label="视口控制">
              <button class="tool-button tool-button--icon" type="button" title="缩小视图" aria-label="缩小视图" data-testid="p03-zoom-out" @click="store.setViewportZoom(store.workbench.zoom - 10)"><ZoomOut :size="18" aria-hidden="true" /></button>
              <output data-testid="p03-zoom-output">{{ store.workbench.zoom }}%</output>
              <button class="tool-button tool-button--icon" type="button" title="放大视图" aria-label="放大视图" data-testid="p03-zoom-in" @click="store.setViewportZoom(store.workbench.zoom + 10)"><ZoomIn :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" type="button" title="适配画布" aria-label="适配画布" data-testid="p03-zoom-fit" @click="store.setViewportZoom(100)"><Maximize :size="18" aria-hidden="true" /></button>
            </div>
          </div>
          <div class="canvas-frame">
            <OpdCanvas :nodes="store.workbench.nodes" :relations="store.workbench.relations" :selected-id="store.workbench.selectedId" :zoom="store.workbench.zoom" :state-placement-owner-id="store.stateCandidate.phase === 'placing' ? store.stateCandidate.ownerId : undefined" @select="store.selectConstruct" @place-state="store.placeState" />
            <div class="canvas-state">{{ store.workbench.lastAction }}</div>
          </div>
        </section>

        <aside class="workbench-panel inspector-panel">
          <div class="panel-heading"><div><span>选择与属性</span><strong>{{ selectionKind }}</strong></div><span class="profile-tag">{{ store.workbench.revision }}</span></div>
          <section v-if="store.relationCandidate.phase === 'selecting-target'" class="relation-candidate" data-testid="p03-relation-target">
            <div class="form-readonly"><span>已选端点</span><code>{{ store.relationCandidate.endpointIds.join(' -> ') }}</code></div>
            <p class="disabled-reason">可继续在画布选择端点；Self-invocation 可重复选择同一 Process。</p>
            <button class="button" type="button" :disabled="store.relationCandidate.endpointIds.length < 2" data-testid="p03-relation-resolve" @click="store.resolveRelationCandidates">查看可用关系</button>
            <button class="button button--secondary" type="button" @click="store.cancelRelationCandidate">取消</button>
          </section>
          <section v-else-if="store.relationCandidate.phase === 'choosing'" class="relation-candidate" data-testid="p03-relation-catalog">
            <div class="form-readonly"><span>端点</span><code>{{ store.relationCandidate.sourceId }} -> {{ store.relationCandidate.targetId }}</code></div>
            <template v-if="!store.relationCandidate.selectedOption">
              <label v-if="store.relationCandidate.options.some((option) => option.required_fields.some((field) => field.field_id === 'duration' && field.required))" class="form-field"><span>duration</span><input v-model="store.relationCandidate.duration" data-testid="p03-relation-duration" placeholder="PT5M"></label>
              <div class="relation-candidate__options">
                <button v-for="option in store.relationCandidate.options" :key="option.option_id" class="relation-candidate__option" type="button" :data-testid="`p03-relation-option-${option.capability_ref.capability_id}`" @click="store.chooseRelationCandidate(option)">
                  <strong>{{ option.display_name }}</strong><span>{{ option.normalized_endpoints.map((endpoint) => endpoint.role).join(' -> ') }}</span>
                </button>
              </div>
            </template>
            <form v-else class="state-editor" data-testid="p03-structural-candidate" @submit.prevent="store.submitRelationCandidate(store.relationCandidate.selectedOption)">
              <div class="form-readonly"><span>关系</span><strong>{{ store.relationCandidate.selectedOption.display_name }}</strong></div>
              <label v-for="(_, slot) in store.relationCandidate.labels" :key="slot" class="form-field"><span>{{ slot }}</span><input v-model="store.relationCandidate.labels[slot]" :data-testid="`p03-structural-label-${slot}`" maxlength="256"></label>
              <label v-if="(store.relationCandidate.selectedOption.required_fields.find((field) => field.field_id === 'direction')?.allowed_values?.length ?? 0) !== 1" class="form-field"><span>direction</span><select v-model="store.relationCandidate.direction"><option v-for="direction in store.relationCandidate.selectedOption.required_fields.find((field) => field.field_id === 'direction')?.allowed_values ?? []" :key="direction" :value="direction">{{ direction }}</option></select></label>
              <label v-if="store.relationCandidate.selectedOption.required_fields.some((field) => field.field_id === 'collection_completeness')" class="form-field"><span>完整性</span><select v-model="store.relationCandidate.collectionCompleteness" data-testid="p03-structural-completeness"><option disabled value="">请选择</option><option value="COMPLETE">完整</option><option value="INCOMPLETE">不完整</option></select></label>
              <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelRelationCandidate">取消</button><button class="button" type="submit" :disabled="store.workbench.commandState === 'submitting'">创建</button></div>
            </form>
            <button class="button button--secondary" type="button" @click="store.cancelRelationCandidate">取消</button>
          </section>
          <form v-else-if="store.stateCandidate.phase === 'editing'" class="state-editor" data-testid="p03-state-candidate" @submit.prevent="store.submitStateCandidate">
            <div class="form-readonly"><span>Owner</span><code>{{ store.stateCandidate.ownerId }}</code></div>
            <label class="form-field"><span>State 名称</span><input v-model="store.stateCandidate.name" data-testid="p03-state-name" maxlength="256" autofocus></label>
            <fieldset class="state-role-group"><legend>角色</legend><label v-for="role in stateRoles" :key="role"><input v-model="store.stateCandidate.roles" type="checkbox" :value="role">{{ role }}</label></fieldset>
            <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelStateCandidate">取消</button><button class="button" type="submit" :disabled="store.workbench.commandState === 'submitting'">创建</button></div>
          </form>
          <section v-else-if="store.selectedNode?.kind === 'state'" data-testid="p03-state-inspector">
            <div class="form-readonly"><span>State ID</span><code>{{ store.selectedNode.id }}</code></div>
            <div class="form-readonly"><span>Owner</span><code>{{ store.selectedNode.ownerId }}</code></div>
            <label class="form-field"><span>名称</span><input v-model="store.stateEditor.name" data-testid="p03-state-inspector-name" maxlength="256"></label>
            <fieldset class="state-role-group"><legend>角色</legend><label v-for="role in stateRoles" :key="role"><input v-model="store.stateEditor.roles" type="checkbox" :value="role">{{ role }}</label></fieldset>
            <div class="state-editor__actions"><button class="button" type="button" @click="store.saveSelectedState">保存 State</button></div>
            <div class="state-presentation-actions"><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.explicitness === 'SUPPRESSED' ? 'STATE_EXPLICIT' : 'STATE_SUPPRESS')">{{ store.selectedNode.explicitness === 'SUPPRESSED' ? '显式' : '抑制' }}</button><button class="button button--secondary" type="button" @click="store.changeStatePresentation(store.selectedNode.foldState === 'FOLDED' ? 'UNFOLD' : 'FOLD')">{{ store.selectedNode.foldState === 'FOLDED' ? '展开' : '折叠' }}</button></div>
            <div v-if="store.stateDeleteOption" class="impact-callout" data-testid="p03-state-delete-impact"><strong>删除影响</strong><span>构造 {{ store.stateDeleteOption.impact_summary?.affected_construct_count ?? 0 }} · Context {{ store.stateDeleteOption.impact_summary?.affected_context_count ?? 0 }} · 文本 {{ store.stateDeleteOption.impact_summary?.affected_sentence_count ?? 0 }}</span><button class="button button--danger" type="button" :disabled="!store.stateDeleteOption.enabled" @click="store.deleteSelectedState">{{ store.stateDeleteOption.enabled ? '删除 State' : 'State 被 Fact 引用，不能删除' }}</button></div>
          </section>
          <template v-else-if="store.selectedNode">
            <div class="form-readonly"><span>名称</span><strong>{{ store.selectedNode.label }}</strong></div>
            <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedNode.id }}</code></div>
            <div class="form-readonly"><span>Occurrence</span><code>{{ store.selectedNode.occurrenceId }}</code></div>
            <section v-if="store.selectedObjectSuppressedStates.length" class="state-presentation-actions" data-testid="p03-suppressed-states">
              <button v-for="state in store.selectedObjectSuppressedStates" :key="state.state_id" class="button button--secondary" type="button" :data-testid="`p03-suppressed-state-${state.state_id}`" @click="store.makeSuppressedStateExplicit(state.state_id)">显式 {{ state.name_or_value }}</button>
            </section>
            <p class="disabled-reason">属性更新命令不在 P0 范围。</p>
          </template>
          <template v-else-if="store.selectedRelation">
            <div class="form-readonly"><span>关系</span><strong>{{ store.selectedRelation.capabilityId ?? 'Consumption' }}</strong></div>
            <div class="form-readonly"><span>稳定标识</span><code>{{ store.selectedRelation.id }}</code></div>
            <div v-for="endpoint in store.selectedRelation.endpoints ?? []" :key="`${endpoint.ordinal}-${endpoint.role}`" class="form-readonly"><span>{{ endpoint.role }}</span><code>{{ endpoint.targetId }}</code></div>
            <div v-if="store.selectedRelation.duration" class="form-readonly"><span>duration</span><code>{{ store.selectedRelation.duration }}</code></div>
            <div v-if="store.selectedRelation.controlCapability" class="form-readonly"><span>Control</span><code>{{ store.selectedRelation.controlCapability }}</code></div>
            <div v-if="store.factDeleteOption" class="impact-callout" data-testid="p03-fact-delete-impact"><strong>删除影响</strong><span>构造 {{ store.factDeleteOption.impact_summary?.affected_construct_count ?? 0 }} · Context {{ store.factDeleteOption.impact_summary?.affected_context_count ?? 0 }} · 文本 {{ store.factDeleteOption.impact_summary?.affected_sentence_count ?? 0 }}</span><button class="button button--danger" type="button" :disabled="!store.factDeleteOption.enabled || !store.factDeleteOption.impact_token" @click="store.deleteSelectedFact">删除关系</button></div>
            <form v-if="store.structuralUpdateCandidate.phase === 'editing'" class="state-editor" data-testid="p03-structural-update" @submit.prevent="store.submitStructuralUpdate">
              <div class="form-readonly"><span>关系</span><strong>{{ store.structuralUpdateCandidate.option?.display_name }}</strong></div>
              <label v-for="(_, slot) in store.structuralUpdateCandidate.labels" :key="slot" class="form-field"><span>{{ slot }}</span><input v-model="store.structuralUpdateCandidate.labels[slot]" :data-testid="`p03-structural-update-label-${slot}`" maxlength="256"></label>
              <label v-if="(store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values?.length ?? 0) !== 1" class="form-field"><span>direction</span><select v-model="store.structuralUpdateCandidate.direction"><option v-for="direction in store.structuralUpdateCandidate.option?.required_fields.find((field) => field.field_id === 'direction')?.allowed_values ?? []" :key="direction" :value="direction">{{ direction }}</option></select></label>
              <label v-if="store.structuralUpdateCandidate.option?.required_fields.some((field) => field.field_id === 'collection_completeness')" class="form-field"><span>完整性</span><select v-model="store.structuralUpdateCandidate.collectionCompleteness" data-testid="p03-structural-update-completeness"><option disabled value="">请选择</option><option value="COMPLETE">完整</option><option value="INCOMPLETE">不完整</option></select></label>
              <div class="state-editor__actions"><button class="button button--secondary" type="button" @click="store.cancelStructuralUpdate">取消</button><button class="button" type="submit" :disabled="store.workbench.commandState === 'submitting'">保存</button></div>
            </form>
            <template v-else-if="store.selectedRelation.capabilityId?.startsWith('CAP-ISO-STRUCT-')">
              <div v-for="label in store.selectedRelation.labels ?? []" :key="label.slotId" class="form-readonly"><span>{{ label.slotId }}</span><strong>{{ label.text }}</strong></div>
              <div v-if="store.selectedRelation.collectionCompleteness && store.selectedRelation.collectionCompleteness !== 'NOT_APPLICABLE'" class="form-readonly"><span>完整性</span><strong>{{ store.selectedRelation.collectionCompleteness === 'COMPLETE' ? '完整' : '不完整' }}</strong></div>
              <button class="button" type="button" :disabled="store.isReadonly" data-testid="p03-structural-update-open" @click="store.armStructuralUpdate">编辑结构关系</button>
            </template>
            <template v-else>
              <section v-if="store.controlCandidate.phase === 'choosing'" class="relation-candidate" data-testid="p03-control-catalog">
                <div class="relation-candidate__options">
                  <button v-for="option in store.controlCandidate.options" :key="option.option_id" class="relation-candidate__option" type="button" :data-testid="`p03-control-option-${option.capability_ref.capability_id}`" @click="store.submitControlCandidate(option)">
                    <strong>{{ option.display_name }}</strong><span>{{ option.capability_ref.capability_id }}</span>
                  </button>
                </div>
                <button class="button button--secondary" type="button" @click="store.cancelControlCandidate">取消</button>
              </section>
              <button v-else class="button" type="button" :disabled="store.isReadonly" data-testid="p03-control-open" @click="store.armControlUpdate">添加 Control</button>
            </template>
          </template>
          <p v-else class="empty-inspector">从画布选择元素或关系。</p>
        </aside>
      </div>
    </div>

    <section class="bottom-panel">
      <div class="bottom-tabs" role="tablist">
        <button v-for="tab in bottomTabs" :key="tab.value" :class="{ 'is-active': store.workbench.bottomTab === tab.value }" type="button" role="tab" :data-testid="`p03-tab-${tab.value}`" @click="store.setBottomTab(tab.value)">{{ tab.label }}</button>
      </div>
      <div v-if="store.workbench.bottomTab === 'text'" class="bottom-content" data-testid="p03-text-panel">
        <div class="projection-meta"><span>OPL</span><span>input {{ store.workbench.revision }}</span></div>
        <button v-for="line in store.textLines" :key="line.id" class="opl-line" type="button" data-testid="p03-opl-sentence" @click="store.locateText(line)">{{ line.text }}</button>
        <p v-if="!store.textLines.length" class="projection-message">当前 Context 尚无可生成 OPL 的 Procedural Fact。</p>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'findings'" class="bottom-content" data-testid="p03-findings-panel"><p class="projection-message">当前校验任务未返回 Finding 明细。</p></div>
      <div v-else-if="store.workbench.bottomTab === 'history'" class="bottom-content" data-testid="p03-history-panel"><p v-for="revision in store.revisions" :key="revision.id">{{ revision.sequence }} · {{ revision.kind }} · {{ revision.id }}</p></div>
      <div v-else class="bottom-content"><p>架构方法检查待连接 Method Query；当前不形成语言符合性结论。</p></div>
    </section>

    <div class="validation-status"><div><span>校验</span><strong>{{ validationLabel }}</strong></div><progress :value="store.workbench.validationProgress" max="100" /><span>阻断 {{ store.workbench.blockingFindings }}</span></div>
  </section>
</template>

<script setup lang="ts">
import { Box, CircleDashed, CircleDotDashed, Cog, GitFork, Hand, ListTree, Maximize, MousePointer2, Network, Workflow, ZoomIn, ZoomOut } from "@lucide/vue";
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import OpdCanvas from "@/modules/workbench/OpdCanvas.vue";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const route = useRoute();
const router = useRouter();
const store = useWorkbenchRuntimeStore();
const projectId = computed(() => typeof route.params.projectId === "string" ? route.params.projectId : "");
const modelId = computed(() => typeof route.params.modelId === "string" ? route.params.modelId : "");
const bottomTabs = [
  { value: "text", label: "OPL / OPT" },
  { value: "findings", label: "问题" },
  { value: "history", label: "操作历史" },
  { value: "method", label: "架构方法" },
] as const;
const stateRoles = ["INITIAL", "DEFAULT", "FINAL"] as const;
const selectionKind = computed(() => store.selectedRelation ? "关系" : store.selectedNode?.kind === "process" ? "过程" : store.selectedNode?.kind === "state" ? "状态" : store.selectedNode ? "对象" : "未选择");
const validationLabel = computed(() => store.workbench.validationState === "running" ? "运行中" : store.workbench.validationState === "failed" ? "校验失败，可重试" : store.workbench.validationState === "current" ? "结果当前" : "结果过期");

watch([projectId, modelId, () => route.query.context, () => route.query.revision], ([nextProject, nextModel, context, revision]) => {
  if (!nextProject || !nextModel) return;
  const wantedContext = typeof context === "string" ? context : undefined;
  const wantedRevision = typeof revision === "string" ? revision : undefined;
  if (nextProject === store.projectId && nextModel === store.modelId && wantedContext === store.workbench.activeContextId && wantedRevision === store.workbench.revision) return;
  void store.load(nextProject, nextModel, wantedContext, wantedRevision);
}, { immediate: true });

watch(() => [store.workbench.revision, store.workbench.activeContextId], ([revision, context]) => {
  if (!revision || !context || (route.query.revision === revision && route.query.context === context)) return;
  void router.replace({ query: { ...route.query, revision, context } });
});
</script>
