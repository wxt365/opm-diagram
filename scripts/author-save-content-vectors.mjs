import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

// 独立作者不导入被测 writer；测试只消费冻结 expected，不自动重写。
const fixture = '../packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json';
const raw = readFileSync(new URL(fixture, import.meta.url));
const base = JSON.parse(raw);
const tag = hex => ({ $input_binary64: hex });
for (const layout of base.layouts) for (const key of ['x', 'y', 'width', 'height']) {
  const bytes = Buffer.alloc(8); bytes.writeDoubleBE(layout[key]); layout[key] = tag(bytes.toString('hex'));
}
const empty = structuredClone(base);
for (const key of ['elements', 'features', 'states', 'facts', 'occurrences', 'layouts', 'state_presentations']) empty[key] = [];
empty.contexts[0].occurrence_ids = [];
const rich = structuredClone(base);
rich.model_header.name = '模型 🌏 e\u0301';
rich.model_header.description = '全部图、状态和关系折点';
rich.text_artifact = { artifact_id: 'artifact.base', modality: 'OPL', context_id: rich.model_header.root_context_id,
  grammar_ref: structuredClone(rich.profile_binding.text_grammar), sentences: [], artifact_digest: { algorithm: 'sha256', digest: 'a'.repeat(64) } };
rich.text_traces = [];
rich.revision_digest = { algorithm: 'sha256', digest: 'a'.repeat(64) };
Object.assign(rich.elements[0], { essence: 'PHYSICAL', affiliation: 'SYSTEMIC', perseverance: 'DYNAMIC' });
rich.elements[0].normalization.condition_rule_ids = ['rule.b', 'rule.a'];
rich.elements[0].normalization.message = '保留原文';
rich.layouts[0].x = tag('8000000000000000');
rich.layouts[0].y = tag('3fb999999999999a');
rich.layouts[0].route_points = [{ x: tag('0000000000000000'), y: tag('c004000000000000') }, { x: tag('4004000000000000'), y: tag('8000000000000000') }];
rich.contexts.push({ ...structuredClone(rich.contexts[0]), context_id: 'context.second', occurrence_ids: [] });
const extreme = structuredClone(rich);
Object.assign(extreme.layouts[0], { x: tag('8000000000000001'), y: tag('ffefffffffffffff'), width: tag('0000000000000001'), height: tag('7fefffffffffffff') });
const omitted = structuredClone(empty);
delete omitted.features; delete omitted.state_presentations; delete omitted.model_header.name;
const keys = ['model_id', 'profile_binding', 'model_header', 'elements', 'features', 'states', 'facts', 'contexts', 'occurrences', 'layouts', 'state_presentations'];
function normalize(value) {
  if (value && Object.hasOwn(value, '$input_binary64')) return { $binary64: value.$input_binary64 };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
const positive_vectors = [['BASE', base], ['EMPTY', empty], ['FULL', rich], ['EXTREME', extreme], ['OMITTED', omitted]].map(([id, input]) => {
  const content = Object.fromEntries(keys.filter(key => Object.hasOwn(input, key)).map(key => [key, normalize(input[key])]));
  const expected_preimage = { schema_id: 'OPM-SAVE-CONTENT-DIGEST', schema_version: '1', float_encoding: 'IEEE754_BINARY64_BE_HEX', content };
  const bytes = Buffer.from(canonicalizeJcs(expected_preimage));
  return { id, input, expected_preimage, expected_canonical_utf8_hex: bytes.toString('hex'), expected_sha256: createHash('sha256').update(bytes).digest('hex') };
});
const negative_vectors = [];
function negative(id, path, value, code = 'INPUT_INVALID', op = 'set', expectedPath = path) {
  negative_vectors.push({ id, base: 'FULL', mutation: { op, path, value }, expected_code: `SAVE_CONTENT_${code}`, expected_pointer: expectedPath });
}
negative('OLD_VERSION', '/schema_version', '0.1');
negative('UNKNOWN_TOP', '/viewport', {});
negative('UNKNOWN_NESTED', '/elements/0/extra', 'unknown');
negative('MISSING_LAYOUT', '/layouts/0/x', null, 'INPUT_INVALID', 'delete');
negative('MISSING_BINDING', '/profile_binding', null, 'INPUT_INVALID', 'delete');
negative('MODEL_JOIN', '/model_header/model_id', 'model.other');
negative('SURROGATE', '/model_header/name', '\ud800', 'UNICODE_INVALID');
negative('NAN', '/layouts/0/x', tag('7ff8000000000000'), 'NON_FINITE_FLOAT');
negative('POS_INF', '/layouts/0/y', tag('7ff0000000000000'), 'NON_FINITE_FLOAT');
negative('NEG_INF', '/layouts/0/route_points/0/x', tag('fff0000000000000'), 'NON_FINITE_FLOAT');
negative('UNSAFE', '/layouts/0/z_order', 9007199254740992, 'NUMBER_DOMAIN_INVALID');
negative('FRACTION', '/facts/0/endpoints/0/ordinal', tag('3fe0000000000000'), 'NUMBER_DOMAIN_INVALID');
negative('NUMERIC_STRING', '/layouts/0/x', '1');
negative('ZERO_WIDTH', '/layouts/0/width', tag('0000000000000000'));
negative('NULL_FEATURES', '/features', null);
negative('DUPLICATE_ROLES', '/states/0/state_roles', ['INITIAL', 'INITIAL']);
negative('EMPTY_NAME', '/model_header/name', '');
negative('WRONG_ENUM', '/elements/0/essence', 'OTHER');
negative('WRONG_DIGEST', '/profile_binding/profile/digest/digest', 'A'.repeat(64));
negative('UNSAFE_REVISION', '/revision_sequence', 9007199254740992, 'NUMBER_DOMAIN_INVALID');
const catalog = { contract: 'SaveContentDigest/1', source_fixture: fixture.substring(3), source_raw_sha256: createHash('sha256').update(raw).digest('hex'), positive_vectors, negative_vectors };
const target = new URL('../tests/fixtures/hybrid-save/save-content-v1-vectors.json', import.meta.url);
mkdirSync(new URL('.', target), { recursive: true });
writeFileSync(target, JSON.stringify(catalog, null, 2) + '\n');
