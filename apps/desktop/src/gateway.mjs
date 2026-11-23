import { createServer, request as upstreamRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const send = (res, status, code, message) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ code, message })); };
const runtimeRoute = path => path === '/opm-bootstrap.js' || /^\/api\/v[12](?:\/|\?|$)/.test(path);
const assistantRoute = path => /^\/api\/assistant(?:\/|\?|$)/.test(path) && !path.startsWith('/api/assistant/business/');
const pageRoute = path => path === '/' || path === '/projects' || /^\/projects\/[\w.-]+(?:\/models\/[\w.-]+\/workbench)?$/.test(path);

/** 只代理受管服务；业务会话、状态码和 SSE 原样保留。 */
export async function createGateway({ webRoot, desktopRoot, port = 0 }) {
  const web = await realpath(webRoot), desktop = await realpath(desktopRoot);
  let origin, runtime, assistant, paused = false;
  const pending = new Set();
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', csp);
      if (req.headers.host !== new URL(origin).host || req.headers.origin && req.headers.origin !== origin
        || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, 'ORIGIN_REJECTED', '请求来源不属于本客户端。');
      if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) return send(res, 405, 'METHOD_NOT_ALLOWED', '不支持此请求方式。');
      const rawPath = req.url.split('?')[0];
      if (runtimeRoute(req.url) || assistantRoute(req.url)) {
        if (req.method === 'POST' && req.headers.origin !== origin) return send(res, 403, 'ORIGIN_REJECTED', '写入必须来自当前工作台。');
        if (paused) return send(res, 503, 'DESKTOP_MAINTENANCE', '正在安全关闭或备份，请稍候。');
        const target = assistantRoute(req.url) ? assistant : runtime;
        if (!target) return send(res, 503, assistantRoute(req.url) ? 'ASSISTANT_UNAVAILABLE' : 'RUNTIME_UNAVAILABLE', assistantRoute(req.url) ? '智能助手尚未配置，请打开客户端设置。' : '本地服务尚未就绪。');
        const parsed = new URL(target);
        const upstream = upstreamRequest({ hostname: '127.0.0.1', port: parsed.port, path: req.url, method: req.method,
          headers: { ...req.headers, host: parsed.host, origin, connection: 'close' } }, response => {
          res.writeHead(response.statusCode, response.headers); res.flushHeaders(); response.pipe(res);
          response.on('error', () => res.destroy());
        });
        // SSE 不属于待完成写事务；关闭订阅不等于停止模型任务。
        const tracked = req.method === 'POST' && !req.url.startsWith('/api/assistant/watch');
        if (tracked) pending.add(upstream);
        upstream.on('close', () => pending.delete(upstream));
        upstream.on('error', () => { if (!res.headersSent) send(res, 502, 'LOCAL_SERVICE_FAILED', '本地服务连接中断，请查看客户端状态。'); else res.destroy(); });
        req.on('aborted', () => upstream.destroy()); res.on('close', () => upstream.destroy());
        req.pipe(upstream); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 404, 'NOT_FOUND', '资源不存在。');
      let decoded;
      try { decoded = decodeURIComponent(rawPath); } catch { return send(res, 400, 'PATH_INVALID', '资源路径无效。'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(p => p === '..' || p.startsWith('.'))) return send(res, 403, 'PATH_INVALID', '资源路径无效。');
      const isDesktop = decoded.startsWith('/desktop/');
      const base = isDesktop ? desktop : web;
      const relative = isDesktop ? decoded.slice('/desktop/'.length) : decoded.slice(1);
      let file = resolve(base, relative || 'index.html');
      if (!isDesktop && pageRoute(decoded)) file = resolve(web, 'index.html');
      const physical = await realpath(file).catch(() => null);
      if (!physical || !physical.startsWith(base + sep) || !(await stat(physical)).isFile()) return send(res, 404, 'NOT_FOUND', '资源不存在。');
      res.writeHead(200, { 'Content-Type': types[extname(physical)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') res.end(); else createReadStream(physical).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) send(res, 500, 'GATEWAY_FAILED', '本地资源读取失败。'); else res.destroy(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const checked = value => { if (value && (new URL(value).hostname !== '127.0.0.1' || new URL(value).protocol !== 'http:')) throw new Error('只能连接受管本地服务。'); return value; };
  return { server, origin, setRuntime(value) { runtime = checked(value); }, setAssistant(value) { assistant = checked(value); },
    async pause(timeout = 20000) { paused = true; const deadline = Date.now() + timeout; while (pending.size) { if (Date.now() > deadline) { paused = false; throw new Error('仍有写入未完成，未关闭服务。'); } await new Promise(done => setTimeout(done, 30)); } },
    resume() { paused = false; },
    async close() { server.closeAllConnections(); await new Promise(done => server.close(done)); } };
}
