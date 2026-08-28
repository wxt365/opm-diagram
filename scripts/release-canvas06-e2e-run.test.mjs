import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import {
  buildRuntimeLaunchCommand,
  faultLauncherReadyLine,
  prepareControlledAttempt,
  prepareCaseFaultLaunches,
  prepareCaseFaultPlans,
  removeFaultChallenge,
  waitForFaultLauncherReady
} from './release-canvas06-e2e-run.mjs';

const CASE_ID = 'E2E-CANVAS-007.ASSET_MISSING';

test('writes and reads back both frozen attempt Fault Plans before a later producer can run', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-plan-'));
  const result = await prepareCaseFaultPlans({
    reportRoot: root,
    manifest: manifest(CASE_ID),
    caseId: CASE_ID,
    nonces: { 1: 'a'.repeat(64), 2: 'b'.repeat(64) }
  });

  assert.equal(result.fault_plan_refs.length, 2);
  for (const [index, ref] of result.fault_plan_refs.entries()) {
    const plan = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
    assert.equal(plan.attempt_ordinal, index + 1);
    assert.equal(plan.fault_kind, 'ASSET_MISSING');
    assert.equal(plan.target, 'SYMBOL_CATALOG_ASSET');
    assert.equal(plan.trigger_count, 1);
  }
  await assert.rejects(
    () => readFile(resolve(root, 'attempts', CASE_ID, '1', 'fixture-materialization.json')),
    { code: 'ENOENT' }
  );
});

test('rejects a duplicate Fault Plan without altering the published bytes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-plan-duplicate-'));
  const input = { reportRoot: root, manifest: manifest(CASE_ID), caseId: CASE_ID, nonces: { 1: 'c'.repeat(64), 2: 'd'.repeat(64) } };
  const first = await prepareCaseFaultPlans(input);
  const before = await Promise.all(first.fault_plan_refs.map(ref => readFile(resolve(root, ref.path))));
  await assert.rejects(() => prepareCaseFaultPlans(input), error => error.code === 'E2E_INPUT_INVALID');
  const after = await Promise.all(first.fault_plan_refs.map(ref => readFile(resolve(root, ref.path))));
  assert.deepEqual(after, before);
});

test('rejects a non-unique Manifest schedule before creating an attempt root', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-plan-schedule-'));
  await assert.rejects(
    () => prepareCaseFaultPlans({ reportRoot: root, manifest: manifest(CASE_ID, CASE_ID), caseId: CASE_ID }),
    error => error.code === 'E2E_RUN_CASE_SET_INVALID'
  );
  await assert.rejects(() => readFile(resolve(root, 'attempts', CASE_ID, '1', 'fault-plan.json')), { code: 'ENOENT' });
});

test('rejects a post-write Fault Plan mutation during immediate readback', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-plan-readback-'));
  await assert.rejects(
    () => prepareCaseFaultPlans({
      reportRoot: root,
      manifest: manifest(CASE_ID),
      caseId: CASE_ID,
      nonces: { 1: 'e'.repeat(64), 2: 'f'.repeat(64) },
      write: async input => {
        const ref = await writeFaultPlan(input);
        await writeFile(resolve(root, ref.path), '{"tampered":true}\n');
        return ref;
      }
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('rejects a Fault Plan writer reference whose raw SHA does not match the published file', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-plan-ref-'));
  await assert.rejects(
    () => prepareCaseFaultPlans({
      reportRoot: root,
      manifest: manifest(CASE_ID),
      caseId: CASE_ID,
      write: async input => ({ ...(await writeFaultPlan(input)), sha256: '0'.repeat(64) })
    }),
    error => error.code === 'E2E_INPUT_INVALID'
  );
});

test('generates isolated raw challenges and exact fault INITIAL command arguments', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-fault-launch-'));
  const root = resolve(workspace, 'report');
  const controlParent = resolve(workspace, 'control-parent');
  await mkdir(root);
  await mkdir(controlParent);
  const bytes = [0x11, 0x12, 0x13, 0x14];
  const prepared = await prepareCaseFaultLaunches({
    reportRoot: root,
    manifest: manifest(CASE_ID),
    caseId: CASE_ID,
    processControlParent: controlParent,
    random: () => Buffer.alloc(32, bytes.shift())
  });

  assert.equal(prepared.launches.length, 2);
  assert.equal((await lstat(prepared.process_control_root)).mode & 0o777, 0o700);
  const launch = prepared.launches[0];
  const challenge = await readFile(launch.challenge_path);
  assert.deepEqual(challenge, Buffer.alloc(32, 0x12));
  assert.equal((await lstat(launch.challenge_path)).mode & 0o777, 0o600);
  const plan = JSON.parse(await readFile(resolve(root, launch.fault_plan_ref.path), 'utf8'));
  assert.equal(plan.nonce, '11'.repeat(32));
  assert.equal(launch.challenge_response, createHmac('sha256', Buffer.alloc(32, 0x11))
    .update(Buffer.from('OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001\0', 'ascii'))
    .update(challenge)
    .update(Buffer.from(launch.plan_raw_sha256, 'hex'))
    .digest('hex'));

  const attemptRoot = dirname(resolve(root, launch.fault_plan_ref.path));
  const fault = buildRuntimeLaunchCommand({
    javaPath: resolve(root, 'jdk/bin/java'),
    attemptRoot,
    runtimePort: 17850,
    caseId: CASE_ID,
    attemptOrdinal: 1,
    cycle: 'INITIAL',
    faultLaunch: launch
  });
  assert.equal(fault.mode, 'FAULT_INITIAL');
  assert.deepEqual(fault.command.slice(0, 6), [
    resolve(root, 'jdk/bin/java'), '-jar', resolve(attemptRoot, 'inputs/build/local-runtime.jar'),
    '--spring.profiles.active=release-e2e-fault', '--server.address=127.0.0.1', '--server.port=17850'
  ]);
  assert.equal(fault.command.filter(value => value.startsWith('--opm.release.e2e.')).length, 9);
  assert.ok(fault.command.includes(`--opm.release.e2e.plan=${resolve(attemptRoot, 'fault-plan.json')}`));

  const reopen = buildRuntimeLaunchCommand({
    javaPath: resolve(root, 'jdk/bin/java'), attemptRoot, runtimePort: 17850,
    caseId: CASE_ID, attemptOrdinal: 1, cycle: 'REOPEN'
  });
  assert.equal(reopen.mode, 'NORMAL');
  assert.equal(reopen.command.some(value => value.includes('release-e2e-fault') || value.startsWith('--opm.release.e2e.')), false);
  await removeFaultChallenge({ challengePath: launch.challenge_path, processControlRoot: prepared.process_control_root });
  await assert.rejects(() => lstat(launch.challenge_path), { code: 'ENOENT' });
});

test('does not arm a fault outside the frozen INITIAL set and cleans control material on handshake generation failure', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-fault-reject-'));
  const root = resolve(workspace, 'report');
  const controlParent = resolve(workspace, 'control-parent');
  await mkdir(root);
  await mkdir(controlParent);
  await assert.rejects(
    () => prepareCaseFaultLaunches({ reportRoot: root, manifest: manifest('E2E-CANVAS-007.TEXT_BLOCKED'), caseId: 'E2E-CANVAS-007.TEXT_BLOCKED', processControlParent: controlParent }),
    error => error.code === 'E2E_RUN_CASE_SET_INVALID'
  );
  await assert.rejects(
    () => prepareCaseFaultLaunches({ reportRoot: root, manifest: manifest(CASE_ID), caseId: CASE_ID, processControlParent: controlParent, random: () => Buffer.alloc(32, 7) }),
    error => error.code === 'E2E_RUN_RUNTIME_PROTOCOL_INVALID'
  );
  assert.throws(
    () => buildRuntimeLaunchCommand({ javaPath: resolve(root, 'jdk/bin/java'), attemptRoot: resolve(root, 'attempt'), runtimePort: 17850, caseId: CASE_ID, attemptOrdinal: 1, cycle: 'REOPEN', faultLaunch: {} }),
    error => error.code === 'E2E_RUN_ARGUMENT_INVALID'
  );
});

test('permits browser work only after the exact fault launcher READY line', async () => {
  const launch = {
    case_id: CASE_ID,
    attempt_ordinal: 1,
    plan_raw_sha256: 'a'.repeat(64)
  };
  const child = fakeChild();
  const ready = waitForFaultLauncherReady({ child, faultLaunch: launch, timeoutMs: 1000 });
  child.stdout.write('Spring startup noise\n');
  child.stdout.write(`${faultLauncherReadyLine({ caseId: CASE_ID, attemptOrdinal: 1, planRawSha256: 'a'.repeat(64) })}\n`);
  assert.equal(await ready, 'E2E_FAULT_LAUNCHER_READY\tE2E-CANVAS-007.ASSET_MISSING\t1\t' + 'a'.repeat(64));

  const wrong = fakeChild();
  const rejected = waitForFaultLauncherReady({ child: wrong, faultLaunch: launch, timeoutMs: 1000 });
  wrong.stdout.write('E2E_FAULT_LAUNCHER_READY\tE2E-CANVAS-007.ASSET_MISSING\t2\t' + 'a'.repeat(64) + '\n');
  await assert.rejects(rejected, error => error.code === 'E2E_RUN_RUNTIME_PROTOCOL_INVALID');

  const exited = fakeChild();
  const beforeReady = waitForFaultLauncherReady({ child: exited, faultLaunch: launch, timeoutMs: 1000 });
  exited.emit('exit', 2, null);
  await assert.rejects(beforeReady, error => error.code === 'E2E_RUN_RUNTIME_PROTOCOL_INVALID');
});

test('prepares an exact Common attempt from the controlled bundle and active Manifest only once', async () => {
  const fixture = await createControlledAttemptFixture();
  const caseEntry = fixture.manifest.cases.find(entry => entry.case_id === 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES');
  const input = {
    controlled_bundle_root: fixture.bundleRoot,
    manifest_root: fixture.manifestRoot,
    manifest_path: 'manifest.json',
    profile_asset_root: resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets'),
    report_staging_root: fixture.reportRoot,
    case_entry: caseEntry,
    attempt_ordinal: 1,
    java_executable: '/controlled/java',
    browser_executable: '/controlled/chromium',
    runtime_port: 17850,
    web_port: 5176
  };
  const prepared = await prepareControlledAttempt(input);

  assert.equal(prepared.attempt_root, resolve(fixture.reportRoot, 'attempts', caseEntry.case_id, '1'));
  assert.equal(prepared.runtime_jar, resolve(prepared.attempt_root, 'inputs/build/local-runtime.jar'));
  assert.equal(prepared.web_dist, resolve(prepared.attempt_root, 'inputs/build/web-dist'));
  assert.equal(prepared.profile_assets, resolve(prepared.attempt_root, 'profile/assets'));
  assert.equal(prepared.driver_source, resolve(prepared.attempt_root, 'inputs/drivers/common-driver.mjs'));
  assert.deepEqual(await readFile(prepared.runtime_jar), await readFile(resolve(fixture.manifestRoot, fixture.manifest.source_build.local_runtime_jar.path)));
  assert.deepEqual(await readFile(prepared.driver_source), await readFile(resolve(fixture.manifestRoot, 'inputs/drivers/common-driver.mjs')));
  assert.equal((await lstat(resolve(prepared.profile_assets, 'profile.json'))).nlink, 1);
  await assert.rejects(() => prepareControlledAttempt(input), error => error.code === 'E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH');
});

test('rejects a controlled-bundle trust mismatch before creating an attempt output', async () => {
  const fixture = await createControlledAttemptFixture();
  const caseEntry = fixture.manifest.cases.find(entry => entry.case_id === 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES');
  await writeFile(resolve(fixture.bundleRoot, 'controlled-bundle.json'), '{"tampered":true}\n');
  await assert.rejects(
    () => prepareControlledAttempt({
      controlled_bundle_root: fixture.bundleRoot,
      manifest_root: fixture.manifestRoot,
      manifest_path: 'manifest.json',
      profile_asset_root: resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets'),
      report_staging_root: fixture.reportRoot,
      case_entry: caseEntry,
      attempt_ordinal: 1,
      java_executable: '/controlled/java',
      browser_executable: '/controlled/chromium',
      runtime_port: 17850,
      web_port: 5176
    }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
  assert.deepEqual(await readdir(fixture.reportRoot), []);
});

function manifest(...caseIds) {
  return { cases: caseIds.map(case_id => ({ case_id, suite_id: 'E2E-CANVAS-007' })) };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  return child;
}

async function createControlledAttemptFixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-controlled-attempt-'));
  const sourceRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d');
  const manifestRoot = resolve(root, 'manifest');
  const reportRoot = resolve(root, 'report');
  await mkdir(manifestRoot, { recursive: true });
  await mkdir(reportRoot);
  const manifest = JSON.parse(await readFile(resolve(sourceRoot, 'dev-canvas-06-e2e-manifest.json'), 'utf8'));
  await copyRequiredManifestInputs({ sourceRoot, manifestRoot, manifest });
  manifest.schema_version = '0.2';
  manifest.manifest_version = '0.2.0';
  manifest.generated_at = '2026-07-01T00:00:00Z';
  manifest.generator_identity = { ...manifest.generator_identity, runner_version: '0.2.0' };
  manifest.driver_catalog = await writeFourDrivers(manifestRoot);
  await refreshProfileReferences(manifestRoot, manifest);
  await writeFile(resolve(manifestRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  return { manifestRoot, reportRoot, bundleRoot: await createControlledBundle({ root, manifestRoot, manifest }), manifest };
}

async function copyRequiredManifestInputs({ sourceRoot, manifestRoot, manifest }) {
  await cp(resolve(sourceRoot, manifest.source_build.local_runtime_jar.path), resolve(manifestRoot, manifest.source_build.local_runtime_jar.path));
  await cp(resolve(sourceRoot, manifest.source_build.web_dist.path), resolve(manifestRoot, manifest.source_build.web_dist.path), { recursive: true });
  for (const reference of [manifest.intake_report_ref, manifest.handoff_ref, manifest.input_materialization.bundle_ref]) {
    const target = resolve(manifestRoot, reference.path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(sourceRoot, reference.path), target);
  }
  const profileSource = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
  await cp(profileSource, resolve(manifestRoot, 'inputs/upstream/profile-assets'), { recursive: true, filter: path => !path.includes('/handoff/') && !path.includes('/golden/') });
}

async function refreshProfileReferences(manifestRoot, manifest) {
  const prefix = 'inputs/upstream/profile-assets';
  const refs = [];
  for (const [kind, path] of [
    ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'],
    ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'],
    ['PROFILE_PACKAGE', 'profile.json'],
    ['RULE_SET', 'rules/representative-rule-set.json'],
    ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
  ]) {
    const bytes = await readFile(resolve(manifestRoot, prefix, path));
    refs.push({ kind, path: `${prefix}/${path}`, byte_length: bytes.length, sha256: digest(bytes) });
  }
  manifest.profile_asset_refs = refs;
  manifest.profile_asset_tree_ref = {
    kind: 'PROFILE_ASSET_TREE', path: prefix,
    byte_length: refs.reduce((total, ref) => total + ref.byte_length, 0),
    sha256: digest(Buffer.from(canonicalizeJcs({
      schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: prefix, entries: refs
    }), 'utf8'))
  };
}

async function writeFourDrivers(manifestRoot) {
  const drivers = [];
  for (const [driver_id, filename] of [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'],
    ['DRIVER-CONTROL', 'control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs'],
    ['DRIVER-COMMON', 'common-driver.mjs']
  ]) {
    const bytes = await readFile(resolve('tests/e2e/release/dev-canvas-06/drivers', filename));
    const path = `inputs/drivers/${filename}`;
    await mkdir(resolve(manifestRoot, 'inputs/drivers'), { recursive: true });
    await writeFile(resolve(manifestRoot, path), bytes);
    drivers.push({ driver_id, source_ref: { kind: 'E2E_DRIVER_SOURCE', path, byte_length: bytes.length, sha256: digest(bytes) } });
  }
  return drivers;
}

async function createControlledBundle({ root, manifestRoot, manifest }) {
  const staging = resolve(root, 'bundle-staging');
  await mkdir(staging);
  const refs = {};
  for (const [field, source] of [
    ['handoff_ref', manifest.handoff_ref],
    ['intake_report_ref', manifest.intake_report_ref],
    ['evidence_bundle_ref', manifest.input_materialization.bundle_ref]
  ]) {
    const path = `raw/${field}.bin`;
    const bytes = await readFile(resolve(manifestRoot, source.path));
    await mkdir(dirname(resolve(staging, path)), { recursive: true });
    await writeFile(resolve(staging, path), bytes);
    refs[field] = { kind: source.kind, path, byte_length: bytes.length, sha256: digest(bytes) };
  }
  const identity = digest(Buffer.from(canonicalizeJcs({ bundle_class: 'CONTROLLED_TEST', ...refs, approved_version_ref: null }), 'utf8'));
  const bundleRoot = resolve(root, `canvas06-controlled-${identity}`);
  await cp(staging, bundleRoot, { recursive: true });
  await writeFile(resolve(bundleRoot, 'controlled-bundle.json'), JSON.stringify({
    schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: '0.1', bundle_class: 'CONTROLLED_TEST',
    bundle_id: `canvas06-controlled-${identity}`, bundle_identity_sha256: identity, ...refs, approved_version_ref: null
  }));
  return bundleRoot;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
