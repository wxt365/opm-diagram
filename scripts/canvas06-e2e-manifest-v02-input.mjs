import { copyFile, lstat, mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

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

export const PROFILE_SOURCE_ASSETS = Object.freeze([
  ['packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json', 'profile.json'],
  ['packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json', 'rules/representative-rule-set.json'],
  ['packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json', 'grammar/representative-opl-grammar.json'],
  ['packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json', 'symbols/representative-symbol-catalog.json'],
  ['packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json', 'normalization/representative-normalization.json']
]);

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

/** 从 clean source 的五个分散资产逐字节创建唯一的临时 Profile 根。 */
export async function materializeProfileAssetStaging({ sourceRoot, stagingRoot }) {
  const source = resolve(sourceRoot);
  const target = resolve(stagingRoot);
  if (overlaps(source, target)) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING', 'profile-asset-root must not overlap source-root.');
  await requireAbsent(target, 'PROFILE_STAGING');
  try {
    await mkdir(target, { recursive: false });
    for (const [sourcePath, logicalPath] of PROFILE_SOURCE_ASSETS) {
      const input = inside(source, sourcePath);
      const output = inside(target, logicalPath);
      await assertSingleFile(input, 'PROFILE_5_RAW');
      await mkdir(dirname(output), { recursive: true });
      await copyFile(input, output, COPYFILE_EXCL);
      await assertSingleFile(output, 'PROFILE_STAGING');
      const [left, right] = await Promise.all([readFile(input), readFile(output)]);
      if (!left.equals(right)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_STAGING', `Profile asset copy differs: ${logicalPath}.`);
    }
    await fsyncProfileTree(target);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  return target;
}

export async function removeProfileAssetStaging(stagingRoot) {
  const target = resolve(stagingRoot);
  try {
    await rm(target, { recursive: true, force: false });
    await fsync(target === dirname(target) ? target : dirname(target));
  }
  catch { fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING_CLEANUP', 'Profile staging root cannot be removed.'); }
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
  const mode = values.get('input-mode');
  if (!['PRODUCTION_HANDOFF', 'CONTROLLED_TEST'].includes(mode)) {
    fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'MODE', 'input-mode must be PRODUCTION_HANDOFF or CONTROLLED_TEST.');
  }
  for (const name of common) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `Missing --${name}.`);
  const active = mode === 'PRODUCTION_HANDOFF' ? PRODUCTION : CONTROLLED;
  const inactive = mode === 'PRODUCTION_HANDOFF' ? CONTROLLED : PRODUCTION;
  for (const name of active) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', `Missing --${name}.`);
  for (const name of inactive) if (values.has(name)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'MODE', `--${name} is invalid for ${mode}.`);
  if (role === 'producer') formatSourceDateEpoch(values.get('source-date-epoch'));
  return Object.freeze(Object.fromEntries(values));
}

const COPYFILE_EXCL = 1;

async function requireAbsent(path, stage) {
  try {
    await lstat(path);
    fail('E2E_MANIFEST_TRANSACTION_INVALID', stage, 'Target must not exist before this invocation.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function assertSingleFile(path, stage) {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) throw new Error('unsafe');
  } catch {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', stage, 'Profile asset must be a single-link regular file.');
  }
}

async function fsyncProfileTree(root) {
  const directories = new Set([root]);
  for (const [, logicalPath] of PROFILE_SOURCE_ASSETS) {
    const path = inside(root, logicalPath);
    directories.add(dirname(path));
    await fsync(path);
  }
  for (const path of [...directories].sort((left, right) => right.length - left.length)) await fsync(path);
}

async function fsync(path) {
  try {
    const handle = await open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch {
    fail('E2E_MANIFEST_IO_FAILED', 'PROFILE_STAGING', 'Profile staging fsync failed.');
  }
}

function inside(root, value) {
  const target = resolve(root, value);
  const relation = relative(root, target);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'Path escapes its root.');
  return target;
}

function overlaps(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`);
}

function exitCodeFor(code) {
  if (code === 'E2E_MANIFEST_IO_FAILED') return 4;
  if (['E2E_MANIFEST_INTAKE_INVALID', 'E2E_MANIFEST_SOURCE_BUILD_INVALID', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 'E2E_MANIFEST_DRIVER_INVALID', 'E2E_MANIFEST_JOIN_MISMATCH', 'E2E_MANIFEST_TRANSACTION_INVALID'].includes(code)) return 3;
  return 2;
}

export function fail(code, stage, message) {
  throw new E2eManifestV02Error(code, stage, message);
}
