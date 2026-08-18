import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { composeE2eReport, semanticComparisonDigest } from './canvas06-e2e-run-report.mjs';

test('aggregates the frozen 194/388 matrix into a schema-valid READY report', () => {
  const { manifest, capabilities } = fixtureInput();
  const observations = manifest.cases.flatMap(entry => [attempt(entry, 1), attempt(entry, 2)]);
  const report = composeE2eReport({ manifest, observations, capabilities, base: fixtureBase() });
  assert.equal(report.report_status, 'READY_FOR_ENABLEMENT_EVALUATION');
  assert.deepEqual(report.summary, {
    case_count: 194, family_case_count: 178, family_pass_expectation_count: 130,
    family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388,
    pass_matched_count: 146, blocked_matched_count: 48, failed_count: 0, skipped_count: 0, retry_count: 0
  });
  assert.equal(report.capability_results.length, 34);
  assert.equal(report.failures.length, 0);
});

test('marks a mismatched attempt as BLOCKED and preserves failure precedence', () => {
  const { manifest, capabilities } = fixtureInput();
  const observations = manifest.cases.flatMap(entry => [attempt(entry, 1), attempt(entry, 2)]);
  observations[0].fixture_sha256 = digest('tampered');
  observations[0].assertion_results[0].status = 'FAILED';
  observations[0].semantic_comparison_digest = semanticComparisonDigest(observations[0]);
  const report = composeE2eReport({ manifest, observations, capabilities, base: fixtureBase() });
  assert.equal(report.report_status, 'BLOCKED');
  assert.equal(report.case_results[0].status, 'FAILED');
  assert.deepEqual(report.case_results[0].failure_codes, ['E2E_FIXTURE_MISMATCH', 'E2E_EXPECTATION_MISMATCH', 'E2E_NONDETERMINISTIC']);
  assert.equal(report.failures[0].code, 'E2E_FIXTURE_MISMATCH');
});

test('rejects an incomplete attempt matrix before report construction', () => {
  const { manifest, capabilities } = fixtureInput();
  const observations = manifest.cases.flatMap(entry => [attempt(entry, 1), attempt(entry, 2)]).slice(1);
  assert.throws(
    () => composeE2eReport({ manifest, observations, capabilities, base: fixtureBase() }),
    error => error.code === 'E2E_RUN_CASE_SET_INVALID'
  );
});

test('uses the shared RFC 8785 canonicalizer for semantic comparison digests', () => {
  const base = observationForCanonicalization();
  const reordered = observationForCanonicalization();
  base.transaction = { '\ue000': 2, '😀': 1, a: 0 };
  reordered.transaction = { a: 0, '😀': 1, '\ue000': 2 };
  assert.equal(semanticComparisonDigest(base), semanticComparisonDigest(reordered));
});

function fixtureInput() {
  const capabilities = fixtureCapabilities();
  const familyCases = Array.from({ length: 178 }, (_, index) => {
    const capability = capabilities[index % capabilities.length];
    const expectation = index < 130 ? 'PASS' : 'BLOCKED';
    return {
      case_id: `E2E-CANVAS-00${capability.suite}.${capability.capability_id}.${String(index).padStart(3, '0')}`,
      suite_id: `E2E-CANVAS-00${capability.suite}`,
      capability_id: capability.capability_id,
      coverage_key: `coverage-${index}`,
      expectation,
      fixture_ref: ref('FIXTURE', `fixtures/${index}.json`, digest(`fixture-${index}`)),
      input_ref: ref('INPUT', `inputs/${index}.json`, digest(`input-${index}`)),
      expected_transaction: transaction(expectation === 'PASS'),
      assertion_ids: ['ASSERT-001']
    };
  });
  const commonCases = Array.from({ length: 16 }, (_, index) => ({
    case_id: `E2E-CANVAS-001.COMMON-${String(index).padStart(3, '0')}`,
    suite_id: 'E2E-CANVAS-001',
    expectation: 'PASS',
    fixture_ref: ref('FIXTURE', `common/${index}.base.json`, digest(`common-base-${index}`)),
    input_ref: ref('INPUT', `common/${index}.input.json`, digest(`common-input-${index}`)),
    expected_transaction: transaction(true),
    assertion_ids: ['ASSERT-001']
  }));
  const byCapability = new Map();
  for (const item of familyCases) byCapability.set(item.capability_id, [...(byCapability.get(item.capability_id) ?? []), item.coverage_key]);
  for (const capability of capabilities) capability.covered_coverage_keys = byCapability.get(capability.capability_id);
  return { manifest: { schema_id: 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001', cases: [...familyCases, ...commonCases] }, capabilities };
}

function fixtureCapabilities() {
  return [
    ...Array.from({ length: 16 }, (_, index) => ({ capability_id: `CAP-ISO-PROC-${String(index + 1).padStart(3, '0')}`, family: 'PROCEDURAL', suite: '2' })),
    ...Array.from({ length: 8 }, (_, index) => ({ capability_id: `CAP-ISO-CTRL-${String(index + 1).padStart(3, '0')}`, family: 'CONTROL', suite: '3' })),
    ...Array.from({ length: 10 }, (_, index) => ({ capability_id: `CAP-ISO-STRUCT-${String(index + 1).padStart(3, '0')}`, family: 'STRUCTURAL', suite: '4' }))
  ];
}

function attempt(entry, ordinal) {
  const result = {
    case_id: entry.case_id,
    attempt_ordinal: ordinal,
    fixture_sha256: entry.fixture_ref.sha256,
    input_sha256: entry.input_ref.sha256,
    project_id: `project-${entry.case_id}`,
    model_id: `model-${entry.case_id}`,
    context_id: `context-${entry.case_id}`,
    base_revision: 'revision-base',
    head_revision: entry.expectation === 'PASS' ? 'revision-committed' : 'revision-base',
    committed_revision: entry.expectation === 'PASS' ? 'revision-committed' : null,
    command_id: entry.expectation === 'PASS' ? 'command-001' : null,
    option_id: null,
    impact_token_id: null,
    observed_status: entry.expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED',
    top_error_code: null,
    detail_error_code: null,
    projection_before_sha256: digest('projection-before'), projection_after_sha256: digest('projection-after'), projection_reopen_sha256: digest('projection-after'),
    opl_before_sha256: digest('opl-before'), opl_after_sha256: digest('opl-after'), opl_reopen_sha256: digest('opl-after'),
    token_before_sha256: digest('token-before'), token_after_sha256: digest('token-after'), token_reopen_sha256: digest('token-after'),
    trace_before_sha256: digest('trace-before'), trace_after_sha256: digest('trace-after'), trace_reopen_sha256: digest('trace-after'),
    transaction: entry.expected_transaction,
    reopen_matches: true,
    assertion_results: [{ assertion_id: 'ASSERT-001', status: 'PASS' }],
    artifact_refs: [ref('ARTIFACT', `attempts/${entry.case_id}/${ordinal}/artifact-index.json`, digest(`${entry.case_id}-${ordinal}`))]
  };
  result.semantic_comparison_digest = semanticComparisonDigest(result);
  return result;
}

function fixtureBase() {
  return {
    generated_at: '2026-08-04T00:00:00.000Z',
    runner_identity: { runner_version: '0.1.0', source_commit: 'a'.repeat(40), node_version: 'v22.0.0', playwright_version: '1.57.0', chromium_version: '143.0.7499.4', os: 'darwin-arm64', command: 'npm run release:canvas06:e2e:run', runner_source_sha256: digest('runner') },
    manifest_ref: ref('E2E_MANIFEST', 'inputs/manifest/dev-canvas-06-e2e-manifest.json', digest('manifest')),
    intake_report_ref: ref('INTAKE_REPORT', 'inputs/raw/intake/report.json', digest('intake')),
    handoff_ref: ref('HANDOFF', 'inputs/raw/handoff/handoff.json', digest('handoff')),
    upstream_source_build: { source_commit: 'a'.repeat(40), dirty_before_build: false, evidence_output_root: 'evidence', java_version: '21', node_version: 'v22.0.0', os: 'darwin-arm64', build_command: 'npm run build', lockfile_sha256: digest('lock'), pom_sha256: digest('pom') },
    source_build: { source_commit: 'a'.repeat(40), dirty_before_build: false, build_command: 'npm run build', node_version: 'v22.0.0', lockfile_sha256: digest('lock'), web_dist: ref('WEB_DIST_TREE', 'inputs/build/web-dist', digest('web')), local_runtime_jar: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar', digest('jar')) },
    environment: { environment_fingerprint: digest('environment'), locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 }
  };
}

function observationForCanonicalization() {
  return {
    case_id: 'E2E-CANVAS-001.CANONICAL', fixture_sha256: digest('fixture'), input_sha256: digest('input'),
    project_id: 'project', model_id: 'model', context_id: 'context', base_revision: 'base', head_revision: 'head',
    committed_revision: null, command_id: null, option_id: null, impact_token_id: null, observed_status: 'PASS_MATCHED',
    top_error_code: null, detail_error_code: null,
    projection_before_sha256: digest('projection-before'), projection_after_sha256: digest('projection-after'), projection_reopen_sha256: digest('projection-reopen'),
    opl_before_sha256: digest('opl-before'), opl_after_sha256: digest('opl-after'), opl_reopen_sha256: digest('opl-reopen'),
    token_before_sha256: digest('token-before'), token_after_sha256: digest('token-after'), token_reopen_sha256: digest('token-reopen'),
    trace_before_sha256: digest('trace-before'), trace_after_sha256: digest('trace-after'), trace_reopen_sha256: digest('trace-reopen'),
    transaction: transaction(true), assertion_results: [{ assertion_id: 'ASSERT-001', status: 'PASS' }]
  };
}

function transaction(committed) {
  const delta = committed ? 1 : 0;
  return { revision_delta: delta, revision_parent_delta: delta, text_artifact_delta: delta, text_trace_delta: delta, finding_delta: 0, operation_delta: delta, receipt_delta: delta, draft_head_changed: committed };
}

function ref(kind, path, sha256) {
  return { kind, path, byte_length: 1, sha256 };
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
