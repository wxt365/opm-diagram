import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { GoldenApprovalError, buildApprovalRecord, parseApproveOptions, verifyApprovalRecord } from './release-canvas06-golden-approve.mjs';

const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);

test('04 Approval 为 INITIAL 建立完整摘要闭包', () => {
  const candidate = candidateFixture();
  const approval = buildApprovalRecord({ candidate, applicant: person('applicant'), approver: person('approver'), reasonCode: 'INITIAL_BASELINE', reasonText: 'Initial controlled approval.', requestedAt: '2026-09-01T00:00:00.000Z', approvedAt: '2026-09-01T00:01:00.000Z', externalRefs: [{ kind: 'CHANGE', reference: 'GOLDEN-001' }], predecessor: null });
  assert.equal(validate(approval), true, JSON.stringify(validate.errors));
  verifyApprovalRecord(approval, { candidate, predecessor: null });
  assert.equal(approval.mode, 'INITIAL');
  assert.equal(approval.predecessor_authoring_report_ref, null);
});

test('04 Approval 为 SUPERSEDE 只接受已验证 predecessor', () => {
  const candidate = candidateFixture({ supersede: true });
  const predecessor = { goldenSetVersion: '1.0.0', goldenSetSha256: digest('old'), ref: ref('AUTHORING_REPORT', 'versions/1.0.0/authoring-report.json', 'predecessor') };
  const approval = buildApprovalRecord({ candidate, applicant: person('applicant'), approver: person('approver'), reasonCode: 'BUG_FIX', reasonText: 'Corrected controlled capture.', requestedAt: '2026-09-01T00:00:00.000Z', approvedAt: '2026-09-01T00:01:00.000Z', externalRefs: [], predecessor });
  assert.equal(validate(approval), true, JSON.stringify(validate.errors));
  verifyApprovalRecord(approval, { candidate, predecessor });
  approval.old_golden_set_sha256 = digest('tampered');
  assert.throws(() => verifyApprovalRecord(approval, { candidate, predecessor }), error => error instanceof GoldenApprovalError && error.code === 'GOLDEN_APPROVAL_BLOCKED');
});

test('04 Approval CLI 仅接受冻结参数且不允许重复', () => {
  const values = ['--candidate-root', '/change/candidate', '--applicant-id', 'a', '--applicant-display-name', 'A', '--approver-id', 'b', '--approver-display-name', 'B', '--reason-code', 'INITIAL_BASELINE', '--reason-text', 'initial', '--requested-at', '2026-09-01T00:00:00.000Z', '--approved-at', '2026-09-01T00:01:00.000Z', '--external-refs', '/change/refs.json', '--out', '/change/approval-record.json'];
  assert.equal(parseApproveOptions(values).candidateRoot, '/change/candidate');
  assert.throws(() => parseApproveOptions([...values, '--force', 'true']), error => error instanceof GoldenApprovalError && error.code === 'GOLDEN_APPROVAL_INPUT_INVALID');
});

function candidateFixture({ supersede = false } = {}) {
  const png = Array.from({ length: 1242 }, (_, index) => asset(`capture-${index}`, `capture-${index}.png`, `png-${index}`));
  const blank = baselines().map(value => asset(value, `blank/${value}.png`, `blank-${value}`));
  const fontRefs = ['UI_SANS', 'CJK_FALLBACK', 'MONOSPACE'].map(role => ({ logical_role: role, postscript_name: `${role}Font`, font_version: '1.0', path: `environment/fonts/${role}/${role}.font`, byte_length: 1, sha256: digest(role) }));
  const reports = Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), report_ref: ref('MATERIALIZATION_REPORT', `materialization/reports/${key(index)}.json`, `report-${index}`) }));
  const databases = Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), database_ref: ref('DATABASE', `materialization/fixtures/${key(index)}/project.db`, `database-${index}`), semantic_state_sha256: digest(`semantic-${index}`) }));
  const report = {
    change_id: 'GOLDEN-CANVAS06-20260901-001', source_date_epoch: 1788220800, golden_set_version: supersede ? '1.0.1' : '1.0.0', old_golden_set_version: supersede ? '1.0.0' : null, old_golden_set_sha256: supersede ? digest('old') : null,
    capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json', 'plan'), capture_set_sha256: digest('capture-set'), source_build_digest: digest('source-build'), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime.jar', 'jar'), web_dist_tree_sha256: digest('web'), report_payload_sha256: digest('report-payload'), candidate_attempt_set_sha256: digest('attempts'), new_golden_set_sha256: digest('new'),
    fixture_materialization_report_refs: reports, fixture_materialization_set_sha256: digest('materialization-reports'), fixture_database_refs: databases, fixture_database_set_sha256: digest('databases'), approved_assets: { png_refs: png, blank_baseline_refs: blank, font_refs: fontRefs.map(value => ({ logical_id: value.logical_role, path: value.path, byte_length: value.byte_length, sha256: value.sha256 })) }
  };
  return { plan: { capture_set_sha256: report.capture_set_sha256 }, report, environment: { environment_fingerprint: digest('environment'), font_refs: fontRefs }, candidateReportRef: ref('AUTHORING_REPORT', 'candidate/candidate-authoring-report.json', 'candidate-report'), environmentRef: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json', 'environment') };
}

function baselines() { return ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => `${viewport}.${zoom}`)); }
function person(id) { return { id, display_name: id.toUpperCase() }; }
function asset(logical_id, path, bytes) { return { logical_id, path, byte_length: Buffer.byteLength(bytes), sha256: digest(bytes) }; }
function ref(kind, path, bytes) { return { kind, path, byte_length: Buffer.byteLength(bytes), sha256: digest(bytes) }; }
function key(index) { return index.toString(16).padStart(64, '0'); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
