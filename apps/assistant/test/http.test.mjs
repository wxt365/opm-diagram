import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.mjs';
import { AssistantError } from '../src/store.mjs';
test('本地 HTTP 边界拒绝缺少来源、伪造会话、只读写入和内部工具越权', async t => {
  const session = 'local-session-for-http-test'; let prompts = 0, tools = 0;
  const service = { init: async () => {}, close: async () => {}, authenticate: async value => { if (value !== session) throw new AssistantError('LOCAL_SESSION_INVALID', '会话失效', 403); },
    list: async () => [], prompt: async () => { prompts++; }, tool: async () => { tools++; } };
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
});
