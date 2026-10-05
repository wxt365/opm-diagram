import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import { readDraftWorkspace, validateDraftWorkspace, draftEditRequestCanonical, draftEditRequestDigest } from './draft-workspace-contract.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';

const vectors = JSON.parse(readFileSync(new URL('../tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json', import.meta.url)));

test('脑图资料与来源守卫契约拒绝未知版本、超量和夹带字段', () => {
  const document = { format_version: 1, id: 'mindmap.test', revision: 0, root_id: 'root', nodes: [{ id: 'root', parent_id: null, order: 0, label: '模型分析', note: '', kind: 'TOPIC', owner_id: null, entity_ref: null, target_id: null, collapsed: false }], relations: [] };
  const request = { request_id: 'request.brain', action: 'SAVE', draft_token: vectors.commands[0].expected_draft_token, document, expected_revision: 0 };
  validateDraftWorkspace('MindmapRequest', request);
  for (const mutate of [r => r.document.format_version = 2, r => r.document.format_version = 1.5, r => r.document.revision = -1,
    r => r.document.nodes = Array(301).fill(document.nodes[0]), r => r.document.nodes[0].kind = 'UNKNOWN', r => r.document.extra = true,
    r => r.expected_revision = -1, r => r.action = 'DELETE']) {
    const invalid = structuredClone(request); mutate(invalid); assert.throws(() => validateDraftWorkspace('MindmapRequest', invalid));
  }
  const preview = { request_id: 'request.plan', draft_token: request.draft_token, context_id: 'context.root', plan_id: 'command.plan', steps: [], next_scope: null,
    analysis_source: { mindmap_id: document.id, revision: 0, digest: 'a'.repeat(64), bindings: [{ source_id: 'root', target_ref: 'element.test' }], excluded_ids: [] } };
  validateDraftWorkspace('DraftModelPlanPreviewRequest', preview);
  for (const mutate of [r => r.analysis_source.digest = null, r => r.analysis_source.bindings[0].target_ref = '', r => r.analysis_source.revision = -1, r => r.analysis_source.extra = true]) {
    const invalid = structuredClone(preview); mutate(invalid); assert.throws(() => validateDraftWorkspace('DraftModelPlanPreviewRequest', invalid));
  }
});

test('方法查询的草稿与版本来源互斥，六类角色与证据封闭', () => {
  const token = vectors.commands[0].expected_draft_token;
  const request = { request_id: 'query.method', context_id: 'context.root', source: { draft_token: token } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'MethodSummaryRequest'), request);
  const history = { ...request, source: { revision_id: 'revision.1' } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(history), 'MethodSummaryRequest'), history);
  for (const source of [{}, { draft_token: token, revision_id: 'revision.1' }, { revision_id: 'revision.1', role: 'SUBJECT' }])
    assert.throws(() => readDraftWorkspace(JSON.stringify({ ...request, source }), 'MethodSummaryRequest'), { code: 'INPUT_INVALID' });
  const roles = ['SUBJECT', 'OBJECT', 'INSTRUMENT', 'RESOURCE', 'ENVIRONMENT', 'INFORMATION'].map(role => ({ role, status: 'MANUAL', guidance: '需确认', evidence: [] }));
  const result = { meta: request, data: { coverage: 'RELATION_EVIDENCE_ONLY', architecture_links: [], contexts: [], refinements: [], processes: [{ process_id: 'process.1', name: '过程', context_ids: ['context.root'], roles }] } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(result), 'MethodSummaryResult'), result);
  for (const mutate of [r => r.data.coverage = 'COMPLETE', r => r.data.processes[0].roles.pop(), r => r.data.processes[0].roles[0].status = 'PASSED']) {
    const invalid = structuredClone(result); mutate(invalid);
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'MethodSummaryResult'), { code: 'INPUT_INVALID' });
  }
});

test('13 种命令接受各自封闭 payload，拒绝所有交叉错配', () => {
  assert.equal(vectors.commands.length, 13);
  for (const request of vectors.commands) {
    assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
    for (const other of vectors.commands) {
      if (request.command.command_type === other.command.command_type) continue;
      // 四个状态展示操作有意共用同一 payload。
      if (['STATE_EXPLICIT', 'STATE_SUPPRESS', 'UNFOLD', 'FOLD'].includes(request.command.command_type)
        && ['STATE_EXPLICIT', 'STATE_SUPPRESS', 'UNFOLD', 'FOLD'].includes(other.command.command_type)) continue;
      assert.throws(() => readDraftWorkspace(JSON.stringify({ ...request, command: { ...request.command, payload: other.command.payload } }), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
    }
  }
});

test('批量布局携带完整有限几何，拒绝空数组、尺寸和未知字段', () => {
  const request = structuredClone(vectors.commands.find(item => item.command.command_type === 'UPDATE_LAYOUT'));
  request.scope = { context_id: request.scope.context_id, selection_id: null, intent: 'UPDATE_LAYOUT_BATCH', endpoints: ['occurrence.1'] };
  request.command = { command_type: 'UPDATE_LAYOUT_BATCH', payload: { layouts: [{ occurrence_id: 'occurrence.1', layout: { x: -0, y: 0.1, width: 160, height: 72 } }] } };
  const raw = JSON.stringify(request).replace('"x":0,', '"x":-0,');
  assert.equal(Object.is(readDraftWorkspace(raw, 'DraftEditRequest').command.payload.layouts[0].layout.x, -0), true);
  for (const mutate of [r => r.command.payload.layouts = [], r => r.command.payload.layouts[0].layout.width = 0,
    r => delete r.command.payload.layouts[0].layout.height, r => r.command.payload.layouts[0].layout.z_order = 1]) {
    const invalid = structuredClone(request); mutate(invalid);
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  }
  assert.throws(() => readDraftWorkspace(raw.replace('"y":0.1', '"y":1e999'), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
});

test('查询/编辑/收据的固定正例与 62 个拒绝向量', () => {
  for (const { type, raw } of vectors.messages) assert.deepEqual(readDraftWorkspace(raw, type), JSON.parse(raw), type);
  for (const { type, raw } of vectors.rejections) assert.throws(() => readDraftWorkspace(raw, type), { code: 'INPUT_INVALID' }, `${type}: ${raw}`);
});

test('State 名称按 256 Unicode 字符封闭，拒绝无持久化含义的 ordinal', () => {
  for (const type of ['CREATE_STATE', 'UPDATE_STATE']) {
    const request = structuredClone(vectors.commands.find(item => item.command.command_type === type));
    const fields = type === 'CREATE_STATE' ? request.command.payload : request.command.payload.changes;
    fields.name_or_value = '😀'.repeat(256);
    assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
    fields.name_or_value += 'a';
    assert.throws(() => readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
    fields.name_or_value = '就绪'; fields.ordinal = 0;
    assert.throws(() => readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  }
});

test('目录选择字段必填可空，问题范围与覆盖计数不能伪造', () => {
  const request = JSON.parse(vectors.messages.find(item => item.type === 'DraftRelationCatalogRequest').raw);
  request.selection_id = 'occurrence.fact';
  assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftRelationCatalogRequest'), request);
  assert.throws(() => readDraftWorkspace(JSON.stringify(request), 'DraftQueryRequest'), { code: 'INPUT_INVALID' });
  for (const value of [undefined, 1, {}]) {
    assert.throws(() => readDraftWorkspace(JSON.stringify({ ...request, selection_id: value }), 'DraftRelationCatalogRequest'), { code: 'INPUT_INVALID' });
  }
  const result = JSON.parse(vectors.messages.find(item => item.type === 'DraftFindingsResult').raw);
  const item = { finding_id: 'finding.test', rule_id: 'rule.core.MISSING_REFERENCE', severity: 'BLOCKING', category: 'MISSING_REFERENCE',
    context_id: null, entity_id: 'state.test', message: 'state owner does not exist' };
  result.data.items.push(item); result.data.validation_summary.blocking = 1;
  assert.deepEqual(readDraftWorkspace(JSON.stringify(result), 'DraftFindingsResult'), result);
  for (const mutate of [r => r.data.validation_summary.blocking++, r => r.data.validation_summary.warning++,
    r => r.data.validation_summary.coverage_state = 'COMPLETE', r => r.data.validation_scope = 'CONTEXT',
    r => r.data.items[0].context_id = 'context.1', r => r.data.items[0].category = 'UNKNOWN',
    r => { r.data.items.push(structuredClone(item)); r.data.validation_summary.blocking++; }, r => r.data = []]) {
    const invalid = structuredClone(result); mutate(invalid);
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftFindingsResult'), { code: 'INPUT_INVALID' });
  }
});

test('六份固定请求 canonical bytes 和 SHA，保留负零与端点顺序', () => {
  for (const vector of vectors.digests) {
    assert.equal(draftEditRequestCanonical(vectors.project_id, vectors.model_id, vector.raw), vector.canonical);
    assert.equal(draftEditRequestDigest(vectors.project_id, vectors.model_id, vector.raw), vector.digest);
  }
  assert.equal(vectors.digests[0].digest, vectors.digests[1].digest);
  assert.notEqual(vectors.digests[0].digest, vectors.digests[2].digest);
  assert.equal(Object.is(readDraftWorkspace(vectors.digests[0].raw, 'DraftEditRequest').command.payload.layout.x, -0), true);
  assert.notEqual(draftEditRequestDigest('project.other', vectors.model_id, vectors.digests[0].raw), vectors.digests[0].digest);
});

test('可选字段存在性、嵌套缺字段与非法 Unicode 不被规范化掩盖', () => {
  const source = vectors.commands[0];
  const raw = JSON.stringify(source);
  assert.throws(() => readDraftWorkspace(raw.replace('订单', '\\ud800'), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  assert.throws(() => readDraftWorkspace(raw.replace('"x":0,', ''), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  assert.throws(() => readDraftWorkspace(JSON.stringify({ ...source, command: { ...source.command, payload: { ...source.command.payload, element_id: null } } }), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  const withWidth = JSON.stringify({ ...source, command: { ...source.command, payload: { ...source.command.payload, layout: { ...source.command.payload.layout, width: 100 } } } });
  assert.notEqual(draftEditRequestDigest(vectors.project_id, vectors.model_id, raw), draftEditRequestDigest(vectors.project_id, vectors.model_id, withWidth));
});

test('生成文件一致，十三条独立路径均引用封闭 Schema 并复用本地 session', async () => {
  execFileSync(process.execPath, [new URL('./generate-draft-workspace-contract.mjs', import.meta.url).pathname, '--check']);
  const api = await SwaggerParser.validate(new URL('../docs/contracts/openapi/opm-draft-workspace-v02.json', import.meta.url).pathname);
  assert.equal(Object.keys(api.paths).length, 13);
  assert.equal(api.components.securitySchemes.localSession.name, 'X-OPM-Session');
  assert.match(api.info.title, /草稿编辑、查询与模型操作历史/);
  for (const item of Object.values(api.paths)) {
    assert.ok(item.post.requestBody.required);
    assert.equal(item.post.responses['200'].content['application/json'].schema.additionalProperties ?? false, false);
  }
});

test('整图方案只接受封闭的步骤与别名，限制大小和编辑种类', () => {
  const token = { draft_id: 'draft.plan', edit_seq: 0, binding_digest: 'a'.repeat(64) };
  const step = { local_id: 'local.beans', command_type: 'CREATE_ELEMENT', kind: 'OBJECT', name: '咖啡豆', layout: { x: 10, y: 20 } };
  const request = { request_id: 'request.plan', command_id: 'command.plan', expected_draft_token: token,
    scope: { context_id: 'context.root', selection_id: null, intent: 'APPLY_MODEL_PLAN', endpoints: [] }, authorization: { capability_query_id: 'query.plan', selected_option_id: 'option.plan' },
    command: { command_type: 'APPLY_MODEL_PLAN', payload: { context_id: 'context.root', steps: [step] } } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
  for (const mutate of [r => r.command.payload.steps = [], r => r.command.payload.steps = Array(101).fill(step),
    r => r.command.payload.steps[0].command_type = 'DELETE_CONTEXT', r => r.command.payload.steps[0].element_id = 'forged.id', r => r.command.payload.context_id = 'context.other']) {
    const invalid = structuredClone(request); mutate(invalid); assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  }
});

test('首批 HTTP 错误边界与 Java 候选身份固定向量一致', () => {
  for (const [code, reason_code] of [['LOCAL_SESSION_INVALID', null], ['DRAFT_EDIT_REJECTED', 'COMMAND_NOT_IMPLEMENTED'], ['DRAFT_EDIT_REJECTED', 'IMPACT_TOKEN_STALE']]) {
    const error = { code, reason_code, message: '操作拒绝', retryable: false };
    assert.deepEqual(readDraftWorkspace(JSON.stringify(error), 'DraftError'), error);
    assert.throws(() => readDraftWorkspace(JSON.stringify({ ...error, reason_code: 'UNKNOWN' }), 'DraftError'));
  }
  // 独立执行冻结的 H/Q/B 公式，不调用 Java producer。
  const encode = value => typeof value === 'number' ? { binary64: binary64Hex(value) }
    : Array.isArray(value) ? value.map(encode)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value;
  const hash = value => createHash('sha256').update(canonicalizeJcs(encode(value))).digest('hex');
  const token = { draft_id: 'draft.test', edit_seq: 7, binding_digest: 'a'.repeat(64) };
  assert.equal('finding.draft.' + hash({ identity_version: 'DraftFinding/1', project_id: 'project.test', model_id: 'model.test', draft_token: token,
    code: 'MISSING_REFERENCE', locator_id: 'state.test', message: 'state owner does not exist' }),
    'finding.draft.3ba9af5cae522243733e9544aa3698a68ba9323b894ddcf80ea96347c7b73df5');
  const scope = { context_id: 'context.root', selection_id: null, intent: 'CREATE_ELEMENT', endpoints: [] };
  const query = 'query.draft.' + hash({ identity_version: 'DraftCapabilityQuery/1', project_id: 'project.test', model_id: 'model.test', draft_token: token, scope });
  assert.equal(query, 'query.draft.de91423ec3b75ec70fc3453be51e07da7273c289cf2210b6f2a2075ddbb26aa5');
  const body = { command_type: 'CREATE_ELEMENT', expires_with_token: token, required_fields: [], display_name: '创建对象' };
  assert.equal('option.draft.' + hash({ identity_version: 'DraftCapabilityOption/1', query_id: query, body }), 'option.draft.23fbb63ee4abe46c02ca9b148fc2c04545e3f862703b3b4967316f0dc5245d0a');
  const impact_summary = { input_token: token, selected_occurrence_id: 'occurrence.fact', delete_mode: 'DELETE_TARGET', target: { kind: 'FACT', id: 'fact.test' },
    items: [{ kind: 'FACT', id: 'fact.test', effect: 'DIRECT' }], counts: { contexts: 0, occurrences: 0, elements: 0, features: 0, states: 0, facts: 1, opl_sentences: 0, traces: 0, findings: 0 } };
  assert.equal('impact.draft.' + hash({ identity_version: 'DraftDeleteImpact/1', query_id: 'query.draft.test', option_id: 'option.draft.test', impact_summary }),
    'impact.draft.0cca59afd93b828869e4f96f4ba93eeb405fa442bbbb375dcfdeb42434377dc5');
});


test('子图删除payload及影响预览封闭，不能混入旧删除字段', () => {
  const request = structuredClone(vectors.commands[0]);
  request.scope = { context_id: 'context.1', selection_id: 'context.child', intent: 'DELETE_CONTEXT', endpoints: [] };
  request.command = { command_type: 'DELETE_CONTEXT', payload: { context_id: 'context.child', impact_token: 'impact.context.001' } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
  for (const mutate of [r => delete r.command.payload.context_id, r => delete r.command.payload.impact_token,
    r => r.command.payload.delete_mode = 'CASCADE', r => r.command.payload.context_id = '']) {
    const invalid = structuredClone(request); mutate(invalid);
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  }
  const result = JSON.parse(vectors.messages.find(item => item.type === 'DraftCapabilitiesResult').raw);
  const option = result.data.options[0];
  option.command_type = 'DELETE_CONTEXT';
  for (const key of ['impact_summary', 'delete_mode', 'delete_target']) delete option[key];
  result.data.scope = request.scope;
  option.impact_token = 'impact.context.001';
  option.context_impact = { input_token: result.meta.draft_token, context_id: 'context.child', parent_context_id: 'context.1', context_ids: ['context.child'],
    counts: { contexts: 1, occurrences: 0, elements: 0, features: 0, states: 0, facts: 0, opl_sentences: 0, traces: 0, findings: 0 }, blockers: [] };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(result), 'DraftCapabilitiesResult'), result);
  for (const mutate of [r => delete r.data.options[0].context_impact, r => r.data.options[0].delete_mode = 'CASCADE',
    r => r.data.options[0].context_impact.blockers.push({ kind: 'UNKNOWN', id: 'x' })]) {
    const invalid = structuredClone(result); mutate(invalid);
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftCapabilitiesResult'), { code: 'INPUT_INVALID' });
  }
});


test('操作历史严格契约支持分页并拒绝额外字段和超量结果', () => {
  const input = { request_id: 'request.history', revision: 'HEAD', before: null };
  validateDraftWorkspace('OperationHistoryRequest', input);
  assert.throws(() => validateDraftWorkspace('OperationHistoryRequest', { ...input, unexpected: true }));
  assert.throws(() => validateDraftWorkspace('OperationHistoryRequest', { ...input, before: 'x'.repeat(2049) }));
  const item = { record_id: 'history.1', occurred_at: '2026-10-03T08:00:00.000Z', operation: 'SAVE', title: '手动保存模型', context_id: null, context_name: null, status: 'SAVED', revision_id: 'revision.1', detail_available: true };
  const result = { meta: { request_id: 'request.history', project_id: 'project.1', model_id: 'model.1', revision: 'HEAD' }, data: { items: [item], next_before: null } };
  validateDraftWorkspace('OperationHistoryResult', result);
  assert.throws(() => validateDraftWorkspace('OperationHistoryResult', { ...result, data: { ...result.data, items: Array(101).fill(item) } }));
});

test('架构分类是封闭元数据命令，不能伪装成语言候选', () => {
  const token = { draft_id: 'draft.method', edit_seq: 0, binding_digest: 'a'.repeat(64) };
  const scope = { context_id: 'context.root', selection_id: null, intent: 'UPDATE_ARCHITECTURE_CLASSIFICATION', endpoints: [] };
  const option = { option_kind: 'METHOD_METADATA', command_type: scope.intent, target_context_id: scope.context_id,
    capability_query_id: 'query.method', option_id: 'option.method', display_name: '设置分类', required_fields: [], enabled: true, reason_codes: [], expires_with_token: token };
  const result = { meta: { request_id: 'request.method', draft_token: token, context_id: scope.context_id },
    data: { scope, capability_query_id: option.capability_query_id, allowed: [scope.intent], forbidden: [], options: [option] } };
  assert.deepEqual(readDraftWorkspace(JSON.stringify(result), 'DraftCapabilitiesResult'), result);
  assert.throws(() => readDraftWorkspace(JSON.stringify({ ...result, data: { ...result.data, options: [{ ...option, capability_ref: { capability_id: 'CAP-OBJECT-001', version: '0.2.0' } }] } }), 'DraftCapabilitiesResult'), { code: 'INPUT_INVALID' });
  for (const level of ['MISSION', 'FUNCTION', 'PRODUCT', null]) {
    const request = { request_id: 'request.method', command_id: 'command.method', expected_draft_token: token, scope,
      authorization: { capability_query_id: option.capability_query_id, selected_option_id: option.option_id },
      command: { command_type: scope.intent, payload: { context_id: scope.context_id, architecture_level: level } } };
    assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
    for (const invalid of [{ ...request.command.payload, architecture_level: 'AUTO' }, { ...request.command.payload, context_id: 'context.other' }])
      assert.throws(() => readDraftWorkspace(JSON.stringify({ ...request, command: { ...request.command, payload: invalid } }), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
  }
});


test('架构关联命令和查询字段封闭，拒绝未知种类、身份和多余字段', () => {
  const request = structuredClone(vectors.commands[0]);
  for (const command of [
    { command_type: 'CREATE_ARCHITECTURE_LINK', payload: { context_id: 'context.root', target_context_id: 'context.child', kind: 'INPUT' } },
    { command_type: 'DELETE_ARCHITECTURE_LINK', payload: { context_id: 'context.child', link_id: 'link.1' } },
  ]) {
    request.command = command; request.scope.intent = command.command_type; request.scope.context_id = command.payload.context_id;
    request.scope.selection_id = null; request.scope.endpoints = [];
    assert.deepEqual(readDraftWorkspace(JSON.stringify(request), 'DraftEditRequest'), request);
    const invalid = structuredClone(request); invalid.command.payload.extra = true;
    assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
    if (command.command_type === 'CREATE_ARCHITECTURE_LINK') for (const kind of ['AUTO', null]) {
      const invalid = structuredClone(request); invalid.command.payload.kind = kind;
      assert.throws(() => readDraftWorkspace(JSON.stringify(invalid), 'DraftEditRequest'), { code: 'INPUT_INVALID' });
    }
  }
});

test('最终整图预览兼容旧请求并严格绑定模型级 Findings', () => {
  const request = { request_id: 'request.plan', draft_token: vectors.commands[0].expected_draft_token, context_id: 'context.root', plan_id: 'command.plan', steps: [], next_scope: null };
  for (const value of [request, { ...request, finalize: false }, { ...request, finalize: true }]) validateDraftWorkspace('DraftModelPlanPreviewRequest', value);
  for (const finalize of [null, 'true', 1]) assert.throws(() => validateDraftWorkspace('DraftModelPlanPreviewRequest', { ...request, finalize }));
  const fixture = JSON.parse(vectors.messages.find(item => item.type === 'DraftFindingsResult').raw);
  const result = { meta: fixture.meta, data: { context_id: 'context.root', constructs: [], suppressed_states: [] }, capabilities: null, findings: null };
  validateDraftWorkspace('DraftModelPlanPreviewResult', result);
  result.findings = fixture.data; validateDraftWorkspace('DraftModelPlanPreviewResult', result);
  for (const mutate of [r => delete r.findings, r => r.findings.validation_scope = 'CONTEXT', r => r.findings.validation_summary.coverage_state = 'COMPLETE']) {
    const invalid = structuredClone(result); mutate(invalid); assert.throws(() => validateDraftWorkspace('DraftModelPlanPreviewResult', invalid));
  }
});
