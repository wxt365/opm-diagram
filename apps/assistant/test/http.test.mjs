import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer, configuration } from '../src/server.mjs';
import { AssistantError } from '../src/store.mjs';

test('业务助手路由不可用，仍先校验来源和会话', async t => {
  let dispatched = 0;
  const service = { init: async () => {}, close: async () => {}, authenticate: async value => { if (value !== 'business-session') throw new AssistantError('LOCAL_SESSION_INVALID', '会话无效', 403); },
    business: { dispatch: async (operation, value, session) => { dispatched++; assert.equal(operation, 'prompt'); assert.equal(value.kind, 'BUSINESS'); assert.equal(session, 'business-session'); return { accepted: true }; } } };
  const app = await startServer({ port: 0, toolSecret: 'private' }, service); t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-OPM-Session': 'business-session' };
  const post = h => fetch(origin + '/api/assistant/business/prompt', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'BUSINESS', projectId: 'p', modelId: 'm', contextId: 'v', text: '建立业务对象', baseRevision: 'r' }) });
  assert.equal((await post({ ...headers, Origin: 'https://untrusted.test' })).status, 403);
  assert.equal((await post({ ...headers, 'X-OPM-Session': 'wrong' })).status, 403);
  assert.equal(dispatched, 0); assert.equal((await post(headers)).status, 404); assert.equal(dispatched, 0);
});

test('远程 IP/域名接入支持 CORS 预检但来源与会话仍校验', async t => {
  const origin = 'http://192.168.1.20:3000', session = 'embedded-assistant-session';
  const service = { init: async () => {}, close: async () => {}, list: async () => [],
    authenticate: async value => { if (value !== session) throw new AssistantError('LOCAL_SESSION_INVALID', '会话无效', 403); } };
  const app = await startServer({ port: 0, host: '127.0.0.1', remoteEnabled: true, trustedWebOrigins: [origin], toolSecret: 'private-secret' }, service);
  t.after(() => app.close()); const base = `http://127.0.0.1:${app.server.address().port}`;
  const preflight = await fetch(base + '/api/assistant/list', { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-opm-session,authorization',
  } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i);
  assert.equal((await fetch(base + '/api/assistant/list', { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,x-unknown-header',
  } })).status, 403);
  const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-OPM-Session': session, Authorization: 'Bearer embedded-access' };
  assert.equal((await fetch(base + '/api/assistant/list', { method: 'POST', headers, body: JSON.stringify(scope) })).status, 200);
  assert.equal((await fetch(base + '/api/assistant/list', { method: 'POST', headers: { ...headers, 'X-OPM-Session': 'wrong' }, body: JSON.stringify(scope) })).status, 403);
  assert.equal((await fetch(base + '/api/assistant/list', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.test', 'Access-Control-Request-Method': 'POST' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = request(base + '/api/assistant/list', { method: 'POST', headers: { ...headers, Host: 'assistant.example.com' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    }); req.on('error', reject); req.end(JSON.stringify(scope));
  });
  assert.equal(foreignHostStatus, 200);
  assert.throws(() => configuration({ DEEPSEEK_API_KEY: 'test', OPM_RUNTIME_ORIGIN: 'https://opm.example.com' }));
  assert.equal(configuration({ DEEPSEEK_API_KEY: 'test', OPM_REMOTE_ENABLED: 'true', OPM_RUNTIME_ORIGIN: 'https://opm.example.com',
    OPM_RUNTIME_ACCESS_TOKEN: 'deployment-key', OPM_ASSISTANT_HOST: '0.0.0.0' }).host, '0.0.0.0');
});
test('本地 HTTP 边界拒绝缺少来源、伪造会话、只读写入和内部工具越权', async t => {
  const session = 'local-session-for-http-test'; let prompts = 0, tools = 0, reviews = 0;
  const service = { init: async () => {}, close: async () => {}, authenticate: async value => { if (value !== session) throw new AssistantError('LOCAL_SESSION_INVALID', '会话失效', 403); },
    list: async () => [], prompt: async () => { prompts++; }, retryReview: async () => { reviews++; return { accepted: true }; }, tool: async () => { tools++; } };
  const app = await startServer({ port: 0, model: 'deepseek-flash', toolSecret: 'private-tool-secret' }, service);
  t.after(() => app.close()); const origin = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-OPM-Session': session };
  const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
  const post = (op, h = headers, data = scope) => fetch(origin + op, { method: 'POST', headers: h, body: JSON.stringify(data) });
  assert.equal((await post('/api/assistant/list')).status, 200);
  const withoutOrigin = { ...headers }; delete withoutOrigin.Origin; assert.equal((await post('/api/assistant/list', withoutOrigin)).status, 403);
  assert.equal((await post('/api/assistant/list', { ...headers, Origin: 'https://example.com' })).status, 403);
  assert.equal((await post('/api/assistant/list', { ...headers, 'X-OPM-Session': 'forged' })).status, 403);
  assert.equal((await post('/api/assistant/prompt', headers, { ...scope, text: '写入', draftToken: null })).status, 409);
  assert.equal((await post('/internal/read_model', headers, {})).status, 403);
  assert.equal((await post('/api/assistant/list', headers, { ...scope, contextId: '../escape' })).status, 400);
  assert.equal(prompts, 0); assert.equal(tools, 0);
  assert.equal((await post('/api/assistant/review', headers, { ...scope, proposalId: 'p', draftToken: null })).status, 409);
  assert.equal(reviews, 0);
  const input = { ...scope, proposalId: 'p', draftToken: { draft_id: 'draft.test', edit_seq: 0, binding_digest: 'a' } };
  assert.equal((await post('/api/assistant/review', { ...headers, Origin: 'https://example.com' }, input)).status, 403);
  assert.equal((await post('/api/assistant/review', { ...headers, 'X-OPM-Session': 'forged' }, input)).status, 403);
  assert.equal((await post('/api/assistant/review', headers, input)).status, 200); assert.equal(reviews, 1);
});

test('可信局域网来源精确匹配且仍验证会话和内部工具认证', async t => {
  const lan = 'http://192.168.2.182:5177', session = 'lan-test-session';
  const config = configuration({ DEEPSEEK_API_KEY: 'test-key', OPM_ASSISTANT_PORT: '0', OPM_TRUSTED_WEB_ORIGINS: ` ${lan},https://192.168.64.1:5177 ` });
  const service = { init: async () => {}, close: async () => {}, list: async () => [],
    authenticate: async value => { if (value !== session) throw new AssistantError('LOCAL_SESSION_INVALID', '会话失效', 403); } };
  const app = await startServer(config, service); t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
  const post = (source, token = session, host, path = '/api/assistant/list') => fetch(origin + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(source === null ? {} : { Origin: source }),
      ...(token === null ? {} : { 'X-OPM-Session': token }), ...(host ? { Host: host } : {}) }, body: JSON.stringify(scope) });
  assert.equal((await post(lan)).status, 200);
  assert.equal((await post('https://192.168.64.1:5177')).status, 200);
  assert.equal((await post(origin)).status, 200);
  for (const source of [null, 'null', 'https://example.com', 'http://192.168.2.182:5178', 'https://192.168.2.182:5177', `${lan}/`, `${lan}?q=1`]) {
    assert.equal((await post(source)).status, 403);
  }
  assert.equal((await post(lan, 'forged')).status, 403);
  assert.equal((await post(lan, null)).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = request(origin + '/api/assistant/list', { method: 'POST', headers: {
      Host: 'example.com', Origin: lan, 'Content-Type': 'application/json', 'X-OPM-Session': session,
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    req.on('error', reject); req.end(JSON.stringify(scope));
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await post(lan, session, undefined, '/internal/read_model')).status, 403);
});

test('模型服务默认拒绝 HTTP，私网例外要求精确 origin', () => {
  const base = { DEEPSEEK_API_KEY: 'test-key', OPM_MODEL_PROVIDER: 'openai' };
  const url = 'http://192.168.137.250:33000/v1/';
  assert.throws(() => configuration({ ...base, DEEPSEEK_BASE_URL: url }));
  const config = configuration({ ...base, DEEPSEEK_BASE_URL: url, OPM_MODEL_HTTP_ORIGIN: 'http://192.168.137.250:33000' });
  assert.equal(config.provider, 'openai'); assert.equal(config.baseURL, url);
  for (const value of ['http://192.168.137.250:33001', '*', 'http://192.168.137.250:33000/'])
    assert.throws(() => configuration({ ...base, DEEPSEEK_BASE_URL: url, OPM_MODEL_HTTP_ORIGIN: value }));
  for (const value of ['http://8.8.8.8/v1', 'http://172.32.0.1/v1', 'ftp://127.0.0.1/v1', 'https://user:secret@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1#hash'])
    assert.throws(() => configuration({ ...base, DEEPSEEK_BASE_URL: value, OPM_MODEL_HTTP_ORIGIN: new URL(value).origin }));
  for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.1'])
    assert.equal(configuration({ ...base, DEEPSEEK_BASE_URL: `http://${host}/v1`, OPM_MODEL_HTTP_ORIGIN: `http://${host}` }).provider, 'openai');
  assert.equal(configuration({ DEEPSEEK_API_KEY: 'test-key' }).provider, 'deepseek');
  assert.throws(() => configuration({ ...base, OPM_MODEL_PROVIDER: 'unknown' }));
});

test('可信来源配置拒绝通配符及非来源 URL', () => {
  for (const origin of ['*', 'http://*.example.com', 'file://example.com', 'http://192.168.2.182:5177/path',
    'http://user@192.168.2.182:5177', 'http://192.168.2.182:5177?q=1', 'http://192.168.2.182:5177#hash']) {
    assert.throws(() => configuration({ DEEPSEEK_API_KEY: 'test-key', OPM_TRUSTED_WEB_ORIGINS: origin }));
  }
});
