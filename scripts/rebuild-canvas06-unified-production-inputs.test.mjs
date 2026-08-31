import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve('.');
const runner = resolve('scripts/rebuild-canvas06-unified-production-inputs.mjs');

test('重建器在缺失 production 参数时稳定拒绝，且不进入构建', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_UNIFIED_ARGUMENT_INVALID\tARGS');
});

test('重建器拒绝旧 handoff/out CLI', () => {
  const result = spawnSync(process.execPath, [runner, '--source-root', '/source', '--handoff-root', '/handoff', '--source-chain-target', 'FINAL_RUNNER', '--source-commit', 'a'.repeat(40), '--out', 'releases/clean-aaaaaaaaaaaa', '--require-production'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_UNIFIED_ARGUMENT_INVALID\tARGS');
});
