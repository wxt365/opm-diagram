import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json');
const write = process.argv.includes('--write');
const references = {
  profile_ref: { id: 'profile.iso19450.2024.draft', version: '0.2.0', sha256: '5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c' },
  rule_set_ref: { id: 'rules.iso19450.2024.draft', version: '0.1.0', sha256: '4293cb22cf2e2e92fe212ed3c31119992509c8a675daa554c64a2ccf10457d64' },
  grammar_ref: { id: 'grammar.opl.iso19450.2024.draft', version: '0.2.0', sha256: 'c88e672bd9db7f0405a7ef3fc464043f15cae844931192e3412c94ce05339e7d' },
  symbol_catalog_ref: { id: 'symbols.iso19450.2024.draft', version: '0.1.0', sha256: '511dbaec2adb6f49ed6a4d28844e69d1310eb7a67f213e4a30b0ddfc21ef6098' },
  normalization_adapter_ref: { id: 'normalization.iso19450.2024.draft', version: '0.1.0', sha256: '6401336ad4b63127047ccd5d50cc418554f0c8490547a6024939b4da5774194c' }
};
const bindingDigest = '93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d';
const transaction = {
  revision_delta: 0,
  revision_parent_delta: 0,
  text_artifact_delta: 0,
  text_trace_delta: 0,
  finding_delta: 0,
  operation_delta: 0,
  receipt_delta: 0,
  draft_head_changed: false
};

const definitions = [
  ['PRODUCTION', 'PRODUCTION_IDENTITY', null, 'UNKNOWN_PRODUCTION', false, 'TEXT_PRODUCTION_IDENTITY_INVALID'],
  ['PRODUCTION', 'PRODUCTION_PLAN', null, 'EXHIBITION_RHS_MISSING', false, 'TEXT_PLAN_UNSUPPORTED'],
  ['PRODUCTION', 'PRODUCTION_PLAN', null, 'EXHIBITION_INCOMPLETE', false, 'TEXT_PLAN_UNSUPPORTED'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'RULE_SET', 'ASSET_MISSING_RULE', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'SYMBOL_ASSET', 'ASSET_MISSING_SYMBOL', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'GRAMMAR_ASSET', 'ASSET_MISSING_GRAMMAR', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'NORMALIZATION_DATA', 'ASSET_MISSING_NORMALIZATION', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'RULE_SET', 'ASSET_DIGEST_MISMATCH_RULE', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'SYMBOL_ASSET', 'ASSET_DIGEST_MISMATCH_SYMBOL', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'GRAMMAR_ASSET', 'ASSET_DIGEST_MISMATCH_GRAMMAR', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'NORMALIZATION_DATA', 'ASSET_DIGEST_MISMATCH_NORMALIZATION', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'RULE_SET', 'ASSET_IDENTITY_MISMATCH_RULE', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'SYMBOL_ASSET', 'ASSET_IDENTITY_MISMATCH_SYMBOL', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'GRAMMAR_ASSET', 'ASSET_IDENTITY_MISMATCH_GRAMMAR', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'NORMALIZATION_DATA', 'ASSET_IDENTITY_MISMATCH_NORMALIZATION', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'CAPABILITY_BINDING', 'RULE_SET', 'BOUND_RULE_MISSING', true, 'PROFILE_CAPABILITY_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'CAPABILITY_BINDING', 'SYMBOL_ASSET', 'BOUND_SYMBOL_MISSING', true, 'PROFILE_CAPABILITY_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'REVISION_BINDING', null, 'REVISION_BINDING_MISMATCH', false, 'PROFILE_REVISION_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'BINDING_DIGEST', null, 'BINDING_DIGEST_MISMATCH', false, 'PROFILE_BINDING_DIGEST_MISMATCH']
];

function cases() {
  return definitions.map(([category, stage, role, mutation, recomputeDigests, expectedErrorCode], index) => ({
    case_id: `G-OPL-ATOMIC-${String(index + 1).padStart(3, '0')}.${mutation}.BLOCKED`,
    category,
    base_revision_fixture: 'golden/fixtures/base-golden.struct.003.json',
    input_revision_fixture: 'golden/fixtures/g-opl-struct-006-exhibition-object-attribute-import-pass.json',
    ...references,
    binding_digest: bindingDigest,
    fault: { stage, ...(role === null ? {} : { role }), mutation, recompute_digests: recomputeDigests },
    expected_commit_code: 'TEXT_GENERATION_BLOCKED',
    expected_error_code: expectedErrorCode,
    expected_transaction: transaction
  }));
}

const source = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(source);
const expected = cases();
if (JSON.stringify(manifest.atomic_cases ?? []) === JSON.stringify(expected)) {
  console.log('OPL Atomic Golden fixtures are current: 19 cases.');
  process.exit(0);
}
if (!write) {
  throw new Error('OPL Atomic Golden fixtures differ. Run with --write.');
}
if (manifest.atomic_cases !== undefined) {
  throw new Error('Refusing to replace an unexpected atomic_cases payload.');
}
const insertion = `  \"atomic_cases\" : ${JSON.stringify(expected, null, 2).replaceAll('\n', '\n  ')},\n`;
const result = source.replace('  "cases" : [', `${insertion}  "cases" : [`);
if (result === source) {
  throw new Error('Cannot locate manifest cases array for Atomic fixture insertion.');
}
await writeFile(manifestPath, result);
console.log('OPL Atomic Golden fixtures written: 19 cases.');
