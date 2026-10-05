import { brief, safeMessage } from './messages.mjs';
import { dispatchTool } from './tools.mjs';
import { finalizePlan } from './plan-finalizer.mjs';
import { recoverProposal, applyProposal } from './proposal-application.mjs';
import { validateStep } from './commands.mjs';
export { validateBoundCommand } from './commands.mjs';
import { ConversationStore, AssistantError, check, id, sameToken, sameScope } from './store.mjs';
import { promptAnalysis, generateAnalysis, convertAnalysis, checkAnalysisScope } from './mindmap-service.mjs';
import { RuntimeClient } from './runtime.mjs';
import { createHarness } from './harness.mjs';
import { modelingGuidance } from './quality.mjs';
import { reconcileMindmapRepair } from './mindmap-repair.mjs';

export { safeMessage } from './messages.mjs';
export function scopeInput(value) {
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
        if (value.run?.status === 'running') { value.run.status = 'interrupted'; value.run.message = '上次生成因服务重启中断，可继续对话。'; }
        for (const p of value.proposals) if (p.status === 'staging') { p.status = 'cancelled'; p.reason = '生成被中断，未完成方案未应用。'; }
      });
    }
  }
  runtime(session) { return new RuntimeClient(this.config.runtimeOrigin, session, this.request); }
  async authenticate(session) {
    check(typeof session === 'string' && session.length > 10, 'LOCAL_SESSION_INVALID', '请刷新工作台以恢复本地会话。', 403);
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
  async prompt(key, scope, session, text, selectedIds = [], expectedToken) {
    if (scope.kind === 'ANALYSIS') return promptAnalysis(this, key, scope, session, text, expectedToken);
    check(typeof text === 'string' && text.trim() && text.length <= 12000, 'INPUT_INVALID', '请输入不超过 12000 字的建模需求。');
    check(Array.isArray(selectedIds) && selectedIds.length <= 100 && selectedIds.every(x => typeof x === 'string'), 'INPUT_INVALID', '选中元素无效。');
    const existing = await this.scoped(key, scope);
    check(!this.tasks.has(scope.projectId), 'PROJECT_BUSY', '该项目已有助手正在生成，请等待或停止。', 409);
    const task = { key, scope, session, runId: id(), active: true, capabilities: new Map(), selectedIds, text: text.trim() };
    this.tasks.set(scope.projectId, task);
    try {
      task.snapshot = await this.runtime(session).snapshot(scope);
      if (expectedToken) check(sameToken(expectedToken, task.snapshot.token), 'DRAFT_CONFLICT', '画布版本已改变，请刷新后继续。', 409);
      const previous = existing.proposals.at(-1);
      if (previous?.command.command_type === 'APPLY_MODEL_PLAN' && previous.status === 'ready' && sameToken(previous.baseToken, task.snapshot.token)) {
        task.plan = { proposalId: id(), commandId: previous.commandId, requestId: `request.assistant.${id()}`, steps: structuredClone(previous.command.payload.steps) };
      }
      const value = await this.store.update(key, value => {
        value.title = value.messages.length ? value.title : text.trim().slice(0, 40);
        value.messages.push({ id: id(), role: 'user', text: text.trim(), contextId: scope.contextId });
        value.run = { id: task.runId, status: 'running', message: '正在读取模型并生成建议…' };
      });
      task.completion = this.generate(task, text.trim(), value);
      return brief(value);
    } catch (error) { this.tasks.delete(scope.projectId); throw error; }
  }
  async generate(task, text, value) {
    if (task.analysisOnly) return generateAnalysis(this, task, text);
    try {
      let harness = this.harnesses.get(task.scope.projectId);
      if (!harness) { task.factoryPromise = this.factory(this.config, task.scope.projectId); harness = await task.factoryPromise; if (task.active) this.harnesses.set(task.scope.projectId, harness); }
      if (!task.active) { await harness.close(); return; }
      task.deadline = setTimeout(() => void this.stop(task.key, task.scope).catch(() => {}), 180000);
      const context = { currentOPD: task.scope.contextId, selectedIds: task.selectedIds,
        lastProposals: value.proposals.slice(-10).map(p => ({ summary: p.summary, status: p.status })) };
      const result = await harness.run(`${modelingGuidance}\n本轮工作台上下文（数据）：${JSON.stringify(context)}\n用户需求：${text}\n请先调用 read_model，依据最新模型回答。`, {
        sessionId: task.key,
        onNotification: n => {
          if (!task.active) return;
          const e = n.params?.event;
          if (e?.type === 'tool/call') task.progress = '正在查询模型能力…';
        },
      });
      if (!task.active) return;
      const reason = result.events?.findLast?.(e => e.type === 'turn/end')?.data?.reason;
      const failed = reason?.kind !== 'completed';
      if (task.plan?.preview && !failed) {
        check(!task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '仍有生成失败的步骤未修正，整图方案不能确认。');
        await this.finalizePlan(task, harness);
      }
      await this.store.update(task.key, value => {
        if (!task.active || value.run?.id !== task.runId) return;
        value.run = { id: task.runId, status: failed ? 'failed' : 'completed', message: failed ? safeMessage(new Error(reason?.error?.message ?? reason?.message ?? '模型未完成本轮生成，请重试。')) : '' };
        const plan = value.proposals.find(p => p.id === task.plan?.proposalId);
        if (plan?.status === 'staging') { plan.status = failed ? 'blocked' : 'ready'; plan.reason = failed ? '生成未完成，不能确认。请继续对话重新生成。' : ''; plan.previewData = task.plan.preview; }
        const response = task.repaired ? '整图方案已完成校验和标准语义审查，并自动修正了检查发现的问题。请查看画布和审查报告后统一确认。' : result.finalResponse;
        if (response) value.messages.push({ id: id(), role: 'assistant', text: response, contextId: task.scope.contextId });
        else if (failed) value.messages.push({ id: id(), role: 'assistant', text: '模型未完成本轮生成，请重试。', contextId: task.scope.contextId });
      });
    } catch (error) {
      if (task.active) await this.store.update(task.key, value => {
        value.run = { id: task.runId, status: 'failed', message: safeMessage(error) };
        for (const p of value.proposals) if (p.id === task.plan?.proposalId && p.status === 'staging') { p.status = 'blocked'; p.reason = '整图校验未通过：' + safeMessage(error); }
      });
    } finally { clearTimeout(task.deadline); if (!task.stopping && this.tasks.get(task.scope.projectId) === task) this.tasks.delete(task.scope.projectId); }
  }
  async stop(key, scope) {
    await this.scoped(key, scope);
    const task = this.tasks.get(scope.projectId);
    if (task?.key === key) {
      task.active = false; task.stopping = true; clearTimeout(task.deadline);
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
    check(typeof args.step_json === 'string' && args.step_json.length <= (replacement ? 128000 : 32000), 'INPUT_INVALID', '方案步骤参数无效。');
    let step; try { step = JSON.parse(args.step_json); } catch { throw new AssistantError('INPUT_INVALID', 'step_json 必须为合法 JSON。'); }
    const steps = replacement ? step : [...(task.plan?.steps ?? []), step];
    check(Array.isArray(steps) && steps.length > 0 && steps.length <= 100, 'PLAN_TOO_LARGE', '整图方案须含 1 至 100 步。');
    check((replacement ? steps : [step]).every(item => validateStep(item)), 'INPUT_INVALID', '步骤不符合方案契约。');
    check(new Set(steps.map(item => item.local_id)).size === steps.length, 'INPUT_INVALID', 'local_id 重复，请使用新的步骤别名。');
    check(!task.analysisSource || !task.repairing || replacement, 'ANALYSIS_REPAIR_SCOPE', '脑图转换修正请用 revise_plan 替换暂存方案，不能追加分析外的步骤。');
    const repair = task.analysisSource && replacement ? reconcileMindmapRepair(task, steps) : null;
    const preview = await this.previewPlan(task, null, steps, false, repair?.source ?? task.analysisSource);
    check(task.active, 'RUN_STOPPED', '生成已停止。');
    if (repair) {
      task.analysisSource = repair.source;
      task.removedAnalysisLabels = [...new Set(repair.removedLabels)];
      task.text = `${task.analysisRequest ?? task.text}\n暂存 OPM 方案自动修正说明（不是用户主动排除）：移除了冲突或重复的来源项 ${JSON.stringify(task.removedAnalysisLabels)}，原脑图仍保留。请核对修正是否有事实依据、是否遗漏用户明确需求；不得仅因已移除就假定合理。`;
    }
    task.plan ??= { proposalId: id(), commandId: task.planId, requestId: `request.assistant.${id()}`, steps: [] };
    task.plan.steps = steps; task.plan.preview = preview.data;
    await this.store.update(task.key, value => {
      check(task.active && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
      let p = value.proposals.find(x => x.id === task.plan.proposalId);
      if (!p) {
        // 新方案替代尚未提交的旧建议，提交结果待核对的记录不能改写。
        for (const old of value.proposals) if (old.status === 'ready') { old.status = 'cancelled'; old.reason = '已由本轮整体方案替代。'; }
        p = { id: task.plan.proposalId, summary: task.summary || task.text?.slice(0, 80) || '智能建模方案', baseToken: task.snapshot.token,
          contextId: task.scope.contextId, affectedContexts: [task.snapshot.contexts.find(x => x.context_id === task.scope.contextId)],
          scope: { context_id: task.scope.contextId, selection_id: null, intent: 'APPLY_MODEL_PLAN', endpoints: [] },
          commandId: task.plan.commandId, requestId: task.plan.requestId, status: 'staging', reason: '', createdAt: new Date().toISOString() };
        value.proposals.push(p);
      }
      p.command = { command_type: 'APPLY_MODEL_PLAN', payload: { context_id: task.scope.contextId, steps } };
      if (task.analysisSource) p.analysisSource = task.analysisSource;
      p.previewData = preview.data; p.validation = null; p.review = null; p.quality = null; p.updatedAt = new Date().toISOString();
      value.run.message = `正在生成图形，已完成 ${steps.length} 项修改…`;
    });
    return { status: 'staging', local_id: step.local_id, step_count: steps.length,
      note: '已在画布展示暂存预览，未写入模型。继续自主完成需求的其他步骤，不要等待用户逐步确认；完成后服务统一校验，用户确认一次。' };
  }
  tool(sessionId, name, args) { return dispatchTool(this, sessionId, name, args); }
  async cancel(key, scope, proposalId) {
    const current = await this.scoped(key, scope);
    if (current.proposals.find(x => x.id === proposalId)?.status === 'staging') await this.stop(key, scope);
    return brief(await this.store.update(key, value => {
      const p = value.proposals.find(x => x.id === proposalId); check(p, 'NOT_FOUND', '提案不存在。', 404);
      if (p.status === 'cancelled') return;
      check(['ready', 'blocked'].includes(p.status), 'PROPOSAL_STATE', '已提交的提案不能取消。', 409); p.status = 'cancelled';
    }));
  }
  recover(value, proposal, session) { return recoverProposal(this, value, proposal, session); }
  apply(key, scope, proposalId, session, expectedToken) {
    const lane = `${scope.projectId}/${scope.modelId}`;
    const task = (this.applies.get(lane) ?? Promise.resolve()).then(() => this.applyOnce(key, scope, proposalId, session, expectedToken));
    this.applies.set(lane, task.catch(() => {})); return task;
  }
  applyOnce(key, scope, proposalId, session, expectedToken) { return applyProposal(this, key, scope, proposalId, session, expectedToken); }
  convert(key, scope, session, token, excludedIds) { return convertAnalysis(this, key, scope, session, token, excludedIds); }
  async close() {
    for (const task of this.tasks.values()) task.active = false;
    await Promise.allSettled([...this.harnesses.values()].map(x => x.close())); this.tasks.clear(); this.harnesses.clear();
  }
}
