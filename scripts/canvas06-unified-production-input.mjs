import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, stat, unlink, link } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { jcs } from './canvas06-e2e-manifest-v01-support.mjs';

export { jcs };

export const ORIGIN_PARENT_COMMIT = 'e598b305a44ebb9c9845c1f5563bc36c3a89a2b4';
export const ORIGIN_SOURCE_COMMIT = '9048bb355aff18d5c00fbbaeb1660b979f4e6daa';
export const RUNNER_IMPLEMENTATION_COMMIT = '144e74bfa64dfb79bcea5ce572034768e4b3b016';
const PROFILE_RELATIVE_ROOT = 'profiles/profile.iso19450.2024.draft/0.2.0';
export const ORIGIN_DELTA = Object.freeze([
  ['M', 'package.json'],
  ['M', 'scripts/canvas06-e2e-attempt-artifacts.mjs'],
  ['M', 'scripts/canvas06-e2e-attempt-artifacts.test.mjs'],
  ['M', 'scripts/canvas06-e2e-run-input.mjs'],
  ['M', 'scripts/canvas06-e2e-run-input.test.mjs'],
  ['M', 'scripts/canvas06-unified-production-input.mjs'],
  ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
  ['A', 'scripts/rebuild-canvas06-manifest-v02-production.mjs'],
  ['A', 'scripts/rebuild-canvas06-manifest-v02-production.test.mjs'],
  ['M', 'scripts/rebuild-canvas06-unified-production-inputs.mjs'],
  ['M', 'scripts/rebuild-canvas06-unified-production-inputs.test.mjs'],
  ['M', 'scripts/release-canvas06-e2e-run.mjs'],
  ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
  ['M', 'scripts/verify-canvas06-unified-production-inputs.mjs'],
  ['M', 'scripts/verify-canvas06-unified-production-inputs.test.mjs'],
  ['A', 'tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts'],
  ['M', 'tests/e2e/release/dev-canvas-06/playwright.release.config.ts']
]);
export const FAULT_CONTRACT_DELTA = Object.freeze([
  ['A', 'docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json'],
  ['A', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json'],
  ['A', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json'],
  ['A', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json'],
  ['M', 'package.json'],
  ['M', 'scripts/canvas06-unified-production-input.mjs'],
  ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
  ['M', 'scripts/rebuild-canvas06-manifest-v02-production.mjs'],
  ['M', 'scripts/rebuild-canvas06-manifest-v02-production.test.mjs'],
  ['M', 'scripts/rebuild-canvas06-unified-production-inputs.mjs'],
  ['M', 'scripts/rebuild-canvas06-unified-production-inputs.test.mjs'],
  ['A', 'scripts/release-canvas06-e2e-fault-launcher-preflight-input.mjs'],
  ['A', 'scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs'],
  ['M', 'scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs'],
  ['M', 'scripts/verify-canvas06-controlled-input-bundle.mjs'],
  ['M', 'scripts/verify-canvas06-controlled-input-bundle.test.mjs'],
  ['A', 'scripts/verify-canvas06-e2e-fault-launcher-preflight-input.mjs'],
  ['A', 'scripts/verify-canvas06-e2e-fault-launcher-preflight-input.test.mjs'],
  ['M', 'scripts/verify-canvas06-unified-production-inputs.mjs'],
  ['M', 'scripts/verify-canvas06-unified-production-inputs.test.mjs']
]);
export const SCHEMA_CONFORMANCE_DELTA = Object.freeze([
  ['M', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json'],
  ['M', 'scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs']
]);
export const FAULT_2A_DELTA = Object.freeze([
  ['A', 'scripts/canvas06-e2e-fault-launcher-controlled.test.mjs'],
  ['M', 'scripts/canvas06-e2e-release-config.test.mjs'],
  ['M', 'scripts/canvas06-unified-production-input.mjs'],
  ['M', 'scripts/canvas06-unified-production-input.test.mjs'],
  ['M', 'scripts/release-canvas06-e2e-run.mjs'],
  ['M', 'scripts/release-canvas06-e2e-run.test.mjs'],
  ['A', 'tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts']
]);
export const RUNNER_DELTA = Object.freeze([
  ['M', 'apps/web/src/modules/workbench/WorkbenchView.spec.ts'], ['M', 'apps/web/src/modules/workbench/WorkbenchView.vue'], ['M', 'apps/web/src/shared/api/localRuntimeApi.ts'], ['M', 'apps/web/src/stores/workbenchRuntime.ts'],
  ['M', 'docs/checklists/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-checklist.md'], ['M', 'docs/contracts/openapi/opm-local-api-v1.yaml'], ['M', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json'], ['A', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-common-setup-plan.schema.json'], ['A', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json'], ['M', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json'], ['M', 'docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json'],
  ['M', 'docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md'], ['A', 'docs/design/opm-dev-canvas-06-e2e-common-setup-plan-design.md'], ['M', 'docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md'], ['M', 'docs/design/opm-dev-canvas-06-projection-digest-closure-design.md'],
  ['M', 'scripts/build-canvas06-common-visual-fixtures.mjs'], ['M', 'scripts/canvas06-e2e-attempt-artifacts.mjs'], ['M', 'scripts/canvas06-e2e-attempt-artifacts.test.mjs'], ['M', 'scripts/canvas06-e2e-common-fixtures.mjs'], ['A', 'scripts/canvas06-e2e-common-setup-plan.mjs'], ['A', 'scripts/canvas06-e2e-common-setup-plan.test.mjs'], ['M', 'scripts/canvas06-e2e-manifest-v02-compose.mjs'], ['M', 'scripts/canvas06-e2e-release-config.test.mjs'], ['M', 'scripts/canvas06-e2e-run-input.mjs'], ['M', 'scripts/canvas06-e2e-run-input.test.mjs'], ['M', 'scripts/canvas06-e2e-run-report.mjs'], ['M', 'scripts/canvas06-e2e-run-report.test.mjs'], ['M', 'scripts/canvas06-e2e-run-stage.mjs'], ['M', 'scripts/canvas06-e2e-run-stage.test.mjs'], ['M', 'scripts/canvas06-projection-digest-v01.mjs'], ['M', 'scripts/canvas06-projection-digest-v01.test.mjs'], ['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs'], ['M', 'scripts/common-visual-fixtures.test.mjs'], ['M', 'scripts/release-canvas06-e2e-manifest-v02.mjs'], ['M', 'scripts/release-canvas06-e2e-run.mjs'], ['M', 'scripts/release-canvas06-e2e-run.test.mjs'], ['M', 'scripts/validate-canvas06-visual-e2e-schemas.test.mjs'], ['M', 'scripts/validate-contracts.mjs'], ['M', 'scripts/verify-canvas06-common-visual-fixtures.mjs'], ['M', 'scripts/verify-canvas06-e2e-manifest-v02.mjs'], ['M', 'scripts/verify-canvas06-e2e-report.mjs'], ['M', 'scripts/verify-canvas06-e2e-report.test.mjs'],
  ['M', 'services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java'], ['M', 'services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01.java'], ['A', 'services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotCli.java'], ['A', 'services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotSupport.java'], ['M', 'services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCli.java'], ['A', 'services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2ETransactionSnapshotCli.java'], ['M', 'services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java'], ['M', 'services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java'], ['M', 'services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01Test.java'], ['A', 'services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotCliTest.java'], ['M', 'services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCliTest.java'], ['M', 'services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerJarIT.java'],
  ['M', 'specs/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md'], ['A', 'specs/opm-dev-canvas-06-e2e-common-setup-plan-implementation-task-spec.md'], ['M', 'tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs'], ['M', 'tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs'], ['M', 'tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs'], ['M', 'tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs'], ['M', 'tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs'], ['A', 'tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts']
]);
export const RUNNER_DELTA_OWNER_CLOSURE = Object.freeze([['M', 'scripts/canvas06-unified-production-input.mjs'], ['M', 'scripts/canvas06-unified-production-input.test.mjs']]);
export const FAULT_2A_CUMULATIVE_DELTA = mergeDelta(FAULT_CONTRACT_DELTA, FAULT_2A_DELTA);
export const FINAL_RUNNER_CUMULATIVE_DELTA = mergeDelta(FAULT_2A_CUMULATIVE_DELTA, RUNNER_DELTA, RUNNER_DELTA_OWNER_CLOSURE);
const QUARANTINE_FAILURE_CODES = new Set(['CANVAS06_UNIFIED_HANDOFF_INVALID', 'CANVAS06_UNIFIED_INTAKE_INVALID', 'CANVAS06_UNIFIED_WEB_TREE_INVALID', 'CANVAS06_UNIFIED_COMMON_INVALID', 'CANVAS06_UNIFIED_JOIN_MISMATCH', 'CANVAS06_UNIFIED_TRANSACTION_FAILED']);
const QUARANTINE_FAILURE_STAGES = new Set(['FSYNC_RELEASES_PARENT', 'SPAWN_INDEPENDENT_INSTALLED_VERIFIER', 'INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON']);

function mergeDelta(...deltas) {
  const byPath = new Map();
  for (const delta of deltas) for (const [status, path] of delta) byPath.set(path, [status, path]);
  return Object.freeze([...byPath.values()].sort((left, right) => Buffer.compare(Buffer.from(left[1], 'utf8'), Buffer.from(right[1], 'utf8'))));
}

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

/** production 只接受外置 release store，不保留旧 handoff/out/input 兼容入口。 */
export function parseOptions(argv) {
  const common = ['input-mode', 'source-root', 'release-store-root', 'source-chain-target', 'origin-source-commit', 'fault-contract-source-commit', 'schema-conformance-source-commit', 'fault-2a-source-commit', 'source-commit', 'require-production'];
  const all = [...common, 'runner-source-commit'];
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (typeof flag !== 'string' || !flag.startsWith('--') || flag.includes('=') || !all.includes(flag.slice(2)) || values.has(flag.slice(2))) {
      fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '参数未知、重复或格式错误。');
    }
    const key = flag.slice(2);
    if (key === 'require-production') { values.set(key, true); continue; }
    const value = argv[++index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '参数值缺失。');
    values.set(key, value);
  }
  const target = values.get('source-chain-target');
  const expectedCount = target === 'FINAL_RUNNER' ? common.length + 1 : target === 'FAULT_2A' ? common.length : -1;
  if (values.size !== expectedCount || values.get('require-production') !== true || values.get('input-mode') !== 'EXTERNAL_RELEASE_STORE') {
    fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', '缺少 production 参数或 input-mode 非 EXTERNAL_RELEASE_STORE。');
  }
  for (const key of ['source-root', 'release-store-root']) if (!isAbsolute(values.get(key))) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', `${key} 必须是绝对路径。`);
  if (values.get('origin-source-commit') !== ORIGIN_SOURCE_COMMIT || [...values.entries()].some(([key, value]) => key.endsWith('-commit') && !/^[a-f0-9]{40}$/.test(value))) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', 'source chain commit 非法。');
  if ((target === 'FAULT_2A' && values.get('source-commit') !== values.get('fault-2a-source-commit')) || (target === 'FINAL_RUNNER' && values.get('source-commit') !== values.get('runner-source-commit'))) fail('CANVAS06_UNIFIED_ARGUMENT_INVALID', 'ARGS', 'source-commit 必须等于 target HEAD。');
  return Object.freeze(Object.fromEntries(values));
}

export function sourceChainArgs(options) {
  const keys = ['source-chain-target', 'origin-source-commit', 'fault-contract-source-commit', 'schema-conformance-source-commit', 'fault-2a-source-commit'];
  if (options['source-chain-target'] === 'FINAL_RUNNER') keys.push('runner-source-commit');
  return keys.flatMap(key => [`--${key}`, options[key]]);
}

export function deriveExternalPaths(options) {
  const source12 = options['source-commit'].slice(0, 12);
  const releaseStoreRoot = resolve(options['release-store-root']);
  const installedProfilePackageRoot = resolve(releaseStoreRoot, PROFILE_RELATIVE_ROOT);
  const handoffRoot = resolve(installedProfilePackageRoot, 'handoff');
  const releasesRoot = resolve(handoffRoot, 'releases');
  const inputRelative = `releases/clean-${source12}`;
  return Object.freeze({
    source12,
    sourceRoot: resolve(options['source-root']),
    releaseStoreRoot,
    installedProfilePackageRoot,
    handoffRoot,
    releasesRoot,
    inputRelative,
    versionedInputRoot: resolve(handoffRoot, inputRelative),
    stagingRoot: resolve(releasesRoot, `.clean-${source12}.staging`),
    quarantineRoot: resolve(releasesRoot, 'quarantine'),
    marker: resolve(releasesRoot, 'quarantine', `clean-${source12}.json`),
    temporaryMarker: resolve(releasesRoot, 'quarantine', `.clean-${source12}.json.tmp`),
    manifestReleaseParent: resolve(releaseStoreRoot, 'manifests/e2e-v02'),
    profileStagingParent: resolve(releaseStoreRoot, '.staging/profile-assets')
  });
}

/**
 * 先以调用方提供的词法路径完成安全拓扑校验，再将后续子进程路径固定为物理路径。
 * 这样既不会掩盖 root 自身的符号链接，又避免 /tmp -> /private/tmp 导致的 CLI 入口静默跳过。
 */
export async function openExternalPaths(options) {
  const lexicalPaths = deriveExternalPaths(options);
  const { sourceReal, storeReal } = await assertExternalTopology(lexicalPaths);
  return deriveExternalPaths({
    ...options,
    'source-root': sourceReal,
    'release-store-root': storeReal
  });
}

export async function assertExternalTopology(paths) {
  await realDirectory(paths.sourceRoot, 'CANVAS06_UNIFIED_TRANSACTION_FAILED', 'SOURCE_ROOT');
  await realDirectory(paths.releaseStoreRoot, 'CANVAS06_UNIFIED_TRANSACTION_FAILED', 'RELEASE_STORE_ROOT');
  const [sourceReal, storeReal, sourceInfo, storeInfo] = await Promise.all([realpath(paths.sourceRoot), realpath(paths.releaseStoreRoot), stat(paths.sourceRoot), stat(paths.releaseStoreRoot)]);
  if (sourceReal === storeReal || (sourceInfo.dev === storeInfo.dev && sourceInfo.ino === storeInfo.ino) || nested(sourceReal, storeReal) || nested(storeReal, sourceReal)) {
    fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_ISOLATION', 'source-root 与 release-store-root 必须物理独立。');
  }
  const git = spawnSync('git', ['-C', storeReal, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (git.status === 0 && git.stdout.trim() === 'true') fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'RELEASE_STORE_GIT', 'release-store-root 不得位于 Git worktree。');
  for (const target of [paths.installedProfilePackageRoot, paths.handoffRoot, paths.releasesRoot, paths.quarantineRoot, paths.manifestReleaseParent, paths.profileStagingParent]) await assertExistingSegmentsSafe(paths.releaseStoreRoot, target);
  const stagingParent = await nearestExistingDirectory(dirname(paths.stagingRoot));
  const finalParent = await nearestExistingDirectory(dirname(paths.versionedInputRoot));
  if ((await stat(stagingParent)).dev !== (await stat(finalParent)).dev) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'CROSS_FILESYSTEM', 'staging 与 final 必须位于同一文件系统。');
  return Object.freeze({ sourceReal, storeReal });
}

export function assertSourceClean(sourceRoot, options) {
  const sourceCommit = options['source-commit'];
  if (git(sourceRoot, ['--no-replace-objects', 'rev-parse', 'HEAD']).trim() !== sourceCommit) fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'SOURCE_CLEAN_HEAD', 'source-root HEAD 不等于 source-commit。');
  if (git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('CANVAS06_UNIFIED_SOURCE_DIRTY', 'SOURCE_CLEAN_HEAD', 'source-root 必须完全干净。');
  const origin = options['origin-source-commit'];
  const contract = options['fault-contract-source-commit'];
  const schema = options['schema-conformance-source-commit'];
  const fault = options['fault-2a-source-commit'];
  assertSingleParent(sourceRoot, origin, ORIGIN_PARENT_COMMIT, 'ORIGIN_PARENT');
  assertDelta(sourceRoot, ORIGIN_PARENT_COMMIT, origin, ORIGIN_DELTA, 'ORIGIN_DELTA');
  assertSingleParent(sourceRoot, contract, origin, 'FAULT_CONTRACT_PARENT');
  assertDelta(sourceRoot, origin, contract, FAULT_CONTRACT_DELTA, 'FAULT_CONTRACT_DELTA');
  assertSingleParent(sourceRoot, schema, contract, 'SCHEMA_CONFORMANCE_PARENT');
  assertDelta(sourceRoot, contract, schema, SCHEMA_CONFORMANCE_DELTA, 'SCHEMA_CONFORMANCE_DELTA');
  assertSingleParent(sourceRoot, fault, schema, 'FAULT_2A_PARENT');
  assertDelta(sourceRoot, schema, fault, FAULT_2A_DELTA, 'FAULT_2A_DELTA');
  if (options['source-chain-target'] === 'FAULT_2A') {
    assertDelta(sourceRoot, origin, fault, FAULT_2A_CUMULATIVE_DELTA, 'FAULT_2A_CUMULATIVE_DELTA');
    return;
  }
  const runner = options['runner-source-commit'];
  assertSingleParent(sourceRoot, RUNNER_IMPLEMENTATION_COMMIT, fault, 'RUNNER_IMPLEMENTATION_PARENT');
  assertDelta(sourceRoot, fault, RUNNER_IMPLEMENTATION_COMMIT, RUNNER_DELTA, 'RUNNER_IMPLEMENTATION_DELTA');
  assertSingleParent(sourceRoot, runner, RUNNER_IMPLEMENTATION_COMMIT, 'RUNNER_DELTA_OWNER_PARENT');
  assertDelta(sourceRoot, RUNNER_IMPLEMENTATION_COMMIT, runner, RUNNER_DELTA_OWNER_CLOSURE, 'RUNNER_DELTA_OWNER_CLOSURE');
  assertDelta(sourceRoot, origin, runner, FINAL_RUNNER_CUMULATIVE_DELTA, 'FINAL_RUNNER_CUMULATIVE_DELTA');
}

function assertSingleParent(sourceRoot, commit, parent, stage) {
  if (git(sourceRoot, ['--no-replace-objects', 'rev-list', '--parents', '-n', '1', commit]).trim() !== `${commit} ${parent}`) fail('CANVAS06_UNIFIED_BASE_INVALID', stage, 'source chain parent 不符合冻结关系。');
}
function assertDelta(sourceRoot, from, to, expected, stage) {
  const actual = git(sourceRoot, ['--no-replace-objects', 'diff', '--no-renames', '--name-status', `${from}..${to}`]).trim().split('\n').filter(Boolean).map(line => line.split('\t'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('CANVAS06_UNIFIED_BASE_INVALID', stage, 'source chain delta 不符合冻结 allowlist。');
}

export async function assertTargetAbsent(paths) {
  for (const [stage, target] of [['FINAL', paths.versionedInputRoot], ['STAGING', paths.stagingRoot], ['MARKER', paths.marker], ['MARKER_TEMP', paths.temporaryMarker]]) {
    if (await existing(target)) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', stage, '目标 release root 或 sidecar 已存在。');
  }
}

export async function assertExactQuarantineGuard(paths) {
  const marker = await existing(paths.marker);
  if (await existing(paths.temporaryMarker)) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'quarantine marker 临时文件残留。');
  if (!marker) return;
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'quarantine marker 不安全。');
  fail('CANVAS06_UNIFIED_QUARANTINED', 'EXACT_QUARANTINE_SIDECAR_GUARD', '目标版本根存在 quarantine marker。');
}

export async function writeQuarantineMarker({ paths, sourceCommit, treeSha256, failureCode, failureStage }) {
  if (!/^[a-f0-9]{64}$/.test(treeSha256) || !QUARANTINE_FAILURE_CODES.has(failureCode) || !QUARANTINE_FAILURE_STAGES.has(failureStage)) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'QUARANTINE_MARKER_CONTENT', 'quarantine marker 参数不满足冻结契约。');
  await mkdir(paths.quarantineRoot, { recursive: true });
  await assertExactQuarantineGuard(paths);
  const value = { schema_id: 'OPM-DEV-CANVAS-06-UNIFIED-SOURCE-QUARANTINE-MARKER-001', schema_version: '0.1', status: 'QUARANTINED', input_root: paths.inputRelative, source_commit: sourceCommit, pre_quarantine_tree_sha256: treeSha256, failure_code: failureCode, failure_stage: failureStage };
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    const handle = await open(paths.temporaryMarker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    const reread = await readFile(paths.temporaryMarker);
    if (!reread.equals(bytes) || !validQuarantineMarker(JSON.parse(reread.toString('utf8')))) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'QUARANTINE_MARKER_VERIFY', 'quarantine marker 回读不匹配。');
    await link(paths.temporaryMarker, paths.marker);
    await unlink(paths.temporaryMarker);
    await syncPath(paths.quarantineRoot);
  } catch (error) {
    if (error instanceof UnifiedInputError) throw error;
    fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'QUARANTINE_MARKER_WRITE', error.message);
  }
}

export function sourceEpoch(value) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(value))) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 必须为规范非负十进制。');
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 超出安全范围。');
  const text = new Date(seconds * 1000).toISOString().replace(/\.000Z$/, 'Z');
  if (Math.trunc(Date.parse(text) / 1000) !== seconds) fail('CANVAS06_UNIFIED_BASE_INVALID', 'SOURCE_ROOT_IDENTITY', 'commit epoch 无法 UTC 整秒往返。');
  return text;
}

export async function fileRef(root, path, kind, code = 'CANVAS06_UNIFIED_JOIN_MISMATCH') {
  const absolute = inside(root, path, code); const info = await regularFile(absolute, code); const bytes = await readFile(absolute);
  return Object.freeze({ kind, path, byte_length: info.size, sha256: sha256(bytes) });
}

export async function treeRef(root, path, kind = 'WEB_DIST_TREE', code = 'CANVAS06_UNIFIED_WEB_TREE_INVALID') {
  const absolute = inside(root, path, code); await directory(absolute, code); const entries = await treeEntries(absolute, code);
  if (entries.length === 0) fail(code, 'WEB_TREE', '目录树不能为空。');
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
  for (const path of [SOURCE_PATHS.runtimeJar, SOURCE_PATHS.commonFactory, SOURCE_PATHS.commonGenerator, ...SOURCE_PATHS.profileAssets, ...SOURCE_PATHS.drivers.map(name => `${SOURCE_PATHS.driverRoot}/${name}`)]) await regularFile(inside(sourceRoot, path, 'CANVAS06_UNIFIED_JOIN_MISMATCH'), 'CANVAS06_UNIFIED_JOIN_MISMATCH');
  await directory(inside(sourceRoot, SOURCE_PATHS.webDist, 'CANVAS06_UNIFIED_WEB_TREE_INVALID'), 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
}

export function assertArtifactOrder(handoff, source12) {
  const expected = [['LOCAL_RUNTIME_JAR', `releases/clean-${source12}/local-runtime-0.1.0-SNAPSHOT.jar`], ['EVIDENCE_BUNDLE', `releases/clean-${source12}/dev-canvas-05-evidence-bundle.jar`], ['WEB_DIST_TREE', `releases/clean-${source12}/web-dist`]];
  if (!Array.isArray(handoff?.build_artifacts) || handoff.build_artifacts.length !== expected.length) fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', 'Handoff 必须有三个有序构建产物。');
  for (const [index, [kind, path]] of expected.entries()) { const actual = handoff.build_artifacts[index]; if (actual?.kind !== kind || actual.path !== path || !Number.isSafeInteger(actual.byte_length) || actual.byte_length < 0 || !/^[a-f0-9]{64}$/.test(actual.sha256 ?? '')) fail('CANVAS06_UNIFIED_HANDOFF_INVALID', 'HANDOFF_0.2', 'Handoff 构建产物顺序或引用非法。'); }
}

export function sameRef(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export async function syncPath(path) { const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
export function inside(root, path, code = 'CANVAS06_UNIFIED_ARGUMENT_INVALID') { if (!safePath(path)) fail(code, 'PATH', '路径必须为安全相对路径。'); const output = resolve(root, path); if (!nested(output, resolve(root)) || output === resolve(root)) fail(code, 'PATH', '路径越过根目录。'); return output; }
export function safePath(path) { return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..'); }

async function treeEntries(root, code) {
  const result = []; await visit(root, ''); return result.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  async function visit(directoryPath, prefix) {
    for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name; const target = resolve(directoryPath, entry.name); const details = await lstat(target);
      if (details.isSymbolicLink() || (!details.isDirectory() && (!details.isFile() || details.nlink !== 1))) fail(code, 'TREE', 'Tree 含链接或特殊文件。');
      if (details.isDirectory()) await visit(target, path);
      else { const bytes = await readFile(target); if (path.endsWith('.map') && /(?:^|["'])\/(?:Users|home)\//.test(bytes.toString('utf8'))) fail(code, 'WEB_TREE', 'source map 包含 checkout 绝对路径。'); if (/vite\/client|@vite\/client/.test(bytes.toString('utf8'))) fail(code, 'WEB_TREE', 'Web tree 包含 Vite HMR client。'); result.push({ path, byte_length: bytes.length, sha256: sha256(bytes) }); }
    }
  }
}

async function realDirectory(path, code, stage) { try { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe'); } catch { fail(code, stage, '必须是已存在的非链接目录。'); } }
async function directory(path, code) { await realDirectory(path, code, 'DIRECTORY'); }
async function regularFile(path, code) { try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('unsafe'); return info; } catch { fail(code, 'SOURCE_PATHS', '必须是单链接普通文件。'); } }
async function existing(path) { try { return await lstat(path); } catch (error) { if (error?.code === 'ENOENT') return undefined; fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'LSTAT', error.message); } }
async function nearestExistingDirectory(target) { let cursor = resolve(target); while (true) { try { const info = await lstat(cursor); if (!info.isDirectory() || info.isSymbolicLink()) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_PATH', '父目录不安全。'); return cursor; } catch (error) { if (error instanceof UnifiedInputError) throw error; if (error?.code !== 'ENOENT') fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_PATH', error.message); const parent = dirname(cursor); if (parent === cursor) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_PATH', '找不到可用父目录。'); cursor = parent; } } }
async function assertExistingSegmentsSafe(root, target) {
  const relation = relative(resolve(root), resolve(target));
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_PATH', '派生路径越过 release store root。');
  let cursor = resolve(root);
  for (const segment of relation.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const info = await existing(cursor);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) fail('CANVAS06_UNIFIED_TRANSACTION_FAILED', 'ROOT_PATH', '路径中的已存在 segment 必须是非链接目录。');
  }
}
function nested(candidate, root) { const relation = relative(root, candidate); return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)); }
function git(cwd, args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); }
function validQuarantineMarker(value) { const keys = ['schema_id', 'schema_version', 'status', 'input_root', 'source_commit', 'pre_quarantine_tree_sha256', 'failure_code', 'failure_stage']; return value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value)) === JSON.stringify(keys) && value.schema_id === 'OPM-DEV-CANVAS-06-UNIFIED-SOURCE-QUARANTINE-MARKER-001' && value.schema_version === '0.1' && value.status === 'QUARANTINED' && /^releases\/clean-[a-f0-9]{12}$/.test(value.input_root) && /^[a-f0-9]{40}$/.test(value.source_commit) && value.input_root === `releases/clean-${value.source_commit.slice(0, 12)}` && /^[a-f0-9]{64}$/.test(value.pre_quarantine_tree_sha256) && QUARANTINE_FAILURE_CODES.has(value.failure_code) && QUARANTINE_FAILURE_STAGES.has(value.failure_stage); }
