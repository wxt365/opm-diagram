import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { guardedModelFetch } from '../src/model-fetch-guard.mjs';

test('模型请求强制拒绝重定向，不影响本地工具请求', async () => {
  const calls = [];
  const request = guardedModelFetch(async (...args) => { calls.push(args); }, 'http://192.168.137.250:33000');
  await request('http://192.168.137.250:33000/v1/chat/completions', { redirect: 'follow', method: 'POST' });
  assert.equal(calls[0][1].redirect, 'error');
  await request(new Request('http://192.168.137.250:33000/v1/models'));
  assert.equal(calls[1][1].redirect, 'error');
  await request('http://127.0.0.1:17860/internal/read_model', { method: 'POST' });
  assert.deepEqual(calls[2][1], { method: 'POST' });
});

test('真实 Fetch 不向重定向目标传输模型请求', async t => {
  let targetCalls = 0;
  const server = createServer((req, res) => {
    if (req.url === '/target') { targetCalls++; res.end('unexpected'); }
    else { res.writeHead(307, { Location: '/target' }); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(guardedModelFetch(fetch, origin)(origin + '/model', {
    method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: 'test',
  }));
  assert.equal(targetCalls, 0);
});
