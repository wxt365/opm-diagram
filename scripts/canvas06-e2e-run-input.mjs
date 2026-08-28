import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const ACTIVE_MANIFEST_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json', import.meta.url), 'utf8'));
const activeManifestAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(activeManifestAjv);
const validateActiveManifest = activeManifestAjv.compile(ACTIVE_MANIFEST_SCHEMA);

const RUN_VALUE_OPTIONS = [
  'input-mode', 'manifest-root', 'manifest', 'profile-asset-root', 'source-root', 'java-home', 'browser-executable',
  'runtime-port', 'web-port', 'output-root', 'out'
];
const VERIFY_VALUE_OPTIONS = [
  'scope', 'input-mode', 'evidence-root', 'manifest-root', 'manifest', 'profile-asset-root', 'report'
];
const ATTEMPT_VERIFY_VALUE_OPTIONS = ['scope', 'manifest-root', 'manifest', 'profile-asset-root', 'attempt-root', 'report-root'];
const PRODUCTION_VALUE_OPTIONS = ['handoff-root', 'intake-report'];
const CONTROLLED_VALUE_OPTIONS = ['controlled-bundle-root'];
const PRODUCTION_FLAGS = new Set(['require-production', 'require-ready']);

export class E2eRunInputError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseRunOptions(argv) {
  const options = parseOptions({ argv, valueOptions: RUN_VALUE_OPTIONS, allowReady: false });
  validateMode(options, { requireProduction: true, allowReady: false });
  assertPortPair(options);
  return Object.freeze(options);
}

export function parseVerifyOptions(argv) {
  const options = parseOptions({ argv, valueOptions: VERIFY_VALUE_OPTIONS, allowReady: true });
  if (options.scope !== 'REPORT') fail('E2E_RUN_ARGUMENT_INVALID', '--scope must be REPORT.');
  validateMode(options, { requireProduction: true, allowReady: true });
  return Object.freeze(options);
}

/** 解析活动 Attempt 0.2 verifier 的封闭只读命令行。 */
export function parseAttemptVerifyOptions(argv) {
  const options = parseOptions({ argv, valueOptions: ATTEMPT_VERIFY_VALUE_OPTIONS, allowReady: false, allowModeOptions: false });
  if (options.scope !== 'ATTEMPT') fail('E2E_RUN_ARGUMENT_INVALID', '--scope must be ATTEMPT.');
  if (!safeRelativePath(options.manifest)) fail('E2E_RUN_ARGUMENT_INVALID', '--manifest must be a safe manifest-root relative path.');
  const attemptRoot = resolve(options['attempt-root']);
  const reportRoot = resolve(options['report-root']);
  if (!isInside(reportRoot, attemptRoot)) fail('E2E_RUN_ARGUMENT_INVALID', '--attempt-root must be inside --report-root.');
  return Object.freeze({ ...options, 'attempt-root': attemptRoot, 'report-root': reportRoot,
    'manifest-root': resolve(options['manifest-root']), 'profile-asset-root': resolve(options['profile-asset-root']) });
}

/**
 * 读取活动 Manifest 及其受控 Profile 资产。该函数只返回已按原始字节验证的输入，
 * 不推断路径、不修复文件，也不读取 checkout 或运行时 classpath。
 */
export async function loadActiveAttemptManifest({ manifestRoot, manifest, profileAssetRoot }) {
  const root = resolve(manifestRoot);
  const profileRoot = resolve(profileAssetRoot);
  if (!safeRelativePath(manifest)) fail('E2E_INPUT_INVALID', 'Manifest must be a safe manifest-root relative path.');
  await assertDirectory(root, 'E2E_INPUT_INVALID');
  await assertDirectory(profileRoot, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 3);
  const manifestPath = resolve(root, manifest);
  if (!isInside(root, manifestPath)) fail('E2E_INPUT_INVALID', 'Manifest escapes manifest-root.');
  const manifestBytes = await readRegularFile(manifestPath, 'E2E_INPUT_INVALID');
  let value;
  try { value = JSON.parse(manifestBytes.toString('utf8')); } catch { fail('E2E_INPUT_INVALID', 'Manifest must be valid UTF-8 JSON.'); }
  if (!validateActiveManifest(value) || value.schema_id !== 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001'
      || value.schema_version !== '0.2' || value.manifest_version !== '0.2.0') {
    fail('E2E_INPUT_INVALID', 'Manifest is not the active 0.2 contract.');
  }
  const sourceDateEpoch = parseUtcWholeSecond(value.generated_at);
  const profileAssets = await loadProfileAssets({ manifest: value, profileRoot });
  const manifestRaw = rawRef(root, manifestPath, manifestBytes, 'E2E_MANIFEST');
  const { bytes: ignoredManifestBytes, ...manifestRef } = manifestRaw;
  return Object.freeze({
    manifest: value,
    manifestRoot: root,
    manifestPath,
    manifestBytes,
    manifestRef: Object.freeze(manifestRef),
    profileRoot,
    sourceDateEpoch,
    ...profileAssets
  });
}

/**
 * 从已验证的活动 Manifest 选择一个 Common attempt 的唯一输入集合。
 * 此处不读取 checkout，也不为缺失项推断默认路径。
 */
export function selectCommonAttemptInputs({ manifestInput, caseEntry }) {
  if (!manifestInput?.manifest || !manifestInput.manifestRoot || !manifestInput.profileRoot || !caseEntry?.case_id) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled attempt requires a verified Manifest input and case entry.');
  }
  const manifest = manifestInput.manifest;
  const manifestCase = manifest.cases?.filter(entry => entry?.case_id === caseEntry.case_id) ?? [];
  if (manifestCase.length !== 1 || manifestCase[0].driver_id !== 'DRIVER-COMMON'
      || canonicalizeJcs(caseEntry) !== canonicalizeJcs(manifestCase[0])) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled attempt case must be exactly one Common Manifest entry.');
  }
  const sourceBuild = manifest.source_build;
  if (sourceBuild?.local_runtime_jar?.kind !== 'LOCAL_RUNTIME_JAR'
      || sourceBuild.local_runtime_jar.path !== 'inputs/build/local-runtime.jar'
      || sourceBuild?.web_dist?.kind !== 'WEB_DIST_TREE'
      || sourceBuild.web_dist.path !== 'inputs/build/web-dist') {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest build references do not match the frozen attempt layout.', 3);
  }
  const expectedDrivers = [
    ['DRIVER-PROCEDURAL', 'inputs/drivers/procedural-driver.mjs'],
    ['DRIVER-CONTROL', 'inputs/drivers/control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'inputs/drivers/structural-driver.mjs'],
    ['DRIVER-COMMON', 'inputs/drivers/common-driver.mjs']
  ];
  const drivers = manifest.driver_catalog;
  if (!Array.isArray(drivers) || drivers.length !== expectedDrivers.length || drivers.some((driver, index) => {
    const [driverId, path] = expectedDrivers[index];
    return driver?.driver_id !== driverId || driver.source_ref?.kind !== 'E2E_DRIVER_SOURCE' || driver.source_ref?.path !== path;
  })) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest four-driver closure is invalid.', 3);
  }
  return Object.freeze({
    caseEntry: Object.freeze({ ...manifestCase[0] }),
    runtimeJarRef: Object.freeze({ ...sourceBuild.local_runtime_jar }),
    webDistRef: Object.freeze({ ...sourceBuild.web_dist }),
    profileAssetRefs: Object.freeze(manifestInput.profileAssetRefs.map(reference => Object.freeze({ ...reference }))),
    drivers: Object.freeze(drivers.map(driver => Object.freeze({ driver_id: driver.driver_id, source_ref: Object.freeze({ ...driver.source_ref }) })))
  });
}

export function parseUtcWholeSecond(value) {
  if (typeof value !== 'string') fail('E2E_INPUT_INVALID', 'Manifest generated_at must be a string.');
  const epochMilliseconds = Date.parse(value);
  if (!Number.isFinite(epochMilliseconds) || epochMilliseconds % 1000 !== 0) {
    fail('E2E_INPUT_INVALID', 'Manifest generated_at must be a UTC whole second.');
  }
  const canonical = new Date(epochMilliseconds).toISOString().replace('.000Z', 'Z');
  if (canonical !== value) fail('E2E_INPUT_INVALID', 'Manifest generated_at is not canonical UTC whole-second text.');
  return epochMilliseconds / 1000;
}

export function fixedReportPath(reportId) {
  if (!/^dev-canvas-06\.e2e-report\.[a-f0-9]{12}\.[a-f0-9]{12}$/.test(reportId)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'report_id is invalid.');
  }
  return `dev-canvas-06/e2e/reports/${reportId}/dev-canvas-06-e2e-report.json`;
}

export function resolveReportRoot({ outputRoot, out, reportId }) {
  if (!safeRelativePath(out) || out !== fixedReportPath(reportId)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'out must be the fixed relative path derived from report_id.');
  }
  const root = resolve(outputRoot);
  const reportPath = resolve(root, out);
  if (!isInside(root, reportPath)) fail('E2E_RUN_ARGUMENT_INVALID', 'out escapes output-root.');
  return Object.freeze({ outputRoot: root, reportPath, reportRoot: resolve(reportPath, '..') });
}

export function resolveVerifierReport({ evidenceRoot, report }) {
  const root = resolve(evidenceRoot);
  if (!safeRelativePath(report)) fail('E2E_RUN_ARGUMENT_INVALID', 'report must be a safe evidence-root relative path.');
  const path = resolve(root, report);
  if (!isInside(root, path)) fail('E2E_RUN_ARGUMENT_INVALID', 'report escapes evidence-root.');
  return Object.freeze({ evidenceRoot: root, reportPath: path, reportRoot: resolve(path, '..') });
}

export function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

async function loadProfileAssets({ manifest, profileRoot }) {
  const tree = manifest.profile_asset_tree_ref;
  const refs = manifest.profile_asset_refs;
  const expectedRoot = 'inputs/upstream/profile-assets';
  const kinds = ['GRAMMAR_ASSET', 'NORMALIZATION_DATA', 'PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET'];
  if (!tree || tree.kind !== 'PROFILE_ASSET_TREE' || tree.path !== expectedRoot || !Array.isArray(refs)
      || refs.length !== kinds.length || refs.some((item, index) => item?.kind !== kinds[index]) || !isUtf8PathOrder(refs)) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Manifest Profile asset identity is not closed.', 3);
  }
  const paths = new Set();
  const assets = [];
  for (const ref of refs) {
    if (!safeRelativePath(ref.path) || !ref.path.startsWith(`${expectedRoot}/`)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Manifest Profile asset path is invalid.', 3);
    }
    const path = ref.path.slice(expectedRoot.length + 1);
    if (!safeRelativePath(path) || paths.has(path)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Manifest Profile asset paths are not unique.', 3);
    paths.add(path);
    const absolute = resolve(profileRoot, path);
    if (!isInside(profileRoot, absolute)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset escapes profile-asset-root.', 3);
    const bytes = await readRegularFile(absolute, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 3);
    const actual = rawRef(profileRoot, absolute, bytes, ref.kind);
    if (!sameRawRef(actual, { ...ref, path })) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset raw reference differs from bytes.', 3);
    assets.push(Object.freeze({ ...actual, manifestRef: Object.freeze({ ...ref }) }));
  }
  await assertExactTree(profileRoot, paths);
  const treePreimage = {
    schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: expectedRoot,
    entries: refs.map(ref => ({ kind: ref.kind, path: ref.path, byte_length: ref.byte_length, sha256: ref.sha256 }))
  };
  const total = assets.reduce((sum, asset) => sum + asset.byte_length, 0);
  if (tree.byte_length !== total || tree.sha256 !== sha256Jcs(treePreimage)) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset tree digest differs from raw assets.', 3);
  }
  const profileAsset = assets.find(asset => asset.kind === 'PROFILE_PACKAGE');
  const profile = parseJson(profileAsset.bytes, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 3);
  const activeBinding = deriveProfileBinding({ profile, assets });
  return Object.freeze({
    profileAssetTreeRef: Object.freeze({ ...tree }),
    profileAssetRefs: Object.freeze(assets.map(asset => Object.freeze({ kind: asset.kind, path: asset.manifestRef.path, byte_length: asset.byte_length, sha256: asset.sha256 }))),
    profilePackageDigest: activeBinding.profile.sha256,
    activeBinding
  });
}

function deriveProfileBinding({ profile, assets }) {
  const byKind = new Map(assets.map(asset => [asset.kind, asset]));
  const entries = profile?.manifest?.entries;
  if (!Array.isArray(entries) || entries.length !== 4 || !profile?.identity?.profile_id || !profile?.identity?.package_version) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile package identity is incomplete.', 3);
  }
  const mapping = [
    ['RULE_SET', 'rule_set', 'rule_set_id', 'rule_set_version', null],
    ['GRAMMAR_ASSET', 'text_grammar', 'asset_id', 'asset_version', 'text_grammar_ref'],
    ['SYMBOL_ASSET', 'symbol_catalog', 'asset_id', 'asset_version', 'symbol_catalog_ref'],
    ['NORMALIZATION_DATA', 'normalization_adapter', 'asset_id', 'asset_version', 'normalization_adapter_ref']
  ];
  const required = new Map();
  for (const entry of entries) {
    if (!entry?.required || required.has(entry.role) || !mapping.some(([role]) => role === entry.role)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile package dependency set is invalid.', 3);
    }
    required.set(entry.role, entry);
  }
  if (required.size !== mapping.length) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile package dependencies are incomplete.', 3);
  const rows = [];
  const binding = { profile: { id: profile.identity.profile_id, version: profile.identity.package_version, sha256: null } };
  for (const [role, bindingKey, idField, versionField, profileRefKey] of mapping) {
    const asset = byKind.get(role);
    const entry = required.get(role);
    if (!asset || entry.logical_path !== asset.path || entry.byte_length !== asset.byte_length || entry.digest?.digest !== asset.sha256) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile package dependency differs from its raw asset.', 3);
    }
    const assetValue = parseJson(asset.bytes, 'E2E_MANIFEST_PROFILE_ASSET_INVALID', 3);
    const reference = { id: assetValue?.[idField], version: assetValue?.[versionField], sha256: asset.sha256 };
    if (typeof reference.id !== 'string' || typeof reference.version !== 'string') {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset identity is invalid.', 3);
    }
    if (profileRefKey && !sameAssetReference(profile[profileRefKey], reference)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile direct asset binding differs from raw asset.', 3);
    }
    binding[bindingKey] = reference;
    rows.push(`${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`);
  }
  rows.sort(compareUtf8);
  const packageDigest = sha256(Buffer.from(rows.join(''), 'utf8'));
  if (profile.manifest?.package_digest?.digest !== packageDigest) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile package digest is invalid.', 3);
  }
  binding.profile.sha256 = packageDigest;
  binding.binding_digest = sha256(Buffer.from([
    ['PROFILE', binding.profile], ['RULE_SET', binding.rule_set], ['GRAMMAR_ASSET', binding.text_grammar],
    ['SYMBOL_ASSET', binding.symbol_catalog], ['NORMALIZATION_DATA', binding.normalization_adapter]
  ].map(([role, reference]) => `${role}\t${reference.id}\t${reference.version}\t${reference.sha256}\n`).join(''), 'utf8'));
  return Object.freeze(binding);
}

async function assertExactTree(root, expected) {
  const actual = new Set();
  await visit(root, '');
  if (actual.size !== expected.size || [...actual].some(path => !expected.has(path))) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset root contains extra or missing files.', 3);
  }
  async function visit(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = resolve(directory, entry.name);
      const details = await lstat(path);
      if (details.isSymbolicLink()) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset root contains a symlink.', 3);
      if (details.isDirectory()) await visit(path, relativePath);
      else if (details.isFile() && details.nlink === 1) actual.add(relativePath);
      else fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'Profile asset root contains an unsafe entry.', 3);
    }
  }
}

async function assertDirectory(path, code, exitCode) {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a non-symlink directory.', exitCode); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail(code, 'Expected a non-symlink directory.', exitCode);
}

async function readRegularFile(path, code, exitCode) {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a single-link regular file.', exitCode); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(code, 'Expected a single-link regular file.', exitCode);
  return readFile(path);
}

function rawRef(root, path, bytes, kind) {
  return Object.freeze({ kind, path: relative(root, path).split(sep).join('/'), byte_length: bytes.length, sha256: sha256(bytes), bytes });
}

function parseJson(bytes, code, exitCode) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(code, 'Expected valid UTF-8 JSON.', exitCode); }
}

function sameRawRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function sameAssetReference(value, expected) {
  return value?.id === expected.id && value?.version === expected.version && value?.digest?.digest === expected.sha256;
}

function isUtf8PathOrder(values) {
  return values.every((value, index) => index === 0 || compareUtf8(values[index - 1].path, value.path) < 0);
}

function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
function sha256Jcs(value) { return sha256(Buffer.from(canonicalizeJcs(value), 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function parseOptions({ argv, valueOptions, allowReady, allowModeOptions = true }) {
  const values = new Map();
  const allowedValues = new Set([...valueOptions, ...(allowModeOptions ? [...PRODUCTION_VALUE_OPTIONS, ...CONTROLLED_VALUE_OPTIONS] : [])]);
  for (let index = 0; index < argv.length;) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || flag.includes('=')) fail('E2E_RUN_ARGUMENT_INVALID', 'Arguments must use supported flags without equals syntax.');
    const key = flag.slice(2);
    if (allowModeOptions && PRODUCTION_FLAGS.has(key)) {
      if (key === 'require-ready' && !allowReady || values.has(key)) fail('E2E_RUN_ARGUMENT_INVALID', `--${key} is invalid or repeated.`);
      values.set(key, true);
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!allowedValues.has(key) || !value || value.startsWith('--') || values.has(key)) {
      fail('E2E_RUN_ARGUMENT_INVALID', 'Each supported --flag <value> is required exactly once.');
    }
    values.set(key, value);
    index += 2;
  }
  const result = Object.fromEntries(values);
  for (const required of valueOptions) if (!Object.hasOwn(result, required)) fail('E2E_RUN_ARGUMENT_INVALID', `Missing --${required}.`);
  return result;
}

function validateMode(options, { requireProduction, allowReady }) {
  const mode = options['input-mode'];
  if (!['CONTROLLED_TEST', 'PRODUCTION_HANDOFF'].includes(mode)) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', 'input-mode must be CONTROLLED_TEST or PRODUCTION_HANDOFF.');
  }
  const active = mode === 'PRODUCTION_HANDOFF' ? PRODUCTION_VALUE_OPTIONS : CONTROLLED_VALUE_OPTIONS;
  const inactive = mode === 'PRODUCTION_HANDOFF' ? CONTROLLED_VALUE_OPTIONS : PRODUCTION_VALUE_OPTIONS;
  for (const key of active) if (!Object.hasOwn(options, key)) fail('E2E_RUN_ARGUMENT_INVALID', `Missing --${key}.`);
  for (const key of inactive) if (Object.hasOwn(options, key)) fail('E2E_RUN_INPUT_CLASS_INVALID', `--${key} is invalid for ${mode}.`);
  if (mode === 'PRODUCTION_HANDOFF' && requireProduction && options['require-production'] !== true) {
    fail('E2E_RUN_ARGUMENT_INVALID', '--require-production is required for PRODUCTION_HANDOFF.');
  }
  if (mode === 'CONTROLLED_TEST' && (options['require-production'] || options['require-ready'])) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', 'Controlled mode cannot use production or ready flags.');
  }
  if (options['require-ready'] && (!allowReady || mode !== 'PRODUCTION_HANDOFF')) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', '--require-ready is valid only for production verification.');
  }
}

function assertPortPair(options) {
  for (const key of ['runtime-port', 'web-port']) {
    const value = options[key];
    if (!/^(?:[1-9][0-9]{3,4})$/.test(value) || Number(value) > 65535) {
      fail('E2E_RUN_ARGUMENT_INVALID', `--${key} must be in 1024..65535.`);
    }
  }
  if (options['runtime-port'] === options['web-port']) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'runtime-port and web-port must differ.');
  }
}

function isInside(root, child) {
  const relation = relative(resolve(root), resolve(child));
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function fail(code, message, exitCode) {
  throw new E2eRunInputError(code, message, exitCode);
}
