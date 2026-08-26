import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { BASE_SOURCE_COMMIT, UnifiedInputError, assertArtifactOrder, assertExactQuarantineGuard, parseOptions, sourceEpoch, treeRef, writeQuarantineMarker } from './canvas06-unified-production-input.mjs';

const commit = 'a'.repeat(40);
const root = resolve(tmpdir(), 'canvas06-unified-input-test-root');

test('旧两项 Handoff 不能满足活动三 artifact 契约', () => {
  assert.throws(() => assertArtifactOrder({ build_artifacts: [] }, commit.slice(0, 12)), error => error instanceof UnifiedInputError && error.code === 'CANVAS06_UNIFIED_HANDOFF_INVALID');
});

test('CLI 只接受由统一 source commit 派生的 production 根', () => {
  const expected = `releases/clean-${commit.slice(0, 12)}`;
  const argv = ['--source-root', '/source', '--handoff-root', '/handoff', '--base-source-commit', BASE_SOURCE_COMMIT, '--source-commit', commit, '--out', expected, '--require-production'];
  assert.equal(parseOptions(argv, 'rebuild').out, expected);
  assert.throws(() => parseOptions(argv.map(value => value === expected ? 'releases/other' : value), 'rebuild'), error => error.code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID');
  assert.equal(sourceEpoch('1787619828'), '2026-08-25T01:03:48Z');
});

test('Web tree 使用 UTF-8 inventory JCS，拒绝 Vite client', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'canvas06-web-tree-'));
  try {
    await mkdir(resolve(work, 'dist/assets'), { recursive: true });
    await writeFile(resolve(work, 'dist/index.html'), '<!doctype html>');
    await writeFile(resolve(work, 'dist/assets/app.js'), 'console.log(1)');
    const ref = await treeRef(work, 'dist');
    assert.equal(ref.kind, 'WEB_DIST_TREE');
    assert.ok(ref.byte_length > 0);
    await writeFile(resolve(work, 'dist/assets/dev.js'), 'import "@vite/client"');
    await assert.rejects(() => treeRef(work, 'dist'), error => error.code === 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('quarantine sidecar 只隔离精确 source12，且保持固定 UTF-8 bytes', async () => {
  const handoff = await mkdtemp(resolve(tmpdir(), 'canvas06-quarantine-'));
  try {
    await mkdir(resolve(handoff, 'releases'));
    const sourceCommit = 'b'.repeat(40);
    await assertExactQuarantineGuard(handoff, sourceCommit);
    const marker = await writeQuarantineMarker({ handoffRoot: handoff, sourceCommit, inputRoot: 'releases/clean-bbbbbbbbbbbb', treeSha256: 'c'.repeat(64), failureCode: 'CANVAS06_UNIFIED_JOIN_MISMATCH', failureStage: 'INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON' });
    assert.match((await readFile(marker.path, 'utf8')), /\n$/);
    await assert.rejects(() => assertExactQuarantineGuard(handoff, sourceCommit), error => error.code === 'CANVAS06_UNIFIED_QUARANTINED');
    await assertExactQuarantineGuard(handoff, 'd'.repeat(40));
  } finally {
    await rm(handoff, { recursive: true, force: true });
  }
});
