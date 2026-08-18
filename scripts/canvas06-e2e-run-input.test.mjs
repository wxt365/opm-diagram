import assert from 'node:assert/strict';
import test from 'node:test';

import {
  E2eRunInputError,
  fixedReportPath,
  parseRunOptions,
  parseVerifyOptions,
  resolveReportRoot,
  resolveVerifierReport
} from './canvas06-e2e-run-input.mjs';

const controlledRun = [
  '--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', '/bundle', '--manifest-root', '/manifest',
  '--manifest', 'dev-canvas-06-e2e-manifest.json', '--source-root', '/source', '--java-home', '/java',
  '--browser-executable', '/chromium', '--runtime-port', '17850', '--web-port', '5176',
  '--output-root', '/output', '--out', 'dev-canvas-06/e2e/reports/dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb/dev-canvas-06-e2e-report.json'
];

const productionRun = [
  '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
  '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--source-root', '/source',
  '--java-home', '/java', '--browser-executable', '/chromium', '--runtime-port', '17850', '--web-port', '5176',
  '--output-root', '/output', '--out', 'dev-canvas-06/e2e/reports/dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb/dev-canvas-06-e2e-report.json',
  '--require-production'
];

test('parses closed controlled and production Runner command lines', () => {
  const controlled = parseRunOptions(controlledRun);
  assert.equal(controlled['input-mode'], 'CONTROLLED_TEST');
  const production = parseRunOptions(productionRun);
  assert.equal(production['input-mode'], 'PRODUCTION_HANDOFF');
  assert.equal(production['require-production'], true);
});

test('rejects mixed modes, skipped guard flags, equal ports and unsafe report paths before preflight', () => {
  expectInputError(() => parseRunOptions(controlledRun.concat('--require-production')), 'E2E_RUN_INPUT_CLASS_INVALID');
  expectInputError(() => parseRunOptions(controlledRun.map(value => value === 'CONTROLLED_TEST' ? 'PRODUCTION_HANDOFF' : value)), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => parseRunOptions(controlledRun.map(value => value === '5176' ? '17850' : value)), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => resolveReportRoot({ outputRoot: '/output', out: '../report.json', reportId: 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb' }), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => resolveVerifierReport({ evidenceRoot: '/evidence', report: '../report.json' }), 'E2E_RUN_ARGUMENT_INVALID');
});

test('requires production verifier guards and computes the only report path', () => {
  const reportId = 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb';
  assert.equal(fixedReportPath(reportId), `dev-canvas-06/e2e/reports/${reportId}/dev-canvas-06-e2e-report.json`);
  const production = parseVerifyOptions([
    '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
    '--evidence-root', '/evidence', '--report', fixedReportPath(reportId), '--require-production', '--require-ready'
  ]);
  assert.equal(production['require-ready'], true);
  expectInputError(() => parseVerifyOptions([
    '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
    '--evidence-root', '/evidence', '--report', fixedReportPath(reportId)
  ]), 'E2E_RUN_ARGUMENT_INVALID');
});

function expectInputError(operation, code) {
  assert.throws(operation, error => error instanceof E2eRunInputError && error.code === code);
}
