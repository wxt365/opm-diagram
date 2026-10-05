import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMindmap } from '../src/mindmap-plan.mjs';
import { AssistantService } from '../src/service.mjs';
import { ModelingSdkServer } from '../src/harness-sdk.mjs';

const token = { draft_id: 'draft.test', edit_seq: 0, binding_digest: 'a'.repeat(64) };
const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root', kind: 'ANALYSIS', mindmapId: 'mindmap.test' };
const node = (id, kind, parent = 'node.root', owner = null) => ({ id, kind, label: id, parent_id: parent, order: 0, note: '', collapsed: false, owner_id: owner, entity_ref: null, target_id: null });
const fixture = () => ({ document: { format_version: 1, id: scope.mindmapId, revision: 0, root_id: 'node.root', nodes: [node('node.root', 'TOPIC', null), node('beans', 'OBJECT'), node('raw', 'STATE', 'beans', 'beans'), node('done', 'STATE', 'beans', 'beans'), node('roast', 'PROCESS')], relations: [{ id: 'effect', label: '烘焙状态变化', capability_id: 'CAP-ISO-PROC-008', endpoints: ['raw', 'roast', 'done'] }] }, digest: 'b'.repeat(64), conversions: [] });
const snapshot = constructs => ({ token, contexts: [{ context_id: scope.contextId, label: 'SD' }], projections: [{ context_id: scope.contextId, constructs }] });
test('分析助手读取最新同版本失败报告及端点，保存或模型改变后不沿用旧诊断', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mindmap-feedback-')), data = fixture();
  const service = new AssistantService({ dataRoot: root }); await service.init();
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let modelToken = token;
  service.runtime = () => ({ open: async () => ({ draft_token: modelToken }), snapshot: async () => ({ ...snapshot([]), token: modelToken }), query: async () => structuredClone(data) });
  const conversation = await service.create(scope, 'session');
  const proposal = { id: 'blocked', status: 'blocked', contextId: scope.contextId, baseToken: token,
    analysisSource: { mindmap_id: scope.mindmapId, revision: 0, bindings: [{ source_id: 'beans', target_ref: 'create.beans' }] },
    review: { issues: [{ target_ids: ['target.beans'], message: '物料关系冲突' }] },
    command: { payload: { steps: [{ local_id: 'create.beans' }] } }, previewData: { constructs: [{ target_id: 'target.beans', label: '测试物料', endpoints: [] }] } };
  await service.store.update(conversation.id, v => { v.proposals.push(proposal); });
  let expected = true;
  service.harnesses.set(scope.projectId, { close() {}, async run(prompt, options) {
    assert.ok(prompt.includes('conversion_diagnostics')); assert.ok(prompt.includes('不同对象'));
    const read = await service.tool(options.sessionId, 'read_analysis', {});
    if (expected) {
      assert.equal(read.conversion_diagnostics.proposal_id, 'blocked');
      assert.equal(read.conversion_diagnostics.review.issues[0].message, '物料关系冲突');
      assert.equal(read.conversion_diagnostics.constructs[0].label, '测试物料');
      assert.equal(read.conversion_diagnostics.bindings[0].source_id, 'beans');
    } else assert.equal(read.conversion_diagnostics, null);
    return { events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  const prompt = async () => { await service.prompt(conversation.id, scope, 'session', '检查并修正转换问题', [], modelToken); await service.tasks.get(scope.projectId).completion;
    assert.equal((await service.store.read(conversation.id)).run.status, 'completed'); };
  await prompt(); expected = false; data.document.revision++; await prompt();
  data.document.revision = 0; modelToken = { ...token, edit_seq: 1 }; await prompt();
  modelToken = token; await service.store.update(conversation.id, v => { v.proposals.at(-1).analysisSource.mindmap_id = 'mindmap.other'; }); await prompt();
  await service.store.update(conversation.id, v => { v.proposals.at(-1).analysisSource.mindmap_id = scope.mindmapId; v.proposals.push({ ...proposal, id: 'newer', status: 'cancelled' }); }); await prompt();
});
test('用户明确排除的内容进入独立语义审查需求，不能被当作漏建', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mindmap-exclusion-'));
  const service = new AssistantService({ dataRoot: root }); await service.init();
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const data = fixture(); data.document.nodes.push({ ...node('dose', 'ATTRIBUTE'), label: '测试属性Q' });
  service.runtime = () => ({ open: async () => ({ draft_token: token }), snapshot: async () => snapshot([]), query: async () => structuredClone(data) });
  service.factory = async () => ({ close() {} });
  service.stageChange = async task => {
    if (!task.plan) { task.plan = { proposalId: 'proposal.test' }; await service.store.update(task.key, value => { value.proposals.push({ id: 'proposal.test', status: 'staging' }); }); }
  };
  let request;
  service.finalizePlan = async task => { request = task.text; };
  const conversation = await service.create(scope, 'session');
  await service.convert(conversation.id, scope, 'session', token, ['dose']);
  await service.tasks.get(scope.projectId)?.completion;
  assert.ok(request.includes('不属于模型需求遗漏'));
  assert.ok(request.includes('"id":"dose","label":"测试属性Q"'));
  assert.ok(request.includes(scope.contextId));
  assert.equal(data.document.nodes.at(-1).kind, 'ATTRIBUTE');
});
function converted(data) {
  const mappings = [...data.document.nodes.filter(x => x.kind !== 'TOPIC'), ...data.document.relations].map(x => ({ source_id: x.id, target_id: `target.${x.id}`, source_json: JSON.stringify(x), target_name: x.label, target_kind: x.kind ?? 'FACT' }));
  data.conversions.push({ context_id: scope.contextId, revision: 0, mappings });
  return snapshot(mappings.map(x => ({ target_id: x.target_id, occurrence_id: `occurrence.${x.source_id}`, target_kind: ['OBJECT', 'PROCESS'].includes(x.target_kind) ? 'ELEMENT' : x.target_kind, construct_role: `${x.target_kind}_NODE`, label: x.target_name,
    ...(x.target_kind === 'STATE' ? { owner_id: 'target.beans' } : {}), ...(x.target_kind === 'FACT' ? { capability_id: 'CAP-ISO-PROC-008', endpoints: ['raw', 'roast', 'done'].map(id => ({ target_id: `target.${id}` })) } : {}) })));
}
test('脑图树线不成为关系，状态明确归属，三端点 Effect 保持顺序', () => {
  const data = fixture(), plan = compileMindmap(data, snapshot([]), scope.contextId);
  assert.equal(plan.steps.length, 5);
  assert.deepEqual(plan.steps.at(-1).endpoints, ['create.raw', 'create.roast', 'create.done']);
  assert.equal(plan.steps[1].target, 'create.beans'); assert.equal(plan.analysisSource.bindings.length, 5);
  const beans = plan.steps.find(step => step.local_id === 'create.beans'), roast = plan.steps.find(step => step.local_id === 'create.roast');
  assert.ok(roast.layout.y > beans.layout.y + 140);
});
test('属性类型已经明确时准确提示首版不支持，明确排除后保留来源和正常转换', () => {
  const data = fixture(); data.document.nodes.push({ ...node('dose', 'ATTRIBUTE'), label: '目标粉量', owner_id: 'beans' });
  assert.throws(() => compileMindmap(data, snapshot([]), scope.contextId), error => error.code === 'ANALYSIS_NEEDS_INPUT' && error.message.includes('属性，首版尚不支持转换') && !error.message.includes('请明确'));
  const compiled = compileMindmap(data, snapshot([]), scope.contextId, ['dose']);
  assert.equal(compiled.steps.length, 5); assert.deepEqual(compiled.analysisSource.excluded_ids, ['dose']);
  assert.equal(data.document.nodes.at(-1).label, '目标粉量');
});
test('重复转换不创建，增量改名保留身份，模型手工改名不被覆盖，三方冲突拒绝', () => {
  const data = fixture(), model = converted(data);
  assert.deepEqual(compileMindmap(data, model, scope.contextId).steps, []);
  model.projections[0].constructs[0].label = '手工改名';
  assert.deepEqual(compileMindmap(data, model, scope.contextId).steps, []);
  data.document.nodes[1].label = '另一名称';
  assert.throws(() => compileMindmap(data, model, scope.contextId), { code: 'SOURCE_CONFLICT' });
  model.projections[0].constructs[0].label = 'beans';
  assert.deepEqual(compileMindmap(data, model, scope.contextId).steps, [{ local_id: 'update.beans', command_type: 'UPDATE_PROPERTY', target: 'target.beans', name: '另一名称' }]);
  data.document.nodes.push(node('packaging', 'PROCESS'));
  assert.equal(compileMindmap(data, model, scope.contextId).steps.filter(x => x.command_type === 'CREATE_ELEMENT').length, 1);
  model.projections[0].constructs[0].layout = { x: 100, y: 900, height: 200 };
  assert.ok(compileMindmap(data, model, scope.contextId).steps.find(step => step.local_id === 'create.packaging').layout.y > 1100);
});
test('类型不明、排除依赖、已删除绑定及正式关系改变均拒绝，不按同名合并', () => {
  const data = fixture(); data.document.nodes.push(node('unknown', 'UNCLASSIFIED'));
  assert.throws(() => compileMindmap(data, snapshot([]), scope.contextId), { code: 'ANALYSIS_NEEDS_INPUT' });
  assert.equal(compileMindmap(data, snapshot([]), scope.contextId, ['unknown']).steps.length, 5);
  assert.throws(() => compileMindmap(data, snapshot([]), scope.contextId, ['unknown', 'beans']), { code: 'ANALYSIS_DEPENDENCY' });
  const model = converted(data); data.document.nodes.pop(); model.projections[0].constructs.at(-2).capability_id = 'CAP-ISO-PROC-003';
  const relation = model.projections[0].constructs.find(x => x.target_kind === 'FACT'); relation.endpoints[0].target_id = 'target.done';
  assert.throws(() => compileMindmap(data, model, scope.contextId), { code: 'SOURCE_CONFLICT' });
  model.projections[0].constructs = [];
  assert.throws(() => compileMindmap(data, model, scope.contextId), { code: 'SOURCE_BINDING_LOST' });
  const fresh = fixture(); fresh.document.nodes.push({ ...node('beans2', 'OBJECT'), label: 'beans' });
  assert.equal(compileMindmap(fresh, snapshot([]), scope.contextId).steps.filter(x => x.kind === 'OBJECT').length, 2);
  fresh.document.nodes.at(-1).entity_ref = 'beans';
  assert.equal(compileMindmap(fresh, snapshot([]), scope.contextId).steps.filter(x => x.kind === 'OBJECT').length, 1);
});
test('分析 SDK 新建和恢复会话仅开放分析工具', async () => {
  const calls = [], make = async options => { options.setup({ tools: { restrict: x => calls.push(x.allow) } }); return { dispose() {} }; };
  const ctx = { on: () => () => {}, agents: { create: make, resume: make }, sessionPersistence: { stat: async id => id.endsWith('existing') ? {} : undefined } };
  const server = new ModelingSdkServer(ctx, { notify() {} }); await server.createSession('analysis.new'); await server.createSession('analysis.existing');
  assert.deepEqual(calls, [['read_analysis', 'save_analysis'], ['read_analysis', 'save_analysis']]);
});
test('转换超过整图修改上限时拒绝，重新绑定不会套用旧目标的改名基线', () => {
  const data = fixture();
  for (let i = 0; i < 100; i++) data.document.nodes.push(node(`more.${i}`, 'OBJECT'));
  assert.throws(() => compileMindmap(data, snapshot([]), scope.contextId), { code: 'PLAN_TOO_LARGE' });
  const rebound = fixture(), model = converted(rebound);
  rebound.document.nodes[1].target_id = 'element.other'; rebound.document.nodes[1].label = '重新绑定对象';
  model.projections[0].constructs.push({ target_id: 'element.other', target_kind: 'ELEMENT', construct_role: 'OBJECT_NODE', label: '其他名称' });
  assert.throws(() => compileMindmap(rebound, model, scope.contextId), { code: 'SOURCE_CONFLICT' });
});
test('分析多轮保存与 OPD 会话隔离，同一模型切图保持同一分析会话，停止后不接受工具', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mindmap-service-')); const data = fixture();
  const service = new AssistantService({ dataRoot: root }); await service.init();
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  let writes = 0;
  service.runtime = () => ({ open: async () => ({ draft_token: token }), snapshot: async () => snapshot([]), query: async (_, op, input) => {
    assert.equal(op, 'mindmap'); if (input.action === 'SAVE') { assert.equal(input.expected_revision, data.document.revision); data.document = structuredClone(input.document); data.document.revision++; writes++; }
    return structuredClone(data);
  } });
  const analysis = await service.create(scope, 'session'), opd = await service.create({ ...scope, kind: 'OPD' }, 'session'); assert.notEqual(analysis.id, opd.id);
  assert.equal((await service.list({ ...scope, contextId: 'context.child' }, 'session'))[0].id, analysis.id);
  service.harnesses.set(scope.projectId, { close() {}, async run(prompt, options) {
    assert.ok(prompt.includes('无需新开或切换会话')); assert.ok(prompt.includes('target_id=null'));
    assert.equal(options.sessionId, `analysis.${analysis.id}`);
    const read = await service.tool(options.sessionId, 'read_analysis', {}); read.document.nodes[1].note += '补充';
    assert.ok(read.workflow.includes('不需要新建图或另开会话'));
    const badReference = structuredClone(read.document); badReference.nodes[2].entity_ref = 'beans';
    await assert.rejects(service.tool(options.sessionId, 'save_analysis', { document_json: JSON.stringify(badReference) }), error => error.code === 'INPUT_INVALID' && error.message.includes('状态归属用 owner_id'));
    const badField = structuredClone(read.document); badField.nodes[2].unknown = true;
    await assert.rejects(service.tool(options.sessionId, 'save_analysis', { document_json: JSON.stringify(badField) }), error => error.code === 'INPUT_INVALID' && error.message.includes('/nodes/2'));
    await assert.rejects(service.tool(options.sessionId, 'stage_change', {}), { code: 'COMMAND_NOT_ALLOWED' });
    await service.tool(options.sessionId, 'save_analysis', { document_json: JSON.stringify(read.document) });
    return { finalResponse: '已整理', events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } });
  for (let i = 0; i < 2; i++) { await service.prompt(analysis.id, scope, 'session', '补充分析', [], token); await service.tasks.get(scope.projectId).completion; }
  assert.equal(writes, 2); assert.equal((await service.get(analysis.id, scope, 'session')).analysisRevision, 2);
  assert.equal((await service.get(opd.id, { ...scope, kind: 'OPD' }, 'session')).messages.length, 0);
  await assert.rejects(service.tool(`analysis.${analysis.id}`, 'save_analysis', {}), { code: 'RUN_STOPPED' });
  await assert.rejects(service.create({ ...scope, mindmapId: 'mindmap.other' }, 'session'), { code: 'SCOPE_MISMATCH' });
});
