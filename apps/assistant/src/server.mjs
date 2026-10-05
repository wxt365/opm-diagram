import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssistantService, scopeInput, safeMessage } from './service.mjs';
import { AssistantError, check } from './store.mjs';

export function configuration(env = process.env) {
  const config = { apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL ?? 'deepseek-flash', runtimeOrigin: env.OPM_RUNTIME_ORIGIN ?? 'http://127.0.0.1:17850',
    dataRoot: resolve(env.OPM_ASSISTANT_DATA ?? fileURLToPath(new URL('../../../runtime-data/assistant', import.meta.url))),
    port: Number(env.OPM_ASSISTANT_PORT ?? 17860), toolSecret: randomBytes(32).toString('hex') };
  check(config.apiKey, 'CONFIG_INVALID', '请在服务端配置 DEEPSEEK_API_KEY。');
  check(new URL(config.baseURL).protocol === 'https:' || ['localhost', '127.0.0.1'].includes(new URL(config.baseURL).hostname), 'CONFIG_INVALID', '模型服务必须使用 HTTPS。');
  check(['localhost', '127.0.0.1'].includes(new URL(config.runtimeOrigin).hostname), 'CONFIG_INVALID', 'Local Runtime 必须位于本机。');
  config.toolOrigin = `http://127.0.0.1:${config.port}`; return config;
}
async function body(request) {
  check(request.headers['content-type']?.startsWith('application/json'), 'INPUT_INVALID', '请求必须为 JSON。', 415);
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; check(size <= 262144, 'INPUT_TOO_LARGE', '请求超过 256 KiB。', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); check(value && typeof value === 'object' && !Array.isArray(value), 'INPUT_INVALID', 'JSON 对象无效。'); return value; }
  catch (error) { if (error instanceof AssistantError) throw error; throw new AssistantError('INPUT_INVALID', '请求不是合法 JSON。'); }
}
function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
function localRequest(request) {
  const host = request.headers.host?.split(':')[0];
  let origin; try { origin = new URL(request.headers.origin); } catch { throw new AssistantError('LOCAL_SESSION_INVALID', '缺少有效本地来源。', 403); }
  check(['localhost', '127.0.0.1'].includes(host) && origin.hostname === host && ['http:', 'https:'].includes(origin.protocol), 'LOCAL_SESSION_INVALID', '请求必须来自本地工作台。', 403);
}
export async function startServer(config, service = new AssistantService(config)) {
  await service.init();
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/health' && request.method === 'GET') return send(response, 200, { status: 'UP', model: config.model });
      check(request.method === 'POST', 'METHOD_NOT_ALLOWED', '仅接受 POST。', 405);
      const value = await body(request);
      if (request.url.startsWith('/internal/')) {
        const actual = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${config.toolSecret}`);
        check(actual.length === expected.length && timingSafeEqual(actual, expected), 'UNAUTHORIZED', '工具认证失败。', 403);
        return send(response, 200, await service.tool(value.sessionId, request.url.slice('/internal/'.length), value.args ?? {}));
      }
      localRequest(request);
      const session = request.headers['x-opm-session']; await service.authenticate(session);
      const scope = scopeInput(value), key = value.conversationId;
      if (['/api/assistant/prompt', '/api/assistant/apply', '/api/assistant/convert'].includes(request.url)) check(value.draftToken && typeof value.draftToken.draft_id === 'string'
        && Number.isInteger(value.draftToken.edit_seq) && typeof value.draftToken.binding_digest === 'string', 'READONLY', '只能从活动草稿生成或应用修改。', 409);
      switch (request.url) {
        case '/api/assistant/list': return send(response, 200, await service.list(scope, session));
        case '/api/assistant/create': return send(response, 200, await service.create(scope, session));
        case '/api/assistant/get': return send(response, 200, await service.get(key, scope, session));
        case '/api/assistant/prompt': return send(response, 200, await service.prompt(key, scope, session, value.text, value.selectedIds, value.draftToken));
        case '/api/assistant/convert': return send(response, 200, await service.convert(key, scope, session, value.draftToken, value.excludedIds));
        case '/api/assistant/stop': return send(response, 200, await service.stop(key, scope));
        case '/api/assistant/cancel': return send(response, 200, await service.cancel(key, scope, value.proposalId));
        case '/api/assistant/apply': return send(response, 200, await service.apply(key, scope, value.proposalId, session, value.draftToken));
        case '/api/assistant/watch': {
          await service.scoped(key, scope);
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          let last = '', busy = false;
          const tick = async () => {
            if (busy || response.destroyed) return; busy = true;
            try { const data = await service.get(key, scope, session), raw = JSON.stringify(data);
              if (raw !== last) { last = raw; response.write(`data: ${raw}\n\n`); } else response.write(': keepalive\n\n');
            } catch (error) { response.write(`event: error\ndata: ${JSON.stringify({ message: safeMessage(error) })}\n\n`); response.end(); }
            finally { busy = false; }
          };
          const timer = setInterval(() => void tick(), 1000); response.on('close', () => clearInterval(timer)); await tick(); return;
        }
        default: throw new AssistantError('NOT_FOUND', '接口不存在。', 404);
      }
    } catch (error) { if (!response.headersSent) send(response, error.status ?? 500, { code: error.code ?? 'ASSISTANT_FAILED', message: safeMessage(error) }); else response.end(); }
  });
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolveReady); });
  return { server, service, close: async () => { await service.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startServer(configuration());
  console.log(`智能助手服务已启动：http://127.0.0.1:${app.server.address().port}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => process.exit(0)));
}
