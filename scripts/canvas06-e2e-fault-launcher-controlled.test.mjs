import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { assertSourceClean, FAULT_2A_DELTA, ORIGIN_SOURCE_COMMIT } from './canvas06-unified-production-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { verifyPreflightInput } from './release-canvas06-e2e-fault-launcher-preflight-input.mjs';

const MANIFEST_BASENAME = 'dev-canvas-06-e2e-manifest.json';
const DEPENDENCY_IDS = Object.freeze(['FLCP-D01-SOURCE', 'FLCP-D02-CONTROLLED_BUNDLE', 'FLCP-D03-RUNTIME', 'FLCP-D04-ENVIRONMENT', 'FLCP-D05-MANIFEST', 'FLCP-D06-CASE_SCHEDULE', 'FLCP-D07-PORTS', 'FLCP-D08-JARIT', 'FLCP-D09-BROWSER', 'FLCP-D10A-GATE-PREFLIGHT']);
const IMPLEMENTATION_DELTA = Object.freeze(FAULT_2A_DELTA.map(([status, path]) => Object.freeze([path, status])));
const execFileAsync = promisify(execFile);
const FAULT_CASES = Object.freeze([
  ['E2E-CANVAS-007.ASSET_MISSING', 'ASSET_MISSING'],
  ['E2E-CANVAS-007.PERSISTENCE_FAILED', 'PERSISTENCE_FAILED'],
  ['E2E-CANVAS-007.READONLY', 'READONLY']
]);

export class ControlledRunError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseControlledOptions(argv) {
  const names = ['source-root', 'controlled-bundle-root', 'manifest-root', 'manifest', 'java-home', 'browser-executable', 'fixed-handoff', 'production-activation-root', 'attempt-parent', 'process-control-parent', 'evidence-parent'];
  if (!Array.isArray(argv) || argv[0] !== '--run-controlled' || argv.length !== names.length * 2 + 1) fail('E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID', 'CLI 参数数量或 --run-controlled 位置错误。');
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const name = typeof flag === 'string' && flag.startsWith('--') && !flag.includes('=') ? flag.slice(2) : '';
    if (!names.includes(name) || values.has(name) || typeof value !== 'string' || value.length === 0 || value.startsWith('--')) fail('E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID', 'CLI 参数未知、重复或缺失。');
    if (name === 'manifest') {
      if (value !== MANIFEST_BASENAME) fail('E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID', 'manifest 必须是冻结 basename。');
    } else if (!isAbsolute(value) || resolve(value) === resolve('/')) {
      fail('E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID', '路径必须为非根绝对路径。');
    }
    values.set(name, name === 'manifest' ? value : resolve(value));
  }
  const options = Object.freeze(Object.fromEntries(values));
  const roots = ['source-root', 'controlled-bundle-root', 'manifest-root', 'java-home', 'fixed-handoff', 'production-activation-root', 'attempt-parent', 'process-control-parent', 'evidence-parent'];
  for (let left = 0; left < roots.length; left += 1) for (let right = left + 1; right < roots.length; right += 1) {
    const a = options[roots[left]]; const b = options[roots[right]];
    if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) fail('E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID', '受控 root 必须物理隔离。');
  }
  return options;
}

export function checkSourceChain(sourceRoot) {
  try {
    const candidate = git(sourceRoot, ['--no-replace-objects', 'rev-parse', 'HEAD']);
    const contract = parent(sourceRoot, candidate);
    const faultContract = parent(sourceRoot, contract);
    const origin = parent(sourceRoot, faultContract);
    const options = {
      'source-chain-target': 'FAULT_2A',
      'source-commit': candidate,
      'origin-source-commit': origin,
      'fault-contract-source-commit': faultContract,
      'schema-conformance-source-commit': contract,
      'fault-2a-source-commit': candidate
    };
    assertSourceClean(sourceRoot, options);
    if (origin !== ORIGIN_SOURCE_COMMIT) throw new Error('origin mismatch');
    return Object.freeze({ status: 'READY', detail_code: 'READY', candidate, contract, origin });
  } catch {
    return Object.freeze({ status: 'MISMATCH', detail_code: 'SOURCE_COMMIT_NOT_READY', candidate: null, contract: null, origin: null });
  }
}

export function buildBlockedPreflightReport(sourceRoot) {
  const source = checkSourceChain(sourceRoot);
  const dependency_results = DEPENDENCY_IDS.map(dependency_id => ({
    dependency_id,
    status: dependency_id === 'FLCP-D01-SOURCE' ? source.status : 'MISSING',
    detail_code: dependency_id === 'FLCP-D01-SOURCE' ? source.detail_code : 'NOT_IMPLEMENTED',
    evidence_refs: []
  }));
  const report = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001',
    schema_version: '0.2',
    status: 'BLOCKED_BY_DEPENDENCY',
    origin_base_source_commit: ORIGIN_SOURCE_COMMIT,
    contract_base_source_commit: source.contract,
    candidate_source_commit: source.candidate,
    manifest_ref: null,
    preflight_descriptor_ref: null,
    baseline_raw_refs_sha256: '69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e',
    implementation_delta: IMPLEMENTATION_DELTA.map(([path, expected_status]) => ({ path, expected_status, observed_status: 'ABSENT' })),
    dependency_results,
    blocking_dependency_ids: dependency_results.map(item => item.dependency_id),
    playwright_command: null,
    report_payload_sha256: ''
  };
  report.report_payload_sha256 = sha(canonicalizeJcs(without(report, 'report_payload_sha256')));
  return Object.freeze(report);
}

export async function verifyFrozenPreflight(options) {
  const source = checkSourceChain(options['source-root']);
  if (source.status !== 'READY') return Object.freeze({ source, preflight: null });
  try {
    const preflight = await verifyPreflightInput({
      sourceRoot: options['source-root'],
      bundleRoot: options['controlled-bundle-root'],
      fixedHandoff: options['fixed-handoff'],
      activationRoot: options['production-activation-root']
    });
    return Object.freeze({ source, preflight });
  } catch (error) {
    return Object.freeze({ source, preflight: null, error: error?.code ?? 'PRELIGHT_INPUT_INVALID' });
  }
}

export async function buildPreflightReport(options) {
  const verified = await verifyFrozenPreflight(options);
  const ready = new Set();
  let descriptorRef = null;
  let manifestRef = null;
  if (verified.preflight) {
    for (const id of ['FLCP-D02-CONTROLLED_BUNDLE', 'FLCP-D03-RUNTIME', 'FLCP-D04-ENVIRONMENT', 'FLCP-D08-JARIT', 'FLCP-D09-BROWSER', 'FLCP-D10A-GATE-PREFLIGHT']) ready.add(id);
    const ref = verified.preflight.bundle.preflight_descriptor;
    descriptorRef = { bundle_id: verified.preflight.bundle.descriptor.bundle_id, bundle_identity_sha256: verified.preflight.bundle.descriptor.bundle_identity_sha256, path: ref.path, byte_length: ref.byte_length, sha256: ref.sha256 };
    try {
      manifestRef = await verifyActualManifest(options, verified.preflight);
      ready.add('FLCP-D05-MANIFEST');
      ready.add('FLCP-D06-CASE_SCHEDULE');
      ready.add('FLCP-D07-PORTS');
    } catch {
      // Manifest/D05 必须由官方 verifier 和字段级 join 同时通过。
    }
  }
  const dependency_results = DEPENDENCY_IDS.map(dependency_id => {
    if (dependency_id === 'FLCP-D01-SOURCE') return { dependency_id, status: verified.source.status, detail_code: verified.source.detail_code, evidence_refs: [] };
    if (ready.has(dependency_id)) return { dependency_id, status: 'READY', detail_code: 'READY', evidence_refs: [] };
    return { dependency_id, status: 'MISSING', detail_code: verified.error ?? 'NOT_IMPLEMENTED', evidence_refs: [] };
  });
  const isReady = dependency_results.every(item => item.status === 'READY');
  const report = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001', schema_version: '0.2', status: isReady ? 'READY_TO_RUN' : 'BLOCKED_BY_DEPENDENCY',
    origin_base_source_commit: ORIGIN_SOURCE_COMMIT, contract_base_source_commit: verified.source.contract, candidate_source_commit: verified.source.candidate,
    manifest_ref: manifestRef, preflight_descriptor_ref: descriptorRef, baseline_raw_refs_sha256: '69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e',
    implementation_delta: IMPLEMENTATION_DELTA.map(([path, expected_status]) => ({ path, expected_status, observed_status: verified.source.status === 'READY' ? expected_status : 'ABSENT' })),
    dependency_results, blocking_dependency_ids: dependency_results.filter(item => item.status !== 'READY').map(item => item.dependency_id), playwright_command: isReady ? await controlledPlaywrightCommand() : null, report_payload_sha256: ''
  };
  report.report_payload_sha256 = sha(canonicalizeJcs(without(report, 'report_payload_sha256')));
  return Object.freeze(report);
}

export async function executeControlledRun(options) {
  const report = await buildPreflightReport(options);
  const reportBytes = Buffer.from(`${canonicalizeJcs(report)}\n`, 'utf8');
  if (report.status !== 'READY_TO_RUN') return Object.freeze({ report, report_bytes: reportBytes, exit_code: 3 });
  const verified = await verifyFrozenPreflight(options);
  if (!verified.preflight) throw new ControlledRunError('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', 'READY Preflight 无法重取验证输入。', 4);
  const runId = `dev-canvas-06.fault-launcher-run.${report.manifest_ref.sha256.slice(0, 12)}.${report.preflight_descriptor_ref.sha256.slice(0, 12)}`;
  const staging = resolve(options['evidence-parent'], `.${runId}.staging`);
  const finalRoot = resolve(options['evidence-parent'], runId);
  try {
    await assertEvidenceRootsAbsent(staging, finalRoot);
    await mkdir(staging, { recursive: false, mode: 0o700 });
    await writeRawAtomic(resolve(staging, 'fault-launcher/preflight-report.json'), reportBytes);
    const published = await publishInvocationContext({ options, report, preflight: verified.preflight });
    const child = await runControlledPlaywright({ sourceRoot: options['source-root'], contextRef: published.ref, command: report.playwright_command });
    const observation = await verifyControlledEvidenceRoot({ staging, report, descriptorRef: report.preflight_descriptor_ref });
    await fsyncTree(staging);
    await rename(staging, finalRoot);
    await fsyncDirectory(options['evidence-parent']);
    await verifyControlledEvidenceRoot({ staging: finalRoot, report, descriptorRef: report.preflight_descriptor_ref });
    return Object.freeze({ report, report_bytes: reportBytes, exit_code: observation.observation_status === 'PASS_MATCHED' && child.exit_code === 0 ? 0 : 1 });
  } catch (error) {
    throw new ControlledRunError('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', error?.message ?? '受控 evidence 事务失败。', 4);
  }
}

export async function publishInvocationContext({ options, report, preflight }) {
  if (report.status !== 'READY_TO_RUN' || report.blocking_dependency_ids.length !== 0) fail('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', '依赖未全部 READY，禁止发布 Invocation Context。', 4);
  const descriptorRef = report.preflight_descriptor_ref;
  const runId = `dev-canvas-06.fault-launcher-run.${report.manifest_ref.sha256.slice(0, 12)}.${descriptorRef.sha256.slice(0, 12)}`;
  const staging = resolve(options['evidence-parent'], `.${runId}.staging`);
  const sourceRoot = await realpath(options['source-root']);
  const manifestRoot = await realpath(options['manifest-root']);
  const processRoot = await realpath(options['process-control-parent']);
  const java = await executableRef(resolve(options['java-home'], 'bin/java'), 'JAVA_EXECUTABLE');
  const browser = await executableRef(options['browser-executable'], 'BROWSER_EXECUTABLE');
  const handoff = await rawAbsoluteRef(options['fixed-handoff'], 'FIXED_HANDOFF');
  const context = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PLAYWRIGHT-CONTEXT-001', schema_version: '0.1', controlled_run_id: runId,
    source_root_realpath: sourceRoot, controlled_bundle_root_realpath: await realpath(options['controlled-bundle-root']), manifest_root_realpath: manifestRoot,
    manifest_ref: report.manifest_ref, profile_asset_root_realpath: await realpath(resolve(manifestRoot, 'inputs/upstream/profile-assets')),
    java_executable_ref: java, browser_executable_ref: browser, fixed_handoff_ref: handoff,
    activation_input_root_realpath: await realpath(options['production-activation-root']), attempt_parent_realpath: await realpath(options['attempt-parent']), process_control_parent_realpath: processRoot,
    evidence_staging_root_realpath: staging, preflight_descriptor_ref: descriptorRef,
    preflight_report_ref: { kind: 'FAULT_LAUNCHER_PREFLIGHT_REPORT', path: 'fault-launcher/preflight-report.json', byte_length: Buffer.byteLength(`${canonicalizeJcs(report)}\n`), sha256: sha(Buffer.from(`${canonicalizeJcs(report)}\n`, 'utf8')) },
    execution_schedule: expandSchedule(preflight.descriptor), context_payload_sha256: ''
  };
  context.context_payload_sha256 = sha(canonicalizeJcs(without(context, 'context_payload_sha256')));
  const contextId = `dev-canvas-06.fault-launcher-playwright.${report.manifest_ref.sha256.slice(0, 12)}.${descriptorRef.sha256.slice(0, 12)}`;
  const finalPath = resolve(processRoot, `${contextId}.json`); const tmpPath = resolve(processRoot, `.${contextId}.json.tmp`);
  await writeExclusiveCanonical(tmpPath, finalPath, context);
  const bytes = await readFile(finalPath);
  return Object.freeze({ context, ref: Object.freeze({ kind: 'CONTROLLED_PLAYWRIGHT_CONTEXT', path: finalPath, byte_length: bytes.length, sha256: sha(bytes) }) });
}

async function verifyActualManifest(options, preflight) {
  const root = options['manifest-root'];
  const path = resolve(root, MANIFEST_BASENAME);
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error('unsafe manifest');
  const bytes = await readFile(path);
  if (bytes.length === 0 || bytes[0] === 0xef || bytes.includes(0x0d) || bytes.at(-1) !== 0x0a) throw new Error('manifest raw form');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (`${canonicalizeJcs(manifest)}\n` !== bytes.toString('utf8')) throw new Error('manifest is not canonical');
  const profileRoot = resolve(root, 'inputs/upstream/profile-assets');
  await execFileAsync(process.execPath, [resolve(options['source-root'], 'scripts/verify-canvas06-e2e-manifest-v02.mjs'), '--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', options['controlled-bundle-root'], '--source-root', options['source-root'], '--manifest-root', root, '--manifest', MANIFEST_BASENAME, '--profile-asset-root', profileRoot], { cwd: options['source-root'], shell: false, encoding: 'utf8' });
  if (manifest.schema_id !== 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001' || manifest.schema_version !== '0.2' || manifest.manifest_version !== '0.2.0' || manifest.source_build?.source_commit !== preflight.descriptor.source_commit || manifest.source_build?.dirty_before_build !== false) throw new Error('manifest identity');
  const runtime = manifest.source_build.local_runtime_jar;
  const descriptorRuntime = preflight.descriptor.runtime_jar_ref;
  if (!sameRef(runtime, descriptorRuntime) || !sameRef(runtime, preflight.jarit.runtime_jar_ref)) throw new Error('runtime join');
  const entries = FAULT_CASES.map(([caseId, faultKind]) => {
    const entry = manifest.cases?.filter(item => item.case_id === caseId) ?? [];
    if (entry.length !== 1 || entry[0].suite_id !== 'E2E-CANVAS-007' || entry[0].expectation !== 'BLOCKED' || entry[0].viewport_id !== 'VP-1440X900' || entry[0].zoom_id !== 'Z-100' || entry[0].driver_id !== 'DRIVER-COMMON') throw new Error('fault case closure');
    return { caseId, faultKind };
  });
  const schedule = preflight.descriptor.fault_attempt_schedule;
  const ports = preflight.descriptor.port_allocations;
  if (!Array.isArray(schedule) || schedule.length !== 6 || !Array.isArray(ports) || ports.length !== 6) throw new Error('schedule closure');
  const observedPorts = new Set();
  for (const [index, item] of schedule.entries()) {
    const expected = entries[Math.floor(index / 2)]; const ordinal = index % 2 + 1;
    const port = ports[index];
    if (item.case_id !== expected.caseId || item.fault_kind !== expected.faultKind || item.attempt_ordinal !== ordinal || JSON.stringify(item.process_cycles) !== JSON.stringify(['INITIAL', 'REOPEN']) || port.schedule_id !== item.schedule_id || port.allocation_id !== item.port_allocation_id || port.host !== '127.0.0.1' || !validPort(port.runtime_port) || !validPort(port.web_port)) throw new Error('schedule item closure');
    observedPorts.add(port.runtime_port); observedPorts.add(port.web_port);
  }
  if (observedPorts.size !== 12) throw new Error('port uniqueness');
  return Object.freeze({ kind: 'E2E_MANIFEST', path: MANIFEST_BASENAME, byte_length: bytes.length, sha256: sha(bytes) });
}

function parent(root, commit) { const fields = git(root, ['--no-replace-objects', 'rev-list', '--parents', '-n', '1', commit]).split(' '); if (fields.length !== 2) throw new Error('single parent required'); return fields[1]; }
function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
function without(value, key) { const copy = { ...value }; delete copy[key]; return copy; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function validPort(value) { return Number.isInteger(value) && value >= 1024 && value <= 65535; }
function sameRef(left, right) { return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function expandSchedule(descriptor) { const ports = new Map(descriptor.port_allocations.map(item => [item.schedule_id, item])); const values = []; for (const [index, schedule] of descriptor.fault_attempt_schedule.entries()) { const port = ports.get(schedule.schedule_id); for (const process_cycle of schedule.process_cycles) values.push({ ordinal: values.length + 1, schedule_id: schedule.schedule_id, case_id: schedule.case_id, attempt_ordinal: schedule.attempt_ordinal, process_cycle, runtime_port: port.runtime_port, web_port: port.web_port }); } if (values.length !== 12 || new Set(values.flatMap(item => [item.runtime_port, item.web_port])).size !== 12) fail('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', 'Descriptor schedule 无法形成唯一 12 cycle Context。', 4); return values; }
async function executableRef(path, kind) { const target = await realpath(path); const info = await lstat(target); if (info.isSymbolicLink() || !info.isFile()) fail('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', '可执行文件不是常规文件。', 4); const bytes = await readFile(target); return { kind, path: target, byte_length: bytes.length, sha256: sha(bytes) }; }
async function rawAbsoluteRef(path, kind) { const target = await realpath(path); const info = await lstat(target); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', '固定 Handoff 不安全。', 4); const bytes = await readFile(target); return { kind, path: target, byte_length: bytes.length, sha256: sha(bytes) }; }
async function writeExclusiveCanonical(tmp, finalPath, value) { await mkdir(resolve(finalPath, '..'), { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; }); const bytes = Buffer.from(`${canonicalizeJcs(value)}\n`, 'utf8'); const handle = await open(tmp, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } await rename(tmp, finalPath); }
async function controlledPlaywrightCommand() { return Object.freeze([await realpath(process.execPath), 'node_modules/@playwright/test/cli.js', 'test', 'tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts', '--config=tests/e2e/release/dev-canvas-06/playwright.release.config.ts', '--workers=1', '--retries=0']); }
async function assertEvidenceRootsAbsent(staging, finalRoot) { for (const path of [staging, finalRoot]) await lstat(path).then(() => fail('E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED', 'Evidence destination already exists.', 4)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
async function writeRawAtomic(path, bytes) { const parent = dirname(path); await mkdir(parent, { recursive: true, mode: 0o700 }); const temporary = resolve(parent, '.preflight-report.json.tmp'); const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } if (!(await readFile(temporary)).equals(bytes)) throw new Error('Preflight mirror bytes drifted.'); await lstat(path).then(() => { throw new Error('Preflight mirror destination exists.'); }).catch(error => { if (error.code !== 'ENOENT') throw error; }); await rename(temporary, path); await fsyncDirectory(parent); }
async function runControlledPlaywright({ sourceRoot, contextRef, command }) { const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OPM_CANVAS06_FAULT_'))); environment.OPM_CANVAS06_FAULT_CONTROL_CONTEXT_REF = canonicalizeJcs(contextRef); try { await execFileAsync(command[0], command.slice(1), { cwd: sourceRoot, env: environment, shell: false, encoding: 'utf8' }); return Object.freeze({ exit_code: 0 }); } catch (error) { if (typeof error?.code === 'number' && error.code === 1) return Object.freeze({ exit_code: 1 }); throw error; } }
async function verifyControlledEvidenceRoot({ staging, report, descriptorRef }) { const faultRoot = resolve(staging, 'fault-launcher'); const entries = await readdir(faultRoot); if (entries.length !== 2 || entries.sort().join(',') !== 'gate-observation.json,preflight-report.json') throw new Error('Controlled evidence layout is invalid.'); const reportBytes = await readFile(resolve(faultRoot, 'preflight-report.json')); if (!reportBytes.equals(Buffer.from(`${canonicalizeJcs(report)}\n`, 'utf8'))) throw new Error('Preflight mirror differs from stdout report.'); const bytes = await readFile(resolve(faultRoot, 'gate-observation.json')); const observation = JSON.parse(bytes.toString('utf8')); if (`${canonicalizeJcs(observation)}\n` !== bytes.toString('utf8') || observation.preflight_descriptor_ref?.sha256 !== descriptorRef.sha256 || observation.preflight_report_ref?.sha256 !== sha(reportBytes) || observation.observation_payload_sha256 !== sha(Buffer.from(canonicalizeJcs(without(observation, 'observation_payload_sha256')), 'utf8'))) throw new Error('Gate observation is invalid.'); return Object.freeze(observation); }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function fsyncTree(path) { const entries = await readdir(path, { withFileTypes: true }); for (const entry of entries) { const child = resolve(path, entry.name); if (entry.isDirectory()) await fsyncTree(child); else { const handle = await open(child, 'r'); try { await handle.sync(); } finally { await handle.close(); } } } await fsyncDirectory(path); }
function fail(code, message, exitCode = 2) { throw new ControlledRunError(code, message, exitCode); }

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href && process.argv.includes('--run-controlled')) {
  (async () => {
    try {
    const options = parseControlledOptions(process.argv.slice(2));
    const result = await executeControlledRun(options);
    process.stdout.write(result.report_bytes);
    process.exitCode = result.exit_code;
    } catch (error) {
    process.stderr.write(`${error.code ?? 'E2E_FAULT_LAUNCHER_CONTROLLED_INTERNAL_ERROR'}\n`);
    process.exitCode = error.exitCode ?? 4;
    }
  })();
}

test('受控 CLI 只接受唯一的绝对路径调用形状', () => {
  const argv = ['--run-controlled', '--source-root', '/source', '--controlled-bundle-root', '/bundle', '--manifest-root', '/manifest', '--manifest', MANIFEST_BASENAME, '--java-home', '/jdk', '--browser-executable', '/browser', '--fixed-handoff', '/handoff', '--production-activation-root', '/activation', '--attempt-parent', '/attempt', '--process-control-parent', '/control', '--evidence-parent', '/evidence'];
  assert.equal(parseControlledOptions(argv)['manifest'], MANIFEST_BASENAME);
  assert.throws(() => parseControlledOptions([...argv, '--unknown', '/x']), error => error.code === 'E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID');
  assert.throws(() => parseControlledOptions(argv.map(value => value === MANIFEST_BASENAME ? 'other.json' : value)), error => error.code === 'E2E_FAULT_LAUNCHER_CONTROLLED_ARGUMENT_INVALID');
});

test('依赖未 READY 时只返回 BLOCKED Preflight，零 Context 和 evidence 输出', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-controlled-parent-'));
  const paths = Object.fromEntries(await Promise.all(['bundle', 'manifest', 'java', 'activation', 'attempt', 'control', 'evidence'].map(async name => {
    const path = resolve(root, name);
    await mkdir(path);
    return [name, path];
  })));
  const browser = resolve(root, 'browser');
  const handoff = resolve(root, 'handoff.json');
  await Promise.all([writeFile(browser, 'browser\n'), writeFile(handoff, '{}\n')]);
  const result = await executeControlledRun({
    'source-root': resolve('.'), 'controlled-bundle-root': paths.bundle, 'manifest-root': paths.manifest, manifest: MANIFEST_BASENAME,
    'java-home': paths.java, 'browser-executable': browser, 'fixed-handoff': handoff, 'production-activation-root': paths.activation,
    'attempt-parent': paths.attempt, 'process-control-parent': paths.control, 'evidence-parent': paths.evidence
  });
  assert.equal(result.report.status, 'BLOCKED_BY_DEPENDENCY');
  assert.equal(result.exit_code, 3);
  assert.deepEqual(await readdir(paths.control), []);
  assert.deepEqual(await readdir(paths.evidence), []);
});
