import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const schema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);

test('Approval Record 0.2 accepts complete INITIAL and SUPERSEDE contracts', () => {
  for (const mode of ['INITIAL', 'SUPERSEDE']) {
    const value = approval(mode);
    assert.equal(validate(value), true, `${mode}: ${JSON.stringify(validate.errors)}`);
  }
});

test('Approval Record 0.2 rejects invalid INITIAL and incomplete SUPERSEDE fields', () => {
  const invalidInitial = approval('INITIAL');
  invalidInitial.old_golden_set_sha256 = digest();
  assert.equal(validate(invalidInitial), false);

  const invalidSupersede = approval('SUPERSEDE');
  invalidSupersede.predecessor_authoring_report_ref = null;
  assert.equal(validate(invalidSupersede), false);
});

test('Approval Record 0.2 rejects incomplete asset sets and candidate references', () => {
  const missingDatabase = approval('INITIAL');
  missingDatabase.fixture_database_refs.pop();
  assert.equal(validate(missingDatabase), false);

  const wrongCandidate = approval('INITIAL');
  wrongCandidate.candidate_authoring_report_ref.kind = 'GOLDEN_ENVIRONMENT';
  assert.equal(validate(wrongCandidate), false);
});

test('Approval Record 0.2 rejects non-approved output paths and unknown fields', () => {
  const unsafePath = approval('INITIAL');
  unsafePath.authored_golden_environment_ref.path = 'candidate/golden-environment.json';
  assert.equal(validate(unsafePath), false);

  const unknown = approval('INITIAL');
  unknown.self_approve = true;
  assert.equal(validate(unknown), false);
});

function approval(mode) {
  const changeId = 'GOLDEN-CANVAS06-20260802-001';
  const supersede = mode === 'SUPERSEDE';
  const version = supersede ? '1.0.1' : '1.0.0';
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001', schema_version: '0.2', record_id: `dev-canvas-06.golden-approval.${changeId}`, record_version: '0.2.0', change_id: changeId, mode, golden_set_version: version,
    requested_at: '2026-08-02T00:00:00.000Z', approved_at: '2026-08-02T00:01:00.000Z', source_date_epoch: 1785628800,
    applicant: { id: 'applicant-01', display_name: 'Applicant' }, approver: { id: 'approver-02', display_name: 'Approver' }, reason_code: supersede ? 'BUG_FIX' : 'INITIAL_BASELINE', reason_text: 'Controlled approval.', external_refs: [{ kind: 'CHANGE', reference: 'CHANGE-001' }],
    capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json'), capture_set_sha256: digest(), environment_fingerprint: digest(), source_build_digest: digest(), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime/local-runtime.jar'), web_dist_tree_sha256: digest(),
    candidate_authoring_report_ref: ref('AUTHORING_REPORT', 'candidate/candidate-authoring-report.json'), candidate_authoring_report_payload_sha256: digest(), candidate_attempt_set_sha256: digest(), authored_golden_environment_ref: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json'),
    fixture_materialization_report_refs: Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), report_ref: ref('MATERIALIZATION_REPORT', `materialization/reports/${key(index)}.json`) })), fixture_materialization_set_sha256: digest(),
    fixture_database_refs: Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), database_ref: ref('DATABASE', `materialization/fixtures/${key(index)}/storage/projects/project-${index}/project.db`), semantic_state_sha256: digest() })), fixture_database_set_sha256: digest(),
    png_refs: Array.from({ length: 1242 }, (_, index) => ({ capture_id: `capture-${index}`, path: `capture-${index}.png`, byte_length: 1, sha256: digest() })), blank_baseline_refs: baselines(), font_refs: [{ logical_role: 'UI_SANS', postscript_name: 'ControlledSans', font_version: '1.0', path: 'environment/fonts/controlled-sans.ttf', byte_length: 1, sha256: digest() }],
    candidate_content_sha256: digest(), old_golden_set_version: supersede ? '1.0.0' : null, old_golden_set_sha256: supersede ? digest() : null, predecessor_authoring_report_ref: supersede ? ref('AUTHORING_REPORT', 'versions/1.0.0/authoring-report.json') : null, new_golden_set_sha256: digest(), approved_output_path: `versions/${version}`, approval_status: 'APPROVED', approval_payload_sha256: digest()
  };
}

function baselines() {
  return ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => ({ baseline_id: `${viewport}.${zoom}`, path: `blank/${viewport}.${zoom}.png`, byte_length: 1, sha256: digest() })));
}

function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest() }; }
function key(index) { return index.toString(16).padStart(64, '0'); }
function digest() { return '0'.repeat(64); }
