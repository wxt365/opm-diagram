import { mkdir, lstat, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';
import { fsyncPath } from './canvas06-e2e-manifest-v01-support.mjs';

const COMMON_OPTIONS = [
  'input-mode', 'source-root', 'source-date-epoch', 'web-dist', 'runtime-jar',
  'common-fixture-root', 'common-fixture-catalog', 'driver-root', 'output-root', 'out'
];
const PRODUCTION_OPTIONS = ['handoff-root', 'intake-report'];
const CONTROLLED_OPTIONS = ['controlled-bundle-root'];

export function parseBuildOptions(argv) {
  const values = new Map();
  const allowed = new Set([...COMMON_OPTIONS, ...PRODUCTION_OPTIONS, ...CONTROLLED_OPTIONS]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || flag.includes('=') || !allowed.has(flag.slice(2)) || !value || value.startsWith('--') || values.has(flag.slice(2))) {
      fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Arguments must use each supported --flag <value> exactly once.');
    }
    values.set(flag.slice(2), value);
  }
  const mode = values.get('input-mode');
  if (!['CONTROLLED_TEST', 'PRODUCTION_HANDOFF'].includes(mode)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'input-mode must be CONTROLLED_TEST or PRODUCTION_HANDOFF.');
  for (const key of COMMON_OPTIONS) if (!values.has(key)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `Missing --${key}.`);
  const active = mode === 'CONTROLLED_TEST' ? CONTROLLED_OPTIONS : PRODUCTION_OPTIONS;
  const inactive = mode === 'CONTROLLED_TEST' ? PRODUCTION_OPTIONS : CONTROLLED_OPTIONS;
  for (const key of active) if (!values.has(key)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `Missing --${key}.`);
  for (const key of inactive) if (values.has(key)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', `--${key} is invalid for ${mode}.`);
  if (!/^\d+$/.test(values.get('source-date-epoch'))) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'source-date-epoch must be a non-negative decimal integer.');
  return Object.fromEntries(values);
}

export async function validateBuilderPaths(options) {
  const sourceRoot = await assertDirectory(options['source-root'], 'source-root');
  const outputRoot = await assertDirectoryOrCreate(options['output-root'], 'output-root');
  const commonRoot = await assertCommonFixtureRoot(options['common-fixture-root']);
  assertCommonRootIndependent(commonRoot, [sourceRoot, outputRoot]);
  const sourcePaths = {
    webDist: await assertDirectoryInside(sourceRoot, options['web-dist'], 'web-dist'),
    runtimeJar: await assertFileInside(sourceRoot, options['runtime-jar'], 'runtime-jar'),
    commonRoot,
    driverRoot: await assertDirectoryInside(sourceRoot, options['driver-root'], 'driver-root')
  };
  const catalog = await assertCommonCatalog(sourcePaths.commonRoot, options['common-fixture-catalog']);
  const drivers = await Promise.all([
    assertFileInside(sourcePaths.driverRoot, 'procedural-driver.mjs', 'procedural driver'),
    assertFileInside(sourcePaths.driverRoot, 'control-driver.mjs', 'control driver'),
    assertFileInside(sourcePaths.driverRoot, 'structural-driver.mjs', 'structural driver')
  ]);
  const manifestPath = resolveOutputRoot(outputRoot, options.out);
  return { sourceRoot, outputRoot, ...sourcePaths, catalog, drivers, manifestPath, finalRoot: dirname(manifestPath) };
}

export function assertCommonRootIndependent(commonRoot, roots) {
  for (const root of roots) {
    const resolved = resolve(root);
    if (resolve(commonRoot) === resolved || isInside(resolved, commonRoot) || isInside(commonRoot, resolved)) {
      fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'common-fixture-root must not overlap a source, output, or trust root.');
    }
  }
}

export async function ensureFinalParent({ outputRoot, finalRoot }) {
  const root = resolve(outputRoot);
  const parent = dirname(resolve(finalRoot));
  if (!isInside(root, parent) && root !== parent) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Final root parent escapes output-root.');
  const segments = relative(root, parent).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Final root parent contains an unsafe path entry.');
    } catch (error) {
      if (error instanceof E2eManifestInputError) throw error;
      await mkdir(current, { recursive: false });
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Final root parent contains an unsafe path entry.');
    }
  }
  return parent;
}

export async function commitFinalRoot({ finalRoot, outputRoot, write, checkpoint }) {
  const target = resolve(finalRoot);
  const parent = outputRoot
    ? await ensureFinalParent({ outputRoot, finalRoot: target })
    : await assertDirectory(dirname(target), 'final root parent');
  if (await exists(target)) fail('E2E_MANIFEST_OUTPUT_NOT_FRESH', 'Final manifest root already exists.');
  const temporary = resolve(parent, `.${basename(target)}.tmp-${randomBytes(16).toString('hex')}`);
  try {
    await mkdir(temporary, { recursive: false });
    await checkpoint?.('STAGING_CREATED');
    await write(temporary);
    await checkpoint?.('STAGING_WRITTEN');
    if (await exists(target)) fail('E2E_MANIFEST_OUTPUT_NOT_FRESH', 'Final manifest root appeared during staging.');
    await checkpoint?.('BEFORE_RENAME');
    await rename(temporary, target);
    try { await fsyncPath(parent); }
    catch (error) {
      const failure = new E2eManifestInputError('E2E_MANIFEST_ATOMIC_COMMIT_FAILED', error.message);
      failure.exitCode = 4;
      throw failure;
    }
    return target;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (error instanceof E2eManifestInputError) throw error;
    fail('E2E_MANIFEST_ATOMIC_COMMIT_FAILED', error.message);
  }
}

function resolveOutputRoot(outputRoot, output) {
  if (!isSafeRelativePath(output)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'out must be a safe output-root relative path.');
  const result = resolve(outputRoot, output);
  if (!isInside(outputRoot, result)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'out escapes output-root.');
  return result;
}

async function assertDirectoryOrCreate(path, label) {
  const resolved = resolve(path);
  try {
    return await assertDirectory(resolved, label);
  } catch (error) {
    if (error instanceof E2eManifestInputError && error.message.includes('is missing')) {
      await mkdir(resolved, { recursive: true });
      return assertDirectory(resolved, label);
    }
    throw error;
  }
}

async function assertDirectoryInside(root, path, label) {
  return assertDirectory(resolveInside(root, path, label), label);
}

async function assertCommonFixtureRoot(path) {
  const resolved = resolve(path);
  let info;
  try { info = await lstat(resolved); } catch { fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'common-fixture-root is missing.'); }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'common-fixture-root must be a non-symlink directory.');
  }
  return resolved;
}

async function assertCommonCatalog(root, path) {
  const result = resolveInside(root, path, 'common-fixture-catalog');
  let info;
  try { info = await lstat(result); } catch { fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'common-fixture-catalog is missing.'); }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'common-fixture-catalog must be a non-linked regular file.');
  }
  return result;
}

async function assertFileInside(root, path, label) {
  const result = resolveInside(root, path, label);
  const info = await lstatOrFail(result, label);
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', `${label} must be a non-linked regular file.`);
  return result;
}

async function assertDirectory(path, label) {
  const resolved = resolve(path);
  const info = await lstatOrFail(resolved, label);
  if (info.isSymbolicLink() || !info.isDirectory()) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', `${label} must be a non-symlink directory.`);
  return resolved;
}

async function lstatOrFail(path, label) {
  try {
    return await lstat(path);
  } catch {
    fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', `${label} is missing.`);
  }
}

function resolveInside(root, value, label) {
  if (!isSafeRelativePath(value)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `${label} must be a safe relative path.`);
  const resolved = resolve(root, value);
  if (!isInside(root, resolved)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `${label} escapes its root.`);
  return resolved;
}

function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');
}

function isInside(root, child) {
  const relation = relative(resolve(root), resolve(child));
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function fail(code, message) {
  throw new E2eManifestInputError(code, message);
}
