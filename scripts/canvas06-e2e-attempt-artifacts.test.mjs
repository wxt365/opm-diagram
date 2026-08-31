import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  attemptRelativeRoot,
  browserEnvironmentFingerprintPreimage,
  createAttemptObservation,
  createBrowserEnvironment,
  createConsoleErrors,
  createFaultPlan,
  createNetworkObservation,
  createReopenObservation,
  createRuntimeProcess,
  createTransactionObservation,
  RELEASE_BROWSER_LAUNCH_ARGS,
  TokenDigestError,
  tokenDigestCanonicalBytes,
  tokenDigestPreimage,
  tokenDigestSha256,
  writeArtifactIndex,
  writeAttemptArtifact,
  writeFaultPlan
} from './canvas06-e2e-attempt-artifacts.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const CASE_ID = 'E2E-CANVAS-007.ASSET_MISSING';

test('uses one percent-encoded path mapping for Runner and Attempt artifacts', () => {
  assert.equal(attemptRelativeRoot('E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 1), 'attempts/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES/1');
  assert.equal(attemptRelativeRoot('G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS', 1), 'attempts/G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS/1');
  assert.equal(attemptRelativeRoot('G-OPL-CTRL-008.INSTRUMENT_STATE.PASS', 2), 'attempts/G-OPL-CTRL-008.INSTRUMENT_STATE.PASS/2');
  assert.equal(attemptRelativeRoot('G-OPL-STRUCT-010.BIDIRECTIONAL_NULL_TAG.BLOCKED', 1), 'attempts/G-OPL-STRUCT-010.BIDIRECTIONAL_NULL_TAG.BLOCKED/1');
  for (const invalid of [
    'E2E-CANVAS-007.TEXT_BLOCKED/REOPEN',
    'G-OPL-UNKNOWN-001.CASE.PASS',
    'g-opl-proc-001.CASE.PASS',
    'G-OPL-PROC-01.CASE.PASS',
    'G-OPL-PROC-001.../CASE',
    'G-OPL-PROC-001.CASE\\REOPEN',
    `G-OPL-PROC-001.CASE\u0000PASS`
  ]) assert.throws(() => attemptRelativeRoot(invalid, 1), error => error.code === 'E2E_INPUT_INVALID');
  assert.throws(() => attemptRelativeRoot(CASE_ID, 3), error => error.code === 'E2E_INPUT_INVALID');
});

test('builds and atomically writes the frozen fault plan mapping', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-artifact-'));
  const nonce = 'a'.repeat(64);
  const plan = createFaultPlan({ caseId: CASE_ID, attemptOrdinal: 1, nonce });
  assert.equal(plan.fault_kind, 'ASSET_MISSING');
  assert.equal(plan.target, 'SYMBOL_CATALOG_ASSET');
  assert.equal(plan.trigger_count, 1);
  assert.equal(plan.plan_sha256, sha256Jcs({ case_id: CASE_ID, attempt_ordinal: 1, fault_kind: 'ASSET_MISSING', target: 'SYMBOL_CATALOG_ASSET', trigger_count: 1, nonce }));

  const ref = await writeFaultPlan({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, nonce });
  const written = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
  assert.deepEqual(written, plan);
  await assert.rejects(() => writeFaultPlan({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, nonce }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects a filename whose root schema identity does not match', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-artifact-invalid-'));
  await assert.rejects(() => writeAttemptArtifact({
    reportRoot: root,
    caseId: CASE_ID,
    attemptOrdinal: 1,
    filename: 'runtime-process.json',
    artifact: createFaultPlan({ caseId: CASE_ID, attemptOrdinal: 1, nonce: 'b'.repeat(64) })
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('creates the fixed api-exchanges parent for a valid nested root', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-api-index-'));
  const exchanges = [{
    sequence: 1,
    operation_id: 'OPM-WORKSPACE-001',
    method: 'GET',
    normalized_url: 'http://127.0.0.1:15173/api/v1/projects',
    request_ref: null,
    response_ref: null,
    exchange_ref: { kind: 'API_EXCHANGE', path: `attempts/${CASE_ID}/1/api-exchanges/exchange-000001.json`, byte_length: 3, sha256: 'a'.repeat(64) },
    status: 200,
    revision: null
  }];
  const artifact = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001',
    schema_version: '0.2',
    case_id: CASE_ID,
    attempt_ordinal: 1,
    exchanges,
    exchange_set_sha256: sha256Jcs(exchanges)
  };
  const ref = await writeAttemptArtifact({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, filename: 'api-exchanges/index.json', artifact });
  assert.equal(ref.path, `attempts/${CASE_ID}/1/api-exchanges/index.json`);
});

test('constructs an index from exact regular files and rejects unindexed evidence', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-'));
  const attempt = resolve(root, 'attempts', CASE_ID, '1');
  await mkdir(resolve(attempt, 'api-exchanges'), { recursive: true });
  const entries = coreEntries(CASE_ID);
  await materializeIndexEntries(root, entries);
  const ref = await writeArtifactIndex({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, entries });
  const index = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
  assert.equal(index.refs.length, 20);
  assert.equal(index.tree_sha256, sha256Jcs(index.refs));

  const rootWithExtra = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-extra-'));
  const extraEntries = coreEntries(CASE_ID);
  await materializeIndexEntries(rootWithExtra, extraEntries);
  const extraAttempt = resolve(rootWithExtra, 'attempts', CASE_ID, '1');
  await writeFile(resolve(extraAttempt, 'unindexed.log'), 'extra\n');
  await assert.rejects(() => writeArtifactIndex({ reportRoot: rootWithExtra, caseId: CASE_ID, attemptOrdinal: 1, entries: extraEntries }), error => error.code === 'E2E_INPUT_INVALID');
});

test('indexes dynamic API evidence while excluding only controlled inputs and storage', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-dynamic-'));
  const base = `attempts/${CASE_ID}/1`;
  const entries = coreEntries(CASE_ID).concat([
    ['API_EXCHANGE', 'api-exchanges/exchange-000001.json'],
    ['API_REQUEST_BODY', 'api-exchanges/exchange-000001.request.json'],
    ['API_RESPONSE_BODY', 'api-exchanges/exchange-000001.response.json']
  ].map(([kind, file]) => ({ kind, path: `${base}/${file}`, media_type: 'application/json', capture_phase: 'ACTION', required: true })));
  await materializeIndexEntries(root, entries);
  await mkdir(resolve(root, base, 'inputs/build'), { recursive: true });
  await mkdir(resolve(root, base, 'storage/projects/project-1'), { recursive: true });
  await writeFile(resolve(root, base, 'inputs/build/local-runtime.jar'), 'runtime');
  await writeFile(resolve(root, base, 'storage/projects/project-1/project.db'), 'sqlite');

  const reference = await writeArtifactIndex({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, entries });
  const index = JSON.parse(await readFile(resolve(root, reference.path), 'utf8'));
  assert.equal(index.refs.length, 23);
  assert.deepEqual(index.refs.filter(item => item.kind.startsWith('API_')).map(item => item.kind).sort(), [
    'API_EXCHANGE', 'API_EXCHANGE_INDEX', 'API_REQUEST_BODY', 'API_RESPONSE_BODY'
  ]);
});

test('derives and writes the seven remaining frozen attempt evidence roots', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-derived-artifacts-'));
  const cycles = [processCycle('INITIAL', 41001, 'a'.repeat(64)), processCycle('REOPEN', 41002, 'b'.repeat(64))];
  const runtime = createRuntimeProcess({ caseId: CASE_ID, attemptOrdinal: 1, cycles });
  assert.throws(
    () => createRuntimeProcess({ caseId: CASE_ID, attemptOrdinal: 1, cycles: [cycles[0], { ...cycles[1], parent_nonce: cycles[0].parent_nonce }] }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  const browser = createBrowserEnvironment({
    caseId: CASE_ID,
    attemptOrdinal: 1,
    environment: browserEnvironmentInput()
  });
  const requests = [{
    sequence: 1,
    method: 'GET',
    normalized_url: 'http://127.0.0.1:15173/api/v1/projects',
    resource_type: 'FETCH',
    status: 200,
    failure_code: null,
    request_body_ref: null,
    response_body_ref: fileRef('API_RESPONSE_BODY', `attempts/${CASE_ID}/1/api-exchanges/exchange-000001.response.json`),
    operation_id: 'OPM-WORKSPACE-001',
    revision: null,
    allow_decision: 'ALLOWED'
  }];
  const network = createNetworkObservation({
    caseId: CASE_ID,
    attemptOrdinal: 1,
    requests,
    counters: { external_request_count: 0, websocket_count: 0, service_worker_count: 0, download_count: 0, popup_count: 0 }
  });
  const consoleErrors = createConsoleErrors({ caseId: CASE_ID, attemptOrdinal: 1, events: [] });
  const before = countSnapshot(1);
  const after = countSnapshot(1);
  const expectedTransaction = zeroTransaction();
  const transaction = createTransactionObservation({ caseId: CASE_ID, attemptOrdinal: 1, before, after, expectedTransaction });
  const reopen = createReopenObservation({
    caseId: CASE_ID,
    attemptOrdinal: 1,
    observation: reopenObservationInput()
  });
  const attempt = createAttemptObservation(attemptObservationInput({ transaction, reopen }));

  const artifacts = [
    ['runtime-process.json', runtime],
    ['browser-environment.json', browser],
    ['network-observation.json', network],
    ['console-errors.json', consoleErrors],
    ['transaction-observation.json', transaction],
    ['reopen-observation.json', reopen],
    ['attempt-observation.json', attempt]
  ];
  for (const [filename, artifact] of artifacts) {
    const reference = await writeAttemptArtifact({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, filename, artifact });
    const written = JSON.parse(await readFile(resolve(root, reference.path), 'utf8'));
    assert.match(written.artifact_payload_sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(browser.environment_fingerprint, sha256Jcs(browserEnvironmentFingerprintPreimage(browser)));
  assert.equal(transaction.matches, true);
  assert.deepEqual(transaction.observed_transaction, expectedTransaction);
  assert.equal(reopen.reopen_matches, true);
  assert.match(attempt.semantic_comparison_digest, /^[a-f0-9]{64}$/);
});

test('rejects non-monotonic transaction state and reused REOPEN identities', () => {
  assert.throws(() => createTransactionObservation({
    caseId: CASE_ID,
    attemptOrdinal: 1,
    before: countSnapshot(2),
    after: countSnapshot(1),
    expectedTransaction: zeroTransaction()
  }), error => error.code === 'E2E_INPUT_INVALID');
  const observation = reopenObservationInput();
  assert.throws(() => createReopenObservation({
    caseId: CASE_ID,
    attemptOrdinal: 1,
    observation: { ...observation, reopen_process_nonce: observation.initial_process_nonce }
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects incomplete Runtime and Browser execution evidence before artifact publication', () => {
  const initial = processCycle('INITIAL', 41001, 'a'.repeat(64));
  const reopen = processCycle('REOPEN', 41002, 'b'.repeat(64));
  assert.throws(
    () => createRuntimeProcess({
      caseId: CASE_ID,
      attemptOrdinal: 1,
      cycles: [{ ...initial, health_samples: initial.health_samples.slice(0, 2) }, reopen]
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  assert.throws(
    () => createRuntimeProcess({
      caseId: CASE_ID,
      attemptOrdinal: 1,
      cycles: [{ ...initial, normalized_command: ['/absolute/java', '-jar', 'inputs/build/local-runtime.jar'] }, reopen]
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  assert.throws(
    () => createBrowserEnvironment({
      caseId: CASE_ID,
      attemptOrdinal: 1,
      environment: { ...browserEnvironmentInput(), chromium_version: '143.0.7499.5' }
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  assert.throws(
    () => createReopenObservation({
      caseId: CASE_ID,
      attemptOrdinal: 1,
      observation: { ...reopenObservationInput(), reopen_browser_context_id: 'browser-context.reopen' }
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  const request = {
    sequence: 1, method: 'GET', normalized_url: '/api/v1/projects', resource_type: 'FETCH', status: 200,
    failure_code: null, request_body_ref: null, response_body_ref: fileRef('API_RESPONSE_BODY', 'api-exchanges/1.response.json'),
    operation_id: 'OPM-WORKSPACE-001', revision: null, allow_decision: 'ALLOWED'
  };
  assert.throws(
    () => createNetworkObservation({
      caseId: CASE_ID, attemptOrdinal: 1,
      requests: [{ ...request, sequence: 2 }],
      counters: { external_request_count: 0, websocket_count: 0, service_worker_count: 0, download_count: 0, popup_count: 0 }
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
  assert.throws(
    () => createConsoleErrors({
      caseId: CASE_ID, attemptOrdinal: 1,
      events: [{ sequence: 1, event_kind: 'CONSOLE_ERROR', message_sha256: '1'.repeat(64), source_ref: null, allow_decision: 'ALLOWED' }]
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('matches every frozen Token Digest parity vector', async () => {
  const catalog = JSON.parse(await readFile(new URL('../tests/e2e/release/dev-canvas-06/fixtures/token-digest-v01-parity-vectors.json', import.meta.url), 'utf8'));
  for (const vector of catalog.positive_vectors) {
    assert.deepEqual(tokenDigestPreimage(vector.input_revision_id, vector.input_tokens), vector.expected_preimage, vector.vector_id);
    assert.equal(tokenDigestCanonicalBytes(vector.input_revision_id, vector.input_tokens).toString('hex'), vector.expected_canonical_utf8_hex, vector.vector_id);
    assert.equal(tokenDigestSha256(vector.input_revision_id, vector.input_tokens), vector.expected_token_sha256, vector.vector_id);
  }
  for (const vector of catalog.negative_vectors) {
    const base = catalog.positive_vectors.find(item => item.vector_id === vector.base_positive_vector_id);
    const tokens = structuredClone(base.input_tokens);
    applyTokenMutation(tokens, vector.mutation);
    assert.throws(() => tokenDigestPreimage(base.input_revision_id, tokens), error => error instanceof TokenDigestError
      && error.code === vector.expected_error_code && error.jsonPointer === vector.expected_error_pointer, vector.vector_id);
  }
});

function applyTokenMutation(tokens, mutation) {
  const segments = mutation.json_pointer.substring(1).split('/');
  let parent = { tokens };
  for (let index = 0; index < segments.length - 1; index += 1) parent = parent[segments[index]];
  const field = segments.at(-1);
  parent[field] = switchTokenMutation(mutation.value_token);
}

function switchTokenMutation(value) {
  if (value === 'NON_NFC_E\u0301') return 'E\u0301';
  if (value === 'END_BEFORE_START') return 0;
  if (value === 'NUMBER:9007199254740992') return 9007199254740992;
  if (value === 'UNKNOWN_KIND') return 'UNKNOWN_KIND';
  throw new Error(`未知 Token mutation value: ${value}`);
}

function coreEntries(caseId) {
  const base = `attempts/${caseId}/1`;
  return [
    ['FAULT_PLAN', 'fault-plan.json', 'MATERIALIZE'],
    ['FIXTURE_MATERIALIZATION', 'fixture-materialization.json', 'MATERIALIZE'],
    ['ATTEMPT_OBSERVATION', 'attempt-observation.json', 'FINALIZE'],
    ['RUNTIME_PROCESS', 'runtime-process.json', 'RUNTIME'],
    ['BROWSER_ENVIRONMENT', 'browser-environment.json', 'RUNTIME'],
    ['NETWORK_OBSERVATION', 'network-observation.json', 'ACTION'],
    ['CONSOLE_ERRORS', 'console-errors.json', 'ACTION'],
    ['TRANSACTION_OBSERVATION', 'transaction-observation.json', 'ACTION'],
    ['REOPEN_OBSERVATION', 'reopen-observation.json', 'REOPEN'],
    ['API_EXCHANGE_INDEX', 'api-exchanges/index.json', 'ACTION']
  ].map(([kind, file, capture_phase]) => ({ kind, path: `${base}/${file}`, media_type: 'application/json', capture_phase, required: true }))
    .concat({ kind: 'PROFILE_ASSET_TREE', path: `${base}/profile/assets`, media_type: 'application/vnd.opm.profile-asset-tree+json', capture_phase: 'MATERIALIZE', required: true })
    .concat([
      ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'],
      ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'],
      ['PROFILE_PACKAGE', 'profile.json'],
      ['RULE_SET', 'rules/representative-rule-set.json'],
      ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
    ].map(([asset_kind, file]) => ({ kind: 'PROFILE_ASSET', asset_kind, path: `${base}/profile/assets/${file}`, media_type: 'application/json', capture_phase: 'MATERIALIZE', required: true })))
    .concat([
      ['STDOUT_LOG', 'stdout/initial.log', 'RUNTIME'],
      ['STDERR_LOG', 'stderr/initial.log', 'RUNTIME'],
      ['STDOUT_LOG', 'stdout/reopen.log', 'REOPEN'],
      ['STDERR_LOG', 'stderr/reopen.log', 'REOPEN']
    ].map(([kind, file, capture_phase]) => ({ kind, path: `${base}/${file}`, media_type: 'text/plain', capture_phase, required: true })));
}

function fileRef(kind, path, sha256 = 'b'.repeat(64)) {
  return { kind, path, byte_length: 1, sha256 };
}

function processCycle(cycle, pid, nonce) {
  return {
    cycle,
    normalized_command: ['java', '-jar', 'inputs/build/local-runtime.jar'],
    java_ref: fileRef('E2E_JAVA_EXECUTABLE_MIRROR', 'inputs/runner/toolchain/java/a/java'),
    runtime_jar_ref: fileRef('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar'),
    pid,
    parent_nonce: nonce,
    host: '127.0.0.1',
    port: 18080,
    health_samples: [1, 2, 3].map(ordinal => ({ ordinal, status: 'UP', observed_at: '2026-08-31T00:00:00Z' })),
    started_at: '2026-08-31T00:00:00Z',
    stopped_at: '2026-08-31T00:01:00Z',
    termination: { kind: 'NORMAL', exit_code: 0, signal: null, owned_process_terminated: true },
    stdout_ref: fileRef('STDOUT_LOG', `attempts/${CASE_ID}/1/stdout/${cycle.toLowerCase()}.log`),
    stderr_ref: fileRef('STDERR_LOG', `attempts/${CASE_ID}/1/stderr/${cycle.toLowerCase()}.log`),
    owned_child_count_after_stop: 0
  };
}

function browserEnvironmentInput() {
  return {
    node_version: '22.22.0',
    playwright_version: '1.57.0',
    chromium_version: '143.0.7499.4',
    browser_executable_ref: fileRef('E2E_BROWSER_EXECUTABLE_MIRROR', 'inputs/runner/toolchain/chromium/b/chromium'),
    launch_args: [...RELEASE_BROWSER_LAUNCH_ARGS],
    viewport: { viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 },
    zoom_id: 'Z-100',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    color_scheme: 'light',
    reduced_motion: 'reduce',
    web_server_source_ref: fileRef('WEB_SERVER_SOURCE', 'inputs/runner/scripts/canvas06-e2e-production-web.mjs'),
    web_dist_ref: fileRef('WEB_DIST_TREE', 'attempts/case/1/inputs/build/web-dist'),
    web_origin: 'http://127.0.0.1:15173',
    runtime_origin: 'http://127.0.0.1:18080'
  };
}

function countSnapshot(count) {
  return {
    revision_document_count: count,
    revision_parent_count: count,
    text_artifact_count: count,
    text_trace_count: count,
    finding_count: count,
    operation_count: count,
    receipt_count: count,
    draft_head_revision_id: `revision.${count}`,
    head_sequence: count
  };
}

function zeroTransaction() {
  return {
    revision_delta: 0,
    revision_parent_delta: 0,
    text_artifact_delta: 0,
    text_trace_delta: 0,
    finding_delta: 0,
    operation_delta: 0,
    receipt_delta: 0,
    draft_head_changed: false
  };
}

function reopenObservationInput() {
  return {
    runtime_process_ref: fileRef('RUNTIME_PROCESS', `attempts/${CASE_ID}/1/runtime-process.json`),
    initial_process_nonce: 'c'.repeat(64),
    reopen_process_nonce: 'd'.repeat(64),
    initial_browser_context_id: `browser-context.initial.${'3'.repeat(64)}`,
    reopen_browser_context_id: `browser-context.reopen.${'4'.repeat(64)}`,
    project_id: 'project.e2e.001',
    model_id: 'model.e2e.001',
    context_id: 'context.e2e.001',
    head_revision: 'revision.1',
    projection_before_sha256: 'e'.repeat(64),
    projection_reopen_sha256: 'e'.repeat(64),
    opl_before_sha256: 'f'.repeat(64),
    opl_reopen_sha256: 'f'.repeat(64),
    token_before_sha256: '1'.repeat(64),
    token_reopen_sha256: '1'.repeat(64),
    trace_before_sha256: '2'.repeat(64),
    trace_reopen_sha256: '2'.repeat(64)
  };
}

function attemptObservationInput({ transaction, reopen }) {
  const base = `attempts/${CASE_ID}/1`;
  const beforeProjection = fileRef('API_RESPONSE_BODY', 'api-exchanges/before.response.json', '5'.repeat(64));
  const afterProjection = fileRef('API_RESPONSE_BODY', 'api-exchanges/after.response.json', '6'.repeat(64));
  const subjectRequest = fileRef('API_REQUEST_BODY', 'api-exchanges/subject.request.json', '7'.repeat(64));
  const subjectResponse = fileRef('API_RESPONSE_BODY', 'api-exchanges/subject.response.json', '8'.repeat(64));
  const subjectReceipt = {
    actual_request: { method: 'POST' },
    exchange_entry: { operation_id: 'API-EDT-002' },
    raw_request: {
      body: { command_id: 'command.e2e.blocked', payload: { selected_option_id: 'option.e2e.blocked' } },
      body_ref: subjectRequest
    },
    response: { status: 422, body: { error: { code: 'TEXT_GENERATION_BLOCKED' } }, body_ref: subjectResponse },
    exchange_ref: fileRef('API_EXCHANGE', 'api-exchanges/subject.json', '9'.repeat(64))
  };
  const state = (projectionResponseRef) => ({
    revision_id: 'revision.1', revision_document_sha256: 'a'.repeat(64), projection_sha256: 'e'.repeat(64),
    opl_sha256: 'f'.repeat(64), token_sha256: '1'.repeat(64), trace_sha256: '2'.repeat(64),
    projection_response_ref: projectionResponseRef
  });
  return {
    caseId: CASE_ID,
    attemptOrdinal: 1,
    manifestCase: {
      case_id: CASE_ID, suite_id: 'E2E-CANVAS-007', expectation: 'BLOCKED',
      fixture_ref: fileRef('FIXTURE', 'fixtures/base.json', '3'.repeat(64)),
      input_ref: fileRef('INPUT', 'fixtures/input.json', '4'.repeat(64)),
      expected_transaction: zeroTransaction(),
      assertion_ids: ['ERROR_CODE_MATCHED', 'TRANSACTION_ZERO', 'HEAD_UNCHANGED', 'PROJECTION_UNCHANGED', 'REVISION_OR_BLOCKED_MATCHED', 'REOPEN_MATCHED']
    },
    attemptIdentity: { case_id: CASE_ID, attempt_ordinal: 1, project_id: 'project.e2e.001', model_id: 'model.e2e.001', context_id: 'context.e2e.001' },
    subjectBaseRevision: 'revision.1',
    beforeState: state(beforeProjection),
    afterState: state(afterProjection),
    reopenState: state(afterProjection),
    transactionObservation: transaction,
    reopenObservation: reopen,
    subjectReceipt,
    expectedSubject: { expected_http_status: 422, expected_error_code: 'TEXT_GENERATION_BLOCKED' },
    evidence: {
      before_projection_response_ref: { ...beforeProjection, path: `${base}/${beforeProjection.path}` },
      after_projection_response_ref: { ...afterProjection, path: `${base}/${afterProjection.path}` },
      subject_request_ref: { ...subjectRequest, path: `${base}/${subjectRequest.path}` },
      subject_response_ref: { ...subjectResponse, path: `${base}/${subjectResponse.path}` },
      transaction_observation_ref: fileRef('TRANSACTION_OBSERVATION', `${base}/transaction-observation.json`, 'b'.repeat(64)),
      reopen_observation_ref: fileRef('REOPEN_OBSERVATION', `${base}/reopen-observation.json`, 'c'.repeat(64)),
      runtime_process_ref: fileRef('RUNTIME_PROCESS', `${base}/runtime-process.json`, 'd'.repeat(64)),
      api_exchange_index_ref: fileRef('API_EXCHANGE_INDEX', `${base}/api-exchanges/index.json`, 'e'.repeat(64))
    }
  };
}

async function materializeIndexEntries(root, entries) {
  for (const entry of entries) {
    const file = resolve(root, entry.path);
    if (entry.kind === 'PROFILE_ASSET_TREE') await mkdir(file, { recursive: true });
    else if (entry.kind !== 'ATTEMPT_OBSERVATION') {
      await mkdir(resolve(file, '..'), { recursive: true });
      await writeFile(file, `${entry.kind}\n`);
    }
  }
  const transactionEntry = entries.find(entry => entry.kind === 'TRANSACTION_OBSERVATION');
  const transactionBytes = await readFile(resolve(root, transactionEntry.path));
  const evidence = {
    kind: transactionEntry.kind,
    path: transactionEntry.path,
    byte_length: transactionBytes.length,
    sha256: createHash('sha256').update(transactionBytes).digest('hex')
  };
  const observationEntry = entries.find(entry => entry.kind === 'ATTEMPT_OBSERVATION');
  await mkdir(resolve(root, observationEntry.path, '..'), { recursive: true });
  await writeFile(resolve(root, observationEntry.path), JSON.stringify({ assertion_results: [{ evidence_refs: [evidence] }] }));
}
