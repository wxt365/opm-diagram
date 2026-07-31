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

test('READY release evidence produces a disabled Candidate but cannot bypass GATE-06-06', async () => {
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

    const release = {
      schema_id: 'OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-REPORT-001', schema_version: '0.1', report_status: 'READY',
      candidate_manifest_ref: await ref(fixture.evidenceRoot, fixture.candidate, 'CANDIDATE_MANIFEST'), handoff_ref: candidate.handoff_ref, source_build: candidate.source_build
    };
    await writeFile(fixture.release, JSON.stringify(release));
    const activation = run('activate', ['--evidence-root', fixture.evidenceRoot, '--candidate', 'candidate.json', '--release-report', 'release.json', '--out', 'activation.json']);
    assert.equal(activation.status, 3, activation.stderr);
    assert.match(activation.stderr, /GATE-06-06/);
    assert.equal(await exists(fixture.activation), false);
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
function run(operation, arguments_) { return spawnSync(process.execPath, [enablementRunner, operation, ...arguments_], { cwd: root, encoding: 'utf8' }); }
async function ref(base, path, kind) { const bytes = await readFile(path); const info = await stat(path); return { kind, path: path.slice(base.length + 1), byte_length: info.size, sha256: sha(bytes) }; }
async function load(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function cleanup(fixture) { await rm(fixture.directory, { recursive: true, force: true }); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
