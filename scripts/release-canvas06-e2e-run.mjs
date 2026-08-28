import { createHash, createHmac, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

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
