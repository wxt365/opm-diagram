import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eProductionWebError, parseProductionWebOptions, startProductionWebServer } from './canvas06-e2e-production-web.mjs';

test('serves production assets, SPA fallback, and only loopback Runtime proxy paths', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-web-'));
  const runtime = await startRuntime();
  try {
    await mkdir(resolve(root, 'assets'));
    await writeFile(resolve(root, 'index.html'), '<!doctype html><script src="/assets/main.js"></script>');
    await writeFile(resolve(root, 'assets/main.js'), 'console.log("production")');
    const web = await startProductionWebServer({ root, port: 0, runtimeOrigin: runtime.origin });
    try {
      const [asset, spa, api, mutation, rejected, bootstrap, unknown, staticPost] = await Promise.all([
        fetch(`${web.origin}/assets/main.js`),
        fetch(`${web.origin}/projects/model`),
        fetch(`${web.origin}/api/v1/projects`),
        fetch(`${web.origin}/api/v1/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Order"}' }),
        fetch(`${web.origin}/api/v1/rejected`),
        fetch(`${web.origin}/opm-bootstrap.js`),
        fetch(`${web.origin}/assets/missing.js`),
        fetch(`${web.origin}/projects/model`, { method: 'POST' })
      ]);
      assert.equal(asset.status, 200);
      assert.equal(await asset.text(), 'console.log("production")');
      assert.equal(spa.status, 200);
      assert.match(await spa.text(), /doctype html/);
      assert.equal(api.status, 200);
      assert.equal(await api.text(), 'runtime:GET:/api/v1/projects:');
      assert.equal(mutation.status, 200);
      assert.equal(await mutation.text(), 'runtime:POST:/api/v1/projects:{"name":"Order"}');
      assert.equal(rejected.status, 409);
      assert.equal(await rejected.text(), 'runtime:GET:/api/v1/rejected:');
      assert.equal(bootstrap.status, 200);
      assert.equal(await bootstrap.text(), 'runtime:GET:/opm-bootstrap.js:');
      assert.equal(unknown.status, 404);
      assert.equal(staticPost.status, 405);
    } finally {
      await web.close();
    }
  } finally {
    await runtime.close();
  }
});

test('rejects unsafe server arguments and unsafe web-dist entries before listening', async () => {
  assert.throws(
    () => parseProductionWebOptions(['--root', '/tmp/dist', '--host', '0.0.0.0', '--port', '5173', '--runtime-origin', 'http://127.0.0.1:17850']),
    error => error instanceof E2eProductionWebError && error.code === 'E2E_WEB_ARGUMENT_INVALID'
  );
  assert.throws(
    () => parseProductionWebOptions(['--root', '/tmp/dist', '--host', '127.0.0.1', '--port', '5173', '--runtime-origin', 'http://localhost:17850']),
    error => error instanceof E2eProductionWebError && error.code === 'E2E_WEB_ARGUMENT_INVALID'
  );
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-web-unsafe-'));
  await writeFile(resolve(root, 'index.html'), '<!doctype html>');
  await symlink(resolve(root, 'index.html'), resolve(root, 'unsafe.js'));
  await assert.rejects(
    () => startProductionWebServer({ root, port: 0, runtimeOrigin: 'http://127.0.0.1:17850' }),
    error => error instanceof E2eProductionWebError && error.code === 'E2E_WEB_DIST_INVALID'
  );
});

async function startRuntime() {
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(request.url === '/api/v1/rejected' ? 409 : 200, { 'content-type': 'text/plain' });
      response.end(`runtime:${request.method}:${request.url}:${Buffer.concat(chunks).toString('utf8')}`);
    });
  });
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.off('error', rejectServer);
      resolveServer();
    });
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()))
  };
}
