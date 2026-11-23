<template>
  <section ref="workbenchRoot" tabindex="-1" class="workbench" :class="{ 'workbench--bottom-collapsed': !store.workbench.bottomPanelExpanded, 'workbench--bottom-hidden': editorMode === 'ANALYSIS', 'workbench--header-hidden': !showHeader }" :style="{ '--workbench-bottom-height': `${bottomPanelHeight}px`, '--workbench-navigator-width': navigatorWidth ? `${navigatorWidth}px` : undefined }" data-testid="p03-workbench" @pointerdown="activateWorkbench">
    <header v-if="showHeader" class="workbench-header">
      <div class="workbench-header__context">
        <button v-if="projectNavigation" class="back-link" type="button" :title="`项目 / ${store.projectName}`" @click="emit('navigateProject', projectId)">项目 / {{ store.projectName }}</button>
        <span v-else class="back-link" :title="`项目 / ${store.projectName}`" data-testid="p03-project-name">项目 / {{ store.projectName }}</span>
        <strong :title="displayModelName">{{ displayModelName }}</strong>
        <span v-if="showProfile" class="profile-tag" :title="store.profileLabel">{{ store.profileLabel }}</span>
      </div>
      <div class="workbench-header__status">
        <div class="workbench-header__revision-group">
          <span v-if="showVersionControls" class="revision-tag" :title="`最近版本 / Latest revision: ${store.workbench.revision || '-'}`" data-testid="hs-draft-identity">{{ store.draftToken && store.workbench.locationMode === 'HEAD' ? `活动草稿 · 编辑 ${store.draftToken.edit_seq}` : `${store.workbench.locationMode === 'HEAD' ? '草稿' : '固定版本'} ${store.workbench.revision || '-'}` }}</span>
          <span v-if="store.workbench.resourceState === 'ready' && store.isReadonly" class="readonly-tag" role="status" title="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." aria-label="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." data-testid="p03-readonly-banner"><Lock :size="12" aria-hidden="true" />只读</span>
          <select v-if="showVersionControls" aria-label="打开版本" data-testid="p03-version-select" :value="store.workbench.locationMode === 'HEAD' ? 'head' : store.workbench.revision" :disabled="store.workbench.resourceState !== 'ready' || store.workbench.commandState === 'submitting'" @change="openVersion(($event.target as HTMLSelectElement).value)">
            <option value="head">活动草稿</option>
            <option v-for="revision in store.revisions" :key="revision.id" :value="revision.id">{{ revision.kind === 'BASELINE' ? 'Baseline' : 'Revision' }} {{ revision.sequence }}</option>
          </select>
          <span class="save-tag" role="status" data-testid="hs-save-state">{{ store.saveLabel }}</span>
        </div>
        <span class="workbench-header__divider" aria-hidden="true" />
        <div class="workbench-header__actions">
          <button v-if="store.workbench.locationMode === 'EXACT'" class="button button--secondary workbench-header__button" type="button" data-testid="p03-return-head" @click="openVersion('head')"><Undo2 :size="15" aria-hidden="true" /><span>返回活动草稿</span></button>
          <button v-if="permalinkEnabled" class="button button--secondary workbench-header__button" type="button" data-testid="p03-copy-permalink" :disabled="store.workbench.resourceState !== 'ready' || store.saving" @mousedown.prevent @click="copyPermalink"><Link2 :size="15" aria-hidden="true" /><span>复制永久链接</span></button>
          <button v-if="store.draftToken && (store.pendingDelivery || store.saveError)" class="button button--secondary workbench-header__button" type="button" data-testid="hs-retry-delivery" @click="store.retryDraftDelivery"><RefreshCw :size="15" aria-hidden="true" /><span>重新加载 / 恢复待确认</span></button>
          <button class="button button--primary workbench-header__button" type="button" data-testid="p03-run-validation" :disabled="!store.canRunValidation" :title="store.draftToken ? '检查当前活动草稿的整个模型' : '历史版本显示已有问题，请返回活动草稿运行校验'" @click="runModelValidation"><ShieldCheck :size="15" aria-hidden="true" /><span>{{ store.workbench.validationState === 'running' ? '校验中…' : '运行校验' }}</span></button>
        </div>
      </div>
    </header>

    <div class="workbench-main">
      <div v-if="store.workbench.resourceState === 'error' || (store.workbench.resourceState === 'loading' && !store.contexts.length)" class="workbench-notices">
        <p v-if="store.workbench.resourceState === 'loading' && !store.contexts.length" class="command-feedback" role="status">正在读取 Local Runtime 工作台会话。</p>
        <p v-if="store.workbench.resourceState === 'error'" class="command-feedback" role="status" data-testid="p03-command-feedback">{{ store.workbench.commandFeedback }}<code v-if="store.workbench.feedbackCode" data-testid="p03-command-feedback-code">{{ store.workbench.feedbackCode }}</code></p>
      </div>

      <WorkbenchDockLayout :inspector-open="inspectorDockVisible" :canvas-only="editorMode === 'GRAPH'">
        <template #navigator>
          <div v-show="editorMode !== 'GRAPH'" :id="domId('workbench-left-dock')" class="navigator-dock" :class="{ 'navigator-dock--assistant': leftTab === 'assistant' }" data-testid="workbench-left-dock">
            <div class="left-workspace-tabs" role="tablist" aria-label="左侧工作区">
              <button :id="domId('left-tab-navigation')" type="button" role="tab" :aria-selected="leftTab === 'navigation'" :aria-controls="domId('opd-navigator')" :tabindex="leftTab === 'navigation' ? 0 : -1" data-testid="left-tab-navigation" @click="leftTab = 'navigation'" @keydown.right.prevent="assistantEnabled && selectLeftTab('assistant')">模型导航</button>
              <button v-if="assistantEnabled" :id="domId('left-tab-assistant')" type="button" role="tab" :aria-selected="leftTab === 'assistant'" :aria-controls="domId('left-assistant-content')" :tabindex="leftTab === 'assistant' ? 0 : -1" data-testid="left-tab-assistant" @click="selectLeftTab('assistant', false)" @keydown.left.prevent="selectLeftTab('navigation')">智能助手</button>
            </div>
            <aside v-show="leftTab === 'navigation'" :id="domId('opd-navigator')" class="workbench-panel navigator-panel" aria-label="OPD 导航" data-testid="opd-navigator">
              <div class="navigator-heading"><span>图列表</span><span class="navigator-count" :aria-label="`${navigationContexts.length} 张图`">{{ navigationContexts.length }}</span></div>
              <nav class="context-tree" aria-label="OPD 图列表">
                <template v-for="context in visibleContexts" :key="context.id">
                  <div class="context-tree__row" :class="{ 'is-current': context.id === displayedContextId }" :style="{ paddingInlineStart: `${6 + Math.min(context.depth, 6) * 14}px` }">
                    <button v-if="hasChildren.has(context.id)" class="context-tree__toggle" :class="{ 'is-expanded': !collapsedContexts.has(context.id) }" type="button" :aria-expanded="!collapsedContexts.has(context.id)" :aria-label="`${collapsedContexts.has(context.id) ? '展开' : '收起'} ${context.label} 的子图`" :title="collapsedContexts.has(context.id) ? '展开子图' : '收起子图'" :data-testid="`opd-toggle-${context.id}`" @click="toggleContext(context.id)"><ChevronRight :size="14" aria-hidden="true" /></button>
                    <span v-else class="context-tree__toggle-slot" aria-hidden="true" />
                    <button class="context-tree__item" :title="context.title" :aria-current="context.id === displayedContextId ? 'page' : undefined" type="button" :data-testid="`p03-context-${context.id}`" @click="navigateWorkbenchContext(context.id)" @contextmenu.prevent="!context.preview && openContextMenu($event, context.id)">
                      <svg class="context-tree__icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2" y="6" width="5" height="8" rx="1" /><rect x="12" y="2" width="6" height="5" rx="1" /><rect x="12" y="13" width="6" height="5" rx="1" /><path d="M7 10h3V4.5h2m-2 5.5v5.5h2" /></svg>
                      <span class="context-tree__label">{{ context.label }}{{ context.preview ? ' · 预览' : '' }}</span>
                    </button>
                    <button class="context-tree__add" type="button" :aria-label="`在 ${context.label} 下创建子图`" :title="`在 ${context.label} 下创建子图`" :aria-expanded="refinementContextId === context.id" :disabled="context.preview || !canOpenRefinement || refinementSubmitting" :data-testid="`opd-add-${context.id}`" @mousedown.prevent @click="openRefinement(context.id)"><Plus :size="15" aria-hidden="true" /></button>
                    <span class="context-tree__parent-slot">
                      <button v-if="context.id === store.workbench.activeContextId && context.parentId" class="context-tree__parent" type="button" title="返回父 OPD" aria-label="返回父 OPD" data-testid="opd-parent" :disabled="store.workbench.resourceState !== 'ready' || store.workbench.commandState === 'submitting'" @mousedown.prevent @click="navigateContext(context.parentId)"><CornerUpLeft :size="15" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <section v-if="refinementContextId === context.id && context.id === store.workbench.activeContextId && !store.isReadonly" class="navigator-refinement" aria-label="创建子图" data-testid="opd-refinement-panel" @keydown.esc.stop.prevent="closeRefinement">
                    <div class="navigator-refinement__header"><span class="navigator-refinement__heading">创建子图</span><button class="navigator-refinement__cancel" type="button" aria-label="取消创建子图" title="取消创建子图" :disabled="refinementSubmitting" data-testid="opd-refinement-cancel" @click="closeRefinement"><X :size="14" aria-hidden="true" /></button></div>
                    <form v-if="canRefine" @submit.prevent="submitRefinement">
                      <p class="navigator-refinement__target" :title="store.selectedNode?.label">细化：{{ store.selectedNode?.label }}</p>
                      <div class="navigator-refinement__fields">
                        <input ref="refinementInputs" v-model="refinementName" aria-label="子 OPD 名称" placeholder="子图名称" data-testid="opd-refinement-name" :disabled="refinementSubmitting || !canOpenRefinement" maxlength="256" required>
                        <button class="navigator-refinement__submit" type="submit" title="创建子 OPD" aria-label="创建子 OPD" data-testid="opd-refine" :disabled="refinementSubmitting || !canOpenRefinement || !refinementName.trim()" :aria-busy="refinementSubmitting"><Check :size="17" aria-hidden="true" /></button>
                      </div>
                    </form>
                    <p v-else class="navigator-refinement__hint" role="status">请先在画布选择要细化的对象或过程。</p>
                  </section>
                </template>
              </nav>
              <p v-if="!store.draftToken" class="disabled-reason">P0 仅支持根系统图；细化和视图由后续包实现。</p>
            </aside>
            <div v-if="assistantOpened" v-show="leftTab === 'assistant'" :id="domId('left-assistant-content')" class="left-assistant-content" role="tabpanel" :aria-labelledby="domId('left-tab-assistant')">
              <div v-show="assistantKind === 'OPD'" class="assistant-conversation"><AssistantPanel ref="opdAssistant" :scope="assistantScope" :context-name="navigationContexts.find(item => item.id === assistantScope.contextId)?.label ?? 'OPD'" :token="store.draftToken" :readonly="store.isReadonly || !store.draftToken || appliedReadPending" :selected-ids="store.selectedIds" @applying="assistantApplying = $event" @running="setOpdAssistantRunning" @preview="receiveAssistantPreview($event, 'OPD')" @applied="refreshAfterAssistant" /></div>
              <Teleport :to="fullscreenAssistantTarget ?? 'body'" :disabled="!fullscreenAssistantTarget">
                <div v-if="mindmapResult" v-show="assistantKind === 'ANALYSIS'" class="assistant-conversation"><AssistantPanel ref="analysisAssistant" :scope="analysisScope" context-name="模型分析" :token="store.draftToken" :readonly="store.isReadonly || !store.draftToken || appliedReadPending" :selected-ids="mindmapEditor?.selectedId ? [mindmapEditor.selectedId] : []" :focused-branch-id="mindmapEditor?.focusedBranchId" :analysis-revision="mindmapResult.document.revision" :analysis-dirty="analysisDirty" :analysis-labels="analysisLabels" :prepare-analysis="prepareAnalysis" @applying="assistantApplying = $event" @preview="receiveAssistantPreview($event, 'ANALYSIS')" @applied="refreshAfterAssistant" @analysis-updated="reloadAnalysis(true)" @running="analysisRunning = $event" @request-conversion="requestAnalysisConversion" /></div>
              </Teleport>
            </div>
            <WorkbenchNavigatorResizer :width="navigatorWidth" :default-width="leftTab === 'assistant' ? 360 : undefined" :inspector-open="inspectorDockVisible" @resize="navigatorWidth = $event" />
          </div>
        </template>
        <template #editor>
          <section ref="editorPanel" class="editor-panel" :class="{ 'editor-panel--opd': editorMode === 'OPD', 'editor-panel--analysis': editorMode !== 'OPD' }">
            <div class="editor-modebar" role="tablist" aria-label="建模视图" @keydown="navigateEditorTabs">
              <button v-if="analysisEnabled" type="button" role="tab" :aria-selected="editorMode === 'ANALYSIS'" :disabled="store.isReadonly || !store.draftToken" data-testid="editor-mode-analysis" @click="selectEditorMode('ANALYSIS')">脑图分析</button>
              <button type="button" role="tab" :aria-selected="editorMode === 'OPD'" data-testid="editor-mode-opd" @click="selectEditorMode('OPD')">OPD 建模</button>
              <button type="button" role="tab" :aria-selected="editorMode === 'GRAPH'" :disabled="store.workbench.resourceState !== 'ready'" data-testid="editor-mode-graph" @click="selectEditorMode('GRAPH')">图谱分析</button>
              <span v-if="editorMode === 'ANALYSIS'">模型级分析 · 独立保存</span>
              <button v-if="editorMode === 'ANALYSIS'" type="button" class="editor-modebar__assistant" @click="selectLeftTab('assistant', false)">打开分析助手</button>
              <button v-if="editorMode === 'OPD' && selectedAnalysisSource" type="button" class="editor-modebar__assistant" data-testid="mindmap-locate-source" :disabled="selectedAnalysisSource.removed" @click="locateAnalysisSource">{{ selectedAnalysisSource.removed ? '分析来源已移除' : `分析来源：${selectedAnalysisSource.label}` }}</button>
            </div>
            <div v-show="editorMode === 'OPD'" class="editor-toolbar" role="toolbar" aria-label="OPM 画布工具 / OPM canvas tools" data-testid="p03-canvas-toolchain">
              <WorkbenchCommonTools :show-save="!!store.draftToken" :save-disabled="store.isReadonly || store.saving" :can-undo="store.canUndo" :can-redo="store.canRedo" :undo-label="store.undoLabel" :redo-label="store.redoLabel" :tool="canvasInteractionTool" @save="requestSave" @undo="requestLayoutHistory(false)" @redo="requestLayoutHistory(true)" @tool="setCanvasInteractionTool" />
              <LayoutToolMenu v-if="store.draftToken" :disabled="store.isReadonly || store.saving || store.workbench.commandState === 'submitting' || store.relationCandidate.phase !== 'idle' || store.controlCandidate.phase !== 'idle' || store.structuralUpdateCandidate.phase !== 'idle'" :state="store.layoutArrangement" :auto-layout-disabled="!store.canAutoLayout" :can-undo-model="store.modelLayout?.undoAvailable" @arrange="requestLayoutArrangement" @auto-layout="requestAutoLayout" @model-layout="requestModelLayout" @undo-model="store.undoModelLayout" />

              <span class="editor-toolbar__separator" aria-hidden="true" />
              <div class="tool-group" aria-label="P0 建模命令">
                <button class="tool-button tool-button--icon" type="button" title="创建对象 / Create Object" aria-label="创建对象 / Create Object" :disabled="store.isReadonly" data-testid="p03-tool-object" @click="addElement('OBJECT')"><ElementToolSymbol kind="object" /></button>
                <button class="tool-button tool-button--icon" type="button" title="创建过程 / Create Process" aria-label="创建过程 / Create Process" :disabled="store.isReadonly" data-testid="p03-tool-process" @click="addElement('PROCESS')"><ElementToolSymbol kind="process" /></button>
                <button class="tool-button tool-button--icon" type="button" title="创建属性 / Create Attribute" aria-label="创建属性 / Create Attribute" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-attribute" @click="store.addFeature('ATTRIBUTE')"><ElementToolSymbol kind="attribute" /></button>
                <button class="tool-button tool-button--icon" type="button" title="创建操作 / Create Operation" aria-label="创建操作 / Create Operation" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-operation" @click="store.addFeature('OPERATION')"><ElementToolSymbol kind="operation" /></button>
                <button class="tool-button tool-button--icon" type="button" title="创建状态 / Create State" aria-label="创建状态 / Create State" :disabled="store.isReadonly || store.workbench.commandState === 'submitting' || store.selectedNode?.kind !== 'object' || (!store.draftToken && !store.stateCreateOption?.enabled)" data-testid="p03-tool-state" @click="armStateCreation"><ElementToolSymbol kind="state" /></button>
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
                <CanvasFullscreenButton :target="editorPanel" />
                <button class="tool-button tool-button--icon" :class="{ 'is-active': store.rightPanel.open }" type="button" :title="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" :aria-label="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" data-testid="p03-right-panel-open" @click="toggleProperties"><PanelRightOpen :size="18" aria-hidden="true" /></button>
              </div>
            </div>
            <div v-if="store.historyRecoveryError" class="history-recovery-error" role="alert" data-testid="history-recovery-error"><span>撤销/重做历史读取失败：{{ store.historyRecoveryError }}</span><button type="button" class="button button--secondary" :disabled="store.historyRecoveryLoading || store.saving || store.workbench.commandState === 'submitting' || store.isReadonly || store.historyInteractionBusy" data-testid="history-recovery-retry" @click="store.retryHistoryRecovery()">{{ store.historyRecoveryLoading ? '正在重试…' : '重试' }}</button></div>
            <div v-show="editorMode === 'OPD'" ref="canvasSurface" class="canvas-surface">
              <div v-if="assistantPreview" class="assistant-canvas-preview" role="status" data-testid="assistant-canvas-preview"><span>{{ appliedReadPending ? (appliedReadError || '修改已应用，正在读取新图…') : `${assistantPreview.status === 'staging' ? '实时生成预览' : assistantPreview.status === 'blocked' ? '待修正预览' : '修改预览'} · ${assistantPreview.summary} · 尚未应用` }}</span><select v-if="assistantPreview.previewViews?.length" v-model="previewContextId" :disabled="appliedReadBusy" aria-label="选择重组预览图" data-testid="assistant-preview-context"><option v-for="view in assistantPreview.previewViews" :key="view.context_id" :value="view.context_id">{{ view.label }} · {{ view.data.constructs.filter(item => item.target_kind !== 'FACT').length }} 个节点</option></select><button v-if="appliedReadError" class="button button--secondary" type="button" data-testid="assistant-readback-retry" :disabled="appliedReadBusy" @click="refreshAfterAssistant(assistantScope)">重试读取</button><button class="button button--secondary" type="button" :disabled="assistantApplying || appliedReadPending" @click="assistantPreview = null">退出预览</button></div>
              <CanvasContextMenu v-if="blankMenuAnchor" :show-relation-names="showRelationNames" :anchor="blankMenuAnchor" :disabled="!store.canAutoLayout || !!store.autoLayoutPreview" :actions-disabled="contextLayoutDisabled" :can-undo="store.canUndo" :can-redo="store.canRedo" :state="store.layoutArrangement" @toggle-relation-names="showRelationNames = !showRelationNames" @close="blankMenuAnchor = null" @auto-layout="requestAutoLayout" @history="requestLayoutHistory" @arrange="requestLayoutArrangement" />
              <ModelLayoutPreviewBar v-if="store.modelLayout?.preview" :state="store.modelLayout" @direction="store.previewModelLayout" @context="store.modelLayout.context = $event" @cancel="store.cancelModelLayout" @apply="store.applyModelLayout" />
              <AutoLayoutPreviewBar v-else-if="store.autoLayoutPreview" :direction="store.autoLayoutPreview.direction" :busy="store.applyingAutoLayout" @direction="store.previewAutoLayout" @cancel="cancelAutoLayout" @apply="store.applyAutoLayout" />
              <div v-else-if="overlappingIds.length && !assistantPreview" class="canvas-layout-notice" role="status" data-testid="opd-overlap-notice">
                <span>{{ overlappingIds.length }} 个元素存在重叠</span>
                <button class="button button--secondary" type="button" :disabled="!store.canAutoLayout" data-testid="opd-repair-layout" @click="requestAutoLayout">整理布局…</button>
              </div>
              <div class="canvas-frame">
                <OpdCanvas ref="canvasEditor" :key="canvasLocationKey" :show-relation-names="showRelationNames" :keyboard-scope="!globalShortcuts" :keyboard-disabled="editorMode !== 'OPD'" :readonly="store.isReadonly || store.saving || store.workbench.commandState === 'submitting' || !!store.autoLayoutPreview || !!store.modelLayout?.preview || !!assistantPreview" :layout-preview="!!store.autoLayoutPreview || !!store.modelLayout?.preview || !!assistantPreview" :nodes="assistantCanvas.nodes" :node-colors="store.nodeColors?.palette ?? {}" :relations="assistantCanvas.relations" :collapsed-features="collapsedFeatures" :refined-element-ids="refinedElementIds" :refinee-id="activeRefineeId" :selected-id="store.workbench.selectedId" :highlighted-text-node-ids="highlightedNodeIds" :highlighted-text-relation-ids="highlightedRelationIds" :selected-ids="store.draftToken ? store.selectedIds : undefined" :zoom="store.workbench.zoom" :interaction-tool="canvasInteractionTool" :relation-gesture-phase="store.relationCandidate.phase" :relation-preview="relationPreview" :relation-editor-target="relationEditorTarget" :highlighted-finding-target-id="store.highlightedFindingTargetId || undefined" :highlighted-finding-node-ids="store.highlightedFindingNodeIds" :begin-name-edit="store.beginElementNameEdit" :submit-name-edit="store.renameElement" @feature-collapse-change="rememberCollapsedFeatures" @viewport-zoom="store.setViewportZoom" @select="selectCanvasConstruct" @move="store.moveElement" @selection="selectCanvasNodes" @move-batch="store.moveElements" @route-change="store.editRelationRoute" @relation-intent="store.handleRelationGesture" @blank-menu-requested="requestBlankMenu" @construct-actions-menu-requested="requestConstructActions" @relation-editor-anchor="relationEditorAnchor = $event" @relation-label-edit-requested="openRelationLabelEditor" />
              </div>
              <CanvasZoomControls :zoom="store.workbench.zoom" @zoom="store.setViewportZoom" @fit="canvasEditor?.fitToView()" @reset="canvasEditor?.resetZoom()" />
              <div v-if="store.relationCandidate.phase !== 'idle' || store.controlCandidate.phase !== 'idle' || store.structuralUpdateCandidate.phase !== 'idle'" class="canvas-state" role="status">{{ store.workbench.lastAction }}</div>
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
                  <button v-if="assistantEnabled" class="construct-context-menu__item construct-context-menu__item--neutral" role="menuitem" type="button" :disabled="store.isReadonly || !store.draftToken || !!runningAssistantContext || assistantApplying || appliedReadPending" data-testid="p03-construct-ask-assistant" @click="askAssistantAboutConstruct">
                    <MessageSquare :size="15" aria-hidden="true" />
                    <span>关联助手</span>
                  </button>
                  <button v-if="constructRefinementTarget && !constructChildContext" class="construct-context-menu__item construct-context-menu__item--neutral" role="menuitem" type="button" :disabled="!!constructRefinementDisabledReason" :title="constructRefinementDisabledReason || '细化此元素并创建子 OPD'" data-testid="p03-construct-add-refinement" @click="openConstructRefinement">
                    <Plus :size="15" aria-hidden="true" />
                    <span>添加子图…</span>
                  </button>
                  <button v-if="constructChildContext" class="construct-context-menu__item construct-context-menu__item--neutral" role="menuitem" type="button" :disabled="!canExpandConstructRefinement" :title="`打开 ${constructChildContext.label}`" data-testid="p03-construct-expand-refinement" @click="expandConstructRefinement">
                    <CornerDownRight :size="15" aria-hidden="true" />
                    <span>展开子图</span>
                  </button>
                  <span v-if="store.constructActions.options.length" class="construct-context-menu__separator" aria-hidden="true" />
                  <template v-for="option in store.constructActions.options" :key="option.option_id">
                    <div :title="deleteActionDisabledReason(option)" data-testid="p03-construct-delete-tooltip">
                      <button class="construct-context-menu__item" role="menuitem" type="button" :disabled="!option.enabled" data-testid="p03-construct-delete-action" @click="chooseConstructDelete(option)">
                        <Trash2 :size="15" aria-hidden="true" />
                        <span>{{ deleteActionLabel(option) }}</span>
                      </button>
                    </div>
                    <span v-if="option.enabled && option.impact_summary" class="construct-context-menu__reason">影响 {{ option.impact_summary.items?.length ?? 0 }} 项</span>
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
            <MindmapPanel v-if="mindmapOpened && store.draftToken" v-show="editorMode === 'ANALYSIS'" ref="mindmapEditor" :project-id="store.projectId" :model-id="store.modelId" :token="store.draftToken" :readonly="store.isReadonly" :generating="analysisRunning" :contexts="navigationContexts" :active-context="store.workbench.activeContextId" :targets="mindmapTargets" :active="editorMode === 'ANALYSIS'" @assistant-target="showFullscreenAssistant" @changed="mindmapResult = $event; analysisDirty = false" @invalidated="analysisDirty = true; assistantPreview = null" @convert="convertMindmap" />
            <GraphAnalysisPanel v-if="graphOpened" v-show="editorMode === 'GRAPH'" :project-id="store.projectId" :model-id="store.modelId" :context-id="store.workbench.activeContextId" :source="graphSource" :active="editorMode === 'GRAPH'" @locate="locateGraphSource" />
          </section>
        </template>
        <template #inspector>
          <WorkbenchInspector v-if="inspectorDockVisible" ref="propertyNameEditor" :store="store" :canvas-location-key="canvasLocationKey" @state-editor="Object.assign(store.stateEditor, $event)" @structural-update-candidate="Object.assign(store.structuralUpdateCandidate, $event)" />
        </template>
      </WorkbenchDockLayout>
    </div>

    <div v-if="layoutLeaveOpen" class="overlay-backdrop" @click.self="resolveLayoutLeave(false)">
      <section :ref="layoutLeaveFocus.setDialogElement" class="dialog-panel" role="dialog" aria-modal="true" :aria-labelledby="domId('layout-leave-title')" data-testid="layout-leave-dialog" @keydown="layoutLeaveFocus.onDialogKeydown">
        <div class="dialog-panel__header"><h2 :id="domId('layout-leave-title')">布局尚未保存</h2></div>
        <p class="dialog-note">位置修改仅保留在当前页面。保存后继续，或放弃位置修改。</p>
        <div class="dialog-panel__footer">
          <button class="button" type="button" :disabled="store.saving" data-testid="layout-leave-cancel" @click="resolveLayoutLeave(false)">取消</button>
          <button class="button" type="button" :disabled="store.saving || store.pendingDelivery" data-testid="layout-leave-discard" @click="discardLayoutLeave">放弃位置修改</button>
          <button class="button button--primary" type="button" :disabled="store.saving || store.pendingDelivery" data-testid="layout-leave-save" @click="saveLayoutLeave">保存后继续</button>
        </div>
        <p v-if="store.saveError || store.pendingDelivery" role="alert">{{ store.saveError || '操作待确认，请先恢复待确认操作。' }}</p>
      </section>
    </div>
    <p v-if="opdExportError" class="opd-export-error" role="alert">{{ opdExportError }}</p>
    <div v-if="contextMenu" class="opd-menu-backdrop" @click.self="contextMenu = null" @contextmenu.prevent="contextMenu = null">
      <section ref="contextMenuPanel" class="construct-context-menu opd-tree-menu" tabindex="-1" role="menu" aria-label="OPD 操作" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @keydown.esc.stop.prevent="contextMenu = null">
        <button class="construct-context-menu__item construct-context-menu__item--neutral" role="menuitem" type="button" data-testid="opd-export-json" :disabled="!canExportOpd" title="导出此图、子图及必要父级依赖，可在其他环境重新导入" @click="exportOpdJson"><Download :size="15" aria-hidden="true" /><span>导出 OPD JSON</span></button>
        <button ref="contextDeleteMenuButton" class="construct-context-menu__item" role="menuitem" type="button" data-testid="opd-delete-action" :disabled="!canDeleteContext(contextMenu.id)" @click="previewContextDelete"><Trash2 :size="15" aria-hidden="true" /><span>删除子图…</span></button>
        <p v-if="!store.contexts.find(item => item.id === contextMenu?.id)?.parentId" class="construct-context-menu__reason">根图不能删除。</p>
        <p v-else-if="!canDeleteContext(contextMenu.id)" class="construct-context-menu__reason">当前只读或正在处理操作。</p>
      </section>
    </div>
    <div v-if="store.contextDelete.open" class="overlay-backdrop" @click.self="contextDeleteFocus.closeDialog">
      <form :ref="contextDeleteFocus.setDialogElement" class="dialog-panel opd-delete-dialog" role="dialog" aria-modal="true" :aria-labelledby="domId('opd-delete-title')" aria-describedby="opd-delete-description" data-testid="opd-delete-dialog" @keydown="contextDeleteFocus.onDialogKeydown" @submit.prevent="submitContextDelete">
        <div class="dialog-panel__header"><h2 :id="domId('opd-delete-title')">删除子图</h2></div>
        <p :id="domId('opd-delete-description')" class="dialog-note">将删除此子图、全部下级图及图内专属内容。父图中的细化元素和历史版本会保留；此操作无法通过布局撤销恢复。</p>
        <p v-if="store.contextDelete.loading" role="status">正在计算删除范围…</p>
        <template v-if="store.contextDelete.option">
          <ul class="opd-delete-contexts"><li v-for="id in store.contextDelete.option.context_impact.context_ids" :key="id">{{ contextLabel(id) }}</li></ul>
          <p class="dialog-note" data-testid="opd-delete-counts">{{ store.contextDelete.option.context_impact.counts.contexts }} 张图，{{ store.contextDelete.option.context_impact.counts.elements }} 个元素，{{ store.contextDelete.option.context_impact.counts.features }} 个属性/操作，{{ store.contextDelete.option.context_impact.counts.states }} 个状态，{{ store.contextDelete.option.context_impact.counts.facts }} 条关系。</p>
          <div v-if="store.contextDelete.option.context_impact.blockers.length" role="alert" data-testid="opd-delete-blockers">
            <p>其他图仍引用这些内容，暂时不能删除。请先处理以下引用：</p>
            <ul class="opd-delete-contexts"><li v-for="(item, index) in store.contextDelete.option.context_impact.blockers" :key="index">{{ item.context_id ? contextLabel(item.context_id) + '：' : '' }}{{ item.kind }} / {{ item.id }}</li></ul>
          </div>
        </template>
        <p v-if="store.contextDelete.error" class="dialog-note" role="alert">{{ store.contextDelete.error }}</p>
        <div class="dialog-panel__footer">
          <button class="button" type="button" data-testid="opd-delete-cancel" :disabled="store.contextDelete.submitting" @click="contextDeleteFocus.closeDialog">取消</button>
          <button class="button button--primary" type="submit" data-testid="opd-delete-confirm" :disabled="!store.contextDelete.option?.enabled || store.contextDelete.loading || store.contextDelete.submitting || store.isReadonly || store.saving || store.workbench.commandState === 'submitting'">{{ store.contextDelete.submitting ? '正在删除…' : '确认删除' }}</button>
        </div>
      </form>
    </div>

    <WorkbenchBottomPanel v-show="editorMode !== 'ANALYSIS'" :store="store" :height="bottomPanelHeight" @resize="bottomPanelHeight = $event" @toggle="store.workbench.bottomPanelExpanded = !store.workbench.bottomPanelExpanded" @activate-tab="activateBottomTab" @locate-text="locateText" @locate-finding="locateModelFinding" @locate-method="locateMethod" @create-method-link="createMethodLink" @delete-method-link="deleteMethodLink" @classify-method="classifyMethod" @navigate-method="navigateMethod" @open-history-revision="openHistoryRevision" />

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
import { usePreviewViewport } from "./usePreviewViewport";
import { useOpdRefinement } from "./useOpdRefinement";
import { useContextTree } from "./useContextTree";
import { Check, ChevronRight, CornerDownRight, CornerUpLeft, Download, Link2, Lock, MessageSquare, PanelRightOpen, Plus, RefreshCw, ShieldCheck, Trash2, Undo2, X } from "@lucide/vue";
import { computed, defineAsyncComponent, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { WorkbenchNavigation, WorkbenchRuntime } from "@/workbench/internal";
import { useWorkbenchDomId, useWorkbenchServices, unavailableWorkbenchServices } from "@/workbench/services";

import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { useWorkbenchNavigation } from "./useWorkbenchNavigation";
import OpdCanvas from "@/modules/workbench/OpdCanvas.vue";
import WorkbenchBottomPanel from "./WorkbenchBottomPanel.vue";
import MindmapPanel from "./MindmapPanel.vue";
import type { GraphSourceRef, MethodSource } from "@/shared/api/generated/draftWorkspaceContract";
import AssistantPanel from "./AssistantPanel.vue";

import { previewAssistant } from "./assistantPreview";
import { previewNavigation } from "./previewNavigation";
import type { AssistantProposal, AssistantScope } from "@/shared/api/assistantApi";
import WorkbenchDockLayout from "@/shared/workbench/WorkbenchDockLayout.vue";
import WorkbenchCommonTools from "@/shared/workbench/WorkbenchCommonTools.vue";
import WorkbenchNavigatorResizer from "./WorkbenchNavigatorResizer.vue";
import WorkbenchInspector from "./WorkbenchInspector.vue";
import ElementToolSymbol from "@/modules/workbench/ElementToolSymbol.vue";
import LayoutToolMenu from "./LayoutToolMenu.vue";
import AutoLayoutPreviewBar from "./AutoLayoutPreviewBar.vue";
import ModelLayoutPreviewBar from "./ModelLayoutPreviewBar.vue";
import CanvasContextMenu from "./CanvasContextMenu.vue";
import CanvasZoomControls from "./CanvasZoomControls.vue";
import CanvasFullscreenButton from "./CanvasFullscreenButton.vue";
import type { ArchitectureLinkKind, ArchitectureLevel, MethodEvidence, MindmapResult } from "@/shared/api/generated/draftWorkspaceContract";
import type { LayoutAction } from "@/stores/workbench/layoutArrangement";
import { overlappingNodeIds } from "@/stores/workbench/layoutOverlap";
import RelationToolPalette from "@/modules/workbench/RelationToolPalette.vue";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";



async function openHistoryRevision(revision: string) {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) openVersion(revision);
}

const props = defineProps<{
  runtime: WorkbenchRuntime; navigation: WorkbenchNavigation;
  showHeader?: boolean; projectNavigation?: boolean; assistantEnabled?: boolean; analysisEnabled?: boolean;
  showProfile?: boolean; showVersionControls?: boolean;
  globalShortcuts?: boolean; permalinkEnabled?: boolean; defaultFoldFeatures?: boolean;
}>();
const emit = defineEmits<{ navigateProject: [projectId: string] }>();
const store = props.runtime;
const displayModelName = computed(() => store.modelName.replace(/\s*\[[a-f\d]{64}\]\s*$/i, ""));
onMounted(() => store.startNodeColors());
onBeforeUnmount(() => store.stopNodeColors());
const route = props.navigation.location;
const router = props.navigation;
const localRuntimeApi = (useWorkbenchServices() ?? unavailableWorkbenchServices).api;
const workbenchRoot = ref<HTMLElement>();
const domId = useWorkbenchDomId();
function activateWorkbench(event: PointerEvent) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, button"))) return;
  if (workbenchRoot.value && !workbenchRoot.value.contains(document.activeElement)) workbenchRoot.value.focus({ preventScroll: true });
}
const editorMode = ref<'OPD' | 'ANALYSIS' | 'GRAPH'>('OPD'), assistantKind = ref<'OPD' | 'ANALYSIS'>('OPD');
const graphOpened = ref(false);
const fullscreenAssistantTarget = ref<HTMLElement | null>(null);
const GraphAnalysisPanel = defineAsyncComponent(() => import('./GraphAnalysisPanel.vue'));
function navigateEditorTabs(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !(event.currentTarget instanceof HTMLElement)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[index]?.focus(); tabs[index]?.click();
}
const graphSource = computed<MethodSource | null>(() => store.workbench.resourceState !== 'ready' ? null
  : store.draftToken && store.workbench.locationMode === 'HEAD' ? { draft_token: store.draftToken }
    : store.workbench.revision ? { revision_id: store.workbench.revision } : null);
async function locateGraphSource(source: GraphSourceRef) {
  const project = store.projectId, model = store.modelId;
  await selectEditorMode('OPD');
  if (editorMode.value !== 'OPD') return;
  if (source.context_id !== store.workbench.activeContextId) await store.selectContext(source.context_id);
  if (store.projectId !== project || store.modelId !== model || store.workbench.activeContextId !== source.context_id) return;
  const target = store.workbench.nodes.find(node => node.occurrenceId === source.occurrence_id)
    ?? store.workbench.relations.find(edge => edge.occurrenceId === source.occurrence_id);
  if (!target) { store.workbench.commandFeedback = '图谱来源已变化，请刷新图谱后重试。'; return; }
  openContext(source.context_id);
  await store.selectConstruct(target.id); await nextTick(); canvasEditor.value?.locateConstruct?.(target.id);
}
const mindmapOpened = ref(false), analysisDirty = ref(false), analysisRunning = ref(false), mindmapResult = ref<MindmapResult | null>(null);
const mindmapEditor = ref<InstanceType<typeof MindmapPanel>>(), analysisAssistant = ref<InstanceType<typeof AssistantPanel>>();
const analysisLabels = computed(() => Object.fromEntries([...(mindmapResult.value?.document.nodes ?? []), ...(mindmapResult.value?.document.relations ?? [])].map(item => [item.id, item.label])));
const analysisScope = computed(() => ({ projectId: store.projectId, modelId: store.modelId, contextId: store.workbench.activeContextId, kind: 'ANALYSIS' as const, mindmapId: mindmapResult.value?.document.id }));
const mindmapTargets = computed(() => store.workbench.nodes.filter(node => ['object', 'process', 'state'].includes(node.kind)).map(node => ({ id: node.id, label: node.label, kind: node.kind.toUpperCase() })));
const selectedAnalysisSource = computed(() => {
  const mappings = mindmapResult.value?.conversions.filter(conversion => conversion.context_id === store.workbench.activeContextId).flatMap(conversion => conversion.mappings) ?? [];
  const mapping = mappings.slice().reverse().find(item => item.target_id === store.workbench.selectedId);
  if (!mapping) return null;
  const source = [...(mindmapResult.value?.document.nodes ?? []), ...(mindmapResult.value?.document.relations ?? [])].find(item => item.id === mapping.source_id);
  return { id: mapping.source_id, label: source?.label ?? mapping.target_name, removed: !source };
});
async function prepareAnalysis() { return await mindmapEditor.value?.save() ?? false; }
async function reloadAnalysis(preserveHistory = false) { await mindmapEditor.value?.reload(preserveHistory); }
async function selectEditorMode(mode: 'OPD' | 'ANALYSIS' | 'GRAPH') {
  if (!await finishInputs() || mode === 'ANALYSIS' && store.isReadonly) return;
  if (mode !== 'ANALYSIS' && (analysisDirty.value || mindmapEditor.value?.pendingRename) && !await prepareAnalysis()) return;
  assistantPreview.value = null; editorMode.value = mode;
  if (mode !== 'GRAPH') assistantKind.value = mode;
  if (mode === 'GRAPH') graphOpened.value = true;
  if (mode === 'ANALYSIS') { mindmapOpened.value = true; await selectLeftTab('assistant', false); }
}
function receiveAssistantPreview(proposal: AssistantProposal | null, kind: 'OPD' | 'ANALYSIS') {
  if (assistantKind.value !== kind) return;
  if (!proposal && (assistantApplying.value || appliedReadPending.value)) return;
  if (proposal) preserveAppliedViewport.value = false;
  assistantPreview.value = proposal;
  if (proposal) editorMode.value = 'OPD';
}
async function requestAnalysisConversion() { await selectEditorMode('ANALYSIS'); await nextTick(); if (editorMode.value === 'ANALYSIS') await mindmapEditor.value?.generatePreview(); }
async function convertMindmap(value: { contextId: string; excludedIds: string[] }) {
  if (!await finishInputs() || !await prepareAnalysis()) return;
  if (value.contextId !== store.workbench.activeContextId) {
    await router.push({ query: { ...route.query, context: value.contextId } });
    // 等待工作台读取目标图，禁止用前一张图的草稿令牌触发转换。
    if (store.workbench.resourceState !== 'ready') await new Promise<void>(resolve => { const stop = watch(() => store.workbench.resourceState, state => { if (state !== 'loading') { stop(); resolve(); } }); });
  }
  if (store.workbench.activeContextId !== value.contextId || store.workbench.resourceState !== 'ready') return;
  assistantKind.value = 'ANALYSIS'; await selectLeftTab('assistant', false); await nextTick(); await analysisAssistant.value?.convert(value.excludedIds);
}
async function locateAnalysisSource() { const source = selectedAnalysisSource.value; if (!source || source.removed) return; await selectEditorMode('ANALYSIS'); await nextTick(); mindmapEditor.value?.selectSource(source.id); }
const assistantPreview = ref<AssistantProposal | null>(null);
const assistantApplying = ref(false), appliedReadPending = ref(false), appliedReadBusy = ref(false), appliedReadError = ref('');
const preserveAppliedViewport = ref(false);
const previewContextId = ref("");
const runningAssistantContext = ref<string | null>(null);
watch(() => !!runningAssistantContext.value || analysisRunning.value || assistantApplying.value || appliedReadPending.value,
  busy => { store.historyInteractionBusy = busy; }, { immediate: true });
onBeforeUnmount(() => { store.historyInteractionBusy = false; });
function setOpdAssistantRunning(running: boolean) { runningAssistantContext.value = running ? runningAssistantContext.value ?? assistantScope.value.contextId : null; }
watch(assistantPreview, (proposal, previous) => { if (proposal?.id !== previous?.id || !previewContextId.value) previewContextId.value = proposal?.contextId ?? ""; });
const displayedContextId = computed(() => assistantPreview.value ? previewContextId.value : store.modelLayout?.preview ? store.modelLayout.context : store.workbench.activeContextId);
const assistantScope = computed(() => ({ projectId: store.projectId, modelId: store.modelId, contextId: runningAssistantContext.value ?? assistantPreview.value?.contextId ?? store.workbench.activeContextId }));
const assistantCanvas = computed(() => {
  const proposal = assistantPreview.value;
  const visible = proposal && (proposal.contextId === previewContextId.value || proposal.previewViews?.some(view => view.context_id === previewContextId.value));
  const model = store.modelLayout?.preview ? store.modelLayoutSelected : null;
  return previewAssistant(visible ? proposal : null, model?.nodes ?? store.autoLayoutNodes, model?.relations ?? store.autoLayoutRelations ?? store.workbench.relations, previewContextId.value);
});
watch(() => [store.draftToken?.edit_seq, store.draftToken?.draft_id], () => { if (!assistantApplying.value && !appliedReadPending.value) assistantPreview.value = null; });
watch(() => [store.projectId, store.modelId], () => { assistantPreview.value = null; runningAssistantContext.value = null; appliedReadPending.value = false; appliedReadError.value = ''; });
watch(previewContextId, async () => { if (!assistantPreview.value) return; await nextTick(); canvasEditor.value?.fitToView(); });
async function navigateWorkbenchContext(id: string) {
  if (assistantPreview.value?.previewViews?.some(view => view.context_id === id)) {
    previewContextId.value = id; editorMode.value = 'OPD'; return;
  }
  if (assistantPreview.value) previewContextId.value = id;
  navigateContext(id);
}
async function refreshAfterAssistant(scope: AssistantScope) {
  if (scope.projectId !== store.projectId || scope.modelId !== store.modelId || store.workbench.locationMode !== 'HEAD') return;
  if (appliedReadBusy.value) return;
  const destination = assistantPreview.value?.previewViews?.some(view => view.context_id === previewContextId.value) ? previewContextId.value : store.workbench.activeContextId;
  const retained = assistantPreview.value;
  appliedReadPending.value = true; appliedReadBusy.value = true; appliedReadError.value = '';
  try {
    const loaded = await store.load(scope.projectId, scope.modelId, destination, undefined, true, true);
    if (scope.projectId !== store.projectId || scope.modelId !== store.modelId || assistantPreview.value !== retained) return;
    if (!loaded) { appliedReadError.value = '修改已应用，但新图读取失败。当前保留预览，请重试读取，无需再次确认。'; return; }
    preserveAppliedViewport.value = true; assistantPreview.value = null; appliedReadPending.value = false;
    await reloadAnalysis();
  } catch {
    if (scope.projectId === store.projectId && scope.modelId === store.modelId) appliedReadError.value = '修改已应用，但新图读取失败。请重试读取。';
  } finally { appliedReadBusy.value = false; }
}

watch(() => [store.projectId, store.modelId], () => { mindmapResult.value = null; analysisDirty.value = false; });
watch(() => store.draftToken?.draft_id, value => { if (value && !store.isReadonly) mindmapOpened.value = true; });
watch(() => store.isReadonly, value => { if (value) { editorMode.value = 'OPD'; assistantKind.value = 'OPD'; } });

const layoutLeaveOpen = ref(false);
let layoutLeaveResolve: ((accepted: boolean) => void) | undefined;
const layoutLeaveFocus = useDialogFocus(layoutLeaveOpen, () => resolveLayoutLeave(false));
function resolveLayoutLeave(accepted: boolean) {
  if (store.saving) return;
  layoutLeaveOpen.value = false; layoutLeaveResolve?.(accepted); layoutLeaveResolve = undefined;
}
function prepareLayoutLeave(): Promise<boolean> {
  if (!store.layoutDirty) return Promise.resolve(true);
  if (layoutLeaveResolve) return Promise.resolve(false);
  layoutLeaveFocus.captureTrigger(); layoutLeaveOpen.value = true;
  return new Promise(resolve => { layoutLeaveResolve = resolve; });
}
function discardLayoutLeave() {
  if (store.saving || store.pendingDelivery) return;
  store.discardLayouts(); resolveLayoutLeave(true);
}
async function saveLayoutLeave() {
  if (await finishInputs() && await store.saveDraft()) resolveLayoutLeave(true);
}
async function prepareLeave(keepAnalysis = false) {
  return await finishInputs() && (keepAnalysis || !(analysisDirty.value || mindmapEditor.value?.pendingRename) || await prepareAnalysis()) && await prepareLayoutLeave();
}

const bottomPanelHeight = ref(240);
const leftTab = ref<'navigation' | 'assistant'>('navigation');
const assistantOpened = ref(false);
const opdAssistant = ref<InstanceType<typeof AssistantPanel>>();
const navigationWidth = ref<number>(), assistantWidth = ref(360);
const navigatorWidth = computed({ get: () => leftTab.value === 'assistant' ? assistantWidth.value : navigationWidth.value,
  set: (width: number | undefined) => { if (leftTab.value === 'assistant') assistantWidth.value = width ?? 360; else navigationWidth.value = width; } });
function showFullscreenAssistant(target: HTMLElement | null) {
  fullscreenAssistantTarget.value = target;
  if (target) void selectLeftTab('assistant', false);
}
async function selectLeftTab(tab: 'navigation' | 'assistant', focus = true) {
  if (tab === 'assistant') assistantOpened.value = true;
  leftTab.value = tab;
  if (focus) { await nextTick(); workbenchRoot.value?.querySelector<HTMLElement>(`[data-testid="left-tab-${tab}"]`)?.focus(); }
}
const highlightedNodeIds = computed(() => store.highlightedMethodNodeIds.length
  ? [...store.highlightedTextNodeIds, ...store.highlightedMethodNodeIds] : store.highlightedTextNodeIds);
const highlightedRelationIds = computed(() => store.highlightedMethodFactId
  ? [...store.highlightedTextRelationIds, store.highlightedMethodFactId] : store.highlightedTextRelationIds);
const navigationContexts = computed(() => previewNavigation(store.contexts, assistantPreview.value).map(context => {
  const root = context.kind === "SYSTEM_DIAGRAM" && !context.parentId;
  const label = root && (!context.label.trim() || /^(?:SD|系统图|根系统图)$/i.test(context.label.trim())) ? store.modelName : context.label;
  return { ...context, label, title: context.preview ? `${label}（未提交预览）` : root ? `${label}（SD · 根图）` : label };
}));
const { visibleContexts, collapsedContexts, hasChildren, toggleContext } = useContextTree(navigationContexts, displayedContextId,
  computed(() => store.projectId && store.modelId ? JSON.stringify([store.projectId, store.modelId]) : ""));
const contextMenu = ref<{ id: string; x: number; y: number } | null>(null);
const opdExportError = ref(""), opdExporting = ref(false);
const canExportOpd = computed(() => store.workbench.resourceState === "ready" && !store.saving && !store.pendingDelivery
  && store.workbench.commandState !== "submitting" && !opdExporting.value);
async function exportOpdJson() {
  const context = contextMenu.value?.id;
  if (!context || !canExportOpd.value || !await finishInputs()) return;
  if (store.layoutDirty) { opdExportError.value = "布局尚未保存，请先手动保存再导出 OPD JSON。"; contextMenu.value = null; return; }
  contextMenu.value = null; opdExporting.value = true; opdExportError.value = "";
  try {
    const source = store.draftToken && store.workbench.locationMode === "HEAD" ? { draft_token: store.draftToken } : { revision_id: store.workbench.revision };
    const data = await localRuntimeApi.exportOpdJson(projectId.value, modelId.value, context, source);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    if (blob.size > 10 * 1024 * 1024) throw new Error("OPD JSON 超过 10 MiB，请缩小导出范围");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${contextLabel(context).replace(/[\\/:*?"<>|]/g, "_")}.opd.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) { opdExportError.value = cause instanceof Error ? cause.message : "OPD JSON 导出失败"; }
  finally { opdExporting.value = false; }
}

const contextDeleteMenuButton = ref<HTMLButtonElement>();
const contextMenuPanel = ref<HTMLElement>();
const contextDeleteFocus = useDialogFocus(computed(() => store.contextDelete.open), store.cancelContextDelete);
function contextLabel(id: string) { return store.contexts.find(item => item.id === id)?.label ?? id; }
function canDeleteContext(id: string) {
  const context = store.contexts.find(item => item.id === id);
  return !!store.draftToken && !!context?.parentId && (context.kind === "PROCESS_REFINEMENT" || context.kind === "OBJECT_REFINEMENT") && !store.isReadonly
    && !store.saving && store.workbench.commandState !== "submitting" && !store.contextDelete.open && !store.autoLayoutPreview
    && !refinementSubmitting.value && store.relationCandidate.phase === "idle" && store.controlCandidate.phase === "idle" && store.structuralUpdateCandidate.phase === "idle";
}
async function openContextMenu(event: MouseEvent, id: string) {
  contextMenu.value = { id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 160)) };
  await nextTick();
  if (contextDeleteMenuButton.value && !contextDeleteMenuButton.value.disabled) contextDeleteMenuButton.value.focus();
  else contextMenuPanel.value?.focus();
}
async function previewContextDelete() {
  const id = contextMenu.value?.id;
  if (!id || !canDeleteContext(id) || !await finishInputs()) return;
  contextDeleteFocus.captureTrigger(); contextMenu.value = null; closeRefinement();
  await store.requestContextDelete(id);
}
async function submitContextDelete() {
  const parent = await store.confirmContextDelete();
  if (parent) openContext(parent);
}
watch(() => route.fullPath, () => { contextMenu.value = null; });
const { childContexts, refinedElementIds, canRefine, refinementName, refinementSubmitting, refinementContextId, refinementInputs, canOpenRefinement, closeRefinement, navigateContext, openRefinement, submitRefinement } = useOpdRefinement({ store, route, openContext: id => openContext(id) });
const canvasSurface = ref<HTMLDivElement>();
const editorPanel = ref<HTMLElement>();
const showRelationNames = ref(false);
const canvasEditor = ref<InstanceType<typeof OpdCanvas>>();
function addElement(kind: "OBJECT" | "PROCESS") {
  void store.addElement(kind, canvasEditor.value?.getElementPosition?.());
}
usePreviewViewport({ canvasEditor, assistantPreview, autoLayoutPreview: () => store.autoLayoutPreview, nodes: () => store.workbench.nodes, preserveAssistantViewportOnExit: () => preserveAppliedViewport.value });
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
async function selectCanvasConstruct(id: string) {
  if (!propertyNameEditor.value || await propertyNameEditor.value.finishNameEdit()) await store.selectConstruct(id);
}
async function selectCanvasNodes(ids: string[]) {
  if (!propertyNameEditor.value || await propertyNameEditor.value.finishNameEdit()) store.selectNodes(ids);
}
const activeRefineeId = computed(() => store.contexts.find(item => item.id === displayedContextId.value)?.refineeId);
watch(() => [store.modelLayout?.context, store.modelLayout?.loading], async () => {
  if (store.modelLayout?.preview && !store.modelLayout.loading) { await nextTick(); canvasEditor.value?.fitToView(); }
});
const overlappingIds = computed(() => overlappingNodeIds(store.workbench.nodes, activeRefineeId.value));
const collapsedFeaturesByContext = ref(new Map<string, string[]>());
const featureViewKey = computed(() => JSON.stringify([store.projectId, store.modelId, store.workbench.activeContextId, store.workbench.locationMode]));
const collapsedFeatures = computed(() => collapsedFeaturesByContext.value.get(featureViewKey.value)
  ?? (props.defaultFoldFeatures ? [...new Set(store.workbench.nodes
    .filter(node => (node.kind === "attribute" || node.kind === "operation") && node.ownerId)
    .map(node => node.ownerId!))] : undefined));
function rememberCollapsedFeatures(ids: string[]) {
  if (store.workbench.resourceState === "ready") collapsedFeaturesByContext.value.set(featureViewKey.value, ids);
}
watch(() => ({ key: featureViewKey.value, state: store.workbench.resourceState,
  features: store.workbench.nodes.filter(node => (node.kind === "attribute" || node.kind === "operation") && node.ownerId)
    .map(node => ({ id: node.id, ownerId: node.ownerId! })) }), (current, previous) => {
  // Only additions to an already loaded view are new features. Loading and
  // returning to a context must restore the user's explicit expansion choices.
  if (!props.defaultFoldFeatures || store.isReadonly || current.state !== "ready"
    || previous?.state !== "ready" || current.key !== previous.key) return;
  const previousIds = new Set(previous.features.map(node => node.id));
  const added = current.features.filter(node => !previousIds.has(node.id));
  const remembered = collapsedFeaturesByContext.value.get(current.key);
  if (remembered && added.length) collapsedFeaturesByContext.value.set(current.key,
    [...new Set([...remembered, ...added.map(node => node.ownerId)])]);
});
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
watch(() => route.fullPath, () => { canvasLocationKey.value++; canvasInteractionTool.value = "select"; store.setViewportZoom(100); });
const projectId = computed(() => store.projectId);
const modelId = computed(() => store.modelId);
const relationPreview = computed(() => store.relationCandidate.previewSpec ?? store.controlCandidate.previewSpec ?? undefined);
const activeRelationCapabilityId = computed(() => store.relationCandidate.catalogItem?.capability_id ?? store.controlCandidate.selectedOption?.capability_ref.capability_id);
const inspectorDockVisible = computed(() => editorMode.value === 'OPD' && (store.rightPanel.open
  || store.controlCandidate.phase !== "idle"
  || (store.structuralUpdateCandidate.phase === "editing" && !store.structuralUpdateCandidate.inline)));
const constructMenuStyle = computed(() => ({ left: `${store.constructActions.anchor.x}px`, top: `${store.constructActions.anchor.y}px` }));
async function askAssistantAboutConstruct() {
  if (!props.assistantEnabled || store.isReadonly || !store.draftToken || runningAssistantContext.value || assistantApplying.value || appliedReadPending.value) return;
  const selection = store.constructActions.selectionId;
  const node = store.workbench.nodes.find(item => item.occurrenceId === selection);
  const relation = store.workbench.relations.find(item => item.occurrenceId === selection);
  if (!node && !relation) return;
  const context = store.contexts.find(item => item.id === store.workbench.activeContextId);
  const kinds = { object: '对象', process: '过程', attribute: '属性', operation: '操作', state: '状态' };
  const name = (id: string) => store.workbench.nodes.find(item => item.id === id)?.label ?? id;
  const details = node
    ? `${kinds[node.kind]}：${node.label}\n标识：${node.id}${node.remark ? `\n备注：${node.remark}` : ''}`
    : `关系：${name(relation!.sourceId)} → ${name(relation!.targetId)}\n标识：${relation!.id}${relation!.labels?.length ? `\n关系说明：${relation!.labels.map(label => label.text).join('、')}` : ''}`;
  const text = `请修改以下内容：\n当前 OPD：${context?.label ?? store.workbench.activeContextId}\n${details}\n修改要求：`;
  store.cancelConstructDelete();
  assistantKind.value = 'OPD';
  await selectLeftTab('assistant', false);
  await nextTick();
  await opdAssistant.value?.prefill(text);
}
const constructRefinementTarget = computed(() => store.workbench.nodes.find(node => node.occurrenceId === store.constructActions.selectionId
  && (node.kind === "object" || node.kind === "process")));
const constructChildContext = computed(() => constructRefinementTarget.value
  ? childContexts.value.find(context => context.refineeId === constructRefinementTarget.value!.id) : undefined);
const canExpandConstructRefinement = computed(() => !!constructChildContext.value && store.workbench.resourceState === "ready"
  && store.workbench.commandState !== "submitting" && !store.saving && !store.autoLayoutPreview && !refinementSubmitting.value && !store.constructActions.submitting
  && store.relationCandidate.phase === "idle" && store.controlCandidate.phase === "idle" && store.structuralUpdateCandidate.phase === "idle");
const constructRefinementDisabledReason = computed(() => {
  const node = constructRefinementTarget.value;
  if (!node) return "请选择对象或过程。";
  if (node.occurrenceRole !== "owned") return "引用元素不能在当前图创建子图。";
  if (constructChildContext.value) return "该元素已有子图。";
  if (!canOpenRefinement.value || refinementSubmitting.value || store.constructActions.submitting) return "当前状态不可添加子图。";
  return "";
});
const blankMenuAnchor = ref<{ clientX: number; clientY: number } | null>(null);
const contextLayoutDisabled = computed(() => !store.draftToken || store.isReadonly || !!store.autoLayoutPreview
  || store.workbench.commandState === "submitting" || store.relationCandidate.phase !== "idle"
  || store.controlCandidate.phase !== "idle" || store.structuralUpdateCandidate.phase !== "idle");
watch(() => [route.fullPath, store.workbench.activeContextId, store.editingIdentity, canvasInteractionTool.value], () => {
  blankMenuAnchor.value = null;
});
function requestBlankMenu(anchor: { clientX: number; clientY: number }) {
  store.cancelConstructDelete();
  blankMenuAnchor.value = anchor;
}

function activateBottomTab(tab: typeof store.workbench.bottomTab) {
  if (store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab) store.workbench.bottomPanelExpanded = false;
  else store.setBottomTab(tab);
}

async function requestConstructActions(selectionId: string, anchor?: { clientX: number; clientY: number }, activation: "menu" | "direct" = "menu") {
  const location = route.fullPath;
  if (!await finishInputs() || location !== route.fullPath) return;
  blankMenuAnchor.value = null;
  const bounds = canvasSurface.value?.getBoundingClientRect();
  const menuWidth = 208;
  const menuHeight = 224;
  const gutter = 8;
  const localX = anchor && bounds ? anchor.clientX - bounds.left : gutter;
  const localY = anchor && bounds ? anchor.clientY - bounds.top : gutter;
  const x = Math.max(gutter, Math.min(localX, Math.max(gutter, (bounds?.width ?? menuWidth + gutter * 2) - menuWidth - gutter)));
  const y = Math.max(gutter, Math.min(localY, Math.max(gutter, (bounds?.height ?? menuHeight + gutter * 2) - menuHeight - gutter)));
  await store.requestConstructActions(selectionId, { x, y }, activation);
}

async function chooseConstructDelete(option: Parameters<typeof store.chooseConstructDelete>[0]) {
  const location = route.fullPath, selection = store.constructActions.selectionId;
  if (await finishInputs() && location === route.fullPath && selection === store.constructActions.selectionId)
    await store.chooseConstructDelete(option);
}

function openConstructProperties() {
  store.cancelConstructDelete();
  store.openRightPanel();
}

async function openConstructRefinement() {
  const location = route.fullPath, selection = store.constructActions.selectionId;
  if (!await finishInputs() || location !== route.fullPath || selection !== store.constructActions.selectionId) return;
  const node = constructRefinementTarget.value;
  if (!node || constructRefinementDisabledReason.value) return;
  await store.selectConstruct(node.id);
  store.cancelConstructDelete();
  refinementName.value = `${node.label} 细化`;
  if (refinementContextId.value !== store.workbench.activeContextId) openRefinement(store.workbench.activeContextId);
  await nextTick();
  refinementInputs.value[0]?.focus();
}

function expandConstructRefinement() {
  const child = constructChildContext.value;
  if (!child || !canExpandConstructRefinement.value) return;
  store.cancelConstructDelete();
  navigateContext(child.id);
}

async function toggleProperties() {
  if (store.rightPanel.open) {
    if (await finishInputs()) store.closeRightPanel();
  }
  else store.openRightPanel();
}

async function locateText(line: Parameters<typeof store.locateText>[0]) {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) store.locateText(line);
}

function setCanvasInteractionTool(tool: "select" | "pan") {
  if (relationSubmitting.value) return;
  if (inlineRelationEditing.value) store.cancelStructuralUpdate();
  if (tool === "pan") store.cancelRelationCandidate();
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

function deleteActionDisabledReason(option: WorkbenchCapabilityOption) {
  if (option.enabled || !option.reason_codes.length) return undefined;
  if (option.reason_codes.includes("DELETE_DEPENDENCY_EXISTS")) return "存在关联依赖，无法直接删除";
  return "当前状态下无法删除";
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
  const location = route.fullPath;
  if (!await finishInputs() || location !== route.fullPath) return;
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

async function requestAutoLayout() {
  store.cancelModelLayout?.();
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) store.previewAutoLayout();
}
async function requestModelLayout() {
  const location = route.fullPath;
  if (!await finishInputs() || location !== route.fullPath) return;
  if (store.layoutDirty) return store.unavailable("请先保存或放弃当前图的布局改动，再预览整个模型。");
  store.cancelAutoLayout();
  await store.previewModelLayout();
}
function cancelAutoLayout() {
  store.cancelAutoLayout();
  canvasSurface.value?.parentElement?.querySelector<HTMLButtonElement>('[data-testid="opd-layout-menu-toggle"]')?.focus();
}

async function requestLayoutArrangement(action: LayoutAction) {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) await store.arrangeSelection(action);
}

async function requestLayoutHistory(redo: boolean) {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) await (redo ? store.redo() : store.undo());
}

const { requestSave, openVersion, openContext, copyPermalink } = useWorkbenchNavigation({ store, route, router, finishInputs, root: workbenchRoot, globalShortcuts: props.globalShortcuts,
  canUseModelHistory: () => editorMode.value === 'OPD', hasUnsavedAnalysis: () => analysisDirty.value || !!mindmapEditor.value?.pendingRename,
  requestHistory: requestLayoutHistory,
  hasPendingInputs: () => propertyNameEditor.value?.hasPendingStateEdit ?? false });
async function runModelValidation() {
  const location = route.fullPath;
  if (editorMode.value === 'ANALYSIS') await selectEditorMode('OPD');
  else if (!await finishInputs()) return;
  if (editorMode.value !== 'ANALYSIS' && route.fullPath === location) await store.runValidation();
}
async function createMethodLink(target: string, kind: ArchitectureLinkKind) {
  const location = route.fullPath;
  if (await finishInputs() && route.fullPath === location) await store.createArchitectureLink(target, kind);
}
async function deleteMethodLink(id: string) {
  const location = route.fullPath;
  if (await finishInputs() && route.fullPath === location) await store.deleteArchitectureLink(id);
}
async function classifyMethod(level: ArchitectureLevel | null) {
  const location = route.fullPath;
  if (await finishInputs() && route.fullPath === location) await store.updateArchitectureClassification(level);
}
async function navigateMethod(context: string, target?: string) {
  const location = route.fullPath;
  if (!await finishInputs() || route.fullPath !== location) return;
  const destination = store.locateMethodContext(context, target);
  if (destination && destination !== store.workbench.activeContextId) openContext(destination);
}
watch(() => store.highlightedMethodNodeIds, async targets => {
  if (targets.length !== 1 || store.highlightedMethodFactId) return;
  await nextTick();
  if (targets === store.highlightedMethodNodeIds) canvasEditor.value?.locateConstruct?.(targets[0]!);
});
async function locateMethod(evidence: MethodEvidence) {
  const location = route.fullPath;
  if (!await finishInputs() || route.fullPath !== location) return;
  const context = store.locateMethodEvidence(evidence);
  if (context && context !== store.workbench.activeContextId) openContext(context);
}
watch(() => store.highlightedMethodFactId, async target => {
  if (!target) return;
  await nextTick();
  if (target === store.highlightedMethodFactId) canvasEditor.value?.locateConstruct?.(target);
});

async function locateModelFinding() {
  const location = route.fullPath;
  if (!await finishInputs() || route.fullPath !== location) return;
  const context = await store.locateFinding();
  if (context && route.fullPath === location && context !== store.workbench.activeContextId) openContext(context);
}
watch(() => store.highlightedFindingTargetId, async target => {
  if (!target) return;
  await nextTick();
  if (target === store.highlightedFindingTargetId) canvasEditor.value?.locateConstruct?.(target);
});


watch(() => store.relationCandidate.phase, async (phase) => {
  if (phase !== "candidate-preview" || store.relationCandidate.autoCommitting) return;
  relationComposing.value = false;
  await nextTick();
  relationParameterEditor.value?.querySelector<HTMLElement>("input, select")?.focus();
});

async function locateConstruct(semanticId: string, contextId?: string): Promise<boolean> {
  const project = store.projectId, model = store.modelId;
  await selectEditorMode('OPD');
  if (editorMode.value !== 'OPD') return false;
  if (contextId && contextId !== store.workbench.activeContextId) await store.selectContext(contextId);
  if (store.projectId !== project || store.modelId !== model || (contextId && store.workbench.activeContextId !== contextId)) return false;
  const target = [...store.workbench.nodes, ...store.workbench.relations].find(item => item.id === semanticId);
  if (!target) return false;
  if (contextId) openContext(contextId);
  await store.selectConstruct(target.id); await nextTick();
  for (let attempt = 0; attempt < 4; attempt++) {
    if (canvasEditor.value?.locateConstruct?.(target.id)) return true;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (store.projectId !== project || store.modelId !== model || (contextId && store.workbench.activeContextId !== contextId)) return false;
  }
  return false;
}
defineExpose({ prepareLeave, save: async () => { await requestSave(); }, saveWithResult: requestSave, validate: runModelValidation, resize: () => canvasEditor.value?.fitToView(), locateConstruct });
</script>

<style scoped>
.history-recovery-error { display: flex; align-items: center; gap: 10px; padding: 6px 12px; color: #b42318; background: #fff7f5; flex-shrink: 0; }
.history-recovery-error span { min-width: 0; overflow-wrap: anywhere; }
.workbench-grid.workbench-grid--graph { grid-template-columns: minmax(0, 1fr); }
.canvas-layout-notice { position: absolute; z-index: 6; top: 12px; left: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; max-width: calc(100% - 24px); padding: 8px 12px; border: 1px solid #e8d39c; border-radius: 6px; background: #fffcf3; color: #66562b; font-size: 13px; }
.canvas-layout-notice button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.editor-panel--opd { grid-template-rows: auto auto minmax(0, 1fr); }
.editor-panel--analysis { grid-template-rows: auto minmax(0, 1fr); }
.editor-modebar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 5px 12px; border-bottom: 1px solid #dbe3ea; background: #fff; min-width: 0; font-size: 12px; }
.editor-modebar button { border: 0; border-radius: 4px; padding: 6px 10px; color: #65758a; background: transparent; cursor: pointer; }
.editor-modebar button[aria-selected="true"] { color: #0b6bcb; background: #e6f0fa; }
.editor-modebar span { color: #748698; }
.editor-modebar .editor-modebar__assistant { margin-left: auto; color: #0b6bcb; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.assistant-canvas-preview { position: absolute; z-index: 26; top: 12px; left: 12px; max-width: calc(100% - 24px); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 9px 12px; border: 1px solid #a8c9e9; border-radius: 6px; background: #fff; box-shadow: 0 4px 16px #162b431f; color: #344250; font-size: 12px; }
.assistant-canvas-preview button { min-height: 28px; padding: 4px 8px; font-size: 12px; }
.opd-export-error { color: #b42318; font-size: 13px; margin: 8px 12px; }
.opd-menu-backdrop { position: fixed; inset: 0; z-index: 100; }
.opd-tree-menu { position: fixed; min-width: 210px; }
.opd-delete-dialog { max-height: calc(100dvh - 32px); overflow-y: auto; }
.opd-delete-contexts { max-height: 160px; overflow-y: auto; padding-left: 24px; overflow-wrap: anywhere; }
</style>
