import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { E2eRunInputError } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs as jcs } from './canvas06-rfc8785.mjs';

const HISTORICAL_REPORT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-report.schema.json', import.meta.url), 'utf8'));
const REPORT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-report-v02.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(HISTORICAL_REPORT_SCHEMA);
const validateReport = ajv.compile(REPORT_SCHEMA);

const FAILURE_ORDER = Object.freeze([
  'E2E_INPUT_INVALID', 'E2E_ENVIRONMENT_MISMATCH', 'E2E_FIXTURE_MISMATCH', 'E2E_CASE_MISSING',
  'E2E_UNEXPECTED_RUNTIME_ERROR', 'E2E_EXPECTATION_MISMATCH', 'E2E_REVISION_MISMATCH',
  'E2E_PROJECTION_MISMATCH', 'E2E_TEXT_TRACE_MISMATCH', 'E2E_TRANSACTION_DELTA_MISMATCH', 'E2E_NONDETERMINISTIC'
]);

export function composeE2eReport({ manifest, observations, capabilities, base }) {
  assertManifest(manifest);
  const byCase = groupObservations(observations, manifest.cases);
  const caseResults = manifest.cases.map(entry => aggregateCase(entry, byCase.get(entry.case_id)));
  const capabilityResults = aggregateCapabilities({ manifestCases: manifest.cases, caseResults, capabilities });
  const summary = aggregateSummary(caseResults);
  const failures = collectFailures(caseResults);
  const reportStatus = isReady({ summary, capabilityResults, failures }) ? 'READY_FOR_ENABLEMENT_EVALUATION' : 'BLOCKED';
  const report = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-REPORT-001',
    schema_version: '0.2',
    report_id: reportId(base.manifest_ref.sha256, base.runner_identity.runner_source_sha256),
    generated_at: base.generated_at,
    runner_identity: base.runner_identity,
    manifest_ref: base.manifest_ref,
    intake_report_ref: base.intake_report_ref,
    handoff_ref: base.handoff_ref,
    upstream_source_build: base.upstream_source_build,
    source_build: base.source_build,
    environment: base.environment,
    report_status: reportStatus,
    summary,
    capability_results: capabilityResults,
    case_results: caseResults,
    failures,
    limitations: [
      '仅证明冻结的DEV-CANVAS-06受控运行环境。',
      '未证明其他硬件、操作系统或浏览器版本。',
      '未建立ISO 19450:2024符合性。'
    ]
  };
  if (!validateReport(report)) fail('E2E_RUN_REPORT_SCHEMA_INVALID', JSON.stringify(validateReport.errors));
  return Object.freeze(report);
}

export function reportId(manifestSha256, runnerSourceSha256) {
  if (!isDigest(manifestSha256) || !isDigest(runnerSourceSha256)) fail('E2E_RUN_INPUT_INVALID', 'Report identity requires two SHA-256 values.');
  return `dev-canvas-06.e2e-report.${manifestSha256.slice(0, 12)}.${runnerSourceSha256.slice(0, 12)}`;
}

/** 从已写入的活动 Attempt artifact 生成 Report 的唯一只读投影。 */
export async function readE2eAttemptObservations({ reportRoot, manifest }) {
  assertManifest(manifest);
  const root = resolve(reportRoot);
  const observations = [];
  for (const entry of manifest.cases) for (const ordinal of [1, 2]) {
    const attemptRoot = resolve(root, 'attempts', encodeCaseId(entry.case_id), String(ordinal));
    const [observation, index, indexRef] = await Promise.all([
      readJson(resolve(attemptRoot, 'attempt-observation.json')),
      readJson(resolve(attemptRoot, 'artifact-index.json')),
      rawRef(root, resolve(attemptRoot, 'artifact-index.json'), 'ARTIFACT_INDEX')
    ]);
    if (observation?.case_id !== entry.case_id || observation?.attempt_ordinal !== ordinal
        || !Array.isArray(index?.refs)) {
      fail('E2E_RUN_CASE_SET_INVALID', 'Attempt artifact identity is incomplete.');
    }
    observations.push(Object.freeze({
      ...observation,
      artifact_refs: Object.freeze([
        indexRef,
        ...index.refs.map(item => ({ kind: item.kind, path: item.path, byte_length: item.byte_length, sha256: item.sha256 }))
      ].sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'))))
    }));
  }
  return Object.freeze(observations);
}

export function semanticComparisonDigest(observation) {
  const payload = {
    case_id: observation.case_id,
    fixture_sha256: observation.fixture_sha256,
    input_sha256: observation.input_sha256,
    project_id: observation.project_id,
    model_id: observation.model_id,
    context_id: observation.context_id,
    base_revision: observation.base_revision,
    head_revision: observation.head_revision,
    committed_revision: observation.committed_revision ?? null,
    command_id: observation.command_id ?? null,
    option_id: observation.option_id ?? null,
    impact_token_id: observation.impact_token_id ?? null,
    observed_status: observation.observed_status,
    top_error_code: observation.top_error_code ?? null,
    detail_error_code: observation.detail_error_code ?? null,
    revision_document_before_sha256: observation.revision_document_before_sha256,
    revision_document_after_sha256: observation.revision_document_after_sha256,
    revision_document_reopen_sha256: observation.revision_document_reopen_sha256,
    projection_before_sha256: observation.projection_before_sha256,
    projection_after_sha256: observation.projection_after_sha256,
    projection_reopen_sha256: observation.projection_reopen_sha256,
    opl_before_sha256: observation.opl_before_sha256,
    opl_after_sha256: observation.opl_after_sha256,
    opl_reopen_sha256: observation.opl_reopen_sha256,
    token_before_sha256: observation.token_before_sha256,
    token_after_sha256: observation.token_after_sha256,
    token_reopen_sha256: observation.token_reopen_sha256,
    trace_before_sha256: observation.trace_before_sha256,
    trace_after_sha256: observation.trace_after_sha256,
    trace_reopen_sha256: observation.trace_reopen_sha256,
    transaction: observation.transaction,
    assertion_results: observation.assertion_results.map(result => ({
      assertion_id: result.assertion_id,
      status: result.status
    }))
  };
  return sha256(Buffer.from(jcs(payload), 'utf8'));
}

function assertManifest(manifest) {
  if (!manifest || manifest.schema_id !== 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001' || !Array.isArray(manifest.cases) || manifest.cases.length !== 194) {
    fail('E2E_RUN_MANIFEST_INVALID', 'Manifest must contain the frozen 194-case E2E catalog.');
  }
}

function groupObservations(observations, cases) {
  if (!Array.isArray(observations) || observations.length !== 388) fail('E2E_RUN_CASE_SET_INVALID', 'Exactly 388 attempt observations are required.');
  const caseIds = new Set(cases.map(entry => entry.case_id));
  const result = new Map();
  for (const observation of observations) {
    if (!caseIds.has(observation?.case_id) || ![1, 2].includes(observation.attempt_ordinal)) {
      fail('E2E_RUN_CASE_SET_INVALID', 'Attempt observation is not bound to a Manifest case and ordinal.');
    }
    const entries = result.get(observation.case_id) ?? [];
    if (entries.some(entry => entry.attempt_ordinal === observation.attempt_ordinal)) {
      fail('E2E_RUN_CASE_SET_INVALID', 'Duplicate attempt observation ordinal.');
    }
    entries.push(observation);
    result.set(observation.case_id, entries);
  }
  for (const entry of cases) {
    const attempts = result.get(entry.case_id);
    if (!attempts || attempts.length !== 2) fail('E2E_RUN_CASE_SET_INVALID', 'Every Manifest case requires two observations.');
  }
  return result;
}

function aggregateCase(entry, observations) {
  const expectedStatus = entry.expectation === 'BLOCKED' ? 'BLOCKED_MATCHED' : 'PASS_MATCHED';
  const attempts = observations.slice().sort((left, right) => left.attempt_ordinal - right.attempt_ordinal);
  const evaluation = attempts.map(observation => evaluateAttempt({ entry, observation, expectedStatus }));
  const failureCodes = sortCodes(evaluation.flatMap(item => item.failureCodes));
  if (evaluation[0].semanticDigest !== evaluation[1].semanticDigest) failureCodes.push('E2E_NONDETERMINISTIC');
  const finalCodes = sortCodes(failureCodes);
  const status = finalCodes.length === 0 ? expectedStatus : 'FAILED';
  return Object.freeze({
    case_id: entry.case_id,
    suite_id: entry.suite_id,
    ...(entry.capability_id ? { capability_id: entry.capability_id, coverage_key: entry.coverage_key } : {}),
    expectation: entry.expectation,
    status,
    attempts: evaluation.map(item => item.reportAttempt),
    failure_codes: finalCodes
  });
}

function evaluateAttempt({ entry, observation, expectedStatus }) {
  const failureCodes = [];
  if (!isDigest(observation.fixture_sha256) || observation.fixture_sha256 !== entry.fixture_ref.sha256
    || !isDigest(observation.input_sha256) || observation.input_sha256 !== entry.input_ref.sha256) {
    failureCodes.push('E2E_FIXTURE_MISMATCH');
  }
  if (!isValidIdentity(observation)) failureCodes.push('E2E_INPUT_INVALID');
  if (observation.observed_status !== expectedStatus || !assertionsMatch(entry.assertion_ids, observation.assertion_results)) {
    failureCodes.push('E2E_EXPECTATION_MISMATCH');
  }
  if (!sameTransaction(entry.expected_transaction, observation.transaction)) failureCodes.push('E2E_TRANSACTION_DELTA_MISMATCH');
  const reopenMatches = attemptReopenMatches(observation);
  if (!reopenMatches) failureCodes.push('E2E_REVISION_MISMATCH');
  const semanticDigest = semanticComparisonDigest(observation);
  if (observation.semantic_comparison_digest !== semanticDigest) failureCodes.push('E2E_INPUT_INVALID');
  const status = failureCodes.length === 0 ? expectedStatus : 'FAILED';
  return Object.freeze({
    semanticDigest,
    failureCodes,
    reportAttempt: {
      attempt_ordinal: observation.attempt_ordinal,
      status,
      fixture_sha256: observation.fixture_sha256,
      input_sha256: observation.input_sha256,
      project_id: observation.project_id,
      model_id: observation.model_id,
      base_revision: observation.base_revision,
      head_revision: observation.head_revision,
      observed_status: observation.observed_status,
      transaction: observation.transaction,
      reopen_matches: reopenMatches,
      artifact_refs: observation.artifact_refs
    }
  });
}

function attemptReopenMatches(observation) {
  return ['revision_document', 'projection', 'opl', 'token', 'trace']
    .every(kind => isDigest(observation[`${kind}_after_sha256`])
      && observation[`${kind}_after_sha256`] === observation[`${kind}_reopen_sha256`]);
}

function aggregateCapabilities({ manifestCases, caseResults, capabilities }) {
  if (!Array.isArray(capabilities) || capabilities.length !== 34) fail('E2E_RUN_CAPABILITY_INVALID', 'Exactly 34 ordered Intake capabilities are required.');
  const byCase = new Map(caseResults.map(result => [result.case_id, result]));
  const ids = new Set();
  return capabilities.map(capability => {
    if (!capability?.capability_id || ids.has(capability.capability_id) || !['PROCEDURAL', 'CONTROL', 'STRUCTURAL'].includes(capability.family)
      || !Array.isArray(capability.covered_coverage_keys) || capability.covered_coverage_keys.length === 0) {
      fail('E2E_RUN_CAPABILITY_INVALID', 'Capability order or closure is invalid.');
    }
    ids.add(capability.capability_id);
    const manifestEntries = manifestCases.filter(entry => entry.capability_id === capability.capability_id);
    const expectedKeys = manifestEntries.map(entry => entry.coverage_key);
    if (!sameSet(expectedKeys, capability.covered_coverage_keys)) fail('E2E_RUN_CAPABILITY_INVALID', 'Capability coverage keys do not match the Manifest.');
    const cases = manifestEntries.map(entry => byCase.get(entry.case_id));
    const passMatchedCount = cases.filter(result => result.status === 'PASS_MATCHED').length;
    const blockedMatchedCount = cases.filter(result => result.status === 'BLOCKED_MATCHED').length;
    const failedCount = cases.filter(result => result.status === 'FAILED').length;
    return Object.freeze({
      capability_id: capability.capability_id,
      family: capability.family,
      covered_coverage_keys: capability.covered_coverage_keys,
      pass_matched_count: passMatchedCount,
      blocked_matched_count: blockedMatchedCount,
      failed_count: failedCount,
      status: failedCount > 0 ? 'FAILED' : passMatchedCount === 0 && blockedMatchedCount > 0 ? 'BLOCKED_MATCHED' : 'PASS_MATCHED',
      case_refs: manifestEntries.map(entry => entry.case_id)
    });
  });
}

function aggregateSummary(caseResults) {
  const family = caseResults.filter(result => result.capability_id);
  const common = caseResults.filter(result => !result.capability_id);
  return Object.freeze({
    case_count: caseResults.length,
    family_case_count: family.length,
    family_pass_expectation_count: family.filter(result => result.expectation === 'PASS').length,
    family_blocked_expectation_count: family.filter(result => result.expectation === 'BLOCKED').length,
    common_case_count: common.length,
    attempt_count: caseResults.length * 2,
    pass_matched_count: caseResults.filter(result => result.status === 'PASS_MATCHED').length,
    blocked_matched_count: caseResults.filter(result => result.status === 'BLOCKED_MATCHED').length,
    failed_count: caseResults.filter(result => result.status === 'FAILED').length,
    skipped_count: 0,
    retry_count: 0
  });
}

function collectFailures(caseResults) {
  return caseResults.flatMap(result => result.failure_codes.map(code => ({
    code,
    case_id: result.case_id,
    ...(result.capability_id ? { capability_id: result.capability_id, coverage_key: result.coverage_key } : {}),
    evidence_refs: result.attempts.flatMap(attempt => attempt.artifact_refs).sort(compareRef),
    message_key: `release.canvas06.e2e.${code.toLowerCase()}`
  }))).sort((left, right) => left.case_id.localeCompare(right.case_id, 'en') || FAILURE_ORDER.indexOf(left.code) - FAILURE_ORDER.indexOf(right.code));
}

function isReady({ summary, capabilityResults, failures }) {
  return summary.case_count === 194 && summary.family_case_count === 178
    && summary.family_pass_expectation_count === 130 && summary.family_blocked_expectation_count === 48
    && summary.common_case_count === 16 && summary.attempt_count === 388
    && summary.pass_matched_count === 137 && summary.blocked_matched_count === 57
    && summary.failed_count === 0 && summary.skipped_count === 0 && summary.retry_count === 0
    && capabilityResults.length === 34 && capabilityResults.every(result => result.status !== 'FAILED') && failures.length === 0;
}

function assertionsMatch(expectedIds, assertions) {
  return Array.isArray(assertions) && assertions.length === expectedIds.length
    && assertions.every((result, index) => result?.assertion_id === expectedIds[index] && result.status === 'PASS');
}

function sameTransaction(expected, observed) {
  return expected && observed && jcs(expected) === jcs(observed);
}

function isValidIdentity(value) {
  return typeof value?.project_id === 'string' && value.project_id.length > 0
    && typeof value.model_id === 'string' && value.model_id.length > 0
    && typeof value.base_revision === 'string' && value.base_revision.length > 0
    && typeof value.head_revision === 'string' && value.head_revision.length > 0
    && Array.isArray(value.artifact_refs) && value.artifact_refs.length > 0;
}

function sameSet(left, right) {
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && left.every(value => right.includes(value));
}

function compareRef(left, right) {
  return left.path.localeCompare(right.path, 'en') || left.sha256.localeCompare(right.sha256, 'en');
}

function sortCodes(codes) {
  return [...new Set(codes)].sort((left, right) => FAILURE_ORDER.indexOf(left) - FAILURE_ORDER.indexOf(right));
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(path) {
  const details = await lstat(path).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Attempt artifact is missing or unsafe.');
  }
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { fail('E2E_RUN_CASE_SET_INVALID', 'Attempt artifact is not valid JSON.'); }
}

async function rawRef(root, path, kind) {
  const details = await lstat(path).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Attempt artifact index is missing or unsafe.');
  }
  const bytes = await readFile(path);
  const relative = path.slice(`${root}/`.length);
  if (!relative || relative.startsWith('../')) fail('E2E_RUN_CASE_SET_INVALID', 'Attempt artifact index escapes the Report root.');
  return Object.freeze({ kind, path: relative, byte_length: bytes.length, sha256: sha256(bytes) });
}

function encodeCaseId(value) {
  return Array.from(Buffer.from(value, 'utf8')).map(byte => /[A-Za-z0-9._-]/.test(String.fromCharCode(byte))
    ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 3);
}
