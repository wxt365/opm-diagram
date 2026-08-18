import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { verifyCommonFixtureInput } from './canvas06-e2e-common-fixtures.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain } from './canvas06-e2e-manifest-v01-trust.mjs';
import { assertDirectory, assertRegularFile, readJson, resolveInside } from './canvas06-e2e-manifest-v01-support.mjs';
import { main as verifyManifest } from './verify-canvas06-e2e-manifest-v01.mjs';

const execFile = promisify(execFileCallback);
const CHROMIUM_VERSION = '143.0.7499.4';

export async function preflightE2eRun(options, dependencies = {}) {
  const manifestRoot = resolve(options['manifest-root']);
  await assertDirectory(manifestRoot, 'E2E_RUN_MANIFEST_INVALID');
  if (basename(manifestRoot).startsWith('.')) fail('E2E_RUN_MANIFEST_INVALID', 'Manifest root cannot be staging.');

  const verifier = dependencies.verifyManifest ?? verifyManifest;
  await verifier(manifestVerifierArgs(options), dependencies.manifestDependencies ?? {});
  const manifest = await readJson(resolveInside(manifestRoot, options.manifest, 'E2E_RUN_MANIFEST_INVALID'), 'E2E_RUN_MANIFEST_INVALID');
  const trust = await loadTrust(options, dependencies);
  const common = await verifyManifestCommonFixtureInput({
    manifestRoot,
    manifest,
    activeBinding: trust.handoff.value.active_binding,
    verify: dependencies.verifyCommonFixtureInput ?? verifyCommonFixtureInput
  });
  const source = await inspectSource({ sourceRoot: options['source-root'], expectedCommit: manifest.source_build.source_commit, exec: dependencies.exec });
  const runtime = await inspectRuntime({ javaHome: options['java-home'], browserExecutable: options['browser-executable'], exec: dependencies.exec });
  const capabilities = assertCapabilityClosure(trust.handoff.value.capability_evidence);
  await (dependencies.assertPorts ?? assertPortsFree)([Number(options['runtime-port']), Number(options['web-port'])]);
  return Object.freeze({ manifest, trust, common, source, runtime, capabilities });
}

export async function verifyManifestCommonFixtureInput({ manifestRoot, manifest, activeBinding, verify = verifyCommonFixtureInput }) {
  const reference = manifest?.common_fixture_catalog_ref;
  if (!reference || reference.kind !== 'COMMON_FIXTURE_CATALOG' || typeof reference.path !== 'string') {
    fail('E2E_RUN_MANIFEST_INVALID', 'Manifest Common Fixture Catalog reference is invalid.');
  }
  const commonRoot = resolveInside(manifestRoot, 'inputs/common', 'E2E_RUN_MANIFEST_INVALID');
  await assertDirectory(commonRoot, 'E2E_RUN_MANIFEST_INVALID');
  const catalog = resolveInside(manifestRoot, reference.path, 'E2E_RUN_MANIFEST_INVALID');
  const catalogPath = relative(commonRoot, catalog).split('\\').join('/');
  if (!safeRelativePath(catalogPath)) fail('E2E_RUN_MANIFEST_INVALID', 'Manifest Common Fixture Catalog is outside inputs/common.');
  try {
    return await verify({ commonRoot, catalogPath, activeBinding });
  } catch (error) {
    if (error instanceof E2eRunInputError) throw error;
    throw new E2eRunInputError('E2E_RUN_MANIFEST_INVALID', 'Manifest Common Fixture input verification failed.', 2);
  }
}

export async function inspectSource({ sourceRoot, expectedCommit, exec = execFile }) {
  const root = resolve(sourceRoot);
  await assertDirectory(root, 'E2E_RUN_SOURCE_INVALID');
  const head = (await command(exec, 'git', ['-C', root, 'rev-parse', 'HEAD'], 'E2E_RUN_SOURCE_INVALID')).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || head !== expectedCommit) fail('E2E_RUN_SOURCE_INVALID', 'Source HEAD differs from the Manifest target commit.');
  const dirty = await command(exec, 'git', ['-C', root, 'status', '--porcelain'], 'E2E_RUN_SOURCE_INVALID');
  if (dirty.trim()) fail('E2E_RUN_SOURCE_INVALID', 'Source root must be clean.');
  return Object.freeze({ root, source_commit: head });
}

export async function inspectRuntime({ javaHome, browserExecutable, exec = execFile }) {
  const java = resolve(javaHome, 'bin/java');
  await assertRegularFile(java, 'E2E_RUN_ENVIRONMENT_INVALID');
  const javaVersion = `${(await command(exec, java, ['-version'], 'E2E_RUN_ENVIRONMENT_INVALID')).trim()}`;
  if (!/(?:version\s+\"21(?:[.\"]|$)|\b21\.0\.)/.test(javaVersion)) fail('E2E_RUN_ENVIRONMENT_INVALID', 'Java 21 is required.');

  const browser = resolve(browserExecutable);
  const details = await assertRegularFile(browser, 'E2E_RUN_ENVIRONMENT_INVALID');
  if ((details.mode & 0o111) === 0) fail('E2E_RUN_ENVIRONMENT_INVALID', 'Browser executable is not executable.');
  const browserVersion = (await command(exec, browser, ['--version'], 'E2E_RUN_ENVIRONMENT_INVALID')).trim();
  if (!browserVersion.includes(CHROMIUM_VERSION)) fail('E2E_RUN_ENVIRONMENT_INVALID', 'Chromium version differs from the frozen version.');
  const browserSha256 = createHash('sha256').update(await readFile(browser)).digest('hex');
  return Object.freeze({ java_path: java, java_version: javaVersion, browser_path: browser, browser_version: browserVersion, browser_sha256: browserSha256 });
}

export function assertCapabilityClosure(entries) {
  if (!Array.isArray(entries) || entries.length !== 34) fail('E2E_RUN_CAPABILITY_CLOSURE_INVALID', 'Handoff must contain exactly 34 capability evidence entries.');
  const expected = [['PROC', 'PROCEDURAL', 16], ['CTRL', 'CONTROL', 8], ['STRUCT', 'STRUCTURAL', 10]];
  const seen = new Set();
  const result = entries.map(entry => {
    const matched = expected.find(([prefix]) => entry?.capability_id?.startsWith(`CAP-ISO-${prefix}-`));
    if (!matched || seen.has(entry.capability_id) || entry.family !== matched[0] || entry.eligibility !== 'ELIGIBLE_FOR_RELEASE_VALIDATION'
      || !Array.isArray(entry.coverage_keys) || entry.coverage_keys.length === 0 || new Set(entry.coverage_keys).size !== entry.coverage_keys.length) {
      fail('E2E_RUN_CAPABILITY_CLOSURE_INVALID', 'Capability evidence is not an eligible unique closure.');
    }
    seen.add(entry.capability_id);
    return Object.freeze({
      capability_id: entry.capability_id,
      family: matched[1],
      // Report 聚合器使用此字段与 Manifest family case 做一一闭合。
      covered_coverage_keys: Object.freeze([...entry.coverage_keys])
    });
  });
  for (const [prefix, , count] of expected) if (result.filter(item => item.capability_id.startsWith(`CAP-ISO-${prefix}-`)).length !== count) fail('E2E_RUN_CAPABILITY_CLOSURE_INVALID', 'Capability family count differs from the frozen closure.');
  return Object.freeze(result);
}

function manifestVerifierArgs(options) {
  const args = ['--input-mode', options['input-mode']];
  if (options['input-mode'] === 'PRODUCTION_HANDOFF') args.push('--handoff-root', options['handoff-root'], '--intake-report', options['intake-report']);
  else args.push('--controlled-bundle-root', options['controlled-bundle-root']);
  args.push('--manifest-root', options['manifest-root'], '--manifest', options.manifest);
  if (options['input-mode'] === 'PRODUCTION_HANDOFF') args.push('--require-production');
  return args;
}

async function loadTrust(options, dependencies) {
  if (options['input-mode'] === 'CONTROLLED_TEST') return (dependencies.loadControlledTrust ?? loadControlledReadyTrustChain)({ bundleRoot: options['controlled-bundle-root'] });
  const root = resolve(options['handoff-root']);
  const intake = await readJson(resolveInside(root, options['intake-report'], 'E2E_RUN_INPUT_CLASS_INVALID'), 'E2E_RUN_INPUT_CLASS_INVALID');
  return (dependencies.loadProductionTrust ?? loadReadyTrustChain)({ root, intakePath: options['intake-report'], handoffPath: intake.handoff_ref?.path });
}

async function assertPortsFree(ports) {
  for (const port of ports) await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', () => reject(new E2eRunInputError('E2E_RUN_PORT_LOCKED', 'A required loopback port is already in use.', 3)));
    server.listen({ host: '127.0.0.1', port }, () => server.close(error => error ? reject(error) : resolvePort()));
  });
}

async function command(exec, file, args, code) {
  try {
    const result = await exec(file, args, { encoding: 'utf8' });
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  } catch (error) {
    fail(code, `Required command failed: ${file}.`);
  }
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}
