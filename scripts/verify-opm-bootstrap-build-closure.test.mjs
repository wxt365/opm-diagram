import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { BootstrapBuildClosureError, verifyBootstrapBuildClosure } from './verify-opm-bootstrap-build-closure.mjs';

test('SOURCE 与 POST 闭包接受唯一 classic Bootstrap 和允许派生产物', async t => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' });
  await writeFixture(root, 'apps/web/dist/index.html', '<script type="module" src="/assets/main.js"></script><script src="/opm-bootstrap.js"></script>');
  await writeFixture(root, 'apps/web/dist/assets/main.js', 'window.__OPM_LOCAL_SESSION__;');
  await verifyBootstrapBuildClosure({ root, phase: 'POST', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' });
});

test('SOURCE 拒绝 module Bootstrap、派生配置和错误 Node', async t => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root, 'untracked.txt', 'drift');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_SOURCE_DIRTY' && error.exitCode === 2
  );
  await rm(resolve(root, 'untracked.txt'));
  await writeFixture(root, 'apps/web/index.html', '<script type="module" src="/opm-bootstrap.js"></script><script type="module" src="/src/main.ts"></script>');
  await commitAll(root, 'invalid bootstrap');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_HTML_INVALID'
  );
  await writeFixture(root, 'apps/web/index.html', SOURCE_HTML);
  await writeFixture(root, 'apps/web/vite.config.js', 'export default {};');
  await commitAll(root, 'derived output');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID'
  );
  await rm(resolve(root, 'apps/web/vite.config.js'));
  await commitAll(root, 'remove derived output');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v24.19.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_NODE_VERSION_INVALID'
  );
});

test('仅跳过四个精确非构建根，仍拒绝其他 ignored 输入', async t => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['.codegraph/codegraph.db', '.codex/README.md', '.harness/repo-profile.md', 'reference/ISO+19450-2024.pdf']) {
    await writeFixture(root, path, 'local-only');
  }
  await verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' });
  await writeFixture(root, '.DS_Store', 'finder-metadata');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID' && error.stage === 'INVENTORY'
  );
  await rm(resolve(root, '.DS_Store'));
  await writeFixture(root, '.local-production-ignore', 'ignored-local');
  await writeFile(resolve(root, '.gitignore'), 'node_modules/\napps/web/dist/\nservices/**/target/\n.codegraph/\n.codex\n.harness\nreference/\n.local-production-ignore\n');
  await commitAll(root, 'ignore local metadata');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'SOURCE', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID' && error.stage === 'INVENTORY'
  );
});

test('POST 拒绝 dist Bootstrap 资产或 inline response', async t => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFixture(root, 'apps/web/dist/index.html', '<script type="module" src="/assets/main.js"></script><script src="/opm-bootstrap.js"></script>');
  await writeFixture(root, 'apps/web/dist/opm-bootstrap.js', 'window.__OPM_LOCAL_SESSION__ = "x";');
  await assert.rejects(
    verifyBootstrapBuildClosure({ root, phase: 'POST', nodeVersion: 'v22.22.0', npmVersion: '10.9.4' }),
    error => error instanceof BootstrapBuildClosureError && error.code === 'BOOTSTRAP_BUILD_HTML_INVALID'
  );
});

const SOURCE_HTML = '<div id="app"></div><script src="/opm-bootstrap.js"></script><script type="module" src="/src/main.ts"></script>';

async function createFixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-bootstrap-build-'));
  await writeFixture(root, '.gitignore', 'node_modules/\napps/web/dist/\nservices/**/target/\n.codegraph/\n.codex\n.harness\nreference/\n');
  await writeFixture(root, 'package.json', '{"packageManager":"npm@10.9.4"}');
  await writeFixture(root, 'package-lock.json', '{}');
  await writeFixture(root, 'apps/web/index.html', SOURCE_HTML);
  await writeFixture(root, 'apps/web/tsconfig.json', '{}');
  await writeFixture(root, 'apps/web/tsconfig.app.json', '{}');
  await writeFixture(root, 'apps/web/tsconfig.node.json', '{"compilerOptions":{"noEmit":true}}');
  await writeFixture(root, 'apps/web/vite.config.ts', 'export default {};');
  await writeFixture(root, 'apps/web/src/main.ts', 'export {};');
  await writeFixture(root, 'apps/web/src/env.d.ts', 'export {};');
  execFileSync('git', ['init', '-q'], { cwd: root });
  await commitAll(root, 'fixture');
  return root;
}

async function writeFixture(root, path, content) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function commitAll(root, message) {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['add', '-f', 'package-lock.json'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Codex', '-c', 'user.email=codex@example.test', 'commit', '-qm', message], { cwd: root });
}
