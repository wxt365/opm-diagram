import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { BASE_SOURCE_COMMIT, UnifiedInputError, assertArtifactOrder, parseOptions, sourceEpoch, treeRef } from './canvas06-unified-production-input.mjs';

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
