<template>
  <section class="bottom-panel" :class="{ 'bottom-panel--collapsed': !store.workbench.bottomPanelExpanded }">
    <WorkbenchPanelResizer v-if="store.workbench.bottomPanelExpanded" :height="height ?? 240" @resize="emit('resize', $event)" />
    <div class="bottom-panel__bar">
      <div class="bottom-tabs" role="tablist" aria-label="底部工作区">
        <button v-for="tab in bottomTabs" :id="`p03-bottom-tab-${tab.value}`" :key="tab.value" :class="{ 'is-active': store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value }" type="button" role="tab" :aria-selected="store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value" :aria-expanded="store.workbench.bottomPanelExpanded && store.workbench.bottomTab === tab.value" aria-controls="p03-bottom-content" :data-testid="`p03-tab-${tab.value}`" @click="activateBottomTab(tab.value)">{{ tab.label }}<span v-if="tab.value === 'findings' && store.findings.length" class="bottom-tab-count">{{ store.findings.length }}</span></button>
      </div>
      <div class="validation-status" data-testid="p03-validation-status" aria-live="polite"><div><span>校验</span><strong :title="store.validationLabel"><span class="validation-label-full">{{ store.validationLabel }}</span><span class="validation-label-compact">{{ compactValidationLabel }}</span></strong></div><progress :value="store.workbench.validationProgress" max="100" aria-label="校验进度" /><span>阻断 {{ store.workbench.blockingFindings }}</span></div>
      <button class="bottom-panel__toggle" type="button" :title="store.workbench.bottomPanelExpanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-label="store.workbench.bottomPanelExpanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-expanded="store.workbench.bottomPanelExpanded" aria-controls="p03-bottom-content" data-testid="p03-bottom-toggle" @click="emit('toggle')"><ChevronDown v-if="store.workbench.bottomPanelExpanded" :size="16" aria-hidden="true" /><ChevronUp v-else :size="16" aria-hidden="true" /></button>
    </div>
    <div v-show="store.workbench.bottomPanelExpanded" id="p03-bottom-content" class="bottom-panel__body" role="tabpanel" :aria-labelledby="`p03-bottom-tab-${store.workbench.bottomTab}`">
      <div v-if="store.workbench.bottomTab === 'text'" class="bottom-content" data-testid="p03-text-panel">
        <div class="projection-meta"><span>OPL</span><div class="opl-panel-actions"><span data-testid="hs-text-input">{{ store.draftToken ? `草稿输入 · 编辑 ${store.draftToken.edit_seq}` : `input ${store.workbench.revision}` }}</span><button class="opl-export" type="button" :disabled="!canExport" data-testid="p03-opl-export" title="导出当前 OPD 的 OPL 文本" @click="exportOpl"><Download :size="14" aria-hidden="true" />导出 OPL</button></div></div>
        <p v-if="exportError" class="opl-export-error" role="alert">{{ exportError }}</p>
        <button v-for="line in store.textLines" :key="line.id" class="opl-line" :class="{ 'is-active': line.id === store.selectedTextLineId }" :aria-pressed="line.id === store.selectedTextLineId" type="button" data-testid="p03-opl-sentence" @click="store.locateText(line)">{{ line.text }}</button>
        <p v-if="!store.textLines.length" class="projection-message">{{ store.textProjectionError || "当前 OPD 尚无可生成的 OPL 关系语句。" }}</p>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'findings'" class="bottom-content" data-testid="p03-findings-panel">
        <p class="finding-coverage" data-testid="p03-validation-coverage">{{ store.draftToken ? '校验范围：整个模型的基础结构、状态改变对象归属及已支持关系的 OPL / 追溯规则。规则覆盖不完整，不代表 ISO 19450 全面符合性。' : '历史版本：显示已保存的问题记录。返回活动草稿可重新运行模型校验。' }}</p>
        <p v-if="store.validationError" class="opl-export-error" role="alert">校验失败：{{ store.validationError }}。请点击“运行校验”重试。</p>
        <p v-if="!store.findings.length" class="projection-message" data-testid="p03-findings-empty">{{ emptyFindingsMessage }}</p>
        <button v-for="finding in store.findingRows" :key="finding.finding_id" class="workbench-finding-row" type="button" :aria-pressed="finding.finding_id === store.selectedFindingId" :class="{ 'is-active': finding.finding_id === store.selectedFindingId }" :data-testid="`p03-finding-${finding.finding_id}`" @click="store.selectFinding(finding.finding_id)">
          <span class="workbench-finding-row__heading"><span class="finding-severity">{{ finding.severity }}</span><strong>{{ finding.title }}</strong></span>
          <span>{{ finding.description }}</span><span class="finding-meta">{{ finding.contextLabel }} · {{ finding.entityLabel }}</span>
        </button>
        <div v-if="selectedFinding" class="finding-detail" data-testid="p03-finding-detail">
          <div class="finding-detail__header"><strong>修复建议</strong><button class="finding-locate" type="button" :disabled="store.findingLocationBusy || store.workbench.resourceState !== 'ready' || store.workbench.validationState === 'stale' || store.workbench.validationState === 'running' || store.workbench.validationState === 'failed'" data-testid="p03-finding-locate" @click="emit('locateFinding')"><LocateFixed :size="14" aria-hidden="true" />{{ store.findingLocationBusy ? '正在定位…' : '定位到画布' }}</button></div>
          <p>{{ selectedFinding.suggestion }}</p>
          <p class="finding-meta">规则：{{ selectedFinding.rule_id }} · 构造：{{ selectedFinding.entity_id }}</p>
          <details v-if="selectedFinding.diagnostic && selectedFinding.diagnostic !== selectedFinding.description"><summary>原始诊断</summary><p>{{ selectedFinding.diagnostic }}</p></details>
        </div>
      </div>
      <div v-else-if="store.workbench.bottomTab === 'history'" class="bottom-content" data-testid="p03-history-panel">
        <div class="history-header"><span class="finding-meta">{{ store.workbench.locationMode === 'HEAD' ? '整个模型 · 最新操作在前' : '该版本及之前的模型操作' }}</span><button class="opl-export" type="button" :disabled="store.operationHistory.loading" data-testid="p03-history-refresh" @click="store.refreshOperationHistory()"><RefreshCw :size="14" aria-hidden="true" />刷新</button></div>
        <p v-if="store.operationHistory.error" class="opl-export-error" role="alert">操作历史读取失败：{{ store.operationHistory.error }}。<button class="opl-export" type="button" :disabled="store.operationHistory.loading" data-testid="p03-history-retry" @click="store.refreshOperationHistory(!!store.operationHistory.items.length)">重试</button></p>
        <p v-if="store.operationHistory.loading" class="projection-message" role="status">正在读取操作历史…</p>
        <p v-else-if="!store.operationHistory.items.length && !store.operationHistory.error" class="projection-message">尚无操作记录。编辑或保存模型后会在这里显示。</p>
        <ol class="operation-history">
          <li v-for="record in store.operationHistory.items" :key="record.record_id" class="history-record" :data-testid="`p03-operation-${record.record_id}`">
            <div class="history-record__heading"><strong>{{ record.title }}</strong><span class="history-status">{{ historyStatus(record.status) }}</span></div>
            <div class="history-record__meta"><time :datetime="record.occurred_at">{{ historyTime(record.occurred_at) }}</time><span>{{ record.context_name ? `OPD：${record.context_name}` : '模型' }}</span><button v-if="record.revision_id" class="opl-export" type="button" :disabled="store.workbench.resourceState !== 'ready' || store.workbench.commandState === 'submitting' || store.saving || store.pendingDelivery" data-testid="p03-history-open-version" @click="emit('openHistoryRevision', record.revision_id)">查看版本</button></div>
            <details v-if="!record.detail_available" class="finding-meta"><summary>记录详情</summary><p>此旧记录未保留完整操作说明。操作类型：{{ record.operation }}。</p></details>
          </li>
        </ol>
        <button v-if="store.operationHistory.nextBefore" class="opl-export" type="button" :disabled="store.operationHistory.loading" data-testid="p03-history-more" @click="store.refreshOperationHistory(true)">加载更早的记录</button>
        <button v-if="store.releaseVisualCommonFaultCommand" class="button button--secondary" type="button" data-testid="p03-release-visual-common-fault-command" @click="store.submitReleaseVisualCommonFaultCommand">提交受控故障命令</button>
      </div>
      <WorkbenchMethodPanel v-else :store="store" @locate="emit('locateMethod', $event)" @create-link="(target, kind) => emit('createMethodLink', target, kind)" @delete-link="emit('deleteMethodLink', $event)" @classify="emit('classifyMethod', $event)" @navigate="(context, target) => emit('navigateMethod', context, target)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, ChevronUp, Download, LocateFixed, RefreshCw } from "@lucide/vue";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";
import type { ArchitectureLinkKind, ArchitectureLevel, MethodEvidence } from "@/shared/api/generated/draftWorkspaceContract";
import WorkbenchMethodPanel from "./WorkbenchMethodPanel.vue";
import WorkbenchPanelResizer from "./WorkbenchPanelResizer.vue";

const props = defineProps<{ height?: number; store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "methodSummary" | "refreshMethodSummary" | "textProjectionError" | "validationLabel" | "validationError" | "findingRows" | "findingLocationBusy" | "workbench" | "modelName" | "contexts" | "isReadonly" | "selectedTextLineId" | "findings" | "draftToken" | "textLines" | "locateText" | "selectedFindingId" | "selectFinding" | "operationRecords" | "operationHistory" | "refreshOperationHistory" | "saving" | "pendingDelivery" | "releaseVisualCommonFaultCommand" | "submitReleaseVisualCommonFaultCommand" | "setBottomTab"> }>();
function historyTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function historyStatus(value: string) { return ({ DURABLE: "已记录", UNCHANGED: "无变化", SAVED: "已保存", COMMITTED: "已提交", COMPLETED: "已完成", ACCEPTED: "已受理", BLOCKED: "被阻止", FAILED: "失败", CANCELLED: "已取消" } as Record<string, string>)[value] ?? value; }
const compactValidationLabel = computed(() => ({ unvalidated: "未校验", running: "校验中", current: "已完成", stale: "已过期", failed: "校验失败" })[props.store.workbench.validationState]);
const selectedFinding = computed(() => props.store.findingRows.find(item => item.finding_id === props.store.selectedFindingId));
const emptyFindingsMessage = computed(() => !props.store.draftToken ? "该历史版本没有已记录的问题；这不代表完整校验通过。"
  : props.store.workbench.validationState === "current" ? "已覆盖规则未发现问题。"
  : props.store.workbench.validationState === "running" ? "正在检查模型，请稍候。"
  : props.store.workbench.validationState === "failed" ? "本次校验未完成，无法判断模型是否存在问题。"
  : props.store.workbench.validationState === "stale" ? "模型内容已修改，请重新运行校验。" : "尚未运行模型校验。加载时的自动检查暂未发现问题。" );
const exportError = ref("");
const canExport = computed(() => props.store.workbench.resourceState === "ready" && props.store.workbench.commandState !== "submitting" && props.store.textLines.length > 0);
watch(() => [props.store.workbench.activeContextId, props.store.textLines], () => { exportError.value = ""; });
function exportOpl() {
  if (!canExport.value) return;
  exportError.value = "";
  try {
    const context = props.store.contexts.find(item => item.id === props.store.workbench.activeContextId);
    const filename = `${props.store.modelName} - ${context?.label ?? "OPD"}`.replace(/[\\/:*?"<>|]/g, "_");
    const blob = new Blob([props.store.textLines.map(line => line.text).join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    try {
      anchor.href = url; anchor.download = `${filename}.opl.txt`;
      document.body.append(anchor); anchor.click();
    } finally {
      anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch { exportError.value = "OPL 导出失败，请重试。"; }
}
const bottomTabs = [
  { value: "text", label: "OPL / OPT" },
  { value: "findings", label: "问题" },
  { value: "history", label: "操作历史" },
  { value: "method", label: "架构方法" },
] as const;
function activateBottomTab(tab: typeof bottomTabs[number]["value"]) {
  emit("activateTab", tab);
}
const emit = defineEmits<{ resize: [height: number]; toggle: []; activateTab: [tab: typeof bottomTabs[number]["value"]]; locateFinding: []; createMethodLink: [target: string, kind: ArchitectureLinkKind]; deleteMethodLink: [id: string]; locateMethod: [evidence: MethodEvidence]; classifyMethod: [level: ArchitectureLevel | null]; navigateMethod: [context: string, target?: string]; openHistoryRevision: [revision: string] }>();
</script>

<style scoped>
.history-header, .history-record__heading, .history-record__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.history-header { justify-content: space-between; margin-bottom: 8px; }
.operation-history { padding: 0; margin: 0; list-style: none; }
.history-record { padding: 10px 0; border-bottom: 1px solid #e3eaf2; overflow-wrap: anywhere; }
.history-record__heading { justify-content: space-between; font-size: 13px; }
.history-record__heading strong { flex: 1; min-width: 0; }
.history-status { font-size: 12px; color: #65758a; white-space: nowrap; }
.history-record__meta { margin-top: 5px; color: #65758a; font-size: 12px; }
.opl-panel-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.opl-export, .finding-locate { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 4px 8px; border: 1px solid #d9e3ee; border-radius: 5px; font-size: 12px; font-weight: 500; line-height: 1.4; color: #0b6bcb; background: #fff; white-space: nowrap; }
.opl-export:hover:not(:disabled), .finding-locate:hover:not(:disabled) { border-color: #b4cee8; background: #eaf3fc; }
.opl-export:focus-visible, .finding-locate:focus-visible { outline: 2px solid #0b6bcb; outline-offset: 2px; }
.opl-export:disabled, .finding-locate:disabled { color: #8a96a3; cursor: not-allowed; }
.opl-export-error { color: #b42318; font-size: 12px; }
.opl-line.is-active { color: #0b6bcb; background: #eaf3fc; }
.finding-coverage { margin: 0 0 12px; color: #65758a; font-size: 12px; line-height: 1.6; }
.workbench-finding-row { display: flex; align-items: flex-start; flex-direction: column; gap: 6px; width: 100%; padding: 10px 12px; margin-bottom: 8px; text-align: start; border: 1px solid #d9e3ee; border-radius: 6px; background: #fff; color: #344250; line-height: 1.5; overflow-wrap: anywhere; }
.workbench-finding-row.is-active { border-color: #0b6bcb; background: #eaf3fc; }
.workbench-finding-row__heading { display: flex; align-items: center; gap: 8px; }
.finding-severity { color: #b42318; font-size: 12px; background: #fff0ed; border-radius: 4px; padding: 2px 6px; flex-shrink: 0; }
.finding-meta { color: #65758a; font-size: 12px; overflow-wrap: anywhere; }
.finding-detail { padding: 8px 12px; margin: 8px 0; background: #f5f8fc; border-radius: 6px; overflow-wrap: anywhere; }
.finding-detail__header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.finding-detail__header > strong { font-size: 12px; color: #344250; }
.finding-detail p { margin: 6px 0; }
.validation-label-compact { display: none; }
@media (max-width: 820px) {
  .validation-label-full { display: none; }
  .validation-label-compact { display: inline; }
  .bottom-panel__bar .validation-status progress { display: none; }
}
</style>
