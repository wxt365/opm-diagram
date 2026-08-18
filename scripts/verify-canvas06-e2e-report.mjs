import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eRunInputError, parseVerifyOptions, resolveVerifierReport, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { semanticComparisonDigest } from './canvas06-e2e-run-report.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { assertDirectory as assertSupportDirectory, resolveInside } from './canvas06-e2e-manifest-v01-support.mjs';

const REPORT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-report.schema.json', import.meta.url), 'utf8'));
const ARTIFACT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateReport = ajv.compile(REPORT_SCHEMA);
const validateArtifact = ajv.compile(ARTIFACT_SCHEMA);

const ATTEMPT_FILES = Object.freeze([
  ['fault-plan.json', 'OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001', 'FAULT_PLAN'],
  ['fixture-materialization.json', 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001', 'FIXTURE_MATERIALIZATION'],
  ['attempt-observation.json', 'OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001', 'ATTEMPT_OBSERVATION'],
  ['runtime-process.json', 'OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001', 'RUNTIME_PROCESS'],
  ['browser-environment.json', 'OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-001', 'BROWSER_ENVIRONMENT'],
  ['network-observation.json', 'OPM-DEV-CANVAS-06-E2E-NETWORK-OBSERVATION-001', 'NETWORK_OBSERVATION'],
  ['console-errors.json', 'OPM-DEV-CANVAS-06-E2E-CONSOLE-ERRORS-001', 'CONSOLE_ERRORS'],
  ['transaction-observation.json', 'OPM-DEV-CANVAS-06-E2E-TRANSACTION-OBSERVATION-001', 'TRANSACTION_OBSERVATION'],
  ['reopen-observation.json', 'OPM-DEV-CANVAS-06-E2E-REOPEN-OBSERVATION-001', 'REOPEN_OBSERVATION'],
  ['api-exchanges/index.json', 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001', 'API_EXCHANGE_INDEX'],
  ['artifact-index.json', 'OPM-DEV-CANVAS-06-E2E-ARTIFACT-INDEX-001', 'ARTIFACT_INDEX']
]);

export async function main(argv = process.argv.slice(2)) {
  const options = parseVerifyOptions(argv);
  const paths = resolveVerifierReport({ evidenceRoot: options['evidence-root'], report: options.report });
  const report = await verifyE2eReportRoot({ reportRoot: paths.reportRoot, reportPath: paths.reportPath });
  await verifyExternalTrust({ options, report, reportRoot: paths.reportRoot });
  if (options['require-ready'] && report.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') {
    fail('E2E_REPORT_NOT_READY', 'Report is not READY_FOR_ENABLEMENT_EVALUATION.', 3);
  }
  return report;
}

/**
 * 只读验证已提交或 staging 中的 E2E Report root。调用方负责决定 staging 是否允许。
 */
export async function verifyE2eReportRoot({ reportRoot, reportPath }) {
  const root = resolve(reportRoot);
  await assertDirectory(root);
  const before = await treeDigest(root);
  const path = resolve(reportPath);
  if (!inside(root, path) || basename(path) !== 'dev-canvas-06-e2e-report.json') {
    fail('E2E_INPUT_INVALID', 'Report path must be the frozen filename inside report root.');
  }
  await assertReportRootLayout(root, path);
  const report = await readJsonFile(path, 'E2E_INPUT_INVALID');
  if (!validateReport(report)) fail('E2E_INPUT_INVALID', 'E2E Report Schema validation failed.');
  if (basename(root) !== report.report_id) fail('E2E_INPUT_INVALID', 'Report root basename differs from report_id.');
  await Promise.all([
    verifyReportRawRef(root, report.manifest_ref),
    verifyReportRawRef(root, report.intake_report_ref),
    verifyReportRawRef(root, report.handoff_ref)
  ]);
  await assertAttemptTreeLayout(root, report.case_results);

  const verifiedAttempts = [];
  for (const caseResult of report.case_results) {
    for (const attempt of caseResult.attempts) {
      verifiedAttempts.push(await verifyAttempt({ root, caseResult, attempt }));
    }
  }
  verifyReportAggregation(report, verifiedAttempts);

  const after = await treeDigest(root);
  if (before !== after) fail('E2E_INPUT_INVALID', 'Verifier observed a Report root mutation.');
  return Object.freeze(report);
}

async function assertReportRootLayout(root, reportPath) {
  const expected = new Map([
    [basename(reportPath), 'file'],
    ['inputs', 'directory'],
    ['attempts', 'directory']
  ]);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length !== expected.size) fail('E2E_INPUT_INVALID', 'Report root contains an unexpected entry.');
  for (const entry of entries) {
    const type = expected.get(entry.name);
    if (!type) fail('E2E_INPUT_INVALID', 'Report root contains an unexpected entry.');
    const details = await lstat(resolve(root, entry.name));
    if (details.isSymbolicLink() || type === 'file' && (!details.isFile() || details.nlink !== 1)
        || type === 'directory' && !details.isDirectory()) {
      fail('E2E_INPUT_INVALID', 'Report root contains an unsafe required entry.');
    }
  }
  for (const name of expected.keys()) {
    try { await lstat(resolve(root, name)); } catch { fail('E2E_INPUT_INVALID', 'Report root is incomplete.'); }
  }
}

async function assertAttemptTreeLayout(root, caseResults) {
  const attemptsRoot = resolve(root, 'attempts');
  const expectedCaseDirectories = new Set(caseResults.map(item => encodeCaseId(item.case_id)));
  const caseDirectories = await readdir(attemptsRoot, { withFileTypes: true });
  if (caseDirectories.length !== expectedCaseDirectories.size) fail('E2E_INPUT_INVALID', 'Attempt root contains an unexpected case directory.');
  for (const entry of caseDirectories) {
    const path = resolve(attemptsRoot, entry.name);
    const details = await lstat(path);
    if (!expectedCaseDirectories.has(entry.name) || details.isSymbolicLink() || !details.isDirectory()) {
      fail('E2E_INPUT_INVALID', 'Attempt root contains an unsafe case directory.');
    }
    const ordinals = await readdir(path, { withFileTypes: true });
    if (ordinals.length !== 2) fail('E2E_INPUT_INVALID', 'Case attempt directory count is invalid.');
    for (const ordinal of ordinals) {
      const attemptPath = resolve(path, ordinal.name);
      const attemptDetails = await lstat(attemptPath);
      if (!['1', '2'].includes(ordinal.name) || attemptDetails.isSymbolicLink() || !attemptDetails.isDirectory()) {
        fail('E2E_INPUT_INVALID', 'Case attempt directory is invalid.');
      }
    }
  }
}

async function verifyExternalTrust({ options, report, reportRoot }) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    await sameExternalRawRef(reportRoot, report.intake_report_ref, chain.bundle.references.intake_report_ref);
    await sameExternalRawRef(reportRoot, report.handoff_ref, chain.bundle.references.handoff_ref);
    return;
  }
  const handoffRoot = resolve(options['handoff-root']);
  await assertSupportDirectory(handoffRoot, 'E2E_INPUT_INVALID');
  const intake = await readJsonRef(handoffRoot, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadReadyTrustChain({ root: handoffRoot, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  await sameExternalRawRef(reportRoot, report.intake_report_ref, chain.intake.ref);
  await sameExternalRawRef(reportRoot, report.handoff_ref, chain.handoff.ref);
}

async function sameExternalRawRef(reportRoot, reportRef, externalRef) {
  if (!sameRawIdentity(reportRef, externalRef)) fail('E2E_INPUT_INVALID', 'Report raw input differs from the external trust chain.');
  await verifyReportRawRef(reportRoot, reportRef);
}

async function verifyReportRawRef(root, reference) {
  if (!reference || !safeRelativePath(reference.path)) fail('E2E_INPUT_INVALID', 'Report file reference is invalid.');
  const path = resolve(root, reference.path);
  if (!inside(root, path)) fail('E2E_INPUT_INVALID', 'Report file reference escapes Report root.');
  const actual = await rawRef(root, path, reference.kind);
  if (!sameRawIdentity(actual, reference)) fail('E2E_INPUT_INVALID', 'Report file reference differs from raw bytes.');
}

async function verifyAttempt({ root, caseResult, attempt }) {
  const attemptRoot = resolve(root, 'attempts', encodeCaseId(caseResult.case_id), String(attempt.attempt_ordinal));
  if (!inside(root, attemptRoot)) fail('E2E_INPUT_INVALID', 'Attempt root escapes Report root.');
  await assertDirectory(attemptRoot);
  const artifacts = new Map();
  for (const [filename, schemaId, kind] of ATTEMPT_FILES) {
    const path = resolve(attemptRoot, filename);
    const artifact = await readJsonFile(path, 'E2E_INPUT_INVALID');
    if (!validateArtifact(artifact) || artifact.schema_id !== schemaId || artifact.schema_version !== '0.1') {
      fail('E2E_INPUT_INVALID', `Artifact identity is invalid: ${filename}.`);
    }
    if (artifact.case_id !== caseResult.case_id || artifact.attempt_ordinal !== attempt.attempt_ordinal) {
      fail('E2E_INPUT_INVALID', `Artifact case/attempt identity is invalid: ${filename}.`);
    }
    const payload = { ...artifact };
    delete payload.artifact_payload_sha256;
    if (artifact.artifact_payload_sha256 !== sha256Jcs(payload)) {
      fail('E2E_INPUT_INVALID', `Artifact payload digest is invalid: ${filename}.`);
    }
    artifacts.set(kind, { artifact, path, ref: await rawRef(root, path, kind) });
  }

  verifyFaultPlan(caseResult.case_id, artifacts.get('FAULT_PLAN').artifact);
  verifyCrossArtifactJoin(artifacts);
  await verifyIndex({ root, attemptRoot, artifacts });
  verifyReportProjection({ caseResult, attempt, artifacts });
  return Object.freeze({ case_id: caseResult.case_id, attempt_ordinal: attempt.attempt_ordinal, observation: artifacts.get('ATTEMPT_OBSERVATION').artifact });
}

export function verifyReportAggregation(report, verifiedAttempts) {
  const byCase = new Map();
  for (const item of verifiedAttempts) byCase.set(`${item.case_id}/${item.attempt_ordinal}`, item.observation);
  let pass = 0;
  let blocked = 0;
  let failed = 0;
  for (const caseResult of report.case_results) {
    const observations = [byCase.get(`${caseResult.case_id}/1`), byCase.get(`${caseResult.case_id}/2`)];
    if (observations.some(value => value === undefined)) fail('E2E_INPUT_INVALID', 'Report attempt matrix is incomplete.');
    const expected = caseResult.expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    const matched = observations.every(value => value.status === expected)
      && observations[0].semantic_comparison_digest === observations[1].semantic_comparison_digest;
    const calculated = matched ? expected : 'FAILED';
    if (caseResult.status !== calculated || caseResult.attempts.some((value, index) => value.status !== observations[index].status)
        || matched && caseResult.failure_codes.length !== 0 || !matched && caseResult.failure_codes.length === 0) {
      fail('E2E_INPUT_INVALID', 'Report case status does not match verified attempt evidence.');
    }
    if (calculated === 'PASS_MATCHED') pass += 1;
    else if (calculated === 'BLOCKED_MATCHED') blocked += 1;
    else failed += 1;
  }
  const expectedSummary = { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: pass, blocked_matched_count: blocked, failed_count: failed, skipped_count: 0, retry_count: 0 };
  if (!isDeepStrictEqual(report.summary, expectedSummary)) fail('E2E_INPUT_INVALID', 'Report summary does not match verified case evidence.');
  const ready = failed === 0 && pass === 146 && blocked === 48;
  if (report.report_status !== (ready ? 'READY_FOR_ENABLEMENT_EVALUATION' : 'BLOCKED') || ready && report.failures.length !== 0 || !ready && report.failures.length === 0) {
    fail('E2E_INPUT_INVALID', 'Report status does not match verified aggregate evidence.');
  }
}

function verifyFaultPlan(caseId, plan) {
  const expected = caseId === 'E2E-CANVAS-007.ASSET_MISSING'
    ? ['ASSET_MISSING', 'SYMBOL_CATALOG_ASSET', 1]
    : caseId === 'E2E-CANVAS-007.PERSISTENCE_FAILED'
      ? ['PERSISTENCE_FAILED', 'SQLITE_BEFORE_REVISION_INSERT', 1]
      : caseId === 'E2E-CANVAS-007.READONLY'
        ? ['READONLY', 'PROJECT_STORAGE_READ_ONLY', 1]
        : ['NONE', 'NONE', 0];
  if (plan.fault_kind !== expected[0] || plan.target !== expected[1] || plan.trigger_count !== expected[2]
      || plan.plan_sha256 !== sha256Jcs({ case_id: plan.case_id, attempt_ordinal: plan.attempt_ordinal, fault_kind: plan.fault_kind, target: plan.target, trigger_count: plan.trigger_count, nonce: plan.nonce })) {
    fail('E2E_INPUT_INVALID', 'Fault Plan does not match the frozen case mapping.');
  }
}

function verifyCrossArtifactJoin(artifacts) {
  const materialization = artifacts.get('FIXTURE_MATERIALIZATION').artifact;
  const observation = artifacts.get('ATTEMPT_OBSERVATION').artifact;
  const transaction = artifacts.get('TRANSACTION_OBSERVATION').artifact;
  const reopen = artifacts.get('REOPEN_OBSERVATION').artifact;
  const process = artifacts.get('RUNTIME_PROCESS').artifact;
  const browser = artifacts.get('BROWSER_ENVIRONMENT').artifact;

  if (!sameIdentity(materialization.identity, observation) || !sameIdentity(materialization.identity, transaction)
      || !sameIdentity(materialization.identity, reopen) || !isDeepStrictEqual(observation.transaction, transaction.observed_transaction)
      || isDeepStrictEqual(transaction.expected_transaction, transaction.observed_transaction) !== transaction.matches
      || observation.reopen_matches !== reopen.reopen_matches
      || reopen.runtime_process_ref.sha256 !== artifacts.get('RUNTIME_PROCESS').ref.sha256
      || !Array.isArray(process.cycles) || process.cycles.length !== 2
      || !browser.environment_fingerprint) {
    fail('E2E_INPUT_INVALID', 'Attempt artifact joins are inconsistent.');
  }
  const expectedObservationDigest = semanticComparisonDigest(observation);
  if (observation.semantic_comparison_digest !== expectedObservationDigest) {
    fail('E2E_INPUT_INVALID', 'Attempt semantic comparison digest is invalid.');
  }
}

async function verifyIndex({ root, attemptRoot, artifacts }) {
  const index = artifacts.get('ARTIFACT_INDEX').artifact;
  const expectedKinds = ATTEMPT_FILES.slice(0, -1).map(([, , kind]) => kind);
  const indexKinds = index.refs.map(item => item.kind);
  if (index.refs.length < 10 || new Set(indexKinds).size !== indexKinds.length || !expectedKinds.every(kind => indexKinds.includes(kind))
      || index.tree_sha256 !== sha256Jcs(index.refs)) {
    fail('E2E_INPUT_INVALID', 'Artifact Index does not contain the required exact core set.');
  }
  for (const entry of index.refs) {
    if (!safeRelativePath(entry.path) || !entry.path.startsWith(`attempts/${encodeCaseId(index.case_id)}/${index.attempt_ordinal}/`)) {
      fail('E2E_INPUT_INVALID', 'Artifact Index ref path escapes the current attempt.');
    }
    const absolute = resolve(root, entry.path);
    if (!inside(attemptRoot, absolute)) fail('E2E_INPUT_INVALID', 'Artifact Index ref is outside the current attempt.');
    const actual = await rawRef(root, absolute, entry.kind);
    if (!sameRawIdentity(actual, entry)) fail('E2E_INPUT_INVALID', 'Artifact Index raw bytes differ from its ref.');
  }
  for (const [filename, , kind] of ATTEMPT_FILES.slice(0, -1)) {
    const item = index.refs.find(entry => entry.kind === kind);
    const expected = artifacts.get(kind).ref;
    if (!item || item.path !== expected.path || item.byte_length !== expected.byte_length || item.sha256 !== expected.sha256
        || filename === 'artifact-index.json') fail('E2E_INPUT_INVALID', 'Artifact Index raw reference is invalid.');
  }
}

function verifyReportProjection({ caseResult, attempt, artifacts }) {
  const observation = artifacts.get('ATTEMPT_OBSERVATION').artifact;
  const reopen = artifacts.get('REOPEN_OBSERVATION').artifact;
  const index = artifacts.get('ARTIFACT_INDEX');
  const expectedRefs = [index.ref, ...index.artifact.refs.map(item => ({ kind: item.kind, path: item.path, byte_length: item.byte_length, sha256: item.sha256 }))]
    .sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  const projected = {
    attempt_ordinal: observation.attempt_ordinal,
    status: observation.status,
    fixture_sha256: observation.fixture_sha256,
    input_sha256: observation.input_sha256,
    project_id: observation.project_id,
    model_id: observation.model_id,
    base_revision: observation.base_revision,
    head_revision: observation.head_revision,
    observed_status: observation.observed_status,
    transaction: observation.transaction,
    reopen_matches: reopen.reopen_matches,
    artifact_refs: expectedRefs
  };
  for (const [key, value] of Object.entries(projected)) if (!isDeepStrictEqual(attempt[key], value)) {
    fail('E2E_INPUT_INVALID', `Report attempt projection differs at ${key}.`);
  }
  if (caseResult.case_id !== observation.case_id) fail('E2E_INPUT_INVALID', 'Report case projection is invalid.');
}

function sameIdentity(identity, value) {
  return identity.project_id === value.project_id && identity.model_id === value.model_id
    && identity.context_id === value.context_id && identity.base_revision === value.base_revision
    && identity.head_revision === value.head_revision;
}

async function rawRef(root, path, kind) {
  const bytes = await readFile(path);
  return Object.freeze({ kind, path: relative(root, path).split(sep).join('/'), byte_length: bytes.length, sha256: sha256(bytes) });
}

async function readJsonFile(path, code) {
  await assertRegularFile(path);
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail(code, `Expected valid UTF-8 JSON: ${path}.`); }
}

async function assertDirectory(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Expected a Report directory.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Expected a non-symlink Report directory.');
}

async function assertRegularFile(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Expected a regular artifact file.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail('E2E_INPUT_INVALID', 'Artifact must be a single-link regular file.');
}

async function treeDigest(root) {
  const entries = [];
  await visit(root, '');
  return sha256Jcs(entries.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'))));

  async function visit(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = resolve(directory, entry.name);
      const details = await lstat(absolute);
      if (details.isSymbolicLink() || !details.isDirectory() && !details.isFile() || details.isFile() && details.nlink !== 1) {
        fail('E2E_INPUT_INVALID', 'Report root contains an unsafe filesystem entry.');
      }
      if (details.isDirectory()) await visit(absolute, path);
      else entries.push({ path, byte_length: details.size, sha256: sha256(await readFile(absolute)) });
    }
  }
}

function encodeCaseId(value) {
  return Array.from(Buffer.from(value, 'utf8')).map(byte => /[A-Za-z0-9._-]/.test(String.fromCharCode(byte)) ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
}

function sha256Jcs(value) { return sha256(Buffer.from(canonicalizeJcs(value), 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sameRawIdentity(left, right) { return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function inside(root, child) { const relation = relative(resolve(root), resolve(child)); return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation); }
function fail(code, message, exitCode = 2) { throw new E2eRunInputError(code, message, exitCode); }

if (resolve(process.argv[1] ?? '') === new URL(import.meta.url).pathname) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.code ?? 'E2E_UNEXPECTED_RUNTIME_ERROR'}\n`);
    process.exitCode = error.exitCode ?? 4;
  }
}
