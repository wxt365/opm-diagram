import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { UnifiedInputError, assertSourcePaths, fail, parseOptions, treeRef } from './canvas06-unified-production-input.mjs';

const root = resolve('.');

try {
  const options = parseOptions(process.argv.slice(2), 'rebuild');
  await rebuild(options);
} catch (error) {
  const value = error instanceof UnifiedInputError ? error : new UnifiedInputError('CANVAS06_UNIFIED_BUILD_FAILED', 'BUILD', error.message);
  process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
  process.exitCode = value.exitCode;
}

async function rebuild(options) {
  const sourceRoot = options['source-root'];
  const handoffRoot = options['handoff-root'];
  const finalRoot = resolve(handoffRoot, options.out);
  const stagingRoot = resolve(handoffRoot, `.staging-${basename(options.out)}-${process.pid}`);
  if (!process.versions.node.startsWith('22.')) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'NPM_CI', 'production 重建要求 Node 22.x。');
  assertSource(sourceRoot, options);
  await absent(finalRoot, 'CANVAS06_UNIFIED_TRANSACTION_FAILED', 'FINAL');
  await absent(stagingRoot, 'CANVAS06_UNIFIED_TRANSACTION_FAILED', 'STAGING');
  for (const path of ['node_modules', 'apps/web/dist', 'services/local-runtime/target']) await absent(resolve(sourceRoot, path), 'CANVAS06_UNIFIED_SOURCE_DIRTY', 'ABSENT_IGNORED_OUTPUTS');
  try {
    run(sourceRoot, 'npm', ['ci', '--ignore-scripts']);
    runBootstrapClosure(sourceRoot, 'SOURCE');
    run(sourceRoot, process.execPath, [resolve(sourceRoot, 'scripts/build-dev-canvas-05-release.mjs'), '--release-root', stagingRoot, '--logical-release-root', options.out]);
    runBootstrapClosure(sourceRoot, 'POST');
    run(sourceRoot, process.execPath, [resolve(sourceRoot, 'scripts/generate-dev-canvas-05-handoff.mjs'), '--output', resolve(stagingRoot, 'dev-canvas-05-handoff.json'), '--release-build', resolve(stagingRoot, 'dev-canvas-05-release-build.json'), '--report-root', resolve(stagingRoot, 'handoff/reports'), '--logical-root', options.out]);
    await mkdir(dirname(finalRoot), { recursive: true });
    await rename(stagingRoot, finalRoot);
    run(sourceRoot, process.execPath, [resolve(sourceRoot, 'scripts/release-canvas06-intake.mjs'), '--handoff-root', handoffRoot, '--handoff', `${options.out}/dev-canvas-05-handoff.json`, '--handoff-sha256', sha(sourceRoot, resolve(finalRoot, 'dev-canvas-05-handoff.json')), '--out', resolve(finalRoot, 'dev-canvas-06-intake-report.json'), '--require-production']);
    run(sourceRoot, process.execPath, [resolve(sourceRoot, 'scripts/build-canvas06-common-visual-fixtures.mjs'), '--handoff', resolve(finalRoot, 'dev-canvas-05-handoff.json'), '--fixture-root', resolve(finalRoot, 'dev-canvas-06/common-fixtures/0.2.0'), '--source-date-epoch', commitEpoch(sourceRoot, options['source-commit'])]);
    run(sourceRoot, process.execPath, [resolve(sourceRoot, 'scripts/verify-canvas06-unified-production-inputs.mjs'), '--source-root', sourceRoot, '--handoff-root', handoffRoot, '--base-source-commit', options['base-source-commit'], '--source-commit', options['source-commit'], '--input', options.out, '--require-production']);
    const digest = await treeRef(handoffRoot, options.out, 'INPUT_TREE', 'CANVAS06_UNIFIED_JOIN_MISMATCH');
    process.stdout.write(`${finalRoot}\n${options['source-commit']}\n${digest.sha256}\n`);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function assertSource(sourceRoot, options) {
  if (command(sourceRoot, ['rev-parse', 'HEAD']).trim() !== options['source-commit']) fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'UNIFIED_SOURCE_CLEAN', 'source-root HEAD 不等于 source-commit。');
  if (command(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'UNIFIED_SOURCE_CLEAN', 'source-root 必须干净。');
  if (spawnSync('git', ['merge-base', '--is-ancestor', options['base-source-commit'], options['source-commit']], { cwd: sourceRoot }).status !== 0) fail('CANVAS06_UNIFIED_BASE_INVALID', 'BASE_COMMIT_ANCESTRY', 'source-commit 不以 base 为祖先。');
}
async function absent(path, code, stage) { try { await lstat(path); fail(code, stage, `路径已存在：${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function run(cwd, file, args) { const result = spawnSync(file, args, { cwd, encoding: 'utf8', env: process.env }); if (result.status !== 0) fail('CANVAS06_UNIFIED_BUILD_FAILED', 'BUILD', `${file} 失败：${result.stderr || result.stdout}`); }
function runBootstrapClosure(cwd, phase) { run(cwd, process.execPath, [resolve(cwd, 'scripts/verify-opm-bootstrap-build-closure.mjs'), '--phase', phase]); }
function command(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }
function commitEpoch(cwd, commit) { return command(cwd, ['show', '-s', '--format=%ct', commit]).trim(); }
function sha(cwd, path) { return execFileSync('shasum', ['-a', '256', path], { cwd, encoding: 'utf8' }).trim().split(/\s+/)[0]; }
