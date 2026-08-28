import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve('.');
const runner = resolve('scripts/verify-canvas06-unified-production-inputs.mjs');

test('独立校验器在缺失 production 参数时稳定拒绝，且不写入输入根', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_UNIFIED_ARGUMENT_INVALID\tARGS');
});

test('独立校验器拒绝旧 input 路径 override', () => {
  const result = spawnSync(process.execPath, [runner, '--input-mode', 'EXTERNAL_RELEASE_STORE', '--source-root', '/source', '--release-store-root', '/store', '--base-source-commit', 'e598b305a44ebb9c9845c1f5563bc36c3a89a2b4', '--source-commit', 'a'.repeat(40), '--input', 'releases/clean-aaaaaaaaaaaa', '--require-production'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_UNIFIED_ARGUMENT_INVALID\tARGS');
});
