import { createHash, createHmac, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { verifyFaultPlan, writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';

const ATTEMPT_ORDINALS = Object.freeze([1, 2]);
const FAULT_CASE_IDS = new Set([
  'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.PERSISTENCE_FAILED',
  'E2E-CANVAS-007.READONLY'
]);
const FAULT_DOMAIN = Buffer.from('OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001\0', 'ascii');

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
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) rejectReady(error);
      else resolveReady(expected);
    };
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
    const onExit = (code, signal) => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault child exited before exact READY: ${code ?? '-'} / ${signal ?? '-'}.`, 3));
    const onError = error => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', error.message, 3));
    const timer = setTimeout(() => finish(new E2eRunInputError('E2E_RUN_RUNTIME_START_TIMEOUT', 'Fault child did not emit exact READY before timeout.', 3)), timeoutMs);
    child.stdout.on('data', onData);
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
  return `attempts/${encodeCaseId(caseId)}/${attemptOrdinal}/fault-plan.json`;
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
