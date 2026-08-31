import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { semanticComparisonDigest } from './canvas06-e2e-run-report.mjs';
import { createBrowserEnvironment, createReopenObservation, createRuntimeProcess, RELEASE_BROWSER_LAUNCH_ARGS } from './canvas06-e2e-attempt-artifacts.mjs';
import { verifyActiveDynamicEvidenceClosure, verifyActiveExecutionJoin, verifyActiveObservationJoin, verifyE2eReportRoot, verifyMaterializedStorage, verifyReportAggregation } from './verify-canvas06-e2e-report.mjs';

const runSqlite = promisify(execFile);

test('recomputes the frozen 194/388 summary from two deterministic attempt observations', () => {
  const { report, observations } = aggregateFixture();
  verifyReportAggregation(report, observations);
});

test('rejects a Report case whose two verified observations have different semantic digests', () => {
  const { report, observations } = aggregateFixture();
  observations[1] = { ...observations[1], observation: { ...observations[1].observation, semantic_comparison_digest: 'b'.repeat(64) } };
  assert.throws(() => verifyReportAggregation(report, observations), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects an E2E Report root without the frozen Report filename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  await writeFile(join(root, 'other.json'), '{}\n');
  await assert.rejects(
    () => verifyE2eReportRoot({ reportRoot: root, reportPath: join(root, 'other.json') }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('rejects an otherwise named Report root that contains an unreferenced extra entry', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  const root = join(parent, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb');
  await mkdir(root);
  await mkdir(join(root, 'inputs'));
  await mkdir(join(root, 'attempts'));
  const report = join(root, 'dev-canvas-06-e2e-report.json');
  await writeFile(report, '{}\n');
  await writeFile(join(root, 'unexpected.txt'), 'unexpected\n');
  await assert.rejects(
    () => verifyE2eReportRoot({ reportRoot: root, reportPath: report }),
    error => error.code === 'E2E_INPUT_INVALID' && error.message === 'Report root contains an unexpected entry.'
  );
});

test('rejects symbolic or missing artifact roots before Report aggregation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-e2e-report-'));
  await mkdir(join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb'));
  await assert.rejects(
    () => verifyE2eReportRoot({
      reportRoot: join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb'),
      reportPath: join(root, 'dev-canvas-06.e2e-report.aaaaaaaaaaaa.bbbbbbbbbbbb', 'dev-canvas-06-e2e-report.json')
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('accepts indexed API exchange evidence and excludes only inputs/storage support trees', async () => {
  const fixture = await dynamicEvidenceFixture();
  await verifyActiveDynamicEvidenceClosure(fixture);
});

test('rejects wrong API raw SHA, orphan body and unindexed evidence', async t => {
  await t.test('wrong raw SHA', async () => {
    const fixture = await dynamicEvidenceFixture();
    fixture.apiExchangeIndex.exchanges[0].response_ref.sha256 = '0'.repeat(64);
    fixture.apiExchangeIndex.exchange_set_sha256 = digestJcs(fixture.apiExchangeIndex.exchanges);
    await assert.rejects(() => verifyActiveDynamicEvidenceClosure(fixture), inputError);
  });
  await t.test('orphan body', async () => {
    const fixture = await dynamicEvidenceFixture();
    const bytes = Buffer.from('{}\n');
    const path = 'api-exchanges/orphan.response.json';
    await writeFile(join(fixture.attemptRoot, path), bytes);
    fixture.index.refs.push(indexRef(fixture, 'API_RESPONSE_BODY', path, bytes));
    fixture.index.refs.sort(comparePath);
    await assert.rejects(() => verifyActiveDynamicEvidenceClosure(fixture), inputError);
  });
  await t.test('unindexed evidence outside support trees', async () => {
    const fixture = await dynamicEvidenceFixture();
    await writeFile(join(fixture.attemptRoot, 'unindexed.log'), 'extra\n');
    await assert.rejects(() => verifyActiveDynamicEvidenceClosure(fixture), inputError);
  });
});

test('Materialized storage verifier keeps base raw identity while accepting mutated working SQLite', async () => {
  const fixture = await materializedStorageFixture();
  await verifyMaterializedStorage(fixture.input);
  assert.notEqual(digest(await readFile(fixture.basePath)), digest(await readFile(fixture.workingPath)));
});

test('Materialized storage verifier rejects base drift, missing working and swapped paths', async t => {
  await t.test('base drift', async () => {
    const fixture = await materializedStorageFixture();
    await writeFile(fixture.basePath, 'drift');
    await assert.rejects(() => verifyMaterializedStorage(fixture.input), fixtureMismatch);
  });
  await t.test('missing working', async () => {
    const fixture = await materializedStorageFixture();
    await rm(fixture.workingPath);
    await assert.rejects(() => verifyMaterializedStorage(fixture.input), fixtureMismatch);
  });
  await t.test('swapped paths', async () => {
    const fixture = await materializedStorageFixture();
    fixture.input.materialization.storage = {
      ...fixture.input.materialization.storage,
      project_db_ref: { ...fixture.input.materialization.storage.project_db_ref, path: fixture.input.materialization.storage.working_project_db_path },
      working_project_db_path: fixture.input.materialization.storage.project_db_ref.path
    };
    await assert.rejects(() => verifyMaterializedStorage(fixture.input), fixtureMismatch);
  });
  await t.test('working sidecar', async () => {
    const fixture = await materializedStorageFixture();
    await writeFile(`${fixture.workingPath}-wal`, 'residual');
    await assert.rejects(() => verifyMaterializedStorage(fixture.input), fixtureMismatch);
  });
});

test('active execution verifier closes Runtime nonce, Browser mirror and REOPEN identity', () => {
  const fixture = activeExecutionFixture();
  assert.doesNotThrow(() => verifyActiveExecutionJoin(fixture));
});

test('active execution verifier rejects Fault nonce, health and Browser fingerprint drift', () => {
  const fixture = activeExecutionFixture();
  assert.throws(
    () => verifyActiveExecutionJoin({ ...fixture, plan: { ...fixture.plan, fault_kind: 'ASSET_MISSING' } }),
    inputError
  );
  assert.throws(
    () => verifyActiveExecutionJoin({
      ...fixture,
      process: { ...fixture.process, cycles: [{ ...fixture.process.cycles[0], health_samples: fixture.process.cycles[0].health_samples.slice(0, 2) }, fixture.process.cycles[1]] }
    }),
    inputError
  );
  assert.throws(
    () => verifyActiveExecutionJoin({ ...fixture, browser: { ...fixture.browser, environment_fingerprint: '0'.repeat(64) } }),
    inputError
  );
});

test('active observation verifier independently closes Head, Revision document and assertion evidence', async () => {
  const fixture = await activeObservationFixture();
  await verifyActiveObservationJoin(fixture);

  const drifted = structuredClone(fixture.observation);
  drifted.revision_document_after_sha256 = '0'.repeat(64);
  await assert.rejects(() => verifyActiveObservationJoin({ ...fixture, observation: drifted }), inputError);

  const ambiguousWithSubjectResponse = structuredClone(fixture.observation);
  ambiguousWithSubjectResponse.assertion_results.find(item => item.assertion_id === 'TRANSACTION_ZERO').evidence_refs.push({
    kind: 'API_RESPONSE_BODY',
    path: `attempts/${ambiguousWithSubjectResponse.case_id}/1/api-exchanges/subject.response.json`,
    byte_length: 1,
    sha256: '6'.repeat(64)
  });
  await assert.rejects(() => verifyActiveObservationJoin({ ...fixture, observation: ambiguousWithSubjectResponse }), inputError);
});

function aggregateFixture() {
  const case_results = Array.from({ length: 194 }, (_, index) => {
    const expectation = index < 137 ? 'PASS' : 'BLOCKED';
    const status = expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    return {
      case_id: `E2E-CANVAS-001.TEST-${String(index).padStart(3, '0')}`,
      expectation,
      status,
      attempts: [{ status }, { status }],
      failure_codes: []
    };
  });
  const observations = case_results.flatMap(caseResult => [1, 2].map(attempt_ordinal => ({
    case_id: caseResult.case_id,
    attempt_ordinal,
    observation: { status: caseResult.status, semantic_comparison_digest: 'a'.repeat(64) }
  })));
  return {
    report: {
      case_results,
      summary: {
        case_count: 194, family_case_count: 178, family_pass_expectation_count: 130,
        family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388,
        pass_matched_count: 137, blocked_matched_count: 57, failed_count: 0, skipped_count: 0, retry_count: 0
      },
      report_status: 'READY_FOR_ENABLEMENT_EVALUATION',
      failures: []
    },
    observations
  };
}

function activeExecutionFixture(caseId = 'E2E-CANVAS-001.TEST-RUNTIME') {
  const attemptOrdinal = 1;
  const runtimeProcessRef = localRef('RUNTIME_PROCESS', `attempts/${caseId}/1/runtime-process.json`, Buffer.from('runtime'));
  const process = createRuntimeProcess({
    caseId,
    attemptOrdinal,
    cycles: [activeProcessCycle(caseId, 'INITIAL', 41001, 'a'.repeat(64)), activeProcessCycle(caseId, 'REOPEN', 41002, 'b'.repeat(64))]
  });
  const reopen = createReopenObservation({
    caseId,
    attemptOrdinal,
    observation: {
      runtime_process_ref: runtimeProcessRef,
      initial_process_nonce: process.cycles[0].parent_nonce,
      reopen_process_nonce: process.cycles[1].parent_nonce,
      initial_browser_context_id: `browser-context.initial.${'c'.repeat(64)}`,
      reopen_browser_context_id: `browser-context.reopen.${'d'.repeat(64)}`,
      project_id: 'project.e2e', model_id: 'model.e2e', context_id: 'context.e2e', head_revision: 'revision.e2e',
      projection_before_sha256: '1'.repeat(64), projection_reopen_sha256: '1'.repeat(64),
      opl_before_sha256: '2'.repeat(64), opl_reopen_sha256: '2'.repeat(64),
      token_before_sha256: '3'.repeat(64), token_reopen_sha256: '3'.repeat(64),
      trace_before_sha256: '4'.repeat(64), trace_reopen_sha256: '4'.repeat(64)
    }
  });
  const browser = createBrowserEnvironment({
    caseId,
    attemptOrdinal,
    environment: {
      node_version: '22.22.0', playwright_version: '1.57.0', chromium_version: '143.0.7499.4',
      browser_executable_ref: localRef('E2E_BROWSER_EXECUTABLE_MIRROR', 'inputs/runner/toolchain/chromium/a/chromium', Buffer.from('browser')),
      launch_args: [...RELEASE_BROWSER_LAUNCH_ARGS],
      viewport: { viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 },
      zoom_id: 'Z-100', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce',
      web_server_source_ref: localRef('WEB_SERVER_SOURCE', 'inputs/runner/scripts/canvas06-e2e-production-web.mjs', Buffer.from('web')),
      web_dist_ref: localRef('WEB_DIST_TREE', `attempts/${caseId}/1/inputs/build/web-dist`, Buffer.from('dist')),
      web_origin: 'http://127.0.0.1:41003', runtime_origin: 'http://127.0.0.1:41001'
    }
  });
  return {
    plan: { case_id: caseId, attempt_ordinal: attemptOrdinal, fault_kind: 'NONE', nonce: 'f'.repeat(64) },
    process,
    reopen,
    browser,
    runtimeProcessRef
  };
}

function activeProcessCycle(caseId, cycle, pid, nonce) {
  const prefix = `attempts/${caseId}/1`;
  return {
    cycle,
    normalized_command: ['inputs/runner/toolchain/java/a/java', '-jar', `${prefix}/inputs/build/local-runtime.jar`],
    java_ref: localRef('E2E_JAVA_EXECUTABLE_MIRROR', 'inputs/runner/toolchain/java/a/java', Buffer.from('java')),
    runtime_jar_ref: localRef('LOCAL_RUNTIME_JAR', `${prefix}/inputs/build/local-runtime.jar`, Buffer.from('jar')),
    pid,
    parent_nonce: nonce,
    host: '127.0.0.1', port: 41001,
    health_samples: [1, 2, 3].map(ordinal => ({ ordinal, status: 'UP', observed_at: '2026-08-31T00:00:00Z' })),
    started_at: '2026-08-31T00:00:00Z', stopped_at: '2026-08-31T00:01:00Z',
    termination: { kind: 'SIGNAL', exit_code: null, signal: 'SIGTERM', owned_process_terminated: true },
    stdout_ref: localRef('STDOUT_LOG', `${prefix}/stdout/${cycle.toLowerCase()}.log`, Buffer.alloc(0)),
    stderr_ref: localRef('STDERR_LOG', `${prefix}/stderr/${cycle.toLowerCase()}.log`, Buffer.alloc(0)),
    owned_child_count_after_stop: 0
  };
}

async function activeObservationFixture() {
  const caseId = 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED';
  const execution = activeExecutionFixture(caseId);
  const reportRoot = await mkdtemp(join(tmpdir(), 'canvas06-active-observation-'));
  const attemptRoot = join(reportRoot, 'attempts', caseId, '1');
  await mkdir(join(attemptRoot, 'api-exchanges'), { recursive: true });
  const projectionBytes = Buffer.from(`${canonicalizeJcs({ meta: { read_revision: 'revision.e2e' }, data: { constructs: [] } })}\n`);
  const beforePath = 'api-exchanges/exchange-000001.response.json';
  const afterPath = 'api-exchanges/exchange-000002.response.json';
  await writeFile(join(attemptRoot, beforePath), projectionBytes);
  await writeFile(join(attemptRoot, afterPath), projectionBytes);
  const prefix = `attempts/${caseId}/1`;
  const beforeRef = localRef('API_RESPONSE_BODY', `${prefix}/${beforePath}`, projectionBytes);
  const afterRef = localRef('API_RESPONSE_BODY', `${prefix}/${afterPath}`, projectionBytes);
  const transactionRef = localRef('TRANSACTION_OBSERVATION', `${prefix}/transaction-observation.json`, Buffer.from('transaction'));
  const reopenRef = localRef('REOPEN_OBSERVATION', `${prefix}/reopen-observation.json`, Buffer.from('reopen'));
  const apiIndexRef = localRef('API_EXCHANGE_INDEX', `${prefix}/api-exchanges/index.json`, Buffer.from('api-index'));
  const zero = { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false };
  const count = { revision_document_count: 1, revision_parent_count: 1, text_artifact_count: 1, text_trace_count: 1, finding_count: 0, operation_count: 1, receipt_count: 1, draft_head_revision_id: 'revision.e2e', head_sequence: 1 };
  const transaction = {
    before: count, after: { ...count }, expected_transaction: zero, observed_transaction: zero, matches: true
  };
  const evidenceById = {
    TRANSACTION_ZERO: [transactionRef],
    HEAD_UNCHANGED: [transactionRef],
    PROJECTION_UNCHANGED: [beforeRef, afterRef, transactionRef],
    REVISION_OR_BLOCKED_MATCHED: [transactionRef],
    REOPEN_MATCHED: [execution.runtimeProcessRef, reopenRef]
  };
  const assertionIds = Object.keys(evidenceById);
  const observation = {
    case_id: caseId, attempt_ordinal: 1, fixture_sha256: 'a'.repeat(64), input_sha256: 'b'.repeat(64),
    project_id: 'project.e2e', model_id: 'model.e2e', context_id: 'context.e2e',
    base_revision: 'revision.e2e', head_revision: 'revision.e2e', committed_revision: null,
    command_id: null, option_id: null, impact_token_id: null,
    expected_status: 'BLOCKED', observed_status: 'BLOCKED_MATCHED', status: 'BLOCKED_MATCHED',
    top_error_code: null, detail_error_code: null,
    revision_document_before_sha256: '5'.repeat(64), revision_document_after_sha256: '5'.repeat(64), revision_document_reopen_sha256: '5'.repeat(64),
    projection_before_sha256: '1'.repeat(64), projection_after_sha256: '1'.repeat(64), projection_reopen_sha256: '1'.repeat(64),
    opl_before_sha256: '2'.repeat(64), opl_after_sha256: '2'.repeat(64), opl_reopen_sha256: '2'.repeat(64),
    token_before_sha256: '3'.repeat(64), token_after_sha256: '3'.repeat(64), token_reopen_sha256: '3'.repeat(64),
    trace_before_sha256: '4'.repeat(64), trace_after_sha256: '4'.repeat(64), trace_reopen_sha256: '4'.repeat(64),
    transaction: zero,
    assertion_results: assertionIds.map(assertion_id => ({ assertion_id, status: 'PASS', evidence_refs: evidenceById[assertion_id] }))
  };
  observation.semantic_comparison_digest = semanticComparisonDigest(observation);
  const materialization = { identity: { project_id: 'project.e2e', model_id: 'model.e2e', context_id: 'context.e2e', base_revision: 'revision.base', head_revision: 'revision.base' } };
  const artifacts = new Map([
    ['FAULT_PLAN', { artifact: execution.plan }],
    ['FIXTURE_MATERIALIZATION', { artifact: materialization }],
    ['ATTEMPT_OBSERVATION', { artifact: observation }],
    ['TRANSACTION_OBSERVATION', { artifact: transaction, ref: transactionRef }],
    ['REOPEN_OBSERVATION', { artifact: execution.reopen, ref: reopenRef }],
    ['RUNTIME_PROCESS', { artifact: execution.process, ref: execution.runtimeProcessRef }],
    ['BROWSER_ENVIRONMENT', { artifact: execution.browser }],
    ['API_EXCHANGE_INDEX', { artifact: { exchanges: [] }, ref: apiIndexRef }],
    ['ARTIFACT_INDEX', { artifact: { refs: [beforeRef, afterRef, transactionRef, reopenRef, execution.runtimeProcessRef, apiIndexRef] } }]
  ]);
  return {
    artifacts, materialization, observation, transaction, reopen: execution.reopen, process: execution.process, browser: execution.browser,
    manifestCase: { case_id: caseId, expectation: 'BLOCKED', expected_transaction: zero, assertion_ids: assertionIds },
    expectedSubject: null, reportRoot, attemptRoot
  };
}

async function dynamicEvidenceFixture() {
  const reportRoot = await mkdtemp(join(tmpdir(), 'canvas06-e2e-dynamic-evidence-'));
  const attemptRoot = join(reportRoot, 'attempts', 'G-OPL-PROC-001.CONSUMPTION-OBJECT-PASS', '1');
  await mkdir(join(attemptRoot, 'api-exchanges'), { recursive: true });
  await mkdir(join(attemptRoot, 'inputs'), { recursive: true });
  await mkdir(join(attemptRoot, 'storage'), { recursive: true });
  await writeFile(join(attemptRoot, 'inputs', 'runtime.jar'), 'runtime\n');
  await writeFile(join(attemptRoot, 'storage', 'project.db'), 'sqlite\n');

  const requestBytes = Buffer.from('{"command":"run"}\n');
  const responseBytes = Buffer.from('{"status":"ok"}\n');
  const requestPath = 'api-exchanges/exchange-000001.request.json';
  const responsePath = 'api-exchanges/exchange-000001.response.json';
  await writeFile(join(attemptRoot, requestPath), requestBytes);
  await writeFile(join(attemptRoot, responsePath), responseBytes);
  const requestRef = localRef('API_REQUEST_BODY', requestPath, requestBytes);
  const responseRef = localRef('API_RESPONSE_BODY', responsePath, responseBytes);
  const rawExchange = {
    sequence: 1,
    operation_id: 'API-EDT-002',
    method: 'POST',
    normalized_url: '/api/v1/projects/project/models/model/commands',
    request_ref: requestRef,
    response_ref: responseRef,
    status: 200,
    revision: 'revision-1'
  };
  const exchangePath = 'api-exchanges/exchange-000001.json';
  const exchangeBytes = Buffer.from(`${canonicalizeJcs(rawExchange)}\n`, 'utf8');
  await writeFile(join(attemptRoot, exchangePath), exchangeBytes);
  const exchange = { ...rawExchange, exchange_ref: localRef('API_EXCHANGE', exchangePath, exchangeBytes) };
  const fixture = {
    reportRoot,
    attemptRoot,
    index: { refs: [] },
    apiExchangeIndex: { exchanges: [exchange], exchange_set_sha256: digestJcs([exchange]) }
  };
  fixture.index.refs = [
    indexRef(fixture, 'API_EXCHANGE', exchangePath, exchangeBytes),
    indexRef(fixture, 'API_REQUEST_BODY', requestPath, requestBytes),
    indexRef(fixture, 'API_RESPONSE_BODY', responsePath, responseBytes)
  ].sort(comparePath);
  return fixture;
}

async function materializedStorageFixture() {
  const attemptRoot = await mkdtemp(join(tmpdir(), 'canvas06-materialized-storage-'));
  const projectId = 'project.e2e.storage';
  const modelId = 'model.e2e.storage';
  const baseRevision = 'revision.e2e.base';
  const finalRevision = 'revision.e2e.final';
  const timestamp = '2026-07-01T00:00:00Z';
  const basePath = join(attemptRoot, 'storage', 'materialized-base', 'projects', projectId, 'project.db');
  const workingPath = join(attemptRoot, 'storage', 'projects', projectId, 'project.db');
  await mkdir(join(basePath, '..'), { recursive: true });
  await mkdir(join(workingPath, '..'), { recursive: true });
  const schema = `
    CREATE TABLE project_metadata(project_id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE model_catalog(model_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE revision_document(revision_id TEXT PRIMARY KEY,model_id TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE model_head(model_id TEXT PRIMARY KEY,draft_head_revision_id TEXT NOT NULL,head_sequence INTEGER NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO project_metadata VALUES('${projectId}','${timestamp}','${timestamp}');
    INSERT INTO model_catalog VALUES('${modelId}','${projectId}','${timestamp}','${timestamp}');
    INSERT INTO revision_document VALUES('${baseRevision}','${modelId}','${timestamp}');
    INSERT INTO model_head VALUES('${modelId}','${baseRevision}',1,'${timestamp}');
  `;
  await runSqlite('sqlite3', [basePath, schema]);
  await cp(basePath, workingPath);
  const baseBytes = await readFile(basePath);
  await runSqlite('sqlite3', [workingPath, `INSERT INTO revision_document VALUES('${finalRevision}','${modelId}','${timestamp}');UPDATE model_head SET draft_head_revision_id='${finalRevision}',head_sequence=2;`]);
  const reference = {
    kind: 'PROJECT_DB',
    path: `storage/materialized-base/projects/${projectId}/project.db`,
    byte_length: baseBytes.length,
    sha256: digest(baseBytes)
  };
  return {
    attemptRoot,
    basePath,
    workingPath,
    input: {
      attemptRoot,
      sourceDateEpoch: Date.parse(timestamp) / 1000,
      finalHeadRevision: finalRevision,
      materialization: {
        identity: { project_id: projectId, model_id: modelId, context_id: 'context.e2e.storage', base_revision: baseRevision, head_revision: baseRevision },
        storage: {
          storage_root: 'storage',
          materialized_base_root: 'storage/materialized-base',
          project_db_ref: reference,
          working_project_db_path: `storage/projects/${projectId}/project.db`,
          working_clone_byte_length: reference.byte_length,
          working_clone_sha256: reference.sha256,
          storage_schema_version: '1.0',
          sqlite_quick_check: 'ok',
          foreign_key_check_count: 0,
          sidecar_absent: true
        }
      }
    }
  };
}

function localRef(kind, path, bytes) {
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

function indexRef(fixture, kind, path, bytes) {
  const prefix = fixture.attemptRoot.slice(fixture.reportRoot.length + 1);
  return { kind, path: `${prefix}/${path}`, media_type: 'application/json', byte_length: bytes.length,
    sha256: digest(bytes), capture_phase: 'ACTION', required: true };
}

function comparePath(left, right) {
  return Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function digestJcs(value) {
  return digest(Buffer.from(canonicalizeJcs(value), 'utf8'));
}

function inputError(error) {
  return error.code === 'E2E_INPUT_INVALID' && error.exitCode === 2;
}

function fixtureMismatch(error) {
  return error.code === 'E2E_FIXTURE_MISMATCH' && error.exitCode === 3;
}
