import { createHash } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { verifyGoldenEnvironmentV02 } from './verify-canvas06-golden-environment-v02.mjs';

const ROOT = resolve('.');
const APPROVAL_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json';
const AUTHORING_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json';
const PLAN_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json';
const REQUIRED = ['candidate-root', 'applicant-id', 'applicant-display-name', 'approver-id', 'approver-display-name', 'reason-code', 'reason-text', 'requested-at', 'approved-at', 'external-refs', 'out'];
const OPTIONAL = ['predecessor-authoring-report'];

export class GoldenApprovalError extends Error {
  constructor(code, exitCode, message) {
    super(message);
    this.name = 'GoldenApprovalError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseApproveOptions(values) {
  if (!Array.isArray(values) || values.length % 2 !== 0) input('Approval options must be complete key/value pairs.');
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (typeof key !== 'string' || !key.startsWith('--') || typeof value !== 'string') input('Approval option is invalid.');
    const name = key.slice(2);
    if (![...REQUIRED, ...OPTIONAL].includes(name) || options.has(name)) input('Approval option is forbidden or duplicated.');
    options.set(name, value);
  }
  for (const key of REQUIRED) if (!options.has(key)) input(`Approval option --${key} is required.`);
  return Object.freeze({
    candidateRoot: absolute(options.get('candidate-root'), 'Candidate root'),
    applicant: person(options.get('applicant-id'), options.get('applicant-display-name'), 'Applicant'),
    approver: person(options.get('approver-id'), options.get('approver-display-name'), 'Approver'),
    reasonCode: options.get('reason-code'), reasonText: nonempty(options.get('reason-text'), 'Reason text'),
    requestedAt: utc(options.get('requested-at'), 'Requested time'), approvedAt: utc(options.get('approved-at'), 'Approved time'),
    externalRefsPath: absolute(options.get('external-refs'), 'External refs'), outPath: absolute(options.get('out'), 'Approval output'),
    predecessorPath: options.has('predecessor-authoring-report') ? absolute(options.get('predecessor-authoring-report'), 'Predecessor Authoring Report') : null
  });
}

export async function approveCandidate(options) {
  const candidate = await loadApprovalCandidate(options.candidateRoot);
  const { changeRoot, report: candidateReport } = candidate;
  if (options.outPath !== resolve(changeRoot, 'approval-record.json')) input('Candidate and Approval output must use the same change root layout.');
  await assertFresh(options.outPath, 'Approval output');
  if (new Date(options.requestedAt).getTime() > new Date(options.approvedAt).getTime()) blocked('Approval time order is invalid.');
  if (options.applicant.id === options.approver.id) blocked('Applicant and Approver must differ.');
  const [contracts, externalRefs] = await Promise.all([loadContracts(), readJson(options.externalRefsPath, 'External refs')]);
  if (!Array.isArray(externalRefs) || !externalRefs.every(validExternalRef)) input('External refs Schema is invalid.');
  const predecessor = await verifyPredecessor(options.predecessorPath, candidateReport);
  const approval = buildApprovalRecord({ candidate, applicant: options.applicant, approver: options.approver, reasonCode: options.reasonCode, reasonText: options.reasonText, requestedAt: options.requestedAt, approvedAt: options.approvedAt, externalRefs, predecessor });
  if (!contracts.approval(approval)) blocked('Approval Record Schema is invalid.');
  verifyApprovalRecord(approval, { candidate, predecessor });
  await atomicWriteFresh(options.outPath, `${canonicalizeJcs(approval)}\n`);
  return Object.freeze({ value: Object.freeze(approval), path: options.outPath });
}

export async function loadApprovalCandidate(candidateRoot) {
  const contracts = await loadContracts();
  await assertOrdinaryDirectory(candidateRoot, 'Candidate root');
  const changeRoot = dirname(candidateRoot);
  if (candidateRoot !== resolve(changeRoot, 'candidate')) input('Candidate root must use the change root candidate layout.');
  const [report, environment, plan] = await Promise.all([
    readJson(resolve(candidateRoot, 'candidate-authoring-report.json'), 'Candidate Authoring Report'),
    readJson(resolve(candidateRoot, 'golden-environment.json'), 'Golden Environment'),
    readJson(resolve(changeRoot, 'capture-plan.json'), 'Capture Plan')
  ]);
  if (!contracts.authoring(report) || !contracts.plan(plan)) input('Candidate approval input Schema is invalid.');
  verifyGoldenEnvironmentV02(environment, { sourceDateEpoch: plan.source_date_epoch });
  return verifyCandidateEvidence({ changeRoot, candidateRoot, plan, report, environment });
}

export function buildApprovalRecord({ candidate, applicant, approver, reasonCode, reasonText, requestedAt, approvedAt, externalRefs, predecessor }) {
  const { report, candidateReportRef, environmentRef, environment } = candidate;
  const pngRefs = report.approved_assets.png_refs.map(value => ({ capture_id: value.logical_id, path: value.path, byte_length: value.byte_length, sha256: value.sha256 }));
  const blankRefs = report.approved_assets.blank_baseline_refs.map(value => ({ baseline_id: value.logical_id, path: value.path, byte_length: value.byte_length, sha256: value.sha256 }));
  const fontRefs = environment.font_refs.map(({ logical_role, postscript_name, font_version, path, byte_length, sha256 }) => ({ logical_role, postscript_name, font_version, path, byte_length, sha256 }));
  const candidateContent = { fixture_materialization_report_refs: report.fixture_materialization_report_refs, fixture_database_refs: report.fixture_database_refs, png_refs: pngRefs, blank_baseline_refs: blankRefs, font_refs: fontRefs };
  const approval = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001', schema_version: '0.2',
    record_id: `dev-canvas-06.golden-approval.${report.change_id}`, record_version: '0.2.0', change_id: report.change_id,
    mode: predecessor ? 'SUPERSEDE' : 'INITIAL', golden_set_version: report.golden_set_version,
    requested_at: requestedAt, approved_at: approvedAt, source_date_epoch: report.source_date_epoch,
    applicant, approver, reason_code: reasonCode, reason_text: reasonText, external_refs: externalRefs,
    capture_plan_ref: report.capture_plan_ref, capture_set_sha256: report.capture_set_sha256 ?? candidate.plan.capture_set_sha256,
    environment_fingerprint: environment.environment_fingerprint, source_build_digest: report.source_build_digest,
    runtime_jar_ref: report.runtime_jar_ref, web_dist_tree_sha256: report.web_dist_tree_sha256,
    candidate_authoring_report_ref: candidateReportRef, candidate_authoring_report_payload_sha256: report.report_payload_sha256,
    candidate_attempt_set_sha256: report.candidate_attempt_set_sha256, authored_golden_environment_ref: environmentRef,
    fixture_materialization_report_refs: report.fixture_materialization_report_refs, fixture_materialization_set_sha256: report.fixture_materialization_set_sha256,
    fixture_database_refs: report.fixture_database_refs, fixture_database_set_sha256: report.fixture_database_set_sha256,
    png_refs: pngRefs, blank_baseline_refs: blankRefs, font_refs: fontRefs,
    candidate_content_sha256: digest(candidateContent), old_golden_set_version: predecessor ? predecessor.goldenSetVersion : null,
    old_golden_set_sha256: predecessor ? predecessor.goldenSetSha256 : null, predecessor_authoring_report_ref: predecessor?.ref ?? null,
    new_golden_set_sha256: report.new_golden_set_sha256, approved_output_path: `versions/${report.golden_set_version}`,
    approval_status: 'APPROVED', approval_payload_sha256: ''
  };
  approval.approval_payload_sha256 = digest(without(approval, 'approval_payload_sha256'));
  return approval;
}

export function verifyApprovalRecord(approval, { candidate, predecessor }) {
  const { report, candidateReportRef, environmentRef, environment } = candidate;
  const expectedContent = digest({ fixture_materialization_report_refs: approval.fixture_materialization_report_refs, fixture_database_refs: approval.fixture_database_refs, png_refs: approval.png_refs, blank_baseline_refs: approval.blank_baseline_refs, font_refs: approval.font_refs });
  if (approval.approval_status !== 'APPROVED' || approval.record_id !== `dev-canvas-06.golden-approval.${report.change_id}`
      || approval.change_id !== report.change_id || !sameRaw(approval.candidate_authoring_report_ref, candidateReportRef)
      || !sameRaw(approval.authored_golden_environment_ref, environmentRef) || approval.environment_fingerprint !== environment.environment_fingerprint
      || approval.candidate_authoring_report_payload_sha256 !== report.report_payload_sha256 || approval.candidate_attempt_set_sha256 !== report.candidate_attempt_set_sha256
      || approval.new_golden_set_sha256 !== report.new_golden_set_sha256 || approval.candidate_content_sha256 !== expectedContent
      || approval.approval_payload_sha256 !== digest(without(approval, 'approval_payload_sha256'))) blocked('Approval Record digest closure differs.');
  if (predecessor) {
    if (approval.mode !== 'SUPERSEDE' || approval.old_golden_set_version !== predecessor.goldenSetVersion || approval.old_golden_set_sha256 !== predecessor.goldenSetSha256 || !sameRaw(approval.predecessor_authoring_report_ref, predecessor.ref)) blocked('Approval predecessor differs.');
  } else if (approval.mode !== 'INITIAL' || approval.old_golden_set_version !== null || approval.old_golden_set_sha256 !== null || approval.predecessor_authoring_report_ref !== null) blocked('INITIAL Approval lineage differs.');
}

async function verifyCandidateEvidence({ changeRoot, candidateRoot, plan, report, environment }) {
  if (report.report_status !== 'READY_FOR_APPROVAL' || report.change_id !== plan.change_id || report.golden_set_version !== '1.0.0' && report.old_golden_set_version === null) blocked('Candidate lineage is invalid.');
  const planRef = await rawRef(changeRoot, resolve(changeRoot, 'capture-plan.json'), 'CAPTURE_PLAN');
  const candidateReportRef = await rawRef(candidateRoot, resolve(candidateRoot, 'candidate-authoring-report.json'), 'AUTHORING_REPORT', 'candidate/candidate-authoring-report.json');
  const environmentRef = await rawRef(candidateRoot, resolve(candidateRoot, 'golden-environment.json'), 'GOLDEN_ENVIRONMENT', 'golden-environment.json');
  if (!sameRaw(report.capture_plan_ref, planRef) || !sameRaw(report.authored_golden_environment_ref, environmentRef)
      || report.capture_set_sha256 !== undefined && report.capture_set_sha256 !== plan.capture_set_sha256) blocked('Candidate Plan or Environment reference differs.');
  const png = environment.png_refs.map(value => ({ logical_id: value.capture_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 }));
  const blank = environment.blank_baseline_refs.map(value => ({ logical_id: value.baseline_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 }));
  const fonts = environment.font_refs.map(value => ({ logical_id: value.logical_role, path: value.path, byte_length: value.byte_length, sha256: value.sha256 }));
  if (!sameJcs(report.approved_assets, { png_refs: png, blank_baseline_refs: blank, font_refs: fonts })) blocked('Candidate asset index differs from Golden Environment.');
  await verifyCandidateAssets(candidateRoot, changeRoot, report, environment);
  return Object.freeze({ changeRoot, candidateRoot, plan, report, environment, candidateReportRef, environmentRef });
}

async function verifyCandidateAssets(candidateRoot, changeRoot, report, environment) {
  if (report.fixture_materialization_report_refs.length !== 130 || report.fixture_database_refs.length !== 130 || report.approved_assets.png_refs.length !== 1242 || report.approved_assets.blank_baseline_refs.length !== 9) blocked('Candidate asset count differs.');
  for (const asset of report.approved_assets.png_refs) await matchesRaw(resolveInside(candidateRoot, `captures/attempt-1/${asset.logical_id}.png`), asset, 'Candidate PNG');
  for (const asset of report.approved_assets.blank_baseline_refs) await matchesRaw(resolveInside(candidateRoot, `blank/attempt-1/${asset.logical_id}.png`), asset, 'Candidate blank PNG');
  for (const font of environment.font_refs) await matchesRaw(resolveInside(candidateRoot, font.path), font, 'Candidate font');
  for (const value of report.fixture_materialization_report_refs) await matchesRaw(resolveInside(changeRoot, value.report_ref.path), value.report_ref, 'Materialization Report');
  for (const value of report.fixture_database_refs) await matchesRaw(resolveInside(changeRoot, value.database_ref.path), value.database_ref, 'Materialization database');
}

async function verifyPredecessor(path, report) {
  const supersede = report.old_golden_set_version !== null || report.old_golden_set_sha256 !== null;
  if (!supersede) {
    if (path !== null) input('INITIAL Approval forbids a predecessor report.');
    return null;
  }
  if (path === null) input('SUPERSEDE Approval requires a predecessor report.');
  const value = await readJson(path, 'Predecessor Authoring Report');
  if (value.report_status !== 'APPROVED_PUBLISHED' || value.golden_set_version !== report.old_golden_set_version || value.new_golden_set_sha256 !== report.old_golden_set_sha256) blocked('Predecessor Authoring Report differs from candidate lineage.');
  const ref = await rawRef(dirname(dirname(dirname(path))), path, 'AUTHORING_REPORT', `versions/${report.old_golden_set_version}/authoring-report.json`);
  return Object.freeze({ goldenSetVersion: report.old_golden_set_version, goldenSetSha256: report.old_golden_set_sha256, ref });
}

async function loadContracts() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const [approval, authoring, plan] = await Promise.all([APPROVAL_SCHEMA, AUTHORING_SCHEMA, PLAN_SCHEMA].map(async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))));
  return Object.freeze({ approval: ajv.compile(approval), authoring: ajv.compile(authoring), plan: ajv.compile(plan) });
}

async function readJson(path, label) { await assertOrdinaryFile(path, label); try { return JSON.parse(await readFile(path, 'utf8')); } catch { input(`${label} is not valid JSON.`); } }
async function rawRef(root, path, kind, logicalPath = relative(root, path)) { const info = await assertOrdinaryFile(path, kind); return Object.freeze({ kind, path: logicalPath.replaceAll('\\', '/'), byte_length: info.size, sha256: digest(await readFile(path)) }); }
async function matchesRaw(path, expected, label) { const actual = await rawRef(dirname(path), path, expected.kind ?? 'FILE', expected.path); if (actual.byte_length !== expected.byte_length || actual.sha256 !== expected.sha256) blocked(`${label} raw reference differs.`); }
async function atomicWriteFresh(path, content) { await assertFresh(path, 'Approval output'); const temporary = `${path}.tmp-${process.pid}-${Date.now()}`; await assertFresh(temporary, 'Approval temporary output'); try { const handle = await open(temporary, 'wx'); try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); } await rename(temporary, path); await fsyncDirectory(dirname(path)); } catch (error) { throw new GoldenApprovalError('GOLDEN_APPROVAL_INTERNAL_ERROR', 4, error.message); } }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function assertOrdinaryFile(path, label) { try { const before = await lstat(path); const physical = await realpath(path); const after = await lstat(physical); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || physical !== path || !after.isFile() || after.isSymbolicLink() || after.nlink !== 1) throw new Error(); return await stat(path); } catch { input(`${label} must be an ordinary regular file.`); } }
async function assertOrdinaryDirectory(path, label) { try { const before = await lstat(path); const physical = await realpath(path); const after = await lstat(physical); if (!before.isDirectory() || before.isSymbolicLink() || physical !== path || !after.isDirectory() || after.isSymbolicLink()) throw new Error(); } catch { input(`${label} must be an ordinary directory.`); } }
async function assertFresh(path, label) { try { await lstat(path); input(`${label} must be fresh.`); } catch (error) { if (error?.code !== 'ENOENT') input(`${label} is unreadable.`); } }
function resolveInside(root, logicalPath) { if (typeof logicalPath !== 'string' || logicalPath.startsWith('/') || logicalPath.includes('\\') || logicalPath.split('/').some(value => value === '' || value === '.' || value === '..')) blocked('Candidate logical path is unsafe.'); const path = resolve(root, logicalPath); const relation = relative(root, path); if (relation === '..' || relation.startsWith(`..${sep}`)) blocked('Candidate logical path escapes its root.'); return path; }
function sameRaw(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function sameJcs(left, right) { return canonicalizeJcs(left) === canonicalizeJcs(right); }
function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalizeJcs(value)).digest('hex'); }
function without(value, key) { const { [key]: ignored, ...rest } = value; return rest; }
function person(id, displayName, label) { return Object.freeze({ id: nonempty(id, `${label} ID`), display_name: nonempty(displayName, `${label} display name`) }); }
function nonempty(value, label) { if (typeof value !== 'string' || value.length === 0) input(`${label} is invalid.`); return value; }
function absolute(value, label) { if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) input(`${label} path is invalid.`); return value; }
function utc(value, label) { if (typeof value !== 'string' || !value.endsWith('Z') || new Date(value).toISOString() !== value) input(`${label} must be canonical UTC RFC3339.`); return value; }
function validExternalRef(value) { return value && typeof value.kind === 'string' && value.kind.length > 0 && typeof value.reference === 'string' && value.reference.length > 0 && Object.keys(value).length === 2; }
function input(message) { throw new GoldenApprovalError('GOLDEN_APPROVAL_INPUT_INVALID', 2, message); }
function blocked(message) { throw new GoldenApprovalError('GOLDEN_APPROVAL_BLOCKED', 3, message); }

async function cli() { await approveCandidate(parseApproveOptions(process.argv.slice(2))); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { process.stderr.write(`${error.code ?? 'GOLDEN_APPROVAL_INTERNAL_ERROR'}\n`); if (error.message) process.stderr.write(`${error.message}\n`); process.exitCode = error.exitCode ?? 4; });
