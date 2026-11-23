import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { tree, hashFile, atomicJson } from '../src/files.mjs';
import { verifyResources } from '../src/resources.mjs';

test('资源清单限制平台架构并拒绝缺失、篡改及越界条目', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-resources-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['jre/bin/java', 'node/node', 'runtime/local-runtime.jar', 'apps/web/dist/index.html', 'apps/assistant/src/desktop-entry.mjs']) {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), path);
  }
  const files = await Promise.all((await tree(root)).map(async file => ({ ...file, sha256: await hashFile(join(root, file.path)) })));
  const manifest = { format: 'OPM-DESKTOP-RESOURCES', formatVersion: 1, platform: 'darwin', arch: 'arm64', appVersion: '0.1.0', schemaDigest: 'a'.repeat(64), files };
  await atomicJson(join(root, 'manifest.json'), manifest);
  await verifyResources(root, 'darwin', 'arm64');
  await assert.rejects(verifyResources(root, 'win32', 'x64'), /平台架构/);
  await writeFile(join(root, 'node/node'), 'tampered');
  await assert.rejects(verifyResources(root, 'darwin', 'arm64'), /校验失败/);
  await atomicJson(join(root, 'manifest.json'), { ...manifest, files: [{ ...files[0], path: '../escape' }] });
  await assert.rejects(verifyResources(root, 'darwin', 'arm64'), /清单无效/);
});
