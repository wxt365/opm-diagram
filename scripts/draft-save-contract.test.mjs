import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import SwaggerParser from '@apidevtools/swagger-parser';
import { createHash } from 'node:crypto';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';

const schema = JSON.parse(readFileSync(new URL('../docs/contracts/schemas/opm-draft-save-v02.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);
const valid = name => ajv.getSchema(`${schema.$id}#/$defs/${name}`);
const token = { draft_id: 'draft.1', edit_seq: 0, binding_digest: 'a'.repeat(64) };
const request = { save_id: 'save.1', target_draft_token: token, reason: 'MANUAL' };

test('副本激活 Request/Report 封闭，不能误报已安装或在线切换', () => {
  const request = { preparation_report_sha256: 'a'.repeat(64), activated_at: '2026-09-14T00:00:00.000Z' };
  const preparation = { schema_id: 'OPM-DRAFT-PREPARATION', schema_version: '0.1', status: 'PREPARED',
    request: { project_id: 'project.1', model_id: 'model.1', expected_revision_id: 'revision.1',
      expected_document_sha256: 'a'.repeat(64), expected_binding_digest: token.binding_digest,
      draft_id: token.draft_id, checkpoint_id: 'checkpoint.1', requested_at: request.activated_at },
    token, content_digest: 'b'.repeat(64), artifact_digest: 'c'.repeat(64), backup_sha256: 'd'.repeat(64),
    prepared_sha256: 'e'.repeat(64), backup_bytes: 4096, prepared_bytes: 8192 };
  const report = { schema_id: 'OPM-DRAFT-ACTIVATION', schema_version: '0.1', status: 'ACTIVATED_COPY', request,
    preparation, database_sha256: 'f'.repeat(64), database_bytes: 8192, context_count: 2, readback_digest: '0'.repeat(64) };
  for (const [name, value] of [['DraftActivationRequest', request], ['DraftActivationReport', report]]) {
    assert.equal(valid(name)(value), true);
    for (const key of Object.keys(value)) { const missing = { ...value }; delete missing[key]; assert.equal(valid(name)(missing), false, key); }
    assert.equal(valid(name)({ ...value, extra: true }), false);
  }
  for (const patch of [{ status: 'INSTALLED' }, { status: 'ACTIVE' }, { context_count: 0 }, { context_count: 1.5 },
    { database_bytes: '8192' }, { readback_digest: 'F'.repeat(64) }]) assert.equal(valid('DraftActivationReport')({ ...report, ...patch }), false);
  assert.equal(valid('DraftActivationRequest')({ ...request, activated_at: '2026-09-14T00:00:00Z' }), false);
});

test('Pin 请求摘要与 Java 固定向量相等，序号复用 binary64 编码', () => {
  const preimage = { identity_version: 'DraftPinRequest/1', project_id: 'project.test', model_id: 'model.test',
    pin_id: 'pin.test', purpose: 'PERMALINK', target_draft_token: {
      draft_id: 'draft.test', edit_seq: { binary64: binary64Hex(7) }, binding_digest: 'a'.repeat(64),
    } };
  assert.equal(createHash('sha256').update(canonicalizeJcs(preimage)).digest('hex'),
    '0526b1948d39fff497ff228e04978536459c48e8d458d2f15096d17ffb2d41ff');
});

test('保存与固定版本接受冻结形状；无额外 committed_revision', () => {
  assert.equal(valid('SaveRequest')(request), true);
  assert.equal(valid('PinRequest')({ pin_id: 'pin.1', target_draft_token: token, purpose: 'PERMALINK' }), true);
  for (const status of ['SAVED', 'UNCHANGED']) assert.equal(valid('SaveResult')({
    save_id: 'save.1', status, captured_token: token, checkpoint_id: 'checkpoint.1', revision_id: 'revision.1', head_token: token,
  }), true);
  assert.equal(valid('SaveRequest')({ ...request, committed_revision: 'revision.1' }), false);
});

test('序号边界、摘要、未知字段、缺字段和 AUTO 公共入口均拒绝', () => {
  for (const edit_seq of [-1, 1.5, 9007199254740992, '1', null]) {
    assert.equal(valid('DraftToken')({ ...token, edit_seq }), false, String(edit_seq));
  }
  assert.equal(valid('DraftToken')({ ...token, edit_seq: 9007199254740991 }), true);
  assert.equal(valid('DraftToken')({ ...token, binding_digest: 'A'.repeat(64) }), false);
  assert.equal(valid('DraftToken')({ ...token, revision_id: 'revision.1' }), false);
  assert.equal(valid('SaveRequest')({ ...request, reason: 'AUTO' }), false);
  for (const key of Object.keys(request)) {
    const missing = { ...request }; delete missing[key];
    assert.equal(valid('SaveRequest')(missing), false, key);
  }
});

test('状态的 nullable 字段必须显式出现；UTC 毫秒时间必须有效', () => {
  const state = { durable_token: token, checkpoint_token: null, last_manual_revision: null,
    dirty_since: null, deadline: null, in_flight: 'NONE', pending_manual_target: null, last_error: null };
  assert.equal(valid('SaveState')(state), true);
  for (const key of Object.keys(state)) {
    const missing = { ...state }; delete missing[key];
    assert.equal(valid('SaveState')(missing), false, key);
  }
  for (const date of ['2026-02-30T00:00:00.000Z', '2026-09-11T00:00:00Z', '2026-09-11T00:00:00.000+08:00']) {
    assert.equal(valid('SaveState')({ ...state, dirty_since: date }), false, date);
  }
  assert.equal(valid('SaveState')({ ...state, dirty_since: '2026-09-11T00:00:00.000Z', deadline: '2026-09-11T00:00:10.000Z' }), true);
});

test('生成类型和 OpenAPI 与 Schema owner 一致', async () => {
  execFileSync(process.execPath, [new URL('./generate-draft-save-contract.mjs', import.meta.url).pathname, '--check']);
  const api = await SwaggerParser.validate(new URL('../docs/contracts/openapi/opm-draft-save-v02.json', import.meta.url).pathname);
  assert.equal(Object.keys(api.paths).length, 3);
  assert.equal(api.components.securitySchemes.localSession.name, 'X-OPM-Session');
});

test('离线迁移准备 Request/Report 封闭且不接受已激活状态', () => {
  const request = { project_id: 'project.1', model_id: 'model.1', expected_revision_id: 'revision.1',
    expected_document_sha256: 'a'.repeat(64), expected_binding_digest: 'b'.repeat(64), draft_id: 'draft.1',
    checkpoint_id: 'checkpoint.1', requested_at: '2026-09-11T00:00:00.000Z' };
  const report = { schema_id: 'OPM-DRAFT-PREPARATION', schema_version: '0.1', status: 'PREPARED', request,
    token: { draft_id: 'draft.1', edit_seq: 0, binding_digest: 'b'.repeat(64) }, content_digest: 'c'.repeat(64),
    artifact_digest: 'd'.repeat(64), backup_sha256: 'e'.repeat(64), prepared_sha256: 'f'.repeat(64), backup_bytes: 4096, prepared_bytes: 8192 };
  assert.equal(valid('DraftPreparationRequest')(request), true);
  assert.equal(valid('DraftPreparationReport')(report), true);
  for (const [name, value] of [['DraftPreparationRequest', request], ['DraftPreparationReport', report]]) {
    for (const key of Object.keys(value)) {
      const missing = { ...value }; delete missing[key]; assert.equal(valid(name)(missing), false, key);
    }
    assert.equal(valid(name)({ ...value, extra: true }), false);
  }
  for (const patch of [{ status: 'ACTIVE' }, { backup_bytes: 0 }, { prepared_bytes: 1.5 }, { prepared_bytes: 9007199254740992 }]) {
    assert.equal(valid('DraftPreparationReport')({ ...report, ...patch }), false);
  }
});
