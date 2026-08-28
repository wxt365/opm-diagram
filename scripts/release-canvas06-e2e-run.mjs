import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { E2eRunInputError, loadActiveAttemptManifest, safeRelativePath, selectCommonAttemptInputs } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { attemptRelativeRoot, verifyFaultPlan, writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { assertDirectory, copyRegularFile, copyTree, resolveInside, treeRef, verifyFileRef } from './canvas06-e2e-manifest-v01-support.mjs';
import { verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';

const ATTEMPT_ORDINALS = Object.freeze([1, 2]);
const FAULT_CASE_IDS = new Set([
  'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.PERSISTENCE_FAILED',
  'E2E-CANVAS-007.READONLY'
]);
const FAULT_DOMAIN = Buffer.from('OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001\0', 'ascii');

/**
 * 创建一个仅供后续 INITIAL/REOPEN 编排消费的 fresh attempt 输入根。
 * 此函数不启动进程、不执行 case，也不生成任何 Report 或 placeholder。
 */
export async function prepareControlledAttempt({
  controlled_bundle_root,
  manifest_root,
  manifest_path,
  profile_asset_root,
  report_staging_root,
  case_entry,
  attempt_ordinal,
  java_executable,
  browser_executable,
  runtime_port,
  web_port
}) {
  assertControlledAttemptArguments({ manifest_path, case_entry, attempt_ordinal, java_executable, browser_executable, runtime_port, web_port });
  const controlledBundle = await verifyControlledInputBundle({ bundleRoot: controlled_bundle_root, consumer: 'E2E' }).catch(error => {
    throw asOrchestrationError(error, 'E2E_ORCHESTRATION_INPUT_INVALID');
  });
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot: manifest_root,
    manifest: manifest_path,
    profileAssetRoot: profile_asset_root
  }).catch(error => { throw asOrchestrationError(error, 'E2E_ORCHESTRATION_INPUT_INVALID'); });
  if (resolve(manifestInput.profileRoot) !== resolve(manifestInput.manifestRoot, 'inputs/upstream/profile-assets')) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Profile assets must be read from the Manifest final root.');
  }
  await assertControlledManifestTrust({ manifestInput, controlledBundle });
  const inputs = selectCommonAttemptInputs({ manifestInput, caseEntry: case_entry });
  const source = await verifyAttemptSources({ manifestInput, inputs });

  const reportRoot = resolve(report_staging_root);
  await assertDirectory(reportRoot, 'E2E_ORCHESTRATION_INPUT_INVALID');
  const attemptRoot = await createFreshAttemptRoot({ reportRoot, caseId: inputs.caseEntry.case_id, attemptOrdinal: attempt_ordinal });
  try {
    await copyVerifiedAttemptSources({ attemptRoot, manifestInput, inputs, source });
  } catch (error) {
    throw asOrchestrationError(error, 'E2E_ORCHESTRATION_PROCESS_FAILED');
  }
  return freezePreparedAttempt({ attemptRoot, caseEntry: inputs.caseEntry, attemptOrdinal: attempt_ordinal });
}

/**
 * 受控 Playwright 只能通过这个入口把已冻结的 Invocation Context 转换为 attempt 输入。
 * 这里不启动 Runtime/Web/Browser，避免为 2A 旁路最终 Runner 的生产编排职责。
 */
export function assertControlledInvocationContext(context, scheduleId) {
  if (!context || typeof context !== 'object' || Array.isArray(context)
      || typeof scheduleId !== 'string' || !Array.isArray(context.execution_schedule)
      || !absolutePath(context.controlled_bundle_root_realpath) || !absolutePath(context.manifest_root_realpath)
      || !absolutePath(context.profile_asset_root_realpath) || !context.manifest_ref
      || !context.java_executable_ref || !context.browser_executable_ref) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled Invocation Context is invalid.');
  }
  const entry = context.execution_schedule.find(item => item?.schedule_id === scheduleId);
  if (!entry || !FAULT_CASE_IDS.has(entry.case_id) || !ATTEMPT_ORDINALS.includes(entry.attempt_ordinal)
      || !['INITIAL', 'REOPEN'].includes(entry.process_cycle) || !validPort(entry.runtime_port)
      || !validPort(entry.web_port) || entry.runtime_port === entry.web_port) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled Invocation schedule is invalid.');
  }
  return Object.freeze({ ...entry, ...context });
}

export async function runControlledLifecycleSession({ invocation_context, manifest, preflight_descriptor, cycle_handlers }) {
  const session = await verifyControlledLifecycleInputs({ invocation_context, manifest, preflight_descriptor, cycle_handlers });
  const cleanup = { runtime_started_count: 0, runtime_terminated_count: 0, web_started_count: 0, web_terminated_count: 0, released_port_count: 0, residual_process_count: 0, residual_listener_count: 0 };
  const releasedPorts = new Set();
  const completed = [];
  const during = [];
  const failures = [];
  let before;
  let after;
  let firstFailure = null;
  let evidenceFailure = null;
  let prepared = null;
  let faultLaunch = null;

  try {
    before = await readGateSnapshot(session);
    if (!sameGateSnapshot(before, session.expected_gate)) firstFailure = gateFailure('BEFORE', null, null);
    for (const cycle of session.schedule) {
      if (firstFailure || evidenceFailure) break;
      if (cycle.process_cycle === 'INITIAL') {
        prepared = await prepareControlledAttempt({
          controlled_bundle_root: session.context.controlled_bundle_root_realpath,
          manifest_root: session.context.manifest_root_realpath,
          manifest_path: session.context.manifest_ref.path,
          profile_asset_root: session.context.profile_asset_root_realpath,
          report_staging_root: session.context.attempt_parent_realpath,
          case_entry: session.case_entries.get(cycle.case_id),
          attempt_ordinal: cycle.attempt_ordinal,
          java_executable: session.context.java_executable_ref.path,
          browser_executable: session.context.browser_executable_ref.path,
          runtime_port: cycle.runtime_port,
          web_port: cycle.web_port
        });
        faultLaunch = await prepareLifecycleFaultLaunch({
          reportRoot: session.context.attempt_parent_realpath,
          manifest: session.manifest,
          caseId: cycle.case_id,
          attemptOrdinal: cycle.attempt_ordinal,
          processControlParent: session.context.process_control_parent_realpath
        });
      }
      const outcome = await runControlledCycle({ session, cycle, prepared, faultLaunch, cleanup, releasedPorts });
      if (outcome.evidence_error) {
        evidenceFailure = outcome.evidence_error;
        break;
      }
      if (outcome.failure) {
        firstFailure = outcome.failure;
        failures.push(outcome.failure);
        break;
      }
      const snapshot = await readGateSnapshot(session);
      if (!sameGateSnapshot(snapshot, session.expected_gate)) {
        firstFailure = gateFailure('DURING', cycle.schedule_id, cycle.process_cycle);
        failures.push(firstFailure);
        break;
      }
      during.push(Object.freeze({ ...snapshot, phase: 'DURING', schedule_id: cycle.schedule_id, process_cycle: cycle.process_cycle, ordinal: cycle.ordinal }));
      completed.push(cycle);
    }
  } catch (error) {
    if (isEvidenceFailure(error)) evidenceFailure = error;
    else if (!firstFailure) {
      firstFailure = executionFailure('DURING', completed.at(-1)?.schedule_id ?? null, completed.at(-1)?.process_cycle ?? null);
      failures.push(firstFailure);
    }
  } finally {
    try {
      after = await readGateSnapshot(session);
      if (!sameGateSnapshot(after, session.expected_gate)) {
        const failure = gateFailure('AFTER', null, null);
        if (!firstFailure || firstFailure.code !== failure.code) failures.push(failure);
        firstFailure = firstFailure?.code === 'PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN' ? firstFailure : failure;
      }
    } catch (error) {
      evidenceFailure = asEvidenceFailure(error);
    }
  }

  if (evidenceFailure) throw asEvidenceFailure(evidenceFailure);
  if (!before || !after) throw evidenceTransaction('Gate observations are incomplete.');
  const artifact = buildGateObservation({ session, before, during, after, failures, firstFailure });
  const reference = await writeGateObservation({ session, artifact });
  const completedScheduleIds = session.schedule.filter(item => completed.some(done => done.ordinal === item.ordinal))
    .reduce((ids, item) => item.process_cycle === 'REOPEN' ? [...ids, item.schedule_id] : ids, []);
  const status = artifact.observation_status;
  if (status === 'PASS_MATCHED' && (completed.length !== 12 || cleanup.runtime_started_count !== 12 || cleanup.runtime_terminated_count !== 12
      || cleanup.web_started_count !== 12 || cleanup.web_terminated_count !== 12 || cleanup.released_port_count !== 12)) {
    throw evidenceTransaction('PASS lifecycle counters are incomplete.');
  }
  return deepFreeze({ status, completed_schedule_ids: completedScheduleIds, completed_cycle_count: completed.length, gate_observation_ref: reference, cleanup });
}

async function verifyControlledLifecycleInputs({ invocation_context, manifest, preflight_descriptor, cycle_handlers }) {
  if (!plainObject(invocation_context) || !plainObject(manifest) || !plainObject(preflight_descriptor)) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled lifecycle inputs are invalid.');
  await verifyCanonicalRawRef(invocation_context.manifest_root_realpath, invocation_context.manifest_ref, manifest, 'E2E_ORCHESTRATION_REF_MISMATCH');
  await verifyCanonicalRawRef(invocation_context.controlled_bundle_root_realpath, invocation_context.preflight_descriptor_ref, preflight_descriptor, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const reportPath = resolve(invocation_context.evidence_staging_root_realpath, invocation_context.preflight_report_ref?.path ?? '');
  await verifyCanonicalAbsoluteRef(reportPath, invocation_context.preflight_report_ref, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const schedule = verifyLifecycleSchedule(invocation_context.execution_schedule, preflight_descriptor);
  const caseEntries = new Map();
  for (const [caseId] of [['E2E-CANVAS-007.ASSET_MISSING'], ['E2E-CANVAS-007.PERSISTENCE_FAILED'], ['E2E-CANVAS-007.READONLY']]) {
    const matches = manifest.cases?.filter(item => item?.case_id === caseId) ?? [];
    if (matches.length !== 1) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Fault case does not exactly join the Manifest.');
    caseEntries.set(caseId, matches[0]);
  }
  verifyHandlerMap(cycle_handlers, schedule);
  const expectedGate = preflight_descriptor.gate_preflight_snapshot;
  if (!plainObject(expectedGate) || expectedGate.state !== 'DISABLED' || !Array.isArray(expectedGate.enabled_capability_ids)
      || expectedGate.enabled_capability_ids.length !== 0 || expectedGate.candidate_loader_status !== 'NOT_ACTIVE') {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Descriptor Gate snapshot is invalid.');
  }
  return deepFreeze({ context: invocation_context, manifest, descriptor: preflight_descriptor, schedule, case_entries: caseEntries, handlers: cycle_handlers, expected_gate: expectedGate });
}

function verifyLifecycleSchedule(value, descriptor) {
  if (!Array.isArray(value) || value.length !== 12 || !Array.isArray(descriptor.fault_attempt_schedule) || !Array.isArray(descriptor.port_allocations)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled lifecycle schedule is invalid.');
  }
  const ports = new Map(descriptor.port_allocations.map(item => [item?.schedule_id, item]));
  const schedules = descriptor.fault_attempt_schedule;
  const output = [];
  for (const [index, item] of value.entries()) {
    const schedule = schedules[Math.floor(index / 2)];
    const allocation = ports.get(schedule?.schedule_id);
    const expectedCycle = index % 2 === 0 ? 'INITIAL' : 'REOPEN';
    if (!plainObject(item) || Object.keys(item).length !== 7 || item.ordinal !== index + 1 || item.schedule_id !== schedule?.schedule_id
        || item.case_id !== schedule?.case_id || item.attempt_ordinal !== schedule?.attempt_ordinal || item.process_cycle !== expectedCycle
        || item.runtime_port !== allocation?.runtime_port || item.web_port !== allocation?.web_port || !validPort(item.runtime_port) || !validPort(item.web_port)) {
      fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Invocation Context schedule differs from Descriptor bytes.');
    }
    output.push(deepFreeze({ ...item }));
  }
  if (new Set(output.flatMap(item => [item.runtime_port, item.web_port])).size !== 12) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Controlled ports are not globally unique by schedule.');
  return Object.freeze(output);
}

function verifyHandlerMap(handlers, schedule) {
  if (!plainObject(handlers) || Object.getPrototypeOf(handlers) !== Object.prototype || !Object.isFrozen(handlers)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler map must be a frozen plain object.');
  }
  const ids = [...new Set(schedule.map(item => item.schedule_id))];
  if (Object.keys(handlers).length !== ids.length || ids.some(id => !Object.hasOwn(handlers, id))) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler keys are not closed.');
  for (const id of ids) {
    const value = handlers[id];
    if (!plainObject(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
        || Object.keys(value).length !== 2 || typeof value.INITIAL !== 'function' || typeof value.REOPEN !== 'function') {
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler entry is invalid.');
    }
  }
}

async function runControlledCycle({ session, cycle, prepared, faultLaunch, cleanup, releasedPorts }) {
  let runtime = null;
  let web = null;
  let sink = null;
  let failure = null;
  let evidenceError = null;
  try {
    await assertPortsFree([cycle.runtime_port, cycle.web_port]);
    const launch = cycle.process_cycle === 'INITIAL' ? faultLaunch : null;
    const runtimeCommand = buildRuntimeLaunchCommand({ javaPath: session.context.java_executable_ref.path, attemptRoot: prepared.attempt_root, runtimePort: cycle.runtime_port, caseId: cycle.case_id, attemptOrdinal: cycle.attempt_ordinal, cycle: cycle.process_cycle, faultLaunch: launch });
    runtime = spawnOwned(runtimeCommand.command, prepared.attempt_root);
    cleanup.runtime_started_count += 1;
    await waitRuntimeReady({ child: runtime, cycle, launch });
    web = spawnOwned([process.execPath, resolve(session.context.source_root_realpath, 'scripts/canvas06-e2e-production-web.mjs'), '--root', prepared.web_dist, '--host', '127.0.0.1', '--port', String(cycle.web_port), '--runtime-origin', `http://127.0.0.1:${cycle.runtime_port}`], prepared.attempt_root);
    cleanup.web_started_count += 1;
    const origin = `http://127.0.0.1:${cycle.web_port}`;
    await waitWebReady({ child: web, origin });
    sink = createObservationSink({ web_origin: origin });
    const result = await session.handlers[cycle.schedule_id][cycle.process_cycle](Object.freeze({ origin, observation_sink: sink.api }));
    if (result !== undefined) throw new E2eRunInputError('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled handler must return undefined.', 2);
  } catch (error) {
    if (error?.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID') evidenceError = error;
    else failure = executionFailure('DURING', cycle.schedule_id, cycle.process_cycle);
  } finally {
    const protectCleanup = async operation => {
      try { await operation(); } catch (error) { evidenceError ??= asEvidenceFailure(error); }
    };
    if (sink) await protectCleanup(() => sink.finalizeProof());
    if (web) await protectCleanup(async () => { await stopOwnedChild(web); cleanup.web_terminated_count += 1; });
    if (runtime) await protectCleanup(async () => { await stopOwnedChild(runtime); cleanup.runtime_terminated_count += 1; });
    if (cycle.process_cycle === 'INITIAL') {
      await protectCleanup(() => removeFaultChallenge({ challengePath: faultLaunch.challenge_path, processControlRoot: faultLaunch.process_control_root }));
    }
    await protectCleanup(async () => {
      await assertPortsFree([cycle.runtime_port, cycle.web_port]);
      releasedPorts.add(cycle.runtime_port); releasedPorts.add(cycle.web_port);
      cleanup.released_port_count = releasedPorts.size;
    });
  }
  return Object.freeze({ failure, evidence_error: evidenceError });
}

function createObservationSink({ web_origin }) {
  let closed = false;
  let bound = null;
  let confirmed = false;
  const requests = new Map();
  const responses = [];
  const waiters = [];
  const samplingListeners = [];
  const sentinelListeners = [];
  const api = {
    attachBrowserPage(page) {
      assertSinkOpen();
      if (bound || !page || typeof page.context !== 'function' || typeof page.on !== 'function' || typeof page.url !== 'function' || page.url() !== 'about:blank') browserProofFailure('Page attach must precede navigation and may occur only once.');
      const context = page.context();
      const browser = context?.browser?.();
      if (!context || !browser || typeof context.on !== 'function' || typeof browser.on !== 'function' || page.isClosed?.()) browserProofFailure('Page does not form an active Browser tree.');
      const state = { page, context, browser, page_closed: false, context_closed: false, browser_disconnected: false, late_event_detected: false, sentinel_active: false };
      const onRequest = request => {
        requests.set(request, true);
      };
      const onResponse = response => {
        const request = response.request?.();
        if (request) requests.delete(request);
        const item = { method: request?.method?.(), url: response.url?.(), status: response.status?.() };
        responses.push(item);
        flushWaiters();
      };
      const onFailed = request => { requests.delete(request); flushWaiters(); };
      const onPageClose = () => { state.page_closed = true; };
      const onContextClose = () => { state.context_closed = true; };
      const onDisconnected = () => { state.browser_disconnected = true; };
      page.on('request', onRequest); page.on('response', onResponse); page.on('requestfailed', onFailed); page.on('close', onPageClose);
      context.on('close', onContextClose); browser.on('disconnected', onDisconnected);
      samplingListeners.push([page, 'request', onRequest], [page, 'response', onResponse], [page, 'requestfailed', onFailed], [page, 'close', onPageClose], [context, 'close', onContextClose], [browser, 'disconnected', onDisconnected]);
      bound = state;
    },
    async confirmBrowserClosed({ browser, context, page }) {
      assertSinkOpen();
      if (!bound || confirmed || browser !== bound.browser || context !== bound.context || page !== bound.page
          || !bound.page_closed || !bound.context_closed || !bound.browser_disconnected || requests.size !== 0) {
        browserProofFailure('Browser close proof is incomplete.');
      }
      installSentinel();
      detach(samplingListeners);
      confirmed = true;
    },
    async waitForApi(expected) {
      assertSinkOpen();
      if (!bound || confirmed || !plainObject(expected) || typeof expected.method !== 'string' || !Number.isInteger(expected.expected_http_status)) {
        browserProofFailure('API wait is not bound to an active Page.');
      }
      const found = responses.find(item => item.method === expected.method && item.status === expected.expected_http_status && isSameOriginApi(item.url, web_origin));
      if (found) return undefined;
      await new Promise((resolveWait, rejectWait) => waiters.push({ expected, resolve: resolveWait, reject: rejectWait }));
    },
    async waitForProjectionRefresh() {
      assertSinkOpen();
      if (!bound || confirmed || requests.size !== 0) browserProofFailure('Projection refresh has pending Page traffic.');
    },
    async recordPrecondition(receipt) {
      assertSinkOpen();
      if (!plainObject(receipt) || !receipt.raw_request || !receipt.actual_request || !receipt.response) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Precondition receipt is incomplete.');
    },
    precondition_client: null
  };
  api.precondition_client = Object.freeze({
    async execute() {
      assertSinkOpen();
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'This controlled Fault session does not authorize a precondition API.');
    }
  });
  Object.freeze(api);
  return Object.freeze({ api, close, finalizeProof });

  function assertSinkOpen() { if (closed) browserProofFailure('Observation sink is closed.'); }
  function flushWaiters() {
    for (const waiter of waiters.splice(0)) {
      const found = responses.find(item => item.method === waiter.expected.method && item.status === waiter.expected.expected_http_status && isSameOriginApi(item.url, web_origin));
      if (found) waiter.resolve();
      else waiters.push(waiter);
    }
  }
  function detach(listeners) { for (const [target, event, listener] of listeners.splice(0)) target.off?.(event, listener); }
  function installSentinel() {
    if (!bound || bound.sentinel_active) browserProofFailure('Browser sentinel state is invalid.');
    const markLate = () => { bound.late_event_detected = true; };
    const { page, context, browser } = bound;
    page.on('request', markLate); page.on('response', markLate); page.on('requestfailed', markLate); page.on('close', markLate);
    context.on('close', markLate); browser.on('disconnected', markLate);
    sentinelListeners.push([page, 'request', markLate], [page, 'response', markLate], [page, 'requestfailed', markLate], [page, 'close', markLate], [context, 'close', markLate], [browser, 'disconnected', markLate]);
    bound.sentinel_active = true;
  }
  function close() {
    if (closed) return;
    closed = true;
    detach(samplingListeners);
    detach(sentinelListeners);
    if (bound) bound.sentinel_active = false;
    for (const waiter of waiters.splice(0)) waiter.reject(new E2eRunInputError('E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', 'Observation sink closed with a pending API wait.', 4));
  }
  function finalizeProof() {
    if (!bound || !confirmed || !bound.sentinel_active || bound.late_event_detected || !bound.page_closed || !bound.context_closed
        || !bound.browser_disconnected || requests.size !== 0 || waiters.length !== 0) {
      close();
      browserProofFailure('Handler settled without a complete Browser close proof.');
    }
    close();
  }
}

async function waitRuntimeReady({ child, cycle, launch }) {
  if (launch) await waitForFaultLauncherReady({ child, faultLaunch: launch });
  const origin = `http://127.0.0.1:${cycle.runtime_port}`;
  let consecutive = 0;
  await waitUntil(async () => {
    const response = await fetch(`${origin}/actuator/health`).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    consecutive = payload?.status === 'UP' ? consecutive + 1 : 0;
    return consecutive === 3;
  }, 120000, child);
}

async function waitWebReady({ child, origin }) {
  await waitUntil(async () => {
    const index = await fetch(`${origin}/`).catch(() => null);
    if (!index?.ok) return false;
    const html = await index.text();
    const resources = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match => match[1]);
    if (resources.length === 0) return false;
    const bootstrap = await fetch(`${origin}/opm-bootstrap.js`).catch(() => null);
    if (!bootstrap?.ok) return false;
    for (const resource of resources) if (!(await fetch(new URL(resource, origin)).catch(() => null))?.ok) return false;
    return true;
  }, 60000, child);
}

async function waitUntil(check, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'Owned child exited before READY.', 3);
    if (await check()) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'Owned child did not reach exact READY.', 3);
}

function spawnOwned(command, cwd) {
  const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  if (!child.pid) throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'Could not create an owned child.', 3);
  return child;
}

async function stopOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await waitChildExit(child, 10000);
  if (exited) return;
  child.kill('SIGKILL');
  if (!(await waitChildExit(child, 10000))) throw evidenceTransaction('Owned child did not exit.');
}

function waitChildExit(child, timeoutMs) {
  return new Promise(resolveWait => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = value => { clearTimeout(timer); child.off('exit', onExit); resolveWait(value); };
    const onExit = () => finish(true);
    child.once('exit', onExit);
  });
}

async function assertPortsFree(ports) {
  for (const port of ports) await new Promise((resolveProbe, rejectProbe) => {
    const probe = createServer();
    probe.once('error', () => rejectProbe(new E2eRunInputError('E2E_ORCHESTRATION_PORT_NOT_RELEASED', 'Controlled port is occupied.', 4)));
    probe.listen({ host: '127.0.0.1', port }, () => probe.close(error => error ? rejectProbe(error) : resolveProbe()));
  });
}

async function readGateSnapshot(session) {
  const context = session.context;
  await verifyCanonicalAbsoluteRef(context.fixed_handoff_ref.path, context.fixed_handoff_ref, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const entries = await readdir(context.activation_input_root_realpath, { withFileTypes: true });
  if (entries.length !== 0) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Activation input root is not empty.');
  return deepFreeze({ ...session.expected_gate });
}

function sameGateSnapshot(left, right) { return canonicalizeJcs(left) === canonicalizeJcs(right); }

function gateFailure(phase, schedule_id, process_cycle) { return Object.freeze({ code: 'PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN', phase, schedule_id, process_cycle, evidence_refs: [] }); }
function executionFailure(phase, schedule_id, process_cycle) { return Object.freeze({ code: 'CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED', phase, schedule_id, process_cycle, evidence_refs: [] }); }

function buildGateObservation({ session, before, during, after, failures, firstFailure }) {
  const mutationCount = [before, ...during, after].filter(snapshot => !sameGateSnapshot(stripPhase(snapshot), session.expected_gate)).length;
  const status = firstFailure ? 'FAILED' : 'PASS_MATCHED';
  const values = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-GATE-OBSERVATION-001', schema_version: '0.1',
    observation_id: `dev-canvas-06.fault-launcher-gate.${session.context.preflight_descriptor_ref.sha256.slice(0, 12)}.${session.context.preflight_report_ref.sha256.slice(0, 12)}`,
    generated_at: session.expected_gate.observed_at,
    preflight_descriptor_ref: session.context.preflight_descriptor_ref,
    preflight_report_ref: session.context.preflight_report_ref,
    before: Object.freeze({ ...before, phase: 'BEFORE' }), during, after: Object.freeze({ ...after, phase: 'AFTER' }),
    production_gate_mutation_count: mutationCount, observation_status: status,
    failures: status === 'PASS_MATCHED' ? [] : failures,
    observation_payload_sha256: ''
  };
  values.observation_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(withoutKey(values, 'observation_payload_sha256')), 'utf8'));
  if (status === 'PASS_MATCHED' && (during.length !== 12 || mutationCount !== 0 || failures.length !== 0)) throw evidenceTransaction('PASS Gate observation is incomplete.');
  if (status === 'FAILED' && failures.length === 0) throw evidenceTransaction('FAILED Gate observation has no failure.');
  return deepFreeze(values);
}

async function writeGateObservation({ session, artifact }) {
  const root = resolve(session.context.evidence_staging_root_realpath, 'fault-launcher');
  const finalPath = resolve(root, 'gate-observation.json');
  const temporaryPath = resolve(root, '.gate-observation.json.tmp');
  const bytes = Buffer.from(`${canonicalizeJcs(artifact)}\n`, 'utf8');
  await assertDirectory(session.context.evidence_staging_root_realpath, 'EVIDENCE_TRANSACTION');
  await mkdir(root, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await assertAbsent(finalPath); await assertAbsent(temporaryPath);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const reread = await readFile(temporaryPath);
  if (!reread.equals(bytes) || sha256(reread) !== sha256(bytes)) throw evidenceTransaction('Gate observation temporary bytes drifted.');
  await rename(temporaryPath, finalPath);
  await fsyncDirectory(root);
  await verifyCanonicalAbsoluteRef(finalPath, { kind: 'GATE_OBSERVATION', path: finalPath, byte_length: bytes.length, sha256: sha256(bytes) }, 'EVIDENCE_TRANSACTION');
  return deepFreeze({ kind: 'GATE_OBSERVATION', path: 'fault-launcher/gate-observation.json', byte_length: bytes.length, sha256: sha256(bytes) });
}

async function verifyCanonicalRawRef(root, reference, expected, code) {
  if (!reference?.path || !safeRelativePath(reference.path)) fail(code, 'Context reference path is invalid.');
  return verifyCanonicalAbsoluteRef(resolve(root, reference.path), reference, code, expected);
}

async function verifyCanonicalAbsoluteRef(path, reference, code, expected = undefined) {
  if (!reference || !isAbsolute(path) || !Number.isSafeInteger(reference.byte_length) || !isDigest(reference.sha256)) fail(code, 'Raw reference is invalid.');
  const info = await lstat(path).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail(code, 'Raw reference is not a single-link regular file.');
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256 || bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) fail(code, 'Raw reference bytes drifted.');
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (`${canonicalizeJcs(parsed)}\n` !== bytes.toString('utf8') || expected && canonicalizeJcs(parsed) !== canonicalizeJcs(expected)) fail(code, 'Canonical JSON raw reference differs.');
  return parsed;
}

function stripPhase(snapshot) { const copy = { ...snapshot }; delete copy.phase; delete copy.schedule_id; delete copy.process_cycle; delete copy.ordinal; return copy; }
function isSameOriginApi(url, origin) { try { const value = new URL(url); return value.origin === origin && value.pathname.startsWith('/api/'); } catch { return false; } }
function withoutKey(value, key) { const copy = { ...value }; delete copy[key]; return copy; }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function browserProofFailure(message) { throw new E2eRunInputError('E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', message, 4); }
function evidenceTransaction(message) { return new E2eRunInputError('EVIDENCE_TRANSACTION', message, 4); }
function asEvidenceFailure(error) { return isEvidenceFailure(error) ? error : evidenceTransaction(error?.message ?? 'Evidence transaction failed.'); }
function isEvidenceFailure(error) { return error?.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID' || error?.code === 'E2E_ORCHESTRATION_PORT_NOT_RELEASED' || error?.code === 'EVIDENCE_TRANSACTION'; }
async function assertAbsent(path) { const info = await lstat(path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)); if (info) throw evidenceTransaction('Evidence destination already exists.'); }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }

async function assertControlledManifestTrust({ manifestInput, controlledBundle }) {
  const references = [
    ['intake_report_ref', controlledBundle.references.intake_report_ref],
    ['handoff_ref', controlledBundle.references.handoff_ref],
    ['input_materialization.bundle_ref', controlledBundle.references.evidence_bundle_ref]
  ];
  for (const [field, external] of references) {
    const localRef = field === 'input_materialization.bundle_ref'
      ? manifestInput.manifest.input_materialization?.bundle_ref
      : manifestInput.manifest[field];
    const local = await verifyFileRef({ root: manifestInput.manifestRoot, reference: localRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
    const externalBytes = await readRegularBytes(external.absolute_path, 'E2E_ORCHESTRATION_REF_MISMATCH');
    if (!local.bytes.equals(externalBytes)) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Controlled bundle trust input differs from the Manifest final root.');
  }
}

async function verifyAttemptSources({ manifestInput, inputs }) {
  const root = manifestInput.manifestRoot;
  const runtimeJar = await verifyFileRef({ root, reference: inputs.runtimeJarRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  const webDist = await treeRef(root, inputs.webDistRef.path, 'E2E_ORCHESTRATION_REF_MISMATCH');
  if (!sameRef(webDist, inputs.webDistRef)) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest web-dist tree differs from its raw reference.');
  const drivers = [];
  for (const driver of inputs.drivers) {
    drivers.push({ driver, source: await verifyFileRef({ root, reference: driver.source_ref, code: 'E2E_ORCHESTRATION_REF_MISMATCH' }) });
  }
  const profileAssets = [];
  for (const reference of inputs.profileAssetRefs) {
    const relativePath = profileAssetPath(reference.path);
    const sourcePath = resolve(manifestInput.profileRoot, relativePath);
    const bytes = await readRegularBytes(sourcePath, 'E2E_ORCHESTRATION_REF_MISMATCH');
    if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
      fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Profile asset bytes differ from the active Manifest reference.');
    }
    profileAssets.push({ reference, relativePath, sourcePath });
  }
  return Object.freeze({ runtimeJar, webDist, drivers: Object.freeze(drivers), profileAssets: Object.freeze(profileAssets) });
}

async function createFreshAttemptRoot({ reportRoot, caseId, attemptOrdinal }) {
  const root = resolve(reportRoot);
  const relativeAttemptRoot = attemptRelativeRoot(caseId, attemptOrdinal);
  const parent = resolve(root, relativeAttemptRoot, '..');
  if (!inside(root, parent) || parent === root) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt parent escapes the Report staging root.');
  await ensureDirectoryPath(root, relativeAttemptRoot.split('/').slice(0, -1));
  const attemptRoot = resolve(root, relativeAttemptRoot);
  try {
    await mkdir(attemptRoot, { recursive: false, mode: 0o700 });
  } catch (error) {
    fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt root must not already exist.');
  }
  const details = await lstat(attemptRoot);
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt root is not a safe directory.');
  return attemptRoot;
}

async function copyVerifiedAttemptSources({ attemptRoot, manifestInput, inputs, source }) {
  const runtime = await copyRegularFile({
    source: source.runtimeJar.path,
    destinationRoot: attemptRoot,
    destination: 'inputs/build/local-runtime.jar',
    kind: inputs.runtimeJarRef.kind,
    code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
  });
  await verifyCopiedFile({ root: attemptRoot, reference: runtime, expected: inputs.runtimeJarRef });

  const web = await copyTree({
    sourceRoot: resolveInside(manifestInput.manifestRoot, inputs.webDistRef.path, 'E2E_ORCHESTRATION_REF_MISMATCH'),
    destinationRoot: attemptRoot,
    destination: 'inputs/build/web-dist',
    code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
  });
  if (!sameRef(web, { ...inputs.webDistRef, path: web.path })) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Copied web-dist differs from the Manifest tree reference.');

  for (const asset of source.profileAssets) {
    const copied = await copyRegularFile({
      source: asset.sourcePath,
      destinationRoot: attemptRoot,
      destination: `profile/assets/${asset.relativePath}`,
      kind: asset.reference.kind,
      code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
    });
    await verifyCopiedFile({ root: attemptRoot, reference: copied, expected: asset.reference });
  }
  for (const entry of source.drivers) {
    const filename = entry.driver.source_ref.path.slice('inputs/drivers/'.length);
    const copied = await copyRegularFile({
      source: entry.source.path,
      destinationRoot: attemptRoot,
      destination: `inputs/drivers/${filename}`,
      kind: entry.driver.source_ref.kind,
      code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
    });
    await verifyCopiedFile({ root: attemptRoot, reference: copied, expected: entry.driver.source_ref });
  }
}

async function verifyCopiedFile({ root, reference, expected }) {
  const copied = await verifyFileRef({ root, reference, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  if (copied.bytes.length !== expected.byte_length || sha256(copied.bytes) !== expected.sha256) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Copied attempt input differs from the Manifest raw reference.');
  }
}

function freezePreparedAttempt({ attemptRoot, caseEntry, attemptOrdinal }) {
  return Object.freeze({
    case_entry: Object.freeze({ ...caseEntry }),
    attempt_ordinal: attemptOrdinal,
    attempt_root: attemptRoot,
    runtime_jar: resolve(attemptRoot, 'inputs/build/local-runtime.jar'),
    web_dist: resolve(attemptRoot, 'inputs/build/web-dist'),
    profile_assets: resolve(attemptRoot, 'profile/assets'),
    driver_source: resolve(attemptRoot, 'inputs/drivers/common-driver.mjs'),
    storage: resolve(attemptRoot, 'storage'),
    initial_runtime: resolve(attemptRoot, 'process/initial'),
    reopen_runtime: resolve(attemptRoot, 'process/reopen')
  });
}

function assertControlledAttemptArguments({ manifest_path, case_entry, attempt_ordinal, java_executable, browser_executable, runtime_port, web_port }) {
  if (!safeRelativePath(manifest_path) || !case_entry || typeof case_entry.case_id !== 'string'
      || !ATTEMPT_ORDINALS.includes(attempt_ordinal) || !isAbsolute(java_executable) || !isAbsolute(browser_executable)
      || !validPort(runtime_port) || !validPort(web_port) || runtime_port === web_port) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled attempt arguments are invalid.');
  }
}

async function ensureDirectoryPath(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt parent contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false, mode: 0o700 });
    }
  }
}

async function readRegularBytes(path, code) {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a regular attempt input.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(code, 'Attempt input must be a single-link regular file.');
  return readFile(path);
}

function profileAssetPath(path) {
  const prefix = 'inputs/upstream/profile-assets/';
  if (typeof path !== 'string' || !path.startsWith(prefix) || !safeRelativePath(path.slice(prefix.length))) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest Profile asset path is invalid.');
  }
  return path.slice(prefix.length);
}

function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path
    && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

function absolutePath(value) {
  return typeof value === 'string' && isAbsolute(value);
}

function asOrchestrationError(error, code) {
  if (error instanceof E2eRunInputError && error.code.startsWith('E2E_ORCHESTRATION_')) return error;
  return new E2eRunInputError(code, error?.message ?? 'Controlled attempt input validation failed.', error?.exitCode === 3 ? 3 : 2);
}

// 只有该 plan builder 从冻结调度矩阵取得 ordinal。
export async function prepareCaseFaultPlans({ reportRoot, manifest, caseId, nonces = {}, write = writeFaultPlan }) {
  const schedule = uniqueManifestCase(manifest, caseId);
  if (!nonces || typeof nonces !== 'object' || Array.isArray(nonces)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Fault Plan nonces must be an ordinal-keyed object.');
  }

  const refs = [];
  for (const attemptOrdinal of ATTEMPT_ORDINALS) {
    const reference = await write({ reportRoot, caseId: schedule.case_id, attemptOrdinal, nonce: nonces[attemptOrdinal] });
    refs.push(await readBackFaultPlan({ reportRoot, caseId: schedule.case_id, attemptOrdinal, reference }));
  }
  return Object.freeze({ case_id: schedule.case_id, fault_plan_refs: Object.freeze(refs) });
}

// 为三个受控 INITIAL case 同时生成 Plan、challenge 与握手参数。
export async function prepareCaseFaultLaunches({ reportRoot, manifest, caseId, processControlParent, write = writeFaultPlan, random = randomBytes }) {
  if (!FAULT_CASE_IDS.has(caseId)) fail('E2E_RUN_CASE_SET_INVALID', 'Only the three frozen Common fault cases may arm a Fault Launcher.');
  const report = resolve(reportRoot);
  const parent = await assertControlParent(processControlParent, report);
  const processControlRoot = await mkdtemp(resolve(parent, 'canvas06-e2e-fault-'));
  await chmod(processControlRoot, 0o700);
  try {
    const nonceBytes = new Map();
    const challengeBytes = new Map();
    for (const attemptOrdinal of ATTEMPT_ORDINALS) {
      const nonce = exactRandomBytes(random, 'parent nonce');
      const challenge = exactRandomBytes(random, 'challenge');
      if (nonce.equals(challenge)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault parent nonce and challenge must differ.');
      nonceBytes.set(attemptOrdinal, nonce);
      challengeBytes.set(attemptOrdinal, challenge);
    }
    const plans = await prepareCaseFaultPlans({
      reportRoot: report,
      manifest,
      caseId,
      nonces: Object.fromEntries(ATTEMPT_ORDINALS.map(ordinal => [ordinal, nonceBytes.get(ordinal).toString('hex')])),
      write
    });
    const launches = [];
    for (const [index, attemptOrdinal] of ATTEMPT_ORDINALS.entries()) {
      const faultPlanRef = plans.fault_plan_refs[index];
      const controlAttemptRoot = resolve(processControlRoot, encodeCaseId(caseId), String(attemptOrdinal));
      await mkdir(controlAttemptRoot, { recursive: true, mode: 0o700 });
      await chmod(controlAttemptRoot, 0o700);
      const challengePath = resolve(controlAttemptRoot, 'fault-launcher.challenge');
      await writeFile(challengePath, challengeBytes.get(attemptOrdinal), { flag: 'wx', mode: 0o600 });
      await chmod(challengePath, 0o600);
      await assertChallengeFile(challengePath, challengeBytes.get(attemptOrdinal));
      const response = createHmac('sha256', nonceBytes.get(attemptOrdinal))
        .update(FAULT_DOMAIN)
        .update(challengeBytes.get(attemptOrdinal))
        .update(Buffer.from(faultPlanRef.sha256, 'hex'))
        .digest('hex');
      launches.push(Object.freeze({
        case_id: caseId,
        attempt_ordinal: attemptOrdinal,
        fault_plan_ref: faultPlanRef,
        plan_raw_sha256: faultPlanRef.sha256,
        parent_nonce: nonceBytes.get(attemptOrdinal).toString('hex'),
        challenge_path: challengePath,
        challenge_response: response
      }));
    }
    return Object.freeze({ case_id: caseId, process_control_root: processControlRoot, launches: Object.freeze(launches) });
  } catch (error) {
    await rm(processControlRoot, { recursive: true, force: true });
    throw error;
  }
}

// 生命周期只能在当前 fresh attempt 已建立后写入其唯一的 Fault Plan。
async function prepareLifecycleFaultLaunch({ reportRoot, manifest, caseId, attemptOrdinal, processControlParent, write = writeFaultPlan, random = randomBytes }) {
  if (!FAULT_CASE_IDS.has(caseId) || !ATTEMPT_ORDINALS.includes(attemptOrdinal)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Lifecycle Fault Launch identity is invalid.');
  }
  const schedule = uniqueManifestCase(manifest, caseId);
  const report = resolve(reportRoot);
  const parent = await assertControlParent(processControlParent, report);
  const processControlRoot = await mkdtemp(resolve(parent, 'canvas06-e2e-fault-'));
  await chmod(processControlRoot, 0o700);
  try {
    const parentNonce = exactRandomBytes(random, 'parent nonce');
    const challenge = exactRandomBytes(random, 'challenge');
    if (parentNonce.equals(challenge)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault parent nonce and challenge must differ.');
    const written = await write({ reportRoot: report, caseId: schedule.case_id, attemptOrdinal, nonce: parentNonce.toString('hex') });
    const faultPlanRef = await readBackFaultPlan({ reportRoot: report, caseId: schedule.case_id, attemptOrdinal, reference: written });
    const controlAttemptRoot = resolve(processControlRoot, encodeCaseId(caseId), String(attemptOrdinal));
    await mkdir(controlAttemptRoot, { recursive: true, mode: 0o700 });
    await chmod(controlAttemptRoot, 0o700);
    const challengePath = resolve(controlAttemptRoot, 'fault-launcher.challenge');
    await writeFile(challengePath, challenge, { flag: 'wx', mode: 0o600 });
    await chmod(challengePath, 0o600);
    await assertChallengeFile(challengePath, challenge);
    const challengeResponse = createHmac('sha256', parentNonce)
      .update(FAULT_DOMAIN)
      .update(challenge)
      .update(Buffer.from(faultPlanRef.sha256, 'hex'))
      .digest('hex');
    return Object.freeze({
      case_id: caseId,
      attempt_ordinal: attemptOrdinal,
      fault_plan_ref: faultPlanRef,
      plan_raw_sha256: faultPlanRef.sha256,
      parent_nonce: parentNonce.toString('hex'),
      challenge_path: challengePath,
      challenge_response: challengeResponse,
      process_control_root: processControlRoot
    });
  } catch (error) {
    await rm(processControlRoot, { recursive: true, force: true });
    throw error;
  }
}

// 命令只能由 cycle 与冻结 fault case 集合决定，避免 REOPEN 被重新武装。
export function buildRuntimeLaunchCommand({ javaPath, attemptRoot, runtimePort, caseId, attemptOrdinal, cycle, faultLaunch = null }) {
  if (!['INITIAL', 'REOPEN'].includes(cycle) || !ATTEMPT_ORDINALS.includes(attemptOrdinal) || typeof caseId !== 'string') {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime cycle identity is invalid.');
  }
  if (!Number.isInteger(runtimePort) || runtimePort < 1024 || runtimePort > 65535) fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime port is invalid.');
  if (!isAbsolute(javaPath) || !isAbsolute(attemptRoot)) fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime command paths must be absolute.');
  const root = resolve(attemptRoot);
  const command = [resolve(javaPath), '-jar', resolve(root, 'inputs/build/local-runtime.jar')];
  const faultEnabled = cycle === 'INITIAL' && FAULT_CASE_IDS.has(caseId);
  if (faultEnabled) {
    if (!faultLaunch || faultLaunch.case_id !== caseId || faultLaunch.attempt_ordinal !== attemptOrdinal
        || !isDigest(faultLaunch.plan_raw_sha256) || !isDigest(faultLaunch.parent_nonce)
        || !isDigest(faultLaunch.challenge_response) || !isAbsolute(faultLaunch.challenge_path)) {
      fail('E2E_RUN_ARGUMENT_INVALID', 'Fault INITIAL requires the exact attempt launch control.');
    }
    command.push('--spring.profiles.active=release-e2e-fault');
  } else if (faultLaunch !== null) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'NONE INITIAL and every REOPEN must not receive fault launch control.');
  }
  command.push(`--server.address=127.0.0.1`, `--server.port=${runtimePort}`, `--opm.storage.root=${resolve(root, 'storage')}`);
  if (faultEnabled) {
    command.push(
      '--opm.release.e2e.enabled=true',
      '--opm.release.e2e.guard=RELEASE_E2E_FAULT_ONLY',
      `--opm.release.e2e.plan=${resolve(root, 'fault-plan.json')}`,
      `--opm.release.e2e.plan-raw-sha256=${faultLaunch.plan_raw_sha256}`,
      `--opm.release.e2e.case-id=${caseId}`,
      `--opm.release.e2e.attempt-ordinal=${attemptOrdinal}`,
      `--opm.release.e2e.parent-nonce=${faultLaunch.parent_nonce}`,
      `--opm.release.e2e.challenge=${faultLaunch.challenge_path}`,
      `--opm.release.e2e.challenge-response=${faultLaunch.challenge_response}`
    );
  }
  return Object.freeze({ mode: faultEnabled ? 'FAULT_INITIAL' : 'NORMAL', command: Object.freeze(command) });
}

export function faultLauncherReadyLine({ caseId, attemptOrdinal, planRawSha256 }) {
  if (typeof caseId !== 'string' || !ATTEMPT_ORDINALS.includes(attemptOrdinal) || !isDigest(planRawSha256)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault READY identity is invalid.');
  }
  return `E2E_FAULT_LAUNCHER_READY\t${caseId}\t${attemptOrdinal}\t${planRawSha256}`;
}

// Browser 动作的前置门槛：只接受 exact READY 行，协议错误或提前退出一律拒绝。
export function waitForFaultLauncherReady({ child, faultLaunch, timeoutMs = 120000 }) {
  if (!child?.stdout || typeof child.stdout.on !== 'function' || typeof child.once !== 'function'
      || !faultLaunch || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault child READY wait arguments are invalid.');
  }
  const expected = faultLauncherReadyLine({
    caseId: faultLaunch.case_id,
    attemptOrdinal: faultLaunch.attempt_ordinal,
    planRawSha256: faultLaunch.plan_raw_sha256
  });
  return new Promise((resolveReady, rejectReady) => {
    let pending = '';
    let stderr = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr?.off?.('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) rejectReady(error);
      else resolveReady(expected);
    };
    const onStderr = chunk => { stderr += Buffer.from(chunk).toString('utf8'); };
    const protocolFailure = line => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault child emitted an unexpected protocol line: ${line}`, 3));
    const onData = chunk => {
      pending += Buffer.from(chunk).toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines.map(value => value.endsWith('\r') ? value.slice(0, -1) : value)) {
        if (line === expected) return finish();
        if (line.startsWith('E2E_FAULT_LAUNCHER_READY\t') || line.startsWith('E2E_FAULT_')) return protocolFailure(line);
      }
    };
    const onExit = (code, signal) => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault child exited before exact READY: ${code ?? '-'} / ${signal ?? '-'}; ${stderr.slice(0, 512)}`, 3));
    const onError = error => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', error.message, 3));
    const timer = setTimeout(() => finish(new E2eRunInputError('E2E_RUN_RUNTIME_START_TIMEOUT', 'Fault child did not emit exact READY before timeout.', 3)), timeoutMs);
    child.stdout.on('data', onData);
    child.stderr?.on?.('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

export async function removeFaultChallenge({ challengePath, processControlRoot }) {
  if (!isAbsolute(challengePath) || !isAbsolute(processControlRoot) || !inside(resolve(processControlRoot), resolve(challengePath))) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault challenge path escapes process control root.');
  }
  const details = await lstat(challengePath).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge file identity changed before removal.');
  }
  await rm(challengePath, { force: false });
}

function uniqueManifestCase(manifest, caseId) {
  if (!manifest || !Array.isArray(manifest.cases) || typeof caseId !== 'string') {
    fail('E2E_RUN_CASE_SET_INVALID', 'A verified Manifest case is required to prepare Fault Plans.');
  }
  const matches = manifest.cases.filter(entry => entry?.case_id === caseId);
  if (matches.length !== 1 || matches[0].suite_id !== caseId.slice(0, 'E2E-CANVAS-000'.length)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Fault Plan case does not uniquely match the Manifest schedule.');
  }
  return matches[0];
}

async function assertControlParent(value, reportRoot) {
  if (!isAbsolute(value)) fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must be absolute.');
  const parent = resolve(value);
  let details;
  try { details = await lstat(parent); } catch { fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must already exist.'); }
  if (details.isSymbolicLink() || !details.isDirectory() || inside(reportRoot, parent) || inside(parent, reportRoot) || parent === reportRoot) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must be isolated from Report evidence.');
  }
  return parent;
}

function exactRandomBytes(random, label) {
  const bytes = random(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault ${label} CSPRNG output must be exactly 32 bytes.`);
  return bytes;
}

async function assertChallengeFile(path, expected) {
  const details = await lstat(path);
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1 || (details.mode & 0o777) !== 0o600) {
    fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge file identity or mode is invalid.');
  }
  const bytes = await readFile(path);
  if (!bytes.equals(expected)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge bytes differ after publication.');
}

async function readBackFaultPlan({ reportRoot, caseId, attemptOrdinal, reference }) {
  const root = resolve(reportRoot);
  if (!reference || reference.kind !== 'FAULT_PLAN' || reference.path !== faultPlanPath(caseId, attemptOrdinal)
      || !safeRelativePath(reference.path)) {
    fail('E2E_INPUT_INVALID', 'Fault Plan writer returned an unexpected reference.');
  }
  const path = resolve(root, reference.path);
  if (!inside(root, path)) fail('E2E_INPUT_INVALID', 'Fault Plan reference escapes its Report staging root.');
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Fault Plan was not published.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_INPUT_INVALID', 'Fault Plan must be a single-link regular file.');
  }

  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
    fail('E2E_INPUT_INVALID', 'Fault Plan raw bytes differ from its writer reference.');
  }
  let faultPlan;
  try { faultPlan = JSON.parse(bytes.toString('utf8')); } catch { fail('E2E_INPUT_INVALID', 'Fault Plan must be valid JSON.'); }
  if (!bytes.equals(Buffer.from(`${canonicalizeJcs(faultPlan)}\n`, 'utf8'))) {
    fail('E2E_INPUT_INVALID', 'Fault Plan bytes are not the canonical atomic publication.');
  }
  verifyFaultPlan({ caseId, attemptOrdinal, faultPlan });
  return Object.freeze(reference);
}

function faultPlanPath(caseId, attemptOrdinal) {
  return `${attemptRelativeRoot(caseId, attemptOrdinal)}/fault-plan.json`;
}

function encodeCaseId(value) {
  return Buffer.from(value, 'utf8').toString('hex').match(/../g).map(hex => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._-]$/.test(character) ? character : `%${hex.toUpperCase()}`;
  }).join('');
}

function inside(root, child) {
  const relation = relative(root, child);
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
