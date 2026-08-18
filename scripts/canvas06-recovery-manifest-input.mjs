import { sha256Jcs } from './canvas06-rfc8785.mjs';

const CASE_DEFINITIONS = Object.freeze([
  ['RCV-CANVAS-001.RULE_IDENTITY', 'PRE_COMMIT', 'RECOVERY-COMMAND-PROCEDURAL-001', 'TEXT_GENERATION_BLOCKED', 'PROFILE_ASSET_IDENTITY_MISMATCH', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-002.SYMBOL_MISSING', 'PRE_COMMIT', 'RECOVERY-COMMAND-PROCEDURAL-001', 'TEXT_GENERATION_BLOCKED', 'PROFILE_ASSET_MISSING', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-003.GRAMMAR_DIGEST', 'PRE_COMMIT', 'RECOVERY-COMMAND-PROCEDURAL-001', 'TEXT_GENERATION_BLOCKED', 'PROFILE_ASSET_DIGEST_MISMATCH', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-004.NORMALIZATION_IDENTITY', 'PRE_COMMIT', 'RECOVERY-COMMAND-PROCEDURAL-001', 'TEXT_GENERATION_BLOCKED', 'PROFILE_ASSET_IDENTITY_MISMATCH', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-005.SEMANTIC_VALIDATION', 'PRE_COMMIT', 'RECOVERY-COMMAND-STATE-001', 'VALIDATION_BLOCKED', 'CONTEXT_CLOSURE_VIOLATION', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-006.PLAN_UNSUPPORTED', 'PRE_COMMIT', 'RECOVERY-COMMAND-STRUCTURAL-FAN-001', 'TEXT_GENERATION_BLOCKED', 'TEXT_PLAN_UNSUPPORTED', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-007.TEXT_COMPOSITION', 'PRE_COMMIT', 'RECOVERY-COMMAND-CONTROL-001', 'TEXT_GENERATION_BLOCKED', 'TEXT_COMPOSITION_FAILED', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-008.TRACE_INCOMPLETE', 'PRE_COMMIT', 'RECOVERY-COMMAND-PROCEDURAL-001', 'TEXT_GENERATION_BLOCKED', 'TEXT_TRACE_INCOMPLETE', 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-009.SQLITE_REVISION', 'SQLITE', 'RECOVERY-COMMAND-STATE-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-010.SQLITE_PARENT', 'SQLITE', 'RECOVERY-COMMAND-PROCEDURAL-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-011.SQLITE_TRACE', 'SQLITE', 'RECOVERY-COMMAND-CONTROL-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-012.SQLITE_FINDING', 'SQLITE', 'RECOVERY-COMMAND-STRUCTURAL-FAN-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-013.SQLITE_HEAD', 'SQLITE', 'RECOVERY-COMMAND-STATE-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-014.SQLITE_OPERATION', 'SQLITE', 'RECOVERY-COMMAND-PROCEDURAL-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-015.SQLITE_RECEIPT', 'SQLITE', 'RECOVERY-COMMAND-CONTROL-001', 'PERSISTENCE_FAILED', null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-016.KILL_AFTER_REVISION', 'FORCED_RESTART', 'RECOVERY-COMMAND-STRUCTURAL-FAN-001', null, null, 'RESTART_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-017.KILL_AFTER_HEAD', 'FORCED_RESTART', 'RECOVERY-COMMAND-STATE-001', null, null, 'RESTART_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-018.KILL_AFTER_COMMIT', 'FORCED_RESTART', 'RECOVERY-COMMAND-PROCEDURAL-001', null, null, 'COMMITTED_RECOVERED', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-019.IDLE_RESTART', 'FORCED_RESTART', 'RECOVERY-COMMAND-CONTROL-001', null, null, 'STABLE_REOPEN', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-020.SERVICE_UNAVAILABLE', 'SERVICE_RECOVERY', 'RECOVERY-COMMAND-STATE-001', null, null, 'BLOCKED_ZERO_DELTA', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-021.PROJECTION_READBACK', 'SERVICE_RECOVERY', 'RECOVERY-COMMAND-STRUCTURAL-FAN-001', null, null, 'COMMITTED_RECOVERED', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-022.RECOVERY_REQUIRED', 'SERVICE_RECOVERY', 'RECOVERY-COMMAND-STATE-001', null, null, 'STABLE_REOPEN', 'UNCHANGED_DISABLED'],
  ['RCV-CANVAS-023.ROLLBACK_STRUCTURAL', 'ROLLBACK', 'RECOVERY-COMMAND-STRUCTURAL-FAN-001', null, null, 'ROLLBACK_PARTIAL', 'PARTIAL'],
  ['RCV-CANVAS-024.ROLLBACK_CONTROL', 'ROLLBACK', 'RECOVERY-COMMAND-CONTROL-001', null, null, 'ROLLBACK_PARTIAL', 'PARTIAL'],
  ['RCV-CANVAS-025.ROLLBACK_PROCEDURAL_CASCADE', 'ROLLBACK', 'RECOVERY-COMMAND-PROCEDURAL-001', null, null, 'ROLLBACK_PARTIAL', 'PARTIAL'],
  ['RCV-CANVAS-026.ROLLBACK_ALL', 'ROLLBACK', 'RECOVERY-COMMAND-STATE-001', null, null, 'ROLLBACK_FULL', 'FULL'],
  ['RCV-CANVAS-027.ROLLBACK_UNKNOWN', 'ROLLBACK', 'RECOVERY-COMMAND-PROCEDURAL-001', null, null, 'ROLLBACK_REJECTED', 'REJECTED'],
  ['RCV-CANVAS-028.ROLLBACK_TAMPERED', 'ROLLBACK', 'RECOVERY-COMMAND-CONTROL-001', null, null, 'ROLLBACK_REJECTED', 'REJECTED']
]);

const ZERO_TRANSACTION = Object.freeze({
  revision_delta: 0,
  revision_parent_delta: 0,
  text_artifact_delta: 0,
  text_trace_delta: 0,
  finding_delta: 0,
  operation_delta: 0,
  receipt_delta: 0,
  draft_head_changed: false
});

export class RecoveryManifestInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryManifestInputError';
    this.code = 'RECOVERY_INPUT_INVALID';
    this.exitCode = 2;
  }
}

/** 从冻结 Template 和 Reopen Catalog 派生唯一的 28 项 Recovery case。 */
export function deriveRecoveryCaseCatalog({ modelTemplate, reopenCatalog, modelFixtureRef }) {
  requireObject(modelTemplate, 'Recovery model Template');
  requireObject(reopenCatalog, 'Recovery Reopen Catalog');
  requireFileRef(modelFixtureRef, 'Recovery model fixture ref');
  if (!Array.isArray(modelTemplate.command_scenarios) || modelTemplate.command_scenarios.length !== 4) {
    fail('Recovery model Template command scenarios are invalid.');
  }
  const scenarios = new Map(modelTemplate.command_scenarios.map(value => [value?.scenario_id, value]));
  if (scenarios.size !== 4 || CASE_DEFINITIONS.some(([, , scenarioId]) => !scenarios.has(scenarioId))) {
    fail('Recovery case to base scenario mapping is invalid.');
  }
  if (!Array.isArray(reopenCatalog.profiles) || !Array.isArray(reopenCatalog.cases)
      || reopenCatalog.cases.length !== CASE_DEFINITIONS.length) {
    fail('Recovery Reopen Catalog cardinality is invalid.');
  }
  const profiles = new Map(reopenCatalog.profiles.map(profile => [profile?.profile_id, profile]));
  if (profiles.size !== 3) fail('Recovery Reopen Catalog profiles are invalid.');

  const seen = new Set();
  const values = CASE_DEFINITIONS.map((definition, index) => {
    const [caseId, category, scenarioId, topCode, detailCode, outcome, gateStatus] = definition;
    const mapping = reopenCatalog.cases[index];
    if (!mapping || mapping.case_id !== caseId || seen.has(caseId)) fail('Recovery Reopen Catalog case order is invalid.');
    seen.add(caseId);
    const profile = profiles.get(mapping.expected_reopen_profile_id);
    if (!profile || !isDigest(mapping.expected_reopen_sha256)
        || mapping.expected_reopen_sha256 !== profile.expected_reopen_sha256
        || sha256Jcs(profile.expected_reopen) !== mapping.expected_reopen_sha256) {
      fail('Recovery Reopen Catalog profile digest is invalid.');
    }
    const forced = /^RCV-CANVAS-01[6-9]\./.test(caseId);
    const expected = committedTransaction(caseId, scenarios.get(scenarioId));
    const value = {
      case_id: caseId,
      category,
      fixture_ref: clone(modelFixtureRef),
      fault: {
        stage: category,
        variant: caseId.slice(caseId.indexOf('.') + 1),
        requires_forced_termination: forced
      },
      expected_process_outcome: outcome,
      expected_transaction: expected,
      expected_reopen: clone(profile.expected_reopen),
      expected_reopen_sha256: mapping.expected_reopen_sha256,
      expected_gate: { status: gateStatus },
      required_attempt_count: 2
    };
    if (topCode) value.expected_top_code = topCode;
    if (detailCode) value.expected_detail_code = detailCode;
    return deepFreeze(value);
  });
  validateFixedCounts(values);
  return deepFreeze(values);
}

function committedTransaction(caseId, scenario) {
  if (!['RCV-CANVAS-018.KILL_AFTER_COMMIT', 'RCV-CANVAS-021.PROJECTION_READBACK'].includes(caseId)) {
    return clone(ZERO_TRANSACTION);
  }
  const transaction = scenario?.expected_result?.transaction;
  if (!transaction || transaction.revision_delta !== 1 || transaction.revision_parent_delta !== 1
      || transaction.text_artifact_delta !== 1 || transaction.operation_delta !== 1
      || transaction.receipt_delta !== 1 || transaction.draft_head_changed !== true) {
    fail('Recovery committed case transaction is invalid.');
  }
  return clone(transaction);
}

function validateFixedCounts(cases) {
  const counts = new Map();
  for (const value of cases) counts.set(value.category, (counts.get(value.category) ?? 0) + 1);
  const expected = { PRE_COMMIT: 8, SQLITE: 7, FORCED_RESTART: 4, SERVICE_RECOVERY: 3, ROLLBACK: 6 };
  for (const [category, count] of Object.entries(expected)) if (counts.get(category) !== count) fail('Recovery category count is invalid.');
  if (cases.filter(value => value.fault.requires_forced_termination).length !== 4) fail('Recovery forced termination count is invalid.');
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`);
}

function requireFileRef(value, label) {
  requireObject(value, label);
  if (typeof value.kind !== 'string' || typeof value.path !== 'string' || !Number.isInteger(value.byte_length)
      || value.byte_length < 0 || !isDigest(value.sha256)) fail(`${label} is invalid.`);
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(message) {
  throw new RecoveryManifestInputError(message);
}
