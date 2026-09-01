import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildAdapterTestInputBundle } from './build-canvas06-common-visual-adapter-test-input.mjs';
import { verifyAdapterTestInputBundle } from './verify-canvas06-common-visual-adapter-test-input.mjs';
import { runCommonVisualMaterialization } from './canvas06-common-visual-materialization.mjs';

const ROOT = resolve('.');
const HANDOFF = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const PROFILE = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
const JAVA_21 = '/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home/bin/java';
const INTAKE = resolve('scripts/release-canvas06-intake.mjs');
const RUNTIME_JAR = resolve('services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar');

test('Adapter Test Input Builder closes 341 files with an explicit Java 21 despite parent JAVA_HOME', async () => {
  const fixture = await readyFixture();
  const parentJavaHome = process.env.JAVA_HOME;
  try {
    process.env.JAVA_HOME = '/invalid/parent-jdk';
    await buildAdapterTestInputBundle(fixture.args());
    assert.equal(await countFiles(fixture.outputRoot), 341);
    const request = JSON.parse(await readFile(resolve(fixture.outputRoot, 'adapter-request.json'), 'utf8'));
    assert.equal(request.runtime_jar_ref.kind, 'LOCAL_RUNTIME_JAR');
    assert.equal(request.java_executable_ref.path, JAVA_21);
    await verifyAdapterTestInputBundle({ sourceRoot: fixture.sourceRoot, handoffRoot: fixture.handoffRoot, intakeReport: 'intake.json', bundleRoot: fixture.outputRoot });
  } finally {
    if (parentJavaHome === undefined) delete process.env.JAVA_HOME;
    else process.env.JAVA_HOME = parentJavaHome;
    await fixture.cleanup();
  }
});

test('Adapter Test Input Builder rejects a non-Java-21 executable before creating output', async () => {
  const fixture = await readyFixture();
  try {
    await assert.rejects(() => buildAdapterTestInputBundle(fixture.args({ javaExecutable: '/usr/bin/java' })), error => {
      assert.equal(error.code, 'GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID');
      assert.equal(error.exitCode, 2);
      return true;
    });
    await assert.rejects(() => readFile(fixture.outputRoot), { code: 'ENOENT' });
  } finally { await fixture.cleanup(); }
});

test('Adapter Test Input Verifier rejects a tampered observed result', async () => {
  const fixture = await readyFixture();
  try {
    await buildAdapterTestInputBundle(fixture.args());
    const observed = resolve(fixture.outputRoot, 'callback-results/000/attempt-1/observed-result.json');
    await writeFile(observed, `${await readFile(observed, 'utf8')} `);
    await assert.rejects(() => verifyAdapterTestInputBundle({ sourceRoot: fixture.sourceRoot, handoffRoot: fixture.handoffRoot, intakeReport: 'intake.json', bundleRoot: fixture.outputRoot }), error => {
      assert.equal(error.code, 'GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH');
      assert.equal(error.exitCode, 3);
      return true;
    });
  } finally { await fixture.cleanup(); }
});

test('03C adapter通过Bundle固定callback严格串行物化8个base和144个attempt', { timeout: 900000 }, async () => {
  const fixture = await readyFixture();
  try {
    await buildAdapterTestInputBundle(fixture.args());
    const request = JSON.parse(await readFile(resolve(fixture.outputRoot, 'adapter-request.json'), 'utf8'));
    const bundle = JSON.parse(await readFile(resolve(fixture.outputRoot, 'adapter-test-input-bundle.json'), 'utf8'));
    const callback = await fixedBundleCallback(fixture.outputRoot, bundle, request);
    let result;
    try { result = await runCommonVisualMaterialization(request, callback); }
    catch (error) {
      if (callback.failure()) throw callback.failure();
      throw error;
    }
    assert.equal(result.summary.base_count, 8);
    assert.equal(result.summary.attempt_count, 144);
    assert.equal(callback.callCount(), 144);
  } finally { await fixture.cleanup(); }
});

async function readyFixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-adapter-input-'));
  const root = await import('node:fs/promises').then(({ realpath }) => realpath(directory));
  const sourceRoot = resolve(root, 'source'); const handoffRoot = resolve(root, 'handoff'); const outputRoot = resolve(root, 'output');
  await cp(HANDOFF, handoffRoot, { recursive: true });
  await mkdir(resolve(sourceRoot, 'packages/profiles/profile.iso19450.2024.draft'), { recursive: true });
  await cp(PROFILE, resolve(sourceRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0'), { recursive: true });
  await mkdir(resolve(sourceRoot, 'scripts'), { recursive: true });
  await cp(resolve(ROOT, 'scripts/build-canvas06-common-visual-adapter-test-input.mjs'), resolve(sourceRoot, 'scripts/build-canvas06-common-visual-adapter-test-input.mjs'));
  await cp(resolve(ROOT, 'scripts/verify-canvas06-common-visual-adapter-test-input.mjs'), resolve(sourceRoot, 'scripts/verify-canvas06-common-visual-adapter-test-input.mjs'));
  await mkdir(resolve(sourceRoot, 'apps/web/dist'), { recursive: true });
  await writeFile(resolve(sourceRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(resolve(sourceRoot, 'apps/web/dist/index.html'), '<!doctype html>\n');
  git(sourceRoot, ['init']); git(sourceRoot, ['config', 'user.email', 'test@example.invalid']); git(sourceRoot, ['config', 'user.name', 'test']); git(sourceRoot, ['add', '-f', '.']); git(sourceRoot, ['commit', '-m', 'fixture']);
  const handoffPath = resolve(handoffRoot, 'dev-canvas-05-handoff.json');
  const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  const runtimeJar = handoff.build_artifacts.find(item => item.kind === 'LOCAL_RUNTIME_JAR')?.path;
  assert.ok(runtimeJar, 'READY Handoff must contain LOCAL_RUNTIME_JAR');
  const runtimeTarget = resolve(handoffRoot, runtimeJar);
  await cp(RUNTIME_JAR, runtimeTarget, { force: true });
  const runtimeInfo = await stat(runtimeTarget);
  const runtimeSha256 = execFileSync('shasum', ['-a', '256', runtimeTarget], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  const runtimeRef = handoff.build_artifacts.find(item => item.kind === 'LOCAL_RUNTIME_JAR');
  runtimeRef.byte_length = runtimeInfo.size;
  runtimeRef.sha256 = runtimeSha256;
  handoff.source_build.source_commit = git(sourceRoot, ['rev-parse', 'HEAD']);
  await writeFile(handoffPath, JSON.stringify(handoff));
  await refreshIntake(handoffRoot);
  return {
    sourceRoot, handoffRoot, outputRoot, runtimeJar,
    args({ javaExecutable = JAVA_21 } = {}) { return ['--source-root', sourceRoot, '--handoff-root', handoffRoot, '--intake-report', 'intake.json', '--java-executable', javaExecutable, '--runtime-jar', runtimeJar, '--change-id', 'GOLDEN-CANVAS06-20260828-001', '--source-date-epoch', '1782864000', '--output-root', outputRoot]; },
    async cleanup() { await rm(root, { recursive: true, force: true }); }
  };
}

async function fixedBundleCallback(root, bundle, request) {
  let index = 0;
  let failure;
  const descriptors = bundle.callback_observed_results;
  return Object.assign(async invocation => {
    try {
    const descriptor = descriptors[index];
    assert.ok(descriptor, 'callback invocation exceeds Bundle descriptor count');
    assert.equal(invocation.request_id, request.request_id);
    assert.deepEqual(invocation.plan_ref, request.plan_ref);
    assert.equal(invocation.common_capture_ordinal, descriptor.common_capture_ordinal);
    assert.equal(invocation.capture_id, descriptor.capture_id);
    assert.equal(invocation.subject_id, descriptor.subject_id);
    assert.equal(invocation.attempt_ordinal, descriptor.attempt_ordinal);
    const observedBytes = await readFile(resolve(root, descriptor.observed_result_ref.path));
    const pngBytes = await readFile(resolve(root, descriptor.png_ref.path));
    assert.equal(observedBytes.length, descriptor.observed_result_ref.byte_length);
    assert.equal(pngBytes.length, descriptor.png_ref.byte_length);
    assert.equal(sha256(observedBytes), descriptor.observed_result_ref.sha256);
    assert.equal(sha256(pngBytes), descriptor.png_ref.sha256);
    index += 1;
    return JSON.parse(observedBytes.toString('utf8'));
    } catch (error) { failure = error; throw error; }
  }, { callCount: () => index, failure: () => failure });
}

async function refreshIntake(handoffRoot) {
  const handoff = resolve(handoffRoot, 'dev-canvas-05-handoff.json');
  const digest = execFileSync('shasum', ['-a', '256', handoff], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  const result = spawnSync(process.execPath, [INTAKE, '--handoff-root', handoffRoot, '--handoff', 'dev-canvas-05-handoff.json', '--handoff-sha256', digest, '--out', resolve(handoffRoot, 'intake.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

async function countFiles(root) {
  let count = 0;
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(resolve(path, entry.name));
      else count += 1;
    }
  }
  await walk(root);
  return count;
}

function git(cwd, args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
