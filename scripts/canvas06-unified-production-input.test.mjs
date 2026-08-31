import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { FAULT_2A_CUMULATIVE_DELTA, FAULT_2A_DELTA, FAULT_CONTRACT_DELTA, FINAL_RUNNER_CUMULATIVE_DELTA, ORIGIN_SOURCE_COMMIT, RUNNER_CLI_COMMIT, RUNNER_CLI_DELTA, RUNNER_CUMULATIVE_DELTA_CLOSURE, RUNNER_CUMULATIVE_DELTA_CLOSURE_COMMIT, RUNNER_DELTA, RUNNER_DELTA_OWNER_CLOSURE, RUNNER_FAMILY_CASE_EXECUTION_MANIFEST_ACCESS_CLOSURE, RUNNER_FAMILY_CYCLE_FAILURE_PRECEDENCE_CLOSURE, RUNNER_FAMILY_CYCLE_FAILURE_PRECEDENCE_COMMIT, RUNNER_FAMILY_PROOF_DIAGNOSTIC_CLOSURE, RUNNER_FAMILY_PROOF_DIAGNOSTIC_COMMIT, RUNNER_FAMILY_PROOF_DIAGNOSTIC_TRANSPORT_COMMIT, RUNNER_FAMILY_PROOF_DIAGNOSTIC_TRANSPORT_CLOSURE, RUNNER_FINAL_CHAIN_BASE_COMMIT, RUNNER_PROCESS_CONTROL_CLI_CLOSURE, RUNNER_PROCESS_CONTROL_CLI_COMMIT, RUNNER_PLAYWRIGHT_LAUNCH_CLOSURE, RUNNER_PLAYWRIGHT_LAUNCH_COMMIT, RUNNER_PLAYWRIGHT_OUTPUT_ENV_NAMESPACE_CLOSURE, RUNNER_PLAYWRIGHT_OUTPUT_ENV_NAMESPACE_COMMIT, UnifiedInputError, assertArtifactOrder, assertExactQuarantineGuard, assertExternalTopology, deriveExternalPaths, openExternalPaths, parseOptions, sourceEpoch, sourceChainArgs, treeRef, writeQuarantineMarker } from './canvas06-unified-production-input.mjs';

const commit = 'a'.repeat(40);
const argv = ['--input-mode', 'EXTERNAL_RELEASE_STORE', '--source-root', '/source', '--release-store-root', '/release-store', '--source-chain-target', 'FINAL_RUNNER', '--origin-source-commit', ORIGIN_SOURCE_COMMIT, '--fault-contract-source-commit', 'b'.repeat(40), '--schema-conformance-source-commit', 'c'.repeat(40), '--fault-2a-source-commit', 'd'.repeat(40), '--runner-source-commit', commit, '--source-commit', commit, '--require-production'];

test('source chain 精确锁定 C=20、A=7、R0=63、R=2、R2=9、R3=2、R4=2、R5=6、R6=5、R7=5、R8=4、R9=5、R10=4、R11=4、Fault累计25与最终累计86个路径', () => {
  assert.equal(FAULT_CONTRACT_DELTA.length, 20);
  assert.equal(FAULT_2A_DELTA.length, 7);
  assert.equal(FAULT_2A_CUMULATIVE_DELTA.length, 25);
  assert.equal(FINAL_RUNNER_CUMULATIVE_DELTA.length, 86);
  assert.equal(RUNNER_DELTA.length, 63);
  assert.equal(RUNNER_CLI_DELTA.length, 9);
  assert.equal(RUNNER_CLI_COMMIT, '6918ee26153f880802ebadbc8fc01407e4f5b906');
  assert.equal(RUNNER_CUMULATIVE_DELTA_CLOSURE_COMMIT, 'e20136020ee71d9fa1fd3a03d15e5dbf57d4d3f8');
  assert.equal(RUNNER_FINAL_CHAIN_BASE_COMMIT, 'a76358782c34227d8888daa184648469bed3390a');
  assert.equal(RUNNER_PROCESS_CONTROL_CLI_COMMIT, '0d7d8b4290c0cbc49dca4dcf887bc7fee4154efa');
  assert.equal(RUNNER_PLAYWRIGHT_LAUNCH_COMMIT, '8ab7da6f482887820a54c1d35d8ee683e5e0083f');
  assert.equal(RUNNER_PLAYWRIGHT_OUTPUT_ENV_NAMESPACE_COMMIT, 'd43aedbd9832f2e64126a61567c0a79a4b39a176');
  assert.equal(RUNNER_FAMILY_PROOF_DIAGNOSTIC_COMMIT, '6557b63d84ecd951b9f5125fd60a10790e20ba5f');
  assert.equal(RUNNER_FAMILY_PROOF_DIAGNOSTIC_TRANSPORT_COMMIT, 'd1a9a960a70634a7e110944b6b8c6e6370fbfc2d');
  assert.equal(RUNNER_FAMILY_CYCLE_FAILURE_PRECEDENCE_COMMIT, 'e09350d1159b864ebf820996ddd4cbb324591e83');
  assert.deepEqual(RUNNER_CUMULATIVE_DELTA_CLOSURE, [['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs']]);
  assert.deepEqual(RUNNER_PROCESS_CONTROL_CLI_CLOSURE, [
    ['M', 'scripts/canvas06-e2e-run-input.mjs'], ['M', 'scripts/canvas06-e2e-run-input.test.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs']
  ]);
  assert.deepEqual(RUNNER_PLAYWRIGHT_LAUNCH_CLOSURE, [
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
    ['M', 'tests/e2e/release/dev-canvas-06/playwright.release.config.ts']
  ]);
  assert.deepEqual(RUNNER_PLAYWRIGHT_OUTPUT_ENV_NAMESPACE_CLOSURE, RUNNER_PLAYWRIGHT_LAUNCH_CLOSURE);
  assert.deepEqual(RUNNER_FAMILY_PROOF_DIAGNOSTIC_CLOSURE, [
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs']
  ]);
  assert.deepEqual(RUNNER_FAMILY_PROOF_DIAGNOSTIC_TRANSPORT_CLOSURE, [
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
    ['M', 'tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts']
  ]);
  assert.deepEqual(RUNNER_FAMILY_CYCLE_FAILURE_PRECEDENCE_CLOSURE, [
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs']
  ]);
  assert.deepEqual(RUNNER_FAMILY_CASE_EXECUTION_MANIFEST_ACCESS_CLOSURE, [
    ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.test.mjs'], ['M', 'tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts']
  ]);
  assert.deepEqual(RUNNER_DELTA_OWNER_CLOSURE, [['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs']]);
  assert.deepEqual(RUNNER_CLI_DELTA, [
    ['M', 'package.json'],
    ['M', 'scripts/canvas06-e2e-run-preflight.mjs'],
    ['M', 'scripts/canvas06-e2e-run-preflight.test.mjs'],
    ['M', 'scripts/canvas06-e2e-run-report.mjs'],
    ['M', 'scripts/canvas06-e2e-run-report.test.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.test.mjs']
  ]);
  assert.equal(FINAL_RUNNER_CUMULATIVE_DELTA.some(([, path]) => path === 'scripts/canvas06-e2e-run-preflight.mjs'), true);
  assert.equal(FINAL_RUNNER_CUMULATIVE_DELTA.some(([, path]) => path === 'scripts/canvas06-e2e-run-preflight.test.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'scripts/canvas06-e2e-attempt-artifacts.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'scripts/canvas06-e2e-attempt-artifacts.test.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'scripts/canvas06-e2e-release-config.test.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'scripts/verify-canvas06-e2e-report.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'scripts/verify-canvas06-e2e-report.test.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCli.java'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCliTest.java'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs'), true);
  assert.equal(RUNNER_DELTA.some(([, path]) => path === 'tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs'), true);
  assert.equal(FINAL_RUNNER_CUMULATIVE_DELTA.some(([, path]) => path === 'services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java'), true);
  assert.equal(FAULT_2A_CUMULATIVE_DELTA.some(([, path]) => path === 'services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java'), false);
  assert.deepEqual(FAULT_2A_DELTA, [
    ['A', 'scripts/canvas06-e2e-fault-launcher-controlled.test.mjs'],
    ['M', 'scripts/canvas06-e2e-release-config.test.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
    ['A', 'tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts']
  ]);
  for (const delta of [FAULT_2A_CUMULATIVE_DELTA, FINAL_RUNNER_CUMULATIVE_DELTA]) {
    assert.equal(new Set(delta.map(([, path]) => path)).size, delta.length);
    assert.deepEqual(delta.map(([, path]) => path), delta.map(([, path]) => path).toSorted((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
  }
});

test('旧两项 Handoff 不能满足活动三 artifact 契约', () => {
  assert.throws(() => assertArtifactOrder({ build_artifacts: [] }, commit.slice(0, 12)), error => error instanceof UnifiedInputError && error.code === 'CANVAS06_UNIFIED_HANDOFF_INVALID');
});

test('CLI 只接受唯一 EXTERNAL_RELEASE_STORE production source chain', () => {
  const options = parseOptions(argv);
  const paths = deriveExternalPaths(options);
  assert.equal(paths.inputRelative, 'releases/clean-aaaaaaaaaaaa');
  assert.match(paths.versionedInputRoot, /profiles\/profile\.iso19450\.2024\.draft\/0\.2\.0\/handoff\/releases\/clean-aaaaaaaaaaaa$/);
  assert.throws(() => parseOptions(argv.map(value => value === 'EXTERNAL_RELEASE_STORE' ? 'LEGACY' : value)), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
  assert.throws(() => parseOptions([...argv, '--out', 'releases/clean-aaaaaaaaaaaa']), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
  assert.throws(() => parseOptions(argv.filter(value => value !== '--runner-source-commit' && value !== commit)), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
  assert.deepEqual(sourceChainArgs(options).slice(0, 2), ['--source-chain-target', 'FINAL_RUNNER']);
  assert.equal(sourceEpoch('1787619828'), '2026-08-25T01:03:48Z');
});

test('外置 release store 不得等于 source root 或位于 Git worktree', async () => {
  const source = await mkdtemp(resolve(tmpdir(), 'canvas06-source-'));
  const store = await mkdtemp(resolve(tmpdir(), 'canvas06-store-'));
  try {
    const external = parseOptions(argv.map(value => value === '/source' ? source : value === '/release-store' ? store : value));
    await assertExternalTopology(deriveExternalPaths(external));
    const physical = await openExternalPaths(external);
    assert.equal(physical.sourceRoot, await realpath(source));
    assert.equal(physical.releaseStoreRoot, await realpath(store));
    const sameRoot = parseOptions(argv.map(value => value === '/source' || value === '/release-store' ? source : value));
    await assert.rejects(() => assertExternalTopology(deriveExternalPaths(sameRoot)), error => error.code === 'CANVAS06_UNIFIED_TRANSACTION_FAILED' && error.stage === 'ROOT_ISOLATION');
    await symlink(source, resolve(store, 'profiles'));
    await assert.rejects(() => assertExternalTopology(deriveExternalPaths(external)), error => error.code === 'CANVAS06_UNIFIED_TRANSACTION_FAILED' && error.stage === 'ROOT_PATH');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});

test('Web tree 使用 UTF-8 inventory JCS，拒绝 Vite client', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'canvas06-web-tree-'));
  try {
    await mkdir(resolve(work, 'dist/assets'), { recursive: true });
    await writeFile(resolve(work, 'dist/index.html'), '<!doctype html>');
    await writeFile(resolve(work, 'dist/assets/app.js'), 'console.log(1)');
    assert.ok((await treeRef(work, 'dist')).byte_length > 0);
    await writeFile(resolve(work, 'dist/assets/dev.js'), 'import "@vite/client"');
    await assert.rejects(() => treeRef(work, 'dist'), error => error.code === 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('quarantine sidecar 只隔离精确 source12，且保持固定 UTF-8 bytes', async () => {
  const releaseStore = await mkdtemp(resolve(tmpdir(), 'canvas06-quarantine-'));
  try {
    const sourceCommit = 'b'.repeat(40);
    const paths = deriveExternalPaths(parseOptions(argv.map(value => value === '/release-store' ? releaseStore : value === commit ? sourceCommit : value)));
    await mkdir(paths.releasesRoot, { recursive: true });
    await assertExactQuarantineGuard(paths);
    await writeQuarantineMarker({ paths, sourceCommit, treeSha256: 'c'.repeat(64), failureCode: 'CANVAS06_UNIFIED_JOIN_MISMATCH', failureStage: 'INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON' });
    assert.match(await readFile(paths.marker, 'utf8'), /\n$/);
    await assert.rejects(() => assertExactQuarantineGuard(paths), error => error.code === 'CANVAS06_UNIFIED_QUARANTINED');
  } finally { await rm(releaseStore, { recursive: true, force: true }); }
});
