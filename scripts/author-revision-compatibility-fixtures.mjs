import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const profileRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
const compatibilityRoot = resolve(profileRoot, 'golden/compatibility');
const fixtureRoot = resolve(compatibilityRoot, 'fixtures');
const sourceFixture = resolve(profileRoot, 'golden/fixtures/base-golden.struct.003.json');
const v01Schema = resolve('docs/contracts/schemas/opm-revision.schema.json');
const v02Schema = resolve('docs/contracts/schemas/opm-revision-v0.2.schema.json');
const historical = {
  profile: { id: 'profile.iso19450.2024.draft', version: '0.1.0', sha256: '4cc3289722ab5c62e9273127318d5dcb383f7f0bdb801d23293afdef48fcbb00' },
  rule_set: { id: 'rules.iso19450.2024.draft', version: '0.1.0', sha256: '4293cb22cf2e2e92fe212ed3c31119992509c8a675daa554c64a2ccf10457d64' },
  text_grammar: { id: 'grammar.opl.iso19450.2024.draft', version: '0.1.0', sha256: 'be315186135f2cfa525128532220b289e083fa4bc70bacb33a4287331467a9d1' },
  symbol_catalog: { id: 'symbols.iso19450.2024.draft', version: '0.1.0', sha256: '511dbaec2adb6f49ed6a4d28844e69d1310eb7a67f213e4a30b0ddfc21ef6098' },
  normalization_adapter: { id: 'normalization.iso19450.2024.draft', version: '0.1.0', sha256: '6401336ad4b63127047ccd5d50cc418554f0c8490547a6024939b4da5774194c' },
  binding_digest: '35bf8490cdd363bc29380cc560d2667a70b72e474b739925b2cda4a598e3c037'
};
const active = {
  profile: { id: 'profile.iso19450.2024.draft', version: '0.2.0', sha256: '5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c' },
  rule_set: historical.rule_set,
  text_grammar: { id: 'grammar.opl.iso19450.2024.draft', version: '0.2.0', sha256: 'c88e672bd9db7f0405a7ef3fc464043f15cae844931192e3412c94ce05339e7d' },
  symbol_catalog: historical.symbol_catalog,
  normalization_adapter: historical.normalization_adapter,
  binding_digest: '93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d'
};
const noWriteTransaction = { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false };
const commitTransaction = { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 2, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true };

const source = JSON.parse(await readFile(sourceFixture, 'utf8'));
await mkdir(fixtureRoot, { recursive: true });
const fixtures = {
  'v01-semantic-only.json': v01(source, historical, false),
  'v01-stored-text.json': v01(source, historical, true),
  'v01-exact-replay.json': v01(source, historical, false),
  'v01-sqlite-reopen.json': v01(source, historical, false),
  'v01-active-binding.json': v01(source, active, false),
  'v02-roundtrip.json': source,
  'unknown-schema.json': { ...v01(source, historical, false), schema_id: 'MS-REV-UNSUPPORTED' },
  'v01-shape-pollution.json': { ...v01(source, historical, false), text_traces: [] },
  'v01-asset-missing.json': v01(source, historical, false),
  'v01-asset-digest-mismatch.json': v01(source, historical, false),
  'v01-renderer-missing.json': v01(source, historical, false),
  'v01-profile-rebind.json': v01(source, historical, false),
  'v02-legacy-value-write.json': source
};
for (const [name, value] of Object.entries(fixtures)) await writeFile(resolve(fixtureRoot, name), JSON.stringify(value));

const schemaRefs = {
  v01: { schema_id: 'MS-REV-001', schema_version: '0.1', sha256: sha(await readFile(v01Schema)) },
  v02: { schema_id: 'MS-REV-001', schema_version: '0.2', sha256: sha(await readFile(v02Schema)) }
};
const input = async name => ({ ref: `fixtures/${name}`, sha256: sha(await readFile(resolve(fixtureRoot, name))) });
const cases = [
  pass('COMPAT-001.V01_SEMANTIC_ONLY_READ.PASS', 'READ', 'v01-semantic-only.json', schemaRefs.v01, historical, 'NOT_RECORDED'),
  pass('COMPAT-002.V01_STORED_TEXT_READ.PASS', 'READ', 'v01-stored-text.json', schemaRefs.v01, historical, 'STORED_TEXT_ONLY'),
  pass('COMPAT-003.V01_EXACT_DIGEST_REPLAY.PASS', 'HISTORICAL_REPLAY', 'v01-exact-replay.json', schemaRefs.v01, historical, 'LEGACY_REPLAYED_TEXT'),
  pass('COMPAT-004.V01_SQLITE_REOPEN.PASS', 'SQLITE_REOPEN', 'v01-sqlite-reopen.json', schemaRefs.v01, historical, 'NOT_RECORDED'),
  pass('COMPAT-005.V01_TO_V02_SAME_BINDING.PASS', 'V01_TO_V02', 'v01-active-binding.json', schemaRefs.v01, active, 'FULL', schemaRefs.v02, active, commitTransaction),
  pass('COMPAT-006.V02_ROUNDTRIP_REPLAY.PASS', 'V02_ROUNDTRIP', 'v02-roundtrip.json', schemaRefs.v02, active, 'FULL', undefined, undefined, commitTransaction),
  blocked('COMPAT-007.UNKNOWN_SCHEMA.BLOCKED', 'READ', 'unknown-schema.json', schemaRefs.v01, historical, 'FORMAT_VERSION_UNSUPPORTED', 'REVISION_SCHEMA_UNSUPPORTED'),
  blocked('COMPAT-008.V01_SHAPE_POLLUTION.BLOCKED', 'READ', 'v01-shape-pollution.json', schemaRefs.v01, historical, 'PERSISTENCE_FAILED', 'REVISION_SCHEMA_SHAPE_INVALID'),
  blocked('COMPAT-009.V01_ASSET_MISSING.BLOCKED', 'HISTORICAL_REPLAY', 'v01-asset-missing.json', schemaRefs.v01, historical, 'PROFILE_ASSET_MISSING', 'HISTORICAL_ASSET_MISSING'),
  blocked('COMPAT-010.V01_ASSET_DIGEST_MISMATCH.BLOCKED', 'HISTORICAL_REPLAY', 'v01-asset-digest-mismatch.json', schemaRefs.v01, historical, 'PACKAGE_INTEGRITY_FAILED', 'HISTORICAL_ASSET_DIGEST_MISMATCH'),
  blocked('COMPAT-011.V01_RENDERER_MISSING.BLOCKED', 'HISTORICAL_REPLAY', 'v01-renderer-missing.json', schemaRefs.v01, historical, 'TEXT_GENERATION_BLOCKED', 'HISTORICAL_RENDERER_MISSING'),
  blocked('COMPAT-012.PROFILE_REBIND_WITHOUT_MIGRATION.BLOCKED', 'ACTIVE_WRITE', 'v01-profile-rebind.json', schemaRefs.v01, historical, 'RULE_VERSION_CONFLICT', 'PROFILE_MIGRATION_REQUIRED', active),
  blocked('COMPAT-013.V02_LEGACY_VALUE_WRITE.BLOCKED', 'ACTIVE_WRITE', 'v02-legacy-value-write.json', schemaRefs.v02, active, 'TEXT_GENERATION_BLOCKED', 'TEXT_LEGACY_VALUE_FORBIDDEN')
];
for (const item of cases) { const loaded = await input(item.input_ref.replace('fixtures/', '')); item.input_sha256 = loaded.sha256; }
await writeFile(resolve(compatibilityRoot, 'opm-revision-compatibility-manifest.json'), JSON.stringify({ manifest_id: 'compatibility.revision.0.1-to-0.2', manifest_version: '0.1.0', cases }));
console.log('Revision compatibility fixtures written: 13 cases.');

function v01(value, binding, storedText) {
  const result = structuredClone(value);
  result.schema_version = '0.1';
  applyBinding(result, binding);
  delete result.text_traces;
  if (!storedText) delete result.text_artifact;
  else delete result.text_artifact.grammar_ref;
  return result;
}

function applyBinding(value, binding) {
  for (const key of ['profile', 'rule_set', 'text_grammar', 'symbol_catalog', 'normalization_adapter']) {
    value.profile_binding[key] = { id: binding[key].id, version: binding[key].version, digest: { algorithm: 'sha256', digest: binding[key].sha256 } };
  }
  value.profile_binding.binding_digest = { algorithm: 'sha256', digest: binding.binding_digest };
}

function pass(case_id, mode, input_ref, source_schema_ref, source_binding, expected_availability, target_schema_ref, target_binding, expected_transaction = noWriteTransaction) {
  return { case_id, mode, expectation: 'PASS', input_ref: `fixtures/${input_ref}`, input_sha256: '0'.repeat(64), source_schema_ref, source_binding, expected_availability, expected_transaction, ...(target_schema_ref ? { target_schema_ref } : {}), ...(target_binding ? { target_binding } : {}) };
}

function blocked(case_id, mode, input_ref, source_schema_ref, source_binding, expected_error_code, expected_detail_code, target_binding) {
  return { case_id, mode, expectation: 'BLOCKED', input_ref: `fixtures/${input_ref}`, input_sha256: '0'.repeat(64), source_schema_ref, source_binding, expected_error_code, expected_detail_code, expected_transaction: noWriteTransaction, ...(target_binding ? { target_binding } : {}) };
}

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
