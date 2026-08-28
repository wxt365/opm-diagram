import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolve } from 'node:path';

import { parseOptions } from './rebuild-canvas06-manifest-v02-production.mjs';

const root = resolve('.');
const runner = resolve('scripts/rebuild-canvas06-manifest-v02-production.mjs');
const commit = 'a'.repeat(40);
const argv = ['--source-root', '/source', '--release-store-root', '/release-store', '--base-source-commit', 'e598b305a44ebb9c9845c1f5563bc36c3a89a2b4', '--source-commit', commit, '--require-production'];

test('外层 orchestrator 在缺失参数时零输出拒绝', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID\tARGS');
});

test('外层 CLI 仅接受两个绝对根及固定 base', () => {
  assert.equal(parseOptions(argv)['source-commit'], commit);
  assert.throws(() => parseOptions([...argv, '--handoff-root', '/handoff']), error => error.code === 'CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID');
  assert.throws(() => parseOptions(argv.map(value => value === '/source' ? 'source' : value)), error => error.code === 'CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID');
});
