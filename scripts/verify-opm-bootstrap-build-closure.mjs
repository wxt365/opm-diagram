import { execFileSync } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';

const PHASES = new Set(['SOURCE', 'POST']);
const CRITICAL_SOURCE_FILES = Object.freeze([
  'package.json',
  'package-lock.json',
  'apps/web/index.html',
  'apps/web/tsconfig.json',
  'apps/web/tsconfig.app.json',
  'apps/web/tsconfig.node.json',
  'apps/web/vite.config.ts',
  'apps/web/src/main.ts',
  'apps/web/src/env.d.ts'
]);
const FORBIDDEN_CONFIG_OUTPUTS = Object.freeze(['apps/web/vite.config.js', 'apps/web/vite.config.d.ts']);
const NON_BUILD_ROOTS = new Set(['.codegraph', '.codex', '.harness', 'reference']);

export class BootstrapBuildClosureError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'BootstrapBuildClosureError';
    this.code = code;
    this.stage = stage;
    this.exitCode = code === 'BOOTSTRAP_BUILD_IO_FAILED'
      ? 4
      : ['BOOTSTRAP_BUILD_ARGUMENT_INVALID', 'BOOTSTRAP_BUILD_NODE_VERSION_INVALID', 'BOOTSTRAP_BUILD_SOURCE_DIRTY'].includes(code)
        ? 2
        : 3;
  }
}

export async function verifyBootstrapBuildClosure({ root = resolve('.'), phase, nodeVersion = process.version, npmVersion = currentNpmVersion() }) {
  const workspace = resolve(root);
  assertPhase(phase);
  assertNodeAndNpm(nodeVersion, npmVersion);
  const tracked = trackedFiles(workspace);
  assertClean(workspace);
  await assertCriticalSourceFiles(workspace, tracked);
  await assertForbiddenConfigOutputsAbsent(workspace);
  await assertTreeClosed(workspace, tracked);
  await assertSourceHtml(workspace);
  if (phase === 'SOURCE') {
    await assertDerivedRootsAbsent(workspace);
  } else {
    await assertPostBuildDist(workspace);
  }
  return Object.freeze({ root: workspace, phase });
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--phase' || !PHASES.has(argv[1])) fail('BOOTSTRAP_BUILD_ARGUMENT_INVALID', 'ARGS', '仅接受一次 --phase SOURCE|POST。');
  return argv[1];
}

function assertPhase(phase) {
  if (!PHASES.has(phase)) fail('BOOTSTRAP_BUILD_ARGUMENT_INVALID', 'ARGS', 'phase 必须是 SOURCE 或 POST。');
}

function assertNodeAndNpm(nodeVersion, npmVersion) {
  if (nodeVersion !== 'v22.22.0' || npmVersion !== '10.9.4') {
    fail('BOOTSTRAP_BUILD_NODE_VERSION_INVALID', 'NODE', 'Bootstrap Build Closure 仅接受 Node v22.22.0 和 npm 10.9.4。');
  }
}

function trackedFiles(root) {
  try {
    return new Set(execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
  } catch (error) {
    fail('BOOTSTRAP_BUILD_IO_FAILED', 'SOURCE_FILES', error.message);
  }
}

function assertClean(root) {
  try {
    if (execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim()) {
      fail('BOOTSTRAP_BUILD_SOURCE_DIRTY', 'SOURCE_CLEAN', 'source-root 必须不存在 tracked 或 untracked 漂移。');
    }
  } catch (error) {
    if (error instanceof BootstrapBuildClosureError) throw error;
    fail('BOOTSTRAP_BUILD_IO_FAILED', 'SOURCE_CLEAN', error.message);
  }
}

async function assertCriticalSourceFiles(root, tracked) {
  for (const path of CRITICAL_SOURCE_FILES) {
    if (!tracked.has(path)) fail('BOOTSTRAP_BUILD_SOURCE_DIRTY', 'SOURCE_FILES', `关键 source 文件未被 Git 跟踪：${path}`);
    await assertSingleLinkRegularFile(resolve(root, path), 'BOOTSTRAP_BUILD_SOURCE_DIRTY', 'SOURCE_FILES');
  }
  if (tracked.has('apps/web/vite.config.js')) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'SOURCE_FILES', 'vite.config.js 不得作为 tracked 配置源。');
  const tsconfig = JSON.parse(await readFile(resolve(root, 'apps/web/tsconfig.node.json'), 'utf8'));
  if (tsconfig?.compilerOptions?.noEmit !== true) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'SOURCE_FILES', 'tsconfig.node.json 必须固定 noEmit=true。');
}

async function assertForbiddenConfigOutputsAbsent(root) {
  for (const path of FORBIDDEN_CONFIG_OUTPUTS) {
    if (await exists(resolve(root, path))) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'DERIVED_ROOTS', `${path} 必须不存在。`);
  }
}

async function assertDerivedRootsAbsent(root) {
  for (const path of ['apps/web/dist']) {
    if (await exists(resolve(root, path))) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'DERIVED_ROOTS', `${path} 必须在 SOURCE 阶段不存在。`);
  }
  const services = resolve(root, 'services');
  if (await exists(services)) await visit(services, 'services', async (path, info) => {
    if (info.isDirectory() && basename(path) === 'target') fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'DERIVED_ROOTS', 'SOURCE 阶段不得存在 services/**/target。');
  });
}

async function assertTreeClosed(root, tracked) {
  await visit(root, '', async (path, info, logicalPath) => {
    if (logicalPath === '.git' || logicalPath.startsWith('.git/')) return false;
    if (isNonBuildPath(logicalPath)) return false;
    if (isAllowedDerivedPath(logicalPath)) return false;
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'INVENTORY', `source 范围存在非普通单链接实体：${logicalPath}`);
    if (info.isFile() && !tracked.has(logicalPath)) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'INVENTORY', `allowlist 外存在非跟踪实体：${logicalPath}`);
    return true;
  });
}

async function assertSourceHtml(root) {
  const html = await readFile(resolve(root, 'apps/web/index.html'), 'utf8');
  const scripts = parseScripts(html, 'BOOTSTRAP_BUILD_HTML_INVALID');
  const bootstrap = scripts.filter(item => item.attributes.src === '/opm-bootstrap.js');
  if (bootstrap.length !== 1 || !isClassicExternalBootstrap(bootstrap[0])) fail('BOOTSTRAP_BUILD_HTML_INVALID', 'SOURCE_HTML', 'source HTML 必须仅有一个 classic external /opm-bootstrap.js。');
  const application = scripts.find(item => item.attributes.type === 'module' && item.attributes.src === '/src/main.ts');
  if (!application || bootstrap[0].offset >= application.offset) fail('BOOTSTRAP_BUILD_ORDER_INVALID', 'SOURCE_HTML', 'Bootstrap 必须位于应用 module 入口之前。');
}

async function assertPostBuildDist(root) {
  const dist = resolve(root, 'apps/web/dist');
  await assertDirectory(dist, 'BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'POST_INVENTORY');
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const scripts = parseScripts(html, 'BOOTSTRAP_BUILD_HTML_INVALID');
  const bootstrap = scripts.filter(item => item.attributes.src === '/opm-bootstrap.js');
  if (bootstrap.length !== 1 || !isClassicExternalBootstrap(bootstrap[0])) fail('BOOTSTRAP_BUILD_HTML_INVALID', 'DIST_HTML', 'dist HTML 必须保留 classic external Bootstrap。');
  if (!scripts.some(item => item.attributes.type === 'module')) fail('BOOTSTRAP_BUILD_ORDER_INVALID', 'DIST_HTML', 'dist HTML 必须保留应用 module 入口。');
  const files = [];
  await visit(dist, 'apps/web/dist', async (path, info, logicalPath) => {
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) fail('BOOTSTRAP_BUILD_DERIVED_OUTPUT_INVALID', 'DIST_INVENTORY', `dist 存在非普通单链接实体：${logicalPath}`);
    if (info.isFile()) files.push({ path, logicalPath });
    return true;
  });
  if (files.some(item => basename(item.logicalPath) === 'opm-bootstrap.js')) fail('BOOTSTRAP_BUILD_HTML_INVALID', 'DIST_ASSETS', 'dist 不得生成 Bootstrap 资源文件。');
  for (const file of files) {
    if (file.logicalPath === 'apps/web/dist/index.html') continue;
    const bytes = await readFile(file.path);
    if (bytes.includes(Buffer.from('/opm-bootstrap.js')) || bytes.includes(Buffer.from('window.__OPM_LOCAL_SESSION__ ='))) {
      fail('BOOTSTRAP_BUILD_HTML_INVALID', 'DIST_ASSETS', 'dist 不得内联或打包 Bootstrap 响应。');
    }
  }
}

function parseScripts(html, code) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = pattern.exec(html))) scripts.push({ attributes: parseAttributes(match[1]), body: match[2], offset: match.index });
  if (scripts.length === 0) fail(code, 'HTML_PARSE', 'HTML 未包含可解析 script。');
  return scripts;
}

function parseAttributes(raw) {
  const attributes = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(raw))) attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  return attributes;
}

function isClassicExternalBootstrap(script) {
  return script.body.trim() === '' && Object.keys(script.attributes).length === 1 && script.attributes.src === '/opm-bootstrap.js';
}

async function visit(root, prefix, visitor) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    const logicalPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = await lstat(path);
    const descend = await visitor(path, info, logicalPath);
    if (descend !== false && info.isDirectory()) await visit(path, logicalPath, visitor);
  }
}

function isAllowedDerivedPath(path) {
  return path === 'node_modules' || path.startsWith('node_modules/')
    || path === 'apps/web/node_modules' || path.startsWith('apps/web/node_modules/')
    || path === 'apps/web/dist' || path.startsWith('apps/web/dist/')
    || /^services\/[^/]+\/target(?:\/|$)/.test(path);
}

function isNonBuildPath(path) {
  return NON_BUILD_ROOTS.has(path.split('/', 1)[0]);
}

async function assertSingleLinkRegularFile(path, code, stage) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('unsafe file');
  } catch {
    fail(code, stage, `必须是普通单链接文件：${path}`);
  }
}

async function assertDirectory(path, code, stage) {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe directory');
  } catch {
    fail(code, stage, `必须是普通目录：${path}`);
  }
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; fail('BOOTSTRAP_BUILD_IO_FAILED', 'IO', error.message); }
}

function currentNpmVersion() {
  try { return execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(); }
  catch (error) { fail('BOOTSTRAP_BUILD_IO_FAILED', 'NODE', error.message); }
}

export function fail(code, stage, message) {
  throw new BootstrapBuildClosureError(code, stage, message);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const phase = parseArguments(process.argv.slice(2));
  verifyBootstrapBuildClosure({ phase }).then(() => process.stdout.write(`${phase}\n`)).catch(error => {
    const value = error instanceof BootstrapBuildClosureError ? error : new BootstrapBuildClosureError('BOOTSTRAP_BUILD_IO_FAILED', 'INTERNAL', error.message);
    process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
    process.exitCode = value.exitCode;
  });
}
