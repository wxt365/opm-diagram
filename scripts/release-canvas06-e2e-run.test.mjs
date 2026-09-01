import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmod, cp, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { loadActiveAttemptManifest } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { buildCommonSetupPlan, COMMON_DRIVER_SOURCE_PATH } from './canvas06-e2e-common-setup-plan.mjs';
import {
  buildRuntimeLaunchCommand,
  faultLauncherReadyLine,
  assertControlledInvocationContext,
  runControlledLifecycleSession,
  runFamilyControlledInvocationSession,
  prepareControlledAttempt,
  prepareCaseFaultLaunches,
  prepareCaseFaultPlans,
  removeFaultChallenge,
  waitForFaultLauncherReady,
  writeFamilyControlledInvocationContext,
  loadFamilyControlledInvocationContextFromEnvironment,
  verifyControlledDriverModuleExports,
  buildControlledCaseExecutionCatalog,
  loadControlledCommonSetupPlan,
  loadControlledDriverModule,
  bindFamilySetupAttemptIdentity,
  createFamilyObservationSink,
  buildE2eMaterializerCommand,
  runE2eFixtureMaterializer,
  buildE2eAttemptSnapshotCommand,
  runE2eAttemptSnapshot,
  buildE2eTransactionSnapshotCommand,
  runE2eTransactionSnapshot,
  runFamilySetupAndBindIdentity,
  runCommonSetupAndBindIdentity,
  writeFamilyApiExchangeIndex,
  buildFamilyBrowserEnvironment,
  selectSubjectReceipt,
  selectFamilyCycleFailure,
  expectedSubjectForCase,
  buildAttemptIndexEntries,
  assertProcessControlParent,
  readFamilyProofDiagnostic,
  runReleasePlaywright,
  runCli,
  writeFamilyProofDiagnostic
} from './release-canvas06-e2e-run.mjs';

const CASE_ID = 'E2E-CANVAS-007.ASSET_MISSING';

test('CLI 在参数拒绝时不创建输出或导入副作用', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-cli-'));
  await assert.rejects(() => runCli([], {}), error => error.code === 'E2E_RUN_ARGUMENT_INVALID' && error.exitCode === 2);
  assert.deepEqual(await readdir(root), []);
});

test('process-control parent 必须为空且与 Runner 输入输出隔离', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-process-control-'));
  const isolated = [resolve(root, '..', 'source'), resolve(root, '..', 'manifest'), resolve(root, '..', 'profile'), resolve(root, '..', 'output')];
  assert.equal(await assertProcessControlParent({ parent: root, isolatedFrom: isolated }), root);
  await writeFile(resolve(root, 'residual'), 'x');
  await assert.rejects(() => assertProcessControlParent({ parent: root, isolatedFrom: isolated }), error => error.code === 'E2E_RUN_ARGUMENT_INVALID');
});

test('release Playwright 启动失败时清理受控输出目录', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-playwright-output-'));
  await assert.rejects(() => runReleasePlaywright({ sourceRoot: root, contextRef: {}, outputDir: resolve(root, 'output') }), error => error.code === 'E2E_RUN_ENVIRONMENT_INVALID');
  await assert.rejects(() => lstat(resolve(root, 'output')), { code: 'ENOENT' });
});

test('Family cycle保留primary failure，仅端口未释放可覆盖cleanup failure', () => {
  const primary = Object.freeze({ code: 'E2E_ORCHESTRATION_PROCESS_FAILED', exitCode: 3 });
  const browserProof = Object.freeze({ code: 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', exitCode: 4 });
  const evidence = Object.freeze({ code: 'EVIDENCE_TRANSACTION', exitCode: 4 });
  const port = Object.freeze({ code: 'E2E_ORCHESTRATION_PORT_NOT_RELEASED', exitCode: 4 });
  assert.equal(selectFamilyCycleFailure(null, browserProof), browserProof);
  assert.equal(selectFamilyCycleFailure(primary, browserProof), primary);
  assert.equal(selectFamilyCycleFailure(primary, evidence), primary);
  assert.equal(selectFamilyCycleFailure(primary, port), port);
});

const FAMILY_PROOF_STATE = Object.freeze({
  bound: true, confirmed: true, sentinel_active: true, late_event_detected: false,
  pending_capture_count: 0, pending_capture_error: false, waiter_count: 0, unresolved_network_count: 0,
  reopen_mode: true, subject_before_bound: false, subject_baseline_matches: false, common_mode: true,
  resolved_setup_baseline: false, reopen_expectation_required: true, reopen_verification_state: 4,
  requires_precondition: false, precondition_state: 0, precondition_complete: false
});

test('Family child仅为精确R8 Browser proof错误原子写入canonical诊断', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-family-proof-write-'));
  const outputDir = resolve(root, 'output');
  const error = Object.assign(new Error('proof'), { code: 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', proof_state: FAMILY_PROOF_STATE });
  try {
    await writeFamilyProofDiagnostic({ outputDir, error });
    const path = resolve(outputDir, 'family-proof-diagnostic.json');
    const expected = Buffer.from(`${canonicalizeJcs({ proof_state: FAMILY_PROOF_STATE, schema_id: 'OPM-DEV-CANVAS-06-FAMILY-PROOF-DIAGNOSTIC-001', schema_version: '0.1' })}\n`, 'utf8');
    assert.deepEqual(await readFile(path), expected);
    const proofState = await readFamilyProofDiagnostic(outputDir);
    assert.deepEqual(proofState, FAMILY_PROOF_STATE);
    assert.equal(Object.isFrozen(proofState), true);
    await assert.rejects(
      () => writeFamilyProofDiagnostic({ outputDir: resolve(root, 'wrong-code'), error: Object.assign(new Error('wrong'), { code: 'E2E_ORCHESTRATION_INPUT_INVALID', proof_state: FAMILY_PROOF_STATE }) }),
      TypeError
    );
    await assert.rejects(() => lstat(resolve(root, 'wrong-code')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Family proof诊断在父Runner中严格读取并始终清理受控输出目录', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-family-proof-parent-'));
  const canonical = `${canonicalizeJcs({ proof_state: FAMILY_PROOF_STATE, schema_id: 'OPM-DEV-CANVAS-06-FAMILY-PROOF-DIAGNOSTIC-001', schema_version: '0.1' })}\n`;
  const variants = [
    ['missing', '', undefined],
    ['extra-key', `await writeFile(path, ${JSON.stringify(canonicalizeJcs({ extra: true, proof_state: FAMILY_PROOF_STATE, schema_id: 'OPM-DEV-CANVAS-06-FAMILY-PROOF-DIAGNOSTIC-001', schema_version: '0.1' }) + '\n')});`, undefined],
    ['non-canonical', `await writeFile(path, ${JSON.stringify(JSON.stringify({ schema_id: 'OPM-DEV-CANVAS-06-FAMILY-PROOF-DIAGNOSTIC-001', schema_version: '0.1', proof_state: FAMILY_PROOF_STATE }) + '\n')});`, undefined],
    ['multiple-links', `await writeFile(path, ${JSON.stringify(canonical)}); await link(path, resolve(output, 'family-proof-diagnostic-copy.json'));`, undefined],
    ['wrong-schema', `await writeFile(path, ${JSON.stringify(canonicalizeJcs({ proof_state: FAMILY_PROOF_STATE, schema_id: 'WRONG', schema_version: '0.1' }) + '\n')});`, undefined],
    ['valid', `await writeFile(path, ${JSON.stringify(canonical)});`, FAMILY_PROOF_STATE]
  ];
  try {
    for (const [name, body, expectedProofState] of variants) {
      const sourceRoot = resolve(root, name);
      const cli = resolve(sourceRoot, 'node_modules/@playwright/test/cli.js');
      const outputDir = resolve(sourceRoot, 'controlled-output');
      await mkdir(dirname(cli), { recursive: true });
      await writeFile(resolve(sourceRoot, 'package.json'), '{"type":"module"}\n');
      await writeFile(cli, `import { link, mkdir, writeFile } from 'node:fs/promises';\nimport { resolve } from 'node:path';\nconst output = process.env.PLAYWRIGHT_OUTPUT_DIR;\nconst path = resolve(output, 'family-proof-diagnostic.json');\nawait mkdir(output, { recursive: true });\n${body}\nprocess.exitCode = 1;\n`);
      await assert.rejects(
        () => runReleasePlaywright({ sourceRoot, contextRef: {}, outputDir }),
        error => error.code === 'E2E_UNEXPECTED_RUNTIME_ERROR' && error.exitCode === 3 && assert.deepEqual(error.proof_state, expectedProofState) === undefined
      );
      await assert.rejects(() => lstat(outputDir), { code: 'ENOENT' });
    }
    const successRoot = resolve(root, 'success');
    const successCli = resolve(successRoot, 'node_modules/@playwright/test/cli.js');
    const successOutput = resolve(successRoot, 'controlled-output');
    await mkdir(dirname(successCli), { recursive: true });
    await writeFile(resolve(successRoot, 'package.json'), '{"type":"module"}\n');
    await writeFile(successCli, 'process.exitCode = 0;\n');
    await runReleasePlaywright({ sourceRoot: successRoot, contextRef: {}, outputDir: successOutput });
    await assert.rejects(() => lstat(successOutput), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
  assert.equal(prepared.manifest_root, resolve(prepared.attempt_root, 'inputs/materializer/manifest'));
  assert.equal(prepared.manifest_path, 'manifest.json');
  assert.equal(prepared.fixture, resolve(prepared.manifest_root, caseEntry.fixture_ref.path));
  assert.equal(prepared.input, resolve(prepared.attempt_root, 'inputs/materializer/input.raw'));
  assert.equal(prepared.family_identity_catalog, null);
  assert.equal(prepared.binding, resolve(prepared.attempt_root, 'inputs/materializer/active-binding.json'));
  assert.deepEqual(await readFile(prepared.runtime_jar), await readFile(resolve(fixture.manifestRoot, fixture.manifest.source_build.local_runtime_jar.path)));
  assert.deepEqual(await readFile(prepared.driver_source), await readFile(resolve(fixture.manifestRoot, 'inputs/drivers/common-driver.mjs')));
  assert.deepEqual(await readFile(resolve(prepared.manifest_root, prepared.manifest_path)), await readFile(resolve(fixture.manifestRoot, 'manifest.json')));
  assert.deepEqual(await readFile(prepared.input), await readFile(resolve(fixture.manifestRoot, caseEntry.input_ref.path)));
  assert.notEqual((await lstat(prepared.input)).ino, (await lstat(resolve(prepared.manifest_root, caseEntry.input_ref.path))).ino);
  assert.deepEqual(JSON.parse(await readFile(prepared.binding, 'utf8')), fixture.manifestInput.activeBinding);
  assert.equal((await lstat(resolve(prepared.profile_assets, 'profile.json'))).nlink, 1);
  await assert.rejects(() => prepareControlledAttempt(input), error => error.code === 'E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH');
});

test('Family attempt stages exact Materializer inputs and builds the frozen launcher command', async () => {
  const fixture = await createControlledAttemptFixture();
  const caseEntry = fixture.manifest.cases.find(entry => entry.driver_id === 'DRIVER-PROCEDURAL');
  const prepared = await prepareControlledAttempt({
    controlled_bundle_root: fixture.bundleRoot,
    manifest_root: fixture.manifestRoot,
    manifest_path: 'manifest.json',
    profile_asset_root: resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets'),
    report_staging_root: fixture.reportRoot,
    case_entry: caseEntry,
    attempt_ordinal: 2,
    java_executable: '/controlled/java',
    browser_executable: '/controlled/chromium',
    runtime_port: 17850,
    web_port: 5176
  });
  const catalogRef = fixture.manifest.fixture_refs.find(reference => reference.kind === 'FAMILY_FIXTURE_IDENTITY_CATALOG');
  assert.equal(prepared.family_identity_catalog, resolve(prepared.manifest_root, catalogRef.path));
  assert.equal(prepared.driver_source, resolve(prepared.driver_root, 'procedural-driver.mjs'));
  assert.deepEqual(await readFile(prepared.fixture), await readFile(resolve(fixture.manifestRoot, caseEntry.fixture_ref.path)));
  assert.deepEqual(await readFile(prepared.input), await readFile(resolve(fixture.manifestRoot, caseEntry.input_ref.path)));
  const launch = buildE2eMaterializerCommand({ prepared_attempt: prepared, java_executable: '/controlled/java' });
  assert.equal(launch.cwd, prepared.attempt_root);
  assert.deepEqual(launch.command, [
    '/controlled/java',
    '-Dloader.main=org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli',
    '-cp', 'inputs/build/local-runtime.jar',
    'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--guard', 'RELEASE_E2E_ONLY',
    '--fixture-kind', 'FAMILY',
    '--case-id', caseEntry.case_id,
    '--fixture', prepared.fixture,
    '--family-identity-catalog', prepared.family_identity_catalog,
    '--manifest-root', prepared.manifest_root,
    '--manifest', prepared.manifest_path,
    '--input', prepared.input,
    '--profile-asset-root', prepared.profile_assets,
    '--binding', prepared.binding,
    '--fault-plan', resolve(prepared.attempt_root, 'fault-plan.json'),
    '--storage', prepared.storage,
    '--out', resolve(prepared.attempt_root, 'fixture-materialization.json')
  ]);
});

test('Runner fork Materializer并只接纳canonical v0.2 artifact与materialized identity', async () => {
  const fixture = await createControlledAttemptFixture();
  const caseEntry = fixture.manifest.cases.find(entry => entry.driver_id === 'DRIVER-PROCEDURAL');
  const fakeJava = resolve(fixture.manifestRoot, 'fake-java');
  const prepared = await prepareControlledAttempt({
    controlled_bundle_root: fixture.bundleRoot,
    manifest_root: fixture.manifestRoot,
    manifest_path: 'manifest.json',
    profile_asset_root: resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets'),
    report_staging_root: fixture.reportRoot,
    case_entry: caseEntry,
    attempt_ordinal: 1,
    java_executable: fakeJava,
    browser_executable: '/controlled/chromium',
    runtime_port: 17850,
    web_port: 5176
  });
  await writeFaultPlan({ reportRoot: fixture.reportRoot, caseId: caseEntry.case_id, attemptOrdinal: 1, nonce: 'a'.repeat(64) });
  const fake = await fakeMaterializationArtifact({ prepared, manifestInput: fixture.manifestInput });
  await writeFakeMaterializerExecutable({
    path: fakeJava,
    outputPath: resolve(prepared.attempt_root, 'fixture-materialization.json'),
    baseDatabasePath: resolve(prepared.attempt_root, fake.artifact.storage.project_db_ref.path),
    workingDatabasePath: resolve(prepared.attempt_root, fake.artifact.storage.working_project_db_path),
    artifact: fake.artifact,
    databaseBytes: fake.databaseBytes
  });

  const result = await runE2eFixtureMaterializer({ prepared_attempt: prepared, java_executable: fakeJava });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.artifact));
  assert.deepEqual(result.materialized_identity, {
    case_id: caseEntry.case_id,
    attempt_ordinal: 1,
    project_id: fake.catalogIdentity.project_id,
    model_id: fake.catalogIdentity.model_id,
    context_id: fake.catalogIdentity.context_id,
    materialized_base_revision: fake.catalogIdentity.base_revision
  });
  await assert.rejects(
    () => runE2eFixtureMaterializer({ prepared_attempt: prepared, java_executable: fakeJava }),
    error => error.code === 'E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH' && error.exitCode === 3
  );
});

test('Runner owner 拒绝不完整或错误调度的 Invocation Context', () => {
  const context = {
      controlled_bundle_root_realpath: '/controlled/bundle',
      manifest_root_realpath: '/controlled/manifest',
      profile_asset_root_realpath: '/controlled/manifest/inputs/upstream/profile-assets',
      manifest_ref: { path: 'manifest.json' },
      java_executable_ref: { path: '/controlled/java' },
      browser_executable_ref: { path: '/controlled/chromium' },
      execution_schedule: [{ schedule_id: 'FL-SCH-01', case_id: 'E2E-CANVAS-007.ASSET_MISSING', attempt_ordinal: 1, process_cycle: 'INITIAL', runtime_port: 43101, web_port: 43102 }]
  };
  assert.equal(assertControlledInvocationContext(context, 'FL-SCH-01').case_id, 'E2E-CANVAS-007.ASSET_MISSING');
  assert.throws(() => assertControlledInvocationContext({ execution_schedule: [] }, 'FL-SCH-01'), error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID');
});

test('production Context 原子发布并由Playwright child按唯一环境ref复核194/388', async () => {
  const fixture = await createControlledAttemptFixture();
  const profileRoot = resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets');
  const manifestInput = await loadActiveAttemptManifest({ manifestRoot: fixture.manifestRoot, manifest: 'manifest.json', profileAssetRoot: profileRoot });
  const controlParent = resolve(dirname(fixture.manifestRoot), 'family-control');
  await mkdir(controlParent);
  const sourceSet = await writeRunnerSourceSetFixture(fixture.reportRoot);
  const java = resolve(fixture.manifestRoot, 'jdk/bin/java');
  const browser = resolve(fixture.manifestRoot, 'chromium');
  await mkdir(dirname(java), { recursive: true });
  await writeFile(java, '#!/bin/sh\nprintf \'openjdk version "21.0.7"\\n\' >&2\n');
  await writeFile(resolve(fixture.manifestRoot, 'jdk/release'), 'JAVA_VERSION="21.0.7"\n');
  await writeFile(browser, '#!/bin/sh\nexit 0\n');
  await chmod(java, 0o700);
  await chmod(browser, 0o700);
  const bundleDescriptor = resolve(fixture.bundleRoot, 'controlled-bundle.json');
  const result = await writeFamilyControlledInvocationContext({
    input_mode: 'CONTROLLED_TEST',
    source_root_realpath: resolve('.'),
    input_trust: { mode: 'CONTROLLED_TEST', root_realpath: fixture.bundleRoot, primary_ref: rawRef('CONTROLLED_BUNDLE_DESCRIPTOR', 'controlled-bundle.json', await readFile(bundleDescriptor)) },
    manifest_input: manifestInput,
    report_staging_root_realpath: fixture.reportRoot,
    attempt_parent_realpath: fixture.reportRoot,
    process_control_parent_realpath: controlParent,
    java_executable_ref: rawRef('JAVA_EXECUTABLE', java, await readFile(java)),
    browser_executable_ref: rawRef('BROWSER_EXECUTABLE', browser, await readFile(browser)),
    runner_source_set_ref: sourceSet.ref,
    runner_source_set: sourceSet.value,
    runtime_port: 43101,
    web_port: 43102
  });

  assert.equal(result.context.execution_schedule.length, 388);
  assert.equal(result.context.execution_schedule[0].attempt_ordinal, 1);
  assert.equal(result.context.execution_schedule[1].attempt_ordinal, 2);
  assert.equal((await lstat(result.path)).nlink, 1);
  assert.equal((await lstat(result.path)).mode & 0o777, 0o600);
  const loaded = await loadFamilyControlledInvocationContextFromEnvironment({
    OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: canonicalizeJcs(result.ref)
  });
  assert.deepEqual(loaded, result.context);
  assert.ok(Object.isFrozen(loaded));
  assert.ok(Object.isFrozen(loaded.execution_schedule[0]));
  const javaMirror = resolve(fixture.reportRoot, `inputs/runner/toolchain/java/${result.context.java_executable_ref.sha256}/java`);
  const browserMirror = resolve(fixture.reportRoot, `inputs/runner/toolchain/chromium/${result.context.browser_executable_ref.sha256}/chromium`);
  assert.deepEqual(await readFile(javaMirror), await readFile(java));
  assert.deepEqual(await readFile(browserMirror), await readFile(browser));
  await assert.rejects(
    () => runFamilyControlledInvocationSession({
      invocation_context: loaded,
      cycle_handler: Object.freeze(async () => undefined)
    }),
    error => error.code === 'E2E_ORCHESTRATION_PROCESS_FAILED' && error.exitCode === 3
  );

  const javaMirrorBytes = await readFile(javaMirror);
  await writeFile(javaMirror, 'drift');
  await assert.rejects(
    () => loadFamilyControlledInvocationContextFromEnvironment({ OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: canonicalizeJcs(result.ref) }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' && error.exitCode === 3
  );
  await writeFile(javaMirror, javaMirrorBytes);
  const javaSourceBytes = await readFile(java);
  await writeFile(java, '#!/bin/sh\nprintf \'openjdk version "21.0.8"\\n\' >&2\n');
  await assert.rejects(
    () => loadFamilyControlledInvocationContextFromEnvironment({ OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: canonicalizeJcs(result.ref) }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' && error.exitCode === 3
  );
  await writeFile(java, javaSourceBytes);

  const descriptorBytes = await readFile(bundleDescriptor);
  await writeFile(bundleDescriptor, '{}\n');
  await assert.rejects(
    () => loadFamilyControlledInvocationContextFromEnvironment({ OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: canonicalizeJcs(result.ref) }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' && error.exitCode === 3
  );
  await writeFile(bundleDescriptor, descriptorBytes);

  await assert.rejects(
    () => writeFamilyControlledInvocationContext({
      input_mode: 'CONTROLLED_TEST', source_root_realpath: resolve('.'),
      input_trust: result.context.input_trust, manifest_input: manifestInput,
      report_staging_root_realpath: fixture.reportRoot, attempt_parent_realpath: fixture.reportRoot,
      process_control_parent_realpath: controlParent, java_executable_ref: result.context.java_executable_ref,
      browser_executable_ref: result.context.browser_executable_ref, runner_source_set_ref: sourceSet.ref,
      runner_source_set: sourceSet.value, runtime_port: 43101, web_port: 43102
    }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED' && error.exitCode === 4
  );
});

test('production Context loader拒绝额外环境通道和raw ref漂移', async () => {
  await assert.rejects(
    () => loadFamilyControlledInvocationContextFromEnvironment({
      OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: '{}',
      OPM_CANVAS06_E2E_UNAUTHORISED: 'value'
    }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_INVALID'
  );
  await assert.rejects(
    () => loadFamilyControlledInvocationContextFromEnvironment({
      OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF: '{}',
      PLAYWRIGHT_OUTPUT_DIR: '/controlled/playwright-output'
    }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_INVALID' && error.message === 'Controlled Context environment ref is invalid.'
  );
});

test('Family production bridge拒绝未登记Context和非冻结handler', async () => {
  await assert.rejects(
    () => runFamilyControlledInvocationSession({
      invocation_context: Object.freeze({ execution_schedule: [] }),
      cycle_handler: Object.freeze(async () => undefined)
    }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_INVALID' && error.exitCode === 2
  );
  await assert.rejects(
    () => runFamilyControlledInvocationSession({
      invocation_context: Object.freeze({}),
      cycle_handler: async () => undefined
    }),
    error => error.code === 'E2E_INVOCATION_CONTEXT_INVALID' && error.exitCode === 2
  );
});

test('四Driver导出契约区分Family三导出与Common四导出', async () => {
  const manifestPath = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d/dev-canvas-06-e2e-manifest.json');
  const activeManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const drivers = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs', 33],
    ['DRIVER-CONTROL', 'control-driver.mjs', 35],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs', 110],
    ['DRIVER-COMMON', 'common-driver.mjs', 16]
  ];
  for (const [driverId, filename, expectedCount] of drivers) {
    const module = await import(new URL(`../tests/e2e/release/dev-canvas-06/drivers/${filename}`, import.meta.url));
    const verified = verifyControlledDriverModuleExports({ module, driver_id: driverId, manifest: activeManifest });
    assert.equal(verified.driver_id, driverId);
    assert.equal(verified.case_ids.length, expectedCount);
    assert.equal(typeof verified.execute_case, 'function');
    assert.ok(Object.isFrozen(verified));
    assert.ok(Object.isFrozen(verified.case_ids));
  }

  const common = await import(new URL('../tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs', import.meta.url));
  await assert.rejects(
    async () => verifyControlledDriverModuleExports({
      module: { driver: { driver_id: common.COMMON_DRIVER_ID }, case_ids: Object.keys(common.COMMON_CASES), executeCase: common.executeCase },
      driver_id: 'DRIVER-COMMON',
      manifest: activeManifest
    }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID' && error.exitCode === 3
  );
});

test('CaseExecution builder闭合178 Family companion输入与16 Common定义', async () => {
  const manifestRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d');
  const activeManifest = JSON.parse(await readFile(resolve(manifestRoot, 'dev-canvas-06-e2e-manifest.json'), 'utf8'));
  activeManifest.schema_version = '0.2';
  activeManifest.manifest_version = '0.2.0';
  const common = await import(new URL('../tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs', import.meta.url));
  const catalog = await buildControlledCaseExecutionCatalog({
    invocation_context: { manifest_root_realpath: manifestRoot },
    manifest: activeManifest,
    common_cases: common.COMMON_CASES,
    common_setup_plan: await commonSetupPlanFor(manifestRoot, activeManifest)
  });
  assert.equal(catalog.size, 194);
  const family = [...catalog.values()].filter(value => value.manifest_case.driver_id !== 'DRIVER-COMMON');
  const commonExecutions = [...catalog.values()].filter(value => value.manifest_case.driver_id === 'DRIVER-COMMON');
  assert.equal(family.length, 178);
  assert.equal(commonExecutions.length, 16);
  assert.equal(family.filter(value => value.manifest_case.expectation === 'PASS').length, 130);
  assert.equal(family.filter(value => value.manifest_case.expectation === 'BLOCKED').length, 48);
  for (const value of family) {
    assert.ok(Object.isFrozen(value));
    assert.equal(value.companion_pass_requirement.expectation, 'PASS');
    assert.equal(value.companion_pass_requirement.capability_id, value.manifest_case.capability_id);
    assert.equal(value.companion_pass_golden_case.case_id, value.companion_pass_requirement.case_id);
    assert.equal(value.companion_pass_input_fixture.facts.length, 1);
    if (value.manifest_case.expectation === 'PASS') assert.strictEqual(value.companion_pass_input_fixture, value.input_fixture);
  }
  assert.equal(commonExecutions[0].case_id, 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES');
  assert.ok(Object.isFrozen(commonExecutions[0].subject_steps));
});

test('Family bridge仅从完整CaseExecution的manifest_case读取viewport与zoom', async () => {
  const bridge = await readFile(resolve('tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts'), 'utf8');
  assert.match(bridge, /caseEntry\?\.manifest_case\?\.viewport_id/);
  assert.match(bridge, /caseEntry\?\.manifest_case\?\.zoom_id/);
  assert.doesNotMatch(bridge, /caseEntry\?\.viewport_id/);
  assert.doesNotMatch(bridge, /caseEntry\?\.zoom_id/);
});

test('三个Family Driver按冻结UI路径执行130 PASS并为48 BLOCKED构造唯一正式负例', async () => {
  const { manifest: activeManifest, catalog } = await loadActiveCaseExecutionCatalog();
  const modules = new Map(await Promise.all([
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'],
    ['DRIVER-CONTROL', 'control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs']
  ].map(async ([driverId, filename]) => [driverId, await import(new URL(`../tests/e2e/release/dev-canvas-06/drivers/${filename}`, import.meta.url))])));
  const totals = { PASS: 0, BLOCKED: 0 };

  for (const manifestCase of activeManifest.cases.filter(value => value.driver_id !== 'DRIVER-COMMON')) {
    const caseEntry = catalog.get(manifestCase.case_id);
    const harness = createFamilyDriverHarness(caseEntry);
    const control = manifestCase.driver_id === 'DRIVER-CONTROL';
    const identity = freezeValue({
      case_id: manifestCase.case_id, attempt_ordinal: 1,
      project_id: 'project.family', model_id: 'model.family', context_id: caseEntry.family_identity.context_id,
      materialized_base_revision: caseEntry.family_identity.base_revision,
      setup_fact_id: control ? 'fact.runtime.setup' : null,
      subject_baseline_revision: control ? 'revision.runtime.setup' : caseEntry.family_identity.base_revision,
      setup_create_fact_exchange_ref: control ? rawRef('API_RESPONSE_BODY', 'api-exchanges/setup-response.json', Buffer.from('{}')) : null
    });
    const result = await modules.get(manifestCase.driver_id).executeCase({
      page: harness.page, case_entry: caseEntry, attempt_identity: identity,
      observation_sink: harness.sink, precondition_client: harness.client
    });
    assert.equal(result, undefined);
    totals[manifestCase.expectation] += 1;

    if (manifestCase.expectation === 'PASS') {
      assert.equal(harness.requests.length, 0, manifestCase.case_id);
      assert.equal(harness.projectionRefreshCount(), 1, manifestCase.case_id);
      assert.ok(harness.events.some(value => value === `click:testid:p03-relation-option-${manifestCase.capability_id}`
        || value === `click:testid:p03-control-option-${manifestCase.capability_id}`
        || value === 'click:role:button:创建'), manifestCase.case_id);
      if (manifestCase.capability_id === 'CAP-ISO-PROC-015' || manifestCase.capability_id === 'CAP-ISO-PROC-016') {
        assert.ok(harness.events.indexOf('fill:testid:p03-relation-duration') < harness.events.indexOf(`click:testid:p03-relation-option-${manifestCase.capability_id}`), manifestCase.case_id);
      }
      if (manifestCase.driver_id === 'DRIVER-STRUCTURAL') assertStructuralFormEvents({ caseEntry, events: harness.events });
      continue;
    }

    assert.equal(harness.requests.length, 1, manifestCase.case_id);
    assert.equal(harness.recordedReceipts.length, 1, manifestCase.case_id);
    const request = harness.requests[0];
    assert.equal(request.operation_id, 'API-EDT-002');
    assert.equal(request.method, 'POST');
    assert.equal(request.body.base_revision, identity.subject_baseline_revision);
    assert.deepEqual(request.body.binding, bindingGuardFromFixture(caseEntry.input_fixture.profile_binding));
    assert.equal(request.body.command_type, caseEntry.expected_api.command_type);
    assert.equal(request.body.payload.capability_query_id, `query.${manifestCase.case_id}`);
    assert.equal(request.body.payload.selected_option_id, `option.${manifestCase.capability_id}`);
    assert.equal(request.candidate_exchange_ref.path, `api-exchanges/${manifestCase.case_id}.candidate.json`);
    if (request.body.command_type === 'UPDATE_FACT') assert.equal(request.body.payload.fact_id, identity.setup_fact_id);
    if (request.body.command_type === 'CREATE_FACT') assert.equal(Object.hasOwn(request.body.payload, 'fact_id'), false);
  }

  assert.deepEqual(totals, { PASS: 130, BLOCKED: 48 });
});

test('Family Driver拒绝缺失candidate receipt、错误option与可变identity', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED');
  const module = await import(new URL('../tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs', import.meta.url));
  const identity = freezeValue({
    case_id: caseEntry.manifest_case.case_id, attempt_ordinal: 1, project_id: 'project.family', model_id: 'model.family',
    context_id: caseEntry.family_identity.context_id, materialized_base_revision: caseEntry.family_identity.base_revision,
    setup_fact_id: null, subject_baseline_revision: caseEntry.family_identity.base_revision, setup_create_fact_exchange_ref: null
  });
  const missing = createFamilyDriverHarness(caseEntry, { candidateReceipt: null });
  await assert.rejects(
    () => module.executeCase({ page: missing.page, case_entry: caseEntry, attempt_identity: identity, observation_sink: missing.sink, precondition_client: missing.client }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
  const wrong = createFamilyDriverHarness(caseEntry, { optionCapabilityId: 'CAP-ISO-PROC-999' });
  await assert.rejects(
    () => module.executeCase({ page: wrong.page, case_entry: caseEntry, attempt_identity: identity, observation_sink: wrong.sink, precondition_client: wrong.client }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
  const valid = createFamilyDriverHarness(caseEntry);
  await assert.rejects(
    () => module.executeCase({ page: valid.page, case_entry: caseEntry, attempt_identity: { ...identity }, observation_sink: valid.sink, precondition_client: valid.client }),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
});

test('RUN_SETUP binder只用committed_revision、affected_ids与Projection差集形成深冻结identity', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('G-OPL-CTRL-001.CONSUMPTION.PASS');
  const materialized = freezeValue({
    case_id: caseEntry.manifest_case.case_id, attempt_ordinal: 1,
    project_id: caseEntry.family_identity.project_id, model_id: caseEntry.family_identity.model_id,
    context_id: caseEntry.family_identity.context_id, materialized_base_revision: caseEntry.family_identity.base_revision
  });
  const responseRef = rawRef('API_RESPONSE_BODY', 'api-exchanges/setup.response.json', Buffer.from('{}'));
  const requestRef = rawRef('API_REQUEST_BODY', 'api-exchanges/setup.request.json', Buffer.from('{}'));
  const committedRevision = 'revision.runtime.setup';
  const setupFactId = 'fact.runtime.setup';
  const setupFact = caseEntry.input_fixture.facts[0];
  const construct = projectionFact(setupFactId, setupFact, []);
  const setupExchange = freezeValue({
    raw_request: { body: { base_revision: materialized.materialized_base_revision, command_type: 'CREATE_FACT', payload: {} }, body_ref: requestRef },
    actual_request: { body_ref: requestRef },
    response: { status: 200, body: { meta: { status: 'COMMITTED', committed_revision: committedRevision }, data: { affected_ids: ['element.unrelated', setupFactId] } }, body_ref: responseRef },
    exchange_ref: rawRef('API_EXCHANGE', 'api-exchanges/setup.exchange.json', Buffer.from('{}'))
  });
  const setupEntry = freezeValue({
    operation_id: 'API-EDT-002', method: 'POST',
    normalized_url: `/api/v1/projects/${encodeURIComponent(materialized.project_id)}/models/${encodeURIComponent(materialized.model_id)}/contexts/${encodeURIComponent(materialized.context_id)}/commands`,
    request_ref: requestRef, response_ref: responseRef, status: 200, revision: committedRevision
  });
  const preConstructs = caseEntry.base_fixture.facts.map(fact => projectionFact(fact.fact_id, fact, fact.modifiers ?? []));
  const pre = freezeValue({ response: { body: { meta: { read_revision: materialized.materialized_base_revision }, data: { constructs: preConstructs } } } });
  const post = freezeValue({ response: { body: { meta: { read_revision: committedRevision }, data: { constructs: [...preConstructs, construct] } } } });

  const bound = bindFamilySetupAttemptIdentity({ case_execution: caseEntry, materialized_identity: materialized, setup_exchange: setupExchange, setup_exchange_entry: setupEntry, pre_setup_projection: pre, post_setup_projection: post });
  assert.equal(bound.setup_fact_id, setupFactId);
  assert.equal(bound.subject_baseline_revision, committedRevision);
  assert.deepEqual(bound.setup_create_fact_exchange_ref, responseRef);
  assert.ok(Object.isFrozen(bound));
  assert.ok(Object.isFrozen(bound.setup_create_fact_exchange_ref));

  const oldAlias = freezeValue({ ...structuredClone(setupExchange), response: { ...structuredClone(setupExchange.response), body: { meta: { status: 'COMMITTED', revision: committedRevision }, data: { affected_ids: [setupFactId] } } } });
  assert.throws(
    () => bindFamilySetupAttemptIdentity({ case_execution: caseEntry, materialized_identity: materialized, setup_exchange: oldAlias, setup_exchange_entry: setupEntry, pre_setup_projection: pre, post_setup_projection: post }),
    error => error.code === 'E2E_FAMILY_SETUP_IDENTITY_INVALID'
  );
  const ambiguous = freezeValue({ response: { body: { meta: { read_revision: committedRevision }, data: { constructs: [...preConstructs, construct, { ...construct, target_id: 'fact.runtime.second' }] } } } });
  assert.throws(
    () => bindFamilySetupAttemptIdentity({ case_execution: caseEntry, materialized_identity: materialized, setup_exchange: setupExchange, setup_exchange_entry: setupEntry, pre_setup_projection: pre, post_setup_projection: ambiguous }),
    error => error.code === 'E2E_FAMILY_SETUP_IDENTITY_INVALID'
  );
});

test('Runner-owned RUN_SETUP只经attached Page和同一sink绑定Control identity', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('G-OPL-CTRL-001.CONSUMPTION.PASS');
  const materialized = freezeValue({
    case_id: caseEntry.manifest_case.case_id, attempt_ordinal: 1,
    project_id: caseEntry.family_identity.project_id, model_id: caseEntry.family_identity.model_id,
    context_id: caseEntry.family_identity.context_id, materialized_base_revision: caseEntry.family_identity.base_revision
  });
  const setupFactId = 'fact.runtime.setup';
  const committedRevision = 'revision.runtime.setup';
  const baseConstructs = caseEntry.base_fixture.facts.map(fact => projectionFact(fact.fact_id, fact, fact.modifiers ?? []));
  const setupConstruct = projectionFact(setupFactId, caseEntry.input_fixture.facts[0], []);
  const responses = [
    setupReceipt('API-CTX-002', 'GET', 200, { meta: { read_revision: materialized.materialized_base_revision }, data: { constructs: baseConstructs } }),
    setupReceipt('API-EDT-001', 'GET', 200, { data: { capability_query_id: 'query.setup', options: [{ option_id: 'option.setup', capability_ref: { capability_id: caseEntry.companion_pass_input_fixture.facts[0].capability_ref.capability_id } }] } }),
    setupReceipt('API-EDT-002', 'POST', 200, { meta: { status: 'COMMITTED', committed_revision: committedRevision }, data: { affected_ids: ['element.unrelated', setupFactId] } }, committedRevision),
    setupReceipt('API-CTX-002', 'GET', 200, { meta: { read_revision: committedRevision }, data: { constructs: [...baseConstructs, setupConstruct] } })
  ];
  const calls = [];
  let bound;
  const origin = 'http://127.0.0.1:45176';
  const page = {
    url: () => `${origin}/projects`,
    async evaluate(_callback, input) { calls.push(input); return { status: 200, url: `${origin}${input.path}`, redirected: false }; }
  };
  const familySink = {
    api: { async waitForApi() {
      const call = calls.at(-1);
      const receipt = responses.shift();
      const requestBytes = Buffer.from(call.body ?? '', 'utf8');
      const requestRef = rawRef('API_REQUEST_BODY', `api-exchanges/setup-${calls.length}.request.json`, requestBytes);
      receipt.raw_request.body = call.body === null ? null : JSON.parse(call.body);
      receipt.raw_request.body_ref = requestRef;
      receipt.actual_request.method = call.method;
      receipt.actual_request.normalized_url = call.path;
      receipt.actual_request.body_ref = requestRef;
      receipt.exchange_entry.normalized_url = call.path;
      receipt.exchange_entry.request_ref = requestRef;
      return freezeValue(receipt);
    } },
    bindAttemptIdentity(value) { bound = value; }
  };
  const identity = await runFamilySetupAndBindIdentity({ page, family_sink: familySink, case_execution: caseEntry, materialized_identity: materialized });
  assert.strictEqual(identity, bound);
  assert.equal(identity.setup_fact_id, setupFactId);
  assert.equal(identity.subject_baseline_revision, committedRevision);
  assert.equal(calls.length, 4);
  assert.equal(calls[2].method, 'POST');
  const body = JSON.parse(calls[2].body);
  assert.equal(body.command_type, 'CREATE_FACT');
  assert.equal(body.base_revision, materialized.materialized_base_revision);
  assert.equal(Object.hasOwn(body.payload, 'fact_id'), false);
  assert.equal(body.payload.modifiers.some(item => item.modifier_id.startsWith('control.')), false);
});

test('Common SETUP按Plan动态解析Fact option并绑定Projection、OPL、Trace与Revision baseline', async () => {
  const manifestRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d');
  const manifest = JSON.parse(await readFile(resolve(manifestRoot, 'dev-canvas-06-e2e-manifest.json'), 'utf8'));
  const plan = await commonSetupPlanFor(manifestRoot, manifest);
  const planCase = plan.cases.find(item => item.case_id === 'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED');
  const caseExecution = freezeValue({
    case_id: planCase.case_id,
    manifest_case: { case_id: planCase.case_id, driver_id: 'DRIVER-COMMON' },
    setup_steps: planCase.setup_steps,
    expected_baseline: planCase.expected_baseline
  });
  const identity = freezeValue({
    case_id: planCase.case_id, attempt_ordinal: 1, project_id: 'project.common', model_id: 'model.common',
    context_id: 'context.common', materialized_base_revision: 'revision.common.base'
  });
  const calls = [];
  const exchanges = [];
  let boundIdentity;
  let boundSetupBaseline;
  let commandOrdinal = 0;
  const origin = 'http://127.0.0.1:43102';
  const page = {
    url: () => `${origin}/`,
    async evaluate(_callback, input) { calls.push(input); return { status: 200, url: `${origin}${input.path}`, redirected: false }; }
  };
  const familySink = {
    exchanges,
    bindCommonSetupBaseline(value) { boundSetupBaseline = value; },
    bindAttemptIdentity(value) { boundIdentity = value; },
    api: { async waitForApi(expected) {
      const call = calls.at(-1);
      let body;
      if (expected.operation_id === 'API-EDT-002') {
        commandOrdinal += 1;
        body = { meta: { status: 'COMMITTED', committed_revision: `revision.common.${commandOrdinal}` }, data: { affected_ids: [] } };
      } else if (expected.operation_id === 'API-EDT-001') {
        body = { data: { capability_query_id: 'query.common.fact', options: [{
          capability_query_id: 'query.common.fact', option_id: 'option.common.fact', command_type: 'CREATE_FACT',
          capability_ref: { capability_id: 'CAP-ISO-PROC-001' }, normalized_endpoints: planCase.setup_steps[2].payload_template.normalized_endpoints,
          enabled: true, expires_with_revision: 'revision.common.2'
        }] } };
      } else if (expected.operation_id === 'API-CTX-002') {
        body = { meta: { read_revision: 'revision.common.3' }, data: { constructs: [
          { target_id: 'object.common.input', construct_role: 'ELEMENT_NODE' },
          { target_id: 'process.common.action', construct_role: 'ELEMENT_NODE' },
          { target_id: 'fact.common.subject', construct_role: 'PROCEDURAL_LINK' }
        ], suppressed_states: [] } };
      } else if (expected.operation_id === 'API-TXT-001') {
        body = { meta: { read_revision: 'revision.common.3' }, data: { sentences: [{ sentence_id: 'sentence.common.1', text: 'Processing consumes Input.', ordinal: 0 }], traces: [{ sentence_id: 'sentence.common.1', fact_ids: ['fact.common.subject'], occurrence_ids: [] }] } };
      } else {
        body = { data: [{ revision_id: 'revision.common.3' }] };
      }
      const sequence = exchanges.length + 1;
      const receipt = freezeValue({
        actual_request: { method: call.method, normalized_url: call.path },
        response: { status: 200, body },
        exchange_ref: { kind: 'API_EXCHANGE', path: `api-exchanges/${sequence}.json`, byte_length: 2, sha256: createHash('sha256').update(String(sequence)).digest('hex') },
        exchange_entry: { operation_id: expected.operation_id, method: call.method, normalized_url: call.path, status: 200 }
      });
      exchanges.push(receipt);
      return receipt;
    } }
  };

  const result = await runCommonSetupAndBindIdentity({ page, family_sink: familySink, case_execution: caseExecution, materialized_identity: identity, active_binding: plan.source_binding });
  assert.equal(exchanges.length, 7);
  assert.equal(result.attempt_identity.subject_baseline_revision, 'revision.common.3');
  assert.strictEqual(result.attempt_identity, boundIdentity);
  assert.strictEqual(result.setup_baseline, boundSetupBaseline);
  assert.equal(result.setup_baseline.subject_transaction_baseline_revision, 'revision.common.3');
  assert.equal(calls[2].path.includes('intent=CREATE_FACT'), true);
  const factBody = JSON.parse(calls[3].body);
  assert.equal(factBody.payload.capability_query_id, 'query.common.fact');
  assert.equal(factBody.payload.selected_option_id, 'option.common.fact');
});

test('Common INITIAL sink只接受SETUP后的baseline再绑定attempt identity', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-unbound-sink-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45177';
  const browserTree = fakeCommonBrowserPage(origin, 200, null);
  const familySink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: attemptRoot,
    case_execution: caseEntry,
    attempt_identity: null,
    setup_baseline: null
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  familySink.bindCommonSetupBaseline(commonSetupBaseline(identity));
  familySink.bindAttemptIdentity(identity);
  bindSubjectBeforeForTest(familySink, identity);
  assert.throws(() => familySink.bindCommonSetupBaseline(commonSetupBaseline(identity)), error => error.code === 'E2E_DRIVER_INVOCATION_INVALID');
  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
  assert.equal(familySink.network_requests.length, 1);
  assert.deepEqual(familySink.network_requests.map(item => item.operation_id), ['API-CTX-002']);
  assert.deepEqual(familySink.network_requests.map(item => item.sequence), [1]);
  assert.deepEqual(familySink.network_counters, {
    external_request_count: 0, websocket_count: 0, service_worker_count: 0, download_count: 0, popup_count: 0
  });
  assert.deepEqual(familySink.console_events, []);
});

test('Family Network与Console collector连续编号并拒绝全部外源和异常Browser事件', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = [...catalog.values()].find(item => item.manifest_case.driver_id !== 'DRIVER-COMMON' && item.manifest_case.expectation === 'PASS');
  const identity = freezeValue({
    case_id: caseEntry.manifest_case.case_id, attempt_ordinal: 1,
    project_id: caseEntry.family_identity.project_id, model_id: caseEntry.family_identity.model_id,
    context_id: caseEntry.family_identity.context_id, materialized_base_revision: caseEntry.family_identity.base_revision,
    setup_fact_id: null, subject_baseline_revision: caseEntry.family_identity.base_revision, setup_create_fact_exchange_ref: null
  });
  const origin = 'http://127.0.0.1:45195';
  const browserTree = fakeBrowserPage(origin, caseEntry);
  const sink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: await mkdtemp(resolve(tmpdir(), 'canvas06-family-network-console-')),
    case_execution: caseEntry,
    attempt_identity: identity,
    network_sequence_start: 5,
    console_sequence_start: 2
  });
  sink.api.attachBrowserPage(browserTree.page);
  const external = fakeApiRequest('https://example.invalid/script.js#fragment', 'GET', null, 'script');
  browserTree.page.emit('request', external);
  browserTree.page.emit('response', fakeApiResponse(external, 200, {}));
  browserTree.page.emit('console', { type: () => 'error', text: () => 'blocked-console' });
  browserTree.page.emit('websocket', { url: () => 'ws://127.0.0.1:45195/socket' });
  browserTree.refs.context.emit('serviceworker', { url: () => `${origin}/worker.js` });
  browserTree.page.emit('download', { suggestedFilename: () => 'blocked.bin' });
  browserTree.page.emit('popup', { url: () => `${origin}/popup` });
  bindSubjectBeforeForTest(sink, identity);
  browserTree.closeTree();
  await sink.api.confirmBrowserClosed(browserTree.refs);
  await sink.finalizeProof();
  assert.deepEqual(sink.network_requests, [{
    sequence: 6, method: 'GET', normalized_url: 'https://example.invalid/script.js', resource_type: 'SCRIPT', status: 200,
    failure_code: null, request_body_ref: null, response_body_ref: null, operation_id: null, revision: null, allow_decision: 'REJECTED'
  }]);
  assert.deepEqual(sink.network_counters, {
    external_request_count: 1, websocket_count: 1, service_worker_count: 1, download_count: 1, popup_count: 1
  });
  assert.deepEqual(sink.console_events.map(item => [item.sequence, item.event_kind, item.allow_decision]), [
    [3, 'CONSOLE_ERROR', 'REJECTED'], [4, 'UNHANDLED_REJECTION', 'REJECTED'], [5, 'UNHANDLED_REJECTION', 'REJECTED'],
    [6, 'DOWNLOAD', 'REJECTED'], [7, 'POPUP', 'REJECTED']
  ]);
});

test('production Family sink先落盘receipt并只允许一次同源precondition', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-sink-'));
  const identity = freezeValue({
    case_id: caseEntry.manifest_case.case_id, attempt_ordinal: 1,
    project_id: caseEntry.family_identity.project_id, model_id: caseEntry.family_identity.model_id,
    context_id: caseEntry.family_identity.context_id, materialized_base_revision: caseEntry.family_identity.base_revision,
    setup_fact_id: null, subject_baseline_revision: caseEntry.family_identity.base_revision, setup_create_fact_exchange_ref: null
  });
  const origin = 'http://127.0.0.1:45176';
  const browserTree = fakeBrowserPage(origin, caseEntry);
  const familySink = createFamilyObservationSink({ web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry, attempt_identity: identity });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();

  const candidateWait = familySink.api.waitForApi({ operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  browserTree.emitCandidate();
  const candidate = await candidateWait;
  assert.ok(Object.isFrozen(candidate));
  assert.equal(candidate.response.body.data.capability_query_id, `query.${caseEntry.manifest_case.case_id}`);
  assert.equal(JSON.parse(await readFile(resolve(attemptRoot, candidate.exchange_ref.path), 'utf8')).operation_id, 'API-EDT-001');
  bindSubjectBeforeForTest(familySink, identity);

  const request = freezeValue({
    case_id: caseEntry.manifest_case.case_id, operation_id: 'API-EDT-002', method: 'POST',
    path: `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/commands`,
    body: { base_revision: identity.subject_baseline_revision, command_type: 'CREATE_FACT', payload: {} },
    candidate_exchange_ref: candidate.exchange_ref,
    expected_http_status: caseEntry.expected_api.expected_http_status,
    expected_error_code: caseEntry.expected_error.top_error_code
  });
  const subject = await familySink.api.precondition_client.execute(request);
  await familySink.api.recordPrecondition(subject);
  assert.equal(subject.response.status, caseEntry.expected_api.expected_http_status);
  assert.equal(subject.raw_request.body_sha256, subject.actual_request.body_sha256);
  await assert.rejects(() => familySink.api.precondition_client.execute(request), error => error.code === 'E2E_PRECONDITION_ALREADY_CONSUMED');

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Common DIRECT precondition从冻结setup baseline构造TEXT_BLOCKED正式请求', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.TEXT_BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-direct-precondition-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45178';
  const browserTree = fakeCommonBrowserPage(origin, 422, 'DOMAIN_REJECTED');
  const setupBaseline = commonSetupBaseline(identity);
  const familySink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: attemptRoot,
    case_execution: caseEntry,
    attempt_identity: identity,
    setup_baseline: setupBaseline
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);

  const receipt = await familySink.api.precondition_client.execute(freezeValue({
    case_id: caseEntry.case_id,
    attempt_identity: identity,
    type: 'PRECONDITION_API',
    kind: 'SUBMIT_TEXT_BLOCKED_COMMAND',
    source_observation_ref: 'setup-baseline-api',
    expected_apis: caseEntry.expected_apis
  }));
  await familySink.api.recordPrecondition(receipt);
  await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  await familySink.api.waitForProjectionRefresh();

  assert.equal(receipt.mode, 'DIRECT_COMMAND');
  assert.equal(receipt.response.status, 422);
  assert.equal(receipt.response.body.error.code, 'DOMAIN_REJECTED');
  assert.deepEqual(receipt.raw_request.body.payload, {
    kind: 'CONSUMPTION', object_id: 'object.common.input', state_id: 'state.common.text-blocked.missing',
    process_id: 'process.common.action', layout: { x: 250, y: 160 }
  });
  assert.deepEqual(receipt.raw_request.body.binding, setupBaseline.active_binding);
  assert.equal(receipt.raw_request.body.base_revision, identity.subject_baseline_revision);

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Common REQUEST mutation只武装下一条STALE_OPTION UI请求且不立即fetch', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-005.STALE_OPTION_BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-mutation-precondition-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45179';
  const browserTree = fakeCommonBrowserPage(origin, 422, 'DOMAIN_REJECTED');
  const familySink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: attemptRoot,
    case_execution: caseEntry,
    attempt_identity: identity,
    setup_baseline: commonSetupBaseline(identity)
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);
  browserTree.emitCreateFactCandidate();
  await familySink.api.waitForProjectionRefresh();

  const receipt = await familySink.api.precondition_client.execute(freezeValue({
    case_id: caseEntry.case_id,
    attempt_identity: identity,
    type: 'PRECONDITION_API',
    kind: 'REPLACE_OPTION_ID',
    source_observation_ref: 'setup-baseline-api',
    expected_apis: caseEntry.expected_apis
  }));
  await familySink.api.recordPrecondition(receipt);

  assert.equal(receipt.mode, 'REQUEST_MUTATION');
  assert.equal(receipt.state, 'ARMED');
  assert.equal(receipt.json_pointer, '/payload/selected_option_id');
  assert.equal(receipt.replacement, 'option.e2e.invalid.stale');
  assert.equal(browserTree.evaluateCount(), 0);
  assert.equal(browserTree.routeCount(), 1);
  const originalBody = {
    request_id: 'e2e.subject.stale-option.1', command_id: 'e2e.command.stale-option.1',
    base_revision: identity.subject_baseline_revision, binding: commonSetupBaseline(identity).active_binding,
    command_type: 'CREATE_FACT',
    payload: { capability_query_id: 'query.common.stale-option', selected_option_id: 'option.common.valid' }
  };
  await browserTree.submitUiCommand(originalBody);
  await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  await familySink.api.waitForProjectionRefresh();
  const finalReceipt = familySink.precondition_receipts.at(-1);
  assert.equal(familySink.precondition_receipts.length, 1);
  assert.equal(finalReceipt.state, 'CONSUMED');
  assert.equal(finalReceipt.original_value, 'option.common.valid');
  assert.equal(finalReceipt.replacement, 'option.e2e.invalid.stale');
  assert.notEqual(finalReceipt.original_request_ref.path, finalReceipt.actual_request_ref.path);
  assert.equal(finalReceipt.response.status, 422);
  assert.equal(finalReceipt.response.body.error.code, 'DOMAIN_REJECTED');

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Common ADVANCE_HEAD提交新Head并保持subject请求使用旧base', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.REVISION_CONFLICT');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-advance-head-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45180';
  const committedRevision = 'revision.common.advanced';
  const browserTree = fakeCommonBrowserPage(origin, 200, null, {
    directResponseBody: {
      meta: { status: 'COMMITTED', committed_revision: committedRevision },
      data: { affected_ids: ['object.common.precondition.advance.1'] }
    }
  });
  const familySink = createFamilyObservationSink({
    web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry,
    attempt_identity: identity, setup_baseline: commonSetupBaseline(identity),
    snapshot_reader: async () => freezeValue({
      revision_document_sha256: '1'.repeat(64), projection_sha256: '2'.repeat(64), opl_sha256: '3'.repeat(64),
      token_sha256: '4'.repeat(64), trace_sha256: '5'.repeat(64)
    })
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);

  const receipt = await familySink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'ADVANCE_HEAD'));
  await familySink.api.recordPrecondition(receipt);
  assert.deepEqual(receipt.baseline_rebind, {
    from_revision: identity.subject_baseline_revision,
    to_revision: committedRevision,
    baseline_exchange_ref: receipt.exchange_ref
  });
  assert.equal(receipt.raw_request.body.base_revision, identity.subject_baseline_revision);

  const subject = {
    request_id: 'e2e.subject.revision-conflict.1', command_id: 'e2e.command.revision-conflict.1',
    base_revision: identity.subject_baseline_revision, binding: commonSetupBaseline(identity).active_binding,
    command_type: 'CREATE_FACT', payload: { kind: 'CONSUMPTION', object_id: 'object.common.input', process_id: 'process.common.action' }
  };
  browserTree.emitUiCommand(subject, 409, { error: { code: 'REVISION_CONFLICT', retryable: false } });
  const observed = await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  assert.equal(observed.raw_request.body.base_revision, identity.subject_baseline_revision);
  assert.equal(observed.response.body.error.code, 'REVISION_CONFLICT');

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('subject command按边界选择并只排除exact ADVANCE_HEAD提交', () => {
  const commonCase = freezeValue({
    manifest_case: { case_id: 'E2E-CANVAS-007.REVISION_CONFLICT', driver_id: 'DRIVER-COMMON' },
    expected_apis: [{ operation_id: 'API-EDT-002', method: 'POST', expected_http_status: 409, expected_error_code: 'REVISION_CONFLICT' }]
  });
  const setup = subjectReceiptFixture('setup', 200, null);
  const advance = subjectReceiptFixture('advance', 200, null);
  const subject = subjectReceiptFixture('subject', 409, 'REVISION_CONFLICT');
  const selected = selectSubjectReceipt({
    caseExecution: commonCase,
    exchanges: [{ receipt: setup }, { receipt: advance }, { receipt: subject }],
    preconditionReceipts: [freezeValue({ kind: 'ADVANCE_HEAD', exchange_ref: advance.exchange_ref })],
    subjectExchangeStart: 1
  });
  assert.equal(selected, subject);
  assert.deepEqual(expectedSubjectForCase(commonCase), { expected_http_status: 409, expected_error_code: 'REVISION_CONFLICT' });

  const directSubject = subjectReceiptFixture('readonly', 409, 'READ_ONLY_REVISION');
  const readonlyCase = freezeValue({
    manifest_case: { case_id: 'E2E-CANVAS-007.READONLY', driver_id: 'DRIVER-COMMON' },
    expected_apis: [{ operation_id: 'API-EDT-002', method: 'POST', expected_http_status: 409, expected_error_code: 'READ_ONLY_REVISION' }]
  });
  assert.equal(selectSubjectReceipt({
    caseExecution: readonlyCase,
    exchanges: [{ receipt: directSubject }],
    preconditionReceipts: [freezeValue({ kind: 'SUBMIT_READONLY_COMMAND', exchange_ref: directSubject.exchange_ref })],
    subjectExchangeStart: 0
  }), directSubject);
});

test('subject command拒绝重复提交并允许AMBIGUOUS零提交', () => {
  const familyCase = freezeValue({
    manifest_case: { case_id: 'G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS', driver_id: 'DRIVER-PROCEDURAL' },
    expected_api: { operation_id: 'API-EDT-002', method: 'POST', expected_http_status: 200, expected_error_code: null }
  });
  const first = subjectReceiptFixture('first', 200, null);
  const second = subjectReceiptFixture('second', 200, null);
  assert.deepEqual(expectedSubjectForCase(familyCase), { expected_http_status: 200, expected_error_code: null });
  assert.throws(() => selectSubjectReceipt({
    caseExecution: familyCase,
    exchanges: [{ receipt: first }, { receipt: second }],
    preconditionReceipts: [],
    subjectExchangeStart: 0
  }), error => error.code === 'EVIDENCE_TRANSACTION');

  const ambiguousCase = freezeValue({
    manifest_case: { case_id: 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED', driver_id: 'DRIVER-COMMON' },
    expected_apis: [{ operation_id: 'API-EDT-001', method: 'GET', expected_http_status: 200, expected_error_code: null }]
  });
  assert.equal(expectedSubjectForCase(ambiguousCase), null);
  assert.equal(selectSubjectReceipt({ caseExecution: ambiguousCase, exchanges: [], preconditionReceipts: [], subjectExchangeStart: 0 }), null);
});

test('Artifact Index builder闭合核心Profile日志和API条目', () => {
  const attempt = `attempts/${CASE_ID}/1`;
  const corePaths = {
    FAULT_PLAN: 'fault-plan.json', FIXTURE_MATERIALIZATION: 'fixture-materialization.json',
    ATTEMPT_OBSERVATION: 'attempt-observation.json', RUNTIME_PROCESS: 'runtime-process.json',
    BROWSER_ENVIRONMENT: 'browser-environment.json', NETWORK_OBSERVATION: 'network-observation.json',
    CONSOLE_ERRORS: 'console-errors.json', TRANSACTION_OBSERVATION: 'transaction-observation.json',
    REOPEN_OBSERVATION: 'reopen-observation.json', API_EXCHANGE_INDEX: 'api-exchanges/index.json'
  };
  const coreRefs = Object.fromEntries(Object.entries(corePaths).map(([kind, path]) => [kind, rawRef(kind, `${attempt}/${path}`, Buffer.from(kind))]));
  const assetKinds = ['GRAMMAR_ASSET', 'NORMALIZATION_DATA', 'PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET'];
  const materialization = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001',
    profile_asset_tree_ref: rawRef('PROFILE_ASSET_TREE', 'profile/assets', Buffer.from('tree')),
    profile_asset_refs: assetKinds.map(kind => rawRef(kind, `profile/assets/${kind.toLowerCase()}.json`, Buffer.from(kind)))
  };
  const cycle = (name, phase) => ({
    cycle: name,
    stdout_ref: rawRef('STDOUT_LOG', `${attempt}/stdout/${phase}.log`, Buffer.from(`${phase}-out`)),
    stderr_ref: rawRef('STDERR_LOG', `${attempt}/stderr/${phase}.log`, Buffer.from(`${phase}-err`))
  });
  const runtimeProcess = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001',
    cycles: [cycle('INITIAL', 'initial'), cycle('REOPEN', 'reopen')]
  };
  const dynamicEntries = [{
    kind: 'API_RESPONSE_BODY', path: `${attempt}/api-exchanges/exchange-000001.response.json`,
    media_type: 'application/json', capture_phase: 'ACTION', required: true
  }];
  const entries = buildAttemptIndexEntries({ attemptRelative: attempt, coreRefs, materialization, runtimeProcess, dynamicEntries });
  assert.equal(entries.length, 21);
  assert.equal(entries.find(entry => entry.kind === 'BROWSER_ENVIRONMENT').capture_phase, 'RUNTIME');
  assert.deepEqual(entries.filter(entry => entry.kind === 'STDOUT_LOG' || entry.kind === 'STDERR_LOG').map(entry => entry.capture_phase).sort(), ['REOPEN', 'REOPEN', 'RUNTIME', 'RUNTIME']);
  assert.equal(entries.filter(entry => entry.kind === 'PROFILE_ASSET').length, 5);
  assert.ok(Object.isFrozen(entries));
});

test('Common READONLY使用正式CREATE_FACT并固定409错误语义', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.READONLY');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-readonly-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45181';
  const browserTree = fakeCommonBrowserPage(origin, 409, 'READ_ONLY_REVISION');
  const familySink = createFamilyObservationSink({
    web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry,
    attempt_identity: identity, setup_baseline: commonSetupBaseline(identity)
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);

  const receipt = await familySink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'SUBMIT_READONLY_COMMAND'));
  await familySink.api.recordPrecondition(receipt);
  await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  assert.equal(receipt.raw_request.body.command_type, 'CREATE_FACT');
  assert.deepEqual(receipt.raw_request.body.payload, {
    kind: 'CONSUMPTION', object_id: 'object.common.input', process_id: 'process.common.action', layout: { x: 250, y: 160 }
  });
  assert.equal(receipt.response.status, 409);
  assert.equal(receipt.response.body.error.code, 'READ_ONLY_REVISION');
  assert.equal(receipt.baseline_rebind, null);

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Common IMPACT mutation只替换source锁定token并形成唯一final receipt', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-impact-mutation-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45182';
  const browserTree = fakeCommonBrowserPage(origin, 422, 'DOMAIN_REJECTED');
  const familySink = createFamilyObservationSink({
    web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry,
    attempt_identity: identity, setup_baseline: commonSetupBaseline(identity)
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);
  browserTree.emitDeleteCandidate();
  await familySink.api.waitForProjectionRefresh();

  const armed = await familySink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'REPLACE_IMPACT_TOKEN'));
  await familySink.api.recordPrecondition(armed);
  await browserTree.submitUiCommand({
    request_id: 'e2e.subject.impact.1', command_id: 'e2e.command.impact.1',
    base_revision: identity.subject_baseline_revision, binding: commonSetupBaseline(identity).active_binding,
    command_type: 'DELETE_CONSTRUCT',
    payload: { construct_kind: 'STATE', construct_id: 'state.common.subject', impact_token: 'impact.common.valid' }
  });
  await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  const finalReceipt = familySink.precondition_receipts[0];
  assert.equal(familySink.precondition_receipts.length, 1);
  assert.equal(finalReceipt.original_value, 'impact.common.valid');
  assert.equal(finalReceipt.replacement, 'impact.e2e.mismatched.token');
  assert.equal(finalReceipt.state, 'CONSUMED');

  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Common mutation对零匹配、多匹配、错误旧值和跨attempt请求fail-closed', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-005.STALE_OPTION_BLOCKED');
  const identity = commonAttemptIdentity(caseEntry);

  const zero = await commonMutationHarness({ caseEntry, identity, origin: 'http://127.0.0.1:45183' });
  const zeroArmed = await zero.sink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'REPLACE_OPTION_ID'));
  await zero.sink.api.recordPrecondition(zeroArmed);
  zero.browser.closeTree();
  await zero.sink.api.confirmBrowserClosed(zero.browser.refs);
  await assert.rejects(() => zero.sink.finalizeProof(), error => error.code === 'E2E_PRECONDITION_MATCH_MISSING' && error.exitCode === 4);

  const multiple = await commonMutationHarness({ caseEntry, identity, origin: 'http://127.0.0.1:45184' });
  await multiple.sink.api.recordPrecondition(await multiple.sink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'REPLACE_OPTION_ID')));
  const validBody = commonOptionSubjectBody(identity, 'option.common.valid');
  await multiple.browser.submitUiCommand(validBody);
  await assert.rejects(() => multiple.browser.submitUiCommand(validBody), error => error.code === 'E2E_PRECONDITION_MULTIPLE_MATCH' && error.exitCode === 4);
  multiple.sink.close();

  const wrongOld = await commonMutationHarness({ caseEntry, identity, origin: 'http://127.0.0.1:45185' });
  await wrongOld.sink.api.recordPrecondition(await wrongOld.sink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'REPLACE_OPTION_ID')));
  await assert.rejects(() => wrongOld.browser.submitUiCommand(commonOptionSubjectBody(identity, 'option.common.other')), error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4);
  wrongOld.sink.close();

  const crossAttempt = await commonMutationHarness({ caseEntry, identity, origin: 'http://127.0.0.1:45186' });
  const otherIdentity = freezeValue({ ...identity, attempt_ordinal: 2 });
  await assert.rejects(
    () => crossAttempt.sink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, otherIdentity, 'REPLACE_OPTION_ID')),
    error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID'
  );
  crossAttempt.sink.close();
});

test('Family REOPEN sink不创建precondition client并从INITIAL后续序号写API证据', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.TEXT_BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-reopen-sink-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45187';
  const browserTree = fakeCommonBrowserPage(origin, 200, null);
  const familySink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: attemptRoot,
    case_execution: caseEntry,
    attempt_identity: identity,
    cycle: 'REOPEN',
    exchange_sequence_start: 7
  });
  assert.equal(familySink.api.precondition_client, null);
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  assert.equal(familySink.exchanges[0].receipt.exchange_ref.path, 'api-exchanges/exchange-000008.json');
  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();
});

test('Family REOPEN sink一次性复核exact Runtime JAR五类StateDigests', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.TEXT_BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-reopen-verify-'));
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45189';
  const projectionData = { constructs: [{ target_id: 'object.common.input', construct_role: 'ELEMENT_NODE' }], suppressed_states: [] };
  const textData = { sentences: [], traces: [] };
  const browserTree = fakeReopenBrowserPage(origin, identity.subject_baseline_revision, projectionData, textData);
  const stateDigests = freezeValue({
    revision_document_sha256: '1'.repeat(64),
    projection_sha256: '2'.repeat(64),
    opl_sha256: '3'.repeat(64),
    token_sha256: '4'.repeat(64),
    trace_sha256: '5'.repeat(64)
  });
  const expectation = freezeValue({
    revision_id: identity.subject_baseline_revision,
    ...stateDigests,
    projection_response_ref: rawRef('API_RESPONSE_BODY', 'api-exchanges/initial-projection.response.json', Buffer.from('{}'))
  });
  const snapshotReader = async ({ revision_id, projection_response_ref }) => {
    assert.equal(revision_id, identity.subject_baseline_revision);
    assert.equal(projection_response_ref.kind, 'API_RESPONSE_BODY');
    return stateDigests;
  };
  const familySink = createFamilyObservationSink({
    web_origin: origin,
    attempt_root: attemptRoot,
    case_execution: caseEntry,
    attempt_identity: identity,
    cycle: 'REOPEN',
    reopen_expectation: expectation,
    snapshot_reader: snapshotReader
  });
  familySink.api.attachBrowserPage(browserTree.page);
  assert.match(familySink.browser_context_id, /^browser-context\.reopen\.[a-f0-9]{64}$/);
  assert.equal(familySink.browser_version, '143.0.7499.4');
  browserTree.navigate();
  await familySink.api.verifyReopen();
  assert.deepEqual(
    Object.fromEntries(Object.keys(stateDigests).map(key => [key, familySink.reopen_state[key]])),
    stateDigests
  );
  await assert.rejects(() => familySink.api.verifyReopen(), error => error.code === 'E2E_ORCHESTRATION_INPUT_INVALID');
  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();

  const failedRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-reopen-failed-'));
  const failedBrowser = fakeReopenBrowserPage('http://127.0.0.1:45190', identity.subject_baseline_revision, projectionData, textData);
  const failedSink = createFamilyObservationSink({
    web_origin: 'http://127.0.0.1:45190',
    attempt_root: failedRoot,
    case_execution: caseEntry,
    attempt_identity: identity,
    cycle: 'REOPEN',
    reopen_expectation: freezeValue({ ...expectation, projection_sha256: '0'.repeat(64) }),
    snapshot_reader: snapshotReader
  });
  failedSink.api.attachBrowserPage(failedBrowser.page);
  failedBrowser.navigate();
  await assert.rejects(() => failedSink.api.verifyReopen(), error => error.code === 'EVIDENCE_TRANSACTION');
  failedBrowser.closeTree();
  await failedSink.api.confirmBrowserClosed(failedBrowser.refs);
  await assert.rejects(() => failedSink.finalizeProof(), error => {
    assert.equal(error.code, 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID');
    assert.deepEqual(error.proof_state, {
      bound: true, confirmed: true, sentinel_active: true, late_event_detected: false,
      pending_capture_count: 0, pending_capture_error: false, waiter_count: 0, unresolved_network_count: 0,
      reopen_mode: true, subject_before_bound: false, subject_baseline_matches: false, common_mode: true,
      resolved_setup_baseline: false, reopen_expectation_required: true, reopen_verification_state: 4,
      requires_precondition: false, precondition_state: 0, precondition_complete: false
    });
    return Object.isFrozen(error.proof_state);
  });
});

test('Family Browser Context拒绝版本漂移且INITIAL与REOPEN身份独立', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-007.TEXT_BLOCKED');
  const identity = commonAttemptIdentity(caseEntry);
  const initial = createFamilyObservationSink({
    web_origin: 'http://127.0.0.1:45191',
    attempt_root: await mkdtemp(resolve(tmpdir(), 'canvas06-family-browser-initial-')),
    case_execution: caseEntry,
    attempt_identity: identity,
    setup_baseline: commonSetupBaseline(identity)
  });
  const reopen = createFamilyObservationSink({
    web_origin: 'http://127.0.0.1:45192',
    attempt_root: await mkdtemp(resolve(tmpdir(), 'canvas06-family-browser-reopen-')),
    case_execution: caseEntry,
    attempt_identity: identity,
    cycle: 'REOPEN'
  });
  assert.match(initial.browser_context_id, /^browser-context\.initial\.[a-f0-9]{64}$/);
  assert.match(reopen.browser_context_id, /^browser-context\.reopen\.[a-f0-9]{64}$/);
  assert.notEqual(initial.browser_context_id, reopen.browser_context_id);

  const drift = fakeCommonBrowserPage('http://127.0.0.1:45191', 200, null);
  drift.refs.browser.version = () => '143.0.7499.5';
  assert.throws(
    () => initial.api.attachBrowserPage(drift.page),
    error => error.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID' && error.exitCode === 4 && error.proof_state === undefined
  );
});

test('Browser Environment闭合真实版本、三类viewport与Report内source/tree ref', async () => {
  const reportRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-browser-environment-'));
  const webSourcePath = 'scripts/canvas06-e2e-production-web.mjs';
  const webSourceBytes = Buffer.from('export const productionWeb = true;\n');
  const webMirror = resolve(reportRoot, 'inputs/runner', webSourcePath);
  const browserMirrorPath = 'inputs/runner/toolchain/chromium/' + 'a'.repeat(64) + '/chromium';
  const browserBytes = Buffer.from('chromium');
  const prepared = { web_dist: resolve(reportRoot, 'attempts/E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN/1/inputs/build/web-dist') };
  await mkdir(dirname(webMirror), { recursive: true });
  await mkdir(dirname(resolve(reportRoot, browserMirrorPath)), { recursive: true });
  await mkdir(prepared.web_dist, { recursive: true });
  await writeFile(webMirror, webSourceBytes);
  await writeFile(resolve(reportRoot, browserMirrorPath), browserBytes);
  await writeFile(resolve(prepared.web_dist, 'index.html'), '<!doctype html>');
  const common = {
    invocationContext: { report_staging_root_realpath: reportRoot },
    schedule: {
      case_id: 'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', attempt_ordinal: 1,
      viewport_id: 'VP-390X844', zoom_id: 'Z-100', runtime_port: 45193, web_port: 45194
    },
    prepared,
    initial: { browser_version: '143.0.7499.4' },
    reopen: { browser_version: '143.0.7499.4' },
    runnerSourceSet: { entries: [{ path: webSourcePath, byte_length: webSourceBytes.length, sha256: digest(webSourceBytes) }] },
    toolchainEvidence: { browser: { mirror_ref: rawRef('E2E_BROWSER_EXECUTABLE_MIRROR', browserMirrorPath, browserBytes) } }
  };
  const artifact = await buildFamilyBrowserEnvironment(common);
  assert.deepEqual(artifact.viewport, { viewport_id: 'VP-390X844', width: 390, height: 844, device_scale_factor: 1 });
  assert.equal(artifact.browser_executable_ref.path, browserMirrorPath);
  assert.equal(artifact.web_server_source_ref.path, `inputs/runner/${webSourcePath}`);
  assert.equal(artifact.web_dist_ref.kind, 'WEB_DIST_TREE');
  assert.match(artifact.environment_fingerprint, /^[a-f0-9]{64}$/);
  await assert.rejects(
    () => buildFamilyBrowserEnvironment({ ...common, reopen: { browser_version: '143.0.7499.5' } }),
    error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4
  );
});

test('Snapshot bridge固定PropertiesLauncher命令并只接纳canonical StateDigests stdout', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-snapshot-bridge-'));
  const attemptRoot = resolve(root, 'attempt');
  await mkdir(resolve(attemptRoot, 'api-exchanges'), { recursive: true });
  const projectionBytes = Buffer.from('{"data":{},"meta":{}}');
  const projectionPath = resolve(attemptRoot, 'api-exchanges/projection.response.json');
  await writeFile(projectionPath, projectionBytes);
  const java = resolve(root, 'java');
  const stateDigests = {
    revision_document_sha256: '1'.repeat(64),
    projection_sha256: '2'.repeat(64),
    opl_sha256: '3'.repeat(64),
    token_sha256: '4'.repeat(64),
    trace_sha256: '5'.repeat(64)
  };
  await writeFile(java, `#!/bin/sh\nprintf '%s\\n' '${canonicalizeJcs(stateDigests)}'\n`);
  await chmod(java, 0o700);
  const prepared = snapshotPreparedAttempt(attemptRoot);
  const identity = snapshotAttemptIdentity();
  const projectionRef = rawRef('API_RESPONSE_BODY', 'api-exchanges/projection.response.json', projectionBytes);
  const input = { prepared_attempt: prepared, java_executable: java, attempt_identity: identity,
    revision_id: identity.subject_baseline_revision, projection_response_ref: projectionRef };
  const launch = buildE2eAttemptSnapshotCommand(input);
  assert.deepEqual(launch.command.slice(1, 5), [
    '-Dloader.main=org.opm.localruntime.releaseevidence.E2EAttemptSnapshotCli',
    '-cp', 'inputs/build/local-runtime.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher'
  ]);
  assert.equal(launch.command.at(-1), projectionPath);
  assert.deepEqual(await runE2eAttemptSnapshot(input), stateDigests);
});

test('Snapshot bridge拒绝stderr、非规范stdout与Projection raw-ref漂移', async t => {
  const stateDigests = {
    revision_document_sha256: '1'.repeat(64), projection_sha256: '2'.repeat(64), opl_sha256: '3'.repeat(64),
    token_sha256: '4'.repeat(64), trace_sha256: '5'.repeat(64)
  };
  for (const [name, script] of [
    ['stderr', `printf '%s\\n' '${canonicalizeJcs(stateDigests)}'; printf 'unexpected' >&2`],
    ['non-canonical', `printf ' ${canonicalizeJcs(stateDigests)}\\n'`]
  ]) await t.test(name, async () => {
    const fixture = await snapshotBridgeFixture(script);
    await assert.rejects(() => runE2eAttemptSnapshot(fixture.input), error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4);
  });
  await t.test('raw-ref-drift', async () => {
    const fixture = await snapshotBridgeFixture(`printf '%s\\n' '${canonicalizeJcs(stateDigests)}'`);
    await writeFile(fixture.projectionPath, '{}');
    await assert.rejects(() => runE2eAttemptSnapshot(fixture.input), error => error.code === 'E2E_ORCHESTRATION_REF_MISMATCH' && error.exitCode === 3);
  });
});

test('Transaction Snapshot bridge固定PropertiesLauncher命令并只接纳canonical before/after', async () => {
  const fixture = await transactionSnapshotBridgeFixture();
  const launch = buildE2eTransactionSnapshotCommand(fixture.input);
  assert.deepEqual(launch.command.slice(1, 5), [
    '-Dloader.main=org.opm.localruntime.releaseevidence.E2ETransactionSnapshotCli',
    '-cp', 'inputs/build/local-runtime.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher'
  ]);
  assert.deepEqual(launch.command.slice(-6), [
    '--before-revision-id', fixture.input.before_revision_id,
    '--after-revision-id', fixture.input.after_revision_id,
    '--fixture-materialization', resolve(fixture.attemptRoot, 'fixture-materialization.json')
  ]);
  assert.deepEqual(await runE2eTransactionSnapshot(fixture.input), fixture.snapshots);
});

test('Transaction Snapshot bridge拒绝stderr、非规范stdout与错误shape', async t => {
  const canonical = await transactionSnapshotBridgeFixture();
  for (const [name, script] of [
    ['stderr', `printf '%s\\n' '${canonicalizeJcs(canonical.snapshots)}'; printf 'unexpected' >&2`],
    ['non-canonical', `printf ' ${canonicalizeJcs(canonical.snapshots)}\\n'`],
    ['wrong-shape', `printf '%s\\n' '${canonicalizeJcs({ before: canonical.snapshots.before })}'`]
  ]) await t.test(name, async () => {
    const fixture = await transactionSnapshotBridgeFixture(script);
    await assert.rejects(() => runE2eTransactionSnapshot(fixture.input), error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4);
  });
});

test('Family API Exchange Index闭合真实exchange与final precondition动态ref', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('E2E-CANVAS-005.STALE_OPTION_BLOCKED');
  const reportRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-api-index-'));
  const attemptRoot = resolve(reportRoot, 'attempts', caseEntry.case_id, '1');
  await mkdir(attemptRoot, { recursive: true });
  const identity = commonAttemptIdentity(caseEntry);
  const origin = 'http://127.0.0.1:45188';
  const browserTree = fakeCommonBrowserPage(origin, 422, 'DOMAIN_REJECTED');
  const familySink = createFamilyObservationSink({
    web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry,
    attempt_identity: identity, setup_baseline: commonSetupBaseline(identity)
  });
  familySink.api.attachBrowserPage(browserTree.page);
  browserTree.navigate();
  browserTree.emitSetupProjection(identity);
  await familySink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await familySink.api.waitForProjectionRefresh();
  bindSubjectBeforeForTest(familySink, identity);
  browserTree.emitCreateFactCandidate();
  await familySink.api.waitForProjectionRefresh();
  await familySink.api.recordPrecondition(await familySink.api.precondition_client.execute(commonPreconditionRequest(caseEntry, identity, 'REPLACE_OPTION_ID')));
  await browserTree.submitUiCommand(commonOptionSubjectBody(identity, 'option.common.valid'));
  await familySink.api.waitForApi(caseEntry.expected_apis[0]);
  browserTree.closeTree();
  await familySink.api.confirmBrowserClosed(browserTree.refs);
  await familySink.finalizeProof();

  const written = await writeFamilyApiExchangeIndex({
    attempt_root: attemptRoot,
    case_id: caseEntry.case_id,
    attempt_ordinal: 1,
    exchanges: familySink.exchanges,
    precondition_receipts: familySink.precondition_receipts
  });
  const index = JSON.parse(await readFile(resolve(reportRoot, written.index_ref.path), 'utf8'));
  assert.equal(index.exchanges.length, 3);
  assert.equal(index.exchanges[2].status, 422);
  assert.ok(written.dynamic_entries.some(entry => entry.path.endsWith('/api-exchanges/precondition-original-request.json')));
  assert.ok(written.dynamic_entries.some(entry => entry.kind === 'API_EXCHANGE'));
  assert.ok(written.dynamic_entries.some(entry => entry.kind === 'API_RESPONSE_BODY'));
});

test('production Family sink将异步raw capture首错稳定升级为EVIDENCE_TRANSACTION/4', async () => {
  const { catalog } = await loadActiveCaseExecutionCatalog();
  const caseEntry = catalog.get('G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED');
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-family-sink-failure-'));
  await mkdir(resolve(attemptRoot, 'api-exchanges'));
  await writeFile(resolve(attemptRoot, 'api-exchanges/exchange-000001.response.json'), '{}');
  const origin = 'http://127.0.0.1:45177';
  const browserTree = fakeBrowserPage(origin, caseEntry);
  const familySink = createFamilyObservationSink({ web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry });
  const unhandled = [];
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    familySink.api.attachBrowserPage(browserTree.page);
    browserTree.navigate();
    const pending = familySink.api.waitForApi({ operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
    browserTree.emitCandidate();
    await assert.rejects(pending, error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4);
    await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    assert.deepEqual(unhandled, []);
    browserTree.closeTree();
    await assert.rejects(
      () => familySink.api.confirmBrowserClosed(browserTree.refs),
      error => error.code === 'EVIDENCE_TRANSACTION' && error.exitCode === 4
    );
  } finally {
    process.off('unhandledRejection', onUnhandled);
    familySink.close();
  }
});

test('旧三导出假设拒绝Common，活动验证器按四类Driver的冻结导出与原序case集合闭合', async () => {
  const modules = await Promise.all([
    import(resolve('tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs')),
    import(resolve('tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs')),
    import(resolve('tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs')),
    import(resolve('tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs'))
  ]);
  const definitions = [
    ['DRIVER-PROCEDURAL', modules[0], 33],
    ['DRIVER-CONTROL', modules[1], 35],
    ['DRIVER-STRUCTURAL', modules[2], 110],
    ['DRIVER-COMMON', modules[3], 16]
  ];
  const manifest = {
    cases: definitions.flatMap(([driverId, module]) => {
      const caseIds = driverId === 'DRIVER-COMMON' ? Object.keys(module.COMMON_CASES) : module.case_ids;
      return caseIds.map(case_id => ({ driver_id: driverId, case_id }));
    })
  };

  assert.equal(Object.keys(modules[3]).length, 4);
  assert.equal(['case_ids', 'driver', 'executeCase'].every(key => key in modules[3]), false);
  for (const [driverId, module, expectedCaseCount] of definitions) {
    const verified = verifyControlledDriverModuleExports({ module, driver_id: driverId, manifest });
    assert.equal(verified.driver_id, driverId);
    assert.equal(verified.case_ids.length, expectedCaseCount);
    assert.deepEqual(verified.case_ids, manifest.cases.filter(item => item.driver_id === driverId).map(item => item.case_id));
    assert.equal(Object.isFrozen(verified), true);
  }

  assert.throws(
    () => verifyControlledDriverModuleExports({
      module: { ...modules[3], driver: Object.freeze({}), case_ids: Object.freeze([]) },
      driver_id: 'DRIVER-COMMON', manifest
    }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID'
  );
  assert.throws(
    () => verifyControlledDriverModuleExports({
      module: { ...modules[3], COMMON_CASES: undefined },
      driver_id: 'DRIVER-COMMON', manifest
    }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID'
  );
  assert.throws(
    () => verifyControlledDriverModuleExports({
      module: { ...modules[0], default: modules[0].executeCase },
      driver_id: 'DRIVER-PROCEDURAL', manifest
    }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID'
  );
  assert.throws(
    () => verifyControlledDriverModuleExports({
      module: { ...modules[1], case_ids: Object.freeze([...modules[1].case_ids].reverse()) },
      driver_id: 'DRIVER-CONTROL', manifest
    }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID'
  );
});

test('Driver loader复核四类actual、Manifest、source owner与Report mirror bytes，并按SHA缓存', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-driver-loader-'));
  const manifestRoot = resolve(root, 'manifest');
  const reportRoot = resolve(root, 'report');
  const driverRoot = resolve(root, 'attempt/inputs/drivers');
  const original = JSON.parse(await readFile(resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d/dev-canvas-06-e2e-manifest.json'), 'utf8'));
  const context = { source_root_realpath: resolve('.'), manifest_root_realpath: manifestRoot, report_staging_root_realpath: reportRoot };
  const cache = new Map();
  const definitions = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs', 33],
    ['DRIVER-CONTROL', 'control-driver.mjs', 35],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs', 110],
    ['DRIVER-COMMON', 'common-driver.mjs', 16]
  ];
  const catalog = [];
  const sourceEntries = [];
  for (const [driverId, filename] of definitions) {
    const sourcePath = `tests/e2e/release/dev-canvas-06/drivers/${filename}`;
    const manifestPath = `inputs/drivers/${filename}`;
    const bytes = await readFile(sourcePath);
    for (const path of [resolve(manifestRoot, manifestPath), resolve(reportRoot, 'inputs/runner', sourcePath), resolve(driverRoot, filename)]) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    catalog.push({ driver_id: driverId, source_ref: { kind: 'E2E_DRIVER_SOURCE', path: manifestPath, byte_length: bytes.length, sha256: digest(bytes) } });
    sourceEntries.push({ path: sourcePath, byte_length: bytes.length, sha256: digest(bytes) });
  }
  const activeManifest = { ...original, driver_catalog: catalog };
  const sourceSet = { entries: sourceEntries };
  for (const [driverId, , expectedCaseCount] of definitions) {
    const loaded = await loadControlledDriverModule({ invocation_context: context, manifest: activeManifest, runner_source_set: sourceSet, driver_id: driverId, driver_root: driverRoot, session_cache: cache });
    assert.equal(loaded.case_ids.length, expectedCaseCount);
    assert.strictEqual(await loadControlledDriverModule({ invocation_context: context, manifest: activeManifest, runner_source_set: sourceSet, driver_id: driverId, driver_root: driverRoot, session_cache: cache }), loaded);
  }
  const procedural = catalog[0];
  await writeFile(resolve(manifestRoot, procedural.source_ref.path), 'drift');
  await assert.rejects(
    () => loadControlledDriverModule({ invocation_context: context, manifest: activeManifest, runner_source_set: sourceSet, driver_id: 'DRIVER-PROCEDURAL', driver_root: driverRoot, session_cache: cache }),
    error => error.code === 'E2E_DRIVER_CONTRACT_INVALID'
  );
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

test('lifecycle owner 串行完成 12 cycle、接纳 Browser proof 并按端口去重', async () => {
  const session = await createLifecycleSession();
  const { fixture, context, descriptor, handlers, evidence } = session;
  const result = await runControlledLifecycleSession({ invocation_context: context, manifest: fixture.manifest, preflight_descriptor: descriptor, cycle_handlers: handlers });
  const observation = JSON.parse(await readFile(resolve(evidence, 'fault-launcher/gate-observation.json'), 'utf8'));
  assert.equal(result.status, 'PASS_MATCHED', JSON.stringify(observation));
  assert.equal(result.completed_cycle_count, 12);
  assert.deepEqual(result.completed_schedule_ids, ['FL-SCH-01', 'FL-SCH-02', 'FL-SCH-03', 'FL-SCH-04', 'FL-SCH-05', 'FL-SCH-06']);
  assert.equal(result.cleanup.released_port_count, 12);
  assert.equal(result.cleanup.runtime_started_count, 12);
  assert.equal(result.cleanup.web_terminated_count, 12);
  assert.equal(observation.during.length, 12);
});

test('lifecycle owner 对 Browser proof 缺口和 confirm 后事件 fail-closed', async t => {
  const scenarios = [
    ['缺失 attach', missingAttachHandler],
    ['handler 抛错且缺失关闭证明', throwWithoutProofHandler],
    ['错误确认对象', wrongConfirmHandler],
    ['pending 请求', pendingRequestHandler],
    ['confirm 后继续业务采样', postConfirmSamplingHandler],
    ['confirm 后迟到事件', lateEventHandler]
  ];
  for (const [name, invalidHandler] of scenarios) await t.test(name, async () => {
    const session = await createLifecycleSession({ handlerFactory: ({ schedule_id, process_cycle }) => schedule_id === 'FL-SCH-01' && process_cycle === 'INITIAL' ? invalidHandler() : browserHandler(422) });
    await assert.rejects(
      () => runControlledLifecycleSession({ invocation_context: session.context, manifest: session.fixture.manifest, preflight_descriptor: session.descriptor, cycle_handlers: session.handlers }),
      error => error.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID'
    );
    await assert.rejects(() => lstat(resolve(session.evidence, 'fault-launcher/gate-observation.json')), { code: 'ENOENT' });
  });
});

test('lifecycle owner 在 Browser proof 完整时提交业务失败的真实前缀', async () => {
  const session = await createLifecycleSession({ handlerFactory: ({ schedule_id, process_cycle }) => schedule_id === 'FL-SCH-01' && process_cycle === 'INITIAL' ? throwAfterProofHandler() : browserHandler(422) });
  const result = await runControlledLifecycleSession({ invocation_context: session.context, manifest: session.fixture.manifest, preflight_descriptor: session.descriptor, cycle_handlers: session.handlers });
  const observation = JSON.parse(await readFile(resolve(session.evidence, 'fault-launcher/gate-observation.json'), 'utf8'));
  assert.equal(result.status, 'FAILED');
  assert.equal(result.completed_cycle_count, 0);
  assert.equal(observation.during.length, 0);
  assert.deepEqual(observation.failures.map(item => item.code), ['CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED']);
});

function manifest(...caseIds) {
  return { cases: caseIds.map(case_id => ({ case_id, suite_id: 'E2E-CANVAS-007' })) };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  return child;
}

function browserHandler(status) {
  return async ({ origin, observation_sink }) => {
    const browser = new EventEmitter();
    const context = new EventEmitter(); context.browser = () => browser;
    const page = new EventEmitter(); page.context = () => context; page.url = () => 'about:blank'; page.isClosed = () => false;
    observation_sink.attachBrowserPage(page);
    const request = { method: () => 'POST' };
    page.emit('request', request);
    page.emit('response', { request: () => request, url: () => `${origin}/api/v1/commands`, status: () => status });
    await observation_sink.waitForApi({ method: 'POST', expected_http_status: status });
    await observation_sink.waitForProjectionRefresh();
    page.emit('close'); context.emit('close'); browser.emit('disconnected');
    await observation_sink.confirmBrowserClosed({ browser, context, page });
    return undefined;
  };
}

function missingAttachHandler() { return async () => undefined; }

function throwWithoutProofHandler() {
  return async () => {
    throw new Error('controlled handler failed before Browser proof');
  };
}

function wrongConfirmHandler() {
  return async ({ observation_sink }) => {
    const { browser, context, page } = browserTree();
    observation_sink.attachBrowserPage(page);
    closeBrowserTree({ browser, context, page });
    await observation_sink.confirmBrowserClosed({ browser: new EventEmitter(), context, page });
  };
}

function pendingRequestHandler() {
  return async ({ observation_sink }) => {
    const { browser, context, page } = browserTree();
    observation_sink.attachBrowserPage(page);
    page.emit('request', { method: () => 'POST' });
    closeBrowserTree({ browser, context, page });
    await observation_sink.confirmBrowserClosed({ browser, context, page });
  };
}

function postConfirmSamplingHandler() {
  return async ({ origin, observation_sink }) => {
    const { browser, context, page } = browserTree();
    observation_sink.attachBrowserPage(page);
    emitResponse({ page, origin, status: 422 });
    await observation_sink.waitForApi({ method: 'POST', expected_http_status: 422 });
    closeBrowserTree({ browser, context, page });
    await observation_sink.confirmBrowserClosed({ browser, context, page });
    await observation_sink.waitForProjectionRefresh();
  };
}

function lateEventHandler() {
  return async ({ origin, observation_sink }) => {
    const { browser, context, page } = browserTree();
    observation_sink.attachBrowserPage(page);
    emitResponse({ page, origin, status: 422 });
    await observation_sink.waitForApi({ method: 'POST', expected_http_status: 422 });
    closeBrowserTree({ browser, context, page });
    await observation_sink.confirmBrowserClosed({ browser, context, page });
    page.emit('request', { method: () => 'POST' });
  };
}

function throwAfterProofHandler() {
  return async input => {
    await browserHandler(422)(input);
    throw new Error('controlled handler business failure');
  };
}

function browserTree() {
  const browser = new EventEmitter();
  browser.version = () => '143.0.7499.4';
  const context = new EventEmitter(); context.browser = () => browser;
  const page = new EventEmitter(); page.context = () => context; page.url = () => 'about:blank'; page.isClosed = () => false;
  return { browser, context, page };
}

function emitResponse({ page, origin, status }) {
  const request = { method: () => 'POST' };
  page.emit('request', request);
  page.emit('response', { request: () => request, url: () => `${origin}/api/v1/commands`, status: () => status });
}

function closeBrowserTree({ browser, context, page }) { page.emit('close'); context.emit('close'); browser.emit('disconnected'); }

async function createLifecycleSession({ handlerFactory = () => browserHandler(422) } = {}) {
  const fixture = await createControlledAttemptFixture();
  const ports = await Promise.all(Array.from({ length: 12 }, () => freePort()));
  assert.equal(new Set(ports).size, 12);
  const java = resolve(fixture.manifestRoot, 'fake-java.mjs');
  await writeFakeJava(java);
  const fixedHandoff = resolve(fixture.manifestRoot, 'fixed-handoff.json');
  await writeFile(fixedHandoff, `${canonicalizeJcs({ handoff: 'fixed' })}\n`);
  const activation = resolve(fixture.manifestRoot, 'activation');
  const control = resolve(fixture.manifestRoot, 'control');
  const evidence = resolve(fixture.manifestRoot, 'evidence');
  await Promise.all([mkdir(activation), mkdir(control), mkdir(evidence)]);
  const schedule = faultSchedule(ports);
  const fixedRef = rawRef('FIXED_HANDOFF', fixedHandoff, await readFile(fixedHandoff));
  const gate = gateSnapshot({ fixedRef, fixedHandoff, activation });
  const descriptorSchedules = schedule.filter(item => item.process_cycle === 'INITIAL');
  const descriptor = { fault_attempt_schedule: descriptorSchedules.map(item => ({ schedule_id: item.schedule_id, case_id: item.case_id, attempt_ordinal: item.attempt_ordinal })), port_allocations: descriptorSchedules.map(item => ({ schedule_id: item.schedule_id, runtime_port: item.runtime_port, web_port: item.web_port })), gate_preflight_snapshot: gate };
  const descriptorPath = resolve(fixture.bundleRoot, 'fault-launcher/preflight-descriptor.json');
  await mkdir(dirname(descriptorPath), { recursive: true });
  await writeFile(descriptorPath, `${canonicalizeJcs(descriptor)}\n`);
  const descriptorBytes = await readFile(descriptorPath);
  const descriptorRef = { bundle_id: basename(fixture.bundleRoot), bundle_identity_sha256: basename(fixture.bundleRoot).slice('canvas06-controlled-'.length), path: 'fault-launcher/preflight-descriptor.json', byte_length: descriptorBytes.length, sha256: digest(descriptorBytes) };
  const manifestPath = resolve(fixture.manifestRoot, 'manifest.json');
  await writeFile(manifestPath, `${canonicalizeJcs(fixture.manifest)}\n`);
  const manifestRef = rawRef('E2E_MANIFEST', 'manifest.json', await readFile(manifestPath));
  const preflightPath = resolve(evidence, 'fault-launcher/preflight-report.json');
  await mkdir(dirname(preflightPath), { recursive: true });
  await writeFile(preflightPath, `${canonicalizeJcs({ preflight: 'ready' })}\n`);
  const preflightRef = rawRef('FAULT_LAUNCHER_PREFLIGHT_REPORT', 'fault-launcher/preflight-report.json', await readFile(preflightPath));
  const context = {
    source_root_realpath: resolve('.'), controlled_bundle_root_realpath: fixture.bundleRoot, manifest_root_realpath: fixture.manifestRoot, manifest_ref: manifestRef,
    profile_asset_root_realpath: resolve(fixture.manifestRoot, 'inputs/upstream/profile-assets'), java_executable_ref: rawRef('JAVA_EXECUTABLE', java, await readFile(java)),
    browser_executable_ref: rawRef('BROWSER_EXECUTABLE', java, await readFile(java)), fixed_handoff_ref: fixedRef, activation_input_root_realpath: activation,
    attempt_parent_realpath: fixture.reportRoot, process_control_parent_realpath: control, evidence_staging_root_realpath: evidence,
    preflight_descriptor_ref: descriptorRef, preflight_report_ref: preflightRef, execution_schedule: schedule, context_payload_sha256: 'a'.repeat(64)
  };
  const handlers = Object.freeze(Object.fromEntries([...new Set(schedule.map(item => item.schedule_id))].map(id => Object.freeze([id, Object.freeze({
    INITIAL: handlerFactory({ schedule_id: id, process_cycle: 'INITIAL' }), REOPEN: handlerFactory({ schedule_id: id, process_cycle: 'REOPEN' })
  })]))));
  return { fixture, context, descriptor, handlers, evidence };
}

function faultSchedule(ports) {
  const cases = ['E2E-CANVAS-007.ASSET_MISSING', 'E2E-CANVAS-007.ASSET_MISSING', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY', 'E2E-CANVAS-007.READONLY'];
  const values = [];
  for (const [index, case_id] of cases.entries()) for (const process_cycle of ['INITIAL', 'REOPEN']) values.push({ ordinal: values.length + 1, schedule_id: `FL-SCH-0${index + 1}`, case_id, attempt_ordinal: index % 2 + 1, process_cycle, runtime_port: ports[index * 2], web_port: ports[index * 2 + 1] });
  return values;
}

function gateSnapshot({ fixedRef, fixedHandoff, activation }) {
  const value = { observed_at: '2026-08-28T00:00:00Z', state: 'DISABLED', enabled_capability_ids: [], candidate_loader_status: 'NOT_ACTIVE', fixed_handoff_ref: { ...fixedRef, path: basename(fixedHandoff) }, fixed_handoff_realpath: fixedHandoff, activation_input_root_realpath: activation, activation_input_refs: [], activation_input_set_sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', snapshot_payload_sha256: '' };
  const payload = { ...value }; delete payload.snapshot_payload_sha256;
  value.snapshot_payload_sha256 = digest(Buffer.from(canonicalizeJcs(payload), 'utf8'));
  return value;
}

function snapshotPreparedAttempt(attemptRoot) {
  return freezeValue({
    attempt_root: attemptRoot,
    runtime_jar: resolve(attemptRoot, 'inputs/build/local-runtime.jar'),
    storage: resolve(attemptRoot, 'storage'),
    profile_assets: resolve(attemptRoot, 'profile/assets'),
    case_entry: { case_id: 'E2E-CANVAS-007.TEXT_BLOCKED' },
    attempt_ordinal: 1
  });
}

function snapshotAttemptIdentity() {
  return freezeValue({
    case_id: 'E2E-CANVAS-007.TEXT_BLOCKED',
    attempt_ordinal: 1,
    project_id: 'project.e2e.snapshot',
    model_id: 'model.e2e.snapshot',
    context_id: 'context.e2e.snapshot',
    materialized_base_revision: 'revision.e2e.snapshot',
    setup_fact_id: null,
    subject_baseline_revision: 'revision.e2e.snapshot',
    setup_create_fact_exchange_ref: null
  });
}

async function snapshotBridgeFixture(script) {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-snapshot-negative-'));
  const attemptRoot = resolve(root, 'attempt');
  await mkdir(resolve(attemptRoot, 'api-exchanges'), { recursive: true });
  const projectionPath = resolve(attemptRoot, 'api-exchanges/projection.response.json');
  const projectionBytes = Buffer.from('{"data":{},"meta":{}}');
  await writeFile(projectionPath, projectionBytes);
  const java = resolve(root, 'java');
  await writeFile(java, `#!/bin/sh\n${script}\n`);
  await chmod(java, 0o700);
  const identity = snapshotAttemptIdentity();
  return {
    projectionPath,
    input: {
      prepared_attempt: snapshotPreparedAttempt(attemptRoot),
      java_executable: java,
      attempt_identity: identity,
      revision_id: identity.subject_baseline_revision,
      projection_response_ref: rawRef('API_RESPONSE_BODY', 'api-exchanges/projection.response.json', projectionBytes)
    }
  };
}

function transactionSnapshot(revisionId, sequence, offset = 0) {
  return {
    revision_document_count: 1 + offset,
    revision_parent_count: 1 + offset,
    text_artifact_count: 1 + offset,
    text_trace_count: offset,
    finding_count: 0,
    operation_count: offset,
    receipt_count: offset,
    draft_head_revision_id: revisionId,
    head_sequence: sequence
  };
}

async function transactionSnapshotBridgeFixture(script = null) {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-transaction-snapshot-'));
  const attemptRoot = resolve(root, 'attempt');
  await mkdir(attemptRoot, { recursive: true });
  const java = resolve(root, 'java');
  const snapshots = {
    before: transactionSnapshot('revision.e2e.snapshot.before', 1),
    after: transactionSnapshot('revision.e2e.snapshot.after', 2, 1)
  };
  await writeFile(java, `#!/bin/sh\n${script ?? `printf '%s\\n' '${canonicalizeJcs(snapshots)}'`}\n`);
  await chmod(java, 0o700);
  const identity = snapshotAttemptIdentity();
  return {
    attemptRoot,
    snapshots,
    input: {
      prepared_attempt: snapshotPreparedAttempt(attemptRoot),
      java_executable: java,
      attempt_identity: identity,
      before_revision_id: snapshots.before.draft_head_revision_id,
      after_revision_id: snapshots.after.draft_head_revision_id
    }
  };
}

function rawRef(kind, path, bytes) { return { kind, path, byte_length: bytes.length, sha256: digest(bytes) }; }

function subjectReceiptFixture(id, status, errorCode) {
  const requestBytes = Buffer.from(`request-${id}`);
  const responseBytes = Buffer.from(`response-${id}`);
  const exchangeBytes = Buffer.from(`exchange-${id}`);
  return freezeValue({
    sequence: 1,
    raw_request: {
      body: { command_id: `command.${id}`, payload: {} },
      body_ref: rawRef('API_REQUEST_BODY', `api-exchanges/${id}.request.json`, requestBytes),
      body_sha256: digest(requestBytes)
    },
    actual_request: {
      method: 'POST', normalized_url: '/api/v1/commands',
      body_ref: rawRef('API_REQUEST_BODY', `api-exchanges/${id}.request.json`, requestBytes),
      body_sha256: digest(requestBytes)
    },
    response: {
      status,
      body: errorCode === null ? { meta: { status: 'COMMITTED', committed_revision: `revision.${id}` } } : { error: { code: errorCode } },
      body_ref: rawRef('API_RESPONSE_BODY', `api-exchanges/${id}.response.json`, responseBytes)
    },
    exchange_ref: rawRef('API_EXCHANGE', `api-exchanges/${id}.json`, exchangeBytes),
    exchange_entry: { operation_id: 'API-EDT-002', method: 'POST' }
  });
}

async function fakeMaterializationArtifact({ prepared, manifestInput }) {
  const catalog = JSON.parse(await readFile(prepared.family_identity_catalog, 'utf8'));
  const identities = catalog.entries.filter(entry => entry.fixture_sha256 === prepared.case_entry.fixture_ref.sha256);
  assert.equal(identities.length, 1);
  const catalogIdentity = identities[0];
  const databaseBytes = Buffer.from('sqlite-test-database', 'utf8');
  const databaseRef = rawRef('PROJECT_DB', `storage/materialized-base/projects/${catalogIdentity.project_id}/project.db`, databaseBytes);
  const runtimeBytes = await readFile(prepared.runtime_jar);
  const runtimeRef = rawRef('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar', runtimeBytes);
  const profileRefs = manifestInput.profileAssetRefs.map(reference => ({
    ...reference,
    path: reference.path.replace('inputs/upstream/profile-assets/', 'profile/assets/')
  }));
  const profileTreePreimage = {
    schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001',
    schema_version: '0.1',
    root_path: 'profile/assets',
    entries: profileRefs
  };
  const identity = {
    project_id: catalogIdentity.project_id,
    model_id: catalogIdentity.model_id,
    context_id: catalogIdentity.context_id,
    base_revision: catalogIdentity.base_revision,
    head_revision: catalogIdentity.base_revision
  };
  const storage = {
    storage_root: 'storage',
    materialized_base_root: 'storage/materialized-base',
    project_db_ref: databaseRef,
    working_project_db_path: `storage/projects/${catalogIdentity.project_id}/project.db`,
    working_clone_byte_length: databaseRef.byte_length,
    working_clone_sha256: databaseRef.sha256,
    storage_schema_version: '1.0',
    sqlite_quick_check: 'ok',
    foreign_key_check_count: 0,
    sidecar_absent: true
  };
  const materializerIdentity = {
    main_class: 'org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli',
    runtime_jar_ref: runtimeRef,
    source_sha256: runtimeRef.sha256
  };
  const stateDigests = {
    revision_document_sha256: '1'.repeat(64),
    projection_sha256: '2'.repeat(64),
    opl_sha256: '3'.repeat(64),
    token_sha256: '4'.repeat(64),
    trace_sha256: '5'.repeat(64)
  };
  const artifact = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001',
    schema_version: '0.2',
    case_id: prepared.case_entry.case_id,
    attempt_ordinal: prepared.attempt_ordinal,
    fixture_kind: 'FAMILY',
    fixture_ref: prepared.case_entry.fixture_ref,
    input_ref: prepared.case_entry.input_ref,
    active_binding: manifestInput.activeBinding,
    identity,
    storage,
    materializer_identity: materializerIdentity,
    state_digests: stateDigests,
    profile_asset_tree_ref: {
      kind: 'PROFILE_ASSET_TREE',
      path: 'profile/assets',
      byte_length: profileRefs.reduce((total, item) => total + item.byte_length, 0),
      sha256: digest(Buffer.from(canonicalizeJcs(profileTreePreimage), 'utf8'))
    },
    profile_asset_refs: profileRefs,
    profile_package_digest: manifestInput.activeBinding.profile.sha256
  };
  const materializationPayload = Object.fromEntries([
    'case_id', 'attempt_ordinal', 'fixture_kind', 'fixture_ref', 'input_ref', 'active_binding', 'identity', 'storage', 'materializer_identity', 'state_digests'
  ].map(key => [key, artifact[key]]));
  artifact.materialization_payload_sha256 = digest(Buffer.from(canonicalizeJcs(materializationPayload), 'utf8'));
  artifact.artifact_payload_sha256 = digest(Buffer.from(canonicalizeJcs(artifact), 'utf8'));
  return { artifact, databaseBytes, catalogIdentity };
}

async function writeFakeMaterializerExecutable({ path, outputPath, baseDatabasePath, workingDatabasePath, artifact, databaseBytes }) {
  const script = `#!${process.execPath}\nimport{mkdirSync,writeFileSync}from'node:fs';import{dirname}from'node:path';const bytes=Buffer.from(${JSON.stringify(databaseBytes.toString('base64'))},'base64');for(const database of [${JSON.stringify(baseDatabasePath)},${JSON.stringify(workingDatabasePath)}]){mkdirSync(dirname(database),{recursive:true});writeFileSync(database,bytes)}writeFileSync(${JSON.stringify(outputPath)},Buffer.from(${JSON.stringify(Buffer.from(`${canonicalizeJcs(artifact)}\n`, 'utf8').toString('base64'))},'base64'));\n`;
  await writeFile(path, script);
  await chmod(path, 0o755);
}

function setupReceipt(operationId, method, status, responseBody, revision = null) {
  const ordinal = operationId === 'API-EDT-002' ? 'command' : operationId === 'API-EDT-001' ? 'candidate' : revision ? 'projection-post' : 'projection-pre';
  const responseBytes = Buffer.from(canonicalizeJcs(responseBody), 'utf8');
  const responseRef = rawRef('API_RESPONSE_BODY', `api-exchanges/setup-${ordinal}.response.json`, responseBytes);
  return {
    raw_request: { body: null, body_ref: null },
    actual_request: { method, normalized_url: null, body_ref: null },
    response: { status, body: responseBody, body_ref: responseRef },
    exchange_ref: rawRef('API_EXCHANGE', `api-exchanges/setup-${ordinal}.exchange.json`, Buffer.from('{}')),
    exchange_entry: {
      operation_id: operationId,
      method,
      normalized_url: null,
      request_ref: null,
      response_ref: responseRef,
      status,
      revision
    }
  };
}

function freePort() { return new Promise((resolvePort, rejectPort) => { const server = createServer(); server.once('error', rejectPort); server.listen({ host: '127.0.0.1', port: 0 }, () => { const address = server.address(); server.close(error => error ? rejectPort(error) : resolvePort(address.port)); }); }); }
async function writeFakeJava(path) { await writeFile(path, `#!/usr/bin/env node\nimport http from 'node:http';const a=process.argv.slice(2);const p=Number(a.find(x=>x.startsWith('--server.port='))?.slice(14));const g=k=>a.find(x=>x.startsWith(k))?.slice(k.length);if(a.includes('--spring.profiles.active=release-e2e-fault'))console.log(['E2E_FAULT_LAUNCHER_READY',g('--opm.release.e2e.case-id='),g('--opm.release.e2e.attempt-ordinal='),g('--opm.release.e2e.plan-raw-sha256=')].join('\\t'));const s=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(q.url==='/actuator/health'?'{"status":"UP"}':'{}')});s.listen(p,'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));\n`); await chmod(path, 0o755); }

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
  const setupPlan = await commonSetupPlanFor(manifestRoot, manifest);
  const setupPlanPath = resolve(manifestRoot, 'inputs/common/dev-canvas-06-common-setup-plan.json');
  await writeFile(setupPlanPath, `${JSON.stringify(setupPlan)}\n`);
  manifest.common_setup_plan_ref = rawRef('COMMON_SETUP_PLAN', 'inputs/common/dev-canvas-06-common-setup-plan.json', await readFile(setupPlanPath));
  await refreshProfileReferences(manifestRoot, manifest);
  await writeFile(resolve(manifestRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot,
    manifest: 'manifest.json',
    profileAssetRoot: resolve(manifestRoot, 'inputs/upstream/profile-assets')
  });
  return { manifestRoot, reportRoot, bundleRoot: await createControlledBundle({ root, manifestRoot, manifest }), manifest, manifestInput };
}

async function loadActiveCaseExecutionCatalog() {
  const manifestRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.37c5412a9c12.6f601a3f8e2d');
  const manifest = JSON.parse(await readFile(resolve(manifestRoot, 'dev-canvas-06-e2e-manifest.json'), 'utf8'));
  manifest.schema_version = '0.2';
  manifest.manifest_version = '0.2.0';
  const common = await import(new URL('../tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs', import.meta.url));
  const commonSetupPlan = await commonSetupPlanFor(manifestRoot, manifest);
  const catalog = await buildControlledCaseExecutionCatalog({ invocation_context: { manifest_root_realpath: manifestRoot }, manifest, common_cases: common.COMMON_CASES, common_setup_plan: commonSetupPlan });
  return { manifest, catalog };
}

async function commonSetupPlanFor(manifestRoot, manifest) {
  const catalogPath = resolve(manifestRoot, manifest.common_fixture_catalog_ref.path);
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const driverPath = resolve(COMMON_DRIVER_SOURCE_PATH);
  const driverBytes = await readFile(driverPath);
  return buildCommonSetupPlan({
    generatedAt: catalog.generated_at,
    sourceBinding: catalog.source_binding,
    generatorRef: catalog.generator_ref,
    commonFixtureCatalogRef: rawRef('COMMON_FIXTURE_CATALOG', 'dev-canvas-06-common-fixture-catalog.json', catalogBytes),
    commonDriverRef: rawRef('E2E_DRIVER_SOURCE', COMMON_DRIVER_SOURCE_PATH, driverBytes),
    catalogCases: catalog.e2e_cases
  });
}

function createFamilyDriverHarness(caseEntry, { candidateReceipt = undefined, optionCapabilityId = caseEntry.manifest_case.capability_id } = {}) {
  const events = [];
  const requests = [];
  const recordedReceipts = [];
  let projectionRefreshes = 0;
  const locator = (kind, name) => ({
    async count() { return 1; }, async isVisible() { return true; },
    async click() { events.push(`click:${kind}:${name}`); },
    async fill(value) { events.push(`fill:${kind}:${name}`); events.push(`value:${kind}:${name}:${value}`); },
    async press(value) { events.push(`press:${kind}:${name}:${value}`); },
    async inputValue() { return 'DIRECTED'; },
    async selectOption(value) { events.push(`select:${kind}:${name}:${value}`); },
    getByRole(role, options) { return locator('role', `${role}:${options?.name ?? ''}`); }
  });
  const page = {
    getByTestId(value) { return locator('testid', value); },
    locator(value) {
      const output = locator('cell', value);
      if (/fact\.runtime\.setup\.(?:input|root)"\]$/u.test(value)) return { ...output, async count() { return 0; }, async isVisible() { return false; } };
      return output;
    }
  };
  const receipt = candidateReceipt === null ? null : freezeValue(candidateReceipt ?? {
    raw_request: { sha256: '1'.repeat(64) }, actual_request: { sha256: '1'.repeat(64) },
    response: { status: 200, body: { data: { capability_query_id: `query.${caseEntry.manifest_case.case_id}`, options: [{ option_id: `option.${caseEntry.manifest_case.capability_id}`, capability_ref: { capability_id: optionCapabilityId } }] } } },
    exchange_ref: { kind: 'API_EXCHANGE', path: `api-exchanges/${caseEntry.manifest_case.case_id}.candidate.json`, byte_length: 2, sha256: '2'.repeat(64) }
  });
  const subjectReceipt = freezeValue({
    raw_request: { sha256: '3'.repeat(64) }, actual_request: { sha256: '3'.repeat(64) },
    response: { status: caseEntry.expected_api.expected_http_status, body: {} },
    exchange_ref: { kind: 'API_EXCHANGE', path: `api-exchanges/${caseEntry.manifest_case.case_id}.subject.json`, byte_length: 2, sha256: '4'.repeat(64) }
  });
  const client = Object.freeze({ async execute(request) { requests.push(request); return subjectReceipt; } });
  const sink = Object.freeze({
    precondition_client: client,
    async waitForApi(expected) { events.push(`wait:${expected.operation_id}:${expected.method}`); return expected.operation_id === 'API-EDT-001' ? receipt : subjectReceipt; },
    async waitForProjectionRefresh() { projectionRefreshes += 1; },
    async recordPrecondition(value) { recordedReceipts.push(value); }
  });
  return { page, sink, client, events, requests, recordedReceipts, projectionRefreshCount: () => projectionRefreshes };
}

function assertStructuralFormEvents({ caseEntry, events }) {
  const fact = caseEntry.input_fixture.facts[0];
  assert.ok(events.includes(`select:role:combobox:direction:${fact.direction}`) || fact.direction === 'DIRECTED', caseEntry.manifest_case.case_id);
  for (const label of fact.labels ?? []) assert.ok(events.includes(`value:testid:p03-structural-label-${label.slot_id}:${label.text}`), caseEntry.manifest_case.case_id);
  if (fact.collection_completeness && fact.collection_completeness !== 'NOT_APPLICABLE') {
    assert.ok(events.includes(`select:testid:p03-structural-completeness:${fact.collection_completeness}`), caseEntry.manifest_case.case_id);
  }
  assert.ok(events.includes('click:role:button:创建'), caseEntry.manifest_case.case_id);
}

function freezeValue(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}

function bindingGuardFromFixture(binding) {
  return { profile_id: binding.profile.id, profile_version: binding.profile.version, rule_set_id: binding.rule_set.id, rule_version: binding.rule_set.version };
}

function projectionFact(targetId, fact, modifiers) {
  return {
    occurrence_id: `occurrence.${targetId}`, target_id: targetId, construct_role: 'PROCEDURAL_LINK', capability_id: fact.capability_ref.capability_id,
    direction: fact.direction,
    endpoints: fact.endpoints.map(endpoint => ({ role: endpoint.role, target_kind: endpoint.target_kind, target_id: endpoint.target_id, ordinal: endpoint.ordinal })),
    modifiers, labels: fact.labels ?? [], ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {}),
    layout: { x: 0, y: 0, width: 1, height: 1, z_order: 0 }
  };
}

function fakeBrowserPage(origin, caseEntry) {
  const browser = new EventEmitter();
  browser.version = () => '143.0.7499.4';
  const context = new EventEmitter();
  const page = new EventEmitter();
  let currentUrl = 'about:blank';
  context.browser = () => browser;
  page.context = () => context;
  page.url = () => currentUrl;
  page.isClosed = () => false;
  page.evaluate = async (_callback, argument) => {
    const request = fakeApiRequest(`${origin}${argument.path}`, argument.method, argument.body === null ? null : Buffer.from(argument.body));
    page.emit('request', request);
    page.emit('response', fakeApiResponse(request, caseEntry.expected_api.expected_http_status, { error: { code: caseEntry.expected_error.top_error_code } }));
    return { status: caseEntry.expected_api.expected_http_status, url: `${origin}${argument.path}`, redirected: false };
  };
  return {
    page,
    refs: { browser, context, page },
    navigate() { currentUrl = `${origin}/projects`; },
    emitCandidate() {
      const path = `/api/v1/projects/project/models/model/contexts/context/command-capabilities?request_id=query&revision=revision`;
      const request = fakeApiRequest(`${origin}${path}`, 'GET', null);
      page.emit('request', request);
      page.emit('response', fakeApiResponse(request, 200, { data: { capability_query_id: `query.${caseEntry.manifest_case.case_id}`, options: [{ option_id: `option.${caseEntry.manifest_case.capability_id}`, capability_ref: { capability_id: caseEntry.manifest_case.capability_id } }] } }));
    },
    closeTree() { page.emit('close'); context.emit('close'); browser.emit('disconnected'); }
  };
}

function commonAttemptIdentity(caseEntry) {
  return freezeValue({
    case_id: caseEntry.case_id,
    attempt_ordinal: 1,
    project_id: 'project.common.e2e',
    model_id: 'model.common.e2e',
    context_id: 'context.common.root',
    materialized_base_revision: 'revision.common.base',
    setup_fact_id: null,
    subject_baseline_revision: 'revision.common.base',
    setup_create_fact_exchange_ref: null
  });
}

function commonSetupBaseline(identity) {
  return freezeValue({
    active_binding: { profile_id: 'profile.iso19450.2024.draft', profile_version: '0.2.0', rule_set_id: 'rules.iso19450.2024.draft', rule_version: '0.2.0' },
    subject_transaction_baseline_revision: identity.subject_baseline_revision
  });
}

function commonPreconditionRequest(caseEntry, identity, kind) {
  return freezeValue({
    case_id: caseEntry.case_id,
    attempt_identity: identity,
    type: 'PRECONDITION_API',
    kind,
    source_observation_ref: 'setup-baseline-api',
    expected_apis: caseEntry.expected_apis
  });
}

function commonOptionSubjectBody(identity, selectedOptionId) {
  return {
    request_id: 'e2e.subject.stale-option.1', command_id: 'e2e.command.stale-option.1',
    base_revision: identity.subject_baseline_revision, binding: commonSetupBaseline(identity).active_binding,
    command_type: 'CREATE_FACT',
    payload: { capability_query_id: 'query.common.stale-option', selected_option_id: selectedOptionId }
  };
}

async function commonMutationHarness({ caseEntry, identity, origin }) {
  const attemptRoot = await mkdtemp(resolve(tmpdir(), 'canvas06-common-mutation-matrix-'));
  const browser = fakeCommonBrowserPage(origin, 422, 'DOMAIN_REJECTED');
  const sink = createFamilyObservationSink({
    web_origin: origin, attempt_root: attemptRoot, case_execution: caseEntry,
    attempt_identity: identity, setup_baseline: commonSetupBaseline(identity)
  });
  sink.api.attachBrowserPage(browser.page);
  browser.navigate();
  browser.emitSetupProjection(identity);
  await sink.api.waitForApi({ operation_id: 'API-CTX-002', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  await sink.api.waitForProjectionRefresh();
  browser.emitCreateFactCandidate();
  await sink.api.waitForProjectionRefresh();
  return { browser, sink };
}

function fakeCommonBrowserPage(origin, responseStatus, errorCode, { directResponseBody = null } = {}) {
  const browser = new EventEmitter();
  browser.version = () => '143.0.7499.4';
  const context = new EventEmitter();
  const page = new EventEmitter();
  let currentUrl = 'about:blank';
  let evaluateCalls = 0;
  const routes = [];
  context.browser = () => browser;
  page.context = () => context;
  page.url = () => currentUrl;
  page.isClosed = () => false;
  page.route = async (_matcher, handler) => { routes.push(handler); };
  page.unroute = async () => { routes.splice(0); };
  page.evaluate = async (_callback, argument) => {
    evaluateCalls += 1;
    const request = fakeApiRequest(`${origin}${argument.path}`, argument.method, argument.body === null ? null : Buffer.from(argument.body));
    const committedRevision = directResponseBody?.meta?.committed_revision;
    const isSnapshot = argument.method === 'GET' && Boolean(committedRevision) && (/\/(?:projection|text-projection)\?|\/revisions\?/u).test(argument.path);
    const snapshotBody = argument.method === 'GET' && committedRevision && argument.path.includes('/projection?')
      ? { meta: { read_revision: committedRevision }, data: { constructs: [] } }
      : argument.method === 'GET' && committedRevision && argument.path.includes('/text-projection?')
        ? { meta: { read_revision: committedRevision }, data: { sentences: [] } }
        : argument.method === 'GET' && committedRevision && argument.path.includes('/revisions?')
          ? { data: [{ revision_id: committedRevision }] }
          : directResponseBody ?? { error: { code: errorCode, retryable: false } };
    page.emit('request', request);
    page.emit('response', fakeApiResponse(request, isSnapshot ? 200 : responseStatus, snapshotBody));
    return { status: isSnapshot ? 200 : responseStatus, url: `${origin}${argument.path}`, redirected: false };
  };
  return {
    page,
    refs: { browser, context, page },
    navigate() { currentUrl = `${origin}/projects`; },
    emitSetupProjection(identity) {
      const path = `/api/v1/projects/${identity.project_id}/models/${identity.model_id}/contexts/${identity.context_id}/projection?revision=${identity.subject_baseline_revision}`;
      const request = fakeApiRequest(`${origin}${path}`, 'GET', null);
      const body = {
        meta: { read_revision: identity.subject_baseline_revision },
        data: { context_id: identity.context_id, constructs: [
          { target_id: 'object.common.input', construct_role: 'OBJECT_NODE' },
          { target_id: 'process.common.action', construct_role: 'PROCESS_NODE' }
        ] }
      };
      page.emit('request', request);
      page.emit('response', fakeApiResponse(request, 200, body));
    },
    emitCreateFactCandidate() {
      const path = '/api/v1/projects/project.common.e2e/models/model.common.e2e/contexts/context.common.root/command-capabilities?request_id=query&revision=revision.common.base&intent=CREATE_FACT&endpoint=object.common.input&endpoint=process.common.action';
      const request = fakeApiRequest(`${origin}${path}`, 'GET', null);
      page.emit('request', request);
      page.emit('response', fakeApiResponse(request, 200, { data: { capability_query_id: 'query.common.stale-option', options: [{ option_id: 'option.common.valid', command_type: 'CREATE_FACT', capability_ref: { capability_id: 'CAP-ISO-PROC-001' } }] } }));
    },
    emitDeleteCandidate() {
      const path = '/api/v1/projects/project.common.e2e/models/model.common.e2e/contexts/context.common.root/command-capabilities?request_id=query&revision=revision.common.base&selection_id=state.common.subject&intent=DELETE_CONSTRUCT';
      const request = fakeApiRequest(`${origin}${path}`, 'GET', null);
      page.emit('request', request);
      page.emit('response', fakeApiResponse(request, 200, { data: { capability_query_id: 'query.common.delete-state', options: [{ option_id: 'option.common.delete-state', command_type: 'DELETE_CONSTRUCT', enabled: true, impact_token: 'impact.common.valid' }] } }));
    },
    emitUiCommand(body, status, responseBody) {
      const path = '/api/v1/projects/project.common.e2e/models/model.common.e2e/contexts/context.common.root/commands';
      const request = fakeApiRequest(`${origin}${path}`, 'POST', Buffer.from(canonicalizeJcs(body)));
      page.emit('request', request);
      page.emit('response', fakeApiResponse(request, status, responseBody));
    },
    async submitUiCommand(body) {
      if (routes.length !== 1) throw new Error('Expected one Common mutation route.');
      const path = `/api/v1/projects/project.common.e2e/models/model.common.e2e/contexts/context.common.root/commands`;
      const originalRequest = fakeApiRequest(`${origin}${path}`, 'POST', Buffer.from(canonicalizeJcs(body)));
      await routes[0]({
        request: () => originalRequest,
        async continue(options) {
          const actualRequest = fakeApiRequest(`${origin}${path}`, 'POST', Buffer.from(options.postData));
          page.emit('request', actualRequest);
          page.emit('response', fakeApiResponse(actualRequest, responseStatus, { error: { code: errorCode, retryable: false } }));
        }
      });
    },
    closeTree() { page.emit('close'); context.emit('close'); browser.emit('disconnected'); },
    evaluateCount: () => evaluateCalls,
    routeCount: () => routes.length
  };
}

function bindSubjectBeforeForTest(sink, identity) {
  const projection = sink.exchanges.find(item => item.receipt.exchange_entry.operation_id === 'API-CTX-002')
    ?? sink.exchanges[0];
  sink.bindSubjectBeforeState(freezeValue({
    revision_id: identity.subject_baseline_revision,
    projection_response_ref: projection?.receipt.response.body_ref ?? {
      kind: 'API_RESPONSE_BODY', path: 'api-exchanges/unit-subject-before.response.json', byte_length: 2, sha256: '0'.repeat(64)
    }
  }));
}

function fakeReopenBrowserPage(origin, revision, projectionData, textData) {
  const browser = new EventEmitter();
  browser.version = () => '143.0.7499.4';
  const context = new EventEmitter();
  const page = new EventEmitter();
  let currentUrl = 'about:blank';
  context.browser = () => browser;
  page.context = () => context;
  page.url = () => currentUrl;
  page.isClosed = () => false;
  page.evaluate = async (_callback, input) => {
    const request = fakeApiRequest(`${origin}${input.path}`, input.method, null);
    const body = input.path.includes('/text-projection?')
      ? { meta: { read_revision: revision }, data: textData }
      : input.path.includes('/projection?')
        ? { meta: { read_revision: revision }, data: projectionData }
        : { data: [{ revision_id: revision }] };
    page.emit('request', request);
    page.emit('response', fakeApiResponse(request, 200, body));
    return { status: 200, url: `${origin}${input.path}`, redirected: false };
  };
  return {
    page,
    refs: { browser, context, page },
    navigate() { currentUrl = `${origin}/projects`; },
    closeTree() { page.emit('close'); context.emit('close'); browser.emit('disconnected'); }
  };
}

function fakeApiRequest(url, method, body, resourceType = 'fetch') {
  return { url: () => url, method: () => method, postDataBuffer: () => body, resourceType: () => resourceType };
}

function fakeApiResponse(request, status, body) {
  return { request: () => request, url: () => request.url(), status: () => status, body: async () => Buffer.from(JSON.stringify(body)) };
}

async function copyRequiredManifestInputs({ sourceRoot, manifestRoot, manifest }) {
  await cp(resolve(sourceRoot, manifest.source_build.local_runtime_jar.path), resolve(manifestRoot, manifest.source_build.local_runtime_jar.path));
  await cp(resolve(sourceRoot, manifest.source_build.web_dist.path), resolve(manifestRoot, manifest.source_build.web_dist.path), { recursive: true });
  for (const reference of [manifest.intake_report_ref, manifest.handoff_ref, manifest.input_materialization.bundle_ref]) {
    const target = resolve(manifestRoot, reference.path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(sourceRoot, reference.path), target);
  }
  const caseInputs = manifest.cases.flatMap(entry => [entry.fixture_ref, entry.input_ref]);
  const catalogInputs = [
    manifest.common_fixture_catalog_ref,
    ...manifest.fixture_refs.filter(reference => reference?.kind === 'FAMILY_FIXTURE_IDENTITY_CATALOG'),
    ...manifest.upstream_input_refs.map(item => item.ref)
  ];
  const copied = new Set();
  for (const reference of [...caseInputs, ...catalogInputs]) {
    if (!reference?.path || copied.has(reference.path)) continue;
    copied.add(reference.path);
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

async function writeRunnerSourceSetFixture(reportRoot) {
  const schema = JSON.parse(await readFile('docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json', 'utf8'));
  const captured = await Promise.all(schema.properties.entries.prefixItems.map(async item => {
    const path = item.allOf[1].properties.path.const;
    const bytes = await readFile(path);
    return { path, bytes, byte_length: bytes.length, sha256: digest(bytes) };
  }));
  const payload = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001',
    schema_version: '0.2',
    source_set_version: '0.2.0',
    selection_policy: 'EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED',
    entries: captured.map(({ path, byte_length, sha256 }) => ({ path, byte_length, sha256 })),
    excluded_classes: schema.properties.excluded_classes.prefixItems.map(item => item.const)
  };
  const value = { ...payload, source_set_sha256: digest(Buffer.from(canonicalizeJcs(payload), 'utf8')) };
  const path = resolve(reportRoot, 'inputs/runner/runner-source-set.json');
  await mkdir(dirname(path), { recursive: true });
  for (const item of captured) {
    const mirror = resolve(reportRoot, 'inputs/runner', item.path);
    await mkdir(dirname(mirror), { recursive: true });
    await writeFile(mirror, item.bytes);
  }
  await writeFile(path, `${canonicalizeJcs(value)}\n`);
  return { value, ref: rawRef('RUNNER_SOURCE_SET', 'inputs/runner/runner-source-set.json', await readFile(path)) };
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
