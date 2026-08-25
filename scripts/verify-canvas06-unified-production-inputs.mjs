import { lstat, readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { UnifiedInputError, assertArtifactOrder, assertSourcePaths, assertTreeRef, fail, parseOptions, sameRef, treeRef } from './canvas06-unified-production-input.mjs';

try {
  const options = parseOptions(process.argv.slice(2), 'verify');
  await verify(options);
} catch (error) {
  const value = error instanceof UnifiedInputError ? error : new UnifiedInputError('CANVAS06_UNIFIED_JOIN_MISMATCH', 'VERIFY', error.message);
  process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
  process.exitCode = value.exitCode;
}

async function verify(options) {
  const sourceRoot = options['source-root'];
  const handoffRoot = options['handoff-root'];
  if (git(sourceRoot, ['rev-parse', 'HEAD']).trim() !== options['source-commit']) fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'SOURCE_ROOT_IDENTITY', 'source-root HEAD 不匹配。');
  if (git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'SOURCE_ROOT_IDENTITY', 'source-root 不干净。');
  if (spawnSync('git', ['merge-base', '--is-ancestor', options['base-source-commit'], options['source-commit']], { cwd: sourceRoot }).status !== 0) fail('CANVAS06_UNIFIED_BASE_INVALID', 'BASE_COMMIT_ANCESTRY', 'base ancestry 无效。');
  await assertSourcePaths(sourceRoot);
  const input = resolve(handoffRoot, options.input);
  const handoffPath = resolve(input, 'dev-canvas-05-handoff.json');
  const intakePath = resolve(input, 'dev-canvas-06-intake-report.json');
  await regular(handoffPath);
  await regular(intakePath);
  const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  const intake = JSON.parse(await readFile(intakePath, 'utf8'));
  if (handoff.schema_version !== '0.2' || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06') fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', '需要 READY Handoff 0.2。');
  assertArtifactOrder(handoff, options['source-commit'].slice(0, 12));
  await assertTreeRef(handoffRoot, handoff.build_artifacts[2]);
  if (intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION' || !sameRef(intake.handoff_ref, await ref(handoffRoot, `${options.input}/dev-canvas-05-handoff.json`, 'HANDOFF'))) fail('CANVAS06_UNIFIED_INTAKE_INVALID', 'INTAKE', 'Intake 未锁定 Handoff raw bytes。');
  await regular(resolve(input, 'dev-canvas-06/common-fixtures/0.2.0/dev-canvas-06-common-fixture-catalog.json'));
  const digest = await treeRef(handoffRoot, options.input, 'INPUT_TREE', 'CANVAS06_UNIFIED_JOIN_MISMATCH');
  process.stdout.write(`${input}\n${options['source-commit']}\n${digest.sha256}\n`);
}

async function regular(path) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('CANVAS06_UNIFIED_JOIN_MISMATCH', 'VERIFY', `不是单链接普通文件：${path}`); }
async function ref(root, path, kind) { const target = resolve(root, path); const bytes = await readFile(target); return { kind, path, byte_length: bytes.length, sha256: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex') }; }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }
