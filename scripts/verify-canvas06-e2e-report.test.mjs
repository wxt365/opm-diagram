import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyE2eReportRoot, verifyReportAggregation } from './verify-canvas06-e2e-report.mjs';

test('recomputes the frozen 194/388 summary from two deterministic attempt observations', () => {
  const { report, observations } = aggregateFixture();
  verifyReportAggregation(report, observations);
});

test('rejects a Report case whose two verified observations have different semantic digests', () => {
  const { report, observations } = aggregateFixture();
  observations[1] = { ...observations[1], observation: { ...observations[1].observation, semantic_comparison_digest: 'b'.repeat(64) } };
  assert.throws(() => verifyReportAggregation(report, observations), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects an E2E Report root without the frozen Report filename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  await writeFile(join(root, 'other.json'), '{}\n');
  await assert.rejects(
    () => verifyE2eReportRoot({ reportRoot: root, reportPath: join(root, 'other.json') }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('rejects an otherwise named Report root that contains an unreferenced extra entry', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  const root = join(parent, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb');
  await mkdir(root);
  await mkdir(join(root, 'inputs'));
  await mkdir(join(root, 'attempts'));
  const report = join(root, 'dev-canvas-06-e2e-report.json');
  await writeFile(report, '{}\n');
  await writeFile(join(root, 'unexpected.txt'), 'unexpected\n');
  await assert.rejects(
    () => verifyE2eReportRoot({ reportRoot: root, reportPath: report }),
    error => error.code === 'E2E_INPUT_INVALID' && error.message === 'Report root contains an unexpected entry.'
  );
});

test('rejects symbolic or missing artifact roots before Report aggregation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  await mkdir(join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb'));
  await assert.rejects(
    () => verifyE2eReportRoot({
      reportRoot: join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb'),
      reportPath: join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb', 'dev-canvas-06-e2e-report.json')
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

function aggregateFixture() {
  const case_results = Array.from({ length: 194 }, (_, index) => {
    const expectation = index < 146 ? 'PASS' : 'BLOCKED';
    const status = expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    return {
      case_id: `E2E-CANVAS-001.TEST-${String(index).padStart(3, '0')}`,
      expectation,
      status,
      attempts: [{ status }, { status }],
      failure_codes: []
    };
  });
  const observations = case_results.flatMap(caseResult => [1, 2].map(attempt_ordinal => ({
    case_id: caseResult.case_id,
    attempt_ordinal,
    observation: { status: caseResult.status, semantic_comparison_digest: 'a'.repeat(64) }
  })));
  return {
    report: {
      case_results,
      summary: {
        case_count: 194, family_case_count: 178, family_pass_expectation_count: 130,
        family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388,
        pass_matched_count: 146, blocked_matched_count: 48, failed_count: 0, skipped_count: 0, retry_count: 0
      },
      report_status: 'READY_FOR_ENABLEMENT_EVALUATION',
      failures: []
    },
    observations
  };
}
