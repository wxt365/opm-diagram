import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve('.');
const handoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const intakeRunner = resolve('scripts/release-canvas06-intake.mjs');
const enablementRunner = resolve('scripts/release-canvas06-enablement.mjs');
const handoff = 'dev-canvas-05-handoff.json';
const handoffDigest = sha(await readFile(resolve(handoffRoot, handoff)));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

test('BLOCKED release evidence produces a disabled Candidate manifest', async () => {
  const fixture = await prepare(false);
  try {
    const result = run('build', buildArguments(fixture));
    assert.equal(result.status, 3, result.stderr);
    assert.ok(await exists(fixture.candidate), result.stderr);
    const candidate = await load(fixture.candidate);
    assert.equal(candidate.manifest_status, 'BLOCKED');
    assert.deepEqual(candidate.production_gate, { state: 'DISABLED', enabled_capability_ids: [] });
    assert.equal(candidate.capability_decisions.length, 34);
    assert.ok(candidate.blockers.some(item => item.code === 'CANVAS06_VISUAL_EVIDENCE_FAILED'));
  } finally { await cleanup(fixture); }
});

test('schema-valid READY Release Report permits only the isolated Activation fixture', async () => {
  const fixture = await prepare(true);
  try {
    const candidateBuild = run('build', buildArguments(fixture));
    assert.equal(candidateBuild.status, 0, candidateBuild.stderr);
    assert.ok(await exists(fixture.candidate), candidateBuild.stderr);
    const candidate = await load(fixture.candidate);
    assert.equal(candidate.manifest_status, 'READY_FOR_ACTIVATION');
    assert.equal(candidate.proposed_enabled_capability_ids.length, 34);
    assert.deepEqual(candidate.production_gate, { state: 'DISABLED', enabled_capability_ids: [] });

    const verify = run('verify', ['--evidence-root', fixture.evidenceRoot, '--manifest', 'candidate.json']);
    assert.equal(verify.status, 0, verify.stderr);

    const release = releaseReport(candidate, await ref(fixture.evidenceRoot, fixture.candidate, 'ENABLEMENT_CANDIDATE'));
    await writeFile(fixture.release, JSON.stringify(release));
    const activation = run('activate', ['--evidence-root', fixture.evidenceRoot, '--candidate', 'candidate.json', '--release-report', 'release.json', '--out', 'activation.json']);
    assert.equal(activation.status, 0, activation.stderr);
    assert.ok(await exists(fixture.activation), activation.stderr);
    const activationManifest = await load(fixture.activation);
    assert.equal(activationManifest.manifest_status, 'ACTIVE_COMPLETE');
    assert.deepEqual(activationManifest.release_candidate_report_ref, await ref(fixture.evidenceRoot, fixture.release, 'RELEASE_CANDIDATE_REPORT'));
  } finally { await cleanup(fixture); }
});

test('verifier rejects schema-valid Candidate derivation tampering', async () => {
  const fixture = await prepare(true);
  try {
    const candidateBuild = run('build', buildArguments(fixture));
    assert.equal(candidateBuild.status, 0, candidateBuild.stderr);
    const candidate = await load(fixture.candidate);
    const cases = [
      ['status', value => { value.manifest_status = 'BLOCKED'; }],
      ['proposed', value => { value.proposed_enabled_capability_ids = value.proposed_enabled_capability_ids.slice(1); }],
      ['decision', value => { value.capability_decisions[0].release_validation_status = 'BLOCKED'; }],
      ['batch', value => { value.batches[0].release_validation_status = 'BLOCKED'; }],
      ['source-build', value => { value.source_build = { ...value.source_build, target: 'tampered-build' }; }]
    ];
    for (const [name, mutate] of cases) {
      const tampered = structuredClone(candidate);
      mutate(tampered);
      const path = resolve(fixture.evidenceRoot, `candidate-${name}.json`);
      await writeFile(path, JSON.stringify(tampered));
      const verify = run('verify', ['--evidence-root', fixture.evidenceRoot, '--manifest', `candidate-${name}.json`]);
      assert.equal(verify.status, 3, `${name}: ${verify.stderr}`);
    }
  } finally { await cleanup(fixture); }
});

test('builder never overwrites an existing manifest path', async () => {
  const fixture = await prepare(false);
  try {
    const original = Buffer.from('immutable-existing-manifest');
    await writeFile(fixture.candidate, original);
    const result = run('build', buildArguments(fixture));
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(await readFile(fixture.candidate), original);
  } finally { await cleanup(fixture); }
});

async function prepare(ready) {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-enablement-'));
  const evidenceRoot = resolve(directory, 'evidence');
  const intake = resolve(evidenceRoot, 'intake.json');
  const intakeResult = spawnSync(process.execPath, [intakeRunner, '--handoff-root', handoffRoot, '--handoff', handoff, '--handoff-sha256', handoffDigest, '--out', intake], { cwd: root, encoding: 'utf8' });
  assert.equal(intakeResult.status, 0, intakeResult.stderr);
  const intakeValue = await load(intake);
  const intakeRef = await ref(evidenceRoot, intake, 'INTAKE_REPORT');
  const sourceBuild = { source_commit: sourceCommit, dirty_before_build: false, target: 'test-release-build' };
  const reports = [
    ['visual.json', 'OPM-DEV-CANVAS-06-VISUAL-REPORT-001', ready ? visualResults(intakeValue) : []],
    ['e2e.json', 'OPM-DEV-CANVAS-06-E2E-REPORT-001', ready ? e2eResults(intakeValue) : []],
    ['performance.json', 'OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001', []],
    ['recovery.json', 'OPM-DEV-CANVAS-06-RECOVERY-REPORT-001', []]
  ];
  for (const [name, schema_id, capability_results] of reports) {
    await writeFile(resolve(evidenceRoot, name), JSON.stringify({ schema_id, schema_version: '0.1', report_status: ready ? 'READY_FOR_ENABLEMENT_EVALUATION' : 'BLOCKED', intake_report_ref: intakeRef, handoff_ref: intakeValue.handoff_ref, source_build: sourceBuild, capability_results, failures: ready ? [] : [{ code: 'TEST_BLOCKED' }] }));
  }
  return { directory, evidenceRoot, candidate: resolve(evidenceRoot, 'candidate.json'), release: resolve(evidenceRoot, 'release.json'), activation: resolve(evidenceRoot, 'activation.json'), rollback: resolve(evidenceRoot, 'rollback.json') };
}

function buildArguments(fixture) {
  return ['--evidence-root', fixture.evidenceRoot, '--intake-report', 'intake.json', '--visual-report', 'visual.json', '--e2e-report', 'e2e.json', '--performance-report', 'performance.json', '--recovery-report', 'recovery.json', '--out', 'candidate.json'];
}

function visualResults(intake) { return intake.capability_intake.map(item => ({ capability_id: item.capability_id, status: 'PASS_MATCHED' })); }
function e2eResults(intake) { return intake.capability_intake.map(item => ({ capability_id: item.capability_id, status: 'PASS_MATCHED', covered_coverage_keys: item.coverage_keys })); }
function releaseReport(candidate, candidateRef) {
  const evidence = refValue('EVIDENCE');
  const open = {
    project_id: 'project.release.001', model_id: 'model.release.001', context_id: 'context.release.001', head_revision_id: 'revision.release.001', head_sequence: 2,
    projection_sha256: digest('1'), opl_sha256: digest('2'), trace_sha256: digest('3'), canvas_nonblank: true, console_error_count: 0, page_error_count: 0, external_request_count: 0
  };
  const cases = ['SMK-CANVAS-001.CLEAN_INSTALL', 'SMK-CANVAS-002.START', 'SMK-CANVAS-003.HEALTH', 'SMK-CANVAS-004.OPEN', 'SMK-CANVAS-005.REOPEN', 'SMK-CANVAS-006.EXIT'];
  const lane = laneId => ({
    lane_id: laneId, status: 'PASS_MATCHED', install_root_was_empty: true, storage_root_was_empty: true, browser_profile_was_empty: true,
    process_identity_refs: [evidence], evidence_refs: [evidence],
    case_results: cases.map((case_id, index) => ({ case_id, status: 'PASS_MATCHED', attempt_ordinal: laneId === 'LANE-01' ? 1 : 2, started_at: '2026-08-02T00:00:00.000Z', finished_at: '2026-08-02T00:00:01.000Z', duration_us: 1000, observations: case_id === cases[3] || case_id === cases[4] ? open : { observation: `PASS_${index}` }, evidence_refs: [evidence], failure_codes: [] }))
  });
  const gate = { state: 'DISABLED', enabled_capability_ids: [], candidate_loader_status: 'NOT_ACTIVE' };
  return {
    schema_id: 'OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.release-report.aaaaaaaaaaaa', generated_at: '2026-08-02T00:00:00.000Z',
    generator: { runner_version: '0.1.0', source_commit: sourceCommit, node_version: process.version, os: process.platform, command: 'release:canvas06:smoke', runner_source_sha256: digest('4') },
    release_status: 'READY', release_manifest_ref: refValue('RELEASE_CANDIDATE_MANIFEST'), handoff_ref: candidate.handoff_ref, intake_report_ref: candidate.intake_report_ref,
    release_evidence: Object.fromEntries(['visual_manifest_ref', 'visual_report_ref', 'e2e_manifest_ref', 'e2e_report_ref', 'performance_manifest_ref', 'performance_report_ref', 'recovery_manifest_ref', 'recovery_report_ref'].map(key => [key, evidence])),
    enablement_candidate_ref: candidateRef, source_build: candidate.source_build,
    artifact_observations: { release_zip_ref: evidence, installed_payload_ref: evidence, jar_web_dist_ref: evidence, profile_assets_ref: evidence },
    environment: { target_os: 'darwin', os_build: 'test', target_arch: 'arm64', java_vendor: 'test', java_version: '21', java_executable_sha256: digest('5'), chromium_version: '143.0.7499.4', cpu: 'test', logical_cpu_count: 1, ram_bytes: 1, ssd: true, locale: 'zh-CN', timezone: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, device_scale_factor: 1, loopback_ports: [41001, 41002], network_mode: 'LOOPBACK_ONLY', hmr_enabled: false, devtools_enabled: false },
    environment_fingerprint: digest('6'), lane_results: [lane('LANE-01'), lane('LANE-02')],
    aggregation: { lane_count: 2, case_count: 6, expected_attempt_count: 12, observed_attempt_count: 12, pass_matched_count: 12, failed_count: 0, skipped_count: 0, retry_count: 0, external_request_count: 0, production_gate_mutation_count: 0 },
    production_gate_observation: { before: gate, during: gate, after: gate }, failures: [], residual_risks: [],
    conformance_boundary: { product_release_evidence: 'PRODUCT_RELEASE_EVIDENCE_ONLY', iso_19450_2024: 'ISO_19450_2024_CONFORMANCE_NOT_ESTABLISHED' }
  };
}
function refValue(kind) { return { kind, path: `release/${kind.toLowerCase()}.json`, byte_length: 1, sha256: digest(kind) }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function run(operation, arguments_) { return spawnSync(process.execPath, [enablementRunner, operation, ...arguments_], { cwd: root, encoding: 'utf8' }); }
async function ref(base, path, kind) { const bytes = await readFile(path); const info = await stat(path); return { kind, path: path.slice(base.length + 1), byte_length: info.size, sha256: sha(bytes) }; }
async function load(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function cleanup(fixture) { await rm(fixture.directory, { recursive: true, force: true }); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
