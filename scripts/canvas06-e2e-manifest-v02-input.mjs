import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { jcs } from './canvas06-e2e-manifest-v01-support.mjs';

/** 活动 E2E Manifest 0.2 的唯一 CLI 与矩阵守卫。 */
export class E2eManifestV02Error extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'E2eManifestV02Error';
    this.code = code;
    this.stage = stage;
    this.exitCode = exitCodeFor(code);
  }
}

const PRODUCER_COMMON = Object.freeze(['input-mode', 'source-root', 'source-date-epoch', 'common-fixture-root', 'profile-asset-root', 'output-root', 'out']);
const VERIFIER_COMMON = Object.freeze(['input-mode', 'source-root', 'manifest-root', 'manifest', 'profile-asset-root']);
const PRODUCTION = Object.freeze(['handoff-root', 'intake-report', 'require-production']);
const CONTROLLED = Object.freeze(['controlled-bundle-root']);
const DRIVER_CATALOG = Object.freeze([
  ['DRIVER-PROCEDURAL', 'inputs/drivers/procedural-driver.mjs'],
  ['DRIVER-CONTROL', 'inputs/drivers/control-driver.mjs'],
  ['DRIVER-STRUCTURAL', 'inputs/drivers/structural-driver.mjs'],
  ['DRIVER-COMMON', 'inputs/drivers/common-driver.mjs']
]);

const PROFILE_ASSET_ROOT = 'inputs/upstream/profile-assets';
export const PROFILE_ASSET_SOURCE_SET = Object.freeze([
  ['GRAMMAR_ASSET', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json', 'grammar/representative-opl-grammar.json'],
  ['NORMALIZATION_DATA', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json', 'normalization/representative-normalization.json'],
  ['PROFILE_PACKAGE', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json', 'profile.json'],
  ['RULE_SET', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json', 'rules/representative-rule-set.json'],
  ['SYMBOL_ASSET', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json', 'symbols/representative-symbol-catalog.json']
].map(([kind, source_path, logical_path]) => Object.freeze({ kind, source_path, logical_path })));

export function parseProducerOptions(argv) {
  return parseOptions(argv, PRODUCER_COMMON, 'producer');
}

export function parseVerifierOptions(argv) {
  return parseOptions(argv, VERIFIER_COMMON, 'verifier');
}

export function formatSourceDateEpoch(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'source-date-epoch must be a canonical non-negative decimal integer.');
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'source-date-epoch is outside the supported UTC-second range.');
  try {
    const text = new Date(numeric * 1000).toISOString().replace(/\.000Z$/, 'Z');
    if (Math.trunc(Date.parse(text) / 1000) !== numeric || !text.endsWith('Z') || text.includes('.')) throw new Error('roundtrip');
    return text;
  } catch {
    fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'source-date-epoch cannot roundtrip as a UTC whole second.');
  }
}

/** 从固定 source set 读取五个 raw ref；不得扫描或推断 Profile 目录。 */
export async function readProfileAssetSourceSet(sourceRoot) {
  const root = resolve(sourceRoot);
  const entries = [];
  for (const mapping of PROFILE_ASSET_SOURCE_SET) {
    const source = resolveWithin(root, mapping.source_path, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 'SOURCE_PROFILE_5_RAW');
    const bytes = await readSingleLinkRegularFile(source);
    entries.push(Object.freeze({
      ...mapping,
      bytes,
      ref: Object.freeze({ kind: mapping.kind, path: `${PROFILE_ASSET_ROOT}/${mapping.logical_path}`, byte_length: bytes.length, sha256: sha256(bytes) })
    }));
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    profile_asset_refs: Object.freeze(entries.map(entry => entry.ref)),
    profile_asset_tree_ref: treeRef(entries.map(entry => entry.ref))
  });
}

/** 创建独立暂存根并逐字节物化固定 source set。 */
export async function materializeProfileAssetStaging({ sourceSet, profileAssetRoot, isolatedRoots }) {
  const target = await assertFreshProfileAssetStaging({ profileAssetRoot, isolatedRoots });
  try {
    for (const entry of sourceSet.entries) {
      const destination = resolveWithin(target, entry.logical_path, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_STAGING_COPY');
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, entry.bytes, { flag: 'wx' });
    }
    return target;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

/** 仅比较固定的 raw/tree 身份，业务 package/binding 仍由 Profile helper 负责。 */
export function assertProfileAssetThreeWayJoin(sourceSet, stagingClosure, finalClosure) {
  if (!sameRefs(sourceSet.profile_asset_refs, stagingClosure?.profile_asset_refs)
    || !sameRefs(sourceSet.profile_asset_refs, finalClosure?.profile_asset_refs)
    || !sameRef(sourceSet.profile_asset_tree_ref, stagingClosure?.profile_asset_tree_ref)
    || !sameRef(sourceSet.profile_asset_tree_ref, finalClosure?.profile_asset_tree_ref)) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'SOURCE_STAGING_FINAL_JOIN', 'Profile source, staging, and final raw/tree identities must be exactly equal.');
  }
}

export function assertProfileAssetSourceSetStable(before, after) {
  if (!sameRefs(before?.profile_asset_refs, after?.profile_asset_refs) || !sameRef(before?.profile_asset_tree_ref, after?.profile_asset_tree_ref)) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'SOURCE_PROFILE_5_RAW', 'Profile source assets changed during materialization.');
  }
}

/** 删除已消费暂存根，并同步其父目录；失败由调用方转换为 I/O 失败。 */
export async function removeProfileAssetStaging(profileAssetRoot, fsyncParent) {
  const target = resolve(profileAssetRoot);
  await rm(target, { recursive: true, force: false });
  await fsyncParent(dirname(target));
}

/**
 * 暂存 target 必须在调用前不存在，且与受控输入/输出根完全隔离。
 * 目标不存在时以最近存在父目录的 real path 构造比较路径，避免不存在目标绕过 link 检查。
 */
export async function assertFreshProfileAssetStaging({ profileAssetRoot, isolatedRoots }) {
  const lexicalTarget = resolve(profileAssetRoot);
  try {
    await lstat(lexicalTarget);
    fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING_FRESH', 'profile-asset-root must not exist before Producer starts.');
  } catch (error) {
    if (error instanceof E2eManifestV02Error) throw error;
    if (error?.code !== 'ENOENT') fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING_FRESH', error.message);
  }
  const parent = await nearestExistingDirectory(lexicalTarget);
  const realTarget = resolve(parent.real, ...parent.missing);
  await assertIsolated(lexicalTarget, realTarget, isolatedRoots);
  try {
    await mkdir(lexicalTarget, { recursive: true });
    const details = await lstat(lexicalTarget);
    if (!details.isDirectory() || details.isSymbolicLink()) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING_FRESH', 'profile-asset-root must be a real directory.');
    await assertIsolated(lexicalTarget, await realpath(lexicalTarget), isolatedRoots);
    return lexicalTarget;
  } catch (error) {
    if (error instanceof E2eManifestV02Error) throw error;
    fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING_CREATE', error.message);
  }
}

export function assertDriverCatalog(driverCatalog) {
  if (!Array.isArray(driverCatalog) || driverCatalog.length !== DRIVER_CATALOG.length) {
    fail('E2E_MANIFEST_DRIVER_INVALID', 'FOUR_DRIVERS', 'Driver catalog must contain exactly four drivers.');
  }
  for (const [index, [driverId, path]] of DRIVER_CATALOG.entries()) {
    const actual = driverCatalog[index];
    if (actual?.driver_id !== driverId || actual.source_ref?.kind !== 'E2E_DRIVER_SOURCE' || actual.source_ref?.path !== path) {
      fail('E2E_MANIFEST_DRIVER_INVALID', 'FOUR_DRIVERS', 'Driver catalog is not the frozen ordered source set.');
    }
  }
}

export function assertCaseDriverClosure(cases) {
  if (!Array.isArray(cases) || cases.length !== 194) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'CASE_ORDER', 'Case set must contain exactly 194 entries.');
  }
  const ids = new Set();
  let familyPass = 0;
  let familyBlocked = 0;
  let commonPass = 0;
  let commonBlocked = 0;
  for (const entry of cases) {
    if (!entry?.case_id || ids.has(entry.case_id)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'CASE_ORDER', 'Case IDs must be unique.');
    ids.add(entry.case_id);
    const family = typeof entry.capability_id === 'string';
    if (family && !['DRIVER-PROCEDURAL', 'DRIVER-CONTROL', 'DRIVER-STRUCTURAL'].includes(entry.driver_id)) {
      fail('E2E_MANIFEST_DRIVER_INVALID', 'CASE_DRIVER', 'Family cases must use a Family driver.');
    }
    if (!family && entry.driver_id !== 'DRIVER-COMMON') {
      fail('E2E_MANIFEST_DRIVER_INVALID', 'CASE_DRIVER', 'Common cases must use DRIVER-COMMON.');
    }
    if (!['PASS', 'BLOCKED'].includes(entry.expectation)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXPECTATION', 'Case expectation is invalid.');
    if (family && entry.expectation === 'PASS') familyPass += 1;
    if (family && entry.expectation === 'BLOCKED') familyBlocked += 1;
    if (!family && entry.expectation === 'PASS') commonPass += 1;
    if (!family && entry.expectation === 'BLOCKED') commonBlocked += 1;
  }
  if (familyPass !== 130 || familyBlocked !== 48 || commonPass !== 7 || commonBlocked !== 9) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXPECTATION', 'Case expectation matrix must be 130/48 Family and 7/9 Common.');
  }
}

function parseOptions(argv, common, role) {
  const values = new Map();
  const allowed = new Set([...common, ...PRODUCTION, ...CONTROLLED]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || flag.includes('=') || !allowed.has(flag.slice(2))) {
      fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `${role} received an unsupported argument.`);
    }
    const name = flag.slice(2);
    if (values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `${role} received a duplicate argument.`);
    if (name === 'require-production') {
      values.set(name, true);
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `${role} argument value is missing.`);
    values.set(name, value);
  }
  for (const name of common) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `Missing --${name}.`);
  const mode = values.get('input-mode');
  if (!['PRODUCTION_HANDOFF', 'CONTROLLED_TEST'].includes(mode)) {
    fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'MODE', 'input-mode must be PRODUCTION_HANDOFF or CONTROLLED_TEST.');
  }
  const active = mode === 'PRODUCTION_HANDOFF' ? PRODUCTION : CONTROLLED;
  const inactive = mode === 'PRODUCTION_HANDOFF' ? CONTROLLED : PRODUCTION;
  for (const name of active) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `Missing --${name}.`);
  for (const name of inactive) if (values.has(name)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'MODE', `--${name} is invalid for ${mode}.`);
  if (role === 'producer') formatSourceDateEpoch(values.get('source-date-epoch'));
  return Object.freeze(Object.fromEntries(values));
}

function exitCodeFor(code) {
  if (code === 'E2E_MANIFEST_IO_FAILED') return 4;
  if (['E2E_MANIFEST_INTAKE_INVALID', 'E2E_MANIFEST_SOURCE_BUILD_INVALID', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 'E2E_MANIFEST_DRIVER_INVALID', 'E2E_MANIFEST_JOIN_MISMATCH', 'E2E_MANIFEST_TRANSACTION_INVALID'].includes(code)) return 3;
  return 2;
}

export function fail(code, stage, message) {
  throw new E2eManifestV02Error(code, stage, message);
}

function treeRef(refs) {
  return Object.freeze({
    kind: 'PROFILE_ASSET_TREE',
    path: PROFILE_ASSET_ROOT,
    byte_length: refs.reduce((total, ref) => total + ref.byte_length, 0),
    sha256: sha256(Buffer.from(jcs({ schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: PROFILE_ASSET_ROOT, entries: refs }), 'utf8'))
  });
}

function sameRefs(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameRef(item, right[index]));
}

function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

async function readSingleLinkRegularFile(path) {
  try {
    const before = await lstat(path);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) throw new Error('unsafe source entry');
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (after.isSymbolicLink() || !after.isFile() || after.nlink !== 1 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('source entry changed during read');
    return bytes;
  } catch {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'SOURCE_PROFILE_5_RAW', 'Profile source asset must be a stable single-link regular file.');
  }
}

async function nearestExistingDirectory(target) {
  let cursor = target;
  const missing = [];
  while (true) {
    try {
      const details = await lstat(cursor);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING_ISOLATION', 'profile-asset-root nearest existing parent must be a real directory.');
      return { real: await realpath(cursor), missing };
    } catch (error) {
      if (error instanceof E2eManifestV02Error) throw error;
      if (error?.code !== 'ENOENT') fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING_ISOLATION', error.message);
      const parent = dirname(cursor);
      if (parent === cursor) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING_ISOLATION', 'profile-asset-root has no existing parent.');
      missing.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

async function assertIsolated(lexicalTarget, realTarget, isolatedRoots) {
  for (const root of isolatedRoots) {
    const lexicalRoot = resolve(root);
    let realRoot;
    try { realRoot = await realpath(lexicalRoot); }
    catch (error) { fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING_ISOLATION', error.message); }
    if (sameOrNested(lexicalTarget, lexicalRoot) || sameOrNested(lexicalRoot, lexicalTarget)
      || sameOrNested(realTarget, realRoot) || sameOrNested(realRoot, realTarget)) {
      fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING_ISOLATION', 'profile-asset-root must be isolated from every controlled root.');
    }
  }
}

function sameOrNested(candidate, root) {
  const relation = relative(root, candidate);
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function resolveWithin(root, item, code, stage) {
  const path = resolve(root, item);
  const relation = relative(root, path);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail(code, stage, 'Fixed Profile asset path escapes its root.');
  return path;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
