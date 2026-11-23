import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssistantService, scopeInput, safeMessage } from './service.mjs';
import { AssistantError, check } from './store.mjs';
import { assertNodeVersion } from './node-version.mjs';

function trustedWebOrigins(raw = '') {
  return raw.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    let parsed; try { parsed = new URL(value); } catch { throw new AssistantError('CONFIG_INVALID', '可信工作台来源无效。'); }
    check(['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value && !parsed.hostname.includes('*')
      && !parsed.username && !parsed.password,
      'CONFIG_INVALID', '可信工作台来源必须为完整 HTTP(S) 来源，不支持路径或通配符。');
    return value;
  });
}
export function configuration(env = process.env) {
  const config = { apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL ?? 'deepseek-flash', runtimeOrigin: env.OPM_RUNTIME_ORIGIN ?? 'http://127.0.0.1:17850',
    dataRoot: resolve(env.OPM_ASSISTANT_DATA ?? fileURLToPath(new URL('../../../runtime-data/assistant', import.meta.url))),
    port: Number(env.OPM_ASSISTANT_PORT ?? 17860), toolSecret: randomBytes(32).toString('hex'),
    host: env.OPM_ASSISTANT_HOST ?? '127.0.0.1', remoteEnabled: env.OPM_REMOTE_ENABLED === 'true',
    runtimeAccessToken: env.OPM_RUNTIME_ACCESS_TOKEN ?? env.OPM_EMBEDDED_ACCESS_TOKEN,
    trustedWebOrigins: trustedWebOrigins(env.OPM_TRUSTED_WEB_ORIGINS) };
  check(config.apiKey, 'CONFIG_INVALID', '请在服务端配置 DEEPSEEK_API_KEY。');
  config.provider = env.OPM_MODEL_PROVIDER ?? 'deepseek';
  check(['deepseek', 'openai'].includes(config.provider), 'CONFIG_INVALID', '模型服务协议必须为 deepseek 或 openai。');
  let modelURL;
  try { modelURL = new URL(config.baseURL); }
  catch { throw new AssistantError('CONFIG_INVALID', '模型服务地址无效。'); }
  check(!modelURL.username && !modelURL.password && !modelURL.search && !modelURL.hash,
    'CONFIG_INVALID', '模型服务地址不得包含认证信息、查询或片段。');
  const octets = modelURL.hostname.split('.').map(Number);
  const privateIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(modelURL.hostname) && octets.every(x => x >= 0 && x <= 255)
    && (octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168);
  const explicitLAN = privateIPv4 && env.OPM_MODEL_HTTP_ORIGIN === modelURL.origin;
  check(modelURL.protocol === 'https:' || modelURL.protocol === 'http:'
    && (['localhost', '127.0.0.1'].includes(modelURL.hostname) || explicitLAN),
    'CONFIG_INVALID', '模型服务必须使用 HTTPS；私网 HTTP 需精确配置 OPM_MODEL_HTTP_ORIGIN。');
  const runtimeURL = new URL(config.runtimeOrigin);
  check(['http:', 'https:'].includes(runtimeURL.protocol) && !runtimeURL.username && !runtimeURL.password && !runtimeURL.search && !runtimeURL.hash,
    'CONFIG_INVALID', 'Runtime 地址必须为合法 HTTP(S) 地址。');
  if (!['localhost', '127.0.0.1'].includes(runtimeURL.hostname)) check(config.remoteEnabled && config.runtimeAccessToken,
    'CONFIG_INVALID', '远程 Runtime 需要启用远程接入并提供接入凭证。');
  config.runtimeOrigin = config.runtimeOrigin.replace(/\/+$/, '');
  config.toolOrigin = `http://127.0.0.1:${config.port}`; return config;
}
async function body(request) {
  check(request.headers['content-type']?.startsWith('application/json'), 'INPUT_INVALID', '请求必须为 JSON。', 415);
  const chunks = []; let size = 0;
  const limit = request.url === '/api/assistant/prompt' ? 15 * 1024 * 1024 : 262144;
  for await (const chunk of request) { size += chunk.length; check(size <= limit, 'INPUT_TOO_LARGE', '请求内容过大，请减少附件或文字。', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); check(value && typeof value === 'object' && !Array.isArray(value), 'INPUT_INVALID', 'JSON 对象无效。'); return value; }
  catch (error) { if (error instanceof AssistantError) throw error; throw new AssistantError('INPUT_INVALID', '请求不是合法 JSON。'); }
}
function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
function localRequest(request, config) {
  const host = request.headers.host?.split(':')[0];
  let origin; try { origin = new URL(request.headers.origin); } catch { throw new AssistantError('LOCAL_SESSION_INVALID', '缺少有效本地来源。', 403); }
  const trusted = (config.trustedWebOrigins ?? []).includes(request.headers.origin);
  check((config.remoteEnabled ? trusted || ['localhost', '127.0.0.1'].includes(origin.hostname)
    : ['localhost', '127.0.0.1'].includes(host) && (origin.hostname === host || trusted))
    && ['http:', 'https:'].includes(origin.protocol), 'LOCAL_SESSION_INVALID', '请求必须来自本地或已配置的可信工作台。', 403);
}
export async function startServer(config, service = new AssistantService(config)) {
  assertNodeVersion();
  await service.init();
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/health' && request.method === 'GET') return send(response, 200, { status: 'UP', model: config.model });
      if (request.url.startsWith('/api/assistant/')) {
        localRequest(request, config);
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
        response.setHeader('Vary', 'Origin');
        if (request.method === 'OPTIONS') {
          check(request.headers['access-control-request-method'] === 'POST', 'METHOD_NOT_ALLOWED', '仅允许 POST。', 405);
          const requested = (request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
          check(requested.every(x => ['content-type', 'x-opm-session', 'authorization'].includes(x)), 'INPUT_INVALID', '请求头未被允许。', 403);
          response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, X-OPM-Session, Authorization', 'Access-Control-Max-Age': '600' });
          response.end(); return;
        }
      }
      check(request.method === 'POST', 'METHOD_NOT_ALLOWED', '仅接受 POST。', 405);
      const value = await body(request);
      if (request.url.startsWith('/internal/')) {
        const actual = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${config.toolSecret}`);
        check(actual.length === expected.length && timingSafeEqual(actual, expected), 'UNAUTHORIZED', '工具认证失败。', 403);
        return send(response, 200, await service.tool(value.sessionId, request.url.slice('/internal/'.length), value.args ?? {}));
      }
      localRequest(request, config);
      const session = request.headers['x-opm-session']; await service.authenticate(session);
      if (request.url.startsWith('/api/assistant/business/')) throw new AssistantError('NOT_FOUND', '接口不存在。', 404);
      const scope = scopeInput(value), key = value.conversationId;
      if (['/api/assistant/prompt', '/api/assistant/apply', '/api/assistant/convert', '/api/assistant/review'].includes(request.url)) check(value.draftToken && typeof value.draftToken.draft_id === 'string'
        && Number.isInteger(value.draftToken.edit_seq) && typeof value.draftToken.binding_digest === 'string', 'READONLY', '只能从活动草稿生成或应用修改。', 409);
      switch (request.url) {
        case '/api/assistant/list': return send(response, 200, await service.list(scope, session));
        case '/api/assistant/create': return send(response, 200, await service.create(scope, session));
        case '/api/assistant/get': return send(response, 200, await service.get(key, scope, session));
        case '/api/assistant/prompt': return send(response, 200, await service.prompt(key, scope, session, value.text, value.selectedIds, value.draftToken, value.attachments, value.editMessageId, value.focusedBranchId, value.analysisRevision, value.autoApply === true));
        case '/api/assistant/convert': return send(response, 200, await service.convert(key, scope, session, value.draftToken, value.excludedIds, value.autoApply === true));
        case '/api/assistant/review': return send(response, 200, await service.retryReview(key, scope, value.proposalId, session, value.draftToken, value.autoApply === true));
        case '/api/assistant/stop': return send(response, 200, await service.stop(key, scope));
        case '/api/assistant/cancel': return send(response, 200, await service.cancel(key, scope, value.proposalId));
        case '/api/assistant/apply': return send(response, 200, await service.apply(key, scope, value.proposalId, session, value.draftToken));
        case '/api/assistant/watch': {
          const read = () => service.get(key, scope, session);
          await service.scoped(key, scope);
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          let last = '', busy = false;
          const tick = async () => {
            if (busy || response.destroyed) return; busy = true;
            try { const data = await read(), raw = JSON.stringify(data);
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
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(config.port, config.host ?? '127.0.0.1', resolveReady); });
  // 监听端口为 0 时，以实际端口提供 Harness 内部工具地址。
  config.toolOrigin = `http://127.0.0.1:${server.address().port}`;
  return { server, service, close: async () => { await service.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startServer(configuration());
  console.log(`智能助手服务已启动：http://127.0.0.1:${app.server.address().port}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => process.exit(0)));
}
