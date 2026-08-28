import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import {
  buildRuntimeLaunchCommand,
  faultLauncherReadyLine,
  assertControlledInvocationContext,
  runControlledLifecycleSession,
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

function rawRef(kind, path, bytes) { return { kind, path, byte_length: bytes.length, sha256: digest(bytes) }; }
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
