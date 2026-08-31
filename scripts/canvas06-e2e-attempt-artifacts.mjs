import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { fsyncPath } from './canvas06-e2e-manifest-v01-support.mjs';
import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';
import { semanticComparisonDigest } from './canvas06-e2e-run-report.mjs';

const ARTIFACT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateArtifact = ajv.compile(ARTIFACT_SCHEMA);

const FILES = Object.freeze({
  'fault-plan.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001', kind: 'FAULT_PLAN' }),
  'fixture-materialization.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001', kind: 'FIXTURE_MATERIALIZATION' }),
  'attempt-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001', kind: 'ATTEMPT_OBSERVATION' }),
  'runtime-process.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001', kind: 'RUNTIME_PROCESS' }),
  'browser-environment.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-001', kind: 'BROWSER_ENVIRONMENT' }),
  'network-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-NETWORK-OBSERVATION-001', kind: 'NETWORK_OBSERVATION' }),
  'console-errors.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-CONSOLE-ERRORS-001', kind: 'CONSOLE_ERRORS' }),
  'transaction-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-TRANSACTION-OBSERVATION-001', kind: 'TRANSACTION_OBSERVATION' }),
  'reopen-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-REOPEN-OBSERVATION-001', kind: 'REOPEN_OBSERVATION' }),
  'api-exchanges/index.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001', kind: 'API_EXCHANGE_INDEX' }),
  'artifact-index.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-ARTIFACT-INDEX-001', kind: 'ARTIFACT_INDEX' })
});

const CORE_KINDS = Object.freeze(Object.values(FILES).filter(item => item.kind !== 'ARTIFACT_INDEX').map(item => item.kind));
const CORE_ENTRY_METADATA = Object.freeze({
  FAULT_PLAN: Object.freeze({ path: 'fault-plan.json', capture_phase: 'MATERIALIZE' }),
  FIXTURE_MATERIALIZATION: Object.freeze({ path: 'fixture-materialization.json', capture_phase: 'MATERIALIZE' }),
  ATTEMPT_OBSERVATION: Object.freeze({ path: 'attempt-observation.json', capture_phase: 'FINALIZE' }),
  RUNTIME_PROCESS: Object.freeze({ path: 'runtime-process.json', capture_phase: 'RUNTIME' }),
  BROWSER_ENVIRONMENT: Object.freeze({ path: 'browser-environment.json', capture_phase: 'RUNTIME' }),
  NETWORK_OBSERVATION: Object.freeze({ path: 'network-observation.json', capture_phase: 'ACTION' }),
  CONSOLE_ERRORS: Object.freeze({ path: 'console-errors.json', capture_phase: 'ACTION' }),
  TRANSACTION_OBSERVATION: Object.freeze({ path: 'transaction-observation.json', capture_phase: 'ACTION' }),
  REOPEN_OBSERVATION: Object.freeze({ path: 'reopen-observation.json', capture_phase: 'REOPEN' }),
  API_EXCHANGE_INDEX: Object.freeze({ path: 'api-exchanges/index.json', capture_phase: 'ACTION' })
});
const PROFILE_ASSET_KINDS = Object.freeze(['GRAMMAR_ASSET', 'NORMALIZATION_DATA', 'PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET']);
const DYNAMIC_EVIDENCE_KINDS = new Set(['API_EXCHANGE', 'API_REQUEST_BODY', 'API_RESPONSE_BODY', 'STDOUT_LOG', 'STDERR_LOG', 'FAILURE_ARTIFACT']);
const ATTEMPT_ASSERTION_IDS = new Set([
  'REVISION_COMMITTED', 'TRANSACTION_MATCHED', 'PROJECTION_MATCHED', 'TEXT_TRACE_MATCHED',
  'ERROR_CODE_MATCHED', 'TRANSACTION_ZERO', 'HEAD_UNCHANGED', 'PROJECTION_UNCHANGED',
  'REVISION_OR_BLOCKED_MATCHED', 'REOPEN_MATCHED'
]);
const TOKEN_KINDS = new Set(['ENTITY', 'STATE', 'RELATION_VERB', 'CONTROL_KEYWORD', 'LIST_SEPARATOR', 'PUNCTUATION', 'WHITESPACE', 'KEYWORD', 'PROCESS', 'OBJECT']);
const SOURCE_KINDS = new Set(['FACT', 'CAPABILITY', 'ENDPOINT', 'ELEMENT', 'FEATURE', 'STATE', 'MODIFIER', 'OCCURRENCE', 'TEMPLATE', 'GRAMMAR', 'RULE', 'LEGACY']);
const TOKEN_FIELDS = new Set(['token_id', 'sentence_id', 'ordinal', 'text', 'kind', 'start_utf8_byte', 'end_utf8_byte', 'source_refs']);
const SOURCE_FIELDS = new Set(['source_kind', 'stable_id', 'field_path', 'endpoint_ordinal', 'sentence_slot']);
const MAX_SAFE_INTEGER = 9007199254740991;
export const RELEASE_BROWSER_LAUNCH_ARGS = Object.freeze([
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check'
]);

export class TokenDigestError extends Error {
  constructor(code, jsonPointer, message) {
    super(message);
    this.code = code;
    this.jsonPointer = jsonPointer;
  }
}

export function tokenDigestPreimage(revisionId, tokens) {
  const preimage = {
    schema_id: 'OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001',
    schema_version: '0.1',
    revision_id: requiredNfc(revisionId, '/revision_id'),
    tokens: []
  };
  if (!Array.isArray(tokens)) tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', '/tokens', 'tokens 必须是数组。');
  preimage.tokens = tokens.map((token, index) => tokenPreimage(token, `/tokens/${index}`));
  return preimage;
}

export function tokenDigestCanonicalBytes(revisionId, tokens) {
  return Buffer.from(canonicalizeJcs(tokenDigestPreimage(revisionId, tokens)), 'utf8');
}

export function tokenDigestSha256(revisionId, tokens) {
  return sha256(tokenDigestCanonicalBytes(revisionId, tokens));
}

export function createFaultPlan({ caseId, attemptOrdinal, nonce = randomBytes(32).toString('hex') }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!/^[a-f0-9]{64}$/.test(nonce)) fail('E2E_INPUT_INVALID', 'Fault Plan nonce must be a 256-bit lowercase hexadecimal value.');
  const [fault_kind, target, trigger_count] = faultMapping(caseId);
  const plan = {
    schema_id: FILES['fault-plan.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    fault_kind,
    target,
    trigger_count,
    nonce
  };
  plan.plan_sha256 = sha256Jcs({ case_id: caseId, attempt_ordinal: attemptOrdinal, fault_kind, target, trigger_count, nonce });
  return withPayloadDigest(plan);
}

export async function writeFaultPlan({ reportRoot, caseId, attemptOrdinal, nonce }) {
  return writeAttemptArtifact({
    reportRoot,
    caseId,
    attemptOrdinal,
    filename: 'fault-plan.json',
    artifact: createFaultPlan({ caseId, attemptOrdinal, nonce })
  });
}

export function verifyFaultPlan({ caseId, attemptOrdinal, faultPlan }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!validateArtifact(faultPlan)
      || faultPlan?.schema_id !== FILES['fault-plan.json'].schemaId
      || faultPlan?.schema_version !== '0.2'
      || faultPlan.case_id !== caseId
      || faultPlan.attempt_ordinal !== attemptOrdinal) {
    fail('E2E_INPUT_INVALID', 'Fault Plan does not satisfy its fixed Schema or scheduling identity.');
  }

  const expected = createFaultPlan({ caseId, attemptOrdinal, nonce: faultPlan.nonce });
  if (canonicalizeJcs(faultPlan) !== canonicalizeJcs(expected)) {
    fail('E2E_INPUT_INVALID', 'Fault Plan mapping or payload digest is invalid.');
  }
  return Object.freeze(expected);
}

export function createAttemptObservation({
  caseId,
  attemptOrdinal,
  manifestCase,
  attemptIdentity,
  subjectBaseRevision,
  beforeState,
  afterState,
  reopenState,
  transactionObservation,
  reopenObservation,
  subjectReceipt,
  expectedSubject,
  evidence
}) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  verifyAttemptObservationInputs({
    caseId, attemptOrdinal, manifestCase, attemptIdentity, subjectBaseRevision, beforeState, afterState,
    reopenState, transactionObservation, reopenObservation, subjectReceipt, expectedSubject, evidence
  });

  const requestBody = subjectReceipt?.raw_request?.body ?? null;
  const responseBody = subjectReceipt?.response?.body ?? null;
  const committedRevision = nullableNonEmpty(responseBody?.meta?.committed_revision);
  const commandId = nullableNonEmpty(requestBody?.command_id);
  const optionId = nullableNonEmpty(requestBody?.payload?.selected_option_id);
  const impactTokenId = nullableNonEmpty(requestBody?.payload?.impact_token);
  const topErrorCode = nullableNonEmpty(responseBody?.error?.code);
  const transactionMatched = transactionObservation.matches === true
    && canonicalizeJcs(transactionObservation.observed_transaction) === canonicalizeJcs(manifestCase.expected_transaction);
  const transactionZero = zeroTransaction(transactionObservation.observed_transaction) && transactionMatched;
  const headUnchanged = transactionObservation.before.draft_head_revision_id === transactionObservation.after.draft_head_revision_id
    && transactionObservation.before.head_sequence === transactionObservation.after.head_sequence;
  const projectionChanged = beforeState.projection_sha256 !== afterState.projection_sha256;
  const textTraceChanged = beforeState.opl_sha256 !== afterState.opl_sha256 || beforeState.trace_sha256 !== afterState.trace_sha256;
  const stateUnchanged = sameStateDigests(beforeState, afterState);
  const reopenMatched = sameStateDigests(afterState, reopenState) && reopenObservation.reopen_matches === true;
  const committed = subjectReceipt?.response?.status === 200 && responseBody?.meta?.status === 'COMMITTED'
    && committedRevision === afterState.revision_id && transactionMatched;
  const errorMatched = subjectReceipt !== null && subjectReceipt.response.status === expectedSubject?.expected_http_status
    && topErrorCode === expectedSubject?.expected_error_code;
  const blockedMatched = manifestCase.case_id === 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED'
    ? subjectReceipt === null && transactionZero && headUnchanged && stateUnchanged
    : errorMatched && transactionZero && headUnchanged && stateUnchanged;

  const assertionStatuses = new Map([
    ['REVISION_COMMITTED', committed],
    ['TRANSACTION_MATCHED', transactionMatched],
    ['PROJECTION_MATCHED', projectionChanged && afterState.projection_sha256 === reopenState.projection_sha256],
    ['TEXT_TRACE_MATCHED', textTraceChanged && afterState.opl_sha256 === reopenState.opl_sha256
      && afterState.token_sha256 === reopenState.token_sha256 && afterState.trace_sha256 === reopenState.trace_sha256],
    ['ERROR_CODE_MATCHED', errorMatched],
    ['TRANSACTION_ZERO', transactionZero],
    ['HEAD_UNCHANGED', headUnchanged],
    ['PROJECTION_UNCHANGED', stateUnchanged],
    ['REVISION_OR_BLOCKED_MATCHED', manifestCase.expectation === 'PASS' ? committed && transactionMatched : blockedMatched],
    ['REOPEN_MATCHED', reopenMatched]
  ]);
  const assertionResults = manifestCase.assertion_ids.map(assertionId => Object.freeze({
    assertion_id: assertionId,
    status: assertionStatuses.get(assertionId) ? 'PASS' : 'FAILED',
    evidence_refs: assertionEvidenceRefs(assertionId, subjectReceipt !== null, evidence)
  }));
  const matched = assertionResults.every(result => result.status === 'PASS');
  const observedStatus = matched ? manifestCase.expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED' : 'FAILED';
  const result = {
    schema_id: FILES['attempt-observation.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    suite_id: manifestCase.suite_id,
    ...(manifestCase.capability_id ? { capability_id: manifestCase.capability_id, coverage_key: manifestCase.coverage_key } : {}),
    expectation: manifestCase.expectation,
    attempt_ordinal: attemptOrdinal,
    fixture_sha256: manifestCase.fixture_ref.sha256,
    input_sha256: manifestCase.input_ref.sha256,
    project_id: attemptIdentity.project_id,
    model_id: attemptIdentity.model_id,
    context_id: attemptIdentity.context_id,
    base_revision: subjectBaseRevision,
    head_revision: afterState.revision_id,
    committed_revision: committedRevision,
    command_id: commandId,
    option_id: optionId,
    impact_token_id: impactTokenId,
    expected_status: manifestCase.expectation,
    observed_status: observedStatus,
    status: observedStatus,
    top_error_code: topErrorCode,
    detail_error_code: null,
    revision_document_before_sha256: beforeState.revision_document_sha256,
    revision_document_after_sha256: afterState.revision_document_sha256,
    revision_document_reopen_sha256: reopenState.revision_document_sha256,
    projection_before_sha256: beforeState.projection_sha256,
    projection_after_sha256: afterState.projection_sha256,
    projection_reopen_sha256: reopenState.projection_sha256,
    opl_before_sha256: beforeState.opl_sha256,
    opl_after_sha256: afterState.opl_sha256,
    opl_reopen_sha256: reopenState.opl_sha256,
    token_before_sha256: beforeState.token_sha256,
    token_after_sha256: afterState.token_sha256,
    token_reopen_sha256: reopenState.token_sha256,
    trace_before_sha256: beforeState.trace_sha256,
    trace_after_sha256: afterState.trace_sha256,
    trace_reopen_sha256: reopenState.trace_sha256,
    transaction: transactionObservation.observed_transaction,
    assertion_results: assertionResults
  };
  result.semantic_comparison_digest = semanticComparisonDigest(result);
  return freezeValue(result);
}

export function createRuntimeProcess({ caseId, attemptOrdinal, cycles }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!Array.isArray(cycles) || cycles.length !== 2
      || cycles[0]?.cycle !== 'INITIAL' || cycles[1]?.cycle !== 'REOPEN'
      || cycles.some(cycle => !validProcessCycle(cycle))
      || cycles.some(cycle => !/^[a-f0-9]{64}$/.test(cycle?.parent_nonce))
      || cycles[0].parent_nonce === cycles[1].parent_nonce
      || cycles[0]?.pid === cycles[1]?.pid) {
    fail('E2E_INPUT_INVALID', 'Runtime Process cycles do not close the frozen process identity.');
  }
  return Object.freeze({
    schema_id: FILES['runtime-process.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    cycles
  });
}

export function createBrowserEnvironment({ caseId, attemptOrdinal, environment }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (environment?.playwright_version !== '1.57.0' || environment?.chromium_version !== '143.0.7499.4'
      || environment?.browser_executable_ref?.kind !== 'E2E_BROWSER_EXECUTABLE_MIRROR'
      || environment?.web_server_source_ref?.kind !== 'WEB_SERVER_SOURCE'
      || environment?.web_dist_ref?.kind !== 'WEB_DIST_TREE'
      || environment?.web_origin === environment?.runtime_origin
      || canonicalizeJcs(environment?.launch_args) !== canonicalizeJcs(RELEASE_BROWSER_LAUNCH_ARGS)) {
    fail('E2E_INPUT_INVALID', 'Browser Environment does not close the frozen execution identity.');
  }
  const result = {
    ...environment,
    schema_id: FILES['browser-environment.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal
  };
  result.environment_fingerprint = sha256Jcs(browserEnvironmentFingerprintPreimage(result));
  return Object.freeze(result);
}

export function browserEnvironmentFingerprintPreimage(environment) {
  return Object.freeze({
    schema_id: 'OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-FINGERPRINT-001',
    schema_version: '0.1',
    node_version: environment.node_version,
    playwright_version: environment.playwright_version,
    chromium_version: environment.chromium_version,
    browser_executable_sha256: environment.browser_executable_ref?.sha256,
    launch_args: environment.launch_args,
    viewport: environment.viewport,
    zoom_id: environment.zoom_id,
    locale: environment.locale,
    timezone: environment.timezone,
    color_scheme: environment.color_scheme,
    reduced_motion: environment.reduced_motion,
    web_server_source_sha256: environment.web_server_source_ref?.sha256,
    web_dist_sha256: environment.web_dist_ref?.sha256
  });
}

export function createNetworkObservation({ caseId, attemptOrdinal, requests, counters }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const counterKeys = ['external_request_count', 'websocket_count', 'service_worker_count', 'download_count', 'popup_count'];
  if (!Array.isArray(requests) || requests.length < 1
      || requests.some((request, index) => request?.sequence !== index + 1 || request.allow_decision === 'REJECTED' && !/^https?:\/\//u.test(request.normalized_url)
        || request.status === null === (request.failure_code === null)
        || request.operation_id === null && (request.request_body_ref !== null || request.response_body_ref !== null)
        || request.operation_id !== null && request.response_body_ref?.kind !== 'API_RESPONSE_BODY'
        || request.request_body_ref !== null && request.request_body_ref?.kind !== 'API_REQUEST_BODY')
      || !counters || counterKeys.some(key => !Number.isSafeInteger(counters[key]) || counters[key] < 0)
      || counters.external_request_count !== requests.filter(request => request.allow_decision === 'REJECTED').length) {
    fail('E2E_INPUT_INVALID', 'Network Observation does not close the ordered Playwright request evidence.');
  }
  return Object.freeze({
    schema_id: FILES['network-observation.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    requests,
    external_request_count: counters.external_request_count,
    websocket_count: counters.websocket_count,
    service_worker_count: counters.service_worker_count,
    download_count: counters.download_count,
    popup_count: counters.popup_count
  });
}

export function createConsoleErrors({ caseId, attemptOrdinal, events }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!Array.isArray(events) || events.some((event, index) => event?.sequence !== index + 1 || event.allow_decision !== 'REJECTED'
      || !/^[a-f0-9]{64}$/u.test(event.message_sha256) || event.source_ref !== null)) {
    fail('E2E_INPUT_INVALID', 'Console Errors do not close the ordered rejected Browser event evidence.');
  }
  return Object.freeze({
    schema_id: FILES['console-errors.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    events
  });
}

export function createTransactionObservation({ caseId, attemptOrdinal, before, after, expectedTransaction }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const observedTransaction = transactionDelta(before, after);
  const matches = canonicalizeJcs(observedTransaction) === canonicalizeJcs(expectedTransaction);
  const payload = {
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    before,
    after,
    expected_transaction: expectedTransaction,
    observed_transaction: observedTransaction,
    matches
  };
  return Object.freeze({
    schema_id: FILES['transaction-observation.json'].schemaId,
    schema_version: '0.2',
    ...payload,
    transaction_payload_sha256: sha256Jcs(payload)
  });
}

export function createReopenObservation({ caseId, attemptOrdinal, observation }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const payload = {
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    ...observation,
    new_process: true,
    new_context: true,
    projection_matches: observation.projection_before_sha256 === observation.projection_reopen_sha256,
    opl_matches: observation.opl_before_sha256 === observation.opl_reopen_sha256,
    token_matches: observation.token_before_sha256 === observation.token_reopen_sha256,
    trace_matches: observation.trace_before_sha256 === observation.trace_reopen_sha256
  };
  payload.reopen_matches = payload.projection_matches && payload.opl_matches && payload.token_matches && payload.trace_matches;
  if (payload.runtime_process_ref?.kind !== 'RUNTIME_PROCESS'
      || !/^browser-context\.initial\.[a-f0-9]{64}$/u.test(payload.initial_browser_context_id)
      || !/^browser-context\.reopen\.[a-f0-9]{64}$/u.test(payload.reopen_browser_context_id)
      || payload.initial_process_nonce === payload.reopen_process_nonce
      || payload.initial_browser_context_id === payload.reopen_browser_context_id) {
    fail('E2E_INPUT_INVALID', 'REOPEN must use a new process nonce and Browser context identity.');
  }
  return Object.freeze({
    schema_id: FILES['reopen-observation.json'].schemaId,
    schema_version: '0.2',
    ...payload,
    reopen_payload_sha256: sha256Jcs(payload)
  });
}

export async function writeAttemptArtifact({ reportRoot, caseId, attemptOrdinal, filename, artifact }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const specification = FILES[filename];
  if (!specification) fail('E2E_INPUT_INVALID', 'Attempt artifact filename is not frozen.');
  if (!artifact || artifact.schema_id !== specification.schemaId || artifact.schema_version !== '0.2'
      || artifact.case_id !== caseId || artifact.attempt_ordinal !== attemptOrdinal) {
    fail('E2E_INPUT_INVALID', 'Attempt artifact identity differs from its fixed filename or scheduler identity.');
  }
  const output = withPayloadDigest(artifact);
  if (!validateArtifact(output)) fail('E2E_INPUT_INVALID', `Attempt artifact does not satisfy the frozen Schema: ${JSON.stringify(validateArtifact.errors)}.`);

  const root = await assertDirectory(reportRoot);
  const attemptDirectory = await ensureAttemptDirectory(root, caseId, attemptOrdinal);
  await ensureArtifactParent(attemptDirectory, filename);
  const outputPath = resolve(attemptDirectory, filename);
  await assertFresh(outputPath);
  await atomicWrite(outputPath, `${canonicalizeJcs(output)}\n`);
  return rawRef(root, outputPath, specification.kind);
}

export async function writeArtifactIndex({ reportRoot, caseId, attemptOrdinal, entries }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!Array.isArray(entries)) fail('E2E_INPUT_INVALID', 'Artifact Index entries must be an array.');
  const root = await assertDirectory(reportRoot);
  const attemptRoot = await ensureAttemptDirectory(root, caseId, attemptOrdinal);
  const expectedPrefix = `${attemptRelativeRoot(caseId, attemptOrdinal)}/`;
  const references = [];
  const paths = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry.kind !== 'string' || typeof entry.media_type !== 'string'
        || typeof entry.capture_phase !== 'string' || typeof entry.required !== 'boolean'
        || !safeRelativePath(entry.path) || !entry.path.startsWith(expectedPrefix)
        || entry.path === `${expectedPrefix}artifact-index.json` || paths.has(entry.path)
        || operationalSupportPath(entry.path.slice(expectedPrefix.length))) {
      fail('E2E_INPUT_INVALID', 'Artifact Index entry is not bound to the current attempt.');
    }
    const coreMetadata = CORE_ENTRY_METADATA[entry.kind];
    if (coreMetadata && (entry.path !== `${expectedPrefix}${coreMetadata.path}` || entry.media_type !== 'application/json'
        || entry.capture_phase !== coreMetadata.capture_phase || entry.required !== true)) {
      fail('E2E_INPUT_INVALID', `Artifact Index core metadata is invalid: ${entry.kind}.`);
    }
    verifyDynamicEvidenceEntry(entry, expectedPrefix);
    paths.add(entry.path);
    if (entry.kind !== 'PROFILE_ASSET_TREE') {
      const path = resolveInside(root, entry.path);
      const details = await assertRegularFile(path);
      references.push({
        kind: entry.kind,
        path: entry.path,
        media_type: entry.media_type,
        byte_length: details.size,
        sha256: sha256(await readFile(path)),
        capture_phase: entry.capture_phase,
        required: entry.required,
        ...(entry.kind === 'PROFILE_ASSET' ? { asset_kind: entry.asset_kind } : {})
      });
    }
  }

  const actualPaths = (await listFiles(attemptRoot, '')).filter(path => !operationalSupportPath(path));
  const indexedPaths = new Set(references.map(entry => entry.path.slice(expectedPrefix.length)));
  if (actualPaths.some(path => path !== 'artifact-index.json' && !indexedPaths.has(path))) {
    fail('E2E_INPUT_INVALID', 'Attempt contains an artifact absent from Artifact Index.');
  }
  if (actualPaths.includes('artifact-index.json')) fail('E2E_INPUT_INVALID', 'Artifact Index cannot be overwritten.');

  const profileTreeEntries = entries.filter(entry => entry.kind === 'PROFILE_ASSET_TREE');
  const profileAssets = references.filter(entry => entry.kind === 'PROFILE_ASSET');
  const kinds = references.map(entry => entry.kind);
  if (entries.length < 20 || profileTreeEntries.length !== 1 || !CORE_KINDS.every(kind => kinds.filter(value => value === kind).length === 1)
      || profileAssets.length !== PROFILE_ASSET_KINDS.length || !sameOrderedValues(profileAssets.map(entry => entry.asset_kind), PROFILE_ASSET_KINDS)
      || kinds.filter(kind => kind === 'STDOUT_LOG').length !== 2 || kinds.filter(kind => kind === 'STDERR_LOG').length !== 2
      || kinds.some(kind => !CORE_KINDS.includes(kind) && kind !== 'PROFILE_ASSET' && !DYNAMIC_EVIDENCE_KINDS.has(kind))) {
    fail('E2E_INPUT_INVALID', 'Artifact Index must contain the frozen required set and only controlled dynamic evidence.');
  }
  const treeEntry = profileTreeEntries[0];
  if (treeEntry.path !== `${expectedPrefix}profile/assets` || treeEntry.media_type !== 'application/vnd.opm.profile-asset-tree+json'
      || treeEntry.capture_phase !== 'MATERIALIZE' || treeEntry.required !== true) {
    fail('E2E_INPUT_INVALID', 'Profile asset tree entry is invalid.');
  }
  await assertDirectory(resolveInside(root, treeEntry.path));
  const treeRefs = profileAssets.map(entry => ({ kind: entry.asset_kind, path: entry.path, byte_length: entry.byte_length, sha256: entry.sha256 }));
  const tree = {
    kind: 'PROFILE_ASSET_TREE', path: treeEntry.path, media_type: treeEntry.media_type,
    byte_length: treeRefs.reduce((total, entry) => total + entry.byte_length, 0),
    sha256: sha256Jcs({ schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: 'profile/assets', entries: treeRefs }),
    capture_phase: treeEntry.capture_phase, required: treeEntry.required
  };
  references.push(tree);
  references.sort(compareUtf8Path);
  await verifyAssertionEvidenceClosure(root, references);
  const index = withPayloadDigest({
    schema_id: FILES['artifact-index.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    refs: references,
    tree_sha256: sha256Jcs(references)
  });
  return writeAttemptArtifact({ reportRoot: root, caseId, attemptOrdinal, filename: 'artifact-index.json', artifact: index });
}

function verifyDynamicEvidenceEntry(entry, expectedPrefix) {
  if (!DYNAMIC_EVIDENCE_KINDS.has(entry.kind)) return;
  const relativePath = entry.path.slice(expectedPrefix.length);
  if (['API_EXCHANGE', 'API_REQUEST_BODY', 'API_RESPONSE_BODY'].includes(entry.kind)
      && (!relativePath.startsWith('api-exchanges/') || entry.media_type !== 'application/json'
        || entry.capture_phase !== 'ACTION' || entry.required !== true)) {
    fail('E2E_INPUT_INVALID', 'API dynamic evidence metadata or path is invalid.');
  }
  if (entry.kind === 'STDOUT_LOG' || entry.kind === 'STDERR_LOG') {
    const stream = entry.kind === 'STDOUT_LOG' ? 'stdout' : 'stderr';
    const matchesInitial = relativePath === `${stream}/initial.log` && entry.capture_phase === 'RUNTIME';
    const matchesReopen = relativePath === `${stream}/reopen.log` && entry.capture_phase === 'REOPEN';
    if (!matchesInitial && !matchesReopen || entry.media_type !== 'text/plain' || entry.required !== true) {
      fail('E2E_INPUT_INVALID', 'Runtime log metadata or path is invalid.');
    }
  }
}

async function verifyAssertionEvidenceClosure(root, references) {
  const observationRef = references.find(entry => entry.kind === 'ATTEMPT_OBSERVATION');
  let observation;
  try { observation = JSON.parse(await readFile(resolveInside(root, observationRef.path), 'utf8')); }
  catch { fail('E2E_INPUT_INVALID', 'Attempt Observation is not valid JSON for assertion evidence closure.'); }
  if (!Array.isArray(observation?.assertion_results) || observation.assertion_results.length < 1) {
    fail('E2E_INPUT_INVALID', 'Attempt Observation assertion results are missing.');
  }
  for (const result of observation.assertion_results) {
    if (!Array.isArray(result?.evidence_refs) || result.evidence_refs.length < 1) {
      fail('E2E_INPUT_INVALID', 'Attempt assertion has no evidence references.');
    }
    for (const evidence of result.evidence_refs) {
      const matches = references.filter(entry => entry.kind === evidence?.kind && entry.path === evidence?.path
        && entry.byte_length === evidence?.byte_length && entry.sha256 === evidence?.sha256);
      if (matches.length !== 1 || evidence.kind === 'ATTEMPT_OBSERVATION') {
        fail('E2E_INPUT_INVALID', 'Attempt assertion evidence does not uniquely join the Artifact Index.');
      }
    }
  }
}

function operationalSupportPath(path) {
  return path === 'inputs' || path.startsWith('inputs/') || path === 'storage' || path.startsWith('storage/');
}

function sameOrderedValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function verifyAttemptObservationInputs({
  caseId, attemptOrdinal, manifestCase, attemptIdentity, subjectBaseRevision, beforeState, afterState,
  reopenState, transactionObservation, reopenObservation, subjectReceipt, expectedSubject, evidence
}) {
  const assertionIds = manifestCase?.assertion_ids;
  const family = typeof manifestCase?.capability_id === 'string';
  if (manifestCase?.case_id !== caseId || !['PASS', 'BLOCKED'].includes(manifestCase?.expectation)
      || !Array.isArray(assertionIds) || assertionIds.length < 1 || new Set(assertionIds).size !== assertionIds.length
      || assertionIds.some(value => !ATTEMPT_ASSERTION_IDS.has(value))
      || typeof manifestCase?.suite_id !== 'string' || !/^[a-f0-9]{64}$/u.test(manifestCase?.fixture_ref?.sha256)
      || !/^[a-f0-9]{64}$/u.test(manifestCase?.input_ref?.sha256)
      || family !== (typeof manifestCase?.coverage_key === 'string')
      || family && !/^CAP-ISO-(?:PROC|CTRL|STRUCT)-[0-9]{3}$/u.test(manifestCase.capability_id)) {
    fail('E2E_INPUT_INVALID', 'Attempt Observation Manifest case is invalid.');
  }
  if (attemptIdentity?.case_id !== caseId || attemptIdentity?.attempt_ordinal !== attemptOrdinal
      || ['project_id', 'model_id', 'context_id'].some(key => typeof attemptIdentity?.[key] !== 'string' || !attemptIdentity[key])
      || typeof subjectBaseRevision !== 'string' || !subjectBaseRevision
      || beforeState?.revision_id !== subjectBaseRevision
      || afterState?.revision_id !== transactionObservation?.after?.draft_head_revision_id
      || reopenState?.revision_id !== afterState?.revision_id
      || reopenObservation?.head_revision !== afterState?.revision_id
      || reopenObservation?.case_id !== caseId || reopenObservation?.attempt_ordinal !== attemptOrdinal
      || transactionObservation?.case_id !== caseId || transactionObservation?.attempt_ordinal !== attemptOrdinal
      || transactionObservation?.before?.draft_head_revision_id !== subjectBaseRevision
      || !validStateDigests(beforeState) || !validStateDigests(afterState) || !validStateDigests(reopenState)) {
    fail('E2E_INPUT_INVALID', 'Attempt Observation state or transaction identity is invalid.');
  }
  const ambiguous = caseId === 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED';
  if (ambiguous !== (subjectReceipt === null) || ambiguous !== (expectedSubject === null)) {
    fail('E2E_INPUT_INVALID', 'Attempt Observation subject command cardinality is invalid.');
  }
  if (!ambiguous && (!validSubjectReceipt(subjectReceipt)
      || !Number.isSafeInteger(expectedSubject?.expected_http_status)
      || !(expectedSubject.expected_error_code === null || typeof expectedSubject.expected_error_code === 'string'))) {
    fail('E2E_INPUT_INVALID', 'Attempt Observation subject response expectation is invalid.');
  }
  const referenceKinds = {
    before_projection_response_ref: 'API_RESPONSE_BODY', after_projection_response_ref: 'API_RESPONSE_BODY',
    subject_request_ref: subjectReceipt === null ? null : 'API_REQUEST_BODY',
    subject_response_ref: subjectReceipt === null ? null : 'API_RESPONSE_BODY',
    transaction_observation_ref: 'TRANSACTION_OBSERVATION', reopen_observation_ref: 'REOPEN_OBSERVATION',
    runtime_process_ref: 'RUNTIME_PROCESS', api_exchange_index_ref: 'API_EXCHANGE_INDEX'
  };
  for (const [key, kind] of Object.entries(referenceKinds)) {
    if (kind === null ? evidence?.[key] !== null : !validAttemptReportRef(evidence?.[key], kind, caseId, attemptOrdinal)) {
      fail('E2E_INPUT_INVALID', `Attempt Observation evidence reference is invalid: ${key}.`);
    }
  }
  const prefix = `${attemptRelativeRoot(caseId, attemptOrdinal)}/`;
  for (const [reference, source] of [
    [evidence.before_projection_response_ref, beforeState.projection_response_ref],
    [evidence.after_projection_response_ref, afterState.projection_response_ref],
    [evidence.subject_request_ref, subjectReceipt?.raw_request?.body_ref],
    [evidence.subject_response_ref, subjectReceipt?.response?.body_ref]
  ]) {
    if (reference !== null && (!source || reference.path !== `${prefix}${source.path}`
        || reference.byte_length !== source.byte_length || reference.sha256 !== source.sha256)) {
      fail('E2E_INPUT_INVALID', 'Attempt Observation raw API evidence differs from the captured receipt.');
    }
  }
}

function assertionEvidenceRefs(assertionId, hasSubject, evidence) {
  const subject = hasSubject ? [evidence.subject_request_ref, evidence.subject_response_ref] : [];
  const mapping = {
    REVISION_COMMITTED: [...subject, evidence.transaction_observation_ref],
    TRANSACTION_MATCHED: [evidence.transaction_observation_ref],
    PROJECTION_MATCHED: [evidence.before_projection_response_ref, evidence.after_projection_response_ref, evidence.reopen_observation_ref],
    TEXT_TRACE_MATCHED: [evidence.before_projection_response_ref, evidence.after_projection_response_ref, evidence.reopen_observation_ref],
    ERROR_CODE_MATCHED: [...subject, evidence.api_exchange_index_ref],
    TRANSACTION_ZERO: [evidence.transaction_observation_ref],
    HEAD_UNCHANGED: [evidence.transaction_observation_ref],
    PROJECTION_UNCHANGED: [evidence.before_projection_response_ref, evidence.after_projection_response_ref, evidence.transaction_observation_ref],
    REVISION_OR_BLOCKED_MATCHED: [...subject, evidence.transaction_observation_ref],
    REOPEN_MATCHED: [evidence.runtime_process_ref, evidence.reopen_observation_ref]
  };
  return Object.freeze(mapping[assertionId].map(reference => Object.freeze({ ...reference })));
}

function validStateDigests(value) {
  return value && typeof value.revision_id === 'string' && value.revision_id
    && value.projection_response_ref?.kind === 'API_RESPONSE_BODY'
    && ['revision_document_sha256', 'projection_sha256', 'opl_sha256', 'token_sha256', 'trace_sha256']
      .every(key => /^[a-f0-9]{64}$/u.test(value[key]));
}

function validSubjectReceipt(value) {
  return value && value.actual_request?.method === 'POST' && value.exchange_entry?.operation_id === 'API-EDT-002'
    && value.raw_request?.body && value.raw_request.body_ref?.kind === 'API_REQUEST_BODY'
    && value.response?.body && value.response.body_ref?.kind === 'API_RESPONSE_BODY'
    && value.exchange_ref?.kind === 'API_EXCHANGE';
}

function validAttemptReportRef(value, kind, caseId, attemptOrdinal) {
  return value && value.kind === kind && value.path?.startsWith(`${attemptRelativeRoot(caseId, attemptOrdinal)}/`)
    && Number.isSafeInteger(value.byte_length) && value.byte_length >= 0 && /^[a-f0-9]{64}$/u.test(value.sha256);
}

function sameStateDigests(left, right) {
  return ['revision_document_sha256', 'projection_sha256', 'opl_sha256', 'token_sha256', 'trace_sha256']
    .every(key => left?.[key] === right?.[key]);
}

function zeroTransaction(value) {
  return value && ['revision_delta', 'revision_parent_delta', 'text_artifact_delta', 'text_trace_delta', 'finding_delta', 'operation_delta', 'receipt_delta']
    .every(key => value[key] === 0) && value.draft_head_changed === false;
}

function nullableNonEmpty(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function freezeValue(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}

function transactionDelta(before, after) {
  const pairs = [
    ['revision_delta', 'revision_document_count'],
    ['revision_parent_delta', 'revision_parent_count'],
    ['text_artifact_delta', 'text_artifact_count'],
    ['text_trace_delta', 'text_trace_count'],
    ['finding_delta', 'finding_count'],
    ['operation_delta', 'operation_count'],
    ['receipt_delta', 'receipt_count']
  ];
  const result = {};
  for (const [target, source] of pairs) {
    const left = before?.[source];
    const right = after?.[source];
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < left) {
      fail('E2E_INPUT_INVALID', 'Transaction snapshot counters must be monotonic safe integers.');
    }
    result[target] = right - left;
  }
  if (typeof before?.draft_head_revision_id !== 'string' || typeof after?.draft_head_revision_id !== 'string'
      || !Number.isSafeInteger(before?.head_sequence) || !Number.isSafeInteger(after?.head_sequence)
      || before.head_sequence < 1 || after.head_sequence < before.head_sequence) {
    fail('E2E_INPUT_INVALID', 'Transaction snapshot Head identity is invalid.');
  }
  result.draft_head_changed = before.draft_head_revision_id !== after.draft_head_revision_id
    || before.head_sequence !== after.head_sequence;
  return Object.freeze(result);
}

function withPayloadDigest(artifact) {
  const payload = { ...artifact };
  delete payload.artifact_payload_sha256;
  return Object.freeze({ ...payload, artifact_payload_sha256: sha256Jcs(payload) });
}

function faultMapping(caseId) {
  if (caseId === 'E2E-CANVAS-007.ASSET_MISSING') return ['ASSET_MISSING', 'SYMBOL_CATALOG_ASSET', 1];
  if (caseId === 'E2E-CANVAS-007.PERSISTENCE_FAILED') return ['PERSISTENCE_FAILED', 'SQLITE_BEFORE_REVISION_INSERT', 1];
  if (caseId === 'E2E-CANVAS-007.READONLY') return ['READONLY', 'PROJECT_STORAGE_READ_ONLY', 1];
  return ['NONE', 'NONE', 0];
}

function assertAttemptIdentity(caseId, attemptOrdinal) {
  const commonCase = /^E2E-CANVAS-00[1-7]\.[A-Z0-9][A-Z0-9._-]*$/;
  const familyCase = /^G-OPL-(?:PROC|CTRL|STRUCT)-[0-9]{3}\.[A-Z0-9][A-Z0-9._-]*$/;
  if (typeof caseId !== 'string' || !commonCase.test(caseId) && !familyCase.test(caseId) || ![1, 2].includes(attemptOrdinal)) {
    fail('E2E_INPUT_INVALID', 'Attempt case_id or attempt_ordinal is invalid.');
  }
}

/** Attempt artifact 与 Runner 共用的冻结路径映射。 */
export function attemptRelativeRoot(caseId, attemptOrdinal) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  return `attempts/${encodeCaseId(caseId)}/${attemptOrdinal}`;
}

async function ensureAttemptDirectory(root, caseId, attemptOrdinal) {
  const segments = attemptRelativeRoot(caseId, attemptOrdinal).split('/');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Attempt path contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false });
    }
  }
  return current;
}

async function ensureArtifactParent(attemptDirectory, filename) {
  let current = attemptDirectory;
  for (const segment of filename.split('/').slice(0, -1)) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Artifact parent contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false });
    }
  }
}

async function atomicWrite(path, text) {
  const temporary = `${path}.tmp-${randomBytes(16).toString('hex')}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await fsyncPath(resolve(path, '..'));
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throwWrite(error);
  }
}

function throwWrite(error) {
  if (error instanceof E2eRunInputError) throw error;
  throw new E2eRunInputError('E2E_UNEXPECTED_RUNTIME_ERROR', error?.message ?? 'Cannot atomically write attempt artifact.', 4);
}

async function assertDirectory(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Report staging root is missing.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Report staging root must be a non-symlink directory.');
  return resolve(path);
}

async function assertFresh(path) {
  try {
    await lstat(path);
    fail('E2E_INPUT_INVALID', 'Attempt artifact path already exists.');
  } catch (error) {
    if (error instanceof E2eRunInputError) throw error;
  }
}

async function assertRegularFile(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Artifact Index references a missing file.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail('E2E_INPUT_INVALID', 'Artifact Index requires a single-link regular file.');
  return details;
}

async function listFiles(directory, prefix) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink() || !details.isFile() && !details.isDirectory() || details.isFile() && details.nlink !== 1) {
      fail('E2E_INPUT_INVALID', 'Attempt artifact tree contains an unsafe entry.');
    }
    if (details.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else files.push(relativePath);
  }
  return files.sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')));
}

function rawRef(root, path, kind) {
  return readFile(path).then(bytes => Object.freeze({
    kind,
    path: relative(root, path).split(sep).join('/'),
    byte_length: bytes.length,
    sha256: sha256(bytes)
  }));
}

function validProcessCycle(cycle) {
  const health = cycle?.health_samples;
  const startedAt = Date.parse(cycle?.started_at);
  const stoppedAt = Date.parse(cycle?.stopped_at);
  return Array.isArray(cycle?.normalized_command) && cycle.normalized_command.length >= 3
    && cycle.normalized_command.every(value => typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !/=[/\\]/u.test(value))
    && cycle.java_ref?.kind === 'E2E_JAVA_EXECUTABLE_MIRROR'
    && cycle.runtime_jar_ref?.kind === 'LOCAL_RUNTIME_JAR'
    && Array.isArray(health) && health.length === 3
    && health.every((sample, index) => sample?.ordinal === index + 1 && sample.status === 'UP' && Number.isFinite(Date.parse(sample.observed_at)))
    && Number.isFinite(startedAt) && Number.isFinite(stoppedAt) && startedAt <= stoppedAt
    && cycle.stdout_ref?.kind === 'STDOUT_LOG' && cycle.stderr_ref?.kind === 'STDERR_LOG'
    && cycle.owned_child_count_after_stop === 0;
}

function resolveInside(root, value) {
  const path = resolve(root, value);
  const relation = relative(root, path);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    fail('E2E_INPUT_INVALID', 'Artifact path escapes report root.');
  }
  return path;
}

function compareUtf8Path(left, right) {
  return Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'));
}

function encodeCaseId(value) {
  return Array.from(Buffer.from(value, 'utf8')).map(byte => /[A-Za-z0-9._-]/.test(String.fromCharCode(byte))
    ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokenPreimage(token, pointer) {
  exactTokenFields(token, TOKEN_FIELDS, pointer, TOKEN_FIELDS);
  const text = requiredNfc(token.text, `${pointer}/text`);
  const kind = requiredNfc(token.kind, `${pointer}/kind`);
  if (!TOKEN_KINDS.has(kind)) tokenFail('TOKEN_DIGEST_ENUM_INVALID', `${pointer}/kind`, 'Token kind 不受支持。');
  const start = safeTokenInteger(token.start_utf8_byte, `${pointer}/start_utf8_byte`);
  const end = safeTokenInteger(token.end_utf8_byte, `${pointer}/end_utf8_byte`);
  if (end <= start || end - start !== Buffer.byteLength(text, 'utf8')) {
    tokenFail('TOKEN_DIGEST_RANGE_INVALID', `${pointer}/end_utf8_byte`, 'Token UTF-8 byte range 未闭合。');
  }
  if (!Array.isArray(token.source_refs) || token.source_refs.length === 0) {
    tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', `${pointer}/source_refs`, 'source_refs 必须是非空数组。');
  }
  return {
    token_id: requiredNfc(token.token_id, `${pointer}/token_id`),
    sentence_id: requiredNfc(token.sentence_id, `${pointer}/sentence_id`),
    ordinal: safeTokenInteger(token.ordinal, `${pointer}/ordinal`),
    text,
    kind,
    start_utf8_byte: start,
    end_utf8_byte: end,
    source_refs: token.source_refs.map((source, index) => sourcePreimage(source, `${pointer}/source_refs/${index}`))
  };
}

function sourcePreimage(source, pointer) {
  exactTokenFields(source, SOURCE_FIELDS, pointer, new Set(['source_kind', 'stable_id']));
  const kind = requiredNfc(source.source_kind, `${pointer}/source_kind`);
  if (!SOURCE_KINDS.has(kind)) tokenFail('TOKEN_DIGEST_ENUM_INVALID', `${pointer}/source_kind`, 'Source kind 不受支持。');
  const result = { source_kind: kind, stable_id: requiredNfc(source.stable_id, `${pointer}/stable_id`) };
  for (const field of ['field_path', 'sentence_slot']) {
    if (Object.hasOwn(source, field)) result[field] = requiredNfc(source[field], `${pointer}/${field}`);
  }
  if (Object.hasOwn(source, 'endpoint_ordinal')) result.endpoint_ordinal = safeTokenInteger(source.endpoint_ordinal, `${pointer}/endpoint_ordinal`);
  return result;
}

function exactTokenFields(value, allowed, pointer, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.has(key))
      || [...required].some(key => !Object.hasOwn(value, key))) {
    tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', pointer, 'Token preimage 字段不符合契约。');
  }
}

function requiredNfc(value, pointer) {
  if (typeof value !== 'string' || value.length === 0) tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', pointer, '字符串字段不能为空。');
  if (value.normalize('NFC') !== value) tokenFail('TOKEN_DIGEST_UNICODE_INVALID', pointer, '字符串必须为 NFC。');
  return value;
}

function safeTokenInteger(value, pointer) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_INTEGER) {
    tokenFail('TOKEN_DIGEST_NUMBER_DOMAIN_INVALID', pointer, '字段必须是非负安全整数。');
  }
  return value;
}

function tokenFail(code, pointer, message) {
  throw new TokenDigestError(code, pointer, message);
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}
