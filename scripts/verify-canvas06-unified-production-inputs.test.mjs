import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { dirname, resolve } from 'node:path';

import { assertInstalledSourceIdentity } from './verify-canvas06-unified-production-inputs.mjs';

const root = resolve('.');
const runner = resolve('scripts/verify-canvas06-unified-production-inputs.mjs');

test('独立校验器在缺失 production 参数时稳定拒绝，且不写入输入根', () => {
  const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.split('\n')[0], 'CANVAS06_UNIFIED_ARGUMENT_INVALID\tARGS');
});

test('installed verifier 只允许本次最终输入根作为未跟踪输出', async t => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opm-unified-installed-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await write(fixture, 'tracked.txt', 'tracked');
  execFileSync('git', ['init', '-q'], { cwd: fixture });
  execFileSync('git', ['add', 'tracked.txt'], { cwd: fixture });
  execFileSync('git', ['-c', 'user.name=Codex', '-c', 'user.email=codex@example.test', 'commit', '-qm', 'fixture'], { cwd: fixture });
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture, encoding: 'utf8' }).trim();
  const handoffRoot = resolve(fixture, 'handoff');
  const input = 'releases/clean-123456789abc';
  await write(handoffRoot, `${input}/artifact.json`, '{}');
  const options = { 'source-commit': sourceCommit, 'base-source-commit': sourceCommit, input };
  assertInstalledSourceIdentity(fixture, handoffRoot, options);
  await write(fixture, 'unexpected.txt', 'drift');
  assert.throws(
    () => assertInstalledSourceIdentity(fixture, handoffRoot, options),
    error => error.code === 'CANVAS06_UNIFIED_SOURCE_DIRTY' && error.stage === 'SOURCE_ROOT_IDENTITY'
  );
});

async function write(root, path, content) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
