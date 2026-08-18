import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eRunInputError } from './canvas06-e2e-run-input.mjs';
import { commitReportRoot } from './canvas06-e2e-run-transaction.mjs';

test('atomically commits a report root only after staging is complete', async () => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'opm-e2e-report-'));
  const reportRoot = resolve(outputRoot, 'dev-canvas-06/e2e/reports/dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb');
  const result = await commitReportRoot({
    outputRoot,
    reportRoot,
    write: async staging => writeFile(resolve(staging, 'dev-canvas-06-e2e-report.json'), '{}\n', { flag: 'wx' })
  });
  assert.equal(result, reportRoot);
  assert.deepEqual(await readdir(reportRoot), ['dev-canvas-06-e2e-report.json']);
});

test('removes staging after a pre-rename failure and rejects crash residuals', async () => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'opm-e2e-report-failure-'));
  const finalName = 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb';
  const reportRoot = resolve(outputRoot, `dev-canvas-06/e2e/reports/${finalName}`);
  await assert.rejects(
    () => commitReportRoot({ outputRoot, reportRoot, write: async () => { throw new Error('injected'); } }),
    error => error instanceof E2eRunInputError && error.code === 'E2E_RUN_ATOMIC_COMMIT_FAILED'
  );
  await assert.rejects(
    () => readdir(reportRoot), { code: 'ENOENT' }
  );
  const parent = resolve(outputRoot, 'dev-canvas-06/e2e/reports');
  await writeFile(resolve(parent, `.${finalName}.tmp-residual`), 'diagnostic', { flag: 'wx' });
  await assert.rejects(
    () => commitReportRoot({ outputRoot, reportRoot, write: async () => undefined }),
    error => error instanceof E2eRunInputError && error.code === 'E2E_RUN_OUTPUT_NOT_FRESH'
  );
});

test('does not rename the final root when staging tree fsync fails', async () => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'opm-e2e-report-sync-failure-'));
  const finalName = 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb';
  const reportRoot = resolve(outputRoot, `dev-canvas-06/e2e/reports/${finalName}`);
  await assert.rejects(
    () => commitReportRoot({
      outputRoot,
      reportRoot,
      write: async staging => writeFile(resolve(staging, 'dev-canvas-06-e2e-report.json'), '{}\n', { flag: 'wx' }),
      syncTree: async () => { throw new Error('injected fsync failure'); }
    }),
    error => error instanceof E2eRunInputError && error.code === 'E2E_RUN_ATOMIC_COMMIT_FAILED'
  );
  await assert.rejects(() => readdir(reportRoot), { code: 'ENOENT' });
  const parent = resolve(outputRoot, 'dev-canvas-06/e2e/reports');
  assert.deepEqual((await readdir(parent)).filter(entry => entry.startsWith(`.${finalName}.tmp-`)), []);
});
