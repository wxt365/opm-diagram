import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantService } from '../src/service.mjs';
import { AssistantError } from '../src/store.mjs';

const token = { draft_id: 'draft.staging', edit_seq: 0, binding_digest: 'a'.repeat(64) };
const scope = { projectId: 'project.staging', modelId: 'model.staging', contextId: 'context.root', kind: 'ANALYSIS', mindmapId: 'mindmap.staging' };
const node = (id, kind) => ({ id, kind, label: id, parent_id: id === 'root' ? null : 'root', order: 0, note: '', collapsed: false, owner_id: null, entity_ref: null, target_id: null });
const fixture = () => ({ document: { format_version: 1, id: scope.mindmapId, revision: 1, root_id: 'root',
  nodes: [node('root', 'TOPIC'), node('object', 'OBJECT'), node('parent', 'PROCESS'), node('child', 'PROCESS')],
  relations: [{ id: 'invalid', label: '父过程包含子过程', capability_id: 'CAP-ISO-PROC-006', endpoints: ['parent', 'child'] },
    { id: 'valid', label: '子过程产出对象', capability_id: 'CAP-ISO-PROC-002', endpoints: ['child', 'object'] }] }, digest: 'b'.repeat(64), conversions: [] });

async function setup(t, failure = () => null) {
  const root = await mkdtemp(join(tmpdir(), 'mindmap-staging-')), analysis = fixture();
  const service = new AssistantService({ dataRoot: root, repairTimeoutMs: 1000 }); await service.init();
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const previews = [];
  service.runtime = () => ({ open: async () => ({ draft_token: token }),
    snapshot: async () => ({ token, contexts: [{ context_id: scope.contextId }], projections: [{ context_id: scope.contextId, constructs: [] }] }),
    query: async (_, operation, body) => {
      if (operation === 'mindmap') return structuredClone(analysis);
      assert.equal(operation, 'plan-preview');
      previews.push(structuredClone(body.steps));
      const error = failure(body.steps); if (error) throw error;
      return { data: { context_id: scope.contextId, constructs: [] } };
    } });
  let finalized = 0;
  service.finalizePlan = async task => { finalized++; assert.equal(task.failedPlanSteps?.size ?? 0, 0); };
  const conversation = await service.create(scope, 'session');
  return { service, analysis, previews, conversation, finalized: () => finalized,
    async convert() { await service.convert(conversation.id, scope, 'session', token); await service.tasks.get(scope.projectId)?.completion; return service.store.read(conversation.id); } };
}
const endpointFailure = () => Object.assign(new AssistantError('DRAFT_EDIT_REJECTED', '关系端点类型不匹配', 422), { reason_code: 'ENDPOINT_KIND_MISMATCH' });

test('关系暂存失败自动交给助手修正，保留后续独立步骤及完整基线，最终校验后才就绪', async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? endpointFailure() : null);
  const before = structuredClone(f.analysis);
  let repairs = 0;
  f.service.factory = async () => ({ close() {}, async run(prompt, options) {
    repairs++; assert.ok(prompt.includes('ENDPOINT_KIND_MISMATCH'));
    const read = await f.service.tool(options.sessionId, 'read_model', {});
    assert.equal(read.failed_steps[0].local_id, 'create.invalid');
    assert.ok(read.original_conversion_steps.some(step => step.local_id === 'create.invalid'));
    assert.ok(read.staged_steps.some(step => step.local_id === 'create.valid'));
    await assert.rejects(f.service.tool(options.sessionId, 'finish_repair', {}), { code: 'PLAN_INCOMPLETE' });
    await assert.rejects(f.service.tool(options.sessionId, 'revise_plan', { steps_json: JSON.stringify(read.staged_steps.map(step => step.local_id === 'create.valid' ? { ...step, endpoints: ['create.parent', 'create.object'] } : step)) }), { code: 'ANALYSIS_REPAIR_SCOPE' });
    await f.service.tool(options.sessionId, 'revise_plan', { steps_json: JSON.stringify(read.staged_steps) });
    await f.service.tool(options.sessionId, 'finish_repair', {});
    await assert.rejects(f.service.tool(options.sessionId, 'revise_plan', { steps_json: JSON.stringify(read.staged_steps) }), { code: 'RUN_STOPPED' });
    return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  const result = await f.convert(), proposal = result.proposals.at(-1);
  assert.equal(repairs, 1); assert.equal(f.finalized(), 1); assert.equal(result.run.status, 'completed');
  assert.equal(proposal.status, 'ready'); assert.deepEqual(proposal.failedSteps, []);
  assert.ok(proposal.analysisSource.excluded_ids.includes('invalid'));
  assert.ok(result.messages.at(-1).text.includes('父过程包含子过程'));
  assert.deepEqual(f.analysis, before);
});

for (const code of ['DRAFT_CONFLICT', 'LOCAL_SESSION_INVALID', 'RUNTIME_FAILED', 'RUN_STOPPED']) test(`${code} 不进入自动修正且不能生成可确认方案`, async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? new AssistantError(code, code) : null);
  let repairs = 0; f.service.factory = async () => ({ close() {}, async run() { repairs++; } });
  const result = await f.convert();
  assert.equal(repairs, 0); assert.equal(f.finalized(), 0); assert.equal(result.run.code, code);
  assert.equal(result.proposals.at(-1).status, 'blocked');
});

test('修正未提交完整有效方案时保留失败诊断，不执行最终校验、不允许确认', async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? endpointFailure() : null);
  f.service.factory = async () => ({ close() {}, async run() { return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] }; } });
  const result = await f.convert();
  assert.equal(result.run.status, 'failed'); assert.equal(f.finalized(), 0);
  assert.equal(result.proposals.at(-1).status, 'blocked');
  assert.equal(result.proposals.at(-1).failedSteps[0].local_id, 'create.invalid');
  assert.equal(result.proposals.at(-1).repairDiagnostics.state, 'failed');
  f.service.harnesses.set(scope.projectId, { close() {}, async run(_, options) {
    const read = await f.service.tool(options.sessionId, 'read_analysis', {});
    assert.equal(read.conversion_diagnostics.failure_code, 'PLAN_INCOMPLETE');
    assert.equal(read.conversion_diagnostics.failed_steps[0].local_id, 'create.invalid');
    assert.equal(read.conversion_diagnostics.conversion_failures[0].reason_code, 'ENDPOINT_KIND_MISMATCH');
    assert.ok(read.relation_guidance.includes('过程分解不能用 CAP-ISO-PROC-006'));
    return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  await f.service.prompt(f.conversation.id, scope, 'session', '解释转换失败原因', [], token);
  await f.service.tasks.get(scope.projectId).completion;
});

test('转换自动修正超时保留失败步骤，停止后不执行最终审查', async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? endpointFailure() : null);
  f.service.config.repairTimeoutMs = 20;
  let closed = 0;
  f.service.factory = async () => ({ close() { closed++; }, run() { return new Promise(() => {}); } });
  const result = await f.convert();
  assert.equal(result.run.code, 'REPAIR_TIMEOUT'); assert.equal(f.finalized(), 0); assert.equal(closed, 1);
  assert.equal(result.proposals.at(-1).status, 'blocked');
  assert.equal(result.proposals.at(-1).failedSteps[0].local_id, 'create.invalid');
});

test('用户停止自动修正时保留停止状态，迟到工具不能继续修改或进入最终校验', async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? endpointFailure() : null);
  f.service.factory = async () => ({ close() {}, async run(_, options) {
    await f.service.stop(f.conversation.id, scope);
    await assert.rejects(f.service.tool(options.sessionId, 'revise_plan', { steps_json: '[]' }), { code: 'RUN_STOPPED' });
    return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  const result = await f.convert();
  assert.equal(result.run.status, 'stopped'); assert.equal(f.finalized(), 0);
  assert.equal(result.proposals.at(-1).status, 'cancelled');
});

test('转换修正后最终校验仍阻断时不能标记就绪', async t => {
  const f = await setup(t, steps => steps.some(step => step.local_id === 'create.invalid') ? endpointFailure() : null);
  f.service.factory = async () => ({ close() {}, async run(_, options) {
    const read = await f.service.tool(options.sessionId, 'read_model', {});
    await f.service.tool(options.sessionId, 'revise_plan', { steps_json: JSON.stringify(read.staged_steps) });
    await f.service.tool(options.sessionId, 'finish_repair', {});
    return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  f.service.finalizePlan = async () => { throw new AssistantError('REVIEW_BLOCKED', '仍有业务问题'); };
  const result = await f.convert();
  assert.equal(result.run.code, 'REVIEW_BLOCKED'); assert.equal(result.proposals.at(-1).status, 'blocked');
});
