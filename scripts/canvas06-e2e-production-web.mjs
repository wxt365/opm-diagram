import { createServer, request as requestHttp } from 'node:http';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const PROXY_PATHS = new Set(['/opm-bootstrap.js']);
const API_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

export class E2eProductionWebError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function parseProductionWebOptions(argv) {
  const allowed = new Set(['root', 'host', 'port', 'runtime-origin']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || flag.includes('=') || !allowed.has(flag.slice(2))
      || !value || value.startsWith('--') || values.has(flag.slice(2))) {
      fail('E2E_WEB_ARGUMENT_INVALID', 'Each supported --flag <value> is required exactly once.');
    }
    values.set(flag.slice(2), value);
  }
  for (const key of allowed) if (!values.has(key)) fail('E2E_WEB_ARGUMENT_INVALID', `Missing --${key}.`);
  if (values.get('host') !== '127.0.0.1') fail('E2E_WEB_ARGUMENT_INVALID', 'host must be 127.0.0.1.');
  if (!/^(?:[1-9][0-9]{3,4})$/.test(values.get('port')) || Number(values.get('port')) > 65535) {
    fail('E2E_WEB_ARGUMENT_INVALID', 'port must be in 1024..65535.');
  }
  const runtimeOrigin = parseLoopbackOrigin(values.get('runtime-origin'));
  return Object.freeze({
    root: resolve(values.get('root')),
    host: values.get('host'),
    port: Number(values.get('port')),
    runtimeOrigin: runtimeOrigin.toString().replace(/\/$/, '')
  });
}

export async function startProductionWebServer({ root, host = '127.0.0.1', port, runtimeOrigin }) {
  if (host !== '127.0.0.1') fail('E2E_WEB_ARGUMENT_INVALID', 'host must be 127.0.0.1.');
  const resolvedRoot = resolve(root);
  const files = await collectStaticFiles(resolvedRoot);
  const origin = parseLoopbackOrigin(runtimeOrigin);
  const server = createServer((request, response) => {
    void handleRequest({ request, response, root: resolvedRoot, files, runtimeOrigin: origin });
  });
  server.on('clientError', (_, socket) => socket.destroy());
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen({ host, port }, () => {
      server.off('error', rejectServer);
      resolveServer();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    fail('E2E_WEB_INTERNAL_ERROR', 'Expected a loopback TCP listener.');
  }
  return Object.freeze({
    server,
    origin: `http://${host}:${address.port}`,
    close: () => closeServer(server)
  });
}

export async function collectStaticFiles(root) {
  const rootInfo = await lstatOrFail(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) fail('E2E_WEB_DIST_INVALID', 'web-dist must be a non-symlink directory.');
  const files = new Map();
  await visit(root, '');
  if (!files.has('index.html')) fail('E2E_WEB_DIST_INVALID', 'web-dist must contain index.html.');
  return files;

  async function visit(directory, prefix) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = resolve(directory, child.name);
      const details = await lstatOrFail(absolutePath);
      if (details.isSymbolicLink() || !details.isFile() && !details.isDirectory()) {
        fail('E2E_WEB_DIST_INVALID', 'web-dist contains an unsafe filesystem entry.');
      }
      if (details.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else {
        if (details.nlink !== 1) fail('E2E_WEB_DIST_INVALID', 'web-dist contains a hard-linked file.');
        files.set(relativePath, Object.freeze({ path: absolutePath, byteLength: details.size }));
      }
    }
  }
}

async function handleRequest({ request, response, root, files, runtimeOrigin }) {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (pathname.startsWith('/api/')) {
      if (!API_METHODS.has(request.method ?? '')) return respond(response, 405, 'Method Not Allowed');
      return proxyRequest({ request, response, runtimeOrigin, pathname: `${pathname}${requestUrl.search}` });
    }
    if (PROXY_PATHS.has(pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return respond(response, 405, 'Method Not Allowed');
      return proxyRequest({ request, response, runtimeOrigin, pathname: `${pathname}${requestUrl.search}` });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return respond(response, 405, 'Method Not Allowed');
    const file = resolveStaticFile({ pathname, root, files });
    if (!file) return respond(response, 404, 'Not Found');
    const bytes = request.method === 'HEAD' ? undefined : await readFile(file.path);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': String(file.byteLength),
      'content-type': contentType(file.path),
      'x-content-type-options': 'nosniff'
    });
    response.end(bytes);
  } catch (error) {
    respond(response, error instanceof E2eProductionWebError ? 400 : 502, 'Bad Gateway');
  }
}

function resolveStaticFile({ pathname, root, files }) {
  const decoded = decodeURIComponent(pathname);
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return undefined;
  const candidate = decoded === '/' ? 'index.html' : decoded.slice(1);
  if (!safeRelativePath(candidate)) return undefined;
  const exact = files.get(candidate);
  if (exact) return exact;
  if (candidate.includes('.')) return undefined;
  return files.get('index.html');
}

function proxyRequest({ request, response, runtimeOrigin, pathname }) {
  const upstream = new URL(pathname, runtimeOrigin);
  const headers = {
    accept: request.headers.accept ?? '*/*',
    'accept-encoding': 'identity',
    host: upstream.host
  };
  if (typeof request.headers['content-type'] === 'string') headers['content-type'] = request.headers['content-type'];
  if (typeof request.headers['content-length'] === 'string') headers['content-length'] = request.headers['content-length'];
  const forwarded = requestHttp({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: `${upstream.pathname}${upstream.search}`,
    headers
  }, upstreamResponse => {
    const status = upstreamResponse.statusCode ?? 502;
    response.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': upstreamResponse.headers['content-type'] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff'
    });
    upstreamResponse.pipe(response);
  });
  forwarded.once('error', () => respond(response, 502, 'Runtime unavailable'));
  request.once('aborted', () => forwarded.destroy());
  request.pipe(forwarded);
}

function parseLoopbackOrigin(value) {
  let origin;
  try { origin = new URL(value); } catch { fail('E2E_WEB_ARGUMENT_INVALID', 'runtime-origin must be a URL.'); }
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    fail('E2E_WEB_ARGUMENT_INVALID', 'runtime-origin must be an http://127.0.0.1:<port> origin.');
  }
  const port = Number(origin.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('E2E_WEB_ARGUMENT_INVALID', 'runtime-origin port must be in 1024..65535.');
  return origin;
}

async function lstatOrFail(path) {
  try { return await lstat(path); } catch { fail('E2E_WEB_DIST_INVALID', 'web-dist entry is missing.'); }
}

function safeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

function contentType(path) {
  const index = path.lastIndexOf('.');
  return CONTENT_TYPES.get(index < 0 ? '' : path.slice(index)) ?? 'application/octet-stream';
}

function respond(response, status, body) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
  response.end(body);
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
}

function fail(code, message) {
  throw new E2eProductionWebError(code, message);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseProductionWebOptions(process.argv.slice(2));
    await startProductionWebServer(options);
  } catch (error) {
    const code = error instanceof E2eProductionWebError ? error.code : 'E2E_WEB_INTERNAL_ERROR';
    process.stderr.write(`${code}\tWEB_START\t-\t-\n`);
    process.exitCode = 2;
  }
}
