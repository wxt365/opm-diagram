import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { BASE_SOURCE_COMMIT, EXPECTED_DELTA, UnifiedInputError, assertArtifactOrder, assertExactQuarantineGuard, assertExternalTopology, deriveExternalPaths, openExternalPaths, parseOptions, sourceEpoch, treeRef, writeQuarantineMarker } from './canvas06-unified-production-input.mjs';

const commit = 'a'.repeat(40);
const argv = ['--input-mode', 'EXTERNAL_RELEASE_STORE', '--source-root', '/source', '--release-store-root', '/release-store', '--base-source-commit', BASE_SOURCE_COMMIT, '--source-commit', commit, '--require-production'];

test('集成 source delta 精确锁定 17 个路径', () => {
  assert.deepEqual(EXPECTED_DELTA, [
    ['M', 'package.json'],
    ['M', 'scripts/canvas06-e2e-attempt-artifacts.mjs'],
    ['M', 'scripts/canvas06-e2e-attempt-artifacts.test.mjs'],
    ['M', 'scripts/canvas06-e2e-run-input.mjs'],
    ['M', 'scripts/canvas06-e2e-run-input.test.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.mjs'],
    ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
    ['A', 'scripts/rebuild-canvas06-manifest-v02-production.mjs'],
    ['A', 'scripts/rebuild-canvas06-manifest-v02-production.test.mjs'],
    ['M', 'scripts/rebuild-canvas06-unified-production-inputs.mjs'],
    ['M', 'scripts/rebuild-canvas06-unified-production-inputs.test.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.mjs'],
    ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
    ['M', 'scripts/verify-canvas06-unified-production-inputs.mjs'],
    ['M', 'scripts/verify-canvas06-unified-production-inputs.test.mjs'],
    ['A', 'tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts'],
    ['M', 'tests/e2e/release/dev-canvas-06/playwright.release.config.ts']
  ]);
});

test('旧两项 Handoff 不能满足活动三 artifact 契约', () => {
  assert.throws(() => assertArtifactOrder({ build_artifacts: [] }, commit.slice(0, 12)), error => error instanceof UnifiedInputError && error.code === 'CANVAS06_UNIFIED_HANDOFF_INVALID');
});

test('CLI 只接受唯一 EXTERNAL_RELEASE_STORE production 模式', () => {
  const options = parseOptions(argv);
  const paths = deriveExternalPaths(options);
  assert.equal(paths.inputRelative, 'releases/clean-aaaaaaaaaaaa');
  assert.match(paths.versionedInputRoot, /profiles\/profile\.iso19450\.2024\.draft\/0\.2\.0\/handoff\/releases\/clean-aaaaaaaaaaaa$/);
  assert.throws(() => parseOptions(argv.map(value => value === 'EXTERNAL_RELEASE_STORE' ? 'LEGACY' : value)), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
  assert.throws(() => parseOptions([...argv, '--out', 'releases/clean-aaaaaaaaaaaa']), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
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
