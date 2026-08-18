import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { RecoveryTemplateError, loadRecoveryTemplate as loadFrozenTemplate } from './recovery-template-verifier.mjs';

const PROFILE_ROLES = [
  ['profile_ref', 'PROFILE_PACKAGE', 'profile', 'profile.json'],
  ['rule_set_ref', 'RULE_SET', 'rule_set', 'rules/representative-rule-set.json'],
  ['symbol_catalog_ref', 'SYMBOL_ASSET', 'symbol_catalog', 'symbols/representative-symbol-catalog.json'],
  ['text_grammar_ref', 'GRAMMAR_ASSET', 'text_grammar', 'grammar/representative-opl-grammar.json'],
  ['normalization_adapter_ref', 'NORMALIZATION_DATA', 'normalization_adapter', 'normalization/representative-normalization.json']
];

export class RecoveryFactoryError extends Error {
  constructor(message, code = 'RECOVERY_FIXTURE_MISMATCH') {
    super(message);
    this.name = 'RecoveryFactoryError';
    this.code = code;
    this.exitCode = 2;
  }
}

/**
 * 读取一份 Recovery Template，并将其绑定到同一 evidence root 内的 Manifest、
 * Handoff、READY Intake、Runtime 和 Profile 五资产。该函数完全只读。
 */
export async function loadRecoveryTemplate({ evidenceRoot, manifestRef, templateSourceRef, expectedFixtureId }) {
  const root = resolve(evidenceRoot);
  await assertDirectory(root, 'Evidence root');
  const manifest = await readJsonReference(root, manifestRef, 'RECOVERY_MANIFEST', 'Recovery Manifest');
  validateManifest(manifest.value);

  const fixture = manifest.value.fixture_catalog.find(item => item.fixture_id === expectedFixtureId);
  if (!fixture || !sameRef(fixture.source_ref, templateSourceRef)) fail('Recovery Manifest fixture reference differs from the requested Template.');

  let frozen;
  try {
    frozen = await loadFrozenTemplate({ evidenceRoot: root, templateSourceRef, expectedFixtureId });
  } catch (error) {
    if (error instanceof RecoveryTemplateError) fail(error.message);
    throw error;
  }
  if (fixture.fixture_digest !== frozen.fixture_digest
      || !sameJson(fixture.expected_result_digests, frozen.template.expected_result_digests)) {
    fail('Recovery Manifest fixture identity differs from the immutable Template.');
  }

  const handoff = await readJsonReference(root, manifest.value.handoff_ref, 'HANDOFF', 'Handoff');
  const intake = await readJsonReference(root, manifest.value.intake_report_ref, 'INTAKE_REPORT', 'Intake Report');
  const runtimeRef = manifest.value.source_build.local_runtime_jar;
  await readRawReference(root, runtimeRef, 'LOCAL_RUNTIME_JAR', 'Runtime JAR');
  validateHandoff(handoff.value, manifest.value, frozen.template);
  validateIntake(intake.value, manifest.value.handoff_ref);
  const profileSourceRefs = await loadProfileSourceRefs(root, handoff.value.active_binding);
  validateTemplateBinding(frozen.template, handoff.value.active_binding, manifest.value);

  const modelBaseInputs = expectedFixtureId === 'RECOVERY-FIXTURE-MODEL'
    ? await loadModelBaseInputs(root, frozen.template)
    : [];

  return deepFreeze({
    fixture_id: frozen.fixture_id,
    template_source_ref: frozen.template_source_ref,
    template_payload_sha256: frozen.template_payload_sha256,
    fixture_digest: frozen.fixture_digest,
    manifest_ref: manifest.reference,
    handoff_ref: manifest.value.handoff_ref,
    intake_report_ref: manifest.value.intake_report_ref,
    source_build: manifest.value.source_build,
    runtime_jar_ref: runtimeRef,
    active_binding: handoff.value.active_binding,
    model_base_inputs: modelBaseInputs,
    profile_source_refs: profileSourceRefs,
    template: frozen.template
  });
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || manifest.schema_id !== 'OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001'
      || manifest.schema_version !== '0.2' || manifest.manifest_version !== '0.2.0'
      || !Array.isArray(manifest.fixture_catalog) || manifest.fixture_catalog.length !== 2
      || !manifest.source_build || typeof manifest.source_build !== 'object') {
    fail('Recovery Manifest identity is invalid.');
  }
  requireReference(manifest.handoff_ref, 'HANDOFF', 'Recovery Manifest Handoff');
  requireReference(manifest.intake_report_ref, 'INTAKE_REPORT', 'Recovery Manifest Intake');
  requireReference(manifest.source_build.local_runtime_jar, 'LOCAL_RUNTIME_JAR', 'Recovery Manifest Runtime JAR');
  for (const fixture of manifest.fixture_catalog) {
    if (!fixture || typeof fixture !== 'object' || !['RECOVERY-FIXTURE-MODEL', 'RECOVERY-FIXTURE-GATE'].includes(fixture.fixture_id)) {
      fail('Recovery Manifest fixture catalog is invalid.');
    }
    requireReference(fixture.source_ref, 'RECOVERY_TEMPLATE', 'Recovery Manifest Template');
    requireDigest(fixture.fixture_digest, 'Recovery Manifest fixture digest');
  }
}

function validateHandoff(handoff, manifest, template) {
  if (!handoff || handoff.schema_id !== 'OPM-DEV-CANVAS-05-HANDOFF-001'
      || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || !handoff.active_binding
      || !handoff.source_build || handoff.source_build.source_commit !== manifest.source_build.source_commit) {
    fail('Recovery Handoff is not the required READY input.');
  }
  if (!template.source_build_binding || template.source_build_binding.source_commit !== manifest.source_build.source_commit
      || !sameRef(template.source_build_binding.handoff_ref, manifest.handoff_ref)
      || !sameRef(template.source_build_binding.intake_report_ref, manifest.intake_report_ref)
      || !sameRef(template.source_build_binding.runtime_jar_ref, manifest.source_build.local_runtime_jar)) {
    fail('Recovery Template source build binding differs from the Manifest trust chain.');
  }
}

function validateIntake(intake, handoffRef) {
  if (!intake || intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION' || !intake.handoff_ref
      || intake.handoff_ref.kind !== 'HANDOFF' || intake.handoff_ref.sha256 !== handoffRef.sha256
      || intake.handoff_ref.byte_length !== handoffRef.byte_length) {
    fail('Recovery Intake does not close the READY Handoff reference.');
  }
}

function validateTemplateBinding(template, binding, manifest) {
  const expected = {
    profile_id: binding.profile?.id,
    profile_version: binding.profile?.version,
    rule_set_id: binding.rule_set?.id,
    rule_version: binding.rule_set?.version,
    text_grammar_id: binding.text_grammar?.id,
    text_grammar_version: binding.text_grammar?.version,
    symbol_catalog_id: binding.symbol_catalog?.id,
    symbol_catalog_version: binding.symbol_catalog?.version,
    normalization_adapter_id: binding.normalization_adapter?.id,
    normalization_adapter_version: binding.normalization_adapter?.version,
    binding_digest: binding.binding_digest
  };
  if (!sameJson(template.profile_binding, expected)
      || template.source_date_epoch !== Date.parse(manifest.generated_at) / 1000) {
    fail('Recovery Template active binding or source date differs from the Manifest.');
  }
}

async function loadModelBaseInputs(root, template) {
  const inputs = [];
  for (const scenario of template.command_scenarios) {
    const revision = await readJsonReference(root, scenario.base_revision_ref, 'MS_REV_001_V02', 'Base Revision');
    const value = revision.value;
    const identity = {
      schema_id: value.schema_id,
      schema_version: value.schema_version,
      project_id: scenario.project_id,
      model_id: value.model_id,
      revision_id: value.revision_id,
      revision_sequence: value.revision_sequence,
      parent_revision_id: value.parent_revision_id,
      context_id: scenario.context_id,
      history_mode: 'SINGLE_REVISION_SNAPSHOT'
    };
    if (value.schema_id !== 'MS-REV-001' || value.schema_version !== '0.2'
        || value.revision_id !== scenario.base_revision_identity.revision_id
        || value.revision_sequence !== scenario.base_revision_identity.revision_sequence
        || value.model_id !== scenario.base_revision_identity.model_id
        || scenario.context_id !== scenario.base_revision_identity.context_id) {
      fail('Recovery Base Revision identity differs from the Template scenario.');
    }
    inputs.push({ scenario_id: scenario.scenario_id, source_ref: scenario.base_revision_ref, base_revision_identity: identity });
  }
  return inputs;
}

async function loadProfileSourceRefs(root, binding) {
  const profileId = binding?.profile?.id;
  const version = binding?.profile?.version;
  if (!nonBlank(profileId) || !nonBlank(version)) fail('Recovery active Profile identity is invalid.');
  const basePath = `packages/profiles/${profileId}/${version}`;
  const refs = {};
  for (const [field, kind, bindingField, suffix] of PROFILE_ROLES) {
    const reference = await rawReference(root, `${basePath}/${suffix}`, kind, `Recovery Profile ${bindingField}`);
    if (bindingField !== 'profile' && reference.sha256 !== binding[bindingField]?.sha256) {
      fail('Recovery Profile asset digest differs from active binding.');
    }
    refs[field] = reference;
  }
  await validateProfilePackage(root, refs, binding.profile?.sha256);
  return refs;
}

async function validateProfilePackage(root, refs, expectedDigest) {
  const profile = await readJsonReference(root, refs.profile_ref, 'PROFILE_PACKAGE', 'Recovery Profile package');
  const entries = profile.value?.manifest?.entries;
  if (!Array.isArray(entries) || entries.length !== 4 || profile.value?.manifest?.package_digest?.algorithm !== 'sha256'
      || profile.value.manifest.package_digest.digest !== expectedDigest) {
    fail('Recovery Profile package identity is invalid.');
  }
  const expected = PROFILE_ROLES.slice(1).map(([field, kind, , suffix]) => ({ field, kind, suffix }));
  const ordered = [...entries].sort((left, right) => Buffer.compare(Buffer.from(left.logical_path, 'utf8'), Buffer.from(right.logical_path, 'utf8')));
  const preimage = [];
  for (const { field, kind, suffix } of expected) {
    const entry = entries.find(value => value.logical_path === suffix);
    const reference = refs[field];
    if (!entry || entry.required !== true || entry.digest?.algorithm !== 'sha256'
        || entry.digest.digest !== reference.sha256 || entry.byte_length !== reference.byte_length || reference.kind !== kind) {
      fail('Recovery Profile manifest entry differs from copied asset bytes.');
    }
  }
  for (const entry of ordered) preimage.push(`${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`);
  if (digest(Buffer.from(preimage.join(''), 'utf8')) !== expectedDigest) fail('Recovery Profile package digest differs from active binding.');
}

async function readJsonReference(root, reference, kind, label) {
  const bytes = await readRawReference(root, reference, kind, label);
  try {
    return { reference: { ...reference }, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(`${label} is not valid UTF-8 JSON.`);
  }
}

async function readRawReference(root, reference, kind, label) {
  requireReference(reference, kind, label);
  const path = resolveInside(root, reference.path);
  await assertRegularFile(root, path, label);
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || digest(bytes) !== reference.sha256) fail(`${label} raw reference differs from evidence bytes.`);
  return bytes;
}

async function rawReference(root, path, kind, label) {
  const absolute = resolveInside(root, path);
  await assertRegularFile(root, absolute, label);
  const bytes = await readFile(absolute);
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

function requireReference(reference, kind, label) {
  if (!reference || typeof reference !== 'object' || reference.kind !== kind || !safePath(reference.path)
      || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 0) {
    fail(`${label} reference is invalid.`);
  }
  requireDigest(reference.sha256, `${label} SHA-256`);
}

async function assertDirectory(path, label) {
  let info;
  try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-symlink directory.`);
}

async function assertRegularFile(root, path, label) {
  const parts = relative(root, path).split('/');
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    let info;
    try { info = await lstat(current); } catch { fail(`${label} is missing.`); }
    if (info.isSymbolicLink()) fail(`${label} must not traverse a symlink.`);
  }
  const info = await lstat(path);
  if (!info.isFile()) fail(`${label} must be a regular file.`);
}

function resolveInside(root, path) {
  if (!safePath(path)) fail('Recovery evidence path is unsafe.');
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}/`)) fail('Recovery evidence path escapes its root.');
  return absolute;
}

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..');
}

function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path
    && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} is invalid.`);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function nonBlank(value) {
  return typeof value === 'string' && value.length > 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function fail(message) {
  throw new RecoveryFactoryError(message);
}
