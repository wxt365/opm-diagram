import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHarness } from '../src/harness.mjs';

const modelingTools = ['read_model', 'get_capabilities', 'propose_change', 'stage_change', 'revise_plan', 'stage_subdiagram', 'finish_repair', 'finish_generation'];
const scenes = [
  { name: 'OPM', session: 'sdk.model', allow: modelingTools, read: 'read_model' },
  { name: '标准审查', session: 'review.sdk', allow: ['read_review_model', 'submit_review'], read: 'read_review_model' },
  { name: 'OPM脑图', session: 'analysis.sdk', allow: ['read_analysis', 'save_analysis', 'apply_analysis_edits'], read: 'read_analysis' },
];
async function server(handler) {
  const instance = createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${instance.address().port}`, close: async () => {
    instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve));
  } };
}
async function body(request) { let raw = ''; for await (const chunk of request) raw += chunk; return JSON.parse(raw); }
function reply(response, index, tool) {
  const chunk = (delta, finish_reason) => ({ id: `completion_${index}`, object: 'chat.completion.chunk', model: 'local-test', choices: [{ index: 0, delta, finish_reason }] });
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (tool) response.write(`data: ${JSON.stringify(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: `call_${index}`, type: 'function', function: { name: tool, arguments: '{}' } }] }, null))}\n\n`);
  else for (const content of ['流式', '完成']) response.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content }, null))}\n\n`);
  response.end(`data: ${JSON.stringify(chunk({}, tool ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`);
}
for (const scene of scenes) test(`真实 SDK ${scene.name}工具隔离、流式、多轮及关闭重开`, { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-sdk-rc5-')); let calls = 0;
  const callbacks = [], notifications = [];
  const bridge = await server(async (request, response) => {
    const value = await body(request); callbacks.push({ tool: request.url.slice('/internal/'.length), session: value.sessionId });
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ saved: false, marker: 'local-bridge-only' }));
  });
  const model = await server(async (request, response) => {
    try {
      const input = await body(request), tools = input.tools.map(tool => tool.function.name);
      assert.deepEqual(tools.sort(), [...scene.allow].sort());
      calls++;
      if (calls >= 3) assert(JSON.stringify(input.messages).includes('第一轮固定讨论标记'));
      reply(response, calls, calls % 2 ? scene.read : null);
    } catch (error) { response.writeHead(500); response.end(JSON.stringify({ error: { message: error.message } })); }
  });
  const config = { dataRoot: root, provider: 'openai', baseURL: model.origin + '/v1', apiKey: 'local-test-only', model: 'local-test', toolOrigin: bridge.origin, toolSecret: 'local-tools-only' };
  const options = scene.plugin ? { plugin: fileURLToPath(new URL('../src/' + scene.plugin, import.meta.url)), toolAllow: scene.allow } : {};
  let harness;
  t.after(async () => { await harness?.close(); await model.close(); await bridge.close(); await rm(root, { recursive: true, force: true }); });
  harness = await createHarness(config, 'project.sdk', options);
  for (const text of ['第一轮固定讨论标记', '同一会话第二轮']) {
    const value = await harness.run(text, { sessionId: scene.session, onNotification: event => notifications.push(event) });
    assert.equal(value.finalResponse, '流式完成');
    assert.equal(value.events.findLast(event => event.type === 'turn/end')?.data.reason.kind, 'completed');
  }
  await harness.close(); harness = await createHarness(config, 'project.sdk', options);
  assert.equal((await harness.run('关闭重开第三轮', { sessionId: scene.session })).finalResponse, '流式完成');
  assert.equal(callbacks.length, 3);
  assert(callbacks.every(value => value.tool === scene.read && value.session === scene.session));
  assert(notifications.some(value => value.method === 'opm.assistant-stream'), '模型文本必须有实时流式通知');
});

test('真实 SDK 拒绝模型强行调用未授权工具且不转发本地回调', { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-sdk-denial-')); let calls = 0, callbacks = 0;
  const bridge = await server(async (_request, response) => { callbacks++; response.end('{}'); });
  const model = await server(async (request, response) => {
    const input = await body(request);
    assert(!input.tools.some(tool => tool.function.name === 'bash'));
    reply(response, ++calls, calls === 1 ? 'bash' : null);
  });
  const harness = await createHarness({ dataRoot: root, provider: 'openai', baseURL: model.origin + '/v1', apiKey: 'local-test-only', model: 'local-test', toolOrigin: bridge.origin, toolSecret: 'local-tools-only' }, 'project.sdk');
  t.after(async () => { await harness.close(); await model.close(); await bridge.close(); await rm(root, { recursive: true, force: true }); });
  await harness.run('越权测试', { sessionId: 'sdk.denial' });
  assert.equal(callbacks, 0);
});

test('真实 SDK 关闭中止挂起的模型请求，释放子进程', { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-sdk-stop-'));
  let started; const ready = new Promise(resolve => { started = resolve; });
  const model = await server(async (request, _response) => { await body(request); started(); });
  const harness = await createHarness({ dataRoot: root, provider: 'openai', baseURL: model.origin + '/v1', apiKey: 'local-test-only', model: 'local-test', toolOrigin: model.origin, toolSecret: 'local-tools-only' }, 'project.sdk');
  t.after(async () => { await harness.close(); await model.close(); await rm(root, { recursive: true, force: true }); });
  const running = harness.run('停止测试', { sessionId: 'sdk.stop' }).then(value => value, error => error);
  await ready; await harness.close();
  const value = await running;
  assert(value instanceof Error || value.events.findLast(event => event.type === 'turn/end')?.data.reason.kind !== 'completed');
});
