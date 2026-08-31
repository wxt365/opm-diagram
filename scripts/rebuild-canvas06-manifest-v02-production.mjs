import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { readFileSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { assertExactQuarantineGuard, assertSourceClean, jcs, openExternalPaths, sha256, sourceChainArgs } from './canvas06-unified-production-input.mjs';

class OrchestratorError extends Error {
  constructor(code, stage, message) {
    super(message); this.name = 'OrchestratorError'; this.code = code; this.stage = stage;
    this.exitCode = ['CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_INVALID', 'CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_DIRTY', 'CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID'].includes(code) ? 2 : ['CANVAS06_MANIFEST_ORCHESTRATOR_INPUT_FAILED', 'CANVAS06_MANIFEST_ORCHESTRATOR_PRODUCER_FAILED', 'CANVAS06_MANIFEST_ORCHESTRATOR_STAGING_VERIFY_FAILED', 'CANVAS06_MANIFEST_ORCHESTRATOR_INSTALLED_VERIFY_FAILED'].includes(code) ? 3 : 4;
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) runCli();

async function runCli() {
  try {
    const result = await rebuild(parseOptions(process.argv.slice(2)));
    process.stdout.write(`${result.manifestRoot}\t${result.manifestSha256}\t${result.treeSha256}\n`);
  } catch (error) {
    const value = normalize(error);
    process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
    process.exitCode = value.exitCode;
  }
}

export async function rebuild(options, dependencies = {}) {
  const unified = await externalPaths({ ...options, 'input-mode': 'EXTERNAL_RELEASE_STORE' });
  sourceClean(unified.sourceRoot, options);
  try { await assertExactQuarantineGuard(unified); }
  catch (error) { fail('CANVAS06_MANIFEST_ORCHESTRATOR_INPUT_FAILED', error.stage || 'EXACT_QUARANTINE_GUARD', error.message); }
  await absent(unified.versionedInputRoot, 'CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID', 'INPUT_FINAL');
  await absent(unified.stagingRoot, 'CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID', 'INPUT_STAGING');
  const sourceDateEpoch = git(unified.sourceRoot, ['show', '-s', '--format=%ct', options['source-commit']]).trim();
  const source12 = unified.source12;
  const builder = await child(unified.sourceRoot, 'rebuild-canvas06-unified-production-inputs.mjs');
  const unifiedResult = invoke(unified.sourceRoot, builder, ['--input-mode', 'EXTERNAL_RELEASE_STORE', '--source-root', unified.sourceRoot, '--release-store-root', unified.releaseStoreRoot, ...sourceChainArgs(options), '--source-commit', options['source-commit'], '--require-production'], dependencies);
  assertChildStable(builder);
  if (unifiedResult.status !== 0) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INPUT_FAILED', 'RUN_UNIFIED_BUILDER_EXTERNAL_MODE', unifiedResult.stderr || unifiedResult.stdout || 'Unified Builder 失败。');
  const unifiedTriple = parseUnifiedTriple(unifiedResult.stdout, unified, options['source-commit']);
  sourceClean(unified.sourceRoot, options);
  const intakeBytes = await readSingle(resolve(unified.versionedInputRoot, 'dev-canvas-06-intake-report.json'));
  const intake12 = sha256(intakeBytes).slice(0, 12);
  const manifestId = `dev-canvas-06.e2e.${source12}.${intake12}`;
  const releaseId = `clean-${source12}-${intake12}`;
  const outerStaging = resolve(unified.manifestReleaseParent, `.${releaseId}.staging`);
  const releaseRoot = resolve(unified.manifestReleaseParent, releaseId);
  const finalRelative = `dev-canvas-06/e2e/manifests/${manifestId}`;
  const stagingManifestRoot = resolve(outerStaging, finalRelative);
  const installedManifestRoot = resolve(releaseRoot, finalRelative);
  const profileStagingRoot = resolve(unified.profileStagingParent, releaseId);
  await assertManifestPaths(unified, outerStaging, releaseRoot, profileStagingRoot);
  await mkdir(unified.manifestReleaseParent, { recursive: true });
  await mkdir(unified.profileStagingParent, { recursive: true });
  const ownership = await createOwnedStaging(outerStaging);
  let renamed = false;
  try {
    const producer = await child(unified.sourceRoot, 'release-canvas06-e2e-manifest-v02.mjs');
    const produced = invoke(unified.sourceRoot, producer, ['--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', unified.handoffRoot, '--intake-report', `${unified.inputRelative}/dev-canvas-06-intake-report.json`, '--source-root', unified.sourceRoot, '--source-date-epoch', sourceDateEpoch, '--common-fixture-root', resolve(unified.versionedInputRoot, 'dev-canvas-06/common-fixtures/0.2.0'), '--profile-asset-root', profileStagingRoot, '--output-root', outerStaging, '--out', `${finalRelative}/dev-canvas-06-e2e-manifest.json`, '--require-production'], dependencies);
    assertChildStable(producer);
    if (produced.status !== 0) fail('CANVAS06_MANIFEST_ORCHESTRATOR_PRODUCER_FAILED', 'RUN_MANIFEST_PRODUCER_IN_OUTER_STAGING', produced.stderr || produced.stdout || 'Manifest Producer 失败。');
    if (!/^([^\t\n]+)\t[a-f0-9]{64}\n$/.test(produced.stdout)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_PRODUCER_FAILED', 'PRODUCER_STDOUT', 'Manifest Producer stdout 非冻结格式。');
    await absent(profileStagingRoot, 'CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'PROFILE_STAGING_RESIDUAL');
    const stagingBefore = await transactionDigest(outerStaging);
    const stagingVerifier = await child(unified.sourceRoot, 'verify-canvas06-e2e-manifest-v02.mjs');
    const stagingResult = invoke(unified.sourceRoot, stagingVerifier, manifestVerifierArgs(unified, stagingManifestRoot), dependencies);
    assertChildStable(stagingVerifier);
    if (stagingResult.status !== 0) fail('CANVAS06_MANIFEST_ORCHESTRATOR_STAGING_VERIFY_FAILED', 'SPAWN_MANIFEST_STAGING_VERIFIER', stagingResult.stderr || stagingResult.stdout || 'staging Manifest Verifier 失败。');
    if (!/^([^\t\n]+)\t[a-f0-9]{64}\n$/.test(stagingResult.stdout)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_STAGING_VERIFY_FAILED', 'STAGING_VERIFIER_STDOUT', 'staging Verifier stdout 非冻结格式。');
    const stagingAfter = await transactionDigest(outerStaging);
    if (stagingBefore !== stagingAfter) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'STAGING_TREE_DRIFT', 'staging verifier 改变了 transaction tree。');
    sourceClean(unified.sourceRoot, options);
    await fsyncTree(outerStaging);
    await rename(outerStaging, releaseRoot);
    renamed = true;
    await fsyncDirectory(unified.manifestReleaseParent);
    const installedBefore = await transactionDigest(releaseRoot);
    const installedVerifier = await child(unified.sourceRoot, 'verify-canvas06-e2e-manifest-v02.mjs');
    const installedResult = invoke(unified.sourceRoot, installedVerifier, manifestVerifierArgs(unified, installedManifestRoot), dependencies);
    assertChildStable(installedVerifier);
    if (stagingResult.pid === installedResult.pid || installedResult.status !== 0) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INSTALLED_VERIFY_FAILED', 'SPAWN_MANIFEST_INSTALLED_VERIFIER', installedResult.stderr || installedResult.stdout || 'installed Manifest Verifier 失败。');
    if (!/^([^\t\n]+)\t[a-f0-9]{64}\n$/.test(installedResult.stdout)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INSTALLED_VERIFY_FAILED', 'INSTALLED_VERIFIER_STDOUT', 'installed Verifier stdout 非冻结格式。');
    const installedAfter = await transactionDigest(releaseRoot);
    if (stagingAfter !== installedBefore || installedBefore !== installedAfter) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'INSTALLED_TREE_DRIFT', 'rename 或 installed verifier 改变了 transaction tree。');
    sourceClean(unified.sourceRoot, options);
    const manifestSha256 = sha256(await readSingle(resolve(installedManifestRoot, 'dev-canvas-06-e2e-manifest.json')));
    return Object.freeze({ manifestRoot: installedManifestRoot, manifestSha256, treeSha256: installedAfter, unifiedTriple });
  } catch (error) {
    if (!renamed) await removeOwnedStaging(outerStaging, ownership);
    throw error;
  }
}

export function parseOptions(argv) {
  const common = ['source-root', 'release-store-root', 'source-chain-target', 'origin-source-commit', 'fault-contract-source-commit', 'schema-conformance-source-commit', 'fault-2a-source-commit', 'source-commit', 'require-production'];
  const all = [...common, 'runner-source-commit'];
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || flag.includes('=') || !all.includes(flag.slice(2)) || values.has(flag.slice(2))) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'ARGS', '参数未知、重复或格式错误。');
    const key = flag.slice(2);
    if (key === 'require-production') { values.set(key, true); continue; }
    const value = argv[++index];
    if (!value || value.startsWith('--')) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'ARGS', '参数值缺失。');
    values.set(key, value);
  }
  const target = values.get('source-chain-target');
  const expectedCount = target === 'FINAL_RUNNER' ? common.length + 1 : target === 'FAULT_2A' ? common.length : -1;
  if (values.size !== expectedCount || values.get('require-production') !== true || [...values.entries()].some(([key, value]) => key.endsWith('-commit') && !/^[a-f0-9]{40}$/.test(value))) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'ARGS', '缺少 production guard 或提交身份无效。');
  if ((target === 'FAULT_2A' && values.get('source-commit') !== values.get('fault-2a-source-commit')) || (target === 'FINAL_RUNNER' && values.get('source-commit') !== values.get('runner-source-commit'))) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'ARGS', 'source-commit 必须等于 target HEAD。');
  for (const key of ['source-root', 'release-store-root']) if (!isAbsolute(values.get(key))) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID', 'ARGS', `${key} 必须是绝对路径。`);
  return Object.freeze(Object.fromEntries(values));
}

async function externalPaths(options) { try { return await openExternalPaths(options); } catch (error) { fail('CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID', error.stage || 'ROOT_TOPOLOGY', error.message); } }
function sourceClean(root, options) { try { assertSourceClean(root, options); } catch (error) { fail(error.code === 'CANVAS06_UNIFIED_BASE_INVALID' ? 'CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_INVALID' : 'CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_DIRTY', error.stage || 'SOURCE_CLEAN_HEAD', error.message); } }
async function assertManifestPaths(paths, staging, final, profileStaging) { for (const path of [staging, final, profileStaging]) await absent(path, 'CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID', 'MANIFEST_TARGET'); if (!nested(staging, paths.manifestReleaseParent) || !nested(final, paths.manifestReleaseParent) || !nested(profileStaging, paths.profileStagingParent)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID', 'MANIFEST_PATHS', 'Manifest 路径必须由 external store 唯一派生。'); }
async function createOwnedStaging(path) { await mkdir(path); const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'OUTER_STAGING_CREATE', 'outer staging 必须是普通目录。'); return Object.freeze({ dev: info.dev, ino: info.ino }); }
async function removeOwnedStaging(path, identity) { try { const info = await lstat(path); if (info.isDirectory() && !info.isSymbolicLink() && info.dev === identity.dev && info.ino === identity.ino) { await rm(path, { recursive: true, force: false }); await fsyncDirectory(dirname(path)); } } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
function manifestVerifierArgs(paths, manifestRoot) { return ['--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', paths.handoffRoot, '--intake-report', `${paths.inputRelative}/dev-canvas-06-intake-report.json`, '--source-root', paths.sourceRoot, '--manifest-root', manifestRoot, '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', resolve(manifestRoot, 'inputs/upstream/profile-assets'), '--require-production']; }
async function child(root, name) { const path = resolve(root, 'scripts', name); const before = await lstat(path); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail('CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_INVALID', 'CHILD_ENTRYPOINT', '子入口必须是单链接普通文件。'); return Object.freeze({ path, sha256: sha256(await readFile(path)) }); }
function assertChildStable(entry) { const after = createHash('sha256').update(readFileSync(entry.path)).digest('hex'); if (after !== entry.sha256) fail('CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_DIRTY', 'CHILD_ENTRYPOINT_HASH', '子入口 raw bytes 发生变化。'); }
function invoke(cwd, entry, args, dependencies) { const result = (dependencies.spawnSync ?? spawnSync)(process.execPath, [entry.path, ...args], { cwd, encoding: 'utf8', env: controlledEnv() }); return result; }
function controlledEnv() {
  if (!process.versions.node.startsWith('22.')) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INTERNAL_FAILED', 'NODE_22', 'production 要求 Node 22.x。');
  if (!process.env.JAVA_HOME || !isAbsolute(process.env.JAVA_HOME)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INTERNAL_FAILED', 'JAVA_HOME', 'production 要求受控绝对 JAVA_HOME。');
  const javaHome = resolve(process.env.JAVA_HOME);
  const version = spawnSync(resolve(javaHome, 'bin/java'), ['-version'], { encoding: 'utf8' });
  if (version.status !== 0 || !/version\s+"21(?:[.\"])/.test(`${version.stdout}${version.stderr}`)) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INTERNAL_FAILED', 'JAVA_21', 'production 要求 JDK 21。');
  return { ...process.env, JAVA_HOME: javaHome };
}
function parseUnifiedTriple(stdout, paths, commit) { const match = /^([^\t\n]+)\t([a-f0-9]{40})\t([a-f0-9]{64})\n$/.exec(stdout); if (!match || match[1] !== paths.versionedInputRoot || match[2] !== commit) fail('CANVAS06_MANIFEST_ORCHESTRATOR_INPUT_FAILED', 'UNIFIED_STDOUT', 'Unified Builder stdout 不符合冻结三元组。'); return Object.freeze({ path: match[1], commit: match[2], treeSha256: match[3] }); }
async function transactionDigest(root) { const entries = []; await visit(root, ''); if (entries.length === 0) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'TRANSACTION_TREE', 'transaction tree 不能为空。'); entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))); return sha256(Buffer.from(jcs(entries), 'utf8')); async function visit(directory, prefix) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = prefix ? `${prefix}/${entry.name}` : entry.name; const target = resolve(directory, entry.name); const info = await lstat(target); if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'TRANSACTION_TREE', 'transaction tree 含不安全 entry。'); if (info.isDirectory()) await visit(target, path); else { const bytes = await readFile(target); entries.push({ path, byte_length: bytes.length, sha256: sha256(bytes) }); } } } }
async function fsyncTree(root) { for (const entry of await readdir(root, { withFileTypes: true })) { const target = resolve(root, entry.name); if (entry.isDirectory()) await fsyncTree(target); else if (entry.isFile()) await fsyncFile(target); else fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'FSYNC_TREE', 'tree 含特殊 entry。'); } await fsyncDirectory(root); }
async function fsyncFile(path) { const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
async function fsyncDirectory(path) { const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
async function readSingle(path) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED', 'RAW_FILE', '必须是单链接普通文件。'); return readFile(path); }
async function absent(path, code, stage) { try { await lstat(path); fail(code, stage, '目标路径已存在。'); } catch (error) { if (error instanceof OrchestratorError) throw error; if (error?.code !== 'ENOENT') fail(code, stage, error.message); } }
function nested(candidate, root) { const relation = relative(root, candidate); return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)); }
function git(cwd, args) { return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).stdout; }
function fail(code, stage, message) { throw new OrchestratorError(code, stage, message); }
function normalize(error) { return error instanceof OrchestratorError ? error : new OrchestratorError('CANVAS06_MANIFEST_ORCHESTRATOR_INTERNAL_FAILED', 'INTERNAL', error.message); }
