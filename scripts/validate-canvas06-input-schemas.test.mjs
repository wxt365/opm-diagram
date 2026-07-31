import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const commonSchema = await schema('opm-dev-canvas-06-common-fixture-catalog.schema.json');
const environmentSchema = await schema('opm-dev-canvas-06-golden-environment.schema.json');
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validateCommon = ajv.compile(commonSchema);
const validateEnvironment = ajv.compile(environmentSchema);

test('Common Fixture Catalog accepts the frozen 8/16 catalog', () => {
  assert.equal(validateCommon(commonCatalog()), true, JSON.stringify(validateCommon.errors));
});

test('Common Fixture Catalog rejects a missing expected transaction', () => {
  const catalog = commonCatalog();
  delete catalog.e2e_cases[0].actions[0].expected_transaction;
  assert.equal(validateCommon(catalog), false);
});

test('Golden Environment accepts 1242 PNGs and nine named blank baselines', () => {
  assert.equal(validateEnvironment(goldenEnvironment()), true, JSON.stringify(validateEnvironment.errors));
});

test('Golden Environment rejects incomplete PNG catalogs and an unsupported locale', () => {
  const incomplete = goldenEnvironment();
  incomplete.png_refs.pop();
  assert.equal(validateEnvironment(incomplete), false);
  const wrongLocale = goldenEnvironment();
  wrongLocale.locale = 'en-US';
  assert.equal(validateEnvironment(wrongLocale), false);
});

function commonCatalog() {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001', schema_version: '0.1', catalog_id: 'dev-canvas-06.common-fixtures.0123456789ab', catalog_version: '0.1.0', generated_at: '2026-07-31T00:00:00.000Z',
    generator_ref: ref('FACTORY_SOURCE', 'factories/catalog.mjs'), source_binding: binding(),
    visual_subjects: subjects().map(subject_id => ({ subject_id, factory_id: `factory.${subject_id}`, factory_source_ref: ref('FACTORY_SOURCE', `factories/${subject_id}.mjs`), fixture_ref: ref('FIXTURE', `fixtures/${subject_id}.json`), expected_revision: `revision.${subject_id}`, focus_target_id: `target.${subject_id}`, focus_anchor: 'CENTER', expected_cells: 1, critical_regions: [{ region_id: 'canvas', kind: 'CANVAS' }] })),
    e2e_cases: caseIds().map(case_id => ({ case_id, factory_id: `factory.${case_id}`, factory_source_ref: ref('FACTORY_SOURCE', `factories/${case_id}.mjs`), base_fixture_ref: ref('FIXTURE', `fixtures/${case_id}.base.json`), input_ref: ref('INPUT', `fixtures/${case_id}.input.json`), actions: [{ action_id: 'action.001', expected_status: 'PASS_MATCHED', expected_transaction: transaction(), reopen_checkpoint: { expected_head_changed: true, projection_matches: true, text_trace_matches: true } }], assertion_ids: ['ASSERT-001'] })),
    summary: { visual_subject_count: 8, e2e_case_count: 16 }
  };
}

function goldenEnvironment() {
  const baselines = ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => ({ baseline_id: `${viewport}.${zoom}`, ref: ref('BLANK_PNG', `blank/${viewport}.${zoom}.png`) })));
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001', schema_version: '0.1', environment_id: 'dev-canvas-06.golden-environment.0123456789ab', generated_at: '2026-07-31T00:00:00.000Z', chromium_version: '143.0.7499.4', playwright_version: '1.57.0', os_build: 'macOS-26.0', launch_args: ['--force-color-profile=srgb'], font_refs: [ref('FONT', 'fonts/NotoSansCJK-Regular.otf')], color_profile: 'sRGB IEC61966-2.1', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, environment_fingerprint: digest(),
    png_refs: Array.from({ length: 1242 }, (_, index) => ({ capture_id: `capture.${String(index).padStart(4, '0')}`, ref: ref('PNG', `capture.${String(index).padStart(4, '0')}.png`) })),
    blank_baseline_refs: baselines
  };
}

function subjects() { return ['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK']; }
function caseIds() { return ['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION', 'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP', 'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED', 'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED', 'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED', 'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING', 'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY']; }
function transaction() { return { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 1, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true }; }
function binding() { return { profile: asset('profile'), rule_set: asset('rules'), text_grammar: asset('grammar'), symbol_catalog: asset('symbols'), normalization_adapter: asset('normalization'), binding_digest: digest() }; }
function asset(id) { return { id, version: '0.1.0', sha256: digest() }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest() }; }
function digest() { return '0'.repeat(64); }
async function schema(file) { return JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas', file), 'utf8')); }
