import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve('.');
const runner = resolve('scripts/verify-canvas06-e2e-manifest-v02.mjs');

test('verifier 缺少完整 CLI 时在读取前稳定拒绝', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'E2E_MANIFEST_ARGUMENT_INVALID\tARGS');
});
