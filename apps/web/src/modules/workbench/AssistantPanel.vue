<template>
  <section class="assistant-panel" data-testid="assistant-panel" aria-label="智能建模助手">
    <header class="assistant-header">
      <span class="assistant-scope"><Bot :size="17" aria-hidden="true" /><span>{{ scope.kind === 'ANALYSIS' ? '模型分析 · 脑图' : `当前 OPD · ${contextName}` }}</span></span>
      <button v-if="isDesktop()" type="button" class="assistant-button" aria-label="配置智能助手" @click="openDesktopSettings">设置</button>
    </header>
    <p v-if="readonly" class="assistant-note">当前版本只读，请返回活动草稿使用助手。</p>
    <div v-if="scope.kind === 'ANALYSIS'" class="assistant-analysis-entry">
      <p class="assistant-note">脑图整理好后，可直接生成到所选 OPD，无须新建图或会话。未支持项请在脑图详情中明确排除。</p>
      <button type="button" class="assistant-button" data-testid="assistant-analysis-convert" :disabled="readonly || busy || running || conversionPending || !conversation" @click="emit('requestConversion')">根据脑图生成 OPD</button>
    </div>
    <div v-if="error" class="assistant-error" role="alert"><span>{{ error }}</span><button v-if="connectionError" type="button" class="assistant-button" :disabled="busy" data-testid="assistant-reconnect" @click="reload">重新连接</button><button v-else type="button" class="assistant-button" @click="error = ''">关闭提示</button></div>
    <p v-if="reconnecting && !connectionError" class="assistant-note" role="status" data-testid="assistant-reconnecting">连接恢复中，正在自动重连…</p>
    <div ref="transcript" class="assistant-transcript" role="log" aria-live="polite">
      <p v-if="!conversation?.messages.length" class="assistant-note">{{ scope.kind === 'ANALYSIS' ? '描述目标、对象和流程，助手先整理脑图；可以多轮补充，再生成 OPD，校验通过后自动保存。' : '描述要建模的业务流程，助手会在画布逐步生成完整方案，校验与审查通过后自动保存。' }}</p>
      <article v-for="message in conversation?.messages ?? []" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
        <header class="assistant-message__header">
          <span class="assistant-avatar" role="img" :aria-label="message.role === 'user' ? '用户' : '智能助手'" :title="message.role === 'user' ? '用户' : '智能助手'">
            <UserRound v-if="message.role === 'user'" :size="15" aria-hidden="true" /><Bot v-else :size="15" aria-hidden="true" />
          </span>
          <button v-if="message.role === 'user' && message.id === latestUserMessage?.id" class="assistant-icon-button" type="button" aria-label="编辑问题" title="编辑问题" data-testid="assistant-edit-message" :disabled="!canEdit" @click="editMessage(message)"><Pencil :size="14" aria-hidden="true" /></button>
        </header>
        <p v-if="message.role === 'user'" class="assistant-user-text">{{ message.text }}</p>
        <ul v-if="message.attachments?.length" class="assistant-attachments" aria-label="消息附件"><li v-for="(file, index) in message.attachments" :key="index"><Paperclip :size="14" aria-hidden="true" /><span>{{ file.name }}</span></li></ul>
        <AssistantMessageContent v-if="message.role === 'assistant'" :text="message.text" />
      </article>
      <p v-if="running" class="assistant-note" role="status" data-testid="assistant-running">{{ conversation?.run?.message || '正在读取模型并生成建议…' }}</p>
      <p v-if="conversation?.run?.message && !running" class="assistant-note" :class="{ 'assistant-error': conversation.run.status === 'failed' }">{{ conversation.run.message }}</p>
    </div>
    <details v-if="conversation?.proposals.length" class="assistant-proposals" data-testid="assistant-proposals" :open="hasActiveProposal">
      <summary>{{ hasActiveProposal ? '方案与校验' : '历史方案与校验' }} · {{ conversation.proposals.length }} 项</summary>
      <article v-for="proposal in conversation?.proposals ?? []" :key="proposal.id" class="assistant-proposal" data-testid="assistant-proposal">
        <div class="assistant-proposal__heading"><strong>{{ proposal.summary }}</strong><span>{{ statusLabel(proposal) }}</span></div>
        <p class="assistant-note">影响：{{ proposal.affectedContexts.map(x => x.label).join('、') }} · {{ proposal.command.command_type === 'APPLY_MODEL_PLAN' ? `${proposal.command.payload.steps.length} 项修改` : '独立修改' }}</p>
        <p v-if="proposal.analysisSource" class="assistant-note" data-testid="assistant-analysis-summary">{{ analysisSummary(proposal) }}<br v-if="proposal.analysisSource.excluded_ids.length"><span v-if="proposal.analysisSource.excluded_ids.length">未纳入：{{ proposal.analysisSource.excluded_ids.map(id => analysisLabels?.[id] ?? '已移除的分析项').join('、') }}</span></p>
        <p v-if="proposal.reason" class="assistant-error">{{ proposal.reason }}</p>
        <details v-if="proposal.quality" class="assistant-review" data-testid="assistant-quality">
          <summary>建模质量：{{ proposal.quality.items.length + proposal.quality.omitted ? `${proposal.quality.items.length + proposal.quality.omitted} 条建议` : '暂无建议' }}</summary>
          <p class="assistant-note">当前 OPD · {{ proposal.quality.node_count }} 个节点 · {{ proposal.quality.fact_count }} 个关系 · 建议不阻断保存</p>
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
          <p v-if="proposal.review.review_scope" class="assistant-note" data-testid="assistant-review-scope">本图完整审查 · {{ proposal.review.review_scope.related_context_ids.length }} 张关联图仅检查一致性</p>
          <p v-for="(issue, index) in proposal.review.issues" :key="index" :class="{ 'assistant-error': issue.severity === 'ERROR' }">{{ issue.historical ? '关联图历史提示：' : '' }}{{ issue.message }}（{{ issue.basis === 'USER_REQUIREMENT' ? '用户需求' : `§${issue.clauses.join('、')}` }}；{{ reviewTargets(proposal, issue.target_ids) }}）<br>建议：{{ issue.suggestion }}</p>
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
        <div v-if="canRetryReview(proposal)">
          <p class="assistant-note">预览尚未提交，可保留当前内容重新校验和审查。</p>
          <button type="button" class="assistant-button" data-testid="assistant-review-retry" :disabled="!canEdit || stale(proposal)" @click="action('review', { proposalId: proposal.id, autoApply: true })">重新审查</button>
        </div>
        <div v-if="['staging', 'ready', 'pending', 'blocked'].includes(proposal.status)" class="assistant-actions">
          <button v-if="proposal.command.command_type !== 'APPLY_MODEL_PLAN'" class="assistant-button" type="button" :disabled="busy || proposal.status !== 'ready' || stale(proposal) || readonly" data-testid="assistant-preview" @click="emit('preview', proposal)">画布预览</button>
          <button v-if="!proposal.autoApply || proposal.status === 'pending' && !running" class="assistant-button assistant-button--primary" type="button" :disabled="busy || running || stale(proposal) || readonly || applying || ['staging', 'blocked'].includes(proposal.status) || reviewRequired(proposal)" data-testid="assistant-apply" @click="apply(proposal)">{{ proposal.status === 'pending' ? '核对并重试保存' : proposal.command.command_type === 'APPLY_MODEL_PLAN' ? proposal.status === 'staging' ? '审查完成后可确认' : proposal.previewViews?.length ? '确认父子图重组' : '确认整图修改' : '应用修改' }}</button>
          <button class="assistant-button" type="button" :disabled="busy || proposal.status === 'pending' || conversation?.run?.saving" data-testid="assistant-cancel" @click="cancel(proposal)">{{ proposal.status === 'staging' ? '停止并取消' : '取消' }}</button>
        </div>
      </article>
    </details>
    <form class="assistant-compose" @submit.prevent="send">
      <div v-if="editingMessage" class="assistant-editing" data-testid="assistant-editing">
        <div class="assistant-editing__heading"><span>编辑已发送的问题</span><button class="assistant-icon-button" type="button" aria-label="取消编辑" title="取消编辑" data-testid="assistant-edit-cancel" :disabled="busy" @click="cancelEdit"><X :size="14" aria-hidden="true" /></button></div>
        <p class="assistant-note">发送后替换该轮问题与回复，已应用的修改不会自动撤销。</p>
      </div>
      <textarea ref="composer" v-model="input" aria-label="建模需求" data-testid="assistant-input" rows="2" :maxlength="maxInputLength" :disabled="readonly || busy || !conversation" :placeholder="scope.kind === 'ANALYSIS' ? '描述目标、范围或需要补充的分析…' : '描述要修改的对象、状态或关系…'" @keydown="onInputKey" />
      <ul v-if="attachments.length" class="assistant-attachments" aria-label="待发送附件"><li v-for="(file, index) in attachments" :key="index"><Paperclip :size="14" aria-hidden="true" /><span>{{ file.name }}</span><button type="button" class="assistant-icon-button" :aria-label="`移除附件 ${file.name}`" :disabled="busy || readingAttachments" @click="attachments.splice(index, 1)"><X :size="14" aria-hidden="true" /></button></li></ul>
      <p v-if="readingAttachments" class="assistant-note" role="status">正在读取附件…</p>
      <div class="assistant-compose-actions">
        <small class="assistant-compose-hint">Enter 发送 · Shift+Enter 换行</small>
        <input ref="fileInput" class="assistant-file-input" type="file" accept=".txt,.md,.csv,.json,.pdf,.docx" multiple aria-label="选择附件" :disabled="!canEdit || readingAttachments" @change="addAttachments">
        <button type="button" class="assistant-attach-button" aria-label="添加附件" title="添加附件" data-testid="assistant-attach" :disabled="!canEdit || readingAttachments" @click="fileInput?.click()"><Paperclip :size="16" aria-hidden="true" /></button>
        <button v-if="running" type="button" class="assistant-button" :disabled="busy || conversation?.run?.saving" data-testid="assistant-stop" @click="stop">{{ conversation?.run?.saving ? '正在保存…' : '停止' }}</button>
        <button v-else type="submit" class="assistant-button assistant-button--primary" data-testid="assistant-send" :disabled="(!input.trim() && !attachments.length) || input.trim().length > maxInputLength || readingAttachments || busy || readonly || !conversation">{{ editingMessage ? '发送更正' : '发送' }}</button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { useWorkbenchServices } from "@/workbench/services";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Bot, Paperclip, Pencil, UserRound, X } from "@lucide/vue";
import { assistantRequest as defaultAssistantRequest, watchAssistant as defaultWatchAssistant, type AssistantConversation, type AssistantProposal, type AssistantScope } from "@/shared/api/assistantApi";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import { sameDraftToken } from "@/shared/api/draftRequestIdentity";
import AssistantMessageContent from './AssistantMessageContent.vue';
import { isDesktop, openDesktopSettings } from '@/shared/desktop';

const workbenchServices = useWorkbenchServices();
const assistantRequest: typeof defaultAssistantRequest = workbenchServices ? workbenchServices.assistant?.request ?? (async () => { throw new Error("宿主未提供助手服务。"); }) : defaultAssistantRequest;
const watchAssistant: typeof defaultWatchAssistant = workbenchServices ? workbenchServices.assistant?.watch ?? (async () => { throw new Error("宿主未提供助手服务。"); }) : defaultWatchAssistant;

const props = defineProps<{ scope: AssistantScope; contextName: string; token: DraftToken | null; readonly: boolean; selectedIds: string[]; analysisRevision?: number; focusedBranchId?: string; analysisDirty?: boolean; prepareAnalysis?: () => Promise<boolean>; analysisLabels?: Record<string, string> }>();
const emit = defineEmits<{ preview: [proposal: AssistantProposal | null]; applied: [scope: AssistantScope]; applying: [value: boolean]; analysisUpdated: [revision: number]; running: [value: boolean]; requestConversion: [] }>();
const conversation = ref<AssistantConversation | null>(null);
const input = ref(""), error = ref(""), busy = ref(false), applying = ref(false);
const connectionError = ref(false);
const reconnecting = ref(false);
type UserMessage = AssistantConversation["messages"][number];
const editingMessage = ref<UserMessage | null>(null), savedInput = ref("");
const composer = ref<HTMLTextAreaElement>();
const fileInput = ref<HTMLInputElement>();
type Attachment = { name: string; size: number; contentBase64: string };
type ComposerDraft = { input: string; attachments: Attachment[]; editingMessage: UserMessage | null; savedInput: string };
const scopeIdentity = computed(() => JSON.stringify([props.scope.projectId, props.scope.modelId, props.scope.kind === 'ANALYSIS' ? props.scope.mindmapId : props.scope.contextId, props.scope.kind]));
const composerDrafts = new Map<string, ComposerDraft>(), pendingAttachmentReads = new Set<string>();
let mounted = true;
const attachments = ref<Attachment[]>([]);
const readingAttachments = ref(false);
function composerDraft(): ComposerDraft {
  return { input: input.value, attachments: [...attachments.value], editingMessage: editingMessage.value, savedInput: savedInput.value };
}
function restoreComposer(draft?: ComposerDraft) {
  input.value = draft?.input ?? ''; attachments.value = [...(draft?.attachments ?? [])];
  editingMessage.value = draft?.editingMessage ?? null; savedInput.value = draft?.savedInput ?? '';
}
async function addAttachments(event: Event) {
  const element = event.target as HTMLInputElement, files = Array.from(element.files ?? []); element.value = '';
  if (!files.length || !canEdit.value || readingAttachments.value) return;
  const identity = scopeIdentity.value;
  const all = [...attachments.value, ...files];
  if (all.length > 3 || all.some(file => file.size === 0 || file.size > 5 * 1024 * 1024) || all.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
    error.value = '最多添加 3 个附件，单个最多 5 MiB、合计最多 10 MiB，不能添加空文件。'; return;
  }
  if (files.some(file => !/\.(txt|md|csv|json|pdf|docx)$/i.test(file.name))) { error.value = '附件支持 TXT、Markdown、CSV、JSON、PDF 和 DOCX。'; return; }
  pendingAttachmentReads.add(identity); readingAttachments.value = true; error.value = '';
  try {
    const values = await Promise.all(files.map(file => new Promise<{ name: string; size: number; contentBase64: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, size: file.size, contentBase64: String(reader.result).split(',')[1] ?? '' });
      reader.onerror = () => reject(new Error(`无法读取附件“${file.name}”。`)); reader.readAsDataURL(file);
    })));
    if (mounted) {
      if (identity === scopeIdentity.value) attachments.value.push(...values);
      else composerDrafts.get(identity)?.attachments.push(...values);
    }
  } catch (e) { if (mounted && identity === scopeIdentity.value) error.value = e instanceof Error ? e.message : '读取附件失败。'; }
  finally { pendingAttachmentReads.delete(identity); if (mounted && identity === scopeIdentity.value) readingAttachments.value = false; }
}
const transcript = ref<HTMLElement>();
const running = computed(() => conversation.value?.run?.status === "running");
const latestUserMessage = computed(() => [...conversation.value?.messages ?? []].reverse().find(message => message.role === 'user'));
const hasActiveProposal = computed(() => conversation.value?.proposals.some(p => ['staging', 'ready', 'pending', 'blocked'].includes(p.status)) ?? false);
const conversionPending = computed(() => conversation.value?.proposals.some(p => ['staging', 'ready', 'pending'].includes(p.status)) ?? false);
const canEdit = computed(() => !!conversation.value && !props.readonly && !busy.value && !running.value && !applying.value);
const maxInputLength = computed(() => 12000);
let revision = 0, stream: AbortController | undefined;
let stateVersion = 0, refreshTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined, refreshFlight: object | undefined;
let connectionFailureTimer: ReturnType<typeof setTimeout> | undefined, connectionFailureMessage = '';
const previousRuns = new Set<string>();
const refreshInterval = 2000;
const connectionFailureDelay = 10000;
let autoPreviewId: string | undefined;
let autoPreviewVersion: string | undefined;
let notifiedSaveId: string | undefined;
function clearRefresh() { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = undefined; }
function clearReconnect() { if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = undefined; }
function clearConnectionFailure() { if (connectionFailureTimer) clearTimeout(connectionFailureTimer); connectionFailureTimer = undefined; }
function connectionRecovered() {
  clearConnectionFailure(); reconnecting.value = false;
  if (connectionError.value) { connectionError.value = false; error.value = ''; }
}
function reconnect(value: AssistantConversation, scope: AssistantScope, sequence: number, message: string) {
  reconnecting.value = true; connectionFailureMessage = message;
  if (!connectionFailureTimer && !connectionError.value) connectionFailureTimer = setTimeout(() => {
    connectionFailureTimer = undefined;
    if (sequence === revision && conversation.value?.id === value.id && reconnecting.value) {
      connectionError.value = true; error.value = connectionFailureMessage;
    }
  }, connectionFailureDelay);
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    if (sequence === revision && conversation.value?.id === value.id) subscribe(conversation.value, scope, sequence);
  }, refreshInterval);
}
function older(value: AssistantConversation) {
  const current = conversation.value;
  if (!current || current.id !== value.id) return false;
  if (value.updatedAt < current.updatedAt) return true;
  if (value.run?.id && previousRuns.has(value.run.id) && current.run?.id !== value.run.id) return true;
  return !!current.run && current.run.status !== 'running' && value.run?.id === current.run.id && value.run.status === 'running';
}
function scheduleRefresh() {
  if (!running.value || refreshTimer || refreshFlight || !conversation.value) return;
  const sequence = revision, scope = { ...props.scope }, key = conversation.value.id;
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    if (sequence !== revision || !running.value || conversation.value?.id !== key) return;
    void refresh(scope, key, sequence);
  }, refreshInterval);
}
async function refresh(scope: AssistantScope, key: string, sequence: number) {
  if (refreshFlight) return;
  const flight = {}; refreshFlight = flight;
  const version = stateVersion;
  try {
    const value = await assistantRequest<AssistantConversation>('get', scope, { conversationId: key });
    if (sequence === revision && conversation.value?.id === key && version === stateVersion && !busy.value && value.id === key && !older(value)) {
      receive(value);
      connectionRecovered();
    }
  } catch { /* SSE remains authoritative; retry while the run is active. */ }
  finally { if (refreshFlight === flight) { refreshFlight = undefined; scheduleRefresh(); } }
}
function receive(value: AssistantConversation, followLatest = false) {
  if (older(value)) return;
  if (conversation.value?.run?.id && conversation.value.run.id !== value.run?.id) previousRuns.add(conversation.value.run.id);
  stateVersion++;
  if (value.run?.status !== 'running') clearRefresh();
  const area = transcript.value, follow = followLatest || !area || area.scrollHeight - area.scrollTop - area.clientHeight < 64;
  const previousRevision = conversation.value?.analysisRevision;
  conversation.value = value;
  emit('running', value.run?.status === 'running');
  if (value.analysisRevision !== undefined && value.analysisRevision !== previousRevision && value.analysisRevision !== props.analysisRevision) emit('analysisUpdated', value.analysisRevision);
  const latest = value.proposals.at(-1);
  if (latest?.autoApply && latest.status === 'applied' && latest.result?.status === 'DURABLE'
      && notifiedSaveId !== latest.id && !props.readonly && props.token && sameDraftToken(latest.baseToken, props.token)) {
    notifiedSaveId = latest.id;
    emit('applied', { ...props.scope, contextId: latest.contextId });
  }
  if (latest?.command.command_type === 'APPLY_MODEL_PLAN' && latest.previewData && (['staging', 'ready', 'blocked'].includes(latest.status)
      || latest.autoApply && latest.status === 'pending')
      && !props.readonly && !stale(latest) && latest.contextId === props.scope.contextId) {
    const version = JSON.stringify([latest.id, latest.status, latest.command.payload.steps]);
    if (version !== autoPreviewVersion) { autoPreviewId = latest.id; autoPreviewVersion = version; emit('preview', latest); }
  } else if (autoPreviewId) { autoPreviewId = undefined; autoPreviewVersion = undefined; emit('preview', null); }
  if (follow) void nextTick(() => { if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight; });
  scheduleRefresh();
}
function subscribe(value: AssistantConversation, scope: AssistantScope, sequence: number) {
  clearReconnect(); stream?.abort(); stream = new AbortController(); const signal = stream.signal;
  void watchAssistant(scope, value.id, signal, next => { if (!signal.aborted && sequence === revision && next.id === value.id) { connectionRecovered(); receive(next); } }).then(() => {
    if (!signal.aborted && sequence === revision) reconnect(value, scope, sequence, "助手连接暂时不可用，正在自动重连；也可点击重新连接。");
  }).catch(e => {
    if (!signal.aborted && sequence === revision) reconnect(value, scope, sequence, e instanceof Error ? e.message : "助手连接暂时不可用，正在自动重连。");
  });
}
async function reload() {
  const sequence = ++revision, scope = { ...props.scope }; stream?.abort(); clearRefresh(); clearReconnect(); clearConnectionFailure(); reconnecting.value = false; refreshFlight = undefined; error.value = ""; connectionError.value = false; busy.value = true;
  if (!scope.projectId || !scope.modelId || !scope.contextId) { busy.value = false; return; }
  try {
    const values = await assistantRequest<AssistantConversation[]>("list", scope);
    if (sequence !== revision) return;
    const value = values[0] ?? null;
    if (value) { receive(value, true); subscribe(value, scope, sequence); } else { conversation.value = null; stateVersion++; }
  } catch (e) { if (sequence === revision) { connectionError.value = true; error.value = e instanceof Error ? e.message : "读取对话失败。"; } }
  finally { if (sequence === revision) busy.value = false; }
}
async function send() {
  if (busy.value || readingAttachments.value || running.value || props.readonly || !conversation.value || (!input.value.trim() && !attachments.value.length)) return;
  if (input.value.trim().length > maxInputLength.value) return;
  if (props.scope.kind === 'ANALYSIS' && props.prepareAnalysis && !await props.prepareAnalysis()) return;
  const identity = scopeIdentity.value, sent = composerDraft(), text = input.value.trim() || '请阅读附件并总结主要内容';
  if (await action("prompt", { text, selectedIds: props.selectedIds, draftToken: props.token, ...(props.scope.kind === 'ANALYSIS' ? { focusedBranchId: props.focusedBranchId, analysisRevision: props.analysisRevision } : { autoApply: true }), ...(editingMessage.value ? { editMessageId: editingMessage.value.id } : {}), ...(attachments.value.length ? { attachments: attachments.value.map(({ name, contentBase64 }) => ({ name, contentBase64 })) } : {}) }) && mounted) {
    const active = identity === scopeIdentity.value, draft = active ? composerDraft() : composerDrafts.get(identity);
    if (!draft || draft.input !== sent.input || draft.editingMessage?.id !== sent.editingMessage?.id || draft.savedInput !== sent.savedInput
      || draft.attachments.length !== sent.attachments.length || draft.attachments.some((file, index) => file !== sent.attachments[index])) return;
    const next = { input: sent.editingMessage ? sent.savedInput : '', attachments: [], editingMessage: null, savedInput: '' };
    if (active) restoreComposer(next); else composerDrafts.set(identity, next);
  }
}
function editMessage(message: UserMessage) {
  if (!canEdit.value || message.role !== 'user' || message.id !== latestUserMessage.value?.id) return;
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
  const scope = { ...props.scope }; applying.value = true; emit('applying', true);
  try { if (await action("apply", { proposalId: p.id }) && !p.autoApply) { emit("preview", null); emit("applied", scope); } }
  finally { applying.value = false; emit('applying', false); }
}
async function cancel(p: AssistantProposal) { if (await action("cancel", { proposalId: p.id })) emit("preview", null); }
async function stop() { await action("stop"); }
function stale(p: AssistantProposal) { return p.status !== "pending" && (!props.token || !sameDraftToken(p.baseToken, props.token)
  || !!p.analysisSource && (props.analysisDirty || p.analysisSource.revision !== props.analysisRevision)); }
async function convert(excludedIds: string[]) { if (running.value || props.readonly) return; await reload(); if (connectionError.value || !conversation.value) return; if (props.prepareAnalysis && !await props.prepareAnalysis()) return; await action('convert', { excludedIds, autoApply: true }); }
let prefillFocusPending = false;
watch(() => !!conversation.value && !busy.value && !props.readonly, async ready => {
  if (!ready || !prefillFocusPending) return;
  await nextTick();
  composer.value?.focus();
  prefillFocusPending = false;
});
async function prefill(text: string) {
  if (props.readonly || (busy.value && conversation.value) || running.value || applying.value) return;
  const combined = input.value.trim() ? `${input.value}\n\n${text}` : text;
  if (combined.length > maxInputLength.value) {
    error.value = '输入内容过长，请整理已有内容后重试。';
    return;
  }
  input.value = combined;
  prefillFocusPending = true;
  await nextTick();
  if (composer.value && !composer.value.disabled) {
    composer.value.focus();
    prefillFocusPending = false;
  }
}
defineExpose({ convert, prefill });
function analysisSummary(p: AssistantProposal) {
  if (p.command.command_type !== 'APPLY_MODEL_PLAN') return '';
  const steps = p.command.payload.steps, created = new Set(steps.filter(step => step.command_type.startsWith('CREATE')).map(step => step.local_id));
  const reused = new Set(p.analysisSource?.bindings.filter(binding => !created.has(binding.target_ref)).map(binding => binding.target_ref));
  return `新增 ${created.size} 项 · 复用 ${reused.size} 项 · 修改 ${steps.length - created.size} 项 · 未纳入 ${p.analysisSource?.excluded_ids.length ?? 0} 项`;
}
function statusLabel(p: AssistantProposal) {
  if (p.autoApply && p.status === 'applied') return '已保存';
  if (p.autoApply && conversation.value?.run?.saving && ['ready', 'pending'].includes(p.status)) return '保存中';
  if (p.status === "ready" && stale(p)) return p.analysisSource ? "分析或模型已改变" : "模型已改变";
  return { staging: "生成中", ready: "待应用", blocked: "已阻断", cancelled: "已取消", pending: "结果待核对", applied: "已应用", stale: "已过期", rejected: "已拒绝" }[p.status];
}
function reviewRequired(p: AssistantProposal) {
  return p.command.command_type === 'APPLY_MODEL_PLAN' && p.status === 'ready'
    && (!p.review || p.review.issues.some(issue => issue.severity === 'ERROR') || !p.validation || p.validation.validation_summary.blocking > 0);
}
function canRetryReview(p: AssistantProposal) {
  return p.id === conversation.value?.proposals.at(-1)?.id && p.command.command_type === 'APPLY_MODEL_PLAN'
    && (p.status === 'blocked' && (!p.review || p.autoApply || p.failureCode === 'REPAIR_TIMEOUT') && p.validation?.validation_summary.blocking === 0 || p.status === 'ready' && !p.review);
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
watch(scopeIdentity, (identity, previous) => {
  if (previous) composerDrafts.set(previous, composerDraft());
  restoreComposer(composerDrafts.get(identity));
  readingAttachments.value = pendingAttachmentReads.has(identity);
  clearRefresh(); clearReconnect(); previousRuns.clear(); conversation.value = null; stateVersion++; autoPreviewId = undefined; autoPreviewVersion = undefined; emit("preview", null); void reload();
}, { immediate: true });
watch(() => props.scope.contextId, () => { if (props.scope.kind === 'ANALYSIS' && conversation.value) receive(conversation.value); });
watch(() => [props.token?.edit_seq, props.token?.draft_id, props.readonly, props.analysisRevision, props.analysisDirty], () => {
  if (autoPreviewId && (props.readonly || !conversation.value?.proposals.some(p => p.id === autoPreviewId && !stale(p)))) { autoPreviewId = undefined; autoPreviewVersion = undefined; emit('preview', null); }
});
onBeforeUnmount(() => { mounted = false; composerDrafts.clear(); revision++; stream?.abort(); clearRefresh(); clearReconnect(); clearConnectionFailure(); emit("preview", null); });
</script>

<style scoped>
.assistant-review { margin: 8px 0; font-size: 12px; overflow-wrap: anywhere; }
.assistant-review summary { cursor: pointer; color: #49627e; }
.assistant-actions, .assistant-proposal__heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.assistant-proposal__heading { justify-content: space-between; }
.assistant-proposals { flex-shrink: 0; max-height: 40%; overflow: auto; border-top: 1px solid #e1e8f0; padding-top: 8px; }
.assistant-proposals > summary { position: sticky; top: 0; z-index: 1; background: #fff; cursor: pointer; color: #49627e; line-height: 20px; }
.assistant-proposal { margin: 8px 0; padding: 9px 10px; border: 1px solid #cbd9e7; border-radius: 5px; }
.assistant-proposal__heading { gap: 8px; overflow-wrap: anywhere; }
.assistant-proposal__heading span { color: #65758a; white-space: nowrap; }
.assistant-file-input { display: none; }
.assistant-attach-button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 1px solid #e1e5ea; border-radius: 50%; background: #fff; color: #344250; cursor: pointer; }
.assistant-attach-button:hover:not(:disabled) { background: #edf4fa; border-color: #cbd9e7; }
.assistant-attach-button:disabled { opacity: .45; cursor: not-allowed; }
.assistant-attach-button:focus-visible { outline: 2px solid #0b6bcb; outline-offset: 2px; }
.assistant-attachments { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; padding: 0; list-style: none; }
.assistant-attachments li { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid #e1e8f0; border-radius: 5px; background: #f7f9fc; }
.assistant-attachments li > span { flex: 1; overflow-wrap: anywhere; min-width: 0; }
.assistant-attachments li > svg { flex-shrink: 0; }
</style>
