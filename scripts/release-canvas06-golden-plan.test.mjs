import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const root = resolve('.');
const originalHandoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const planner = resolve('scripts/release-canvas06-golden-plan.mjs');
const intake = resolve('scripts/release-canvas06-intake.mjs');
const commonBuilder = resolve('scripts/build-canvas06-common-visual-fixtures.mjs');

test('Planner creates a deterministic 1242/9 Plan without reading PNG', async () => {
  const fixture = await readyFixture();
  try {
    const first = resolve(fixture.workRoot, 'GOLDEN-CANVAS06-20260731-001/first.json');
    const second = resolve(fixture.workRoot, 'GOLDEN-CANVAS06-20260731-002/second.json');
    const firstRun = run(fixture, first, 'GOLDEN-CANVAS06-20260731-001');
    assert.equal(firstRun.status, 0, firstRun.stderr);
    const plan = JSON.parse(await readFile(first, 'utf8'));
    assert.equal(plan.captures.length, 1242);
    assert.equal(plan.blank_baselines.length, 9);
    assert.equal(plan.captures.filter(item => item.capture_kind === 'FAMILY').length, 1170);
    const common = plan.captures.filter(item => item.capture_kind === 'COMMON');
    assert.equal(common.length, 72);
    const commonFixture = JSON.parse(await readFile(resolve(fixture.sourceRoot, 'active-common/visual/STATE_ROLES.json'), 'utf8'));
    assert.equal(common[0].expected_projection_sha256, sha256Jcs(commonFixture.expected_projection));
    assert.equal(common[0].expected_cells, commonFixture.expected_projection.committed_cells.length + commonFixture.expected_projection.transient_cells.length);
    assert.equal(plan.captures.some(item => 'golden_ref' in item), false);
    const secondRun = run(fixture, second, 'GOLDEN-CANVAS06-20260731-002');
    assert.equal(secondRun.status, 0, secondRun.stderr);
    const secondPlan = JSON.parse(await readFile(second, 'utf8'));
    assert.deepEqual({ ...plan, plan_id: secondPlan.plan_id, change_id: secondPlan.change_id }, secondPlan);
  } finally { await fixture.cleanup(); }
});

test('Planner rejects the old bundle, dirty source, and golden-like options with zero output', async () => {
  const fixture = await readyFixture();
  try {
    const oldBundle = resolve(fixture.handoffRoot, 'release/dev-canvas-05-evidence-bundle.jar');
    const handoffPath = resolve(fixture.handoffRoot, 'dev-canvas-05-handoff.json');
    const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
    await cp(resolve(originalHandoffRoot, 'release/dev-canvas-05-evidence-bundle.jar'), oldBundle, { force: true });
    await updateBundleRef(handoff, oldBundle, fixture.handoffRoot);
    await writeFile(handoffPath, JSON.stringify(handoff));
    await refreshIntake(fixture.handoffRoot);
    const blocked = resolve(fixture.workRoot, 'blocked.json');
    const missing = run(fixture, blocked, 'GOLDEN-CANVAS06-20260731-003');
    assert.equal(missing.status, 3);
    assert.match(missing.stderr, /GOLDEN_UPSTREAM_REF_MISMATCH/);
    await writeFile(resolve(fixture.sourceRoot, 'dirty.txt'), 'dirty');
    const dirty = run(fixture, resolve(fixture.workRoot, 'dirty.json'), 'GOLDEN-CANVAS06-20260731-004');
    assert.equal(dirty.status, 3);
    assert.match(dirty.stderr, /GOLDEN_SOURCE_BUILD_DIRTY/);
    const forbidden = spawnSync(process.execPath, [planner, '--golden-root', 'approved'], { cwd: root, encoding: 'utf8' });
    assert.equal(forbidden.status, 2);
    assert.equal(await exists(resolve(fixture.workRoot, 'blocked.json')), false);
  } finally { await fixture.cleanup(); }
});

test('Planner rejects a non-Java-21 archive tool with zero output', async () => {
  const fixture = await readyFixture();
  try {
    const out = resolve(fixture.workRoot, 'GOLDEN-CANVAS06-20260731-005/blocked.json');
    const blocked = run(fixture, out, 'GOLDEN-CANVAS06-20260731-005', { ...process.env, JAVA_HOME: resolve(fixture.workRoot, 'not-a-jdk') });
    assert.equal(blocked.status, 3);
    assert.match(blocked.stderr, /GOLDEN_INPUT_MATERIALIZATION_FAILED/);
    assert.equal(await exists(out), false);
  } finally { await fixture.cleanup(); }
});

async function readyFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-plan-'));
  const handoffRoot = resolve(directory, 'handoff'); const sourceRoot = resolve(directory, 'source'); const workRoot = resolve(directory, 'work');
  await cp(originalHandoffRoot, handoffRoot, { recursive: true });
  await cp(resolve(root, 'tests/e2e/release/dev-canvas-06/fixtures'), resolve(sourceRoot, 'tests/e2e/release/dev-canvas-06/fixtures'), { recursive: true });
  await buildCommonFixtureRoot(handoffRoot, resolve(sourceRoot, 'active-common'));
  await mkdir(resolve(sourceRoot, 'apps/web/dist'), { recursive: true });
  await writeFile(resolve(sourceRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(resolve(sourceRoot, 'apps/web/dist/index.html'), '<!doctype html><title>release</title>\n');
  git(sourceRoot, ['init']); git(sourceRoot, ['config', 'user.email', 'test@example.invalid']); git(sourceRoot, ['config', 'user.name', 'test']); git(sourceRoot, ['add', '.']); git(sourceRoot, ['commit', '-m', 'fixture']);
  const handoffPath = resolve(handoffRoot, 'dev-canvas-05-handoff.json'); const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  handoff.source_build.source_commit = git(sourceRoot, ['rev-parse', 'HEAD']);
  await writeFile(handoffPath, JSON.stringify(handoff));
  await refreshIntake(handoffRoot);
  const runtimeJar = handoff.build_artifacts.find(item => item.kind === 'LOCAL_RUNTIME_JAR')?.path;
  assert.ok(runtimeJar, 'READY Handoff must reference LOCAL_RUNTIME_JAR');
  return { handoffRoot, sourceRoot, workRoot, runtimeJar, async cleanup() { await rm(directory, { recursive: true, force: true }); } };
}

async function refreshIntake(handoffRoot) {
  const handoff = resolve(handoffRoot, 'dev-canvas-05-handoff.json'); const out = resolve(handoffRoot, 'intake.json'); const digest = sha(await readFile(handoff));
  const result = spawnSync(process.execPath, [intake, '--handoff-root', handoffRoot, '--handoff', 'dev-canvas-05-handoff.json', '--handoff-sha256', digest, '--out', out], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function run(fixture, out, changeId, env = process.env) { return spawnSync(process.execPath, [planner, '--handoff-root', fixture.handoffRoot, '--intake-report', 'intake.json', '--source-root', fixture.sourceRoot, '--common-fixture-catalog', 'active-common/dev-canvas-06-common-fixture-catalog.json', '--runtime-jar', fixture.runtimeJar, '--work-root', fixture.workRoot, '--change-id', changeId, '--source-date-epoch', '1782864000', '--out', out.slice(fixture.workRoot.length + 1)], { cwd: root, encoding: 'utf8', env }); }
async function buildCommonFixtureRoot(handoffRoot, output) { const result = spawnSync(process.execPath, [commonBuilder, '--handoff', resolve(handoffRoot, 'dev-canvas-05-handoff.json'), '--fixture-root', output, '--source-date-epoch', '1782864000'], { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }
function updateBundleRef(handoff, path, handoffRoot) { const artifact = handoff.build_artifacts.find(item => item.kind === 'EVIDENCE_BUNDLE'); artifact.path = relative(handoffRoot, path); return stat(path).then(info => { artifact.byte_length = info.size; return readFile(path); }).then(bytes => { artifact.sha256 = sha(bytes); }); }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
