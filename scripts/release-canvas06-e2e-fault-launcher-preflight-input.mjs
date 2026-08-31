import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';
import { verifyGoldenEnvironmentV02 } from './verify-canvas06-golden-environment-v02.mjs';
import { verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(new URL('..', import.meta.url).pathname);
const BUNDLE_V02_SCHEMA = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json'), 'utf8'));
const DESCRIPTOR_SCHEMA = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json'), 'utf8'));
const JARIT_SCHEMA = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validateBundleV02 = ajv.compile(BUNDLE_V02_SCHEMA);
const validateDescriptor = ajv.compile(DESCRIPTOR_SCHEMA);
const validateJarit = ajv.compile(JARIT_SCHEMA);

const SCHEDULE = Object.freeze([
  ['FL-SCH-01', 'E2E-CANVAS-007.ASSET_MISSING', 'ASSET_MISSING', 1, 'FL-PORT-01'],
  ['FL-SCH-02', 'E2E-CANVAS-007.ASSET_MISSING', 'ASSET_MISSING', 2, 'FL-PORT-02'],
  ['FL-SCH-03', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'PERSISTENCE_FAILED', 1, 'FL-PORT-03'],
  ['FL-SCH-04', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'PERSISTENCE_FAILED', 2, 'FL-PORT-04'],
  ['FL-SCH-05', 'E2E-CANVAS-007.READONLY', 'READONLY', 1, 'FL-PORT-05'],
  ['FL-SCH-06', 'E2E-CANVAS-007.READONLY', 'READONLY', 2, 'FL-PORT-06']
].map(([schedule_id, case_id, fault_kind, attempt_ordinal, port_allocation_id]) => Object.freeze({ schedule_id, case_id, fault_kind, attempt_ordinal, process_cycles: Object.freeze(['INITIAL', 'REOPEN']), port_allocation_id })));

const TEST_METHOD_IDS = Object.freeze([
  'detectsPlanDriftDuringChildShutdown',
  'rejectsAJarWhoseEmbeddedSchemaDiffersFromTheFrozenRawBytes',
  'rejectsAPartialTupleBeforeSpringBootStarts',
  'rejectsAnInvalidChallengeFromTheExactJar',
  'rejectsShutdownWhenThePlannedSingleTriggerDidNotOccur',
  'startsOnlyTheExactJarWithACompleteTupleAndEmitsReady'
]);
const EMPTY_ARRAY_SHA256 = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';

export class PreflightInputError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.name = 'PreflightInputError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  const options = parseProducerOptions(argv);
  const now = runtime.now ?? (() => new Date());
  const run = runtime.run ?? runCommand;
  const allocatePorts = runtime.allocatePorts ?? allocateLoopbackPorts;
  const generatedAt = canonicalDescriptorUtcSecond(now());
  await assertDistinctRoots(options, ['source-root', 'controlled-input-root', 'output-parent', 'golden-environment', 'fixed-handoff', 'production-activation-root']);
  const source = await verifyCleanSource(options['source-root']);
  const legacy = await verifyControlledInputBundle({ bundleRoot: options['controlled-input-root'], consumer: 'E2E' });
  const java = await verifyJavaHome(options['java-home'], run);
  const environment = await verifyGoldenEnvironment(options['golden-environment']);
  const browser = await executableRef(options['browser-executable']);
  if (!sameExecutable(environment.browser_executable, browser)) fail('PRELIGHT_INPUT_INVALID', 'Browser executable does not match Golden Environment.');
  const gate = await observeGate({ fixedHandoff: options['fixed-handoff'], activationRoot: options['production-activation-root'], expectedHandoff: legacy.references.handoff_ref, observedAt: generatedAt });
  const outputParent = await safeDirectory(options['output-parent'], 'output parent');
  const buildTokens = [options['maven-executable'], '-pl', 'services/local-runtime', '-am', '-DskipTests', 'package'];
  const jaritTokens = [options['maven-executable'], '-pl', 'services/local-runtime', '-Dtest=E2EFaultLauncherJarIT', 'test'];
  await run(buildTokens, { cwd: source.root, env: { JAVA_HOME: options['java-home'] } });
  await run(jaritTokens, { cwd: source.root, env: { JAVA_HOME: options['java-home'] } });
  const after = await verifyCleanSource(options['source-root']);
  if (after.commit !== source.commit) fail('PRELIGHT_INPUT_INVALID', 'Source commit changed while producing controlled input.');
  const sourceJar = resolve(source.root, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar');
  const sourceXml = resolve(source.root, 'services/local-runtime/target/surefire-reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml');
  const jar = await regularFileRef(source.root, sourceJar, 'LOCAL_RUNTIME_JAR', 'source Runtime JAR');
  const xml = await readSurefireXml(source.root, sourceXml);
  const ports = await allocatePorts(12);
  if (!Array.isArray(ports) || ports.length !== 12 || new Set(ports).size !== 12 || ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535)) fail('PRELIGHT_INPUT_INVALID', 'Port allocator did not provide twelve unique loopback ports.');
  const stagingParent = resolve(outputParent, `.canvas06-controlled-preflight-${process.pid}-${Date.now()}`);
  let staging = resolve(stagingParent, 'working');
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    const copiedTrust = {};
    for (const [key, reference] of Object.entries(legacy.references)) copiedTrust[key] = await copyVerifiedFile(legacy.root, reference, staging, reference.path);
    const runtimeRef = await copyVerifiedFile(source.root, jar, staging, 'fault-launcher/inputs/build/local-runtime.jar');
    const xmlRef = await copyVerifiedFile(source.root, xml.ref, staging, 'fault-launcher/reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml');
    const environmentRef = await copyVerifiedFile(dirname(resolve(options['golden-environment'])), await rawFileRef(options['golden-environment'], 'GOLDEN_ENVIRONMENT'), staging, 'fault-launcher/environment/golden-environment.json');
    const jarit = createJaritReport({ generatedAt, sourceCommit: source.commit, runtimeRef, java, buildTokens, jaritTokens, xmlRef, methods: xml.methods });
    await writeCanonical(staging, 'fault-launcher/reports/jarit-report.json', jarit);
    const jaritRef = await regularFileRef(staging, resolve(staging, 'fault-launcher/reports/jarit-report.json'), 'FAULT_LAUNCHER_JARIT_REPORT', 'JarIT report');
    const descriptor = createDescriptor({ generatedAt, sourceCommit: source.commit, runtimeRef, jaritRef, environmentRef, browser, ports, gate });
    await writeCanonical(staging, 'fault-launcher/preflight-descriptor.json', descriptor);
    const descriptorRef = await regularFileRef(staging, resolve(staging, 'fault-launcher/preflight-descriptor.json'), 'FAULT_LAUNCHER_PREFLIGHT_DESCRIPTOR', 'Preflight descriptor');
    const bundle = createBundleV02({ copiedTrust, descriptorRef });
    await writeCanonical(staging, 'controlled-bundle.json', bundle);
    const namedStaging = resolve(stagingParent, bundle.bundle_id);
    await rename(staging, namedStaging);
    staging = namedStaging;
    await verifyPreflightInput({ sourceRoot: source.root, bundleRoot: staging, fixedHandoff: options['fixed-handoff'], activationRoot: options['production-activation-root'] });
    const finalRoot = resolve(outputParent, bundle.bundle_id);
    await lstat(finalRoot).then(() => fail('PRELIGHT_INPUT_INVALID', 'Controlled Bundle destination already exists.')).catch(error => { if (!(error instanceof PreflightInputError) && error.code !== 'ENOENT') throw error; });
    await fsyncTree(staging);
    await rename(staging, finalRoot);
    await rm(stagingParent, { recursive: true, force: true });
    await fsyncDirectory(outputParent);
    await verifyPreflightInput({ sourceRoot: source.root, bundleRoot: finalRoot, fixedHandoff: options['fixed-handoff'], activationRoot: options['production-activation-root'] });
    return Object.freeze({ bundle_root: finalRoot, bundle_id: bundle.bundle_id });
  } catch (error) {
    await rm(stagingParent, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyPreflightInput({ sourceRoot, bundleRoot, fixedHandoff, activationRoot }) {
  const source = await verifyCleanSource(sourceRoot);
  const bundle = await verifyControlledInputBundle({ bundleRoot, consumer: 'FAULT_LAUNCHER' });
  if (!validateBundleV02(bundle.descriptor)) fail('PRELIGHT_INPUT_INVALID', 'Bundle 0.2 Schema validation failed.');
  const descriptor = parseJson(await readFile(bundle.preflight_descriptor.absolute_path), 'Preflight descriptor');
  verifyDescriptorShape(descriptor);
  await verifyRawRef(bundle.root, descriptor.runtime_jar_ref, 'Runtime JAR');
  const jaritBytes = await verifyRawRef(bundle.root, descriptor.jarit_report_ref, 'JarIT report');
  const jarit = parseJson(jaritBytes, 'JarIT report');
  verifyJaritReport(jarit, descriptor, source.commit);
  await verifyRawRef(bundle.root, jarit.surefire_xml_ref, 'Surefire XML');
  const environmentBytes = await verifyRawRef(bundle.root, descriptor.golden_environment_ref, 'Golden Environment');
  const environment = parseJson(environmentBytes, 'Golden Environment');
  verifyGoldenEnvironmentV02(environment, { sourceDateEpoch: epoch(descriptor.generated_at) });
  if (!sameExecutable(environment.browser_executable, descriptor.browser_executable_ref)) fail('PRELIGHT_INPUT_INVALID', 'Descriptor browser ref differs from Golden Environment.');
  const browser = await executableRef(descriptor.browser_executable_ref.realpath);
  if (!sameExecutable(browser, descriptor.browser_executable_ref)) fail('PRELIGHT_INPUT_INVALID', 'Browser raw identity drifted.');
  verifyScheduleAndPorts(descriptor.fault_attempt_schedule, descriptor.port_allocations);
  const gate = await observeGate({ fixedHandoff, activationRoot, expectedHandoff: bundle.references.handoff_ref, observedAt: descriptor.gate_preflight_snapshot.observed_at });
  if (canonicalizeJcs(gate) !== canonicalizeJcs(descriptor.gate_preflight_snapshot)) fail('PRELIGHT_INPUT_INVALID', 'Current Gate snapshot differs from descriptor snapshot.');
  return Object.freeze({ source, bundle, descriptor, jarit, environment });
}

function parseProducerOptions(argv) { return parseOptions(argv, ['source-root', 'controlled-input-root', 'output-parent', 'maven-executable', 'java-home', 'golden-environment', 'browser-executable', 'fixed-handoff', 'production-activation-root']); }
export function parseVerifierOptions(argv) { return parseOptions(argv, ['source-root', 'controlled-bundle-root', 'fixed-handoff', 'production-activation-root']); }
function parseOptions(argv, names) {
  if (argv.length !== names.length * 2) fail('PRELIGHT_INPUT_ARGUMENT_INVALID', 'Argument count is invalid.');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1]; const name = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!names.includes(name) || values.has(name) || !value || value.startsWith('--') || flag.includes('=') || !isAbsolute(value) || resolve(value) === resolve(sep)) fail('PRELIGHT_INPUT_ARGUMENT_INVALID', 'Arguments must be unique absolute non-root paths.');
    values.set(name, resolve(value));
  }
  return Object.freeze(Object.fromEntries(values));
}

async function verifyCleanSource(sourceRoot) {
  const rootPath = await safeDirectory(sourceRoot, 'source root');
  const commit = (await execFileAsync('git', ['-C', rootPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
  const dirty = (await execFileAsync('git', ['-C', rootPath, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' })).stdout;
  if (!/^[a-f0-9]{40}$/.test(commit) || dirty !== '') fail('PRELIGHT_INPUT_INVALID', 'Source root must be a clean Git checkout.');
  return Object.freeze({ root: rootPath, commit });
}

async function verifyJavaHome(javaHome, run) {
  const home = await safeDirectory(javaHome, 'Java home');
  const executable = resolve(home, 'bin/java');
  const reference = await executableRef(executable);
  const result = await run([executable, '-version'], { cwd: home, env: {} });
  const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  if (!/(?:version \"21|openjdk 21)/.test(output)) fail('PRELIGHT_INPUT_INVALID', 'Java home is not JDK 21.');
  return Object.freeze({ version: '21', reference });
}

async function verifyGoldenEnvironment(path) {
  const bytes = await readRegular(path, 'Golden Environment');
  const value = parseJson(bytes, 'Golden Environment');
  verifyGoldenEnvironmentV02(value, { sourceDateEpoch: epoch(value.generated_at) });
  return value;
}

function createJaritReport({ generatedAt, sourceCommit, runtimeRef, java, buildTokens, jaritTokens, xmlRef, methods }) {
  const report = { schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-JARIT-REPORT-001', schema_version: '0.1', report_id: `dev-canvas-06.fault-launcher-jarit.${runtimeRef.sha256.slice(0, 12)}.${sourceCommit.slice(0, 12)}`, generated_at: generatedAt, source_commit: sourceCommit, runtime_jar_ref: runtimeRef, java_version: java.version, java_executable_ref: java.reference, build_command_tokens: buildTokens, jarit_command_tokens: jaritTokens, surefire_xml_ref: xmlRef, test_class: 'org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT', test_method_ids: methods, test_count: 6, passed_count: 6, failed_count: 0, skipped_count: 0, report_status: 'PASS' };
  return { ...report, report_payload_sha256: sha256Jcs(report) };
}

function createDescriptor({ generatedAt, sourceCommit, runtimeRef, jaritRef, environmentRef, browser, ports, gate }) {
  const port_allocations = SCHEDULE.map((schedule, index) => ({ allocation_id: schedule.port_allocation_id, schedule_id: schedule.schedule_id, host: '127.0.0.1', runtime_port: ports[index * 2], web_port: ports[index * 2 + 1] }));
  const value = { schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PREFLIGHT-DESCRIPTOR-001', schema_version: '0.1', generated_at: generatedAt, source_commit: sourceCommit, runtime_jar_ref: runtimeRef, jarit_report_ref: jaritRef, golden_environment_ref: environmentRef, browser_executable_ref: browser, fault_attempt_schedule: SCHEDULE, port_allocations, gate_preflight_snapshot: gate };
  const descriptor_payload_sha256 = sha256Jcs(value);
  return { schema_id: value.schema_id, schema_version: value.schema_version, descriptor_id: `dev-canvas-06.fault-launcher-preflight.${descriptor_payload_sha256.slice(0, 12)}`, generated_at: value.generated_at, source_commit: value.source_commit, runtime_jar_ref: value.runtime_jar_ref, jarit_report_ref: value.jarit_report_ref, golden_environment_ref: value.golden_environment_ref, browser_executable_ref: value.browser_executable_ref, fault_attempt_schedule: value.fault_attempt_schedule, port_allocations: value.port_allocations, gate_preflight_snapshot: value.gate_preflight_snapshot, descriptor_payload_sha256 };
}

function createBundleV02({ copiedTrust, descriptorRef }) {
  const identityPayload = { bundle_class: 'CONTROLLED_TEST', handoff_ref: copiedTrust.handoff_ref, intake_report_ref: copiedTrust.intake_report_ref, evidence_bundle_ref: copiedTrust.evidence_bundle_ref, approved_version_ref: null, preflight_descriptor_ref: descriptorRef };
  const bundle_identity_sha256 = sha256Jcs(identityPayload);
  return { schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: '0.2', bundle_class: 'CONTROLLED_TEST', bundle_id: `canvas06-controlled-${bundle_identity_sha256}`, bundle_identity_sha256, ...identityPayload };
}

function verifyDescriptorShape(value) {
  if (!validateDescriptor(value)) fail('PRELIGHT_INPUT_INVALID', 'Preflight Descriptor Schema validation failed.');
  const payload = { ...value }; delete payload.descriptor_id; delete payload.descriptor_payload_sha256;
  const digest = sha256Jcs(payload);
  if (value.descriptor_payload_sha256 !== digest || value.descriptor_id !== `dev-canvas-06.fault-launcher-preflight.${digest.slice(0, 12)}`) fail('PRELIGHT_INPUT_INVALID', 'Preflight Descriptor identity is invalid.');
  if (canonicalDescriptorUtcSecond(new Date(value.generated_at)) !== value.generated_at) fail('PRELIGHT_INPUT_INVALID', 'Descriptor timestamp is not canonical UTC seconds.');
  verifyScheduleAndPorts(value.fault_attempt_schedule, value.port_allocations);
  verifyGateSnapshotShape(value.gate_preflight_snapshot);
}

function verifyJaritReport(value, descriptor, sourceCommit) {
  if (!validateJarit(value)) fail('PRELIGHT_INPUT_INVALID', 'JarIT Report Schema validation failed.');
  const payload = { ...value }; delete payload.report_payload_sha256;
  if (value.report_payload_sha256 !== sha256Jcs(payload) || value.source_commit !== sourceCommit || value.generated_at !== descriptor.generated_at || !sameRef(value.runtime_jar_ref, descriptor.runtime_jar_ref)) fail('PRELIGHT_INPUT_INVALID', 'JarIT Report identity join is invalid.');
  if (value.report_id !== `dev-canvas-06.fault-launcher-jarit.${value.runtime_jar_ref.sha256.slice(0, 12)}.${sourceCommit.slice(0, 12)}` || JSON.stringify(value.test_method_ids) !== JSON.stringify(TEST_METHOD_IDS)) fail('PRELIGHT_INPUT_INVALID', 'JarIT Report method set is invalid.');
}

function verifyScheduleAndPorts(schedule, ports) {
  if (canonicalizeJcs(schedule) !== canonicalizeJcs(SCHEDULE) || !Array.isArray(ports) || ports.length !== 6) fail('PRELIGHT_INPUT_INVALID', 'Fault attempt schedule is invalid.');
  const allPorts = [];
  ports.forEach((entry, index) => { const expected = SCHEDULE[index]; if (entry.allocation_id !== expected.port_allocation_id || entry.schedule_id !== expected.schedule_id || entry.host !== '127.0.0.1' || !Number.isInteger(entry.runtime_port) || !Number.isInteger(entry.web_port) || entry.runtime_port < 1024 || entry.runtime_port > 65535 || entry.web_port < 1024 || entry.web_port > 65535) fail('PRELIGHT_INPUT_INVALID', 'Port allocation is invalid.'); allPorts.push(entry.runtime_port, entry.web_port); });
  if (new Set(allPorts).size !== 12) fail('PRELIGHT_INPUT_INVALID', 'Loopback ports must be globally unique.');
}

async function observeGate({ fixedHandoff, activationRoot, expectedHandoff, observedAt }) {
  const handoffBytes = await readRegular(fixedHandoff, 'Fixed Handoff');
  const handoffRef = rawReference(expectedHandoff);
  if (handoffBytes.length !== handoffRef.byte_length || sha(handoffBytes) !== handoffRef.sha256) fail('PRELIGHT_INPUT_INVALID', 'Fixed Handoff raw bytes differ from controlled Bundle.');
  if (!sameRef(handoffRef, expectedHandoff)) fail('PRELIGHT_INPUT_INVALID', 'Fixed Handoff raw bytes differ from controlled Bundle.');
  const handoff = parseJson(handoffBytes, 'Fixed Handoff');
  if (handoff.production_gate?.state !== 'DISABLED' || !Array.isArray(handoff.production_gate?.enabled_capability_ids) || handoff.production_gate.enabled_capability_ids.length !== 0) fail('PRELIGHT_INPUT_INVALID', 'Production Gate is not disabled.');
  const activation = await safeDirectory(activationRoot, 'production activation root');
  const entries = await (await import('node:fs/promises')).readdir(activation);
  if (entries.length !== 0) fail('PRELIGHT_INPUT_INVALID', 'Production activation input root must be empty.');
  const snapshot = { observed_at: observedAt, state: 'DISABLED', enabled_capability_ids: [], candidate_loader_status: 'NOT_ACTIVE', fixed_handoff_ref: handoffRef, fixed_handoff_realpath: await realpath(fixedHandoff), activation_input_root_realpath: await realpath(activation), activation_input_refs: [], activation_input_set_sha256: EMPTY_ARRAY_SHA256 };
  return { ...snapshot, snapshot_payload_sha256: sha256Jcs(snapshot) };
}

async function readSurefireXml(sourceRoot, path) {
  const bytes = await readRegular(path, 'Surefire XML');
  const text = bytes.toString('utf8');
  if (text.includes('<!DOCTYPE') || !Buffer.from(text, 'utf8').equals(bytes)) fail('PRELIGHT_INPUT_INVALID', 'Surefire XML must be strict UTF-8 without DOCTYPE.');
  const suite = /<testsuite\b[^>]*\btests="6"[^>]*\bfailures="0"[^>]*\berrors="0"[^>]*\bskipped="0"[^>]*>/.test(text);
  const methods = [...text.matchAll(/<testcase\b[^>]*\bname="([A-Za-z][A-Za-z0-9]+)"[^>]*>/g)].map(match => match[1]).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  if (!suite || JSON.stringify(methods) !== JSON.stringify(TEST_METHOD_IDS)) fail('PRELIGHT_INPUT_INVALID', 'Surefire XML does not prove the frozen 6/6 JarIT result.');
  return { ref: await regularFileRef(sourceRoot, path, 'SUREFIRE_XML', 'Surefire XML'), methods };
}

async function runCommand(tokens, { cwd, env }) { return execFileAsync(tokens[0], tokens.slice(1), { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }); }
async function allocateLoopbackPorts(count) { const ports = []; while (ports.length < count) ports.push(await freePort()); return ports; }
function freePort() { return new Promise((resolvePort, reject) => { const server = createServer(); server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0 }, () => { const address = server.address(); server.close(error => error ? reject(error) : resolvePort(address.port)); }); }); }
async function executableRef(path) { const real = await realpath(path).catch(() => fail('PRELIGHT_INPUT_INVALID', 'Executable is missing.')); const info = await lstat(real); if (info.isSymbolicLink() || !info.isFile()) fail('PRELIGHT_INPUT_INVALID', 'Executable must resolve to a regular file.'); const bytes = await readFile(real); return Object.freeze({ realpath: real, byte_length: bytes.length, sha256: sha(bytes) }); }
async function rawFileRef(path, kind) { const bytes = await readRegular(path, 'raw file'); return { kind, path: basename(path), byte_length: bytes.length, sha256: sha(bytes) }; }
async function regularFileRef(rootPath, path, kind, label) { const bytes = await readRegular(path, label); const rel = relative(resolve(rootPath), resolve(path)).split(sep).join('/'); if (!safeRelative(rel)) fail('PRELIGHT_INPUT_INVALID', `${label} escapes its root.`); return { kind, path: rel, byte_length: bytes.length, sha256: sha(bytes) }; }
async function verifyRawRef(rootPath, reference, label) { const target = inside(rootPath, reference.path); const bytes = await readRegular(target, label); if (bytes.length !== reference.byte_length || sha(bytes) !== reference.sha256) fail('PRELIGHT_INPUT_INVALID', `${label} raw reference drifted.`); return bytes; }
async function copyVerifiedFile(sourceRoot, reference, targetRoot, targetRelative) { const source = inside(sourceRoot, reference.path); const bytes = await verifyRawRef(sourceRoot, reference, 'input reference'); const destination = inside(targetRoot, targetRelative); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 }); return regularFileRef(targetRoot, destination, reference.kind, 'copied input'); }
async function writeCanonical(rootPath, relativePath, value) { const target = inside(rootPath, relativePath); const temporary = `${target}.tmp`; await mkdir(dirname(target), { recursive: true }); const bytes = Buffer.from(`${canonicalizeJcs(value)}\n`, 'utf8'); const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } await rename(temporary, target); await fsyncDirectory(dirname(target)); }
async function safeDirectory(path, label) { const info = await lstat(path).catch(() => fail('PRELIGHT_INPUT_INVALID', `${label} is missing.`)); if (info.isSymbolicLink() || !info.isDirectory()) fail('PRELIGHT_INPUT_INVALID', `${label} must be a non-symlink directory.`); return resolve(path); }
async function readRegular(path, label) { const info = await lstat(path).catch(() => fail('PRELIGHT_INPUT_INVALID', `${label} is missing.`)); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail('PRELIGHT_INPUT_INVALID', `${label} must be a single-link regular file.`); return readFile(path); }
async function assertDistinctRoots(options, names) { for (let left = 0; left < names.length; left += 1) for (let right = left + 1; right < names.length; right += 1) if (contains(options[names[left]], options[names[right]]) || contains(options[names[right]], options[names[left]])) fail('PRELIGHT_INPUT_ARGUMENT_INVALID', 'Input roots must be physically isolated.'); }
function contains(left, right) { const relation = relative(resolve(left), resolve(right)); return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation)); }
function inside(rootPath, relativePath) { if (!safeRelative(relativePath)) fail('PRELIGHT_INPUT_INVALID', 'Reference path is unsafe.'); const result = resolve(rootPath, relativePath); if (!contains(rootPath, result) || result === resolve(rootPath)) fail('PRELIGHT_INPUT_INVALID', 'Reference path escapes its root.'); return result; }
function safeRelative(value) { return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..'); }
function verifyGateSnapshotShape(value) { const payload = { ...value }; delete payload.snapshot_payload_sha256; if (value.activation_input_set_sha256 !== EMPTY_ARRAY_SHA256 || value.snapshot_payload_sha256 !== sha256Jcs(payload)) fail('PRELIGHT_INPUT_INVALID', 'Gate snapshot identity is invalid.'); }
function rawReference(reference) { return { kind: reference.kind, path: reference.path, byte_length: reference.byte_length, sha256: reference.sha256 }; }
function sameRef(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function sameExecutable(left, right) { return left?.realpath === right?.realpath && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function parseJson(bytes, label) { try { return JSON.parse(bytes.toString('utf8')); } catch { fail('PRELIGHT_INPUT_INVALID', `${label} must be valid JSON.`); } }
function epoch(value) { const numeric = Date.parse(value); if (!Number.isSafeInteger(numeric) || new Date(numeric).getUTCMilliseconds() !== 0) fail('PRELIGHT_INPUT_INVALID', 'Timestamp is not a UTC whole second.'); return numeric / 1000; }
function canonicalDescriptorUtcSecond(value) { if (!(value instanceof Date) || Number.isNaN(value.valueOf()) || value.getUTCMilliseconds() !== 0) fail('PRELIGHT_INPUT_INVALID', 'Timestamp must be a UTC whole second.'); return value.toISOString().replace('.000Z', 'Z'); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code, message) { throw new PreflightInputError(code, message); }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function fsyncTree(path) { const entries = await (await import('node:fs/promises')).readdir(path, { withFileTypes: true }); for (const entry of entries) { const child = resolve(path, entry.name); if (entry.isDirectory()) await fsyncTree(child); else { const handle = await open(child, 'r'); try { await handle.sync(); } finally { await handle.close(); } } } await fsyncDirectory(path); }

if (import.meta.url === new URL(process.argv[1], 'file:').href) main().then(result => process.stdout.write(`${result.bundle_root}\n`)).catch(error => { process.stderr.write(`${error.code ?? 'PRELIGHT_INPUT_INTERNAL_ERROR'}\n`); process.exitCode = error.exitCode ?? 4; });
