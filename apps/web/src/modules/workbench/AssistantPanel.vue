<template>
  <section class="assistant-panel" data-testid="assistant-panel" aria-label="智能建模助手">
    <header class="assistant-header">
      <span>{{ scope.kind === 'ANALYSIS' ? '模型分析 · 脑图' : `当前 OPD · ${contextName}` }}</span>
    </header>
    <p v-if="readonly" class="assistant-note">当前版本只读，请返回活动草稿使用助手。</p>
    <div v-if="scope.kind === 'ANALYSIS'" class="assistant-analysis-entry">
      <p class="assistant-note">脑图整理好后，可直接生成到所选 OPD，无须新建图或会话。未支持项请在脑图详情中明确排除。</p>
      <button type="button" class="assistant-button" data-testid="assistant-analysis-convert" :disabled="readonly || busy || running || conversionPending || !conversation" @click="emit('requestConversion')">根据脑图生成 OPD 预览</button>
    </div>
    <div v-if="error" class="assistant-error" role="alert"><span>{{ error }}</span><button v-if="connectionError" type="button" class="assistant-button" :disabled="busy" data-testid="assistant-reconnect" @click="reload">重新连接</button><button v-else type="button" class="assistant-button" @click="error = ''">关闭提示</button></div>
    <div ref="transcript" class="assistant-transcript" role="log" aria-live="polite">
      <p v-if="!conversation?.messages.length" class="assistant-note">{{ scope.kind === 'ANALYSIS' ? '描述目标、对象和流程，助手先整理脑图；可以多轮补充，再生成 OPD 统一确认。' : '描述要建模的业务流程，助手会在画布逐步生成完整方案，完成校验后由你统一确认。' }}</p>
      <article v-for="message in conversation?.messages ?? []" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
        <header class="assistant-message__header">
          <span class="assistant-avatar" role="img" :aria-label="message.role === 'user' ? '用户' : '智能助手'" :title="message.role === 'user' ? '用户' : '智能助手'">
            <UserRound v-if="message.role === 'user'" :size="15" aria-hidden="true" /><Bot v-else :size="15" aria-hidden="true" />
          </span>
          <button v-if="message.role === 'user'" class="assistant-icon-button" type="button" aria-label="编辑问题" title="编辑问题" data-testid="assistant-edit-message" :disabled="!canEdit" @click="editMessage(message)"><Pencil :size="14" aria-hidden="true" /></button>
        </header>
        <p v-if="message.role === 'user'">{{ message.text }}</p>
        <AssistantMessageContent v-else :text="message.text" />
      </article>
      <p v-if="running" class="assistant-note" role="status" data-testid="assistant-running">{{ conversation?.run?.message || '正在读取模型并生成建议…' }}</p>
      <p v-if="conversation?.run?.message && !running" class="assistant-note" :class="{ 'assistant-error': conversation.run.status === 'failed' }">{{ conversation.run.message }}</p>
    </div>
    <details v-if="conversation?.proposals.length" class="assistant-proposals" data-testid="assistant-proposals" :open="hasActiveProposal">
      <summary>{{ hasActiveProposal ? '方案与校验' : '历史方案与校验' }} · {{ conversation.proposals.length }} 项</summary>
      <article v-for="proposal in conversation?.proposals ?? []" :key="proposal.id" class="assistant-proposal" data-testid="assistant-proposal">
        <div class="assistant-proposal__heading"><strong>{{ proposal.summary }}</strong><span>{{ statusLabel(proposal) }}</span></div>
        <p class="assistant-note">影响：{{ proposal.affectedContexts.map(x => x.label).join('、') }} · {{ proposal.command.command_type === 'APPLY_MODEL_PLAN' ? `${proposal.command.payload.steps.length} 项修改 · 完成后一次确认` : '独立修改' }}</p>
        <p v-if="proposal.analysisSource" class="assistant-note" data-testid="assistant-analysis-summary">{{ analysisSummary(proposal) }}<br v-if="proposal.analysisSource.excluded_ids.length"><span v-if="proposal.analysisSource.excluded_ids.length">未纳入：{{ proposal.analysisSource.excluded_ids.map(id => analysisLabels?.[id] ?? '已移除的分析项').join('、') }}</span></p>
        <p v-if="proposal.reason" class="assistant-error">{{ proposal.reason }}</p>
        <details v-if="proposal.quality" class="assistant-review" data-testid="assistant-quality">
          <summary>建模质量：{{ proposal.quality.items.length + proposal.quality.omitted ? `${proposal.quality.items.length + proposal.quality.omitted} 条建议` : '暂无建议' }}</summary>
          <p class="assistant-note">当前 OPD · {{ proposal.quality.node_count }} 个节点 · {{ proposal.quality.fact_count }} 个关系 · 建议不影响确认</p>
          <p v-for="(item, index) in proposal.quality.items" :key="index">{{ item.message }}（{{ qualityTargets(proposal, item.target_ids) }}）<br>建议：{{ item.suggestion }}</p>
          <p v-if="proposal.quality.omitted" class="assistant-note">另有 {{ proposal.quality.omitted }} 条建议未展示，可优先处理当前项后重新生成。</p>
        </details>
        <details v-if="proposal.validation" class="assistant-review" data-testid="assistant-validation">
          <summary>平台校验：{{ proposal.validation.validation_summary.blocking ? `${proposal.validation.validation_summary.blocking} 个阻断问题` : '当前规则通过' }}</summary>
          <p v-for="finding in proposal.validation.items" :key="finding.finding_id">{{ finding.message }}（{{ finding.rule_id }}）</p>
        </details>
        <details v-if="proposal.review" class="assistant-review" data-testid="assistant-standard-review" :open="isLatestBlocked(proposal)">
          <summary>标准语义审查：{{ reviewErrorCount(proposal) ? `${reviewErrorCount(proposal)} 个阻断问题` : '已完成' }}</summary>
          <p class="assistant-note">{{ proposal.review.standard_version }} · 部分条款审查</p>
          <p v-for="(issue, index) in proposal.review.issues" :key="index" :class="{ 'assistant-error': issue.severity === 'ERROR' }">{{ issue.message }}（{{ issue.basis === 'USER_REQUIREMENT' ? '用户需求' : `§${issue.clauses.join('、')}` }}；{{ reviewTargets(proposal, issue.target_ids) }}）<br>建议：{{ issue.suggestion }}</p>
          <details>
            <summary>逐项检查与假设</summary>
            <p v-for="check in proposal.review.checks" :key="check.rule_id">{{ reviewResultLabel(check.result) }} · §{{ check.clauses.join('、') }}：{{ check.explanation }}</p>
            <p v-for="(assumption, index) in proposal.review.assumptions" :key="`assumption-${index}`">待确认假设：{{ assumption }}</p>
          </details>
        </details>
        <div v-if="canRequestAnalysisRepair(proposal)">
          <p class="assistant-note">预览已保留，尚未写入模型。可重新生成并自动修正；涉及对象身份或业务含义的选择，请先补充说明。</p>
          <button type="button" class="assistant-button" data-testid="assistant-analysis-retry" :disabled="!canEdit || conversionPending || !!input.trim() || !!editingMessage" @click="emit('requestConversion')">重新生成并修正预览</button>
          <button type="button" class="assistant-button" data-testid="assistant-analysis-repair" :disabled="!canEdit || !!input.trim() || !!editingMessage" :title="input.trim() ? '请先发送或清空当前输入' : '填入脑图核对请求，可编辑后发送'" @click="requestAnalysisRepair(proposal)">核对并补充脑图说明</button>
        </div>
        <p v-if="proposal.command.command_type === 'APPLY_MODEL_PLAN' && proposal.status === 'ready' && !proposal.review" class="assistant-note">旧方案需要重新审查，请继续对话重新生成。</p>
        <div v-if="['staging', 'ready', 'pending', 'blocked'].includes(proposal.status)" class="assistant-actions">
          <button v-if="proposal.command.command_type !== 'APPLY_MODEL_PLAN'" class="assistant-button" type="button" :disabled="busy || proposal.status !== 'ready' || stale(proposal) || readonly" data-testid="assistant-preview" @click="emit('preview', proposal)">画布预览</button>
          <button class="assistant-button assistant-button--primary" type="button" :disabled="busy || running || stale(proposal) || readonly || applying || ['staging', 'blocked'].includes(proposal.status) || reviewRequired(proposal)" data-testid="assistant-apply" @click="apply(proposal)">{{ proposal.status === 'pending' ? '核对并重试' : proposal.command.command_type === 'APPLY_MODEL_PLAN' ? '确认整图修改' : '应用修改' }}</button>
          <button class="assistant-button" type="button" :disabled="busy || proposal.status === 'pending'" data-testid="assistant-cancel" @click="cancel(proposal)">{{ proposal.status === 'staging' ? '停止并取消' : '取消' }}</button>
        </div>
      </article>
    </details>
    <form class="assistant-compose" @submit.prevent="send">
      <div v-if="editingMessage" class="assistant-editing" data-testid="assistant-editing">
        <div class="assistant-editing__heading"><span>编辑已发送的问题</span><button class="assistant-icon-button" type="button" aria-label="取消编辑" title="取消编辑" data-testid="assistant-edit-cancel" :disabled="busy" @click="cancelEdit"><X :size="14" aria-hidden="true" /></button></div>
        <p class="assistant-note">更正会作为新消息继续对话，已应用的修改不会自动撤销。</p>
      </div>
      <textarea ref="composer" v-model="input" aria-label="建模需求" data-testid="assistant-input" rows="2" :maxlength="maxInputLength" :disabled="readonly || busy || !conversation" :placeholder="scope.kind === 'ANALYSIS' ? '描述目标、范围或需要补充的分析…' : '描述要修改的对象、状态或关系…'" @keydown="onInputKey" />
      <button v-if="running" type="button" class="assistant-button" :disabled="busy" data-testid="assistant-stop" @click="stop">停止</button>
      <button v-else type="submit" class="assistant-button assistant-button--primary" data-testid="assistant-send" :disabled="!input.trim() || input.trim().length > maxInputLength || busy || readonly || !conversation">{{ editingMessage ? '发送更正' : '发送' }}</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Bot, Pencil, UserRound, X } from "@lucide/vue";
import { assistantRequest, watchAssistant, type AssistantConversation, type AssistantProposal, type AssistantScope } from "@/shared/api/assistantApi";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import { sameDraftToken } from "@/shared/api/draftRequestIdentity";
import AssistantMessageContent from './AssistantMessageContent.vue';

const props = defineProps<{ scope: AssistantScope; contextName: string; token: DraftToken | null; readonly: boolean; selectedIds: string[]; analysisRevision?: number; analysisDirty?: boolean; prepareAnalysis?: () => Promise<boolean>; analysisLabels?: Record<string, string> }>();
const emit = defineEmits<{ preview: [proposal: AssistantProposal | null]; applied: [scope: AssistantScope]; analysisUpdated: [revision: number]; running: [value: boolean]; requestConversion: [] }>();
const conversation = ref<AssistantConversation | null>(null);
const input = ref(""), error = ref(""), busy = ref(false), applying = ref(false);
const connectionError = ref(false);
type UserMessage = AssistantConversation["messages"][number];
const editingMessage = ref<UserMessage | null>(null), savedInput = ref("");
const composer = ref<HTMLTextAreaElement>();
const transcript = ref<HTMLElement>();
const running = computed(() => conversation.value?.run?.status === "running");
const hasActiveProposal = computed(() => conversation.value?.proposals.some(p => ['staging', 'ready', 'pending', 'blocked'].includes(p.status)) ?? false);
const conversionPending = computed(() => conversation.value?.proposals.some(p => ['staging', 'ready', 'pending'].includes(p.status)) ?? false);
const canEdit = computed(() => !!conversation.value && !props.readonly && !busy.value && !running.value && !applying.value);
const correctionPrefix = computed(() => editingMessage.value ? `更正我之前的问题「${editingMessage.value.text.slice(0, 160)}${editingMessage.value.text.length > 160 ? '…' : ''}」；请以本次更正为准，结合当前模型继续：\n` : "");
const maxInputLength = computed(() => 12000 - correctionPrefix.value.length);
let revision = 0, stream: AbortController | undefined;
let autoPreviewId: string | undefined;
let autoPreviewVersion: string | undefined;
function receive(value: AssistantConversation, followLatest = false) {
  const area = transcript.value, follow = followLatest || !area || area.scrollHeight - area.scrollTop - area.clientHeight < 64;
  const previousRevision = conversation.value?.analysisRevision;
  conversation.value = value;
  emit('running', value.run?.status === 'running');
  if (value.analysisRevision !== undefined && value.analysisRevision !== previousRevision && value.analysisRevision !== props.analysisRevision) emit('analysisUpdated', value.analysisRevision);
  const latest = value.proposals.at(-1);
  if (latest?.command.command_type === 'APPLY_MODEL_PLAN' && latest.previewData && ['staging', 'ready', 'blocked'].includes(latest.status)
      && !props.readonly && !stale(latest) && latest.contextId === props.scope.contextId) {
    const version = JSON.stringify([latest.id, latest.status, latest.command.payload.steps]);
    if (version !== autoPreviewVersion) { autoPreviewId = latest.id; autoPreviewVersion = version; emit('preview', latest); }
  } else if (autoPreviewId) { autoPreviewId = undefined; autoPreviewVersion = undefined; emit('preview', null); }
  if (follow) void nextTick(() => { if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight; });
}
function subscribe(value: AssistantConversation, scope: AssistantScope, sequence: number) {
  stream?.abort(); stream = new AbortController(); const signal = stream.signal;
  void watchAssistant(scope, value.id, signal, next => { if (!signal.aborted && sequence === revision) receive(next); }).then(() => {
    if (!signal.aborted && sequence === revision) { connectionError.value = true; error.value = "助手连接已断开，请重新连接。"; }
  }).catch(e => {
    if (!signal.aborted && sequence === revision) { connectionError.value = true; error.value = e instanceof Error ? e.message : "助手连接中断，请刷新重试。"; }
  });
}
async function reload() {
  const sequence = ++revision, scope = { ...props.scope }; stream?.abort(); error.value = ""; connectionError.value = false; busy.value = true;
  if (!scope.projectId || !scope.modelId || !scope.contextId) { busy.value = false; return; }
  try {
    const values = await assistantRequest<AssistantConversation[]>("list", scope);
    if (sequence !== revision) return;
    const value = values[0] ?? null;
    if (value) { receive(value, true); subscribe(value, scope, sequence); } else conversation.value = null;
  } catch (e) { if (sequence === revision) { connectionError.value = true; error.value = e instanceof Error ? e.message : "读取对话失败。"; } }
  finally { if (sequence === revision) busy.value = false; }
}
async function send() {
  if (busy.value || running.value || props.readonly || !conversation.value || !input.value.trim()) return;
  if (input.value.trim().length > maxInputLength.value) return;
  if (props.scope.kind === 'ANALYSIS' && props.prepareAnalysis && !await props.prepareAnalysis()) return;
  const sequence = revision, text = correctionPrefix.value + input.value.trim();
  if (await action("prompt", { text, selectedIds: props.selectedIds, draftToken: props.token }) && sequence === revision) {
    input.value = editingMessage.value ? savedInput.value : "";
    editingMessage.value = null; savedInput.value = "";
  }
}
function editMessage(message: UserMessage) {
  if (!canEdit.value || message.role !== 'user') return;
  if (!editingMessage.value) savedInput.value = input.value;
  editingMessage.value = message; input.value = message.text;
  void nextTick(() => { composer.value?.focus(); });
}
function cancelEdit() {
  if (busy.value) return;
  input.value = savedInput.value; savedInput.value = ""; editingMessage.value = null;
}
function onInputKey(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault(); void send();
  }
}
async function action(operation: string, extra: Record<string, unknown> = {}) {
  if (!conversation.value || busy.value) return false;
  const sequence = revision, scope = { ...props.scope }, key = conversation.value.id; busy.value = true; error.value = ""; connectionError.value = false;
  try {
    const value = await assistantRequest<AssistantConversation>(operation, scope, { conversationId: key, draftToken: props.token, ...extra });
    if (sequence === revision) receive(value, operation === 'prompt'); return true;
  } catch (e) { if (sequence === revision) error.value = e instanceof Error ? e.message : "助手操作失败。"; return false; }
  finally { if (sequence === revision) busy.value = false; }
}
async function apply(p: AssistantProposal) {
  const scope = { ...props.scope }; applying.value = true;
  try { if (await action("apply", { proposalId: p.id })) { emit("preview", null); emit("applied", scope); } }
  finally { applying.value = false; }
}
async function cancel(p: AssistantProposal) { if (await action("cancel", { proposalId: p.id })) emit("preview", null); }
async function stop() { await action("stop"); }
function stale(p: AssistantProposal) { return p.status !== "pending" && (!props.token || !sameDraftToken(p.baseToken, props.token)
  || !!p.analysisSource && (props.analysisDirty || p.analysisSource.revision !== props.analysisRevision)); }
async function convert(excludedIds: string[]) { if (running.value || props.readonly) return; await reload(); if (connectionError.value || !conversation.value) return; if (props.prepareAnalysis && !await props.prepareAnalysis()) return; await action('convert', { excludedIds }); }
defineExpose({ convert });
function analysisSummary(p: AssistantProposal) {
  if (p.command.command_type !== 'APPLY_MODEL_PLAN') return '';
  const steps = p.command.payload.steps, created = new Set(steps.filter(step => step.command_type.startsWith('CREATE')).map(step => step.local_id));
  const reused = new Set(p.analysisSource?.bindings.filter(binding => !created.has(binding.target_ref)).map(binding => binding.target_ref));
  return `新增 ${created.size} 项 · 复用 ${reused.size} 项 · 修改 ${steps.length - created.size} 项 · 未纳入 ${p.analysisSource?.excluded_ids.length ?? 0} 项`;
}
function statusLabel(p: AssistantProposal) {
  if (p.status === "ready" && stale(p)) return p.analysisSource ? "分析或模型已改变" : "模型已改变";
  return { staging: "生成中", ready: "待应用", blocked: "已阻断", cancelled: "已取消", pending: "结果待核对", applied: "已应用", stale: "已过期", rejected: "已拒绝" }[p.status];
}
function reviewRequired(p: AssistantProposal) {
  return p.command.command_type === 'APPLY_MODEL_PLAN' && p.status === 'ready'
    && (!p.review || p.review.issues.some(issue => issue.severity === 'ERROR') || !p.validation || p.validation.validation_summary.blocking > 0);
}
function reviewResultLabel(result: string) { return ({ PASS: '通过', ISSUE: '问题', NOT_APPLICABLE: '不适用', NEEDS_INPUT: '待确认' } as Record<string, string>)[result] ?? result; }
function reviewErrorCount(p: AssistantProposal) { return p.review?.issues.filter(issue => issue.severity === 'ERROR').length ?? 0; }
function isLatestBlocked(p: AssistantProposal) { return p.id === conversation.value?.proposals.at(-1)?.id && p.status === 'blocked'; }
function canRequestAnalysisRepair(p: AssistantProposal) { return props.scope.kind === 'ANALYSIS' && isLatestBlocked(p) && !!p.analysisSource && !stale(p) && (!!reviewErrorCount(p) || !!p.validation?.validation_summary.blocking); }
function requestAnalysisRepair(p: AssistantProposal) {
  if (!canEdit.value || !canRequestAnalysisRepair(p) || input.value.trim() || editingMessage.value) return;
  input.value = '请读取上次转换诊断，核对当前脑图的对象身份、状态归属和关系端点。修正有事实依据的问题；审查可能误判，不要照搬。需要业务选择时先问我，保留其余分析内容，不改正式模型。';
  void nextTick(() => { composer.value?.focus(); });
}
function qualityTargets(p: AssistantProposal, ids: string[]) { return ids.map(id => id === p.contextId ? props.contextName : p.previewData?.constructs.find(item => item.target_id === id || item.occurrence_id === id)?.label ?? id).join('、'); }
function reviewTargets(p: AssistantProposal, ids: string[]) { return ids.map(id => p.previewData?.constructs.find(item => item.target_id === id || item.occurrence_id === id)?.label ?? id).join('、'); }
watch(() => JSON.stringify([props.scope.projectId, props.scope.modelId, props.scope.kind === 'ANALYSIS' ? props.scope.mindmapId : props.scope.contextId, props.scope.kind]), () => {
  conversation.value = null; input.value = ""; editingMessage.value = null; savedInput.value = ""; autoPreviewId = undefined; autoPreviewVersion = undefined; emit("preview", null); void reload();
}, { immediate: true });
watch(() => props.scope.contextId, () => { if (props.scope.kind === 'ANALYSIS' && conversation.value) receive(conversation.value); });
watch(() => [props.token?.edit_seq, props.token?.draft_id, props.readonly, props.analysisRevision, props.analysisDirty], () => {
  if (autoPreviewId && (props.readonly || !conversation.value?.proposals.some(p => p.id === autoPreviewId && !stale(p)))) { autoPreviewId = undefined; autoPreviewVersion = undefined; emit('preview', null); }
});
onBeforeUnmount(() => { revision++; stream?.abort(); emit("preview", null); });
</script>

<style scoped>
.assistant-review { margin: 8px 0; font-size: 12px; overflow-wrap: anywhere; }
.assistant-review summary { cursor: pointer; color: #49627e; }
.assistant-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 10px 14px; color: #344250; font-size: 12px; }
.assistant-header, .assistant-actions, .assistant-proposal__heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.assistant-header, .assistant-proposal__heading { justify-content: space-between; }
.assistant-header { align-items: flex-start; flex-direction: column; }
.assistant-header > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-transcript { flex: 1; min-height: 0; overflow: auto; }
.assistant-proposals { flex-shrink: 0; max-height: 40%; overflow: auto; border-top: 1px solid #e1e8f0; padding-top: 8px; }
.assistant-proposals > summary { position: sticky; top: 0; z-index: 1; background: #fff; cursor: pointer; color: #49627e; line-height: 20px; }
.assistant-message { margin-bottom: 14px; }
.assistant-message__header { display: flex; justify-content: space-between; align-items: center; min-height: 26px; }
.assistant-avatar { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: #536e89; background: #edf2f7; }
.assistant-message--user .assistant-avatar { color: #0b6bcb; background: #e6f0fa; }
.assistant-message--user > p { margin: 5px 0 0; padding: 9px 10px; border-radius: 5px; background: #edf4fa; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.assistant-note { margin: 4px 0; color: #65758a; line-height: 1.5; }
.assistant-error { margin: 4px 0; color: #b42318; overflow-wrap: anywhere; }
.assistant-error[role="alert"] { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.assistant-proposal { margin: 8px 0; padding: 9px 10px; border: 1px solid #cbd9e7; border-radius: 5px; }
.assistant-proposal__heading { gap: 8px; overflow-wrap: anywhere; }
.assistant-proposal__heading span { color: #65758a; white-space: nowrap; }
.assistant-compose { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.assistant-editing { padding: 7px 9px; border: 1px solid #cbd9e7; border-radius: 5px; background: #f7f9fc; }
.assistant-editing__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #536e89; }
.assistant-icon-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #65758a; cursor: pointer; }
.assistant-icon-button:hover:not(:disabled) { color: #0b6bcb; background: #e6f0fa; }
.assistant-icon-button:disabled { opacity: .45; cursor: not-allowed; }
.assistant-compose textarea { min-width: 0; padding: 7px 9px; resize: vertical; max-height: 150px; border: 1px solid #cbd9e7; border-radius: 5px; font: inherit; color: inherit; }
.assistant-compose > button { align-self: flex-end; }
.assistant-button { min-height: 28px; padding: 4px 9px; border: 1px solid #cbd9e7; border-radius: 5px; background: #fff; color: #0b6bcb; font: inherit; white-space: nowrap; cursor: pointer; }
.assistant-button--primary { background: #0b6bcb; border-color: #0b6bcb; color: #fff; }
.assistant-button:disabled { opacity: .5; cursor: not-allowed; }
.assistant-button:focus-visible, .assistant-icon-button:focus-visible, textarea:focus-visible { outline: 2px solid #0b6bcb; outline-offset: 2px; }
@media (max-width: 680px) { .assistant-panel { padding: 8px; } }
</style>
