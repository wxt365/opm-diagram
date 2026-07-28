<template>
  <section
    class="workbench"
    data-testid="p03-workbench"
  >
    <header class="workbench-header">
      <div class="workbench-header__context">
        <button
          class="back-link"
          type="button"
          @click="router.push(`/projects/${store.activeProjectId}`)"
        >
          项目 / {{ store.activeProject?.name }}
        </button>
        <strong>{{ store.activeModel?.name }}</strong>
        <span class="profile-tag">{{ store.activeModel?.profile }}</span>
      </div>
      <div class="workbench-header__status">
        <span class="revision-tag">{{ revisionLabel }}</span>
        <span class="save-tag">{{ saveLabel }}</span>
        <button
          class="button button--secondary"
          type="button"
          :disabled="isReadonly"
          data-testid="p03-create-snapshot"
          @click="store.openOverlay('snapshot')"
        >
          创建快照
        </button>
        <button
          class="button button--secondary"
          type="button"
          data-testid="p03-run-validation"
          @click="store.runValidation()"
        >
          运行校验
        </button>
        <button
          class="button button--primary"
          type="button"
          :disabled="baselineDisabled"
          :title="baselineDisabledReason"
          data-testid="p03-create-baseline"
          @click="store.openOverlay('baseline')"
        >
          生成基线
        </button>
      </div>
    </header>

    <div class="workbench-main">
      <div class="workbench-notices">
        <div
          v-if="isReadonly"
          class="readonly-banner"
          data-testid="p03-readonly-banner"
        >
          <span>{{ readonlyBanner }}</span>
          <button
            v-if="store.workbench.accessMode !== 'recovery-required'"
            class="button button--secondary"
            type="button"
            data-testid="p03-create-draft"
            @click="store.createDraftFromBaseline()"
          >
            基于基线创建草稿
          </button>
        </div>
        <p v-if="store.workbench.commandFeedback" class="command-feedback" role="status">{{ store.workbench.commandFeedback }}</p>
        <p v-if="store.workbench.resourceState !== 'ready'" class="command-feedback" role="status">当前工作台资源状态：{{ store.workbench.resourceState }}。</p>
      </div>

      <div class="workbench-grid">
        <aside class="workbench-panel navigator-panel">
          <div class="panel-tabs">
            <button
              :class="{ 'is-active': store.workbench.navigationMode === 'process-tree' }"
              type="button"
              data-testid="p03-process-tree"
              @click="store.setNavigationMode('process-tree')"
            >
              过程树
            </button>
            <button
              :class="{ 'is-active': store.workbench.navigationMode === 'object-forest' }"
              type="button"
              data-testid="p03-object-forest"
              @click="store.setNavigationMode('object-forest')"
            >
              对象林
            </button>
          </div>
          <label class="tree-search">
            <span class="sr-only">搜索上下文</span>
            <input v-model="contextSearch" data-testid="p03-context-search" placeholder="搜索 Context 或元素">
          </label>
          <div class="context-tree">
            <button
              v-for="context in filteredContexts"
              :key="context.id"
              class="context-tree__item"
              :class="{ 'is-current': store.workbench.activeContextId === context.id }"
              type="button"
              :data-testid="`p03-context-${context.id}`"
              @click="store.selectContext(context.id)"
            >
              {{ context.name }} <span>{{ context.occurrenceCount }}</span>
            </button>
          </div>
          <button
            class="text-action navigator-action"
            type="button"
            :disabled="isReadonly || !store.refinementPreview"
            :title="refinementDisabledReason"
            data-testid="p03-create-refinement"
            @click="store.openOverlay('refinement')"
          >
            创建细化 OPD
          </button>
          <button
            class="button button--secondary button--block"
            type="button"
            :disabled="isReadonly"
            data-testid="p03-context-impact"
            @click="store.openOverlay('impact')"
          >
            移动 / 删除 OPD
          </button>
        </aside>

        <section class="editor-panel">
          <div class="editor-toolbar">
            <div class="tool-group" aria-label="画布工具">
              <button class="tool-button" :class="{ 'is-active': store.workbench.tool === 'select' }" type="button" title="选择" data-testid="p03-tool-select" @click="store.setCanvasTool('select')">选择</button>
              <button class="tool-button" :class="{ 'is-active': store.workbench.tool === 'pan' }" type="button" title="平移" data-testid="p03-tool-pan" @click="store.setCanvasTool('pan')">平移</button>
            </div>
            <div class="tool-group" aria-label="建模候选">
              <button class="tool-button" type="button" :disabled="isReadonly" data-testid="p03-add-object" @click="store.addCandidate('object')">对象</button>
              <button class="tool-button" type="button" :disabled="isReadonly" data-testid="p03-add-process" @click="store.addCandidate('process')">过程</button>
              <button class="tool-button" type="button" :disabled="isReadonly" data-testid="p03-select-consumption" @click="store.selectConsumption()">消耗</button>
            </div>
            <div class="tool-group tool-group--end" aria-label="视口控制">
              <button class="tool-button" type="button" title="缩小视图" data-testid="p03-zoom-out" @click="store.setViewportZoom(store.workbench.zoom - 10)">-</button>
              <output data-testid="p03-zoom-output">{{ store.workbench.zoom }}%</output>
              <button class="tool-button" type="button" title="放大视图" data-testid="p03-zoom-in" @click="store.setViewportZoom(store.workbench.zoom + 10)">+</button>
              <button class="tool-button" type="button" title="适配画布" data-testid="p03-zoom-fit" @click="store.setViewportZoom(100)">适配</button>
              <button class="button button--secondary" type="button" :disabled="isReadonly" data-testid="p03-semantic-zoom" @click="store.openOverlay('semantic-zoom')">过程内缩放</button>
            </div>
          </div>
          <div class="canvas-frame">
            <OpdCanvas
              :nodes="store.workbench.nodes"
              :relations="store.workbench.relations"
              :selected-id="store.workbench.selectedId"
              :zoom="store.workbench.zoom"
              @select="store.selectConstruct"
            />
            <div class="canvas-state">{{ store.workbench.lastAction }}</div>
          </div>
        </section>

        <aside class="workbench-panel inspector-panel">
          <div class="panel-heading">
            <div>
              <span>选择与属性</span>
              <strong>{{ selectionKind }}</strong>
            </div>
            <span class="profile-tag">当前修订 r{{ store.workbench.revision }}</span>
          </div>
          <template v-if="!selectedNode && !selectedRelation">
            <p class="empty-inspector">从画布选择元素，或先创建 Object / Process 候选。</p>
          </template>
          <template v-else-if="selectedRelation">
            <div class="form-readonly"><span>关系类型</span><strong>Consumption</strong></div>
            <div class="form-readonly"><span>对象端点</span><code>available {{ relationSource?.label }}</code></div>
            <div class="form-readonly"><span>过程端点</span><code>{{ relationTarget?.label }}</code></div>
            <div class="form-readonly"><span>稳定标识</span><code>{{ selectedRelation.id }}</code></div>
            <div class="form-readonly"><span>符号引用</span><code>{{ selectedRelation.symbolRef }}</code></div>
            <div class="form-readonly"><span>布局引用</span><code>{{ selectedRelation.layoutRef }}</code></div>
          </template>
          <template v-else>
            <label class="form-field">
              <span>名称</span>
              <input v-model="draftName" :disabled="isReadonly" data-testid="p03-inspector-name">
            </label>
            <div class="form-readonly"><span>稳定标识</span><code>{{ store.workbench.selectedId }}</code></div>
            <div class="form-readonly"><span>Capability</span><code>{{ selectionKind === '过程' ? 'CAP-PROCESS-001' : 'CAP-OBJECT-001' }}</code></div>
            <label class="form-field"><span>状态/值域</span><input v-model="draftValueDomain" :disabled="isReadonly" data-testid="p03-inspector-value-domain"></label>
            <label class="form-field"><span>可见性</span><select v-model="draftVisibility" :disabled="isReadonly" data-testid="p03-inspector-visibility"><option value="public">public</option><option value="protected">protected</option><option value="private">private</option></select></label>
            <label class="form-field"><span>多重性</span><input v-model="draftMultiplicity" :disabled="isReadonly" data-testid="p03-inspector-multiplicity"></label>
            <label class="form-field"><span>架构层</span><select v-model="draftArchitectureLayer" :disabled="isReadonly" data-testid="p03-inspector-architecture-layer"><option value="任务">任务</option><option value="功能">功能</option><option value="产品">产品</option></select></label>
            <div class="form-readonly"><span>Occurrence 角色</span><code>{{ selectedNode?.occurrenceRole }}</code></div>
            <div class="form-readonly"><span>出现于</span><code>{{ appearsIn }}</code></div>
            <div class="form-readonly"><span>来源修订</span><code>r{{ store.workbench.revision }}</code></div>
            <button class="button button--primary button--block" type="button" :disabled="isReadonly" data-testid="p03-commit-property" @click="commitProperties">应用候选</button>
          </template>
          <p v-if="isReadonly" class="disabled-reason">只读基线不允许语义写入；仍可查看和定位。</p>
        </aside>
      </div>
    </div>

    <section class="bottom-panel">
      <div class="bottom-tabs" role="tablist">
        <button v-for="tab in bottomTabs" :key="tab.value" :class="{ 'is-active': store.workbench.bottomTab === tab.value }" type="button" role="tab" :data-testid="`p03-tab-${tab.value}`" @click="store.setBottomTab(tab.value)">{{ tab.label }}</button>
      </div>
      <div v-if="store.workbench.bottomTab === 'text'" class="bottom-content" data-testid="p03-text-panel">
        <div class="projection-meta"><span>OPL · {{ textLabel }}</span><span>input r{{ store.workbench.revision }} · Rule 0.1.0</span></div>
        <button v-for="trace in textTraces" :key="trace.sentenceId" class="opl-line" type="button" data-testid="p03-opl-sentence" @click="store.locateTextTrace(trace.sentenceId)">{{ trace.sentence }}</button>
        <p v-if="!textTraces.length" class="projection-message">{{ textMessage }}</p>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'findings'" class="bottom-content" data-testid="p03-findings-panel">
        <button v-for="finding in activeFindings" :key="finding.id" class="finding-row" type="button" :data-testid="`p03-finding-${finding.id}`" @click="store.locateFinding(finding.id)"><span>{{ finding.severity }}</span><strong>{{ finding.ruleId }}</strong><em>{{ finding.message }}</em></button>
        <p v-if="!activeFindings.length" class="projection-message">当前 Context 没有 Finding。</p>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'history'" class="bottom-content"><p>r{{ store.workbench.revision }} · {{ store.workbench.lastAction }}</p></div>
      <div v-else class="bottom-content"><p>架构方法检查待连接 Method Query；当前不形成语言符合性结论。</p></div>
    </section>

    <div class="validation-status">
      <div><span>校验</span><strong>{{ validationLabel }}</strong></div>
      <progress :value="store.workbench.validationProgress" max="100" />
      <span>阻断 {{ store.workbench.blockingFindings }} / 警告 1 / 证据未就绪</span>
    </div>

    <div v-if="store.overlay" class="overlay-backdrop" @click.self="store.closeOverlay()">
      <form class="dialog-panel" :data-testid="`overlay-${store.overlay.kind}`" @submit.prevent="submitOverlay">
        <div class="dialog-panel__header"><div><p class="page-kicker">{{ overlayCode }}</p><h2>{{ overlayTitle }}</h2></div><button class="icon-control" type="button" aria-label="关闭弹层" @click="store.closeOverlay()">x</button></div>
        <template v-if="store.overlay.kind === 'refinement'">
          <div class="form-readonly"><span>细化对象</span><strong>{{ store.refinementPreview?.refinee.label }}</strong></div>
          <label class="form-field"><span>新 Context 名称</span><input v-model="refinementName" required></label>
          <div class="dialog-summary-grid"><div><span>父 Context</span><strong>{{ store.refinementPreview?.parentContext.name }}</strong></div><div><span>目标树</span><strong>{{ store.refinementPreview?.targetTree }}</strong></div><div><span>影响修订</span><strong>r{{ store.workbench.revision + 1 }}</strong></div></div>
        </template>
        <template v-else-if="store.overlay.kind === 'snapshot'">
          <label class="form-field"><span>快照名称</span><input v-model="snapshotName" data-testid="ov05-snapshot-name" required></label>
          <div class="form-readonly"><span>目标修订</span><strong>r{{ store.workbench.revision }} · 已保存</strong></div>
        </template>
        <template v-else-if="store.overlay.kind === 'baseline'">
          <label class="form-field"><span>基线名称</span><input value="最小语义闭环基线" required></label>
          <div class="dialog-summary-grid"><div><span>固定修订</span><strong>r{{ store.workbench.revision }}</strong></div><div><span>文本</span><strong>{{ textLabel }}</strong></div><div><span>阻断问题</span><strong>{{ store.workbench.blockingFindings }}</strong></div></div>
          <p class="dialog-note">将创建本地只读基线；证据未就绪时不得显示 ISO 符合。</p>
        </template>
        <template v-else-if="store.overlay.kind === 'semantic-zoom'">
          <div class="impact-callout"><strong>将改变模型语义</strong><span>该操作会创建 Context、Occurrence、Revision 和 OPL 段落。</span></div>
          <div class="form-readonly"><span>命令类型</span><code>SEMANTIC_IN_ZOOM</code></div>
          <div class="form-readonly"><span>视口比例</span><strong>保持 {{ store.workbench.zoom }}%，不进入修订</strong></div>
        </template>
        <template v-else-if="store.overlay.kind === 'impact'">
          <div class="impact-callout"><strong>删除或移动前必须确认影响</strong><span>当前为设计确认态，不提交上下文命令。</span></div>
          <ul class="impact-list"><li><span>拥有元素</span><strong>{{ store.impactSummary.ownedElements }} 个</strong></li><li><span>引用出现</span><strong>{{ store.impactSummary.referencedContexts }} 个 Context</strong></li><li><span>细化边</span><strong>{{ store.impactSummary.refinementEdges }} 条</strong></li><li><span>模型视图</span><strong>{{ store.impactSummary.modelViews }} 个需刷新</strong></li></ul>
        </template>
        <div class="dialog-panel__footer"><button class="button" type="button" @click="store.closeOverlay()">取消</button><button class="button button--primary" type="submit">{{ overlaySubmit }}</button></div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import OpdCanvas from "@/modules/workbench/OpdCanvas.vue";
import { useDesignConfirmationStore } from "@/stores/designConfirmation";
import type { OverlayState } from "@/shared/types/modeling";

const route = useRoute();
const router = useRouter();
const store = useDesignConfirmationStore();
const refinementName = ref("Processing refinement");
const snapshotName = ref("语义闭环确认");
const draftName = ref("Raw Material");
const draftValueDomain = ref("待定义状态/值域");
const draftVisibility = ref<"public" | "protected" | "private">("public");
const draftMultiplicity = ref("1");
const draftArchitectureLayer = ref<"任务" | "功能" | "产品">("产品");
const contextSearch = ref("");
const bottomTabs = [
  { value: "text", label: "OPL / OPT" },
  { value: "findings", label: "问题" },
  { value: "history", label: "操作历史" },
  { value: "method", label: "架构方法" },
] as const;
const overlayCodeMap: Record<OverlayState["kind"], string> = {
  project: "OV01",
  model: "OV02",
  refinement: "OV03",
  snapshot: "OV05",
  baseline: "OV06",
  "semantic-zoom": "语义命令",
  impact: "OV11",
};
const overlayTitleMap: Record<OverlayState["kind"], string> = {
  project: "创建项目",
  model: "创建模型",
  refinement: "创建细化 OPD",
  snapshot: "创建命名快照",
  baseline: "生成本地基线",
  "semantic-zoom": "过程内缩放",
  impact: "OPD 影响确认",
};
const overlaySubmitMap: Record<OverlayState["kind"], string> = {
  project: "创建",
  model: "创建",
  refinement: "创建并打开",
  snapshot: "创建快照",
  baseline: "生成不可变基线",
  "semantic-zoom": "提交语义缩放",
  impact: "确认影响",
};

watch(
  () => route.params.modelId,
  (modelId) => {
    if (typeof modelId === "string") store.selectModel(modelId);
  },
  { immediate: true },
);

watch(
  () => store.workbench.selectedId,
  (selectedId) => {
    const node = store.workbench.nodes.find((item) => item.id === selectedId);
    draftName.value = node?.label ?? "";
    draftValueDomain.value = node?.valueDomain ?? "";
    draftVisibility.value = node?.visibility ?? "public";
    draftMultiplicity.value = node?.multiplicity ?? "1";
    draftArchitectureLayer.value = node?.architectureLayer ?? "产品";
  },
  { immediate: true },
);

const isReadonly = computed(() => store.isReadonly);
const revisionLabel = computed(() => {
  if (store.workbench.accessMode === "readonly-baseline") return "基线 BL-001 · 只读";
  if (store.workbench.accessMode === "readonly-snapshot") return "快照 · 只读";
  if (store.workbench.accessMode === "recovery-required") return "需恢复 · 只读";
  return `草稿 r${store.workbench.revision}`;
});
const readonlyBanner = computed(() => {
  if (store.workbench.accessMode === "readonly-baseline") return "当前打开不可变基线 BL-001，语义写入已禁用。";
  if (store.workbench.accessMode === "readonly-snapshot") return "当前打开只读快照，语义写入已禁用。";
  if (store.workbench.accessMode === "recovery-required") return "当前修订需要恢复，仅允许查看与诊断。";
  return "";
});
const saveLabel = computed(() => store.workbench.autosaveState === "saved" ? "已保存" : "保存失败");
const selectedNode = computed(() => store.selectedNode);
const selectedRelation = computed(() => store.selectedRelation);
const relationSource = computed(() => store.workbench.nodes.find((node) => node.id === selectedRelation.value?.sourceId));
const relationTarget = computed(() => store.workbench.nodes.find((node) => node.id === selectedRelation.value?.targetId));
const selectionKind = computed(() => {
  if (selectedRelation.value) return "关系";
  if (!selectedNode.value) return "未选择";
  return selectedNode.value.kind === "process" ? "过程" : "对象";
});
const validationLabel = computed(() => {
  if (store.workbench.validationState === "running") return `运行中 · ${store.workbench.validationProgress}%`;
  if (store.workbench.validationState === "failed") return "校验失败，可重试或诊断";
  return store.workbench.validationState === "current" ? "结果当前" : "结果过期";
});
const textLabel = computed(() => ({ current: "current", stale: "stale", generating: "generating", blocked: "blocked", failed: "failed" }[store.workbench.textState]));
const textTraces = computed(() => store.workbench.textState === "current" ? store.activeTextTraces : []);
const textMessage = computed(() => {
  if (store.workbench.textState !== "current") return `文本投影 ${textLabel.value}，当前不作为基线证据。`;
  return "当前 Context 尚无可生成 OPL 句子的 Consumption 关系。";
});
const filteredContexts = computed(() => {
  const search = contextSearch.value.trim().toLocaleLowerCase();
  return store.workbench.contexts.filter((context) => {
    const matchesTree = store.workbench.navigationMode === "process-tree"
      ? context.kind !== "object-refinement"
      : context.kind !== "process-refinement";
    return matchesTree && (!search || context.name.toLocaleLowerCase().includes(search));
  });
});
const activeFindings = computed(() => store.activeFindings);
const appearsIn = computed(() => selectedNode.value
  ? store.workbench.contexts.filter((context) => context.nodes.some((node) => node.id === selectedNode.value?.id)).map((context) => context.name).join("、")
  : "-");
const baselineDisabled = computed(() => isReadonly.value || !store.isBaselineReady);
const baselineDisabledReason = computed(() => {
  if (isReadonly.value) return "当前已是只读版本";
  if (store.workbench.autosaveState === "save-failed") return "保存失败，不能创建基线";
  if (store.workbench.textState !== "current") return "需等待目标修订的文本投影 current";
  if (store.workbench.validationState !== "current") return "需等待固定修订的校验结果 current";
  return store.workbench.blockingFindings > 0 ? "存在阻断问题，不能创建基线" : "";
});
const refinementDisabledReason = computed(() => {
  if (isReadonly.value) return "当前只读版本不允许创建细化 OPD";
  return store.refinementPreview ? "" : "请先选择当前 Context 中可细化的 Object 或 Process";
});
const overlayCode = computed(() => overlayCodeMap[store.overlay?.kind ?? "impact"]);
const overlayTitle = computed(() => overlayTitleMap[store.overlay?.kind ?? "impact"]);
const overlaySubmit = computed(() => overlaySubmitMap[store.overlay?.kind ?? "impact"]);

function submitOverlay() {
  const kind = store.overlay?.kind;
  if (kind === "semantic-zoom") store.confirmSemanticZoom();
  else if (kind === "baseline") store.createBaseline();
  else if (kind === "refinement") store.createRefinement(refinementName.value);
  else if (kind === "snapshot") store.createSnapshot(snapshotName.value);
  else {
    store.closeOverlay();
    store.notify("影响已确认；真实实现必须调用专用上下文命令。");
  }
}

function commitProperties() {
  store.commitProperty(draftName.value, {
    valueDomain: draftValueDomain.value,
    visibility: draftVisibility.value,
    multiplicity: draftMultiplicity.value,
    architectureLayer: draftArchitectureLayer.value,
  });
}

</script>
