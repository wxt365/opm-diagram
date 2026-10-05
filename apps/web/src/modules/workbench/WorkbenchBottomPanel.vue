<template>
  <section class="bottom-panel" :class="{ 'bottom-panel--collapsed': !store.workbench.bottomPanelExpanded }">
    <div class="bottom-panel__bar">
      <div class="bottom-tabs" role="tablist" aria-label="底部工作区">
        <button v-for="tab in bottomTabs" :id="`p03-bottom-tab-${tab.value}`" :key="tab.value" :class="{ 'is-active': store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value }" type="button" role="tab" :aria-selected="store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value" :aria-expanded="store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value" aria-controls="p03-bottom-content" :data-testid="`p03-tab-${tab.value}`" @click="activateBottomTab(tab.value)">{{ tab.label }}<span v-if="tab.value === 'findings' && store.findings.length" class="bottom-tab-count">{{ store.findings.length }}</span></button>
      </div>
      <div class="validation-status"><div><span>校验</span><strong>{{ validationLabel }}</strong></div><progress :value="store.workbench.validationProgress" max="100" aria-label="校验进度" /><span>阻断 {{ store.workbench.blockingFindings }}</span></div>
      <button class="bottom-panel__toggle" type="button" :title="store.workbench.bottomPanelExpanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-label="store.workbench.bottomPanelExpanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-expanded="store.workbench.bottomPanelExpanded" aria-controls="p03-bottom-content" data-testid="p03-bottom-toggle" @click="emit('toggle')"><ChevronDown v-if="store.workbench.bottomPanelExpanded" :size="16" aria-hidden="true" /><ChevronUp v-else :size="16" aria-hidden="true" /></button>
    </div>
    <div v-show="store.workbench.bottomPanelExpanded" id="p03-bottom-content" class="bottom-panel__body" role="tabpanel" :aria-labelledby="`p03-bottom-tab-${store.workbench.bottomTab}`">
      <div v-if="store.workbench.bottomTab === 'text'" class="bottom-content" data-testid="p03-text-panel">
        <div class="projection-meta"><span>OPL</span><span data-testid="hs-text-input">{{ store.draftToken ? `草稿输入 · 编辑 ${store.draftToken.edit_seq}` : `input ${store.workbench.revision}` }}</span></div>
        <button v-for="line in store.textLines" :key="line.id" class="opl-line" type="button" data-testid="p03-opl-sentence" @click="store.locateText(line)">{{ line.text }}</button>
        <p v-if="!store.textLines.length" class="projection-message">当前 Context 尚无可生成 OPL 的 Procedural Fact。</p>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'findings'" class="bottom-content" data-testid="p03-findings-panel">
        <p v-if="!store.findings.length" class="projection-message">当前修订没有 Finding。</p>
        <button v-for="finding in store.findings" :key="finding.finding_id" class="opl-line" type="button" :class="{ 'is-active': finding.finding_id === store.selectedFindingId }" :data-testid="`p03-finding-${finding.finding_id}`" @click="store.selectFinding(finding.finding_id)">{{ finding.severity }} · {{ finding.rule_id }}</button>
        <button class="button button--secondary" type="button" :disabled="!store.selectedFindingId" data-testid="p03-finding-locate" @click="store.locateFinding">定位 Finding</button>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'history'" class="bottom-content" data-testid="p03-history-panel">
        <p v-if="!store.operationRecords.length" class="projection-message">当前修订没有 Operation Record。</p>
        <p v-for="record in store.operationRecords" :key="record.operation_record_id" :data-testid="`p03-operation-${record.operation_record_id}`">{{ record.result_status }} · {{ record.diagnostic_id ?? record.operation_id }} · {{ record.command_id }}</p>
        <button v-if="store.releaseVisualCommonFaultCommand" class="button button--secondary" type="button" data-testid="p03-release-visual-common-fault-command" @click="store.submitReleaseVisualCommonFaultCommand">提交受控故障命令</button>
      </div>
      <div v-else class="bottom-content"><p>架构方法检查待连接 Method Query；当前不形成语言符合性结论。</p></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, ChevronUp } from "@lucide/vue";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const props = defineProps<{ store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "workbench" | "findings" | "draftToken" | "textLines" | "locateText" | "selectedFindingId" | "selectFinding" | "locateFinding" | "operationRecords" | "releaseVisualCommonFaultCommand" | "submitReleaseVisualCommonFaultCommand" | "setBottomTab"> }>();
const bottomTabs = [
  { value: "text", label: "OPL / OPT" },
  { value: "findings", label: "问题" },
  { value: "history", label: "操作历史" },
  { value: "method", label: "架构方法" },
] as const;
function activateBottomTab(tab: typeof bottomTabs[number]["value"]) {
  emit("activateTab", tab);
}
const validationLabel = computed(() => props.store.workbench.validationState === "running" ? "运行中" : props.store.workbench.validationState === "failed" ? "校验失败，可重试" : props.store.workbench.validationState === "current" ? "结果当前" : "结果过期");
const emit = defineEmits<{ toggle: []; activateTab: [tab: typeof bottomTabs[number]["value"]] }>();
</script>
