import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { jcs } from './canvas06-e2e-manifest-v01-support.mjs';
import { fail } from './canvas06-e2e-manifest-v02-input.mjs';

const ORDER = Object.freeze([
  ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'],
  ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'],
  ['PROFILE_PACKAGE', 'profile.json'],
  ['RULE_SET', 'rules/representative-rule-set.json'],
  ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
]);

export async function loadProfileAssetClosure({ assetRoot, manifestRootPath = 'inputs/upstream/profile-assets', activeBinding }) {
  const root = resolve(assetRoot);
  const profilePath = inside(root, 'profile.json');
  const profileBytes = await regularFile(profilePath);
  const profile = parseJson(profileBytes);
  const required = requiredEntries(profile);
  const refs = [];
  const raw = new Map();
  for (const [kind, defaultPath] of ORDER) {
    const logicalPath = kind === 'PROFILE_PACKAGE' ? defaultPath : required.get(kind)?.logical_path;
    if (typeof logicalPath !== 'string' || (kind !== 'PROFILE_PACKAGE' && logicalPath !== defaultPath)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5_RAW', 'Profile asset paths are not the frozen five paths.');
    }
    const bytes = kind === 'PROFILE_PACKAGE' ? profileBytes : await regularFile(inside(root, logicalPath));
    const ref = Object.freeze({ kind, path: `${manifestRootPath}/${logicalPath}`, byte_length: bytes.length, sha256: sha256(bytes) });
    refs.push(ref);
    raw.set(kind, { logicalPath, bytes, ref });
  }
  await assertExactTree(root, new Set(raw.values().map(value => value.logicalPath)));
  const binding = deriveBinding(profile, raw);
  if (activeBinding && JSON.stringify(binding) !== JSON.stringify(activeBinding)) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'BINDING_JOIN', 'Profile raw bytes do not close the active Profile binding.');
  }
  const tree = Object.freeze({
    kind: 'PROFILE_ASSET_TREE', path: manifestRootPath,
    byte_length: refs.reduce((total, ref) => total + ref.byte_length, 0),
    sha256: sha256(Buffer.from(jcs({ schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: manifestRootPath, entries: refs }), 'utf8'))
  });
  return Object.freeze({ profile_asset_refs: Object.freeze(refs), profile_asset_tree_ref: tree, active_binding: binding });
}

export function profileAssetRelativePath(reference, manifestRootPath = 'inputs/upstream/profile-assets') {
  const prefix = `${manifestRootPath}/`;
  if (!reference?.path?.startsWith(prefix)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5_RAW', 'Profile asset ref escapes its frozen tree.');
  return reference.path.slice(prefix.length);
}

function requiredEntries(profile) {
  const entries = profile?.manifest?.entries;
  const required = new Map();
  if (!Array.isArray(entries) || entries.length !== 4) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PACKAGE_DIGEST', 'Profile package dependencies are incomplete.');
  for (const entry of entries) {
    if (!entry?.required || !['RULE_SET', 'GRAMMAR_ASSET', 'SYMBOL_ASSET', 'NORMALIZATION_DATA'].includes(entry.role) || required.has(entry.role)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PACKAGE_DIGEST', 'Profile package dependency roles are invalid.');
    }
    required.set(entry.role, entry);
  }
  return required;
}

function deriveBinding(profile, raw) {
  if (!profile?.identity?.profile_id || !profile?.identity?.package_version) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'BINDING_JOIN', 'Profile package identity is missing.');
  }
  const fields = [
    ['RULE_SET', 'rule_set', 'rule_set_id', 'rule_set_version', null],
    ['GRAMMAR_ASSET', 'text_grammar', 'asset_id', 'asset_version', 'text_grammar_ref'],
    ['SYMBOL_ASSET', 'symbol_catalog', 'asset_id', 'asset_version', 'symbol_catalog_ref'],
    ['NORMALIZATION_DATA', 'normalization_adapter', 'asset_id', 'asset_version', 'normalization_adapter_ref']
  ];
  const binding = { profile: { id: profile.identity.profile_id, version: profile.identity.package_version, sha256: null } };
  const rows = [];
  for (const [kind, bindingKey, idField, versionField, directRef] of fields) {
    const entry = profile.manifest.entries.find(value => value.role === kind);
    const asset = raw.get(kind);
    if (!asset || entry.logical_path !== asset.logicalPath || entry.byte_length !== asset.bytes.length || entry.digest?.digest !== asset.ref.sha256) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PACKAGE_DIGEST', 'Profile package dependency differs from raw bytes.');
    }
    const value = parseJson(asset.bytes);
    const reference = { id: value?.[idField], version: value?.[versionField], sha256: asset.ref.sha256 };
    if (typeof reference.id !== 'string' || typeof reference.version !== 'string' || directRef && !sameReference(profile[directRef], reference)) {
      fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'BINDING_JOIN', 'Profile asset identity differs from package binding.');
    }
    binding[bindingKey] = reference;
    rows.push(`${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`);
  }
  rows.sort(compareUtf8);
  binding.profile.sha256 = sha256(Buffer.from(rows.join(''), 'utf8'));
  if (profile.manifest.package_digest?.digest !== binding.profile.sha256) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PACKAGE_DIGEST', 'Profile package digest differs from dependency bytes.');
  }
  binding.binding_digest = sha256(Buffer.from([
    ['PROFILE', binding.profile], ['RULE_SET', binding.rule_set], ['GRAMMAR_ASSET', binding.text_grammar],
    ['SYMBOL_ASSET', binding.symbol_catalog], ['NORMALIZATION_DATA', binding.normalization_adapter]
  ].map(([role, ref]) => `${role}\t${ref.id}\t${ref.version}\t${ref.sha256}\n`).join(''), 'utf8'));
  return Object.freeze(binding);
}

async function assertExactTree(root, expected) {
  const actual = new Set();
  await visit(root, '');
  if (actual.size !== expected.size || [...actual].some(path => !expected.has(path))) {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_TREE', 'Profile asset root has an extra or missing file.');
  }
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const item = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = resolve(directory, entry.name);
      const details = await lstat(path);
      if (details.isSymbolicLink() || !details.isDirectory() && (!details.isFile() || details.nlink !== 1)) {
        fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_TREE', 'Profile asset root contains an unsafe entry.');
      }
      if (details.isDirectory()) await visit(path, item);
      else actual.add(item);
    }
  }
}

async function regularFile(path) {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) throw new Error('unsafe');
    return await readFile(path);
  } catch {
    fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5_RAW', 'Profile asset must be a single-link regular file.');
  }
}

function inside(root, value) {
  const path = resolve(root, value);
  const relation = relative(root, path);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5_RAW', 'Profile asset path escapes the root.');
  return path;
}

function parseJson(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5_RAW', 'Profile asset must be JSON.'); }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sameReference(left, right) { return left?.id === right.id && left?.version === right.version && (left?.sha256 ?? left?.digest?.digest) === right.sha256; }
function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
