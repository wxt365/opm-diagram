<template>
  <section class="workbench" :class="{ 'workbench--bottom-collapsed': !store.workbench.bottomPanelExpanded }" :style="{ '--workbench-bottom-height': `${bottomPanelHeight}px`, '--workbench-navigator-width': navigatorWidth ? `${navigatorWidth}px` : undefined }" data-testid="p03-workbench">
    <header class="workbench-header">
      <div class="workbench-header__context">
        <button class="back-link" type="button" :title="`项目 / ${store.projectName}`" @click="router.push(`/projects/${projectId}`)">项目 / {{ store.projectName }}</button>
        <strong :title="store.modelName">{{ store.modelName }}</strong>
        <span class="profile-tag" :title="store.profileLabel">{{ store.profileLabel }}</span>
      </div>
      <div class="workbench-header__status">
        <div class="workbench-header__revision-group">
          <span class="revision-tag" :title="`最近版本 / Latest revision: ${store.workbench.revision || '-'}`" data-testid="hs-draft-identity">{{ store.draftToken && store.workbench.locationMode === 'HEAD' ? `活动草稿 · 编辑 ${store.draftToken.edit_seq}` : `${store.workbench.locationMode === 'HEAD' ? '草稿' : '固定版本'} ${store.workbench.revision || '-'}` }}</span>
          <span v-if="store.workbench.resourceState === 'ready' && store.isReadonly" class="readonly-tag" role="status" title="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." aria-label="当前修订只读，语义和布局编辑已禁用。 / Read-only revision; model and layout editing disabled." data-testid="p03-readonly-banner"><Lock :size="12" aria-hidden="true" />只读</span>
          <select aria-label="打开版本" data-testid="p03-version-select" :value="store.workbench.locationMode === 'HEAD' ? 'head' : store.workbench.revision" :disabled="store.workbench.resourceState !== 'ready' || store.workbench.commandState === 'submitting'" @change="openVersion(($event.target as HTMLSelectElement).value)">
            <option value="head">活动草稿</option>
            <option v-for="revision in store.revisions" :key="revision.id" :value="revision.id">{{ revision.kind === 'BASELINE' ? 'Baseline' : 'Revision' }} {{ revision.sequence }}</option>
          </select>
          <span class="save-tag" role="status" data-testid="hs-save-state">{{ store.saveLabel }}</span>
        </div>
        <span class="workbench-header__divider" aria-hidden="true" />
        <div class="workbench-header__actions">
          <button v-if="store.workbench.locationMode === 'EXACT'" class="button button--secondary workbench-header__button" type="button" data-testid="p03-return-head" @click="openVersion('head')"><Undo2 :size="15" aria-hidden="true" /><span>返回活动草稿</span></button>
          <button class="button button--secondary workbench-header__button" type="button" data-testid="p03-copy-permalink" :disabled="store.workbench.resourceState !== 'ready' || store.saving" @mousedown.prevent @click="copyPermalink"><Link2 :size="15" aria-hidden="true" /><span>复制永久链接</span></button>
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

      <div class="workbench-grid" :class="{ 'workbench-grid--inspector-open': inspectorDockVisible }">
        <div id="workbench-left-dock" class="navigator-dock" :class="{ 'navigator-dock--assistant': leftTab === 'assistant' }" data-testid="workbench-left-dock">
          <div class="left-workspace-tabs" role="tablist" aria-label="左侧工作区">
            <button id="left-tab-navigation" type="button" role="tab" :aria-selected="leftTab === 'navigation'" aria-controls="opd-navigator" :tabindex="leftTab === 'navigation' ? 0 : -1" data-testid="left-tab-navigation" @click="leftTab = 'navigation'" @keydown.right.prevent="selectLeftTab('assistant')">OPD 导航</button>
            <button id="left-tab-assistant" type="button" role="tab" :aria-selected="leftTab === 'assistant'" aria-controls="left-assistant-content" :tabindex="leftTab === 'assistant' ? 0 : -1" data-testid="left-tab-assistant" @click="selectLeftTab('assistant', false)" @keydown.left.prevent="selectLeftTab('navigation')">智能助手</button>
          </div>
          <aside v-show="leftTab === 'navigation'" id="opd-navigator" class="workbench-panel navigator-panel" aria-label="OPD 导航" data-testid="opd-navigator">
            <div class="navigator-heading"><span>图列表</span><span class="navigator-count" :aria-label="`${store.contexts.length} 张图`">{{ store.contexts.length }}</span></div>
            <nav class="context-tree" aria-label="OPD 图列表">
              <template v-for="context in navigationContexts" :key="context.id">
                <div class="context-tree__row" :class="{ 'is-current': context.id === store.workbench.activeContextId }">
                  <button class="context-tree__item" :style="{ paddingInlineStart: `${10 + Math.min(context.depth, 6) * 14}px` }" :title="context.title" :aria-current="context.id === store.workbench.activeContextId ? 'page' : undefined" type="button" :data-testid="`p03-context-${context.id}`" @click="navigateContext(context.id)" @contextmenu.prevent="openContextMenu($event, context.id)">
                    <svg v-if="context.depth" class="context-tree__branch" viewBox="0 0 10 24" width="10" height="24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M1 0v12h8" /></svg>
                    <svg class="context-tree__icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2" y="6" width="5" height="8" rx="1" /><rect x="12" y="2" width="6" height="5" rx="1" /><rect x="12" y="13" width="6" height="5" rx="1" /><path d="M7 10h3V4.5h2m-2 5.5v5.5h2" /></svg>
                    <span class="context-tree__label">{{ context.label }}</span>
                  </button>
                  <button class="context-tree__add" type="button" :aria-label="`在 ${context.label} 下创建子图`" :title="`在 ${context.label} 下创建子图`" :aria-expanded="refinementContextId === context.id" :disabled="!canOpenRefinement || refinementSubmitting" :data-testid="`opd-add-${context.id}`" @mousedown.prevent @click="openRefinement(context.id)"><Plus :size="15" aria-hidden="true" /></button>
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
          <div v-if="assistantOpened" v-show="leftTab === 'assistant'" id="left-assistant-content" class="left-assistant-content" role="tabpanel" aria-labelledby="left-tab-assistant">
            <div v-show="assistantKind === 'OPD'" class="assistant-conversation"><AssistantPanel :scope="assistantScope" :context-name="navigationContexts.find(item => item.id === store.workbench.activeContextId)?.label ?? 'OPD'" :token="store.draftToken" :readonly="store.isReadonly || !store.draftToken" :selected-ids="store.selectedIds" @preview="receiveAssistantPreview($event, 'OPD')" @applied="refreshAfterAssistant" /></div>
            <div v-if="mindmapResult" v-show="assistantKind === 'ANALYSIS'" class="assistant-conversation"><AssistantPanel ref="analysisAssistant" :scope="analysisScope" context-name="模型分析" :token="store.draftToken" :readonly="store.isReadonly || !store.draftToken" :selected-ids="[]" :analysis-revision="mindmapResult.document.revision" :analysis-dirty="analysisDirty" :analysis-labels="analysisLabels" :prepare-analysis="prepareAnalysis" @preview="receiveAssistantPreview($event, 'ANALYSIS')" @applied="refreshAfterAssistant" @analysis-updated="reloadAnalysis" @running="analysisRunning = $event" @request-conversion="requestAnalysisConversion" /></div>
          </div>
          <WorkbenchNavigatorResizer :width="navigatorWidth" :default-width="leftTab === 'assistant' ? 360 : undefined" :inspector-open="inspectorDockVisible" @resize="navigatorWidth = $event" />
        </div>

        <section ref="editorPanel" class="editor-panel" :class="{ 'editor-panel--opd': editorMode === 'OPD', 'editor-panel--analysis': editorMode === 'ANALYSIS' }">
          <div class="editor-modebar" role="tablist" aria-label="建模视图">
            <button type="button" role="tab" :aria-selected="editorMode === 'OPD'" data-testid="editor-mode-opd" @click="selectEditorMode('OPD')">OPD 建模</button>
            <button type="button" role="tab" :aria-selected="editorMode === 'ANALYSIS'" :disabled="store.isReadonly || !store.draftToken" data-testid="editor-mode-analysis" @click="selectEditorMode('ANALYSIS')">脑图分析</button>
            <span v-if="editorMode === 'ANALYSIS'">模型级分析 · 独立保存</span>
            <button v-if="editorMode === 'ANALYSIS'" type="button" class="editor-modebar__assistant" @click="selectLeftTab('assistant', false)">打开分析助手</button>
            <button v-if="editorMode === 'OPD' && selectedAnalysisSource" type="button" class="editor-modebar__assistant" data-testid="mindmap-locate-source" :disabled="selectedAnalysisSource.removed" @click="locateAnalysisSource">{{ selectedAnalysisSource.removed ? '分析来源已移除' : `分析来源：${selectedAnalysisSource.label}` }}</button>
          </div>
          <div v-show="editorMode === 'OPD'" class="editor-toolbar" role="toolbar" aria-label="OPM 画布工具 / OPM canvas tools" data-testid="p03-canvas-toolchain">
            <div class="tool-group" aria-label="画布工具">
              <button v-if="store.draftToken" class="tool-button tool-button--icon" type="button" title="保存 / Save (Ctrl/Cmd+S)" aria-label="保存 / Save (Ctrl/Cmd+S)" :disabled="store.isReadonly || store.saving" data-testid="hs-save" @mousedown.prevent @click="requestSave"><Save :size="18" aria-hidden="true" /></button>
              <button v-if="store.draftToken" class="tool-button tool-button--icon" type="button" title="撤销布局 / Undo layout (Ctrl/Cmd+Z)" aria-label="撤销布局" :disabled="!store.canUndoLayout" data-testid="opd-undo-layout" @mousedown.prevent @click="requestLayoutHistory(false)"><Undo2 :size="18" aria-hidden="true" /></button>
              <button v-if="store.draftToken" class="tool-button tool-button--icon" type="button" title="重做布局 / Redo layout (Ctrl/Cmd+Shift+Z)" aria-label="重做布局" :disabled="!store.canRedoLayout" data-testid="opd-redo-layout" @mousedown.prevent @click="requestLayoutHistory(true)"><Redo2 :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': canvasInteractionTool === 'select' }" type="button" title="选择（空白拖动平移；Shift/Ctrl/Cmd 点击多选） / Select" aria-label="选择 / Select" :aria-pressed="canvasInteractionTool === 'select'" data-testid="p03-tool-select" @click="setCanvasInteractionTool('select')"><MousePointer2 :size="18" aria-hidden="true" /></button>
              <button class="tool-button tool-button--icon" :class="{ 'is-active': canvasInteractionTool === 'pan' }" type="button" title="平移画布 / Pan canvas" aria-label="平移画布 / Pan canvas" :aria-pressed="canvasInteractionTool === 'pan'" data-testid="p03-tool-pan" @click="setCanvasInteractionTool('pan')"><Hand :size="18" aria-hidden="true" /></button>
            </div>
            <LayoutToolMenu v-if="store.draftToken" :disabled="store.isReadonly || store.workbench.commandState === 'submitting' || store.relationCandidate.phase !== 'idle' || store.controlCandidate.phase !== 'idle' || store.structuralUpdateCandidate.phase !== 'idle'" :state="store.layoutArrangement" :auto-layout-disabled="!store.canAutoLayout" @arrange="requestLayoutArrangement" @auto-layout="requestAutoLayout" />
            <span class="editor-toolbar__separator" aria-hidden="true" />
            <div class="tool-group" aria-label="P0 建模命令">
              <button class="tool-button tool-button--icon" type="button" title="创建对象 / Create Object" aria-label="创建对象 / Create Object" :disabled="store.isReadonly" data-testid="p03-tool-object" @click="store.addElement('OBJECT')"><ElementToolSymbol kind="object" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建过程 / Create Process" aria-label="创建过程 / Create Process" :disabled="store.isReadonly" data-testid="p03-tool-process" @click="store.addElement('PROCESS')"><ElementToolSymbol kind="process" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建属性 / Create Attribute" aria-label="创建属性 / Create Attribute" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-attribute" @click="store.addFeature('ATTRIBUTE')"><ElementToolSymbol kind="attribute" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建操作 / Create Operation" aria-label="创建操作 / Create Operation" :disabled="store.isReadonly || !store.selectedNode || (store.selectedNode.kind !== 'object' && store.selectedNode.kind !== 'process')" data-testid="p03-tool-operation" @click="store.addFeature('OPERATION')"><ElementToolSymbol kind="operation" /></button>
              <button class="tool-button tool-button--icon" type="button" title="创建状态 / Create State" aria-label="创建状态 / Create State" :disabled="store.isReadonly || store.workbench.commandState === 'submitting' || store.selectedNode?.kind !== 'object' || !store.stateCreateOption?.enabled" data-testid="p03-tool-state" @click="armStateCreation"><ElementToolSymbol kind="state" /></button>
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
              <button class="tool-button tool-button--icon" :class="{ 'is-active': store.rightPanel.open }" type="button" :title="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" :aria-label="store.rightPanel.open ? '关闭属性 / Close properties' : '打开属性 / Open properties'" :disabled="!store.workbench.selectedId" data-testid="p03-right-panel-open" @click="toggleProperties"><PanelRightOpen :size="18" aria-hidden="true" /></button>
            </div>
          </div>
          <div v-show="editorMode === 'OPD'" ref="canvasSurface" class="canvas-surface">
            <div v-if="assistantPreview" class="assistant-canvas-preview" role="status" data-testid="assistant-canvas-preview"><span>{{ assistantPreview.status === 'staging' ? '实时生成预览' : assistantPreview.status === 'blocked' ? '待修正预览' : '修改预览' }} · {{ assistantPreview.summary }} · 尚未应用</span><button class="button button--secondary" type="button" @click="assistantPreview = null">退出预览</button></div>
            <CanvasContextMenu v-if="blankMenuAnchor" :anchor="blankMenuAnchor" :disabled="!store.canAutoLayout || !!store.autoLayoutPreview" :actions-disabled="contextLayoutDisabled" :can-undo="store.canUndoLayout" :can-redo="store.canRedoLayout" :state="store.layoutArrangement" @close="blankMenuAnchor = null" @auto-layout="requestAutoLayout" @history="requestLayoutHistory" @arrange="requestLayoutArrangement" />
            <AutoLayoutPreviewBar v-if="store.autoLayoutPreview" :direction="store.autoLayoutPreview.direction" :busy="store.applyingAutoLayout" @direction="store.previewAutoLayout" @cancel="cancelAutoLayout" @apply="store.applyAutoLayout" />
            <div class="canvas-frame">
              <OpdCanvas ref="canvasEditor" :key="canvasLocationKey" :keyboard-disabled="editorMode !== 'OPD'" :readonly="store.isReadonly || store.workbench.commandState === 'submitting' || !!store.autoLayoutPreview || !!assistantPreview" :layout-preview="!!store.autoLayoutPreview || !!assistantPreview" :nodes="assistantCanvas.nodes" :relations="assistantCanvas.relations" :refined-element-ids="refinedElementIds" :selected-id="store.workbench.selectedId" :highlighted-text-node-ids="highlightedNodeIds" :highlighted-text-relation-ids="highlightedRelationIds" :selected-ids="store.draftToken ? store.selectedIds : undefined" :zoom="store.workbench.zoom" :interaction-tool="canvasInteractionTool" :relation-gesture-phase="store.relationCandidate.phase" :relation-preview="relationPreview" :relation-editor-target="relationEditorTarget" :highlighted-finding-target-id="store.highlightedFindingTargetId || undefined" :highlighted-finding-node-ids="store.highlightedFindingNodeIds" :begin-name-edit="store.beginElementNameEdit" :submit-name-edit="store.renameElement" @viewport-zoom="store.setViewportZoom" @select="store.selectConstruct" @move="store.moveElement" @selection="store.selectNodes" @move-batch="store.moveElements" @relation-intent="store.handleRelationGesture" @blank-menu-requested="requestBlankMenu" @construct-actions-menu-requested="requestConstructActions" @relation-editor-anchor="relationEditorAnchor = $event" @relation-label-edit-requested="openRelationLabelEditor" />
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
          <MindmapPanel v-if="mindmapOpened && store.draftToken" v-show="editorMode === 'ANALYSIS'" ref="mindmapEditor" :project-id="store.projectId" :model-id="store.modelId" :token="store.draftToken" :readonly="store.isReadonly" :generating="analysisRunning" :contexts="navigationContexts" :active-context="store.workbench.activeContextId" :targets="mindmapTargets" @changed="mindmapResult = $event; analysisDirty = false" @invalidated="analysisDirty = true; assistantPreview = null" @convert="convertMindmap" />
        </section>

        <WorkbenchInspector v-if="inspectorDockVisible" ref="propertyNameEditor" :store="store" :canvas-location-key="canvasLocationKey" @state-editor="Object.assign(store.stateEditor, $event)" @structural-update-candidate="Object.assign(store.structuralUpdateCandidate, $event)" />
      </div>
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
      <form :ref="contextDeleteFocus.setDialogElement" class="dialog-panel opd-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="opd-delete-title" aria-describedby="opd-delete-description" data-testid="opd-delete-dialog" @keydown="contextDeleteFocus.onDialogKeydown" @submit.prevent="submitContextDelete">
        <div class="dialog-panel__header"><h2 id="opd-delete-title">删除子图</h2></div>
        <p id="opd-delete-description" class="dialog-note">将删除此子图、全部下级图及图内专属内容。父图中的细化元素和历史版本会保留；此操作无法通过布局撤销恢复。</p>
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

    <WorkbenchBottomPanel :store="store" :height="bottomPanelHeight" @resize="bottomPanelHeight = $event" @toggle="store.workbench.bottomPanelExpanded = !store.workbench.bottomPanelExpanded" @activate-tab="activateBottomTab" @locate-finding="locateModelFinding" @locate-method="locateMethod" @create-method-link="createMethodLink" @delete-method-link="deleteMethodLink" @classify-method="classifyMethod" @navigate-method="navigateMethod" @open-history-revision="openHistoryRevision" />

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
import { Check, CornerDownRight, CornerUpLeft, Download, Hand, Link2, Lock, MousePointer2, PanelRightOpen, Plus, RefreshCw, Save, ShieldCheck, Trash2, Undo2, Redo2, X } from "@lucide/vue";
import { computed, nextTick, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";

import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { useWorkbenchNavigation } from "./useWorkbenchNavigation";
import OpdCanvas from "@/modules/workbench/OpdCanvas.vue";
import WorkbenchBottomPanel from "./WorkbenchBottomPanel.vue";
import MindmapPanel from "./MindmapPanel.vue";
import AssistantPanel from "./AssistantPanel.vue";
import { previewAssistant } from "./assistantPreview";
import type { AssistantProposal, AssistantScope } from "@/shared/api/assistantApi";
import WorkbenchNavigatorResizer from "./WorkbenchNavigatorResizer.vue";
import WorkbenchInspector from "./WorkbenchInspector.vue";
import ElementToolSymbol from "@/modules/workbench/ElementToolSymbol.vue";
import LayoutToolMenu from "./LayoutToolMenu.vue";
import AutoLayoutPreviewBar from "./AutoLayoutPreviewBar.vue";
import CanvasContextMenu from "./CanvasContextMenu.vue";
import CanvasZoomControls from "./CanvasZoomControls.vue";
import CanvasFullscreenButton from "./CanvasFullscreenButton.vue";
import type { ArchitectureLinkKind, ArchitectureLevel, MethodEvidence, MindmapResult } from "@/shared/api/generated/draftWorkspaceContract";
import type { LayoutAction } from "@/stores/workbench/layoutArrangement";
import RelationToolPalette from "@/modules/workbench/RelationToolPalette.vue";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";
import { localRuntimeApi } from "@/shared/api/localRuntimeApi";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

async function openHistoryRevision(revision: string) {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) openVersion(revision);
}

const route = useRoute();
const router = useRouter();
const store = useWorkbenchRuntimeStore();
const editorMode = ref<'OPD' | 'ANALYSIS'>('OPD'), assistantKind = ref<'OPD' | 'ANALYSIS'>('OPD');
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
async function reloadAnalysis() { await mindmapEditor.value?.reload(); }
async function selectEditorMode(mode: 'OPD' | 'ANALYSIS') {
  if (!await finishInputs() || mode === 'ANALYSIS' && store.isReadonly) return;
  if (mode === 'OPD' && analysisDirty.value && !await prepareAnalysis()) return;
  assistantPreview.value = null; editorMode.value = mode; assistantKind.value = mode;
  if (mode === 'ANALYSIS') { mindmapOpened.value = true; await selectLeftTab('assistant', false); await nextTick(); mindmapEditor.value?.fit(); }
}
function receiveAssistantPreview(proposal: AssistantProposal | null, kind: 'OPD' | 'ANALYSIS') {
  if (assistantKind.value !== kind) return;
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
const assistantScope = computed(() => ({ projectId: store.projectId, modelId: store.modelId, contextId: store.workbench.activeContextId }));
const assistantCanvas = computed(() => previewAssistant(assistantPreview.value, store.autoLayoutNodes, store.workbench.relations));
watch(() => [store.workbench.activeContextId, store.draftToken?.edit_seq, store.draftToken?.draft_id], () => { assistantPreview.value = null; });
async function refreshAfterAssistant(scope: AssistantScope) {
  if (scope.projectId !== store.projectId || scope.modelId !== store.modelId || store.workbench.locationMode !== 'HEAD') return;
  assistantPreview.value = null;
  await store.load(store.projectId, store.modelId, store.workbench.activeContextId, undefined, true, true);
  await reloadAnalysis();
}

watch(() => [store.projectId, store.modelId], () => { mindmapResult.value = null; analysisDirty.value = false; });
watch(() => store.draftToken?.draft_id, value => { if (value && !store.isReadonly) mindmapOpened.value = true; });
watch(() => store.isReadonly, value => { if (value) { editorMode.value = 'OPD'; assistantKind.value = 'OPD'; } });

onBeforeRouteLeave(async () => !analysisDirty.value || await prepareAnalysis());
onBeforeRouteUpdate(async (to, from) => to.path === from.path && to.query.revision === from.query.revision || !analysisDirty.value || await prepareAnalysis());

const bottomPanelHeight = ref(240);
const leftTab = ref<'navigation' | 'assistant'>('navigation');
const assistantOpened = ref(false);
const navigationWidth = ref<number>(), assistantWidth = ref(360);
const navigatorWidth = computed({ get: () => leftTab.value === 'assistant' ? assistantWidth.value : navigationWidth.value,
  set: (width: number | undefined) => { if (leftTab.value === 'assistant') assistantWidth.value = width ?? 360; else navigationWidth.value = width; } });
async function selectLeftTab(tab: 'navigation' | 'assistant', focus = true) {
  if (tab === 'assistant') assistantOpened.value = true;
  leftTab.value = tab;
  if (focus) { await nextTick(); document.getElementById(`left-tab-${tab}`)?.focus(); }
}
const highlightedNodeIds = computed(() => store.highlightedMethodNodeIds.length
  ? [...store.highlightedTextNodeIds, ...store.highlightedMethodNodeIds] : store.highlightedTextNodeIds);
const highlightedRelationIds = computed(() => store.highlightedMethodFactId
  ? [...store.highlightedTextRelationIds, store.highlightedMethodFactId] : store.highlightedTextRelationIds);
const navigationContexts = computed(() => store.contexts.map(context => {
  const root = context.kind === "SYSTEM_DIAGRAM" && !context.parentId;
  const label = root ? store.modelName : context.label;
  return { ...context, label, title: root ? `${label}（SD · 根图）` : label };
}));
const contextMenu = ref<{ id: string; x: number; y: number } | null>(null);
const opdExportError = ref(""), opdExporting = ref(false);
const canExportOpd = computed(() => store.workbench.resourceState === "ready" && !store.saving && !store.pendingDelivery
  && store.workbench.commandState !== "submitting" && !opdExporting.value);
async function exportOpdJson() {
  const context = contextMenu.value?.id;
  if (!context || !canExportOpd.value || !await finishInputs()) return;
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
  return !!store.draftToken && !!store.contexts.find(item => item.id === id)?.parentId && !store.isReadonly
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
const canvasEditor = ref<InstanceType<typeof OpdCanvas>>();
usePreviewViewport({ canvasEditor, assistantPreview, autoLayoutPreview: () => store.autoLayoutPreview, nodes: () => store.workbench.nodes });
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
  || store.controlCandidate.phase !== "idle"
  || (store.structuralUpdateCandidate.phase === "editing" && !store.structuralUpdateCandidate.inline));
const constructMenuStyle = computed(() => ({ left: `${store.constructActions.anchor.x}px`, top: `${store.constructActions.anchor.y}px` }));
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

function requestConstructActions(selectionId: string, anchor?: { clientX: number; clientY: number }, activation: "menu" | "direct" = "menu") {
  blankMenuAnchor.value = null;
  const bounds = canvasSurface.value?.getBoundingClientRect();
  const menuWidth = 208;
  const menuHeight = 224;
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

async function openConstructRefinement() {
  const node = constructRefinementTarget.value;
  if (!node || constructRefinementDisabledReason.value) return;
  store.selectConstruct(node.id);
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

function toggleProperties() {
  if (store.rightPanel.open) store.closeRightPanel();
  else store.openRightPanel();
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

async function requestAutoLayout() {
  const location = route.fullPath;
  if (await finishInputs() && location === route.fullPath) store.previewAutoLayout();
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
  if (await finishInputs() && location === route.fullPath) await (redo ? store.redoLayout() : store.undoLayout());
}

const { requestSave, openVersion, openContext, copyPermalink } = useWorkbenchNavigation({ store, route, router, finishInputs, projectId, modelId, canvasLocationKey, canvasInteractionTool });
async function runModelValidation() {
  const location = route.fullPath;
  if (await finishInputs() && route.fullPath === location) await store.runValidation();
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

</script>

<style scoped>
.assistant-conversation { height: 100%; min-height: 0; }
.editor-panel--opd { grid-template-rows: auto auto minmax(0, 1fr); }
.editor-panel--analysis { grid-template-rows: auto minmax(0, 1fr); }
.editor-modebar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 5px 12px; border-bottom: 1px solid #dbe3ea; background: #fff; min-width: 0; font-size: 12px; }
.editor-modebar button { border: 0; border-radius: 4px; padding: 6px 10px; color: #65758a; background: transparent; cursor: pointer; }
.editor-modebar button[aria-selected="true"] { color: #0b6bcb; background: #e6f0fa; }
.editor-modebar span { color: #748698; }
.editor-modebar .editor-modebar__assistant { margin-left: auto; color: #0b6bcb; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.navigator-dock { display: flex; flex-direction: column; overflow: visible; }
.left-workspace-tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid #dce5ee; background: #fff; }
.left-workspace-tabs button { flex: 1; min-width: 0; min-height: 42px; padding: 8px 6px; border: 0; border-bottom: 2px solid transparent; background: none; color: #65758a; font-size: 12px; cursor: pointer; white-space: nowrap; }
.left-workspace-tabs button[aria-selected="true"] { border-bottom-color: #0b6bcb; color: #0b6bcb; font-weight: 600; }
.left-workspace-tabs button:hover { background: #f3f7fc; }
.left-workspace-tabs button:focus-visible { outline: 2px solid #0b6bcb; outline-offset: -3px; }
.navigator-panel { flex: 1; min-height: 0; }
.left-assistant-content { flex: 1; min-height: 0; min-width: 0; background: #fff; border-right: 1px solid #cdd7df; overflow: hidden; }
@media (max-width: 680px) { .navigator-dock--assistant { height: 480px; } }
.assistant-canvas-preview { position: absolute; z-index: 26; top: 12px; left: 12px; max-width: calc(100% - 24px); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 9px 12px; border: 1px solid #a8c9e9; border-radius: 6px; background: #fff; box-shadow: 0 4px 16px #162b431f; color: #344250; font-size: 12px; }
.assistant-canvas-preview button { min-height: 28px; padding: 4px 8px; font-size: 12px; }
.opd-export-error { color: #b42318; font-size: 13px; margin: 8px 12px; }
.opd-menu-backdrop { position: fixed; inset: 0; z-index: 100; }
.opd-tree-menu { position: fixed; min-width: 210px; }
.opd-delete-dialog { max-height: calc(100dvh - 32px); overflow-y: auto; }
.opd-delete-contexts { max-height: 160px; overflow-y: auto; padding-left: 24px; overflow-wrap: anywhere; }
</style>
