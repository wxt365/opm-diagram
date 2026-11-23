import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/harness.mjs';

test('真实 SDK DeepSeek Messages 接入维持工具隔离和文本流', { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-deepseek-sdk-')); let calls = 0, callback = 0;
  const bridge = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    assert.equal(request.url, '/internal/read_model'); assert.equal(JSON.parse(raw).sessionId, 'sdk.deepseek'); callback++;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"model_name":"本地模型"}');
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw); calls++;
      assert.equal(request.url, '/anthropic/v1/messages');
      assert.equal(input.thinking.type, 'disabled'); assert(input.tools.some(tool => tool.name === 'read_model'));
      assert(!input.tools.some(tool => ['bash', 'read_file', 'run_code'].includes(tool.name)));
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      event('message_start', { message: { id: `local_${calls}`, type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      if (calls === 1) {
        event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_read', name: 'read_model', input: {} } });
        event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } });
      } else {
        event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'DeepSeek本机协议验证完成。' } });
      }
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: calls === 1 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 20 } });
      event('message_stop', {}); response.end();
    } catch (error) { response.writeHead(500); response.end(JSON.stringify({ error: { message: error.message } })); }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const harness = await createHarness({ dataRoot: root, baseURL: `http://127.0.0.1:${provider.address().port}`, model: 'deepseek-flash', apiKey: 'local-test-only', toolOrigin: `http://127.0.0.1:${bridge.address().port}`, toolSecret: 'local-tools-only' }, 'project.deepseek');
  t.after(async () => { await harness.close(); for (const server of [provider, bridge]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await rm(root, { recursive: true, force: true }); });
  const notifications = [];
  const result = await harness.run('协议验证', { sessionId: 'sdk.deepseek', onNotification: value => notifications.push(value) });
  assert.equal(result.finalResponse, 'DeepSeek本机协议验证完成。'); assert.equal(callback, 1);
  assert(notifications.some(value => value.method === 'opm.assistant-stream'));
});
