import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const schema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);

test('Authoring Report 0.2 accepts READY_FOR_APPROVAL, APPROVED_PUBLISHED, and BLOCKED contracts', () => {
  for (const status of ['READY_FOR_APPROVAL', 'APPROVED_PUBLISHED', 'BLOCKED']) {
    const value = report(status);
    assert.equal(validate(value), true, `${status}: ${JSON.stringify(validate.errors)}`);
  }
});

test('Authoring Report 0.2 requires the exact candidate environment and rejects approval inputs', () => {
  const missingEnvironment = report('READY_FOR_APPROVAL');
  delete missingEnvironment.authored_golden_environment_ref;
  assert.equal(validate(missingEnvironment), false);

  const approvalInput = report('READY_FOR_APPROVAL');
  approvalInput.approval_record_ref = ref('APPROVAL_RECORD', 'approval-record.json');
  assert.equal(validate(approvalInput), false);
});

test('Authoring Report 0.2 requires the full approved evidence closure', () => {
  const missingCandidate = report('APPROVED_PUBLISHED');
  delete missingCandidate.candidate_authoring_report_ref;
  assert.equal(validate(missingCandidate), false);

  const incompleteAttempts = report('APPROVED_PUBLISHED');
  incompleteAttempts.capture_attempt_results.pop();
  assert.equal(validate(incompleteAttempts), false);
});

test('Authoring Report 0.2 rejects incomplete materialization and invalid BLOCKED diagnostics', () => {
  const incompleteMaterialization = report('READY_FOR_APPROVAL');
  incompleteMaterialization.fixture_database_refs.pop();
  assert.equal(validate(incompleteMaterialization), false);

  const blockedWithoutFailure = report('BLOCKED');
  blockedWithoutFailure.failures = [];
  assert.equal(validate(blockedWithoutFailure), false);
});

test('Authoring Report 0.2 rejects report IDs outside the status-specific identity and unknown fields', () => {
  const wrongIdentity = report('READY_FOR_APPROVAL');
  wrongIdentity.report_id = 'dev-canvas-06.golden-authoring-report.GOLDEN-CANVAS06-20260802-001.blocked';
  assert.equal(validate(wrongIdentity), false);

  const unknown = report('READY_FOR_APPROVAL');
  unknown.accept_new_golden = true;
  assert.equal(validate(unknown), false);
});

function report(status) {
  const changeId = 'GOLDEN-CANVAS06-20260802-001';
  const approved = status === 'APPROVED_PUBLISHED';
  const blocked = status === 'BLOCKED';
  const suffix = approved ? 'approved.1.0.0' : blocked ? 'blocked' : 'candidate';
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001',
    schema_version: '0.2',
    report_id: `dev-canvas-06.golden-authoring-report.${changeId}.${suffix}`,
    report_version: '0.2.0',
    report_status: status,
    change_id: changeId,
    generated_at: '2026-08-02T00:00:00.000Z',
    source_date_epoch: 1785628800,
    generator_identity: identity('npm run release:canvas06:golden:author'),
    capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json'),
    handoff_ref: ref('HANDOFF', 'handoff/dev-canvas-05-handoff.json'),
    intake_report_ref: ref('INTAKE_REPORT', 'release/intake.json'),
    source_build: sourceBuild(),
    source_build_digest: digest(),
    runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime/local-runtime.jar'),
    web_dist_tree_sha256: digest(),
    input_materialization: materialization(),
    environment: environment(),
    capture_summary: completeCaptureSummary(),
    approved_assets: approvedAssets(),
    old_golden_set_version: null,
    old_golden_set_sha256: null,
    new_golden_set_sha256: digest(),
    golden_set_version: '1.0.0',
    command: 'npm run release:canvas06:golden:author',
    failures: blocked ? [{ code: 'GOLDEN_STABILITY_TIMEOUT', message_key: 'golden.stability.timeout' }] : [],
    materialization_verifier_identity: identity('npm run release:canvas06:golden:materialize:verify'),
    fixture_materialization_report_refs: Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), report_ref: ref('MATERIALIZATION_REPORT', `materialization/reports/${key(index)}.json`) })),
    fixture_materialization_set_sha256: digest(),
    fixture_database_refs: Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), database_ref: ref('DATABASE', `materialization/fixtures/${key(index)}/storage/projects/project-${index}/project.db`), semantic_state_sha256: digest() })),
    fixture_database_set_sha256: digest(),
    capture_attempt_results: Array.from({ length: 1242 }, (_, index) => [captureAttempt(index, 1), captureAttempt(index, 2)]).flat(),
    blank_attempt_results: Array.from({ length: 9 }, (_, index) => [blankAttempt(index, 1), blankAttempt(index, 2)]).flat(),
    candidate_attempt_set_sha256: digest(),
    report_payload_sha256: digest(),
    ...(blocked ? {} : { authored_golden_environment_ref: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json') }),
    ...(approved ? {
      approval_record_ref: ref('APPROVAL_RECORD', 'approval-record.json'),
      golden_environment_ref: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json'),
      candidate_authoring_report_ref: ref('AUTHORING_REPORT', 'candidate/candidate-authoring-report.json')
    } : {})
  };
}

function captureAttempt(index, attempt_ordinal) {
  return { capture_id: `VIS-CANVAS.CAP-${index}`, attempt_ordinal, png_byte_length: 1, png_sha256: digest(), width: 1440, height: 900, cell_geometry_sha256: digest(), projection_sha256: digest() };
}

function blankAttempt(index, attempt_ordinal) {
  return { baseline_id: `VP-${index}.Z-100`, attempt_ordinal, png_byte_length: 1, png_sha256: digest(), width: 1440, height: 900 };
}

function completeCaptureSummary() {
  return { capture_count: 1242, blank_baseline_count: 9, capture_attempt_count: 2484, blank_attempt_count: 18, deterministic: true };
}

function approvedAssets() {
  return {
    png_refs: Array.from({ length: 1242 }, (_, index) => asset(`capture-${index}`, `capture-${index}.png`)),
    blank_baseline_refs: Array.from({ length: 9 }, (_, index) => asset(`blank-${index}`, `blank/blank-${index}.png`)),
    font_refs: [asset('UI_SANS', 'environment/fonts/ui-sans.ttf')]
  };
}

function materialization() {
  return { bundle_ref: ref('EVIDENCE_BUNDLE', 'evidence-bundle.zip'), java_version: '21.0.7', entry_allowlist: ['fixtures/family-0.json'], materialized_count: 130, aggregate_sha256: digest(), temporary_directory_cleaned: true };
}

function sourceBuild() {
  return { source_commit: sha40(), dirty_before_build: false, node_full_version: 'v22.22.0', node_executable_sha256: digest(), npm_version: '10.9.4', lockfile_sha256: digest(), build_command: 'npm ci --ignore-scripts && npm run build', web_dist_tree_sha256: digest(), runtime_jar_sha256: digest() };
}

function environment() {
  return { environment_fingerprint: digest(), locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 };
}

function identity(command) {
  return { runner_version: '0.2.0', source_commit: sha40(), node_version: 'v22.22.0', command, runner_source_sha256: digest() };
}

function asset(logical_id, path) { return { logical_id, path, byte_length: 1, sha256: digest() }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest() }; }
function key(index) { return index.toString(16).padStart(64, '0'); }
function digest() { return '0'.repeat(64); }
function sha40() { return 'a'.repeat(40); }
