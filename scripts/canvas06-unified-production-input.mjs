import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { jcs } from './canvas06-e2e-manifest-v01-support.mjs';

export const BASE_SOURCE_COMMIT = 'daf383df6d7faad866b84fceac0a2c9111a8c926';
export const SOURCE_PATHS = Object.freeze({
  runtimeJar: 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar',
  webDist: 'apps/web/dist',
  drivers: Object.freeze(['procedural-driver.mjs', 'control-driver.mjs', 'structural-driver.mjs', 'common-driver.mjs']),
  driverRoot: 'tests/e2e/release/dev-canvas-06/drivers',
  commonFactory: 'tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs',
  commonGenerator: 'scripts/build-canvas06-common-visual-fixtures.mjs',
  profileAssets: Object.freeze([
    'packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json',
    'packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json',
    'packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json',
    'packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json',
    'packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json'
  ])
});

export class UnifiedInputError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'UnifiedInputError';
    this.code = code;
    this.stage = stage;
    this.exitCode = code === 'CANVAS06_UNIFIED_TRANSACTION_FAILED' ? 4 : code === 'CANVAS06_UNIFIED_ARGUMENT_INVALID' || code === 'CANVAS06_UNIFIED_BASE_INVALID' || code === 'CANVAS06_UNIFIED_SOURCE_DIRTY' ? 2 : 3;
  }
}

export function fail(code, stage, message) { throw new UnifiedInputError(code, stage, message); }

export function parseOptions(argv, role) {
  const required = role === 'rebuild'
    ? ['source-root', 'handoff-root', 'base-source-commit', 'source-commit', 'out', 'require-production']
    : ['source-root', 'handoff-root', 'base-source-commit', 'source-commit', 'input', 'require-production'];
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (typeof flag !== 'string' || !flag.startsWith('--') || flag.includes('=') || !required.includes(flag.slice(2)) || values.has(flag.slice(2))) {
      fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '参数未知、重复或格式错误。');
    }
    const key = flag.slice(2);
    if (key === 'require-production') { values.set(key, true); continue; }
    const value = argv[++index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '参数值缺失。');
    values.set(key, value);
  }
  if (values.size !== required.length || values.get('require-production') !== true) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '缺少必填参数或 production guard。');
  for (const key of ['source-root', 'handoff-root']) if (!isAbsolute(values.get(key))) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', `${key} 必须是绝对路径。`);
  if (values.get('base-source-commit') !== BASE_SOURCE_COMMIT || !/^[a-f0-9]{40}$/.test(values.get('source-commit'))) fail('CANVAS06_UNIFIED_BASE_INVALID', 'BASE_COMMIT_ANCESTRY', 'base 或统一 source commit 非法。');
  const source12 = values.get('source-commit').slice(0, 12);
  const expected = `releases/clean-${source12}`;
  const location = role === 'rebuild' ? values.get('out') : values.get('input');
  if (location !== expected) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '版本化输入根必须由 source commit 唯一派生。');
  return Object.freeze(Object.fromEntries(values));
}

export function sourceEpoch(commitEpoch) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(commitEpoch))) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 必须为规范非负十进制。');
  const seconds = Number(commitEpoch);
  if (!Number.isSafeInteger(seconds)) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 超出安全范围。');
  const value = new Date(seconds * 1000).toISOString().replace(/\.000Z$/, 'Z');
  if (Math.trunc(Date.parse(value) / 1000) !== seconds) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 无法 UTC 整秒往返。');
  return value;
}

export async function fileRef(root, path, kind, code = 'CANVAS06_UNIFIED_JOIN_MISMATCH') {
  const absolute = inside(root, path, code);
  const info = await regularFile(absolute, code);
  const bytes = await readFile(absolute);
  return Object.freeze({ kind, path, byte_length: info.size, sha256: sha256(bytes) });
}

export async function treeRef(root, path, kind = 'WEB_DIST_TREE', code = 'CANVAS06_UNIFIED_WEB_TREE_INVALID') {
  const absolute = inside(root, path, code);
  await directory(absolute, code);
  const entries = await treeEntries(absolute, code);
  if (entries.length === 0) fail(code, 'WEB_TREE', 'Web dist tree 不能为空。');
  const inventory = entries.map(({ path: entryPath, byte_length, sha256: digest }) => ({ path: entryPath, byte_length, sha256: digest }));
  return Object.freeze({ kind, path, byte_length: inventory.reduce((total, item) => total + item.byte_length, 0), sha256: sha256(Buffer.from(jcs(inventory), 'utf8')) });
}

export async function assertTreeRef(root, reference, code = 'CANVAS06_UNIFIED_WEB_TREE_INVALID') {
  if (reference?.kind !== 'WEB_DIST_TREE' || !safePath(reference.path)) fail(code, 'WEB_TREE', 'Web tree ref 非法。');
  const actual = await treeRef(root, reference.path, reference.kind, code);
  if (actual.byte_length !== reference.byte_length || actual.sha256 !== reference.sha256) fail(code, 'WEB_TREE', 'Web tree 摘要不匹配。');
  return actual;
}

export async function assertSourcePaths(sourceRoot) {
  for (const path of [SOURCE_PATHS.runtimeJar, SOURCE_PATHS.commonFactory, SOURCE_PATHS.commonGenerator, ...SOURCE_PATHS.profileAssets, ...SOURCE_PATHS.drivers.map(name => `${SOURCE_PATHS.driverRoot}/${name}`)]) {
    await regularFile(inside(sourceRoot, path, 'CANVAS06_UNIFIED_JOIN_MISMATCH'), 'CANVAS06_UNIFIED_JOIN_MISMATCH');
  }
  await directory(inside(sourceRoot, SOURCE_PATHS.webDist, 'CANVAS06_UNIFIED_WEB_TREE_INVALID'), 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
}

export function assertArtifactOrder(handoff, source12) {
  const expected = [
    ['LOCAL_RUNTIME_JAR', `releases/clean-${source12}/local-runtime-0.1.0-SNAPSHOT.jar`],
    ['EVIDENCE_BUNDLE', `releases/clean-${source12}/dev-canvas-05-evidence-bundle.jar`],
    ['WEB_DIST_TREE', `releases/clean-${source12}/web-dist`]
  ];
  if (!Array.isArray(handoff?.build_artifacts) || handoff.build_artifacts.length !== expected.length) fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', 'Handoff 必须有三个有序构建产物。');
  for (const [index, [kind, path]] of expected.entries()) {
    const actual = handoff.build_artifacts[index];
    if (actual?.kind !== kind || actual.path !== path || !Number.isSafeInteger(actual.byte_length) || actual.byte_length < 0 || !/^[a-f0-9]{64}$/.test(actual.sha256 ?? '')) {
      fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', 'Handoff 构建产物顺序或引用非法。');
    }
  }
}

export function sameRef(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function inside(root, path, code = 'CANVAS06_UNIFIED_ARGUMENT_INVALID') {
  if (!safePath(path)) fail(code, 'PATH', '路径必须为安全相对路径。');
  const output = resolve(root, path);
  const relation = relative(resolve(root), output);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) fail(code, 'PATH', '路径越过根目录。');
  return output;
}

export function safePath(path) { return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'); }

async function treeEntries(root, code) {
  const result = [];
  await visit(root, '');
  return result.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  async function visit(directoryPath, prefix) {
    for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = resolve(directoryPath, entry.name);
      const details = await lstat(target);
      if (details.isSymbolicLink() || !details.isDirectory() && (!details.isFile() || details.nlink !== 1)) fail(code, 'WEB_TREE', 'Tree 含链接或特殊文件。');
      if (details.isDirectory()) await visit(target, path);
      else {
        const bytes = await readFile(target);
        if (path.endsWith('.map') && /(?:^|["'])\/(?:Users|home)\//.test(bytes.toString('utf8'))) fail(code, 'WEB_TREE', 'source map 包含 checkout 绝对路径。');
        if (/vite\/client|@vite\/client/.test(bytes.toString('utf8'))) fail(code, 'WEB_TREE', 'Web tree 包含 Vite HMR client。');
        result.push({ path, byte_length: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
}

async function regularFile(path, code) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error('unsafe');
    return info;
  } catch { fail(code, 'SOURCE_PATHS', '必须是单链接普通文件。'); }
}

async function directory(path, code) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('unsafe');
  } catch { fail(code, 'SOURCE_PATHS', '必须是非链接目录。'); }
}
