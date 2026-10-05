import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildSaveContentPreimageV1, canonicalBytesSaveContentV1, sha256SaveContentV1, splitRevisionV1, joinRevisionV1 } from './save-content-digest-v1.mjs';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';

const vectorBytes = readFileSync(new URL('../tests/fixtures/hybrid-save/save-content-v1-vectors.json', import.meta.url));
assert.equal(createHash('sha256').update(vectorBytes).digest('hex'), 'ebb5b0a34dde5e06ba417bc43a1c19326be14dfed82abb23eee217739afd625c');
const vectors = JSON.parse(vectorBytes);
function materialize(value) {
  if (value && Object.hasOwn(value, '$input_binary64')) return Buffer.from(value.$input_binary64, 'hex').readDoubleBE();
  if (Array.isArray(value)) return value.map(materialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item)]));
  return value;
}
const input = id => materialize(vectors.positive_vectors.find(vector => vector.id === id).input);
function mutate(document, { op, path, value }) {
  const parts = path.slice(1).split('/');
  const key = parts.pop(), parent = parts.reduce((object, field) => object[field], document);
  if (op === 'delete') delete parent[key]; else parent[key] = materialize(value);
}

test('固定向量逐项验证 preimage、UTF8 bytes、SHA；重复执行不改变输入', () => {
  for (const vector of vectors.positive_vectors) {
    const document = input(vector.id), copy = structuredClone(document);
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.deepEqual(buildSaveContentPreimageV1(document), vector.expected_preimage, vector.id);
      assert.equal(canonicalBytesSaveContentV1(document).toString('hex'), vector.expected_canonical_utf8_hex, vector.id);
      assert.equal(sha256SaveContentV1(document), vector.expected_sha256, vector.id);
    }
    assert.deepEqual(document, copy);
  }
});

test('负向量固定错误码和 pointer，不能降级或补默认值', () => {
  for (const vector of vectors.negative_vectors) {
    const document = input(vector.base); mutate(document, vector.mutation);
    assert.throws(() => sha256SaveContentV1(document), error => error.code === vector.expected_code && error.jsonPointer === vector.expected_pointer, vector.id);
  }
});

test('无损拆分保留真实 fixture、描述、OPL 和 reader 未建模字段；返回独立副本', () => {
  const raw = readFileSync(new URL(`../${vectors.source_fixture}`, import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'), vectors.source_raw_sha256);
  const document = JSON.parse(raw);
  assert.deepEqual(joinRevisionV1(splitRevisionV1(document)), document);
  const rich = input('FULL');
  assert.deepEqual(joinRevisionV1(splitRevisionV1(rich)), rich);
  const parts = splitRevisionV1(rich);
  parts.content.model_header.description = '修改副本';
  assert.notEqual(parts.content.model_header.description, rich.model_header.description);
  parts.metadata.model_id = rich.model_id;
  assert.throws(() => joinRevisionV1(parts), { code: 'SAVE_CONTENT_INPUT_INVALID' });
});

test('Revision 和派生元数据不影响内容；语义、绑定、布局与数组顺序必须影响', () => {
  const document = input('FULL'), digest = sha256SaveContentV1(document);
  const metadata = structuredClone(document);
  metadata.revision_id = 'revision.saved'; metadata.revision_sequence++;
  metadata.parent_revision_id = 'revision.previous';
  metadata.text_artifact.artifact_id = 'artifact.new';
  metadata.revision_digest.digest = 'b'.repeat(64);
  assert.equal(sha256SaveContentV1(metadata), digest);
  for (const change of [
    value => { value.model_header.description += '!'; },
    value => { value.elements[0].name.local_name += '!'; },
    value => { value.elements[0].essence = 'INFORMATICAL'; },
    value => { value.profile_binding.rule_set.digest.digest = 'b'.repeat(64); },
    value => { value.layouts[0].x = 0; },
    value => { value.layouts[0].route_points[0].y = 1; },
    value => { value.elements.reverse(); },
    value => { value.contexts.reverse(); },
    value => { delete value.features; },
    value => { value.model_header.name = value.model_header.name.normalize('NFC'); },
  ]) {
    const changed = structuredClone(document); change(changed);
    assert.notEqual(sha256SaveContentV1(changed), digest);
  }
  const reversedKeys = Object.fromEntries(Object.entries(document).reverse());
  assert.equal(sha256SaveContentV1(reversedKeys), digest);
});

test('公开浮点编码有限数保护；循环输入和非 JSON 对象拒绝', () => {
  assert.equal(binary64Hex(-0), '8000000000000000');
  for (const bad of [NaN, Infinity, -Infinity, '1']) assert.throws(() => binary64Hex(bad));
  const cyclic = input('BASE'); cyclic.extra = cyclic;
  assert.throws(() => sha256SaveContentV1(cyclic), { code: 'SAVE_CONTENT_INPUT_INVALID' });
  assert.throws(() => sha256SaveContentV1(new Date()), { code: 'SAVE_CONTENT_INPUT_INVALID' });
});

test('生成 Schema 与打包资源一致', () => {
  execFileSync(process.execPath, [new URL('./generate-save-content-contract.mjs', import.meta.url).pathname, '--check']);
});
