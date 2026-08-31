import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('活动 E2E Report v0.2 固定 137 PASS 与 57 BLOCKED，不复用历史 summary', async () => {
  const report = JSON.parse(await readFile('docs/contracts/schemas/opm-dev-canvas-06-e2e-report-v02.schema.json', 'utf8'));
  const summary = report.$defs.summary.properties;
  assert.equal(summary.pass_matched_count.maximum, 137);
  assert.equal(summary.blocked_matched_count.maximum, 57);
  assert.equal(report.properties.summary.$ref, '#/$defs/summary');
  assert.equal(JSON.stringify(report.properties.summary).includes('0.1#/$defs/summary'), false);
});
