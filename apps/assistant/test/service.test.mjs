import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantService, scopeInput, validateBoundCommand, safeMessage } from '../src/service.mjs';
import { AssistantError, ConversationStore } from '../src/store.mjs';
import { affectedContexts } from '../src/runtime.mjs';
import { reviewRules, planDigest } from '../src/review.mjs';
import { qualityPolicy } from '../src/quality.mjs';
import { ModelingSdkServer } from '../src/harness-sdk.mjs';

const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
const token = { draft_id: 'draft.test', edit_seq: 0, binding_digest: 'a'.repeat(64) };
const element = { target_id: 'element.beans', occurrence_id: 'occurrence.beans', target_kind: 'ELEMENT', label: '咖啡豆' };
const snapshot = () => ({ token: { ...token }, contexts: [{ context_id: scope.contextId, label: 'SD' }], projections: [{ context_id: scope.contextId, constructs: [element], suppressed_states: [] }] });
const option = { enabled: true, option_id: 'option.object', capability_query_id: 'query.test', command_type: 'CREATE_ELEMENT', capability_ref: { capability_id: 'CAP-OBJECT-001' }, symbol_descriptor: { id: 'symbol.object.basic' } };
const command = { command_type: 'CREATE_ELEMENT', payload: { context_id: scope.contextId, kind: 'OBJECT', name: '磨豆机', layout: { x: 300, y: 120 } } };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'assistant-unit-')); const current = snapshot(); const receipts = new Map(); let writes = 0;
  const service = new AssistantService({ dataRoot: root }); await service.init();
  const runtime = {
    open: async () => ({ draft_token: { ...current.token } }), snapshot: async () => structuredClone(current),
    query: async (_, operation, body) => {
      if (operation === 'capabilities') return { data: { options: [option] } };
      if (operation === 'receipts') return receipts.has(body.idempotency_id) ? { status: 'FOUND', result: receipts.get(body.idempotency_id) } : { status: 'NOT_FOUND' };
      if (operation === 'commands') { writes++; current.token.edit_seq++; const result = { draft_token: { ...current.token } }; receipts.set(body.command_id, result); return result; }
      throw new Error('未知操作');
    },
  };
  service.runtime = () => runtime;
  const conversation = await service.create(scope, 'session');
  const task = { key: conversation.id, scope, session: 'session', active: true, runId: 'run.test', snapshot: structuredClone(current), capabilities: new Map([[option.option_id, { option, scope: { context_id: scope.contextId, selection_id: null, intent: 'CREATE_ELEMENT', endpoints: [] } }]]) };
  service.tasks.set(scope.projectId, task);
  await service.store.update(conversation.id, v => { v.run = { id: task.runId, status: 'running' }; });
  const propose = async () => {
    const result = await service.tool(conversation.id, 'propose_change', { option_id: option.option_id, payload_json: JSON.stringify(command.payload), summary: '添加磨豆机' });
    await service.store.update(conversation.id, v => { v.run.status = 'completed'; }); return result.proposal_id;
  };
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  return { service, runtime, conversation, task, current, receipts, propose, writes: () => writes };
}

test('提案和取消不写模型；重复及并行应用只提交一次', async t => {
  const f = await fixture(t); const p = await f.propose(); assert.equal(f.writes(), 0);
  await f.service.cancel(f.conversation.id, scope, p); await assert.rejects(f.service.apply(f.conversation.id, scope, p, 'session')); assert.equal(f.writes(), 0);
  f.task.active = true; await f.service.store.update(f.conversation.id, v => { v.run.status = 'running'; });
  const next = await f.propose(); await Promise.all([f.service.apply(f.conversation.id, scope, next, 'session'), f.service.apply(f.conversation.id, scope, next, 'session')]); assert.equal(f.writes(), 1);
});
test('手工编辑导致过期，助手不能覆盖', async t => {
  const f = await fixture(t); const p = await f.propose(); f.current.token.edit_seq++;
  await assert.rejects(f.service.apply(f.conversation.id, scope, p, 'session'), { code: 'DRAFT_CONFLICT' });
  assert.equal((await f.service.get(f.conversation.id, scope, 'session')).proposals[0].status, 'stale'); assert.equal(f.writes(), 0);
});
test('提交成功但响应丢失时按同一回执恢复，不重复创建', async t => {
  const f = await fixture(t); const p = await f.propose(), original = f.runtime.query;
  f.runtime.query = async (...args) => { const value = await original(...args); if (args[1] === 'commands') throw new Error('连接中断'); return value; };
  const value = await f.service.apply(f.conversation.id, scope, p, 'session'); assert.equal(value.proposals[0].status, 'applied');
  await f.service.apply(f.conversation.id, scope, p, 'session'); assert.equal(f.writes(), 1);
});
test('未知结果持久保留 pending，重启读取回执恢复', async t => {
  const f = await fixture(t); const p = await f.propose(), original = f.runtime.query;
  f.runtime.query = async (...args) => { if (args[1] === 'commands') throw new AssistantError('TIMEOUT', '未知结果', 504); return original(...args); };
  await assert.rejects(f.service.apply(f.conversation.id, scope, p, 'session'));
  const stored = await f.service.store.read(f.conversation.id); assert.equal(stored.proposals[0].status, 'pending');
  f.receipts.set(stored.proposals[0].commandId, { draft_token: token });
  const reopened = new AssistantService(f.service.config); reopened.runtime = () => f.runtime; await reopened.init();
  assert.equal((await reopened.get(f.conversation.id, scope, 'session')).proposals[0].status, 'applied'); assert.equal(f.writes(), 0);
});
test('对话越界、非法命令和停止后工具无写入', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.get(f.conversation.id, { ...scope, contextId: 'context.other' }, 'session'), { code: 'SCOPE_MISMATCH' });
  await assert.rejects(f.service.tool(f.conversation.id, 'get_capabilities', { command_type: 'DELETE_CONTEXT' }), { code: 'COMMAND_NOT_ALLOWED' });
  await f.service.stop(f.conversation.id, scope); await assert.rejects(f.propose(), { code: 'RUN_STOPPED' }); assert.equal(f.writes(), 0);
});
test('共享身份及被细化元素阻断跨图改名，同名不同身份不联动；布局不串图', () => {
  const s = snapshot(); s.projections.push({ context_id: 'context.child', refinee_element_id: element.target_id, constructs: [{ ...element, occurrence_id: 'occurrence.child' }], suppressed_states: [] });
  const rename = { command_type: 'UPDATE_PROPERTY', payload: { target_ref: { target_id: element.target_id }, value: '豆子' } };
  assert.deepEqual(affectedContexts(s, scope.contextId, rename), ['context.root', 'context.child']);
  s.projections[1].refinee_element_id = 'element.other'; s.projections[1].constructs[0].target_id = 'element.other';
  assert.deepEqual(affectedContexts(s, scope.contextId, rename), ['context.root']);
  assert.deepEqual(affectedContexts(s, scope.contextId, { command_type: 'UPDATE_LAYOUT', payload: { occurrence_id: element.occurrence_id } }), ['context.root']);
});
test('状态和关系候选不能伪造目标或角色', () => {
  const state = { command_type: 'CREATE_STATE', payload: { owner_ref: { target_id: element.target_id, target_kind: 'ELEMENT' }, capability_ref: option.capability_ref, occurrence: { ownership: 'OWNED', construct_role: 'OBJECT_STATE' } } };
  assert.throws(() => validateBoundCommand(snapshot(), scope.contextId, state, option, { selection_id: element.occurrence_id }), { code: 'INPUT_INVALID' });
  const relation = { command_type: 'CREATE_FACT', payload: { capability_ref: { capability_id: 'CAP-ISO-PROC-008' }, fact_family: 'TRANSFORMATION', normalized_endpoints: [], occurrence: { ownership: 'OWNED', construct_role: 'PROCEDURAL_LINK' } } };
  assert.throws(() => validateBoundCommand(snapshot(), scope.contextId, relation, { ...option, capability_ref: { capability_id: 'CAP-ISO-PROC-008' }, normalized_endpoints: [{ role: 'SOURCE' }] }, {}), { code: 'CAPABILITY_INVALID' });
});
test('并发历史写入不丢失；配置和输入错误不泄露密钥', async t => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-store-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ConversationStore(root); await store.init(); const v = await store.create(scope);
  await Promise.all(Array.from({ length: 20 }, (_, n) => store.update(v.id, x => x.messages.push({ text: String(n) })))); assert.equal((await store.read(v.id)).messages.length, 20);
  assert.throws(() => scopeInput({ ...scope, projectId: '../other' })); assert.throws(() => store.path('../other'));
  assert(!safeMessage(new Error('key=sk-secret123')).includes('sk-secret123'));
});
test('SDK 新会话创建与持久会话恢复均限制专用工具', async () => {
  const calls = [], make = async options => { options.setup({ tools: { restrict: x => calls.push(x.allow) } }); return { dispose() {} }; };
  const ctx = { on: () => () => {}, agents: { create: async x => { calls.push('create'); return make(x); }, resume: async x => { calls.push('resume'); return make(x); } }, sessionPersistence: { stat: async x => ['existing', 'review.existing'].includes(x) ? {} : undefined } };
  const server = new ModelingSdkServer(ctx, { notify() {} }); await server.createSession('new'); await server.createSession('existing'); await server.createSession('review.new'); await server.createSession('review.existing');
  assert.deepEqual(calls, ['create', ['read_model', 'get_capabilities', 'propose_change', 'stage_change', 'revise_plan'], 'resume', ['read_model', 'get_capabilities', 'propose_change', 'stage_change', 'revise_plan'], 'create', ['read_review_model', 'submit_review'], 'resume', ['read_review_model', 'submit_review']]);
});
test('未完成或缺失的 SDK 结束原因不能显示生成成功', async t => {
  const f = await fixture(t);
  for (const kind of ['completed', 'max-tokens', 'blocked', 'aborted', 'interrupted', undefined]) {
    f.service.tasks.set(scope.projectId, f.task);
    f.service.harnesses.set(scope.projectId, { run: async () => ({ finalResponse: '本轮文本', events: kind ? [{ type: 'turn/end', data: { reason: { kind } } }] : [] }), close() {} });
    await f.service.generate(f.task, '解释模型', await f.service.store.read(f.conversation.id));
    assert.equal((await f.service.store.read(f.conversation.id)).run.status, kind === 'completed' ? 'completed' : 'failed');
  }
});
test('状态变化查询完整保留三端点顺序并绑定 Runtime 候选', async t => {
  const f = await fixture(t);
  f.task.snapshot.projections[0].constructs.push(
    { target_id: 'state.raw', occurrence_id: 'occurrence.raw', target_kind: 'STATE' },
    { target_id: 'element.roast', occurrence_id: 'occurrence.roast', target_kind: 'ELEMENT' },
    { target_id: 'state.done', occurrence_id: 'occurrence.done', target_kind: 'STATE' });
  let received;
  const effect = { ...option, capability_ref: { capability_id: 'CAP-ISO-PROC-008' } };
  f.runtime.query = async (_, operation, body) => { assert.equal(operation, 'capabilities'); received = body.scope.endpoints; return { data: { options: [effect] } }; };
  const result = await f.service.tool(f.conversation.id, 'get_capabilities', { command_type: 'CREATE_FACT', endpoints: ['state.raw', 'element.roast', 'state.done'] });
  assert.deepEqual(received, ['occurrence.raw', 'occurrence.roast', 'occurrence.done']);
  assert.equal(result.fixed_parameters[0].fact_family, 'TRANSFORMATION');
  assert.equal(f.task.capabilities.get(effect.option_id).option.capability_ref.capability_id, 'CAP-ISO-PROC-008');
  assert.equal(f.writes(), 0);
});
test('同 OPD 并发获取唯一身份，重启不另建会话，不同 OPD 隔离', async t => {
  const f = await fixture(t);
  const values = await Promise.all(Array.from({ length: 20 }, (_, n) => n % 2 ? f.service.create(scope, 'session') : f.service.list(scope, 'session').then(x => x[0])));
  assert.equal(new Set(values.map(x => x.id)).size, 1); assert.equal(values[0].id, f.conversation.id);
  assert.equal((await f.service.store.list(scope)).length, 1);
  const fresh = { ...scope, contextId: 'context.new' };
  const created = await Promise.all(Array.from({ length: 20 }, () => f.service.create(fresh, 'session')));
  assert.equal(new Set(created.map(x => x.id)).size, 1); assert.equal((await f.service.store.list(fresh)).length, 1);
  const next = new AssistantService(f.service.config); next.runtime = () => f.runtime; await next.init();
  assert.equal((await next.list(scope, 'session'))[0].id, f.conversation.id);
  const child = await next.create({ ...scope, contextId: 'context.child' }, 'session'); assert.notEqual(child.id, f.conversation.id);
  assert.equal(f.writes(), 0);
});
test('存量多会话选择最近有内容的记录，保留其他历史且绑定不随排序变化', async t => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-legacy-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ConversationStore(root); await store.init();
  const older = await store.create(scope), recent = await store.create(scope), empty = await store.create(scope);
  older.messages = [{ text: '旧建模历史' }]; older.updatedAt = '2026-10-01';
  recent.messages = [{ text: '当前建模历史' }]; recent.updatedAt = '2026-10-02'; empty.updatedAt = '2026-10-03';
  for (const value of [older, recent, empty]) await store.write(value);
  assert.equal((await store.getOrCreate(scope)).id, recent.id);
  assert.deepEqual(await store.read(older.id), older); assert.deepEqual(await store.read(empty.id), empty);
  await store.update(older.id, v => { v.messages.push({ text: '旧会话后续记录' }); });
  const reopened = new ConversationStore(root); await reopened.init(); assert.equal((await reopened.getOrCreate(scope)).id, recent.id);
  assert.equal((await reopened.list(scope)).length, 3); assert.deepEqual((await reopened.read(recent.id)).messages, recent.messages);
});
test('存量会话优先保留待核对回执及未结束生成', async t => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-pending-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ConversationStore(root); await store.init();
  const pending = await store.create(scope), latest = await store.create(scope);
  pending.proposals = [{ id: 'p', status: 'pending', commandId: 'command.original' }]; pending.updatedAt = '2026-10-01';
  latest.messages = [{ text: '较新对话' }]; latest.updatedAt = '2026-10-02'; await store.write(pending); await store.write(latest);
  assert.equal((await store.getOrCreate(scope)).id, pending.id); assert.equal((await store.read(pending.id)).proposals[0].commandId, 'command.original');
  const childScope = { ...scope, contextId: 'context.child' }; const running = await store.create(childScope), empty = await store.create(childScope);
  running.run = { status: 'running' }; await store.write(running); await store.write(empty);
  assert.equal((await store.getOrCreate(childScope)).id, running.id);
});
test('服务重启不改正常历史时间，仅标记被中断生成', async t => {
  const f = await fixture(t); const stored = await f.service.store.read(f.conversation.id); stored.run = null; stored.updatedAt = '2026-10-01'; await f.service.store.write(stored);
  const next = new AssistantService(f.service.config); await next.init(); assert.equal((await next.store.read(stored.id)).updatedAt, '2026-10-01');
});

const planStep = { local_id: 'local.equipment', command_type: 'CREATE_ELEMENT', kind: 'OBJECT', name: '磨豆机', layout: { x: 300, y: 120 } };
async function stageFixture(t) {
  const f = await fixture(t), original = f.runtime.query;
  f.runtime.query = async (...args) => args[1] === 'plan-preview' ? { data: { context_id: scope.contextId, constructs: [element], suppressed_states: [] }, capabilities: { options: [option] }, findings: { validation_scope: 'MODEL', items: [], validation_summary: { blocking: 0, warning: 0, suggestion: 0, coverage_state: 'INCOMPLETE' } } } : original(...args);
  f.stage = step => f.service.tool(f.conversation.id, 'stage_change', { step_json: JSON.stringify(step) });
  f.finish = async (reason = 'completed') => {
    f.service.harnesses.set(scope.projectId, { run: async (_text, options) => { if (options.sessionId.startsWith('review.')) await completeReview(f.service, options.sessionId); return { finalResponse: '完整方案等待确认', events: [{ type: 'turn/end', data: { reason: { kind: reason } } }] }; }, close() {} });
    await f.service.generate(f.task, '创建完整咖啡流程', await f.service.store.read(f.conversation.id));
    return f.service.get(f.conversation.id, scope, 'session');
  };
  return f;
}
test('实时阶段零写入，整轮完成后只有一个可确认方案，重复提交一次', async t => {
  const f = await stageFixture(t);
  await f.stage(planStep); let value = await f.service.get(f.conversation.id, scope, 'session');
  assert.equal(value.proposals[0].status, 'staging'); assert(value.proposals[0].previewData); assert.equal(f.writes(), 0);
  await assert.rejects(f.service.apply(f.conversation.id, scope, value.proposals[0].id, 'session'));
  await f.stage({ ...planStep, local_id: 'local.roast', kind: 'PROCESS', name: '烘焙' });
  value = await f.finish(); assert.equal(value.proposals.length, 1); assert.equal(value.proposals[0].status, 'ready');
  assert.equal(value.proposals[0].command.payload.steps.length, 2);
  await Promise.all([f.service.apply(value.id, scope, value.proposals[0].id, 'session'), f.service.apply(value.id, scope, value.proposals[0].id, 'session')]); assert.equal(f.writes(), 1);
});
test('生成失败、停止或未修正的失败步骤不能确认半张图', async t => {
  for (const failure of ['truncated', 'stopped', 'step']) {
    const f = await stageFixture(t); await f.stage(planStep);
    if (failure === 'stopped') await f.service.stop(f.conversation.id, scope);
    else if (failure === 'truncated') await f.finish('max-tokens');
    else {
      await assert.rejects(f.stage({ ...planStep, local_id: 'local.bad', command_type: 'DELETE_CONTEXT' }));
      await f.finish();
    }
    const value = await f.service.get(f.conversation.id, scope, 'session'); assert(['blocked', 'cancelled'].includes(value.proposals[0].status));
    await assert.rejects(f.service.apply(value.id, scope, value.proposals[0].id, 'session')); assert.equal(f.writes(), 0);
  }
});
test('方案候选查询带上当前暂存步骤与别名，失败步骤修正后可完成', async t => {
  const f = await stageFixture(t), original = f.runtime.query; let requested;
  f.runtime.query = async (...args) => { if (args[1] === 'plan-preview') requested = args[2]; return original(...args); };
  await f.stage(planStep); await f.service.tool(f.conversation.id, 'get_capabilities', { command_type: 'CREATE_STATE', selection_id: 'local.equipment' });
  assert.equal(requested.steps.length, 1); assert.equal(requested.next_scope.selection_id, 'local.equipment');
  const bad = { ...planStep, local_id: 'local.second', kind: 'INVALID' }; await assert.rejects(f.stage(bad));
  await f.stage({ ...bad, kind: 'PROCESS' }); assert.equal((await f.finish()).proposals[0].status, 'ready'); assert.equal(f.writes(), 0);
});
test('确认前续聊沿用未提交整图及稳定身份，旧提案由完整新方案替代', async t => {
  const f = await stageFixture(t); await f.stage(planStep); const first = await f.finish();
  const initial = first.proposals[0]; assert.equal(initial.quality.plan_digest, planDigest(initial)); let stages;
  f.service.harnesses.set(scope.projectId, { run: async (_text, options) => {
    if (options.sessionId.startsWith('review.')) { await completeReview(f.service, options.sessionId); return completed(); }
    const read = await f.service.tool(first.id, 'read_model', {}); stages = read.staged_steps;
    await f.stage({ local_id: 'local.rename', command_type: 'UPDATE_PROPERTY', target: planStep.local_id, name: '咖啡磨豆机' });
    const staging = (await f.service.store.read(first.id)).proposals.at(-1); assert.equal(staging.quality, null);
    return { finalResponse: '已调整预览', events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  }, close() {} });
  await f.service.prompt(first.id, scope, 'session', '修改未确认图中的设备名称', [], token);
  await f.service.tasks.get(scope.projectId)?.completion;
  assert.equal(f.service.tasks.has(scope.projectId), false);
  const value = await f.service.get(first.id, scope, 'session'); const latest = value.proposals.at(-1);
  assert.deepEqual(stages, [planStep]); assert.equal(latest.status, 'ready');
  assert.equal(latest.commandId, initial.commandId); assert.notEqual(latest.id, initial.id);
  assert.equal(latest.command.payload.steps.length, 2); assert.equal(value.proposals[0].status, 'cancelled');
  assert.equal(latest.quality.plan_digest, planDigest(latest)); assert.notEqual(latest.quality.plan_digest, initial.quality.plan_digest);
  assert.equal(f.writes(), 0);
});

const completed = () => ({ events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] });
test('审查输出截断仍阻断确认，保留已完成的平台诊断并显示长度限制原因', async t => {
  for (const submitted of [false, true]) {
    const f = await stageFixture(t); await f.stage(planStep);
    f.service.harnesses.set(scope.projectId, { run: async (text, options) => {
      if (options.sessionId.startsWith('review.')) {
        assert.match(text, /先提交.*结构化报告/);
        if (submitted) await completeReview(f.service, options.sessionId);
        return { events: [{ type: 'turn/end', data: { reason: { kind: 'max-tokens' } } }] };
      }
      return completed();
    }, close() {} });
    await f.service.generate(f.task, '创建设备', await f.service.store.read(f.conversation.id));
    const value = await f.service.get(f.conversation.id, scope, 'session'), proposal = value.proposals[0];
    assert.equal(proposal.status, 'blocked');
    assert.match(value.run.message, /长度限制/);
    assert.equal(proposal.validation.validation_summary.blocking, 0);
    assert.equal(proposal.review, null);
    await assert.rejects(f.service.apply(value.id, scope, proposal.id, 'session'));
    assert.equal(f.writes(), 0);
  }
});
async function completeReview(service, sessionId, overrides = {}) {
  const data = await service.tool(sessionId, 'read_review_model', {});
  const report = { snapshot_digest: data.snapshot_digest, checks: reviewRules.rules.map(rule => ({ rule_id: rule.rule_id, result: 'PASS', explanation: '场景检查通过' })), issues: [], assumptions: [], ...overrides };
  await service.tool(sessionId, 'submit_review', { report_json: JSON.stringify(report) });
}
test('平台阻断触发暂存修正，通过重新诊断和独立审查后只确认一次', async t => {
  const f = await stageFixture(t), original = f.runtime.query; let finalChecks = 0, repairs = 0;
  f.runtime.query = async (...args) => {
    const result = await original(...args);
    if (args[1] === 'plan-preview' && args[2].finalize) { finalChecks++; if (finalChecks === 1) result.findings.validation_summary.blocking = 1; }
    return result;
  };
  await f.stage(planStep);
  f.service.harnesses.set(scope.projectId, { run: async (_text, options) => {
    if (options.sessionId.startsWith('review.')) {
      await assert.rejects(f.service.tool(options.sessionId, 'stage_change', { step_json: JSON.stringify(planStep) }), { code: 'COMMAND_NOT_ALLOWED' });
      await assert.rejects(f.stage({ ...planStep, local_id: 'forged' }), { code: 'COMMAND_NOT_ALLOWED' });
      await completeReview(f.service, options.sessionId);
    } else if (f.task.repairing) { assert.match(_text, /name: opm-modeling-guide/); repairs++; await f.service.tool(f.conversation.id, 'revise_plan', { steps_json: JSON.stringify([{ ...planStep, name: '正确设备' }]) }); }
    return completed();
  }, close() {} });
  await f.service.generate(f.task, '创建设备', await f.service.store.read(f.conversation.id));
  const value = await f.service.get(f.conversation.id, scope, 'session'), plan = value.proposals[0];
  assert.equal(repairs, 1); assert.equal(finalChecks, 2); assert.equal(plan.status, 'ready'); assert.equal(plan.review.checks.length, reviewRules.rules.length);
  assert.equal(plan.validation.validation_summary.blocking, 0); assert.equal(f.writes(), 0);
  assert.match(value.messages.at(-1).text, /自动修正了检查发现的问题/);
  await f.service.apply(value.id, scope, plan.id, 'session'); assert.equal(f.writes(), 1);
});
test('脑图语义冲突自动修正预览，同步来源并重新审查，未确认前零写入', async t => {
  const f = await stageFixture(t), original = f.runtime.query; let checks = 0, repairs = 0;
  const extra = { ...planStep, local_id: 'local.extra', name: '重复对象' };
  f.task.analysisSource = { mindmap_id: 'mindmap.test', revision: 1, digest: 'b'.repeat(64), excluded_ids: [], bindings: [
    { source_id: 'equipment', target_ref: planStep.local_id }, { source_id: 'extra', target_ref: extra.local_id } ] };
  f.task.analysisDocument = { nodes: [{ id: 'equipment', label: planStep.name }, { id: 'extra', label: '重复对象' }], relations: [] };
  f.task.text = '测试脑图转换';
  await f.stage(planStep); await f.stage(extra);
  f.service.harnesses.set(scope.projectId, { close() {}, async run(text, options) {
    if (options.sessionId.startsWith('review.')) {
      checks++;
      if (checks === 1) await completeReview(f.service, options.sessionId, {
        checks: reviewRules.rules.map(rule => ({ rule_id: rule.rule_id, result: rule.rule_id === 'OPM-THING' ? 'ISSUE' : 'PASS', explanation: '检查依据' })),
        issues: [{ rule_id: 'OPM-THING', basis: 'STANDARD', severity: 'ERROR', context_id: scope.contextId, target_ids: [element.target_id], message: '重复对象冲突', suggestion: '移除重复项' }] });
      else { assert.ok(f.task.review.snapshot.request.includes('重复对象')); await completeReview(f.service, options.sessionId); }
    } else if (f.task.repairing) {
      repairs++; assert.ok(text.includes('脑图'));
      const before = structuredClone(f.task.analysisSource);
      f.runtime.query = async (...args) => args[1] === 'plan-preview' ? Promise.reject(new Error('测试预览失败')) : original(...args);
      await assert.rejects(f.service.tool(f.conversation.id, 'revise_plan', { steps_json: JSON.stringify([planStep]) }));
      assert.deepEqual(f.task.analysisSource, before);
      f.runtime.query = original;
      await f.service.tool(f.conversation.id, 'revise_plan', { steps_json: JSON.stringify([planStep]) });
    }
    return completed();
  } });
  await f.service.finalizePlan(f.task, f.service.harnesses.get(scope.projectId));
  const proposal = (await f.service.store.read(f.conversation.id)).proposals[0];
  assert.equal(repairs, 1); assert.equal(checks, 2); assert.equal(proposal.command.payload.steps.length, 1);
  assert.deepEqual(proposal.analysisSource.excluded_ids, ['extra']); assert.equal(proposal.analysisSource.bindings.length, 1);
  assert.equal(proposal.validation.validation_summary.blocking, 0); assert.equal(proposal.review.issues.length, 0);
  assert.equal(f.writes(), 0); assert.equal(f.task.analysisDocument.nodes.length, 2);
});
test('脑图第二轮可恢复误删项，工具保留原步骤，重新协调来源且仍然零写入', async t => {
  const f = await stageFixture(t), extra = { ...planStep, local_id: 'local.extra', name: '必需测试对象' };
  const initialSource = { mindmap_id: 'mindmap.test', revision: 1, digest: 'b'.repeat(64), excluded_ids: ['user.excluded'], bindings: [
    { source_id: 'equipment', target_ref: planStep.local_id }, { source_id: 'extra', target_ref: extra.local_id } ] };
  f.task.analysisSource = structuredClone(initialSource);
  f.task.analysisDocument = { nodes: [{ id: 'equipment', label: planStep.name }, { id: 'extra', label: extra.name }], relations: [] };
  f.task.text = '保留两个测试对象'; f.task.analysisRequest = f.task.text;
  await f.stage(planStep); await f.stage(extra); let reviews = 0, repairs = 0;
  const harness = { close() {}, async run(_prompt, options) {
    if (options.sessionId.startsWith('review.')) {
      reviews++;
      if (reviews < 3) await completeReview(f.service, options.sessionId, {
        checks: reviewRules.rules.map(rule => ({ rule_id: rule.rule_id, result: rule.rule_id === 'OPM-THING' ? 'ISSUE' : 'PASS', explanation: '检查依据' })),
        issues: [{ rule_id: 'OPM-THING', basis: 'USER_REQUIREMENT', severity: 'ERROR', context_id: scope.contextId, target_ids: [element.target_id], message: reviews === 1 ? '检查对象' : '必需对象误删', suggestion: '核对原需求' }] });
      else { assert.ok(!f.task.review.snapshot.request.includes('必需测试对象')); await completeReview(f.service, options.sessionId); }
    } else if (f.task.repairing) {
      repairs++;
      const model = await f.service.tool(f.conversation.id, 'read_model', {});
      assert.deepEqual(model.original_conversion_steps, [planStep, extra]);
      await f.service.tool(f.conversation.id, 'revise_plan', { steps_json: JSON.stringify(repairs === 1 ? [planStep] : model.original_conversion_steps) });
    }
    return completed();
  } };
  await f.service.finalizePlan(f.task, harness);
  const proposal = (await f.service.store.read(f.conversation.id)).proposals[0];
  assert.equal(reviews, 3); assert.equal(repairs, 2);
  assert.deepEqual(proposal.analysisSource, initialSource); assert.deepEqual(f.task.removedAnalysisLabels, []);
  assert.deepEqual(proposal.command.payload.steps, [planStep, extra]); assert.equal(f.writes(), 0);
});
test('持续审查错误最多修正两轮，未完成报告不能确认；旧方案缺审查也禁止应用', async t => {
  for (const mode of ['error', 'missing', 'old']) {
    const f = await stageFixture(t); await f.stage(planStep); let repairs = 0;
    f.service.harnesses.set(scope.projectId, { run: async (_text, options) => {
      if (options.sessionId.startsWith('review.') && mode !== 'missing') {
        const checks = reviewRules.rules.map(rule => ({ rule_id: rule.rule_id, result: rule.rule_id === 'OPM-THING' ? 'ISSUE' : 'PASS', explanation: '检查依据' }));
        await completeReview(f.service, options.sessionId, { checks, issues: [{ rule_id: 'OPM-THING', basis: 'STANDARD', severity: 'ERROR', context_id: scope.contextId, target_ids: [element.target_id], message: '类型错误', suggestion: '修正类型' }] });
      } else if (f.task.repairing) repairs++;
      return completed();
    }, close() {} });
    if (mode === 'old') await f.service.store.update(f.conversation.id, value => { value.run.status = 'completed'; value.proposals[0].status = 'ready'; });
    else await f.service.generate(f.task, '创建设备', await f.service.store.read(f.conversation.id));
    const value = await f.service.get(f.conversation.id, scope, 'session'); assert.equal(value.proposals[0].status, mode === 'old' ? 'ready' : 'blocked');
    assert.equal(repairs, mode === 'error' ? 2 : 0);
    await assert.rejects(f.service.apply(value.id, scope, value.proposals[0].id, 'session')); assert.equal(f.writes(), 0);
  }
});

test('审查阶段停止取消预览，迟到报告不能恢复确认', async t => {
  const f = await stageFixture(t); await f.stage(planStep);
  let release, sessionId; const held = new Promise(resolve => { release = resolve; });
  let entered; const reviewing = new Promise(resolve => { entered = resolve; });
  f.service.harnesses.set(scope.projectId, { run: async (_text, options) => {
    if (options.sessionId.startsWith('review.')) { sessionId = options.sessionId; entered(); await held; }
    return completed();
  }, close() { release(); } });
  const generation = f.service.generate(f.task, '创建设备', await f.service.store.read(f.conversation.id));
  await reviewing; await f.service.stop(f.conversation.id, scope); await generation;
  await assert.rejects(f.service.tool(sessionId, 'submit_review', { report_json: '{}' }), { code: 'RUN_STOPPED' });
  const value = await f.service.get(f.conversation.id, scope, 'session');
  assert.equal(value.run.status, 'stopped'); assert.equal(value.proposals[0].status, 'cancelled');
  await assert.rejects(f.service.apply(value.id, scope, value.proposals[0].id, 'session')); assert.equal(f.writes(), 0);
});
test('方案改变或规则版本与来源过期时禁止确认', async t => {
  for (const mutate of [p => p.command.payload.steps[0].name = '被修改的方案', p => p.review.skill_version = 'old', p => p.review.source_digest = '0'.repeat(64)]) {
    const f = await stageFixture(t); await f.stage(planStep); await f.finish();
    await f.service.store.update(f.conversation.id, value => mutate(value.proposals[0]));
    const value = await f.service.get(f.conversation.id, scope, 'session');
    await assert.rejects(f.service.apply(value.id, scope, value.proposals[0].id, 'session'), { code: 'REVIEW_REQUIRED' }); assert.equal(f.writes(), 0);
  }
});

test('生成与修正指导不污染独立标准审查，质量建议保存且不阻断一次确认', async t => {
  const f = await stageFixture(t), original = f.runtime.query;
  f.runtime.query = async (...args) => {
    const result = await original(...args);
    if (args[1] === 'plan-preview') result.data.constructs = ['a', 'b'].map(id => ({ ...element, target_id: `element.${id}`, occurrence_id: `occurrence.${id}`, construct_role: 'OBJECT_NODE', label: '设备', layout: { x: 80, y: 200, width: 160, height: 72 } }));
    return result;
  };
  await f.stage(planStep);
  assert.deepEqual((await f.service.tool(f.conversation.id, 'read_model', {})).quality_policy, qualityPolicy);
  f.service.harnesses.set(scope.projectId, { run: async (text, options) => {
    if (options.sessionId.startsWith('review.')) { assert(!text.includes('name: opm-modeling-guide')); await completeReview(f.service, options.sessionId); }
    else assert.match(text, /name: opm-modeling-guide/);
    return completed();
  }, close() {} });
  await f.service.generate(f.task, '两个不同设备同名且保留指定位置', await f.service.store.read(f.conversation.id));
  const value = await f.service.get(f.conversation.id, scope, 'session'), plan = value.proposals[0];
  assert.equal(plan.status, 'ready'); assert.deepEqual(plan.quality.items.map(item => item.rule_id), ['QUALITY-IDENTITY', 'QUALITY-SPACING']);
  assert.equal(plan.quality.plan_digest, planDigest(plan)); assert.equal(f.writes(), 0);
  const restarted = new AssistantService(f.service.config); restarted.runtime = () => f.runtime; await restarted.init();
  assert.deepEqual((await restarted.get(value.id, scope, 'session')).proposals[0].quality, plan.quality);
  await f.service.apply(value.id, scope, plan.id, 'session'); assert.equal(f.writes(), 1);
});
