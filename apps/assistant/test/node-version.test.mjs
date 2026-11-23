import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNodeVersion } from '../src/node-version.mjs';

test('启动前拒绝旧 Node，接受 Harness 支持的版本并说明切换方法', () => {
  for (const version of ['22.22.0', '24.8.9', 'invalid'])
    assert.throws(() => assertNodeVersion(version), /nvm use/);
  for (const version of ['24.9.0', '24.22.3', 'v24.22.3', '26.0.0'])
    assert.doesNotThrow(() => assertNodeVersion(version));
});
