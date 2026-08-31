import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import { buildCommonVisualFixtures } from './build-canvas06-common-visual-fixtures.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';
import { verifyAdapterTestInputBundle } from './verify-canvas06-common-visual-adapter-test-input.mjs';

const ROOT = resolve('.');
const PROFILE_SOURCE = 'packages/profiles/profile.iso19450.2024.draft/0.2.0';
const PROFILE_FILES = Object.freeze([
  'grammar/representative-opl-grammar.json',
  'normalization/representative-normalization.json',
  'profile.json',
  'rules/representative-rule-set.json',
  'symbols/representative-symbol-catalog.json'
]);

if (resolve(process.argv[1] ?? '') === new URL(import.meta.url).pathname) {
  main().catch(error => {
    process.stderr.write(`${error.code ?? 'GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED'}\n`);
    if (error.message) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}

export async function buildAdapterTestInputBundle(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const sourceRoot = await absoluteRealpath(options.get('source-root'));
  const handoffRoot = await absoluteRealpath(options.get('handoff-root'));
  const outputRoot = absolutePath(options.get('output-root'));
  const stagingRoot = `${outputRoot}.staging-${process.pid}`;
  const workRoot = `${outputRoot}.adapter-work`;
  const epoch = safeInteger(options.get('source-date-epoch'));

  await requireFresh(outputRoot, 'Output root');
  await requireFresh(stagingRoot, 'Staging root');
  await requireFresh(workRoot, 'Adapter work root');

  const upstream = await preflightUpstream({ sourceRoot, handoffRoot, intakeReport: options.get('intake-report'), runtimeJar: options.get('runtime-jar') });
  const java = await resolveJava21(options.get('java-executable'));
  const builderSourceRef = await sourceRef(sourceRoot, 'scripts/build-canvas06-common-visual-adapter-test-input.mjs', 'ADAPTER_TEST_INPUT_BUILDER_SOURCE');
  const verifierSourceRef = await sourceRef(sourceRoot, 'scripts/verify-canvas06-common-visual-adapter-test-input.mjs', 'ADAPTER_TEST_INPUT_VERIFIER_SOURCE');

  let renamed = false;
  try {
    await mkdir(stagingRoot, { mode: 0o700 });
    const profileRoot = resolve(stagingRoot, 'inputs/profile/assets');
    await copyProfile(sourceRoot, profileRoot);
    const profile = await loadProfileClosure(profileRoot, upstream.handoff.active_binding);

    const commonRoot = resolve(stagingRoot, 'inputs/common');
    await buildCommonVisualFixtures({ handoffPath: upstream.handoffPath, target: commonRoot, epoch });
    await verifyCommonRoot(upstream.handoffPath, commonRoot);
    const commonCatalogRef = await fileRef(stagingRoot, 'inputs/common/dev-canvas-06-common-fixture-catalog.json', 'COMMON_FIXTURE_CATALOG');

    const planPath = resolve(stagingRoot, 'inputs/golden/capture-plan.json');
    await mkdir(dirname(planPath), { recursive: true, mode: 0o700 });
    runPlanner({ handoffRoot, sourceRoot, commonRoot, intakeReport: options.get('intake-report'), runtimeJar: options.get('runtime-jar'), changeId: options.get('change-id'), epoch, planPath, java });
    const plan = await json(planPath, 'Capture Plan');
    const planRef = await fileRef(stagingRoot, 'inputs/golden/capture-plan.json', 'CAPTURE_PLAN');

    const stagedRuntimePath = resolve(stagingRoot, 'inputs/build/local-runtime.jar');
    await mkdir(dirname(stagedRuntimePath), { recursive: true, mode: 0o700 });
    await copyFile(upstream.runtimePath, stagedRuntimePath);
    const stagedRuntimeRef = await fileRef(stagingRoot, 'inputs/build/local-runtime.jar', 'RUNTIME_JAR');
    if (!sameRaw(stagedRuntimeRef, upstream.runtimeRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Staged Runtime JAR raw identity differs from Handoff.');

    const bundleSuffix = sha(Buffer.from(`${upstream.sourceCommit}\n${epoch}`, 'utf8')).slice(0, 12);
    const bundleId = `dev-canvas-06.common-visual-adapter-test.${bundleSuffix}`;
    const request = {
      schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001', schema_version: '0.2', request_version: '0.2.0',
      request_id: `dev-canvas-06.common-visual-adapter.test.${bundleSuffix}`, plan_path: resolve(outputRoot, planRef.path), plan_ref: planRef,
      common_fixture_root: resolve(outputRoot, 'inputs/common'), java_major_version: 21, java_executable_ref: java.ref,
      runtime_jar_path: resolve(outputRoot, stagedRuntimeRef.path), runtime_jar_ref: upstream.runtimeRef,
      profile_asset_root: resolve(outputRoot, 'inputs/profile/assets'), profile_asset_tree_ref: profile.profile_asset_tree_ref,
      profile_asset_refs: profile.profile_asset_refs, work_root: workRoot, source_date_epoch: epoch
    };
    await validateRequest(request);
    await writeJson(resolve(stagingRoot, 'adapter-request.json'), request);
    const requestRef = await fileRef(stagingRoot, 'adapter-request.json', 'ADAPTER_REQUEST');

    const callbacks = await createObservedResults({ root: stagingRoot, plan, commonRoot, requestId: request.request_id });
    const bundle = {
      schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-TEST-INPUT-BUNDLE-001', schema_version: '0.1', bundle_version: '0.1.0',
      bundle_id: bundleId, status: 'READY_FOR_ADAPTER_TEST', source_commit: upstream.sourceCommit, source_date_epoch: epoch,
      builder_source_ref: builderSourceRef, verifier_source_ref: verifierSourceRef, java_executable_ref: java.ref,
      runtime_jar_source_ref: upstream.runtimeRef, runtime_jar_staged_ref: stagedRuntimeRef,
      profile_asset_tree_ref: profile.profile_asset_tree_ref, profile_asset_refs: profile.profile_asset_refs,
      common_fixture_tree_ref: await treeRef(stagingRoot, 'inputs/common', 'COMMON_FIXTURE_TREE'), common_catalog_ref: commonCatalogRef,
      capture_plan_ref: planRef, common_capture_count: 72, callback_observed_results: callbacks,
      adapter_request_ref: requestRef, adapter_work_root: workRoot
    };
    bundle.bundle_payload_sha256 = sha256Jcs(bundle);
    await writeJson(resolve(stagingRoot, 'adapter-test-input-bundle.json'), bundle);

    await verifyAdapterTestInputBundle({ sourceRoot, handoffRoot, intakeReport: options.get('intake-report'), bundleRoot: stagingRoot, expectedFinalRoot: outputRoot });
    await fsyncTree(stagingRoot);
    await requireFresh(outputRoot, 'Output root');
    await rename(stagingRoot, outputRoot);
    renamed = true;
    await fsyncDirectory(dirname(outputRoot));
    await verifyAdapterTestInputBundle({ sourceRoot, handoffRoot, intakeReport: options.get('intake-report'), bundleRoot: outputRoot });
    return { outputRoot, bundle };
  } catch (error) {
    if (!renamed) {
      await rm(stagingRoot, { recursive: true, force: true });
      throw error;
    }
    try { await quarantine(outputRoot); }
    catch (quarantineError) { fail('GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED', 4, `Post-rename isolation failed: ${quarantineError.message}`); }
    fail('GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED', 4, `Post-rename verification failed and final root was isolated: ${error.message}`);
  }
}

async function main() { await buildAdapterTestInputBundle(); }

async function preflightUpstream({ sourceRoot, handoffRoot, intakeReport, runtimeJar }) {
  await assertCleanSource(sourceRoot);
  const intake = await json(inside(handoffRoot, intakeReport), 'Intake Report');
  const intakeSchema = await schema('opm-dev-canvas-06-intake-report.schema.json');
  const handoffSchema = await schema('opm-dev-canvas-05-handoff.schema.json');
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  if (!ajv.compile(intakeSchema)(intake) || intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'READY Intake is required.');
  const handoffPath = inside(handoffRoot, intake.handoff_ref.path);
  const handoff = await json(handoffPath, 'Handoff');
  if (!ajv.compile(handoffSchema)(handoff) || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoff.blockers.length !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'READY Handoff is required.');
  const intakeHandoffRef = await fileRef(handoffRoot, intake.handoff_ref.path, intake.handoff_ref.kind);
  if (!same(intakeHandoffRef, intake.handoff_ref)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Intake Handoff raw ref differs.');
  const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']);
  if (sourceCommit !== handoff.source_build.source_commit) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Source HEAD differs from Handoff.');
  const expectedRuntime = handoff.build_artifacts.filter(item => item.kind === 'LOCAL_RUNTIME_JAR');
  if (expectedRuntime.length !== 1) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Handoff must contain exactly one Local Runtime JAR.');
  const runtimePath = inside(handoffRoot, runtimeJar);
  const runtimeRef = await fileRef(handoffRoot, runtimeJar, 'LOCAL_RUNTIME_JAR');
  if (!same(runtimeRef, expectedRuntime[0])) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Runtime JAR differs from Handoff.');
  return { intake, handoff, handoffPath, sourceCommit, runtimePath, runtimeRef };
}

async function resolveJava21(value) {
  const requested = absolutePath(value);
  const canonical = await realpath(requested);
  if (canonical !== requested || basename(canonical) !== 'java') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java executable must be an exact realpath ending in /java.');
  const javaInfo = await regular(canonical, 'Java executable');
  if ((javaInfo.mode & 0o111) === 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java executable is not executable.');
  const version = spawnSync(canonical, ['-version'], { encoding: 'utf8', env: {} });
  if (version.status !== 0 || !/version "21(?:[._"])/.test(version.stderr)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java executable is not Java 21.');
  const root = dirname(dirname(canonical)); const jar = resolve(root, 'bin/jar'); const jarCanonical = await realpath(jar).catch(() => null);
  if (jarCanonical !== jar) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Derived JDK jar is not an exact realpath.');
  const jarInfo = await regular(jar, 'Derived JDK jar');
  if ((jarInfo.mode & 0o111) === 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Derived JDK jar is not executable.');
  const jarVersion = spawnSync(jar, ['--version'], { encoding: 'utf8', env: {} }); const output = `${jarVersion.stdout ?? ''}${jarVersion.stderr ?? ''}`.trim();
  if (jarVersion.status !== 0 || !/^jar 21(?:\.|$)/.test(output)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Derived JDK jar is not version 21.');
  return { root, jar, ref: await absoluteFileRef(canonical, 'JAVA_EXECUTABLE') };
}

function runPlanner({ handoffRoot, sourceRoot, commonRoot, intakeReport, runtimeJar, changeId, epoch, planPath, java }) {
  const env = { JAVA_HOME: java.root, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' };
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/release-canvas06-golden-plan.mjs'), '--handoff-root', handoffRoot, '--intake-report', intakeReport, '--source-root', sourceRoot, '--common-fixture-root', commonRoot, '--common-fixture-catalog', 'dev-canvas-06-common-fixture-catalog.json', '--runtime-jar', runtimeJar, '--work-root', dirname(planPath), '--change-id', changeId, '--source-date-epoch', String(epoch), '--out', basename(planPath)], { cwd: ROOT, encoding: 'utf8', env });
  if (result.status === 0) return;
  const message = result.stderr || result.stdout || 'Capture Planner failed.';
  if (result.status === 2) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, message);
  if (result.status === 3) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, message);
  fail('GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED', 4, message);
}

async function copyProfile(sourceRoot, targetRoot) { for (const path of PROFILE_FILES) { const source = inside(sourceRoot, `${PROFILE_SOURCE}/${path}`); await regular(source, `Profile source ${path}`); const target = resolve(targetRoot, path); await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await copyFile(source, target); } }
async function loadProfileClosure(profileRoot, binding) { try { return await loadProfileAssetClosure({ assetRoot: profileRoot, manifestRootPath: 'profile/assets', activeBinding: binding }); } catch (error) { fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, error.message); } }
async function verifyCommonRoot(handoffPath, commonRoot) { const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/verify-canvas06-common-visual-fixtures.mjs'), '--handoff', handoffPath, '--fixture-root', commonRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json'], { cwd: ROOT, encoding: 'utf8' }); if (result.status !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, result.stderr || 'Common fixture verification failed.'); }
async function validateRequest(value) { const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }); const validate = ajv.compile(await schema('opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json')); if (!validate(value)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Generated Request is schema-invalid: ${JSON.stringify(validate.errors)}`); }

async function createObservedResults({ root, plan, commonRoot, requestId }) {
  const commonCaptures = plan.captures.filter(item => item.capture_kind === 'COMMON');
  if (commonCaptures.length !== 72) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Plan must have exactly 72 Common captures.');
  const descriptors = [];
  for (const [ordinal, capture] of commonCaptures.entries()) {
    const fixture = await json(inside(commonRoot, capture.fixture_ref.path), 'Common fixture');
    for (const attempt of [1, 2]) {
      const base = `callback-results/${String(ordinal).padStart(3, '0')}/attempt-${attempt}`; const [width, height] = dimensions(capture.viewport_id); const pngBytes = testPng(width, height);
      await mkdir(resolve(root, base), { recursive: true, mode: 0o700 }); await writeFile(resolve(root, base, 'capture.png'), pngBytes, { flag: 'wx' });
      const pngRef = await fileRef(root, `${base}/capture.png`, 'TEST_CALLBACK_PNG');
      const geometry = { schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-TEST-GEOMETRY-001', schema_version: '0.1', capture_id: capture.capture_id, committed_cells: fixture.expected_projection.committed_cells.map(item => ({ cell_id: item.cell_id, layer: item.layer, geometry: item.geometry })).sort((left, right) => compareUtf8(left.cell_id, right.cell_id)), transient_cells: fixture.expected_projection.transient_cells };
      const observed = { schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-OBSERVED-RESULT-001', schema_version: '0.1', result_version: '0.1.0', request_id: requestId, capture_id: capture.capture_id, subject_id: capture.subject_id, attempt_ordinal: attempt, ui_setup_status: 'READY', stability_status: 'STABLE', png_byte_length: pngRef.byte_length, png_sha256: pngRef.sha256, width, height, cell_geometry_sha256: sha256Jcs(geometry), normalized_projection: fixture.expected_projection, projection_sha256: capture.expected_projection_sha256, observed_cells: capture.expected_cells, focus_target_id: capture.focus_target_id, focus_anchor: capture.focus_anchor, fault_observation: capture.subject_id === 'BLOCKED_FEEDBACK' ? { mode: 'BLOCKED_FEEDBACK_ONE_SHOT', trigger_count: 1, error_code: 'PERSISTENCE_FAILED' } : { mode: 'NONE', trigger_count: 0, error_code: null } };
      await writeJson(resolve(root, base, 'observed-result.json'), observed);
      descriptors.push({ common_capture_ordinal: ordinal, capture_id: capture.capture_id, subject_id: capture.subject_id, attempt_ordinal: attempt, observed_result_ref: await fileRef(root, `${base}/observed-result.json`, 'CAPTURE_OBSERVED_RESULT'), png_ref: pngRef });
    }
  }
  return descriptors;
}

function dimensions(viewportId) { if (viewportId === 'VP-1440X900') return [1440, 900]; if (viewportId === 'VP-1280X800') return [1280, 800]; if (viewportId === 'VP-390X844') return [390, 844]; fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Common capture viewport is unknown.'); }
function testPng(width, height) { const chunk = (type, bytes) => { const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), bytes])) >>> 0); return Buffer.concat([header, Buffer.from(type, 'ascii'), bytes, tail]); }; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]); }
function crc32(bytes) { let value = -1; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return ~value; }
async function sourceRef(sourceRoot, path, kind) { return fileRef(sourceRoot, path, kind); }
async function absoluteFileRef(path, kind) { const info = await regular(path, kind); return { kind, path, byte_length: info.size, sha256: sha(await readFile(path)) }; }
async function fileRef(root, path, kind) { const target = inside(root, path); const info = await regular(target, kind); return { kind, path, byte_length: info.size, sha256: sha(await readFile(target)) }; }
async function treeRef(root, path, kind) { const files = await regularTree(inside(root, path)); return { kind, path, file_count: files.length, byte_length: files.reduce((total, item) => total + item.byte_length, 0), sha256: sha256Jcs(files) }; }
async function regularTree(root) { const items = []; async function walk(directory, prefix = '') { for (const entry of await readdir(directory, { withFileTypes: true })) { const item = prefix ? `${prefix}/${entry.name}` : entry.name; const target = resolve(directory, entry.name); if (entry.isDirectory()) { const details = await lstat(target); if (details.isSymbolicLink()) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Tree contains a symbolic directory.'); await walk(target, item); } else { const details = await regular(target, item); items.push({ path: item, byte_length: details.size, sha256: sha(await readFile(target)) }); } } } await walk(root); return items.sort((left, right) => compareUtf8(left.path, right.path)); }
async function assertCleanSource(sourceRoot) { if (git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Source root must be clean.'); }
async function regular(path, label) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${label} must be a single-link regular file.`); return info; }
async function requireFresh(path, label) { try { await lstat(path); fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${label} already exists.`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function quarantine(root) { const target = `${root}.quarantine-${process.pid}`; await requireFresh(target, 'Quarantine root'); await rename(root, target); }
async function fsyncTree(root) { for (const entry of await readdir(root, { withFileTypes: true })) { const target = resolve(root, entry.name); if (entry.isDirectory()) await fsyncTree(target); else await fsyncFile(target); } await fsyncDirectory(root); }
async function fsyncFile(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function json(path, name) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${name} must be valid JSON.`); } }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }
async function schema(name) { return json(resolve(ROOT, 'docs/contracts/schemas', name), name); }
function parseOptions(values) { const names = ['source-root', 'handoff-root', 'intake-report', 'java-executable', 'runtime-jar', 'change-id', 'source-date-epoch', 'output-root']; const result = new Map(); for (let index = 0; index < values.length; index += 2) { const flag = values[index]; const value = values[index + 1]; if (!flag?.startsWith('--') || !names.includes(flag.slice(2)) || value === undefined || result.has(flag.slice(2))) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Builder CLI is invalid.'); result.set(flag.slice(2), value); } if (result.size !== names.length) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Builder CLI is incomplete.'); return result; }
function absolutePath(value) { if (!value?.startsWith('/')) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Absolute path is required.'); return resolve(value); }
async function absoluteRealpath(value) { const requested = absolutePath(value); const canonical = await realpath(requested).catch(() => null); if (canonical !== requested) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Path must be an exact absolute realpath.'); return canonical; }
function inside(root, path) { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Relative path is invalid.'); const target = resolve(root, path); const relation = relative(root, target); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Path escapes root.'); return target; }
function safeInteger(value) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Source date epoch is invalid.'); return number; }
function git(root, args) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }); if (result.status !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Git source preflight failed.'); return result.stdout.trim(); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function sameRaw(left, right) { return left.byte_length === right.byte_length && left.sha256 === right.sha256; }
function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
function fail(code, exitCode, message) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
