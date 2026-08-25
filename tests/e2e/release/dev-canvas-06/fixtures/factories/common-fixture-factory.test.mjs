import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCommonVisualFixture, e2eCases, e2eFixture, visualSubjects } from './common-fixture-factory.mjs';
import { sha256Jcs } from '../../../../../../scripts/canvas06-rfc8785.mjs';

const root = resolve('.');
const handoff = JSON.parse(await readFile(resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json'), 'utf8'));
const revisionSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-revision-v0.2.schema.json'), 'utf8'));
const fixtureSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(revisionSchema);
const validate = ajv.compile(fixtureSchema);

test('Common Visual factory deterministically produces eight schema-valid fixtures', () => {
  for (const subjectId of visualSubjects) {
    const first = buildCommonVisualFixture(subjectId, handoff.active_binding, 1782864000);
    const second = buildCommonVisualFixture(subjectId, handoff.active_binding, 1782864000);
    assert.equal(validate(first), true, `${subjectId}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(first, second, subjectId);
    const { fixture_payload_sha256, ...payload } = first;
    assert.equal(fixture_payload_sha256, sha256Jcs(payload), subjectId);
    assert.deepEqual(first.revision_document.text_artifact.sentences, [], subjectId);
    assert.deepEqual(first.revision_document.text_traces, [], subjectId);
    assert.equal(first.capture_setup.expected_rendered_cell_count, first.expected_projection.committed_cells.length + first.expected_projection.transient_cells.length, subjectId);
  }
});

test('Common Visual factory rejects an unknown subject and invalid source epoch', () => {
  assert.throws(() => buildCommonVisualFixture('UNKNOWN', handoff.active_binding, 1782864000), /Unknown visual subject/);
  assert.throws(() => buildCommonVisualFixture('STATE_ROLES', handoff.active_binding, -1), /SOURCE_DATE_EPOCH/);
});

test('Common E2E factory按冻结矩阵生成7 PASS与9 BLOCKED输入', () => {
  const expectedCases = [
    'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION',
    'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP',
    'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED',
    'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED',
    'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED',
    'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING',
    'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT',
    'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY'
  ];
  assert.deepEqual(e2eCases, expectedCases);
  const fixtures = e2eCases.map(e2eFixture);
  const blocked = fixtures.filter(value => value.action.expected_status === 'BLOCKED_MATCHED');
  const passed = fixtures.filter(value => value.action.expected_status === 'PASS_MATCHED');
  assert.equal(passed.length, 7);
  assert.equal(blocked.length, 9);
  const committedTransaction = { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 1, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true };
  const blockedTransaction = { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false };
  for (const fixture of passed) {
    assert.deepEqual(fixture.action.expected_transaction, committedTransaction, fixture.case_id);
    assert.deepEqual(fixture.action.reopen_checkpoint, { expected_head_changed: true, projection_matches: true, text_trace_matches: true }, fixture.case_id);
  }
  for (const fixture of blocked) {
    assert.deepEqual(fixture.action.expected_transaction, blockedTransaction, fixture.case_id);
    assert.deepEqual(fixture.action.reopen_checkpoint, { expected_head_changed: false, projection_matches: true, text_trace_matches: true }, fixture.case_id);
  }
  assert.equal(Object.hasOwn(e2eFixture('E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED').action, 'expected_error_code'), false);
  assert.deepEqual(Object.fromEntries(blocked.filter(value => Object.hasOwn(value.action, 'expected_error_code')).map(value => [value.case_id, value.action.expected_error_code])), {
    'E2E-CANVAS-005.STALE_OPTION_BLOCKED': 'DOMAIN_REJECTED',
    'E2E-CANVAS-006.STALE_TOKEN_BLOCKED': 'REVISION_CONFLICT',
    'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED': 'DOMAIN_REJECTED',
    'E2E-CANVAS-007.ASSET_MISSING': 'TEXT_GENERATION_BLOCKED',
    'E2E-CANVAS-007.TEXT_BLOCKED': 'DOMAIN_REJECTED',
    'E2E-CANVAS-007.REVISION_CONFLICT': 'REVISION_CONFLICT',
    'E2E-CANVAS-007.PERSISTENCE_FAILED': 'PERSISTENCE_FAILED',
    'E2E-CANVAS-007.READONLY': 'READ_ONLY_REVISION'
  });
  assert.throws(() => e2eFixture('E2E-CANVAS-999.UNKNOWN'), /Unknown Common E2E case/);
});
