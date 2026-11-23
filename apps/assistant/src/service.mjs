import { brief, safeMessage } from './messages.mjs';
import { liveReply, putReply } from './live-reply.mjs';
import { appendUserMessage, editPrompt } from './message-edit.mjs';
import { dispatchTool } from './tools.mjs';
import { finalizePlan } from './plan-finalizer.mjs';
import { recoverProposal, applyProposal, autoApplyPlan } from './proposal-application.mjs';
import { validateStep } from './commands.mjs';
export { validateBoundCommand } from './commands.mjs';
import { ConversationStore, AssistantError, check, id, sameToken, sameScope } from './store.mjs';
import { promptAnalysis, generateAnalysis, convertAnalysis, checkAnalysisScope } from './mindmap-service.mjs';
import { RuntimeClient } from './runtime.mjs';
import { modelingGuidance } from './quality.mjs';
import { reconcileMindmapRepair } from './mindmap-repair.mjs';
import { runStage } from './stage-runner.mjs';
import { reviewDiagnostics } from './review-diagnostics.mjs';
import { continuedReviewRequest, modelBackgroundPrompt } from './modeling-context.mjs';
import { retryReview } from './review-retry.mjs';
import { parseAttachments, documentContext } from './documents.mjs';

// SDK 仅在实际模型任务启动时加载，存储/HTTP/注入工厂的服务验证无需启动 SDK。
const createHarness = async (...args) => (await import('./harness.mjs')).createHarness(...args);

export { safeMessage } from './messages.mjs';
export function scopeInput(value) {
  check(value.kind === undefined || value.kind === 'OPD' || value.kind === 'ANALYSIS', 'INPUT_INVALID', '此版本只支持 OPM 或脑图分析。');
  const result = {};
  for (const field of ['projectId', 'modelId', 'contextId']) {
    check(typeof value[field] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value[field]) && !value[field].includes('..'), 'INPUT_INVALID', '项目、模型或 OPD 身份无效。');
    result[field] = value[field];
  }
  if (value.kind === 'ANALYSIS') {
    check(typeof value.mindmapId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.mindmapId), 'INPUT_INVALID', '分析身份无效。');
    result.kind = 'ANALYSIS'; result.mindmapId = value.mindmapId;
  } else check(!value.kind || value.kind === 'OPD', 'INPUT_INVALID', '会话类型无效。');
  return result;
}
export class AssistantService {
  constructor(config, factory = createHarness, request = fetch) {
    this.config = config; this.factory = factory; this.request = request;
    this.store = new ConversationStore(config.dataRoot + '/conversations'); this.tasks = new Map(); this.harnesses = new Map(); this.applies = new Map();
  }
  async init() {
    await this.store.init();
    // 服务重启只恢复业务记录，不把未结束的生成视为成功。
    const { readdir } = await import('node:fs/promises');
    for (const file of await readdir(this.store.root)) if (/^[a-f0-9-]{36}\.json$/.test(file)) {
      const current = await this.store.read(file.slice(0, -5));
      if (current.run?.status !== 'running') continue;
      await this.store.update(file.slice(0, -5), value => {
        const saved = value.proposals.some(p => p.autoApply && p.runId === value.run.id && p.status === 'applied');
        value.run = { id: value.run.id, status: saved ? 'completed' : 'interrupted',
          message: saved ? '生成结果已保存。' : '上次生成因服务重启中断，可继续对话。' };
        for (const p of value.proposals) {
          if (p.status === 'staging') { p.status = 'cancelled'; p.reason = '生成被中断，未完成方案未应用。'; }
          if (p.autoApply && p.status === 'ready') { p.status = 'blocked'; p.reason = '保存前服务已重启，可重新审查后继续。'; }
        }
      });
    }
  }
  runtime(session) { return new RuntimeClient(this.config.runtimeOrigin, session, this.request,
    this.config.remoteEnabled ? this.config.trustedWebOrigins?.[0] : undefined); }
  async authenticate(session) {
    check(typeof session === 'string' && session.length > 10, 'LOCAL_SESSION_INVALID', '请刷新工作台以恢复本地会话。', 403);
    if (this.config.runtimeAccessToken) {
      const response = await this.request(this.config.runtimeOrigin + '/api/v1/integration/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: this.config.remoteEnabled
          ? this.config.trustedWebOrigins?.[0] ?? new URL(this.config.runtimeOrigin).origin : new URL(this.config.runtimeOrigin).origin,
          Authorization: `Bearer ${this.config.runtimeAccessToken}` }, body: '{}', signal: AbortSignal.timeout(5000),
      });
      const result = await response.json();
      check(response.ok && result.sessionToken === session, 'LOCAL_SESSION_INVALID', '工作台会话失效，请重新连接。', 403);
      return;
    }
    const response = await this.request(this.config.runtimeOrigin + '/opm-bootstrap.js', { signal: AbortSignal.timeout(5000) });
    const script = await response.text(), match = script.match(/window\.__OPM_LOCAL_SESSION__\s*=\s*("(?:[^"\\]|\\.)*")/);
    check(response.ok && match && JSON.parse(match[1]) === session, 'LOCAL_SESSION_INVALID', '本地会话失效，请刷新工作台。', 403);
  }
  async scoped(key, scope) {
    const value = await this.store.read(key);
    check(sameScope(value, scope), 'SCOPE_MISMATCH', '对话与当前模型、分析或 OPD 不匹配。', 403);
    return value;
  }
  async list(scope, session) { await this.runtime(session).open(scope); if (scope.kind === 'ANALYSIS') await checkAnalysisScope(this, scope, session); return [brief(await this.store.getOrCreate(scope))]; }
  async create(scope, session) { await this.runtime(session).open(scope); if (scope.kind === 'ANALYSIS') await checkAnalysisScope(this, scope, session); return brief(await this.store.getOrCreate(scope)); }
  async get(key, scope, session) {
    const value = await this.scoped(key, scope);
    for (const p of value.proposals.filter(x => x.status === 'pending')) await this.recover(value, p, session);
    return brief(await this.store.read(key));
  }
  async prompt(key, scope, session, text, selectedIds = [], expectedToken, attachments = [], editMessageId, focusedBranchId, analysisRevision, autoApply = false) {
    const current = await this.scoped(key, scope);
    const documents = await parseAttachments(attachments);
    const references = documentContext([...current.messages, { attachments: documents }]);
    if (scope.kind === 'ANALYSIS') return promptAnalysis(this, key, scope, session, text, expectedToken, documents, editMessageId, { selectedIds, focusedBranchId, analysisRevision });
    check(typeof text === 'string' && text.trim() && text.length <= 12000, 'INPUT_INVALID', '请输入不超过 12000 字的建模需求。');
    check(Array.isArray(selectedIds) && selectedIds.length <= 100 && selectedIds.every(x => typeof x === 'string'), 'INPUT_INVALID', '选中元素无效。');
    const existing = await this.scoped(key, scope);
    check(!existing.proposals.some(p => p.autoApply && p.status === 'pending'), 'APPLY_PENDING', '上次保存结果尚待核对，请先重试保存。', 409);
    check(!this.tasks.has(scope.projectId), 'PROJECT_BUSY', '该项目已有助手正在生成，请等待或停止。', 409);
    const modelText = editPrompt(current.messages, text.trim(), editMessageId);
    const task = { key, scope, session, runId: id(), active: true, autoApply, capabilities: new Map(), selectedIds, text: modelText + references };
    this.tasks.set(scope.projectId, task);
    try {
      task.snapshot = await this.runtime(session).snapshot(scope);
      if (expectedToken) check(sameToken(expectedToken, task.snapshot.token), 'DRAFT_CONFLICT', '画布版本已改变，请刷新后继续。', 409);
      const previous = existing.proposals.at(-1);
      if (previous?.command?.command_type === 'APPLY_MODEL_PLAN' && ['ready', 'blocked'].includes(previous.status) && !previous.analysisSource && sameToken(previous.baseToken, task.snapshot.token)) {
        task.plan = { proposalId: id(), commandId: previous.commandId, requestId: `request.assistant.${id()}`, steps: structuredClone(previous.command.payload.steps) };
        task.resuming = previous.status === 'blocked';
        task.previousDiagnostics = reviewDiagnostics(previous, existing.run);
        task.reviewRequest = continuedReviewRequest(previous.reviewRequest ?? previous.summary, task.text);
        task.failedPlanSteps = new Map((previous.failedSteps ?? []).map(item => [item.local_id, item.message]));
        if (previous.failureCode === 'PLAN_INCOMPLETE' && !task.failedPlanSteps.size) task.failedPlanSteps.set('unknown.previous.step', '上轮存在未修正步骤但无详细记录，请使用 revise_plan 完整核对并替换方案。');
      }
      const value = await this.store.update(key, value => {
        value.title = value.messages.length ? value.title : text.trim().slice(0, 40);
        documentContext([...value.messages, { attachments: documents }]);
        appendUserMessage(value, { id: id(), role: 'user', text: text.trim(), contextId: scope.contextId, ...(documents.length ? { attachments: documents } : {}) }, editMessageId);
        value.run = { id: task.runId, status: 'running', message: '正在读取模型并生成建议…' };
      });
      task.completion = this.generate(task, modelText, value);
      return brief(value);
    } catch (error) { this.tasks.delete(scope.projectId); throw error; }
  }
  async generate(task, text, value) {
    if (task.analysisOnly) return generateAnalysis(this, task, text);
    try {
      if (task.plan && !task.plan.preview) await this.stageChange(task, { step_json: JSON.stringify(task.plan.steps) }, true);
      let harness = this.harnesses.get(task.scope.projectId);
      if (!harness) { task.factoryPromise = this.factory(this.config, task.scope.projectId); harness = await task.factoryPromise; if (task.active) this.harnesses.set(task.scope.projectId, harness); }
      if (!task.active) { await harness.close(); return; }
      const context = { currentOPD: task.scope.contextId, selectedIds: task.selectedIds,
        lastProposals: value.proposals.slice(-10).map(p => ({ summary: p.summary, status: p.status })),
        recovery: task.resuming ? '已恢复上轮未提交方案。先 read_model 查看 staged_steps 和 failed_steps，保留成功内容；可用 revise_plan 完整替换修正，不重复创建已有别名。完成后仍须最终校验与审查。' : null };
      context.reviewRequest = task.reviewRequest ?? task.text;
      text += documentContext(value.messages);
      const reply = task.reply = liveReply(this, task, task.key);
      const generationSubmitted = new Promise(resolve => { task.completeGeneration = () => resolve({ finalResponse: '完整方案已暂存并进入统一诊断和标准审查，未应用模型。', events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] }); });
      const saveGuidance = task.autoApply ? '本轮由服务统一审查后自动保存。用 stage_change 连续暂存全部改动，单项也使用整图方案。请勿要求用户确认，也勿在收到回执前声称已保存。' : '本轮由用户核对后统一确认。';
      const result = await runStage(this, task, harness, 'generation', () => Promise.race([harness.run(`${modelingGuidance}\n${saveGuidance}\n${modelBackgroundPrompt(task.snapshot)}\n本轮工作台上下文（数据）：${JSON.stringify(context)}\n用户需求：${text}`, {
        sessionId: task.key,
        onNotification: n => {
          if (!task.active || task.stageError || task.generationClosed) return;
          reply.notify(n);
          const e = n.params?.event;
          if (e?.type === 'tool/call') task.progress = '正在查询模型能力…';
        },
      }), generationSubmitted]));
      task.completeGeneration = null;
      await reply.flush();
      if (!task.active) return;
      const reason = result.events?.findLast?.(e => e.type === 'turn/end')?.data?.reason;
      const failed = reason?.kind !== 'completed';
      if (failed && /HTTP\/2 stream failed/i.test(reason?.error?.message ?? reason?.message ?? '')) {
        if (this.harnesses.get(task.scope.projectId) === harness) this.harnesses.delete(task.scope.projectId);
        await Promise.resolve().then(() => harness.close()).catch(() => {});
      }
      if (task.plan?.preview && !failed) {
        check(!task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '仍有生成失败的步骤未修正，整图方案不能确认。');
        await this.finalizePlan(task, harness);
        if (task.autoApply) await autoApplyPlan(this, task);
      }
      await this.store.update(task.key, value => {
        if (!task.active || value.run?.id !== task.runId) return;
        const upstream = reason?.error?.message ?? reason?.message ?? '模型未完成本轮生成，请重试。';
        value.run = { id: task.runId, status: failed ? 'failed' : 'completed', message: failed ? (/HTTP\/2 stream failed/i.test(upstream) ? '上游模型连接中断，未提交方案已保留。请继续对话重试以恢复方案；若持续发生，请检查模型网关。' : safeMessage(new Error(upstream))) : '' };
        const plan = value.proposals.find(p => p.id === task.plan?.proposalId);
        if (plan?.status === 'staging') { plan.status = failed ? 'blocked' : 'ready'; plan.reason = failed ? '生成未完成，不能确认。请继续对话重新生成。' : ''; plan.previewData = task.plan.preview; }
        const response = plan?.autoApply && plan.status === 'applied'
          ? task.repaired ? '已自动修正模型问题，通过校验与审查并保存到 OPD。' : '生成结果已通过校验与审查，并保存到 OPD。'
          : task.repaired ? '整图方案已完成校验和标准语义审查，并自动修正了检查发现的问题。请查看画布和审查报告后统一确认。' : result.finalResponse;
        if (response) putReply(value, reply.messageId, response, task.scope.contextId);
        else if (failed) putReply(value, reply.messageId, '模型未完成本轮生成，请重试。', task.scope.contextId);
      });
    } catch (error) {
      if (/HTTP\/2 stream failed/i.test(error.message ?? '')) {
        const failedHarness = this.harnesses.get(task.scope.projectId); this.harnesses.delete(task.scope.projectId);
        await Promise.resolve().then(() => failedHarness?.close()).catch(() => {});
      }
      if (task.active) await this.store.update(task.key, value => {
        if (value.run?.id !== task.runId) return;
        value.run = { id: task.runId, status: 'failed', code: error.code, message: /HTTP\/2 stream failed/i.test(error.message ?? '') ? '上游模型连接中断，未提交方案已保留。请继续对话重试以恢复方案；若持续发生，请检查模型网关。' : safeMessage(error) };
        for (const p of value.proposals) if (p.id === task.plan?.proposalId && ['staging','ready'].includes(p.status)) { p.status = 'blocked'; p.failureCode = error.code; p.reason = safeMessage(error); }
      });
    } finally { task.completeGeneration = null; task.reply?.dispose(); clearTimeout(task.deadline); if (!task.stopping && this.tasks.get(task.scope.projectId) === task) this.tasks.delete(task.scope.projectId); }
  }
  async stop(key, scope) {
    await this.scoped(key, scope);
    const task = this.tasks.get(scope.projectId);
    if (task?.key === key) {
      if (task.applying) return brief(await this.store.read(key));
      task.active = false; task.stopping = true; task.reply?.dispose(); clearTimeout(task.deadline);
      const harness = this.harnesses.get(scope.projectId) ?? await task.factoryPromise?.catch(() => null); this.harnesses.delete(scope.projectId);
      await this.store.update(key, value => {
        value.run = { id: task.runId, status: 'stopped', message: '已停止生成，尚未应用的提案可取消。' };
        for (const p of value.proposals) if (p.status === 'staging') { p.status = 'cancelled'; p.reason = '生成已停止，预览未写入模型。'; }
      });
      if (harness) await harness.close();
      if (this.tasks.get(scope.projectId) === task) this.tasks.delete(scope.projectId);
    }
    return brief(await this.store.read(key));
  }
  async previewPlan(task, nextScope = null, steps = task.plan?.steps ?? [], finalize = false, analysisSource = task.analysisSource) {
    const planId = task.plan?.commandId ?? (task.planId ??= `command.assistant.${id()}`);
    return this.runtime(task.session).query(task.scope, 'plan-preview', { draft_token: task.snapshot.token,
      context_id: task.scope.contextId, plan_id: planId, steps, next_scope: nextScope, ...(finalize ? { finalize: true } : {}), ...(analysisSource ? { analysis_source: analysisSource } : {}) });
  }
  finalizePlan(task, harness) { return finalizePlan(this, task, harness); }
  async stageChange(task, args, replacement = false) {
    const repairSession = task.repairing ? task.repairSessionId : null;
    const duringGeneration = task.phase === 'generation';
    check(typeof args.step_json === 'string' && args.step_json.length <= (replacement ? 128000 : 32000), 'INPUT_INVALID', '方案步骤参数无效。');
    let step; try { step = JSON.parse(args.step_json); } catch { throw new AssistantError('INPUT_INVALID', 'step_json 必须为合法 JSON。'); }
    const steps = replacement ? step : [...(task.plan?.steps ?? []), step];
    check(Array.isArray(steps) && steps.length > 0 && steps.length <= 100, 'PLAN_TOO_LARGE', '整图方案须含 1 至 100 步。');
    check((replacement ? steps : [step]).every(item => validateStep(item)), 'INPUT_INVALID', '步骤不符合方案契约。');
    check(new Set(steps.map(item => item.local_id)).size === steps.length, 'INPUT_INVALID', 'local_id 重复，请使用新的步骤别名。');
    check(!task.analysisSource || !task.repairing || replacement, 'ANALYSIS_REPAIR_SCOPE', '脑图转换修正请用 revise_plan 替换暂存方案，不能追加分析外的步骤。');
    const repair = task.analysisSource && replacement ? reconcileMindmapRepair(task, steps) : null;
    const preview = await this.previewPlan(task, null, steps, false, repair?.source ?? task.analysisSource);
    check(task.active && !task.stageError, 'RUN_STOPPED', '本阶段已停止。');
    check(!duringGeneration || !task.generationClosed, 'RUN_STOPPED', '生成阶段已提交完成。');
    check(!repairSession || (!task.repairClosed && task.repairSessionId === repairSession), 'RUN_STOPPED', '修正阶段已结束。');
    if (repair) {
      task.analysisSource = repair.source;
      task.removedAnalysisLabels = [...new Set(repair.removedLabels)];
      task.text = `${task.analysisRequest ?? task.text}\n暂存 OPM 方案自动修正说明（不是用户主动排除）：移除了冲突或重复的来源项 ${JSON.stringify(task.removedAnalysisLabels)}，原脑图仍保留。请核对修正是否有事实依据、是否遗漏用户明确需求；不得仅因已移除就假定合理。`;
    }
    task.plan ??= { proposalId: id(), commandId: task.planId, requestId: `request.assistant.${id()}`, steps: [] };
    task.plan.steps = steps; task.plan.preview = preview.data; task.plan.affectedViews = preview.affected_views;
    await this.store.update(task.key, value => {
      check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '本阶段已停止。');
      check(!duringGeneration || !task.generationClosed, 'RUN_STOPPED', '生成阶段已提交完成。');
      check(!repairSession || (!task.repairClosed && task.repairSessionId === repairSession), 'RUN_STOPPED', '修正阶段已结束。');
      let p = value.proposals.find(x => x.id === task.plan.proposalId);
      if (!p) {
        // 新方案替代尚未提交的旧建议，提交结果待核对的记录不能改写。
        for (const old of value.proposals) if (old.status === 'ready' || (task.resuming && old.status === 'blocked' && old.commandId === task.plan.commandId)) { old.status = 'cancelled'; old.reason = '已由本轮整体方案替代。'; }
        p = { id: task.plan.proposalId, summary: task.summary || task.text?.slice(0, 80) || '智能建模方案', baseToken: task.snapshot.token,
          contextId: task.scope.contextId, affectedContexts: [task.snapshot.contexts.find(x => x.context_id === task.scope.contextId)],
          scope: { context_id: task.scope.contextId, selection_id: null, intent: 'APPLY_MODEL_PLAN', endpoints: [] },
          commandId: task.plan.commandId, requestId: task.plan.requestId, status: 'staging', reason: '', createdAt: new Date().toISOString(), ...(task.autoApply ? { autoApply: true } : {}) };
        value.proposals.push(p);
      }
      p.command = { command_type: 'APPLY_MODEL_PLAN', payload: { context_id: task.scope.contextId, steps } };
      p.failedSteps = [...(task.failedPlanSteps ?? [])].map(([local_id, message]) => ({ local_id, message }));
      if (task.analysisSource) p.analysisSource = task.analysisSource;
      p.previewData = preview.data; p.validation = null; p.review = null; p.quality = null; p.updatedAt = new Date().toISOString();
      if (task.repairing && p.repairDiagnostics) p.repairDiagnostics.accepted_changes++;
      p.previewViews = preview.affected_views;
      if (preview.affected_views) p.affectedContexts = preview.affected_views.map(view => ({ context_id: view.context_id, label: view.label }));
      value.run.message = `正在生成图形，已完成 ${steps.length} 项修改…`;
    });
    if (task.repairing) task.repairChanged = true;
    task.recordGenerationProgress?.();
    return { status: 'staging', local_id: step.local_id, step_count: steps.length,
      note: '已在画布展示暂存预览。连续完成剩余步骤并交服务统一校验。' };
  }
  tool(sessionId, name, args) { return dispatchTool(this, sessionId, name, args); }
  async cancel(key, scope, proposalId) {
    const current = await this.scoped(key, scope);
    if (current.proposals.find(x => x.id === proposalId)?.status === 'staging') await this.stop(key, scope);
    return brief(await this.store.update(key, value => {
      const p = value.proposals.find(x => x.id === proposalId); check(p, 'NOT_FOUND', '提案不存在。', 404);
      if (p.status === 'cancelled') return;
      check(!(p.autoApply && value.run?.status === 'running' && value.run?.saving), 'RUN_BUSY', '正在保存，请等待提交结果。', 409);
      check(['ready', 'blocked'].includes(p.status), 'PROPOSAL_STATE', '已提交的提案不能取消。', 409); p.status = 'cancelled';
    }));
  }
  recover(value, proposal, session) { return recoverProposal(this, value, proposal, session); }
  apply(key, scope, proposalId, session, expectedToken, generation) {
    const lane = `${scope.projectId}/${scope.modelId}`;
    const task = (this.applies.get(lane) ?? Promise.resolve()).then(() => applyProposal(this, key, scope, proposalId, session, expectedToken, generation));
    this.applies.set(lane, task.catch(() => {})); return task;
  }
  convert(key, scope, session, token, excludedIds, autoApply) { return convertAnalysis(this, key, scope, session, token, excludedIds, autoApply); }
  retryReview(key, scope, proposalId, session, token, autoApply) { return retryReview(this, key, scope, proposalId, session, token, autoApply); }
  async close() {
    for (const task of this.tasks.values()) task.active = false;
    await Promise.allSettled([...this.harnesses.values()].map(x => x.close())); this.tasks.clear(); this.harnesses.clear();
  }
}
