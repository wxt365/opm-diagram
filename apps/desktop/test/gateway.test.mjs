import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createGateway } from '../src/gateway.mjs';

test('同源网关透传契约、流式 SSE，拒绝跨域、未知路径及目录逃逸', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-gateway-'));
  await mkdir(join(root, 'web')); await mkdir(join(root, 'desktop'));
  await writeFile(join(root, 'web/index.html'), '<html>workbench</html>');
  await writeFile(join(root, 'secret.txt'), 'private');
  await symlink(join(root, 'secret.txt'), join(root, 'web/escape.txt'));
  const gateway = await createGateway({ webRoot: join(root, 'web'), desktopRoot: join(root, 'desktop') });
  const upstream = createServer((req, res) => {
    if (req.url.includes('/watch')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: first\n\n'); return; }
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { res.writeHead(409, { 'X-Draft-Token': 'opaque-token' }); res.end(JSON.stringify({ session: req.headers['x-opm-session'], body, origin: req.headers.origin })); });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(async () => { await gateway.close(); upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); await rm(root, { recursive: true, force: true }); });
  const origin = gateway.origin;
  assert.equal((await fetch(origin + '/projects/p/models/m/workbench?context=c')).status, 200);
  assert.equal((await fetch(origin + '/projects/p/business-models/m/workbench')).status, 404);
  assert.equal((await fetch(origin + '/unknown')).status, 404);
  assert.equal((await fetch(origin + '/escape.txt')).status, 404);
  assert.equal((await fetch(origin + '/%2eenv')).status, 403);
  assert.equal((await fetch(origin + '/api/v1/test', { headers: { Origin: 'https://hostile.example' } })).status, 403);
  assert.equal((await fetch(origin + '/api/v1/test', { method: 'POST' })).status, 403);
  assert.equal((await fetch(origin + '/api/assistant/list', { method: 'POST', headers: { Origin: origin } })).status, 503);
  const wrongHost = await new Promise(done => { const req = request(origin + '/', { headers: { Host: 'example.com' } }, res => { res.resume(); done(res.statusCode); }); req.end(); });
  assert.equal(wrongHost, 403);
  assert.throws(() => gateway.setRuntime('https://example.com'));
  gateway.setRuntime(`http://127.0.0.1:${upstream.address().port}`); gateway.setAssistant(`http://127.0.0.1:${upstream.address().port}`);
  const response = await fetch(origin + '/api/v2/test', { method: 'POST', headers: { Origin: origin, 'X-OPM-Session': 'session-value', 'Content-Type': 'application/json' }, body: '{"command_id":"same"}' });
  assert.equal(response.status, 409); assert.equal(response.headers.get('x-draft-token'), 'opaque-token');
  assert.deepEqual(await response.json(), { session: 'session-value', body: '{"command_id":"same"}', origin });
  const business = await fetch(origin + '/api/business-modeling/v1/languages', { headers: { Origin: origin, 'X-OPM-Session': 'session-value' } });
  assert.equal(business.status, 404);
  const controller = new AbortController();
  const stream = await fetch(origin + '/api/assistant/watch', { method: 'POST', headers: { Origin: origin }, signal: controller.signal });
  assert.match(new TextDecoder().decode((await stream.body.getReader().read()).value), /data: first/);
  await gateway.pause(); controller.abort();
  assert.equal((await fetch(origin + '/api/v1/test')).status, 503);
  gateway.resume(); assert.equal((await fetch(origin + '/api/v1/test')).status, 409);
});
