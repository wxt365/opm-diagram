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
const VERIFIER_COMMON = Object.freeze(['input-mode', 'manifest-root', 'manifest', 'profile-asset-root']);
const PRODUCTION = Object.freeze(['handoff-root', 'intake-report', 'require-production']);
const CONTROLLED = Object.freeze(['controlled-bundle-root']);
const DRIVER_CATALOG = Object.freeze([
  ['DRIVER-PROCEDURAL', 'inputs/drivers/procedural-driver.mjs'],
  ['DRIVER-CONTROL', 'inputs/drivers/control-driver.mjs'],
  ['DRIVER-STRUCTURAL', 'inputs/drivers/structural-driver.mjs'],
  ['DRIVER-COMMON', 'inputs/drivers/common-driver.mjs']
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

function exitCodeFor(code) {
  if (code === 'E2E_MANIFEST_IO_FAILED') return 4;
  if (['E2E_MANIFEST_INTAKE_INVALID', 'E2E_MANIFEST_SOURCE_BUILD_INVALID', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 'E2E_MANIFEST_DRIVER_INVALID', 'E2E_MANIFEST_JOIN_MISMATCH', 'E2E_MANIFEST_TRANSACTION_INVALID'].includes(code)) return 3;
  return 2;
}

export function fail(code, stage, message) {
  throw new E2eManifestV02Error(code, stage, message);
}
