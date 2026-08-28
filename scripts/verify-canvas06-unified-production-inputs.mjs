import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { UnifiedInputError, assertArtifactOrder, assertExactQuarantineGuard, assertSourceClean, assertSourcePaths, fileRef, openExternalPaths, parseOptions, sameRef, treeRef } from './canvas06-unified-production-input.mjs';

if (import.meta.url === new URL(process.argv[1], 'file:').href) runCli();

async function runCli() {
  try {
    const result = await verify(parseOptions(process.argv.slice(2)));
    process.stdout.write(`${result.path}\t${result.sourceCommit}\t${result.treeSha256}\n`);
  } catch (error) {
    const value = normalize(error);
    process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`);
    process.exitCode = value.exitCode;
  }
}

export async function verify(options) {
  const paths = await openExternalPaths(options);
  await assertExactQuarantineGuard(paths);
  assertSourceClean(paths.sourceRoot, options['source-commit']);
  await assertSourcePaths(paths.sourceRoot);
  await regular(resolve(paths.versionedInputRoot, 'dev-canvas-05-handoff.json'));
  await regular(resolve(paths.versionedInputRoot, 'dev-canvas-06-intake-report.json'));
  const handoff = JSON.parse(await readFile(resolve(paths.versionedInputRoot, 'dev-canvas-05-handoff.json'), 'utf8'));
  const intake = JSON.parse(await readFile(resolve(paths.versionedInputRoot, 'dev-canvas-06-intake-report.json'), 'utf8'));
  if (handoff.schema_version !== '0.2' || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06') fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', '需要 READY Handoff 0.2。');
  assertArtifactOrder(handoff, paths.source12);
  await assertTreeRef(paths.handoffRoot, handoff.build_artifacts[2]);
  const handoffRef = await fileRef(paths.handoffRoot, `${paths.inputRelative}/dev-canvas-05-handoff.json`, 'HANDOFF');
  if (intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION' || !sameRef(intake.handoff_ref, handoffRef)) fail('CANVAS06_UNIFIED_INTAKE_INVALID', 'INTAKE', 'Intake 未锁定 Handoff raw bytes。');
  await regular(resolve(paths.versionedInputRoot, 'dev-canvas-06/common-fixtures/0.2.0/dev-canvas-06-common-fixture-catalog.json'));
  const before = await treeRef(paths.handoffRoot, paths.inputRelative, 'INPUT_TREE', 'CANVAS06_UNIFIED_JOIN_MISMATCH');
  assertSourceClean(paths.sourceRoot, options['source-commit']);
  const after = await treeRef(paths.handoffRoot, paths.inputRelative, 'INPUT_TREE', 'CANVAS06_UNIFIED_JOIN_MISMATCH');
  if (before.sha256 !== after.sha256) fail('CANVAS06_UNIFIED_JOIN_MISMATCH', 'TREE_DIGEST_AFTER', 'Verifier 观察到已安装输入变化。');
  assertSourceClean(paths.sourceRoot, options['source-commit']);
  return Object.freeze({ path: paths.versionedInputRoot, sourceCommit: options['source-commit'], treeSha256: after.sha256 });
}

async function assertTreeRef(root, reference) {
  const actual = await treeRef(root, reference.path, reference.kind, 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
  if (actual.byte_length !== reference.byte_length || actual.sha256 !== reference.sha256) throw new UnifiedInputError('CANVAS06_UNIFIED_WEB_TREE_INVALID', 'WEB_TREE', 'Web tree 摘要不匹配。');
}
async function regular(path) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new UnifiedInputError('CANVAS06_UNIFIED_JOIN_MISMATCH', 'VERIFY', `不是单链接普通文件：${path}`); }
function fail(code, stage, message) { throw new UnifiedInputError(code, stage, message); }
function normalize(error) { return error instanceof UnifiedInputError ? error : new UnifiedInputError('CANVAS06_UNIFIED_JOIN_MISMATCH', 'VERIFY', error.message); }
