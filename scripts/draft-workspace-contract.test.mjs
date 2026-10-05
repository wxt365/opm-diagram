import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import { readDraftWorkspace, draftEditRequestCanonical, draftEditRequestDigest } from './draft-workspace-contract.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';

const vectors = JSON.parse(readFileSync(new URL('../tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json', import.meta.url)));

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

test('生成文件一致，九条独立路径均引用封闭 Schema 并复用本地 session', async () => {
  execFileSync(process.execPath, [new URL('./generate-draft-workspace-contract.mjs', import.meta.url).pathname, '--check']);
  const api = await SwaggerParser.validate(new URL('../docs/contracts/openapi/opm-draft-workspace-v02.json', import.meta.url).pathname);
  assert.equal(Object.keys(api.paths).length, 9);
  assert.equal(api.components.securitySchemes.localSession.name, 'X-OPM-Session');
  assert.match(api.info.title, /HS-02E 十三类命令及九条路径已接入/);
  for (const item of Object.values(api.paths)) {
    assert.ok(item.post.requestBody.required);
    assert.equal(item.post.responses['200'].content['application/json'].schema.additionalProperties ?? false, false);
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
