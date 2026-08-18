import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const forbidden = new Set(['fixture-file', 'force', 'overwrite', 'skip-missing', 'skip-verify', 'continue-on-error', 'binding', 'project-id', 'model-id', 'revision-id']);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    console.error(error.code ?? 'GFM_INTERNAL_ERROR');
    if (error.message) console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseOptions(argv);
  const planPath = resolveRequired(options, 'plan');
  const bundlePath = resolveRequired(options, 'evidence-bundle');
  const runtimeJar = resolveRequired(options, 'runtime-jar');
  const materializationRoot = resolveRequired(options, 'materialization-root');
  const epoch = integer(required(options, 'source-date-epoch'));
  const concurrency = options.has('concurrency') ? integer(required(options, 'concurrency')) : 1;
  if (concurrency < 1 || concurrency > 4) input('concurrency must be in [1, 4].');

  const plan = await loadPlan(planPath);
  const planSchema = await schema('opm-dev-canvas-06-golden-capture-plan.schema.json');
  const validatePlan = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(planSchema);
  if (!validatePlan(plan) || plan.plan_status !== 'READY_FOR_AUTHORING') input('GFM_PLAN_INVALID: Capture Plan is not READY_FOR_AUTHORING.');
  if (plan.source_date_epoch !== epoch) input('GFM_ARGUMENT_INVALID: source-date-epoch differs from Capture Plan.');
  await exactFile(bundlePath, plan.input_materialization?.bundle_ref, 'GFM_BUNDLE_REF_MISMATCH');
  await exactFile(runtimeJar, plan.runtime_jar_ref, 'GFM_RUNTIME_JAR_MISMATCH');
  const javaExecutable = await (dependencies.resolveJava ?? resolveJava21)(process.env.JAVA_HOME);
  const fixtures = collectFamilyFixtures(plan);
  await createFreshRoot(materializationRoot);

  const run = dependencies.run ?? runMaterializer;
  const common = { planPath, bundlePath, runtimeJar, materializationRoot, epoch, javaExecutable, expectedRuntimeJarSha256: plan.runtime_jar_ref.sha256 };
  let result;
  try {
    result = await runOrdered(fixtures, concurrency, async fixture => await withKeyLock(materializationRoot, fixture.key, async () => {
      const exitCode = await run({ ...common, fixture });
      if (exitCode !== 0) await quarantineCleanupFailure({ materializationRoot, planPath, plan, fixture, epoch });
      return exitCode;
    }));
  } finally {
    await removeLockDirectory(materializationRoot);
  }
  if (result.error) throw result.error;
  if (result.failed) block('GFM_STORAGE_WRITE_FAILED', 'At least one Materializer subprocess failed.');
  console.log(`Golden Fixture Materialization complete: ${fixtures.length}/130 ${relative(root, materializationRoot)}`);
}

export function collectFamilyFixtures(plan) {
  const family = plan.captures?.filter(capture => capture.capture_kind === 'FAMILY') ?? [];
  if (family.length !== 1170) block('GFM_FIXTURE_SET_MISMATCH', 'Family captures must be exactly 1170.');
  const grouped = new Map();
  for (const capture of family) {
    const ref = capture.fixture_ref;
    if (!archiveRef(ref)) block('GFM_FIXTURE_SET_MISMATCH', 'Family fixture_ref must be an archiveEntryRef.');
    if (ref.bundle_sha256 !== plan.input_materialization?.bundle_ref?.sha256) block('GFM_BUNDLE_REF_MISMATCH', 'Family fixture bundle SHA differs from the Plan bundle.');
    const key = fixtureRefKey(ref);
    const prior = grouped.get(key);
    if (prior && !same(prior.ref, ref)) block('GFM_FIXTURE_SET_MISMATCH', `Fixture ref key collision: ${key}`);
    const entry = prior ?? { key, ref, count: 0 };
    entry.count += 1;
    grouped.set(key, entry);
  }
  if (grouped.size !== 130 || [...grouped.values()].some(item => item.count !== 9)) block('GFM_FIXTURE_SET_MISMATCH', 'Expected 130 unique Family fixtures, each referenced nine times.');
  return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function fixtureRefKey(ref) {
  return sha(Buffer.from(jcs({ path: ref.path, byte_length: ref.byte_length, sha256: ref.sha256, bundle_sha256: ref.bundle_sha256, archive_entry_path: ref.archive_entry_path }), 'utf8'));
}

export async function writeQuarantineMarker({ materializationRoot, changeId, fixtureRefKey: key, primaryFailureCode, epoch, attestation }) {
  if (attestation && (attestation.change_id !== changeId
      || attestation.fixture_ref_key !== key
      || attestation.primary_failure_code !== primaryFailureCode
      || attestation.quarantine_storage_relative_path !== `quarantine/${key}/storage`
      || attestation.marker_relative_path !== `quarantine/${key}/non-consumable.json`)) {
    quarantineFailure('Quarantine marker attestation does not match its fixed layout.');
  }
  const quarantine = resolve(materializationRoot, 'quarantine', key);
  const marker = { schema_id: 'OPM-DEV-CANVAS-06-GFM-QUARANTINE-MARKER-001', schema_version: '0.1', change_id: changeId, fixture_ref_key: key, source_storage_path: `fixtures/${key}/storage`, quarantine_storage_path: `quarantine/${key}/storage`, primary_failure_code: primaryFailureCode, cleanup_failure_code: 'GFM_CLEANUP_FAILED', generated_at: new Date(epoch * 1000).toISOString() };
  marker.marker_payload_sha256 = sha(Buffer.from(jcs(marker), 'utf8'));
  const out = resolve(quarantine, 'non-consumable.json'); const temporary = `${out}.tmp`;
  if (await exists(out) || await exists(temporary)) quarantineFailure('Quarantine marker path already exists.');
  try { await mkdir(quarantine, { recursive: true }); await writeFile(temporary, `${JSON.stringify(marker)}\n`, { flag: 'wx' }); await rename(temporary, out); return marker; }
  catch (error) { try { await unlink(temporary); } catch { } quarantineFailure('Cannot atomically write quarantine marker.'); }
}

/**
 * 唯一四阶段 cleanup：内存预验证 -> rename -> marker -> 完整 selected verifier。
 * 任何失败都保留现存证据，交由人工隔离整个 change root。
 */
export async function quarantineCleanupFailure({ materializationRoot, planPath, plan, fixture, epoch, verifyPending, verifySelectedDiagnostic }) {
  const verifier = verifyPending ?? defaultPendingVerification;
  const selectedDiagnostic = verifySelectedDiagnostic ?? defaultSelectedDiagnostic;
  const reportPath = resolve(materializationRoot, 'reports', `${fixture.key}.json`);
  const expectedSource = resolve(materializationRoot, 'fixtures', fixture.key, 'storage');
  // Check 1~8 的拒绝以及已成功清理的 BLOCKED 都没有 residual，不进入 quarantine 流程。
  if (!await exists(expectedSource)) return false;
  // Report 不存在却遗留 storage 时，没有可信身份可构造 marker，必须整体人工隔离。
  if (!await exists(reportPath)) quarantineFailure('Residual storage exists without a reportable invocation.');
  let attestation;
  try {
    attestation = await verifier({
      capturePlanPath: planPath,
      materializationRoot,
      fixtureRefKey: fixture.key,
      reportRelativePath: `reports/${fixture.key}.json`,
      sourceStorageRelativePath: `fixtures/${fixture.key}/storage`,
      quarantineStorageRelativePath: `quarantine/${fixture.key}/storage`,
      markerRelativePath: `quarantine/${fixture.key}/non-consumable.json`
    });
  } catch {
    quarantineFailure('Pending quarantine verification failed.');
  }
  const source = resolve(materializationRoot, attestation.source_storage_relative_path);
  const destination = resolve(materializationRoot, attestation.quarantine_storage_relative_path);
  const marker = resolve(materializationRoot, attestation.marker_relative_path);
  const before = await storageIdentity(source);
  if (!before || before.dev !== attestation.source_storage_dev || before.ino !== attestation.source_storage_ino
      || await verifierRootTreeDigest(materializationRoot) !== attestation.root_tree_sha256_before_move) {
    quarantineFailure('Residual storage changed after pending verification.');
  }
  try {
    await mkdir(resolve(materializationRoot, 'quarantine'), { recursive: true });
    await mkdir(dirname(destination));
    if (await exists(destination) || await exists(marker) || await exists(`${marker}.tmp`)) quarantineFailure('Quarantine destination is occupied.');
    await rename(source, destination);
    const moved = await storageIdentity(destination);
    if (await exists(source) || !moved || moved.dev !== attestation.source_storage_dev || moved.ino !== attestation.source_storage_ino) {
      quarantineFailure('Residual storage rename cannot be verified.');
    }
    await writeQuarantineMarker({ materializationRoot, changeId: plan.change_id, fixtureRefKey: fixture.key,
      primaryFailureCode: attestation.primary_failure_code, epoch, attestation });
    const verifierBefore = await verifierRootTreeDigest(materializationRoot);
    const diagnostic = await selectedDiagnostic({ planPath, materializationRoot, fixtureRefKey: fixture.key });
    const verifierAfter = await verifierRootTreeDigest(materializationRoot);
    if (verifierBefore !== verifierAfter || diagnostic.exitCode !== 3 || diagnostic.topCode !== 'GFMV_ROOT_NOT_CONSUMABLE') {
      quarantineFailure('Quarantine evidence is not a closed non-consumable diagnostic.');
    }
    return true;
  } catch (error) {
    if (error?.code === 'GFM_QUARANTINE_FAILED') throw error;
    quarantineFailure('Cannot atomically quarantine residual storage.');
  }
}

export async function runOrdered(items, concurrency, callback) {
  let next = 0; let failed = false; let error; const results = [];
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      let code;
      try {
        code = await callback(item);
      } catch (caught) {
        error ??= caught;
        code = caught?.exitCode ?? 4;
      }
      results.push({ key: item.key, code });
      if (code !== 0) failed = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { failed, error, results: results.sort((left, right) => left.key.localeCompare(right.key)) };
}

export async function withKeyLock(materializationRoot, key, callback) {
  const lockDirectory = resolve(materializationRoot, '.locks');
  const lock = resolve(lockDirectory, `${key}.lock`);
  try {
    await mkdir(lockDirectory, { recursive: true });
    await writeFile(lock, '', { flag: 'wx' });
  } catch { block('GFM_STORAGE_WRITE_FAILED', 'Cannot acquire fixture materialization lock.'); }
  try { return await callback(); }
  finally {
    try { await unlink(lock); } catch { }
    try { await rmdir(lockDirectory); } catch { }
  }
}

async function runMaterializer({ planPath, bundlePath, runtimeJar, materializationRoot, epoch, javaExecutable, expectedRuntimeJarSha256, fixture }) {
  const fixtureRoot = resolve(materializationRoot, 'fixtures', fixture.key);
  const storage = resolve(fixtureRoot, 'storage');
  const report = resolve(materializationRoot, 'reports', `${fixture.key}.json`);
  const args = ['-jar', runtimeJar,
    '--spring.profiles.active=release-golden-authoring',
    '--spring.main.web-application-type=none',
    '--opm.runtime.mode=RELEASE_GOLDEN_FIXTURE_MATERIALIZE',
    '--opm.release-authoring.materializer.enabled=true',
    '--opm.release-authoring.contract-version=0.1.0',
    `--opm.release-authoring.capture-plan=${planPath}`,
    `--opm.release-authoring.evidence-bundle=${bundlePath}`,
    `--opm.release-authoring.fixture-ref-key=${fixture.key}`,
    `--opm.release-authoring.expected-runtime-jar-sha256=${expectedRuntimeJarSha256}`,
    `--opm.storage.root=${storage}`,
    `--opm.release-authoring.report-out=${report}`,
    `--opm.release-authoring.source-date-epoch=${epoch}`];
  await mkdir(dirname(report), { recursive: true });
  return await new Promise(resolveResult => {
    const child = spawn(javaExecutable, args, { stdio: 'inherit' });
    child.once('error', () => resolveResult(4));
    child.once('exit', code => resolveResult(code ?? 4));
  });
}

export async function resolveJava21(javaHome, readVersion = readJavaVersion) {
  if (typeof javaHome !== 'string' || javaHome.length === 0) input('GFM_ARGUMENT_INVALID: JAVA_HOME must identify a Java 21 home.');
  const executable = resolve(javaHome, 'bin', 'java');
  let details;
  try { details = await lstat(executable); }
  catch { input('GFM_ARGUMENT_INVALID: JAVA_HOME/bin/java is unavailable.'); }
  if (!details.isFile() || details.isSymbolicLink()) input('GFM_ARGUMENT_INVALID: JAVA_HOME/bin/java must be a regular file.');
  const output = await readVersion(executable);
  const version = /\bversion\s+"?(\d+)(?:[.\s"]|$)/.exec(output)?.[1];
  if (version !== '21') input('GFM_ARGUMENT_INVALID: JAVA_HOME must identify Java 21.');
  return executable;
}

async function readJavaVersion(executable) {
  return await new Promise((resolveOutput, rejectOutput) => {
    const child = spawn(executable, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', rejectOutput);
    child.once('exit', code => code === 0 ? resolveOutput(output) : rejectOutput(new Error('Java version command failed.')));
  });
}

function parseOptions(argv) {
  const allowed = new Set(['plan', 'evidence-bundle', 'runtime-jar', 'materialization-root', 'source-date-epoch', 'concurrency']);
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1]; const name = flag?.startsWith('--') ? flag.slice(2) : '';
    if (forbidden.has(name)) input(`Forbidden Materializer option: --${name}`);
    if (!allowed.has(name) || value === undefined || options.has(name)) input('GFM_ARGUMENT_INVALID: invalid Materializer options.');
    options.set(name, value);
  }
  return options;
}

async function loadPlan(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { input('GFM_PLAN_INVALID: cannot read Capture Plan.'); } }
async function readBlockedCleanupReport(path, plan, fixture) {
  let report;
  try { report = JSON.parse(await readFile(path, 'utf8')); } catch { quarantineFailure('Cleanup Report cannot be read.'); }
  const reportSchema = await schema('opm-dev-canvas-06-golden-fixture-materialization-report.schema.json');
  const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(reportSchema);
  if (!validate(report)
      || report.report_status !== 'BLOCKED'
      || report.change_id !== plan.change_id
      || report.fixture_ref_key !== fixture.key
      || !same(report.source_fixture_ref, fixture.ref)
      || !Array.isArray(report.failures)
      || report.failures.length < 2
      || !same(report.primary_failure, report.failures[0])
      || report.failures[1]?.code !== 'GFM_CLEANUP_FAILED'
      || report.target_storage !== undefined
      || report.materialized_identity !== undefined
      || report.persistence !== undefined
      || report.report_payload_sha256 !== sha(Buffer.from(jcs(without(report, 'report_payload_sha256')), 'utf8'))) {
    quarantineFailure('Cleanup Report is not a closed BLOCKED diagnostic.');
  }
  return report;
}
async function defaultPendingVerification(input) {
  const { verifyPendingQuarantine } = await import('./verify-canvas06-golden-materialization.mjs');
  return await verifyPendingQuarantine(input);
}
async function defaultSelectedDiagnostic({ planPath, materializationRoot, fixtureRefKey }) {
  const { main: verify } = await import('./verify-canvas06-golden-materialization.mjs');
  try {
    await verify(['--plan', planPath, '--materialization-root', materializationRoot, '--fixture-ref-key', fixtureRefKey]);
    return { exitCode: 0, topCode: null };
  } catch (error) {
    return { exitCode: error.exitCode ?? 4, topCode: error.code ?? 'GFMV_INTERNAL_ERROR' };
  }
}
async function verifierRootTreeDigest(materializationRoot) {
  const { rootTreeDigest } = await import('./verify-canvas06-golden-materialization.mjs');
  return await rootTreeDigest(materializationRoot);
}
async function storageIdentity(path) {
  try {
    const details = await lstat(path);
    return details.isDirectory() && !details.isSymbolicLink() ? { dev: details.dev, ino: details.ino } : null;
  } catch { return null; }
}
async function exactFile(path, ref, code) { if (!ref || !await exists(path)) block(code, 'Referenced file is absent.'); const details = await stat(path); const digest = await shaFile(path); if (details.size !== ref.byte_length || digest !== ref.sha256) block(code, 'Referenced file does not match its exact ref.'); }
export async function createFreshRoot(path) {
  try { await mkdir(path); }
  catch (error) {
    if (error?.code === 'EEXIST') block('GFM_TARGET_STORAGE_NOT_EMPTY', 'materialization-root must be newly created for this invocation.');
    input('GFM_ARGUMENT_INVALID: materialization-root parent must already exist.');
  }
}
async function removeLockDirectory(root) { try { await rmdir(resolve(root, '.locks')); } catch { } }
async function schema(name) { return JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas', name), 'utf8')); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function safeDirectory(path) { try { const details = await lstat(path); return details.isDirectory() && !details.isSymbolicLink(); } catch { return false; } }
async function shaFile(path) { return sha(await readFile(path)); }
function archiveRef(value) { return value && typeof value === 'object' && typeof value.path === 'string' && Number.isInteger(value.byte_length) && typeof value.sha256 === 'string' && typeof value.bundle_sha256 === 'string' && typeof value.archive_entry_path === 'string'; }
function same(left, right) { return jcs(left) === jcs(right); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function without(value, key) { const copy = { ...value }; delete copy[key]; return copy; }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
function required(options, name) { const value = options.get(name); if (!value) input(`GFM_ARGUMENT_INVALID: --${name} is required.`); return value; }
function resolveRequired(options, name) { return resolve(required(options, name)); }
function integer(value) { if (!/^[0-9]+$/.test(value)) input('GFM_ARGUMENT_INVALID: integer is required.'); return Number(value); }
function input(message) { const error = new Error(message); error.code = 'GFM_ARGUMENT_INVALID'; error.exitCode = 2; throw error; }
function block(code, message) { const error = new Error(message); error.code = code; error.exitCode = 3; throw error; }
function quarantineFailure(message) { const error = new Error(message); error.code = 'GFM_QUARANTINE_FAILED'; error.exitCode = 4; throw error; }
