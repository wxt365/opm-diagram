import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopRuntime } from '../src/runtime.mjs';
import { atomicJson, json } from '../src/files.mjs';

test('版本或迁移摘要变化先校验并备份，之后才允许启动新 Runtime', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-upgrade-')); t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, 'user'), workspace = join(data, 'workspace');
  await mkdir(join(root, 'apps/web/dist'), { recursive: true }); await mkdir(join(root, 'ui'));
  await mkdir(join(workspace, 'runtime-data'), { recursive: true });
  await writeFile(join(workspace, 'runtime-data/catalog.db'), 'fixture-before-upgrade');
  await atomicJson(join(workspace, 'settings/runtime-version.json'), { version: '0.0.9', schemaDigest: 'previous' });
  const runtime = new DesktopRuntime({ resources: { root, manifest: { schemaDigest: 'next' } }, userData: data, uiRoot: join(root, 'ui'), version: '0.1.0', settings: {} });
  let checked = false, launched = false;
  runtime.verifyWorkspace = async path => { assert.equal(path, workspace); checked = true; };
  runtime.startCore = async () => {
    assert.equal(checked, true);
    const backups = await readdir(join(data, 'backups')); assert.equal(backups.length, 1);
    const backup = join(data, 'backups', backups[0]);
    assert.equal((await json(join(backup, 'manifest.json'))).appVersion, '0.0.9');
    assert.equal(await readFile(join(backup, 'data/runtime-data/catalog.db'), 'utf8'), 'fixture-before-upgrade');
    assert.equal((await json(join(workspace, 'settings/runtime-version.json'))).version, '0.0.9'); launched = true;
  };
  runtime.startAssistant = async () => {};
  await runtime.start(); assert.equal(launched, true);
  assert.equal((await json(join(workspace, 'settings/runtime-version.json'))).version, '0.1.0');
  await runtime.stop(); await runtime.gateway.close();
  await atomicJson(join(workspace, 'settings/runtime-version.json'), { version: '9.0.0', schemaDigest: 'future' });
  await assert.rejects(runtime.start(), /更新客户端/);
});
