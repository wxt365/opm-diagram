import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { UnifiedInputError, assertExactQuarantineGuard, assertSourceClean, assertTargetAbsent, fail, openExternalPaths, parseOptions, sourceChainArgs, syncPath, treeRef, writeQuarantineMarker } from './canvas06-unified-production-input.mjs';

if (import.meta.url === new URL(process.argv[1], 'file:').href) runCli();

async function runCli() {
  try {
    const result = await rebuild(parseOptions(process.argv.slice(2)));
    process.stdout.write(`${result.path}\t${result.sourceCommit}\t${result.treeSha256}\n`);
  } catch (error) {
    const value = normalize(error);
    process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
    process.exitCode = value.exitCode;
  }
}

export async function rebuild(options, dependencies = {}) {
  const paths = await openExternalPaths(options);
  await assertExactQuarantineGuard(paths);
  await assertTargetAbsent(paths);
  assertSourceClean(paths.sourceRoot, options);
  if (!process.versions.node.startsWith('22.')) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'NODE_22', 'production 重建要求 Node 22.x。');
  for (const path of ['node_modules', 'apps/web/dist', 'services/local-runtime/target']) await absent(resolve(paths.sourceRoot, path), 'ABSENT_IGNORED_OUTPUTS');
  let renamed = false;
  try {
    await mkdir(dirname(paths.stagingRoot), { recursive: true });
    run(paths.sourceRoot, 'npm', ['ci', '--ignore-scripts'], dependencies);
    runBootstrapClosure(paths.sourceRoot, 'SOURCE', dependencies);
    run(paths.sourceRoot, 'npm', ['run', 'build'], dependencies);
    runBootstrapClosure(paths.sourceRoot, 'POST', dependencies);
    run(paths.sourceRoot, process.execPath, [resolve(paths.sourceRoot, 'scripts/build-dev-canvas-05-release.mjs'), '--release-root', paths.stagingRoot, '--logical-release-root', paths.inputRelative], dependencies);
    run(paths.sourceRoot, process.execPath, [resolve(paths.sourceRoot, 'scripts/generate-dev-canvas-05-handoff.mjs'), '--output', resolve(paths.stagingRoot, 'dev-canvas-05-handoff.json'), '--release-build', resolve(paths.stagingRoot, 'dev-canvas-05-release-build.json'), '--report-root', resolve(paths.stagingRoot, 'handoff/reports'), '--logical-root', paths.inputRelative], dependencies);
    assertSourceClean(paths.sourceRoot, options);
    await rename(paths.stagingRoot, paths.versionedInputRoot);
    renamed = true;
    await syncPath(paths.releasesRoot);
    run(paths.sourceRoot, process.execPath, [resolve(paths.sourceRoot, 'scripts/release-canvas06-intake.mjs'), '--handoff-root', paths.handoffRoot, '--handoff', `${paths.inputRelative}/dev-canvas-05-handoff.json`, '--handoff-sha256', sha(resolve(paths.versionedInputRoot, 'dev-canvas-05-handoff.json')), '--out', resolve(paths.versionedInputRoot, 'dev-canvas-06-intake-report.json'), '--require-production'], dependencies);
    run(paths.sourceRoot, process.execPath, [resolve(paths.sourceRoot, 'scripts/build-canvas06-common-visual-fixtures.mjs'), '--handoff', resolve(paths.versionedInputRoot, 'dev-canvas-05-handoff.json'), '--fixture-root', resolve(paths.versionedInputRoot, 'dev-canvas-06/common-fixtures/0.2.0'), '--source-date-epoch', commitEpoch(paths.sourceRoot, options['source-commit'])], dependencies);
    const triple = await installedVerifier(paths, options, dependencies);
    assertSourceClean(paths.sourceRoot, options);
    return Object.freeze({ path: paths.versionedInputRoot, sourceCommit: options['source-commit'], treeSha256: triple.treeSha256 });
  } catch (error) {
    if (!renamed) await rm(paths.stagingRoot, { recursive: true, force: true });
    else await quarantine(paths, options, error);
    throw error;
  }
}

async function installedVerifier(paths, options, dependencies) {
  const args = [resolve(paths.sourceRoot, 'scripts/verify-canvas06-unified-production-inputs.mjs'), '--input-mode', 'EXTERNAL_RELEASE_STORE', '--source-root', paths.sourceRoot, '--release-store-root', paths.releaseStoreRoot, ...sourceChainArgs(options), '--source-commit', options['source-commit'], '--require-production'];
  const result = runResult(paths.sourceRoot, process.execPath, args, dependencies);
  if (result.status !== 0) fail('CANVAS06_UNIFIED_JOIN_MISMATCH', 'SPAWN_INDEPENDENT_INSTALLED_VERIFIER', result.stderr || result.stdout || '独立 Unified Verifier 失败。');
  return parseTriple(result.stdout, paths, options['source-commit']);
}

async function quarantine(paths, options, error) {
  try {
    const digest = await treeRef(paths.handoffRoot, paths.inputRelative, 'INPUT_TREE', 'CANVAS06_UNIFIED_JOIN_MISMATCH');
    await writeQuarantineMarker({ paths, sourceCommit: options['source-commit'], treeSha256: digest.sha256, failureCode: classify(error), failureStage: error?.stage === 'FSYNC_RELEASES_PARENT' ? 'FSYNC_RELEASES_PARENT' : 'INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON' });
  } catch (markerError) { throw normalize(markerError); }
}

function run(cwd, file, args, dependencies) {
  const result = runResult(cwd, file, args, dependencies);
  if (result.status !== 0) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'BUILD', `${file} 失败：${result.stderr || result.stdout || ''}`);
}

function runResult(cwd, file, args, dependencies) { return (dependencies.spawnSync ?? spawnSync)(file, args, { cwd, encoding: 'utf8', env: controlledEnv() }); }
function runBootstrapClosure(cwd, phase, dependencies) { run(cwd, process.execPath, [resolve(cwd, 'scripts/verify-opm-bootstrap-build-closure.mjs'), '--phase', phase], dependencies); }
function controlledEnv() {
  if (!process.env.JAVA_HOME || !resolve(process.env.JAVA_HOME).startsWith('/')) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'JAVA_HOME', 'production 重建要求受控绝对 JAVA_HOME。');
  const javaHome = resolve(process.env.JAVA_HOME);
  const version = spawnSync(resolve(javaHome, 'bin/java'), ['-version'], { encoding: 'utf8' });
  if (version.status !== 0 || !/version\s+"21(?:[.\"])/.test(`${version.stdout}${version.stderr}`)) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'JAVA_21', 'production 重建要求 JDK 21。');
  return { ...process.env, JAVA_HOME: javaHome };
}
async function absent(path, stage) { try { await lstat(path); fail('CANVAS06_UNIFIED_SOURCE_DIRTY', stage, '构建前派生产物必须不存在。'); } catch (error) { if (error instanceof UnifiedInputError) throw error; if (error?.code !== 'ENOENT') throw error; } }
function parseTriple(stdout, paths, sourceCommit) { const match = /^([^\t\n]+)\t([a-f0-9]{40})\t([a-f0-9]{64})\n$/.exec(stdout); if (!match || match[1] !== paths.versionedInputRoot || match[2] !== sourceCommit) fail('CANVAS06_UNIFIED_JOIN_MISMATCH', 'VERIFIER_STDOUT', 'Unified Verifier stdout 不符合冻结三元组。'); return { path: match[1], sourceCommit: match[2], treeSha256: match[3] }; }
function commitEpoch(cwd, commit) { return execFileSync('git', ['-C', cwd, 'show', '-s', '--format=%ct', commit], { encoding: 'utf8' }).trim(); }
function sha(path) { return execFileSync('shasum', ['-a', '256', path], { encoding: 'utf8' }).trim().split(/\s+/)[0]; }
function classify(error) { return ['CANVAS06_UNIFIED_HANDOFF_INVALID', 'CANVAS06_UNIFIED_INTAKE_INVALID', 'CANVAS06_UNIFIED_WEB_TREE_INVALID', 'CANVAS06_UNIFIED_COMMON_INVALID', 'CANVAS06_UNIFIED_JOIN_MISMATCH'].includes(error?.code) ? error.code : 'CANVAS06_UNIFIED_TRANSACTION_FAILED'; }
function normalize(error) { return error instanceof UnifiedInputError ? error : new UnifiedInputError('CANVAS06_UNIFIED_BUILD_FAILED', 'BUILD', error.message); }
