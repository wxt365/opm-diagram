import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import {
  buildRuntimeLaunchCommand,
  faultLauncherReadyLine,
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

function manifest(...caseIds) {
  return { cases: caseIds.map(case_id => ({ case_id, suite_id: 'E2E-CANVAS-007' })) };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  return child;
}
