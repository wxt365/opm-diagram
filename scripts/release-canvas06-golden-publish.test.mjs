import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { buildCandidateAuthoringReport, writeCandidateAuthoringReport, writeCandidateGoldenEnvironment } from './release-canvas06-golden-author.mjs';
import { approveCandidate } from './release-canvas06-golden-approve.mjs';
import { GoldenPublishError, parsePublishOptions, publishApprovedGolden } from './release-canvas06-golden-publish.mjs';
import { verifyApprovedGolden } from './verify-canvas06-golden-approved-version.mjs';

test('04 Publisher CLI 只接受冻结的五个显式参数', () => {
  const options = parsePublishOptions(args());
  assert.equal(options.goldenSetVersion, '1.0.0');
  assert.throws(() => parsePublishOptions([...args(), '--force', 'true']), error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_INPUT_INVALID');
  assert.throws(() => parsePublishOptions(replace(args(), '--golden-set-version', 'v1.0.0')), error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_INPUT_INVALID');
});

test('04 postverify marker Schema 只接受不可消费的固定失败形状', async () => {
  const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-06-golden-publish-postverify-marker.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const marker = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-PUBLISH-POSTVERIFY-MARKER-001', schema_version: '0.1', status: 'POSTVERIFY_FAILED', golden_set_version: '1.0.0', approved_output_path: 'versions/1.0.0', final_authoring_report_ref: { kind: 'AUTHORING_REPORT', path: 'versions/1.0.0/authoring-report.json', byte_length: 1, sha256: 'a'.repeat(64) }, failure_code: 'GOLDEN_PUBLISH_POSTVERIFY_FAILED', failure_stage: 'FINAL_GOLDEN_VERIFIER', marker_payload_sha256: 'b'.repeat(64) };
  assert.equal(validate(marker), true, JSON.stringify(validate.errors));
  marker.status = 'READY';
  assert.equal(validate(marker), false);
});

test('04 Publisher 在隔离完整 Candidate 上原子发布，并拒绝重复发布和隔离标记版本', async () => {
  const changeRoot = await realpath(await mkdtemp(join(tmpdir(), 'canvas06-golden-publish-e2e-')));
  const { candidateRoot, planPath, approvalPath } = await createReadyCandidate(changeRoot);
  const externalRefsPath = join(changeRoot, 'external-refs.json');
  await writeFile(externalRefsPath, JSON.stringify([{ kind: 'CHANGE', reference: 'TEST-APPROVAL-001' }]));
  await approveCandidate({
    candidateRoot,
    applicant: { id: 'applicant-01', display_name: 'Applicant' },
    approver: { id: 'approver-02', display_name: 'Approver' },
    reasonCode: 'INITIAL_BASELINE',
    reasonText: 'Isolated end-to-end publication fixture.',
    requestedAt: '2026-07-01T00:00:00.000Z',
    approvedAt: '2026-07-01T00:01:00.000Z',
    externalRefsPath,
    outPath: approvalPath,
    predecessorPath: null
  });

  const approvedRoot = join(changeRoot, 'approved');
  await mkdir(approvedRoot);
  const lockPath = join(approvedRoot, '.golden-publisher.lock');
  await writeFile(lockPath, 'stale\n');
  await assert.rejects(
    () => publishApprovedGolden({ planPath, candidateRoot, approvalPath, approvedRoot, goldenSetVersion: '1.0.0' }),
    error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_BLOCKED'
  );
  await assert.rejects(() => lstat(join(approvedRoot, 'versions')), { code: 'ENOENT' });
  await rm(lockPath);
  const result = await publishApprovedGolden({ planPath, candidateRoot, approvalPath, approvedRoot, goldenSetVersion: '1.0.0' });
  const approvedVersionRoot = join(approvedRoot, 'versions', '1.0.0');
  assert.deepEqual(result, { approved_version_root: approvedVersionRoot, golden_set_version: '1.0.0' });
  const verified = await verifyApprovedGolden({ approvedVersionRoot, requireApproved: true });
  assert.equal(verified.report.report_status, 'APPROVED_PUBLISHED');
  assert.equal((await countFiles(approvedVersionRoot)), 1519);
  assert.deepEqual((await readdir(approvedRoot)).sort(), ['versions']);
  const finalReport = await readFile(join(approvedVersionRoot, 'authoring-report.json'));

  await assert.rejects(
    () => publishApprovedGolden({ planPath, candidateRoot, approvalPath, approvedRoot, goldenSetVersion: '1.0.0' }),
    error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_BLOCKED'
  );
  assert.deepEqual(await readFile(join(approvedVersionRoot, 'authoring-report.json')), finalReport);
  await assert.rejects(() => lstat(join(approvedRoot, '.golden-publisher.lock')), { code: 'ENOENT' });

  const initialReport = JSON.parse(finalReport);
  const supersede = await createReadyCandidate(join(changeRoot, 'supersede-change'), {
    changeId: 'GOLDEN-CANVAS06-20260804-002',
    lineage: {
      mode: 'SUPERSEDE',
      golden_set_version: '1.0.1',
      old_golden_set_version: '1.0.0',
      old_golden_set_sha256: initialReport.new_golden_set_sha256
    }
  });
  const supersedeRefsPath = join(changeRoot, 'supersede-change', 'external-refs.json');
  await writeFile(supersedeRefsPath, JSON.stringify([{ kind: 'CHANGE', reference: 'TEST-APPROVAL-002' }]));
  await approveCandidate({
    candidateRoot: supersede.candidateRoot,
    applicant: { id: 'applicant-03', display_name: 'Applicant' },
    approver: { id: 'approver-04', display_name: 'Approver' },
    reasonCode: 'BUG_FIX',
    reasonText: 'Isolated supersede fixture.',
    requestedAt: '2026-07-02T00:00:00.000Z',
    approvedAt: '2026-07-02T00:01:00.000Z',
    externalRefsPath: supersedeRefsPath,
    outPath: supersede.approvalPath,
    predecessorPath: join(approvedVersionRoot, 'authoring-report.json')
  });
  const supersedeResult = await publishApprovedGolden({
    planPath: supersede.planPath,
    candidateRoot: supersede.candidateRoot,
    approvalPath: supersede.approvalPath,
    approvedRoot,
    goldenSetVersion: '1.0.1'
  });
  assert.equal(supersedeResult.approved_version_root, join(approvedRoot, 'versions', '1.0.1'));
  assert.equal((await verifyApprovedGolden({ approvedVersionRoot: supersedeResult.approved_version_root, requireApproved: true })).report.golden_set_version, '1.0.1');
  assert.deepEqual(await readFile(join(approvedVersionRoot, 'authoring-report.json')), finalReport);

  const markerPath = join(approvedRoot, 'quarantine', '1.0.0.postverify-failed.json');
  await mkdir(join(approvedRoot, 'quarantine'));
  await writeFile(markerPath, '{}\n');
  await assert.rejects(
    () => verifyApprovedGolden({ approvedVersionRoot, requireApproved: true }),
    error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_BLOCKED'
  );
});

function args() { return ['--plan', '/change/capture-plan.json', '--candidate-root', '/change/candidate', '--approval-record', '/change/approval-record.json', '--approved-root', '/approved', '--golden-set-version', '1.0.0']; }
function replace(values, option, value) { const copy = [...values]; copy[copy.indexOf(option) + 1] = value; return copy; }

async function createReadyCandidate(changeRoot, { changeId = null, lineage = null } = {}) {
  await mkdir(changeRoot, { recursive: true });
  const plan = JSON.parse(await readFile(resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/dev-canvas-06/golden-authoring/GOLDEN-CANVAS06-20260803-001/capture-plan.json'), 'utf8'));
  plan.input_materialization.materialized_count = 130;
  if (changeId !== null) {
    plan.change_id = changeId;
    plan.plan_id = `dev-canvas-06.golden-capture-plan.${changeId}`;
  }
  const planPath = join(changeRoot, 'capture-plan.json');
  await writeFile(planPath, `${JSON.stringify(plan)}\n`);
  const candidateRoot = join(changeRoot, 'candidate');
  await mkdir(candidateRoot);
  const captureAssets = [];
  for (const capture of plan.captures) {
    const path = join(candidateRoot, 'captures', 'attempt-1', `${capture.capture_id}.png`);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, `png:${capture.capture_id}`);
    captureAssets.push({ capture_id: capture.capture_id, path: `captures/attempt-1/${capture.capture_id}.png` });
  }
  const blankAssets = [];
  for (const baseline of plan.blank_baselines) {
    const path = join(candidateRoot, 'blank', 'attempt-1', `${baseline.baseline_id}.png`);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, `blank:${baseline.baseline_id}`);
    blankAssets.push({ baseline_id: baseline.baseline_id, path: `blank/attempt-1/${baseline.baseline_id}.png` });
  }
  const fonts = await createFonts(changeRoot);
  const materialization = await createMaterialization(changeRoot);
  const environment = await writeCandidateGoldenEnvironment({
    candidateTemporaryRoot: candidateRoot,
    plan,
    browser: { realpath: '/controlled/chromium', byte_length: 1, sha256: digest('browser') },
    fonts,
    captureAssets,
    blankAssets,
    runtime: { os_name: 'darwin', os_build: 'test-build', arch: 'arm64', playwright_version: '1.57.0', chromium_version: '143.0.7499.4' }
  });
  const captureAttempts = environment.value.png_refs.flatMap(value => [1, 2].map(attempt_ordinal => ({
    capture_id: value.capture_id,
    attempt_ordinal,
    png_byte_length: value.ref.byte_length,
    png_sha256: value.ref.sha256,
    width: 1,
    height: 1,
    cell_geometry_sha256: digest(`geometry:${value.capture_id}`),
    projection_sha256: digest(`projection:${value.capture_id}`)
  })));
  const blankAttempts = environment.value.blank_baseline_refs.flatMap(value => [1, 2].map(attempt_ordinal => ({
    baseline_id: value.baseline_id,
    attempt_ordinal,
    png_byte_length: value.ref.byte_length,
    png_sha256: value.ref.sha256,
    width: 1,
    height: 1
  })));
  const planBytes = await readFile(planPath);
  const reportInput = {
    candidateTemporaryRoot: candidateRoot,
    plan,
    capturePlanRef: rawRef('CAPTURE_PLAN', 'capture-plan.json', planBytes),
    lineage: lineage ?? { mode: 'INITIAL', golden_set_version: '1.0.0', old_golden_set_version: null, old_golden_set_sha256: null },
    authoredEnvironment: environment,
    materialization,
    captureAttemptResults: captureAttempts,
    blankAttemptResults: blankAttempts,
    generatorIdentity: identity('npm run release:canvas06:golden:author'),
    materializationVerifierIdentity: identity('npm run release:canvas06:golden:materialize:verify')
  };
  const reportSchema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json'), 'utf8'));
  const validateReport = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(reportSchema);
  assert.equal(validateReport(buildCandidateAuthoringReport(reportInput)), true, JSON.stringify(validateReport.errors));
  await writeCandidateAuthoringReport(reportInput);
  return { candidateRoot, planPath, approvalPath: join(changeRoot, 'approval-record.json') };
}

async function createFonts(changeRoot) {
  return await Promise.all(['CJK_FALLBACK', 'MONOSPACE', 'UI_SANS'].map(async role => {
    const sourcePath = join(changeRoot, `${role}.font`);
    const bytes = Buffer.from(`font:${role}`);
    await writeFile(sourcePath, bytes);
    return { logical_role: role, postscript_name: `${role}-TEST`, font_version: '1.0', source_path: sourcePath, source_ref: rawRef('FONT_FILE', sourcePath, bytes) };
  }));
}

async function createMaterialization(changeRoot) {
  const reportRefs = [];
  const databaseRefs = [];
  for (let index = 0; index < 130; index += 1) {
    const key = digest(`fixture:${index}`);
    const reportPath = join(changeRoot, 'materialization', 'reports', `${key}.json`);
    const databasePath = join(changeRoot, 'materialization', 'fixtures', key, 'project.db');
    const reportBytes = Buffer.from(`report:${index}`);
    const databaseBytes = Buffer.from(`database:${index}`);
    await mkdir(resolve(reportPath, '..'), { recursive: true });
    await mkdir(resolve(databasePath, '..'), { recursive: true });
    await writeFile(reportPath, reportBytes);
    await writeFile(databasePath, databaseBytes);
    reportRefs.push({ fixture_ref_key: key, report_ref: rawRef('MATERIALIZATION_REPORT', `materialization/reports/${key}.json`, reportBytes) });
    databaseRefs.push({ fixture_ref_key: key, database_ref: rawRef('DATABASE', `materialization/fixtures/${key}/project.db`, databaseBytes), semantic_state_sha256: digest(`semantic:${index}`) });
  }
  return { report_refs: reportRefs, database_refs: databaseRefs };
}

async function countFiles(root) {
  let count = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countFiles(join(root, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function identity(command) { return { runner_version: '0.2.0', source_commit: 'a'.repeat(40), node_version: process.version, command, runner_source_sha256: digest(command) }; }
function rawRef(kind, path, bytes) { return { kind, path, byte_length: bytes.length, sha256: digest(bytes) }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
