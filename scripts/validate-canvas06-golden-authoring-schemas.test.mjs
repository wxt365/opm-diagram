import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const [capturePlanSchema, approvalSchema, reportSchema] = await Promise.all([
  'opm-dev-canvas-06-golden-capture-plan.schema.json',
  'opm-dev-canvas-06-golden-approval-record.schema.json',
  'opm-dev-canvas-06-golden-authoring-report.schema.json'
].map(schema));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const [validatePlan, validateApproval, validateReport] = [capturePlanSchema, approvalSchema, reportSchema].map(item => ajv.compile(item));

test('Capture Plan accepts the frozen 1242 capture and 9 blank matrix without PNG references', () => {
  const value = capturePlan();
  assert.equal(validatePlan(value), true, JSON.stringify(validatePlan.errors));
});

test('Capture Plan rejects golden result fields, wrong fixed counts, and root-escaping paths', () => {
  const goldenField = capturePlan();
  goldenField.captures[0].golden_ref = ref('PNG', 'capture.png');
  assert.equal(validatePlan(goldenField), false);
  const wrongCount = capturePlan();
  wrongCount.captures.pop();
  assert.equal(validatePlan(wrongCount), false);
  const escaped = capturePlan();
  escaped.handoff_ref.path = '../handoff.json';
  assert.equal(validatePlan(escaped), false);
  const duplicateBaseline = capturePlan();
  duplicateBaseline.blank_baselines[8] = { ...duplicateBaseline.blank_baselines[8], baseline_id: 'VP-1440X900.Z-025' };
  assert.equal(validatePlan(duplicateBaseline), false);
});

test('Approval Record accepts INITIAL and SUPERSEDE structural contracts', () => {
  assert.equal(validateApproval(approval('INITIAL')), true, JSON.stringify(validateApproval.errors));
  assert.equal(validateApproval(approval('SUPERSEDE')), true, JSON.stringify(validateApproval.errors));
});

test('Approval Record rejects invalid INITIAL predecessor and invalid SUPERSEDE predecessor', () => {
  const invalidInitial = approval('INITIAL');
  invalidInitial.old_golden_set_sha256 = digest();
  assert.equal(validateApproval(invalidInitial), false);
  const invalidSupersede = approval('SUPERSEDE');
  invalidSupersede.predecessor_authoring_report_ref = null;
  assert.equal(validateApproval(invalidSupersede), false);
});

test('Authoring Report accepts candidate, approved, and blocked state contracts', () => {
  for (const status of ['READY_FOR_APPROVAL', 'APPROVED_PUBLISHED', 'BLOCKED']) {
    const value = authoringReport(status);
    assert.equal(validateReport(value), true, `${status}: ${JSON.stringify(validateReport.errors)}`);
  }
});

test('Authoring Report rejects unpublished approval inputs and incomplete published evidence', () => {
  const candidate = authoringReport('READY_FOR_APPROVAL');
  candidate.approval_record_ref = ref('APPROVAL_RECORD', 'approval-record.json');
  assert.equal(validateReport(candidate), false);
  const published = authoringReport('APPROVED_PUBLISHED');
  published.approved_assets.png_refs.pop();
  assert.equal(validateReport(published), false);
  const blocked = authoringReport('BLOCKED');
  blocked.failures = [];
  assert.equal(validateReport(blocked), false);
});

function capturePlan() {
  const captures = [
    ...Array.from({ length: 1170 }, (_, index) => familyCapture(index)),
    ...Array.from({ length: 72 }, (_, index) => commonCapture(index))
  ];
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001', schema_version: '0.1', plan_id: 'dev-canvas-06.golden-capture-plan.GOLDEN-CANVAS06-20260731-001', plan_version: '0.1.0', plan_status: 'READY_FOR_AUTHORING', change_id: 'GOLDEN-CANVAS06-20260731-001', generated_at: now(), source_date_epoch: 1782864000, planner_identity: identity('plan'), handoff_ref: ref('HANDOFF', 'handoff/dev-canvas-05-handoff.json'), intake_report_ref: ref('INTAKE_REPORT', 'release/intake.json'), active_binding: binding(), upstream_input_refs: upstreamInputs(), input_materialization: materialization(), common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'fixtures/catalog.json'), source_build: sourceBuild(), source_build_digest: digest(), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'release/local-runtime.jar'), web_dist_tree_sha256: digest(), environment_policy: environmentPolicy(), capture_set_sha256: digest(), captures, blank_baselines: baselines(), summary: { family_variant_count: 130, family_capture_count: 1170, common_subject_count: 8, common_capture_count: 72, capture_count: 1242, blank_baseline_count: 9 }
  };
}

function approval(mode) {
  const initial = mode === 'INITIAL';
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001', schema_version: '0.1', record_id: 'dev-canvas-06.golden-approval.GOLDEN-CANVAS06-20260731-001', record_version: '0.1.0', change_id: 'GOLDEN-CANVAS06-20260731-001', mode, golden_set_version: initial ? '1.0.0' : '1.0.1', requested_at: now(), approved_at: now(), source_date_epoch: 1782864000, applicant: { id: 'applicant-01', display_name: 'Applicant' }, approver: { id: 'approver-02', display_name: 'Approver' }, reason_code: initial ? 'INITIAL_BASELINE' : 'BUG_FIX', reason_text: 'Controlled golden authoring change.', external_refs: [{ kind: 'CHANGE', reference: 'CHANGE-001' }], capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json'), capture_set_sha256: digest(), environment_fingerprint: digest(), source_build_digest: digest(), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'local-runtime.jar'), web_dist_tree_sha256: digest(), candidate_content_sha256: digest(), old_golden_set_version: initial ? null : '1.0.0', old_golden_set_sha256: initial ? null : digest(), predecessor_authoring_report_ref: initial ? null : ref('AUTHORING_REPORT', 'versions/1.0.0/authoring-report.json'), new_golden_set_sha256: digest(), approved_output_path: initial ? 'versions/1.0.0' : 'versions/1.0.1', approval_status: 'APPROVED', approval_payload_sha256: digest()
  };
}

function authoringReport(status) {
  const published = status === 'APPROVED_PUBLISHED';
  const blocked = status === 'BLOCKED';
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.golden-authoring-report.GOLDEN-CANVAS06-20260731-001', report_version: '0.1.0', report_status: status, change_id: 'GOLDEN-CANVAS06-20260731-001', generated_at: now(), source_date_epoch: 1782864000, generator_identity: identity('author'), capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json'), ...(published ? { approval_record_ref: ref('APPROVAL_RECORD', 'approval-record.json') } : {}), handoff_ref: ref('HANDOFF', 'handoff.json'), intake_report_ref: ref('INTAKE_REPORT', 'intake.json'), source_build: sourceBuild(), source_build_digest: digest(), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'local-runtime.jar'), web_dist_tree_sha256: digest(), input_materialization: materialization(), environment: environment(), ...(published ? { golden_environment_ref: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json') } : {}), capture_summary: published ? { capture_count: 1242, blank_baseline_count: 9, capture_attempt_count: 2484, blank_attempt_count: 18, deterministic: true } : { capture_count: 0, blank_baseline_count: 0, capture_attempt_count: 0, blank_attempt_count: 0, deterministic: false }, approved_assets: published ? approvedAssets() : { png_refs: [], blank_baseline_refs: [], font_refs: [] }, old_golden_set_version: null, old_golden_set_sha256: null, new_golden_set_sha256: digest(), golden_set_version: '1.0.0', command: 'npm run release:canvas06:golden:author', failures: blocked ? [{ code: 'GOLDEN_STABILITY_TIMEOUT', message_key: 'golden.stability.timeout' }] : []
  };
}

function familyCapture(index) { return { capture_id: `family-${index}`, case_id: `VIS-CANVAS.CAP-ISO-PROC-001.VP-1440X900.Z-025.${index}`, capture_kind: 'FAMILY', capability_id: 'CAP-ISO-PROC-001', visual_variant_key: `coverage-${index}`, viewport_id: 'VP-1440X900', zoom_id: 'Z-025', fixture_ref: archiveRef(`fixtures/family-${index}.json`), expected_revision: `revision-${index}`, expected_projection_sha256: digest(), focus_target_id: 'element.processing', focus_anchor: 'CENTER', expected_cells: 3, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], coverage_ref: archiveRef('coverage.json'), golden_manifest_ref: archiveRef('golden-manifest.json'), golden_replay_ref: archiveRef('golden-replay.json'), symbol_ref: archiveRef('symbol.json') }; }
function commonCapture(index) { return { capture_id: `common-${index}`, case_id: `VIS-CANVAS.COMMON.STATE_ROLES.VP-1440X900.Z-025.${index}`, capture_kind: 'COMMON', subject_id: 'STATE_ROLES', visual_variant_key: 'STATE_ROLES', viewport_id: 'VP-1440X900', zoom_id: 'Z-025', fixture_ref: ref('FIXTURE', 'fixtures/visual/STATE_ROLES.json'), expected_revision: `revision-common-${index}`, expected_projection_sha256: digest(), focus_target_id: 'element.processing', focus_anchor: 'CENTER', expected_cells: 3, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'fixtures/catalog.json') }; }
function baselines() { return ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport_id => ['Z-025', 'Z-100', 'Z-400'].map(zoom_id => ({ baseline_id: `${viewport_id}.${zoom_id}`, viewport_id, zoom_id }))); }
function approvedAssets() { return { png_refs: Array.from({ length: 1242 }, (_, index) => asset(`capture-${index}`, `capture-${index}.png`)), blank_baseline_refs: Array.from({ length: 9 }, (_, index) => asset(`blank-${index}`, `blank/blank-${index}.png`)), font_refs: [asset('UI_SANS', 'environment/fonts/ui.ttf')] }; }
function asset(logical_id, path) { return { logical_id, path, byte_length: 1, sha256: digest() }; }
function identity(command) { return { runner_version: '0.1.0', source_commit: sha40(), node_version: 'v22.0.0', command, runner_source_sha256: digest() }; }
function binding() { return { profile: assetBinding('profile'), rule_set: assetBinding('rule'), text_grammar: assetBinding('grammar'), symbol_catalog: assetBinding('symbol'), normalization_adapter: assetBinding('adapter'), binding_digest: digest() }; }
function assetBinding(id) { return { id, version: '0.2.0', sha256: digest() }; }
function upstreamInputs() { return ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map(input_kind => ({ input_kind, ref: archiveRef(`${input_kind}.json`) })); }
function materialization() { return { bundle_ref: ref('EVIDENCE_BUNDLE', 'evidence-bundle.jar'), java_version: '21.0.7', entry_allowlist: ['coverage.json'], materialized_count: 1, aggregate_sha256: digest(), temporary_directory_cleaned: true }; }
function sourceBuild() { return { source_commit: sha40(), dirty_before_build: false, node_full_version: 'v22.0.0', node_executable_sha256: digest(), npm_version: '10.9.4', lockfile_sha256: digest(), build_command: 'npm ci --ignore-scripts && npm run build', web_dist_tree_sha256: digest(), runtime_jar_sha256: digest() }; }
function environmentPolicy() { return { playwright_version: '1.57.0', chromium_version: '143.0.7499.4', launch_args: ['--force-color-profile=srgb'], color_profile: 'srgb', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css' } }; }
function environment() { return { environment_fingerprint: digest(), locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest() }; }
function archiveRef(path) { return { path: `inputs/${path}`, byte_length: 1, sha256: digest(), bundle_sha256: digest(), archive_entry_path: `archive/${path}` }; }
function digest() { return '0'.repeat(64); }
function sha40() { return 'a'.repeat(40); }
function now() { return '2026-07-31T00:00:00.000Z'; }
async function schema(file) { return JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas', file), 'utf8')); }
