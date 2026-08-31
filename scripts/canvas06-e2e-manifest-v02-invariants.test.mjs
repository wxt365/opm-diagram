import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assertDriverCatalog } from './canvas06-e2e-manifest-v02-input.mjs';
import { verifyReportAggregation } from './verify-canvas06-e2e-report.mjs';

test('活动 v02 不接受缺失第四个 DRIVER-COMMON 的目录', () => {
  const drivers = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'],
    ['DRIVER-CONTROL', 'control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs']
  ].map(([driver_id, file]) => ({ driver_id, source_ref: { kind: 'E2E_DRIVER_SOURCE', path: `inputs/drivers/${file}` } }));
  assert.throws(() => assertDriverCatalog(drivers), error => error.code === 'E2E_MANIFEST_DRIVER_INVALID');
});

test('活动聚合拒绝历史 146/48，且只接受 137/57', () => {
  const case_results = Array.from({ length: 194 }, (_, index) => {
    const expectation = index < 137 ? 'PASS' : 'BLOCKED';
    const status = expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    return { case_id: `E2E-${index}`, expectation, status, attempts: [{ status }, { status }], failure_codes: [] };
  });
  const observations = case_results.flatMap(item => [1, 2].map(attempt_ordinal => ({ case_id: item.case_id, attempt_ordinal, observation: { status: item.status, semantic_comparison_digest: 'a'.repeat(64) } })));
  const report = { case_results, report_status: 'READY_FOR_ENABLEMENT_EVALUATION', failures: [], summary: { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: 137, blocked_matched_count: 57, failed_count: 0, skipped_count: 0, retry_count: 0 } };
  assert.doesNotThrow(() => verifyReportAggregation(report, observations));
  report.summary = { ...report.summary, pass_matched_count: 146, blocked_matched_count: 48 };
  assert.throws(() => verifyReportAggregation(report, observations));
});

test('v02 入口不导入历史 composer 或 verifier', async () => {
  for (const file of ['release-canvas06-e2e-manifest-v02.mjs', 'verify-canvas06-e2e-manifest-v02.mjs']) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /canvas06-e2e-manifest-v01-(?:compose|verifier)|verify-canvas06-e2e-manifest-v01/);
  }
});
