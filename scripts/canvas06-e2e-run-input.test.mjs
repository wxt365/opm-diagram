import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import {
  E2eRunInputError,
  fixedReportPath,
  loadActiveAttemptManifest,
  parseAttemptVerifyOptions,
  parseRunOptions,
  parseVerifyOptions,
  resolveReportRoot,
  resolveVerifierReport,
  selectCommonAttemptInputs
} from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { verifyE2eAttemptRoot } from './verify-canvas06-e2e-report.mjs';

const controlledRun = [
  '--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', '/bundle', '--manifest-root', '/manifest',
  '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', '/profile-assets', '--source-root', '/source', '--java-home', '/java',
  '--browser-executable', '/chromium', '--runtime-port', '17850', '--web-port', '5176',
  '--output-root', '/output', '--out', 'dev-canvas-06/e2e/reports/dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb/dev-canvas-06-e2e-report.json'
];

const productionRun = [
  '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
  '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', '/profile-assets', '--source-root', '/source',
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
  expectInputError(() => parseRunOptions(controlledRun.filter(value => value !== '--profile-asset-root' && value !== '/profile-assets')), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => resolveReportRoot({ outputRoot: '/output', out: '../report.json', reportId: 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb' }), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => resolveVerifierReport({ evidenceRoot: '/evidence', report: '../report.json' }), 'E2E_RUN_ARGUMENT_INVALID');
});

test('requires production verifier guards and computes the only report path', () => {
  const reportId = 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb';
  assert.equal(fixedReportPath(reportId), `dev-canvas-06/e2e/reports/${reportId}/dev-canvas-06-e2e-report.json`);
  const production = parseVerifyOptions([
    '--scope', 'REPORT', '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
    '--evidence-root', '/evidence', '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', '/profile-assets',
    '--report', fixedReportPath(reportId), '--require-production', '--require-ready'
  ]);
  assert.equal(production['require-ready'], true);
  expectInputError(() => parseVerifyOptions([
    '--scope', 'REPORT', '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
    '--evidence-root', '/evidence', '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', '/profile-assets',
    '--report', fixedReportPath(reportId)
  ]), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => parseVerifyOptions([
    '--scope', 'REPORT', '--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', '/bundle',
    '--evidence-root', '/evidence', '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json',
    '--report', fixedReportPath(reportId)
  ]), 'E2E_RUN_ARGUMENT_INVALID');
});

test('parses only the explicit bounded Attempt verifier command line', () => {
  const options = parseAttemptVerifyOptions([
    '--scope', 'ATTEMPT', '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json',
    '--profile-asset-root', '/profile-assets', '--report-root', '/report', '--attempt-root', '/report/attempts/E2E-CANVAS-001.TEST/1'
  ]);
  assert.equal(options.scope, 'ATTEMPT');
  expectInputError(() => parseAttemptVerifyOptions([
    '--scope', 'REPORT', '--manifest-root', '/manifest', '--manifest', 'manifest.json',
    '--profile-asset-root', '/profile-assets', '--report-root', '/report', '--attempt-root', '/report/attempt'
  ]), 'E2E_RUN_ARGUMENT_INVALID');
  expectInputError(() => parseAttemptVerifyOptions([
    '--scope', 'ATTEMPT', '--manifest-root', '/manifest', '--manifest', '../manifest.json',
    '--profile-asset-root', '/profile-assets', '--report-root', '/report', '--attempt-root', '/outside/attempt'
  ]), 'E2E_RUN_ARGUMENT_INVALID');
});

test('loads the active Manifest and exact five-file Profile input without a fallback', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-active-manifest-'));
  const manifestRoot = resolve(root, 'manifest');
  const profileRoot = resolve(root, 'profile-assets');
  await mkdir(manifestRoot, { recursive: true });
  await copyProfileAssets(profileRoot);
  const manifest = await activeManifest(profileRoot);
  await writeFile(resolve(manifestRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

  const input = await loadActiveAttemptManifest({ manifestRoot, manifest: 'manifest.json', profileAssetRoot: profileRoot });
  assert.equal(input.manifest.schema_version, '0.2');
  assert.equal(input.sourceDateEpoch, 1782864000);
  assert.equal(input.profileAssetRefs.length, 5);
  assert.equal(input.profilePackageDigest, input.activeBinding.profile.sha256);
  const commonCase = input.manifest.cases.find(entry => entry.driver_id === 'DRIVER-COMMON');
  const selected = selectCommonAttemptInputs({ manifestInput: input, caseEntry: commonCase });
  assert.equal(selected.drivers.length, 4);
  assert.equal(selected.runtimeJarRef.path, 'inputs/build/local-runtime.jar');
  assert.equal(selected.webDistRef.path, 'inputs/build/web-dist');
  assert.throws(
    () => selectCommonAttemptInputs({ manifestInput: input, caseEntry: input.manifest.cases.find(entry => entry.driver_id !== 'DRIVER-COMMON') }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
  assert.throws(
    () => selectCommonAttemptInputs({ manifestInput: input, caseEntry: { ...commonCase, expectation: 'BLOCKED' } }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );

  await writeFile(resolve(profileRoot, 'symbols/representative-symbol-catalog.json'), 'tampered\n');
  await assert.rejects(
    () => loadActiveAttemptManifest({ manifestRoot, manifest: 'manifest.json', profileAssetRoot: profileRoot }),
    error => error.code === 'E2E_MANIFEST_PROFILE_ASSET_INVALID' && error.exitCode === 3
  );
});

test('Attempt verifier rejects a missing fixed artifact without mutating the Report root', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-attempt-verifier-'));
  const manifestRoot = resolve(root, 'manifest');
  const profileRoot = resolve(root, 'profile-assets');
  const reportRoot = resolve(root, 'report');
  const attemptRoot = resolve(reportRoot, 'attempts', 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', '1');
  await mkdir(manifestRoot, { recursive: true });
  await mkdir(attemptRoot, { recursive: true });
  await copyProfileAssets(profileRoot);
  await writeFile(resolve(manifestRoot, 'manifest.json'), `${JSON.stringify(await activeManifest(profileRoot))}\n`);
  const manifestInput = await loadActiveAttemptManifest({ manifestRoot, manifest: 'manifest.json', profileAssetRoot: profileRoot });

  await assert.rejects(
    () => verifyE2eAttemptRoot({ manifestInput, attemptRoot, reportRoot }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  assert.deepEqual(await readdir(reportRoot), ['attempts']);
  assert.deepEqual(await readdir(attemptRoot), []);
});

function expectInputError(operation, code) {
  assert.throws(operation, error => error instanceof E2eRunInputError && error.code === code);
}

async function activeManifest(profileRoot) {
  const source = JSON.parse(await readFile(resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d/dev-canvas-06-e2e-manifest.json'), 'utf8'));
  const relativeRoot = 'inputs/upstream/profile-assets';
  const files = [
    ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'],
    ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'],
    ['PROFILE_PACKAGE', 'profile.json'],
    ['RULE_SET', 'rules/representative-rule-set.json'],
    ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
  ];
  const refs = await Promise.all(files.map(async ([kind, path]) => {
    const bytes = await readFile(resolve(profileRoot, path));
    return { kind, path: `${relativeRoot}/${path}`, byte_length: bytes.length, sha256: digest(bytes) };
  }));
  return {
    ...source,
    schema_version: '0.2',
    manifest_version: '0.2.0',
    generated_at: '2026-07-01T00:00:00Z',
    generator_identity: { ...source.generator_identity, runner_version: '0.2.0' },
    driver_catalog: [
      ...source.driver_catalog.map(driver => ({
        ...driver,
        source_ref: { ...driver.source_ref, kind: 'E2E_DRIVER_SOURCE' }
      })),
      {
        driver_id: 'DRIVER-COMMON',
        source_ref: {
          kind: 'E2E_DRIVER_SOURCE', path: 'inputs/drivers/common-driver.mjs',
          byte_length: 1, sha256: 'a'.repeat(64)
        }
      }
    ],
    profile_asset_tree_ref: {
      kind: 'PROFILE_ASSET_TREE', path: relativeRoot,
      byte_length: refs.reduce((total, ref) => total + ref.byte_length, 0),
      sha256: digest(Buffer.from(canonicalizeJcs({ schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: relativeRoot, entries: refs }), 'utf8'))
    },
    profile_asset_refs: refs
  };
}

async function copyProfileAssets(target) {
  const source = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
  for (const path of ['profile.json', 'rules/representative-rule-set.json', 'symbols/representative-symbol-catalog.json', 'grammar/representative-opl-grammar.json', 'normalization/representative-normalization.json']) {
    const destination = resolve(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(source, path), destination);
  }
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
