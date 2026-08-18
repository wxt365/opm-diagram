import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const MODEL_DIGEST_KEYS = [
  'semantic_projection_sha256', 'projection_sha256', 'opl_sha256', 'trace_sha256',
  'finding_sha256', 'transaction_sha256', 'normalized_outcome_sha256'
];
const GATE_DIGEST_KEYS = [
  'capability_order_sha256', 'eligible_capability_ids_sha256', 'reverse_control_dependencies_sha256',
  'rollback_structural_sha256', 'rollback_control_sha256', 'rollback_procedural_cascade_sha256', 'rollback_all_sha256'
];

const TEMPLATES = {
  'RECOVERY-FIXTURE-MODEL': {
    file: 'recovery-model-template.json',
    schemaId: 'OPM-DEV-CANVAS-06-RECOVERY-MODEL-TEMPLATE-001',
    templateId: 'OPM-DEV-CANVAS-06-RECOVERY-MODEL-TEMPLATE-001/0.1',
    rawSha256: '76d906ad7ef8eb14028433458b23aebf8c9dd3db22a75d9d95f7d81a1785bc4a',
    payloadSha256: 'cafdb6a845be9e6cd53b327c447aae2f3a81aa9c8a97527e9c18c341c829c234',
    fixtureDigest: 'bff0fb2a1c602bf4a0c0ff118bb80c47eda83e48ed9e2e98912281283d21fbbd'
  },
  'RECOVERY-FIXTURE-GATE': {
    file: 'recovery-gate-template.json',
    schemaId: 'OPM-DEV-CANVAS-06-RECOVERY-GATE-TEMPLATE-001',
    templateId: 'OPM-DEV-CANVAS-06-RECOVERY-GATE-TEMPLATE-001/0.1',
    rawSha256: '69bf9389d5e19f8b8b589349e689c030a1be5456aa2332315dc5cb3aad9172b5',
    payloadSha256: '410f014d6d1b89e882c64661747d053acaa7750c3a591750446359b14459a743',
    fixtureDigest: '454438e640b43dbb00c8376de9c648341b2423c21e7621e43ae432b74eea54fd'
  }
};

export class RecoveryTemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryTemplateError';
    this.code = 'RECOVERY_FIXTURE_MISMATCH';
    this.exitCode = 2;
  }
}

/** 读取并复算 Recovery immutable template，不修改任何输入字节。 */
export async function loadRecoveryTemplate({ evidenceRoot, templateSourceRef, expectedFixtureId }) {
  const definition = TEMPLATES[expectedFixtureId];
  if (!definition) fail('Unknown Recovery fixture ID.');
  const root = resolve(evidenceRoot);
  await assertDirectory(root, 'Evidence root');
  assertRawReference(templateSourceRef, expectedFixtureId, definition);
  const path = resolveInside(root, templateSourceRef.path);
  await assertRegularFile(root, path, 'Recovery template');

  const bytes = await readFile(path);
  if (bytes.length !== templateSourceRef.byte_length || sha(bytes) !== templateSourceRef.sha256 || templateSourceRef.sha256 !== definition.rawSha256) {
    fail('Recovery template raw reference differs from frozen bytes.');
  }
  const template = parse(bytes);
  validateIdentity(template, expectedFixtureId, definition);
  if (shaText(jcs(without(template, 'template_payload_sha256'))) !== template.template_payload_sha256
      || template.template_payload_sha256 !== definition.payloadSha256) {
    fail('Recovery template payload SHA-256 differs from the frozen JCS payload.');
  }
  if (expectedFixtureId === 'RECOVERY-FIXTURE-MODEL') validateModel(template);
  else validateGate(template);

  const fixtureDigest = shaText(jcs({
    fixture_id: expectedFixtureId,
    source_ref: {
      kind: templateSourceRef.kind,
      path: templateSourceRef.path,
      byte_length: templateSourceRef.byte_length,
      sha256: templateSourceRef.sha256
    },
    template_payload_sha256: template.template_payload_sha256,
    expected_result_digests: template.expected_result_digests
  }));
  if (fixtureDigest !== definition.fixtureDigest) fail('Recovery fixture digest differs from the frozen evidence-copy digest.');

  return deepFreeze({
    fixture_id: expectedFixtureId,
    template_source_ref: { ...templateSourceRef },
    template_payload_sha256: template.template_payload_sha256,
    fixture_digest: fixtureDigest,
    template
  });
}

function validateIdentity(template, fixtureId, definition) {
  assertExactKeys(template, fixtureId === 'RECOVERY-FIXTURE-MODEL'
    ? ['command_scenarios', 'deterministic_id_policy', 'expected_commits', 'expected_result_digests', 'fixture_id', 'model_identity', 'profile_binding', 'project_identity', 'request_digest_policy', 'result_digest_policy', 'schema_id', 'schema_version', 'source_build_binding', 'source_date_epoch', 'template_id', 'template_payload_sha256', 'template_version']
    : ['capability_order', 'eligible_capability_ids', 'expected_result_digests', 'expected_results', 'fixture_id', 'handoff_identity', 'intake_identity', 'production_gate_guard', 'result_digest_policy', 'reverse_control_dependencies', 'rollback_algorithm', 'rollback_targets', 'schema_id', 'schema_version', 'simulated_effective_state', 'source_date_epoch', 'template_id', 'template_payload_sha256', 'template_version'], 'Recovery template');
  if (template.schema_id !== definition.schemaId || template.schema_version !== '0.1'
      || template.template_id !== definition.templateId || template.template_version !== '0.1.0'
      || template.fixture_id !== fixtureId || !Number.isSafeInteger(template.source_date_epoch) || template.source_date_epoch < 0) {
    fail('Recovery template identity is invalid.');
  }
  assertDigest(template.template_payload_sha256, 'Template payload SHA-256');
}

function validateModel(template) {
  const scenarios = template.command_scenarios;
  if (!Array.isArray(scenarios) || scenarios.length !== 4) fail('Model template must contain four command scenarios.');
  const expected = [
    ['RECOVERY-COMMAND-STATE-001', 'STATE'],
    ['RECOVERY-COMMAND-PROCEDURAL-001', 'PROCEDURAL'],
    ['RECOVERY-COMMAND-CONTROL-001', 'CONTROL'],
    ['RECOVERY-COMMAND-STRUCTURAL-FAN-001', 'STRUCTURAL_FAN']
  ];
  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    assertExactKeys(scenario, ['base_revision_identity', 'base_revision_ref', 'capability_derivation_input', 'command_family', 'command_request', 'context_id', 'deterministic_id_sequence', 'expected_result', 'expected_result_digests', 'model_id', 'project_id', 'request_digest', 'scenario_id'], 'Model command scenario');
    if (scenario.scenario_id !== expected[index][0] || scenario.command_family !== expected[index][1]
        || !nonBlank(scenario.project_id) || !nonBlank(scenario.model_id) || !nonBlank(scenario.context_id)) {
      fail('Model command scenario identity or order is invalid.');
    }
    if (shaText(jcs(scenario.command_request)) !== scenario.request_digest) fail('Model command request digest differs from RFC8785 JCS bytes.');
    validateDigestMap(scenario.expected_result_digests, MODEL_DIGEST_KEYS, 'Model command result digest');
    for (const key of MODEL_DIGEST_KEYS) {
      const field = key.replace(/_sha256$/, '');
      if (!Object.hasOwn(scenario.expected_result, field) || shaText(jcs(scenario.expected_result[field])) !== scenario.expected_result_digests[key]) {
        fail('Model command expected result digest differs from its frozen projection.');
      }
    }
    validateDeterministicIds(scenario.deterministic_id_sequence);
  }
  validateDigestMap(template.expected_result_digests, MODEL_DIGEST_KEYS, 'Model aggregate result digest');
  for (const key of MODEL_DIGEST_KEYS) {
    const aggregate = scenarios.map(({ scenario_id, expected_result_digests }) => ({ scenario_id, sha256: expected_result_digests[key] }));
    if (shaText(jcs(aggregate)) !== template.expected_result_digests[key]) fail('Model aggregate result digest differs from the ordered scenarios.');
  }
  if (template.expected_commits?.KILL_AFTER_COMMIT !== 'RECOVERY-COMMAND-PROCEDURAL-001'
      || template.expected_commits?.PROJECTION_READBACK !== 'RECOVERY-COMMAND-STRUCTURAL-FAN-001') {
    fail('Model expected commit scenario mapping is invalid.');
  }
}

function validateGate(template) {
  if (!Array.isArray(template.capability_order) || template.capability_order.length !== 34
      || new Set(template.capability_order).size !== 34 || !sameArray(template.capability_order, template.eligible_capability_ids)) {
    fail('Gate template capability order is invalid.');
  }
  const dependencies = template.reverse_control_dependencies;
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies) || Object.keys(dependencies).length !== 16) {
    fail('Gate template reverse Control dependencies must contain all 16 Procedural keys.');
  }
  validateDigestMap(template.expected_result_digests, GATE_DIGEST_KEYS, 'Gate result digest');
  const preimages = {
    capability_order_sha256: template.capability_order,
    eligible_capability_ids_sha256: template.eligible_capability_ids,
    reverse_control_dependencies_sha256: template.reverse_control_dependencies,
    rollback_structural_sha256: template.expected_results?.ROLLBACK_STRUCTURAL,
    rollback_control_sha256: template.expected_results?.ROLLBACK_CONTROL,
    rollback_procedural_cascade_sha256: template.expected_results?.ROLLBACK_PROCEDURAL_CASCADE,
    rollback_all_sha256: template.expected_results?.ROLLBACK_ALL
  };
  for (const [key, value] of Object.entries(preimages)) {
    if (value === undefined || shaText(jcs(value)) !== template.expected_result_digests[key]) fail('Gate result digest differs from its frozen preimage.');
  }
  const simulated = template.simulated_effective_state;
  if (!simulated || simulated.manifest_state !== 'ACTIVE_COMPLETE' || simulated.production_gate !== 'ENABLED'
      || simulated.enabled_capability_ids_source !== 'eligible_capability_ids' || simulated.test_only !== true) {
    fail('Gate template simulated state is invalid.');
  }
}

function validateDeterministicIds(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) fail('Model command deterministic ID sequence is invalid.');
  for (let index = 0; index < sequence.length; index += 1) {
    const entry = sequence[index];
    if (!entry || entry.ordinal !== index + 1 || !nonBlank(entry.prefix) || !nonBlank(entry.id)) {
      fail('Model command deterministic ID sequence is invalid.');
    }
  }
}

function assertRawReference(reference, fixtureId, definition) {
  if (!reference || typeof reference !== 'object') fail('Recovery template reference is missing.');
  assertExactKeys(reference, ['kind', 'path', 'byte_length', 'sha256'], 'Recovery template reference');
  const path = `dev-canvas-06/recovery/fixtures/templates/0.1.0/${definition.file}`;
  if (reference.kind !== 'RECOVERY_TEMPLATE' || reference.path !== path || !Number.isSafeInteger(reference.byte_length)
      || reference.byte_length <= 0 || reference.sha256 !== definition.rawSha256 || fixtureId !== Object.keys(TEMPLATES).find(key => TEMPLATES[key] === definition)) {
    fail('Recovery template reference is not the frozen evidence-copy reference.');
  }
}

async function assertDirectory(path, label) {
  let info;
  try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-symlink directory.`);
}

async function assertRegularFile(root, path, label) {
  const segments = relative(root, path).split('/');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    let info;
    try { info = await lstat(current); } catch { fail(`${label} is missing.`); }
    if (info.isSymbolicLink()) fail(`${label} must not contain a symlink.`);
  }
  const info = await lstat(path);
  if (!info.isFile()) fail(`${label} must be a regular file.`);
}

function resolveInside(root, path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    fail('Recovery template path is unsafe.');
  }
  const result = resolve(root, path);
  if (!result.startsWith(`${root}/`)) fail('Recovery template path escapes the evidence root.');
  return result;
}

function parse(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('Recovery template must contain valid UTF-8 JSON.'); }
}

function validateDigestMap(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  assertExactKeys(value, keys, label);
  for (const key of keys) assertDigest(value[key], `${label} ${key}`);
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!sameArray(actual, expected)) fail(`${label} has an unexpected field set.`);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest.`);
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function nonBlank(value) {
  return typeof value === 'string' && value.length > 0;
}

function without(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shaText(value) {
  return sha(Buffer.from(value, 'utf8'));
}

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('JCS number is invalid.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  fail('JCS value is invalid.');
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function fail(message) {
  throw new RecoveryTemplateError(message);
}
