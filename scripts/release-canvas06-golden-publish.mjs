import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { GoldenApprovalError, loadApprovalCandidate, verifyApprovalRecord } from './release-canvas06-golden-approve.mjs';

const ROOT = resolve('.');
const APPROVAL_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json';
const AUTHORING_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json';
const POSTVERIFY_MARKER_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-publish-postverify-marker.schema.json';
const REQUIRED = ['plan', 'candidate-root', 'approval-record', 'approved-root', 'golden-set-version'];

export class GoldenPublishError extends Error {
  constructor(code, exitCode, message) {
    super(message);
    this.name = 'GoldenPublishError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parsePublishOptions(values) {
  if (!Array.isArray(values) || values.length !== REQUIRED.length * 2) input('Publisher options must be complete key/value pairs.');
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1]; const name = typeof key === 'string' && key.startsWith('--') ? key.slice(2) : null;
    if (!name || !REQUIRED.includes(name) || options.has(name) || typeof value !== 'string') input('Publisher option is forbidden or duplicated.');
    options.set(name, value);
  }
  if (options.size !== REQUIRED.length) input('Publisher options are incomplete.');
  return Object.freeze({ planPath: absolute(options.get('plan'), 'Capture Plan'), candidateRoot: absolute(options.get('candidate-root'), 'Candidate root'), approvalPath: absolute(options.get('approval-record'), 'Approval Record'), approvedRoot: absolute(options.get('approved-root'), 'Approved root'), goldenSetVersion: semver(options.get('golden-set-version')) });
}

export async function publishApprovedGolden(options) {
  const candidate = await loadApprovalCandidate(options.candidateRoot);
  if (options.planPath !== resolve(candidate.changeRoot, 'capture-plan.json') || options.approvalPath !== resolve(candidate.changeRoot, 'approval-record.json')) input('Publisher input must use the candidate change root layout.');
  await assertOrdinaryDirectory(options.approvedRoot, 'Approved root');
  const contracts = await loadContracts();
  const approval = await readJson(options.approvalPath, 'Approval Record');
  if (!contracts.approval(approval) || approval.golden_set_version !== options.goldenSetVersion || approval.approved_output_path !== `versions/${options.goldenSetVersion}`) blocked('Approval Record Schema or version differs.');
  const predecessor = await resolvePredecessor(options.approvedRoot, approval);
  verifyApprovalRecord(approval, { candidate, predecessor });
  await verifyVersionPolicy(options.approvedRoot, approval, predecessor);
  const lock = await acquireLock(options.approvedRoot);
  const versionsRoot = resolve(options.approvedRoot, 'versions');
  const finalRoot = resolve(versionsRoot, options.goldenSetVersion);
  const temporary = resolve(options.approvedRoot, `.approved-${options.goldenSetVersion}.tmp-${process.pid}-${Date.now()}`);
  let renamed = false;
  try {
    await mkdir(versionsRoot, { recursive: true });
    await assertFresh(finalRoot, 'Approved version root');
    await assertFresh(temporary, 'Publisher temporary root');
    await mkdir(temporary);
    await copyApprovedVersion({ temporary, candidate, approval, approvalPath: options.approvalPath });
    const finalReport = await writePublishedReport({ temporary, candidate, approval, approvalPath: options.approvalPath });
    if (!contracts.authoring(finalReport)) blocked('Published Authoring Report Schema is invalid.');
    await verifyApprovedVersion(temporary, { contracts, approval, checkQuarantine: false });
    await fsyncDirectory(temporary);
    await rename(temporary, finalRoot);
    renamed = true;
    await fsyncDirectory(versionsRoot);
    await verifyApprovedVersion(finalRoot, { contracts, approval });
    return Object.freeze({ approved_version_root: finalRoot, golden_set_version: options.goldenSetVersion });
  } catch (error) {
    if (renamed) {
      await writePostverifyMarker(options.approvedRoot, options.goldenSetVersion, contracts);
      throw error;
    }
    if (error instanceof GoldenPublishError || error instanceof GoldenApprovalError) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
    await rm(temporary, { recursive: true, force: true });
    throw new GoldenPublishError('GOLDEN_PUBLISH_INTERNAL_ERROR', 4, error.message);
  } finally {
    await lock.close().catch(() => undefined);
    await rm(lock.path, { force: true }).catch(() => undefined);
  }
}

export async function verifyApprovedVersion(root, { contracts = null, approval = null, checkQuarantine = true } = {}) {
  const activeContracts = contracts ?? await loadContracts();
  await assertOrdinaryDirectory(root, 'Approved version root');
  if (checkQuarantine) await assertNoPostverifyMarker(dirname(dirname(root)), basename(root));
  const finalReportPath = resolve(root, 'authoring-report.json');
  const candidateReportPath = resolve(root, 'candidate/candidate-authoring-report.json');
  const approvalPath = resolve(root, 'approval-record.json');
  const environmentPath = resolve(root, 'golden-environment.json');
  const [report, candidateReport, publishedApproval, environment] = await Promise.all([
    readJson(finalReportPath, 'Published Authoring Report'), readJson(candidateReportPath, 'Candidate Authoring Report'), readJson(approvalPath, 'Approval Record'), readJson(environmentPath, 'Golden Environment')
  ]);
  if (!activeContracts.authoring(report) || !activeContracts.authoring(candidateReport) || !activeContracts.approval(publishedApproval)) blocked('Approved version Schema is invalid.');
  if (report.report_status !== 'APPROVED_PUBLISHED' || candidateReport.report_status !== 'READY_FOR_APPROVAL' || publishedApproval.approval_status !== 'APPROVED') blocked('Approved version state is invalid.');
  const [approvalRef, environmentRef, candidateRef] = await Promise.all([
    rawRef(root, approvalPath, 'APPROVAL_RECORD'), rawRef(root, environmentPath, 'GOLDEN_ENVIRONMENT'), rawRef(root, candidateReportPath, 'AUTHORING_REPORT')
  ]);
  if (!sameRaw(report.approval_record_ref, approvalRef) || !sameRaw(report.golden_environment_ref, environmentRef) || !sameRaw(report.authored_golden_environment_ref, environmentRef) || !sameRaw(report.candidate_authoring_report_ref, candidateRef)
      || !sameRaw(publishedApproval.candidate_authoring_report_ref, candidateRef) || !sameRaw(publishedApproval.authored_golden_environment_ref, environmentRef)
      || report.report_payload_sha256 !== digest(without(report, 'report_payload_sha256'))) blocked('Approved version reference or digest closure differs.');
  if (approval && canonicalizeJcs(approval) !== canonicalizeJcs(publishedApproval)) blocked('Approved version Approval differs from Publisher input.');
  await verifyCopiedAssets(root, candidateReport, environment);
  await assertAllowlist(root, expectedPaths(candidateReport, environment));
  return Object.freeze({ report, approval: publishedApproval, environment });
}

async function copyApprovedVersion({ temporary, candidate, approval, approvalPath }) {
  await copyVerified(resolve(candidate.changeRoot, 'capture-plan.json'), resolve(temporary, 'capture-plan.json'), candidate.report.capture_plan_ref, 'Capture Plan');
  await copyVerified(resolve(candidate.candidateRoot, 'candidate-authoring-report.json'), resolve(temporary, 'candidate/candidate-authoring-report.json'), approval.candidate_authoring_report_ref, 'Candidate Authoring Report');
  await copyVerified(resolve(candidate.candidateRoot, 'golden-environment.json'), resolve(temporary, 'golden-environment.json'), approval.authored_golden_environment_ref, 'Golden Environment');
  for (const value of approval.fixture_materialization_report_refs) await copyVerified(resolveInside(candidate.changeRoot, value.report_ref.path), resolveInside(temporary, value.report_ref.path), value.report_ref, 'Materialization Report');
  for (const value of approval.fixture_database_refs) await copyVerified(resolveInside(candidate.changeRoot, value.database_ref.path), resolveInside(temporary, value.database_ref.path), value.database_ref, 'Materialization database');
  for (const value of approval.png_refs) await copyVerified(resolve(candidate.candidateRoot, 'captures/attempt-1', `${value.capture_id}.png`), resolveInside(temporary, value.path), value, 'Candidate PNG');
  for (const value of approval.blank_baseline_refs) await copyVerified(resolve(candidate.candidateRoot, 'blank/attempt-1', `${value.baseline_id}.png`), resolveInside(temporary, value.path), value, 'Candidate blank PNG');
  for (const value of approval.font_refs) await copyVerified(resolveInside(candidate.candidateRoot, value.path), resolveInside(temporary, value.path), value, 'Candidate font');
  await copyVerified(approvalPath, resolve(temporary, 'approval-record.json'), null, 'Approval Record');
}

async function writePublishedReport({ temporary, candidate, approval, approvalPath }) {
  const report = structuredClone(candidate.report);
  report.report_id = `dev-canvas-06.golden-authoring-report.${report.change_id}.approved.${approval.golden_set_version}`;
  report.report_status = 'APPROVED_PUBLISHED';
  report.golden_set_version = approval.golden_set_version;
  report.command = 'npm run release:canvas06:golden:publish';
  report.generator_identity = { runner_version: '0.2.0', source_commit: report.source_build.source_commit, node_version: process.version, command: report.command, runner_source_sha256: digest(await readFile(resolve(ROOT, 'scripts/release-canvas06-golden-publish.mjs'))) };
  report.approval_record_ref = await rawRef(temporary, resolve(temporary, 'approval-record.json'), 'APPROVAL_RECORD');
  report.golden_environment_ref = await rawRef(temporary, resolve(temporary, 'golden-environment.json'), 'GOLDEN_ENVIRONMENT');
  report.authored_golden_environment_ref = { ...report.golden_environment_ref };
  report.candidate_authoring_report_ref = await rawRef(temporary, resolve(temporary, 'candidate/candidate-authoring-report.json'), 'AUTHORING_REPORT');
  report.report_payload_sha256 = digest(without(report, 'report_payload_sha256'));
  const path = resolve(temporary, 'authoring-report.json');
  await atomicWriteFresh(path, `${canonicalizeJcs(report)}\n`);
  return report;
}

async function verifyCopiedAssets(root, report, environment) {
  for (const value of report.fixture_materialization_report_refs) await matchesRaw(resolveInside(root, value.report_ref.path), value.report_ref, 'Published Materialization Report');
  for (const value of report.fixture_database_refs) await matchesRaw(resolveInside(root, value.database_ref.path), value.database_ref, 'Published database');
  for (const value of report.approved_assets.png_refs) await matchesRaw(resolveInside(root, value.path), value, 'Published PNG');
  for (const value of report.approved_assets.blank_baseline_refs) await matchesRaw(resolveInside(root, value.path), value, 'Published blank PNG');
  for (const value of environment.font_refs) await matchesRaw(resolveInside(root, value.path), value, 'Published font');
}

async function resolvePredecessor(approvedRoot, approval) {
  if (approval.mode === 'INITIAL') return null;
  await assertNoPostverifyMarker(approvedRoot, approval.old_golden_set_version);
  const path = resolve(approvedRoot, `versions/${approval.old_golden_set_version}/authoring-report.json`);
  const ref = await rawRef(approvedRoot, path, 'AUTHORING_REPORT');
  if (!sameRaw(approval.predecessor_authoring_report_ref, ref)) blocked('Approval predecessor raw reference differs.');
  return Object.freeze({ goldenSetVersion: approval.old_golden_set_version, goldenSetSha256: approval.old_golden_set_sha256, ref });
}

async function verifyVersionPolicy(approvedRoot, approval, predecessor) {
  const versionsRoot = resolve(approvedRoot, 'versions');
  let versions = [];
  try { versions = (await readdir(versionsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).filter(isSemver).sort(compareSemver); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (approval.mode === 'INITIAL') {
    if (versions.length !== 0 || approval.golden_set_version !== '1.0.0' || approval.reason_code !== 'INITIAL_BASELINE') blocked('INITIAL version policy differs.');
    return;
  }
  const highest = versions.at(-1);
  if (!predecessor || highest !== approval.old_golden_set_version || compareSemver(approval.golden_set_version, highest) <= 0 || approval.new_golden_set_sha256 === approval.old_golden_set_sha256) blocked('SUPERSEDE version policy differs.');
}

function expectedPaths(report, environment) {
  return new Set([
    'capture-plan.json', 'approval-record.json', 'authoring-report.json', 'candidate/candidate-authoring-report.json', 'golden-environment.json',
    ...report.fixture_materialization_report_refs.map(value => value.report_ref.path), ...report.fixture_database_refs.map(value => value.database_ref.path),
    ...report.approved_assets.png_refs.map(value => value.path), ...report.approved_assets.blank_baseline_refs.map(value => value.path), ...environment.font_refs.map(value => value.path)
  ]);
}

async function assertAllowlist(root, expected) {
  const actual = new Set();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) actual.add(relative(root, path).replaceAll('\\', '/'));
      else blocked('Approved version contains a non-regular entry.');
    }
  }
  await walk(root);
  if (actual.size !== expected.size || [...actual].some(path => !expected.has(path))) blocked('Approved version allowlist differs.');
}

async function acquireLock(root) { const path = resolve(root, '.golden-publisher.lock'); try { const handle = await open(path, 'wx'); await handle.writeFile(`${process.pid}\n`); await handle.sync(); return Object.freeze({ path, close: () => handle.close() }); } catch (error) { if (error?.code === 'EEXIST') blocked('Golden Publisher lock already exists.'); throw error; } }
async function writePostverifyMarker(approvedRoot, goldenSetVersion, contracts) {
  const path = resolve(approvedRoot, 'quarantine', `${goldenSetVersion}.postverify-failed.json`);
  const reportRef = await rawRef(approvedRoot, resolve(approvedRoot, 'versions', goldenSetVersion, 'authoring-report.json'), 'AUTHORING_REPORT');
  const marker = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-PUBLISH-POSTVERIFY-MARKER-001', schema_version: '0.1', status: 'POSTVERIFY_FAILED', golden_set_version: goldenSetVersion, approved_output_path: `versions/${goldenSetVersion}`, final_authoring_report_ref: reportRef, failure_code: 'GOLDEN_PUBLISH_POSTVERIFY_FAILED', failure_stage: 'FINAL_GOLDEN_VERIFIER', marker_payload_sha256: '' };
  marker.marker_payload_sha256 = digest(without(marker, 'marker_payload_sha256'));
  if (!contracts.postverifyMarker(marker)) throw new GoldenPublishError('GOLDEN_PUBLISH_INTERNAL_ERROR', 4, 'Postverify marker Schema is invalid.');
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFresh(path, `${canonicalizeJcs(marker)}\n`);
}
async function assertNoPostverifyMarker(approvedRoot, goldenSetVersion) {
  const path = resolve(approvedRoot, 'quarantine', `${goldenSetVersion}.postverify-failed.json`);
  try { await lstat(path); blocked('Approved version has a postverify failure marker.'); }
  catch (error) { if (error instanceof GoldenPublishError) throw error; if (error?.code !== 'ENOENT') input('Postverify marker is unreadable.'); }
}
async function loadContracts() { const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }); const [approval, authoring, postverifyMarker] = await Promise.all([APPROVAL_SCHEMA, AUTHORING_SCHEMA, POSTVERIFY_MARKER_SCHEMA].map(async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8')))); return Object.freeze({ approval: ajv.compile(approval), authoring: ajv.compile(authoring), postverifyMarker: ajv.compile(postverifyMarker) }); }
async function readJson(path, label) { await assertOrdinaryFile(path, label); try { return JSON.parse(await readFile(path, 'utf8')); } catch { input(`${label} is not valid JSON.`); } }
async function rawRef(root, path, kind, logicalPath = relative(root, path)) { const info = await assertOrdinaryFile(path, kind); return Object.freeze({ kind, path: logicalPath.replaceAll('\\', '/'), byte_length: info.size, sha256: digest(await readFile(path)) }); }
async function matchesRaw(path, expected, label) { const info = await assertOrdinaryFile(path, label); const bytes = await readFile(path); if (info.size !== expected.byte_length || digest(bytes) !== expected.sha256) blocked(`${label} raw reference differs.`); }
async function copyVerified(source, target, expected, label) { const sourceInfo = await assertOrdinaryFile(source, label); const sourceBytes = await readFile(source); if (expected && (sourceInfo.size !== expected.byte_length || digest(sourceBytes) !== expected.sha256)) blocked(`${label} source raw reference differs.`); await mkdir(dirname(target), { recursive: true }); await assertFresh(target, label); await copyFile(source, target); const handle = await open(target, 'r'); try { await handle.sync(); } finally { await handle.close(); } if (expected) await matchesRaw(target, expected, label); }
async function atomicWriteFresh(path, content) { await assertFresh(path, 'Published Authoring Report'); const temporary = `${path}.tmp-${process.pid}-${Date.now()}`; await assertFresh(temporary, 'Published Authoring Report temporary'); const handle = await open(temporary, 'wx'); try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); } await rename(temporary, path); await fsyncDirectory(dirname(path)); }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function assertOrdinaryFile(path, label) { try { const before = await lstat(path); const physical = await realpath(path); const after = await lstat(physical); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || physical !== path || !after.isFile() || after.isSymbolicLink() || after.nlink !== 1) throw new Error(); return await stat(path); } catch { input(`${label} must be an ordinary regular file.`); } }
async function assertOrdinaryDirectory(path, label) { try { const before = await lstat(path); const physical = await realpath(path); const after = await lstat(physical); if (!before.isDirectory() || before.isSymbolicLink() || physical !== path || !after.isDirectory() || after.isSymbolicLink()) throw new Error(); } catch { input(`${label} must be an ordinary directory.`); } }
async function assertFresh(path, label) { try { await lstat(path); blocked(`${label} already exists.`); } catch (error) { if (error?.code !== 'ENOENT') input(`${label} is unreadable.`); } }
function resolveInside(root, logicalPath) { if (typeof logicalPath !== 'string' || logicalPath.startsWith('/') || logicalPath.includes('\\') || logicalPath.split('/').some(value => value === '' || value === '.' || value === '..')) blocked('Published logical path is unsafe.'); const path = resolve(root, logicalPath); const relation = relative(root, path); if (relation === '..' || relation.startsWith(`..${sep}`)) blocked('Published logical path escapes its root.'); return path; }
function sameRaw(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalizeJcs(value)).digest('hex'); }
function without(value, key) { const { [key]: ignored, ...rest } = value; return rest; }
function absolute(value, label) { if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) input(`${label} path is invalid.`); return value; }
function semver(value) { if (!isSemver(value)) input('Golden set version is invalid.'); return value; }
function isSemver(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value); }
function compareSemver(left, right) { const a = left.split('.').map(Number); const b = right.split('.').map(Number); for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]; return 0; }
function input(message) { throw new GoldenPublishError('GOLDEN_PUBLISH_INPUT_INVALID', 2, message); }
function blocked(message) { throw new GoldenPublishError('GOLDEN_PUBLISH_BLOCKED', 3, message); }

async function cli() { await publishApprovedGolden(parsePublishOptions(process.argv.slice(2))); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { process.stderr.write(`${error.code ?? 'GOLDEN_PUBLISH_INTERNAL_ERROR'}\n`); if (error.message) process.stderr.write(`${error.message}\n`); process.exitCode = error.exitCode ?? 4; });
