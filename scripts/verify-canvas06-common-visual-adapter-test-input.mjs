import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const ROOT = resolve('.');
const PROFILE_FILES = Object.freeze([
  'grammar/representative-opl-grammar.json',
  'normalization/representative-normalization.json',
  'profile.json',
  'rules/representative-rule-set.json',
  'symbols/representative-symbol-catalog.json'
]);
const COMMON_CATALOG = 'dev-canvas-06-common-fixture-catalog.json';
const EXPECTED_FILE_COUNT = 340;

if (resolve(process.argv[1] ?? '') === new URL(import.meta.url).pathname) {
  verifyAdapterTestInputBundle(parseOptions(process.argv.slice(2))).then(() => process.stdout.write('COMMON_VISUAL_ADAPTER_TEST_INPUT_VALID\n')).catch(error => {
    process.stderr.write(`${error.code ?? 'GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED'}\n`);
    if (error.message) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}

export async function verifyAdapterTestInputBundle({ sourceRoot, handoffRoot, intakeReport, bundleRoot, expectedFinalRoot }) {
  const source = await exactDirectoryRoot(sourceRoot, 'Source root');
  const handoffRootPath = await exactDirectoryRoot(handoffRoot, 'Handoff root');
  const root = await exactDirectoryRoot(bundleRoot, 'Bundle root');
  const finalRoot = expectedFinalRoot === undefined ? root : absolutePath(expectedFinalRoot);
  if (expectedFinalRoot !== undefined && !root.startsWith(`${finalRoot}.staging-`)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Staging root does not belong to expected final root.');

  const upstream = await verifyUpstream(source, handoffRootPath, intakeReport);
  const bundle = await json(inside(root, 'adapter-test-input-bundle.json'), 'Bundle');
  const validators = await loadValidators();
  if (!validators.bundle(bundle)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `Bundle Schema is invalid: ${JSON.stringify(validators.bundle.errors)}`);
  const { bundle_payload_sha256, ...payload } = bundle;
  if (bundle_payload_sha256 !== sha256Jcs(payload)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Bundle payload digest differs.');
  if (bundle.source_commit !== upstream.sourceCommit || bundle.source_date_epoch < 0) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Bundle source identity differs from Handoff.');
  await exactRef(source, bundle.builder_source_ref, 'ADAPTER_TEST_INPUT_BUILDER_SOURCE');
  await exactRef(source, bundle.verifier_source_ref, 'ADAPTER_TEST_INPUT_VERIFIER_SOURCE');
  await verifyJava(bundle.java_executable_ref);
  if (!same(bundle.runtime_jar_source_ref, upstream.runtimeRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Bundle Runtime source ref differs from Handoff.');
  await exactRef(handoffRootPath, bundle.runtime_jar_source_ref, 'LOCAL_RUNTIME_JAR');
  await exactRef(root, bundle.runtime_jar_staged_ref, 'RUNTIME_JAR');
  if (!sameRaw(bundle.runtime_jar_source_ref, bundle.runtime_jar_staged_ref)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Staged Runtime JAR raw identity differs.');

  await verifyInventory(root);
  const profile = await verifyProfile(root, upstream.handoff.active_binding);
  if (!same(profile.profile_asset_tree_ref, bundle.profile_asset_tree_ref) || !same(profile.profile_asset_refs, bundle.profile_asset_refs)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Bundle Profile closure differs.');
  const common = await verifyCommon(root, upstream.handoffPath, upstream.handoff.active_binding);
  if (!same(common.treeRef, bundle.common_fixture_tree_ref) || !same(common.catalogRef, bundle.common_catalog_ref)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Bundle Common closure differs.');

  const plan = await verifyPlan({ root, bundle, upstream, common, validators });
  const request = await verifyRequest({ root, finalRoot, bundle, plan, profile, upstream, validators });
  await verifyCallbacks({ root, bundle, plan, common, request, validators });
  if (bundle.adapter_work_root !== `${finalRoot}.adapter-work` || await pathExists(bundle.adapter_work_root)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Adapter work root is not an absent final sibling.');
  return bundle;
}

async function verifyUpstream(sourceRoot, handoffRoot, intakeReport) {
  if (git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Source root must be clean.');
  const intake = await json(inside(handoffRoot, intakeReport), 'Intake Report');
  const validators = await loadUpstreamValidators();
  if (!validators.intake(intake) || intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'READY Intake is required.');
  const handoffPath = inside(handoffRoot, intake.handoff_ref.path);
  const handoff = await json(handoffPath, 'Handoff');
  if (!validators.handoff(handoff) || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoff.blockers.length !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'READY Handoff is required.');
  const ref = await refFor(handoffRoot, intake.handoff_ref.path, intake.handoff_ref.kind);
  if (!same(ref, intake.handoff_ref)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Intake Handoff raw ref differs.');
  const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']);
  if (sourceCommit !== handoff.source_build.source_commit) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Source HEAD differs from Handoff.');
  const runtime = handoff.build_artifacts.filter(item => item.kind === 'LOCAL_RUNTIME_JAR');
  if (runtime.length !== 1) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Handoff Runtime reference is invalid.');
  return { handoff, handoffPath, sourceCommit, runtimeRef: runtime[0] };
}

async function verifyProfile(root, binding) {
  try { return await loadProfileAssetClosure({ assetRoot: resolve(root, 'inputs/profile/assets'), manifestRootPath: 'profile/assets', activeBinding: binding }); }
  catch (error) { fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Profile closure differs: ${error.message}`); }
}

async function verifyCommon(root, handoffPath, binding) {
  const commonRoot = resolve(root, 'inputs/common');
  const treeRef = await treeRefFor(root, 'inputs/common', 'COMMON_FIXTURE_TREE');
  if (treeRef.file_count !== 43) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Common root does not contain 43 files.');
  const catalogRef = await refFor(root, `inputs/common/${COMMON_CATALOG}`, 'COMMON_FIXTURE_CATALOG');
  const catalog = await json(resolve(commonRoot, COMMON_CATALOG), 'Common Catalog');
  if (catalog.catalog_version !== '0.2.0' || !same(catalog.source_binding, binding)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Common Catalog binding differs.');
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/verify-canvas06-common-visual-fixtures.mjs'), '--handoff', handoffPath, '--fixture-root', commonRoot, '--catalog', COMMON_CATALOG], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, result.stderr || 'Common verifier rejected the root.');
  return { commonRoot, treeRef, catalogRef, catalog };
}

async function verifyPlan({ root, bundle, upstream, common, validators }) {
  await exactRef(root, bundle.capture_plan_ref, 'CAPTURE_PLAN');
  const plan = await json(inside(root, bundle.capture_plan_ref.path), 'Capture Plan');
  if (!validators.plan(plan)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Capture Plan Schema is invalid: ${JSON.stringify(validators.plan.errors)}`);
  if (plan.source_date_epoch !== bundle.source_date_epoch || plan.source_build.source_commit !== bundle.source_commit || !same(plan.active_binding, upstream.handoff.active_binding) || !same(plan.runtime_jar_ref, upstream.runtimeRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Capture Plan source join differs.');
  if (plan.captures.length !== 1242 || plan.summary.family_capture_count !== 1170 || plan.summary.common_capture_count !== 72 || plan.summary.capture_count !== 1242 || sha256Jcs(plan.captures) !== plan.capture_set_sha256) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Capture Plan cardinality or digest differs.');
  const expectedCatalogRef = await refFor(common.commonRoot, COMMON_CATALOG, 'COMMON_FIXTURE_CATALOG');
  if (!same(plan.common_fixture_catalog_ref, expectedCatalogRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Capture Plan Common Catalog ref differs.');
  const commonCaptures = plan.captures.filter(item => item.capture_kind === 'COMMON');
  if (commonCaptures.length !== 72) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Capture Plan Common capture count differs.');
  const expected = [];
  for (const subject of common.catalog.visual_subjects) for (const viewport of ['VP-1440X900', 'VP-1280X800', 'VP-390X844']) for (const zoom of ['Z-025', 'Z-100', 'Z-400']) expected.push({ subject, viewport, zoom });
  for (const [ordinal, item] of commonCaptures.entries()) await verifyCommonCapture(item, expected[ordinal], common.commonRoot, expectedCatalogRef);
  return plan;
}

async function verifyCommonCapture(capture, expected, commonRoot, catalogRef) {
  if (!expected || capture.subject_id !== expected.subject.subject_id || capture.viewport_id !== expected.viewport || capture.zoom_id !== expected.zoom || capture.visual_variant_key !== expected.subject.subject_id || !same(capture.fixture_ref, expected.subject.fixture_ref) || !same(capture.common_fixture_catalog_ref, catalogRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Common capture order or refs differ.');
  await exactRef(commonRoot, capture.fixture_ref, 'FIXTURE');
  const fixture = await json(inside(commonRoot, capture.fixture_ref.path), 'Common fixture');
  const projection = fixture.expected_projection; const expectedCells = projection.committed_cells.length + projection.transient_cells.length;
  const captureId = `VIS-CANVAS.COMMON.${capture.subject_id}.${capture.viewport_id}.${capture.zoom_id}.${sha(Buffer.from(capture.subject_id, 'utf8')).slice(0, 12)}`;
  if (capture.capture_id !== captureId || capture.expected_revision !== fixture.revision_document.revision_id || capture.expected_projection_sha256 !== sha256Jcs(projection) || capture.focus_target_id !== fixture.capture_setup.expected_focus_target_id || capture.focus_anchor !== fixture.capture_setup.expected_focus_anchor || capture.expected_cells !== expectedCells) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Common capture semantic join differs.');
}

async function verifyRequest({ root, finalRoot, bundle, plan, profile, upstream, validators }) {
  await exactRef(root, bundle.adapter_request_ref, 'ADAPTER_REQUEST');
  const request = await json(inside(root, bundle.adapter_request_ref.path), 'Adapter Request');
  if (!validators.request(request)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Adapter Request Schema is invalid: ${JSON.stringify(validators.request.errors)}`);
  const planRef = await refFor(root, 'inputs/golden/capture-plan.json', 'CAPTURE_PLAN');
  const stagedRuntimeRef = await refFor(root, 'inputs/build/local-runtime.jar', 'RUNTIME_JAR');
  if (!same(request.plan_ref, planRef) || !same(request.java_executable_ref, bundle.java_executable_ref) || !same(request.runtime_jar_ref, upstream.runtimeRef) || !same(request.profile_asset_tree_ref, profile.profile_asset_tree_ref) || !same(request.profile_asset_refs, profile.profile_asset_refs) || request.source_date_epoch !== bundle.source_date_epoch) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Adapter Request raw identity differs.');
  if (!sameRaw(request.runtime_jar_ref, stagedRuntimeRef) || !same(bundle.runtime_jar_staged_ref, stagedRuntimeRef)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Adapter Request Runtime raw identity differs.');
  const expected = { plan_path: resolve(finalRoot, 'inputs/golden/capture-plan.json'), common_fixture_root: resolve(finalRoot, 'inputs/common'), runtime_jar_path: resolve(finalRoot, 'inputs/build/local-runtime.jar'), profile_asset_root: resolve(finalRoot, 'inputs/profile/assets'), work_root: `${finalRoot}.adapter-work` };
  const suffix = bundle.bundle_id.slice('dev-canvas-06.common-visual-adapter-test.'.length);
  if (!Object.entries(expected).every(([key, value]) => request[key] === value) || bundle.adapter_work_root !== expected.work_root || request.request_id !== `dev-canvas-06.common-visual-adapter.test.${suffix}`) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Adapter Request final path join differs.');
  return request;
}

async function verifyCallbacks({ root, bundle, plan, common, request, validators }) {
  const captures = plan.captures.filter(item => item.capture_kind === 'COMMON'); const descriptors = bundle.callback_observed_results;
  if (descriptors.length !== 144 || new Set(descriptors.map(item => `${item.common_capture_ordinal}|${item.capture_id}|${item.subject_id}|${item.attempt_ordinal}`)).size !== 144) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Callback descriptor keys differ.');
  for (const [index, descriptor] of descriptors.entries()) {
    const ordinal = Math.floor(index / 2); const attempt = (index % 2) + 1; const capture = captures[ordinal]; const base = `callback-results/${String(ordinal).padStart(3, '0')}/attempt-${attempt}`;
    if (!capture || descriptor.common_capture_ordinal !== ordinal || descriptor.attempt_ordinal !== attempt || descriptor.capture_id !== capture.capture_id || descriptor.subject_id !== capture.subject_id || descriptor.observed_result_ref.path !== `${base}/observed-result.json` || descriptor.png_ref.path !== `${base}/capture.png`) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Callback descriptor ordering differs.');
    await exactRef(root, descriptor.observed_result_ref, 'CAPTURE_OBSERVED_RESULT'); await exactRef(root, descriptor.png_ref, 'TEST_CALLBACK_PNG');
    const observed = await json(inside(root, descriptor.observed_result_ref.path), 'Observed Result');
    if (!validators.observed(observed)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Observed Result Schema is invalid: ${JSON.stringify(validators.observed.errors)}`);
    const fixture = await json(inside(common.commonRoot, capture.fixture_ref.path), 'Common fixture'); const [width, height] = viewportDimensions(capture.viewport_id);
    const geometry = { schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-TEST-GEOMETRY-001', schema_version: '0.1', capture_id: capture.capture_id, committed_cells: fixture.expected_projection.committed_cells.map(item => ({ cell_id: item.cell_id, layer: item.layer, geometry: item.geometry })).sort((left, right) => compareUtf8(left.cell_id, right.cell_id)), transient_cells: fixture.expected_projection.transient_cells };
    const expectedFault = capture.subject_id === 'BLOCKED_FEEDBACK' ? { mode: 'BLOCKED_FEEDBACK_ONE_SHOT', trigger_count: 1, error_code: 'PERSISTENCE_FAILED' } : { mode: 'NONE', trigger_count: 0, error_code: null };
    if (observed.request_id !== request.request_id || observed.capture_id !== capture.capture_id || observed.subject_id !== capture.subject_id || observed.attempt_ordinal !== attempt || observed.width !== width || observed.height !== height || observed.png_byte_length !== descriptor.png_ref.byte_length || observed.png_sha256 !== descriptor.png_ref.sha256 || observed.cell_geometry_sha256 !== sha256Jcs(geometry) || !same(observed.normalized_projection, fixture.expected_projection) || observed.projection_sha256 !== capture.expected_projection_sha256 || observed.observed_cells !== capture.expected_cells || observed.focus_target_id !== capture.focus_target_id || observed.focus_anchor !== capture.focus_anchor || !same(observed.fault_observation, expectedFault)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Observed Result semantic join differs.');
    await verifyPng(inside(root, descriptor.png_ref.path), width, height);
  }
}

async function verifyInventory(root) {
  const files = await regularTree(root);
  if (files.length !== EXPECTED_FILE_COUNT) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Bundle root must contain exactly ${EXPECTED_FILE_COUNT} files.`);
  const required = new Set(['adapter-test-input-bundle.json', 'adapter-request.json', 'inputs/build/local-runtime.jar', 'inputs/golden/capture-plan.json']);
  for (const path of PROFILE_FILES) required.add(`inputs/profile/assets/${path}`);
  for (let ordinal = 0; ordinal < 72; ordinal += 1) for (const attempt of [1, 2]) { const base = `callback-results/${String(ordinal).padStart(3, '0')}/attempt-${attempt}`; required.add(`${base}/observed-result.json`); required.add(`${base}/capture.png`); }
  for (const path of files.map(item => item.path)) if (!required.has(path) && !path.startsWith('inputs/common/')) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `Unexpected Bundle file: ${path}`);
}

async function verifyJava(reference) {
  if (reference.kind !== 'JAVA_EXECUTABLE' || !reference.path.startsWith('/')) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java reference is invalid.');
  const canonical = await realpath(reference.path).catch(() => null);
  if (canonical !== reference.path || basename(canonical) !== 'java') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java path is not an exact realpath.');
  const info = await regular(canonical, 'Java executable');
  if ((info.mode & 0o111) === 0 || info.size !== reference.byte_length || sha(await readFile(canonical)) !== reference.sha256) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java raw identity differs.');
  const version = spawnSync(canonical, ['-version'], { encoding: 'utf8', env: {} }); if (version.status !== 0 || !/version "21(?:[._"])/.test(version.stderr)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Java version differs.');
  const jar = resolve(dirname(dirname(canonical)), 'bin/jar'); const jarCanonical = await realpath(jar).catch(() => null);
  if (jarCanonical !== jar) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Derived JDK jar is invalid.');
  const jarInfo = await regular(jar, 'Derived JDK jar'); const output = spawnSync(jar, ['--version'], { encoding: 'utf8', env: {} });
  if ((jarInfo.mode & 0o111) === 0 || output.status !== 0 || !/^jar 21(?:\.|$)/.test(`${output.stdout ?? ''}${output.stderr ?? ''}`.trim())) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Derived JDK jar version differs.');
}

async function verifyPng(path, width, height) {
  const bytes = await readFile(path); const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG signature differs.');
  let offset = 8; let seenIhdr = false; let seenIend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG chunk is truncated.');
    const length = bytes.readUInt32BE(offset); const type = bytes.subarray(offset + 4, offset + 8); const end = offset + 12 + length;
    if (end > bytes.length) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG chunk length differs.');
    const data = bytes.subarray(offset + 8, offset + 8 + length); const actual = bytes.readUInt32BE(offset + 8 + length);
    if ((crc32(Buffer.concat([type, data])) >>> 0) !== actual) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG CRC differs.');
    const name = type.toString('ascii');
    if (name === 'IHDR') { if (seenIhdr || length !== 13 || data.readUInt32BE(0) !== width || data.readUInt32BE(4) !== height || data[8] !== 8 || data[9] !== 6) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG IHDR differs.'); seenIhdr = true; }
    if (name === 'IEND') { if (length !== 0 || end !== bytes.length) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG IEND differs.'); seenIend = true; }
    offset = end;
  }
  if (!seenIhdr || !seenIend) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'PNG required chunks are missing.');
}

async function loadValidators() { const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }); const revision = await schema('opm-revision-v0.2.schema.json'); const fixture = await schema('opm-dev-canvas-06-common-visual-fixture.schema.json'); ajv.addSchema(revision); ajv.addSchema(fixture); return { bundle: ajv.compile(await schema('opm-dev-canvas-06-common-visual-adapter-test-input-bundle.schema.json')), request: ajv.compile(await schema('opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json')), plan: ajv.compile(await schema('opm-dev-canvas-06-golden-capture-plan.schema.json')), observed: ajv.compile(await schema('opm-dev-canvas-06-common-visual-capture-observed-result.schema.json')) }; }
async function loadUpstreamValidators() { const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }); return { intake: ajv.compile(await schema('opm-dev-canvas-06-intake-report.schema.json')), handoff: ajv.compile(await schema('opm-dev-canvas-05-handoff.schema.json')) }; }
async function exactRef(root, reference, kind) { if (reference.kind !== kind) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `${kind} reference kind differs.`); const actual = await refFor(root, reference.path, kind); if (!same(actual, reference)) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `${kind} raw reference differs.`); }
async function refFor(root, path, kind) { const target = inside(root, path); const info = await regular(target, kind); return { kind, path, byte_length: info.size, sha256: sha(await readFile(target)) }; }
async function treeRefFor(root, path, kind) { const files = await regularTree(inside(root, path)); return { kind, path, file_count: files.length, byte_length: files.reduce((total, item) => total + item.byte_length, 0), sha256: sha256Jcs(files) }; }
async function regularTree(root) { const files = []; async function walk(directory, prefix = '') { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = prefix ? `${prefix}/${entry.name}` : entry.name; const target = resolve(directory, entry.name); if (entry.isDirectory()) { const details = await lstat(target); if (details.isSymbolicLink()) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Tree contains symbolic directory.'); await walk(target, path); } else { const details = await regular(target, path); files.push({ path, byte_length: details.size, sha256: sha(await readFile(target)) }); } } } await walk(root); return files.sort((left, right) => compareUtf8(left.path, right.path)); }
function viewportDimensions(viewport) { if (viewport === 'VP-1440X900') return [1440, 900]; if (viewport === 'VP-1280X800') return [1280, 800]; if (viewport === 'VP-390X844') return [390, 844]; fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, 'Unknown viewport.'); }
function crc32(bytes) { let value = -1; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return ~value; }
async function exactDirectoryRoot(value, label) { const path = absolutePath(value); const canonical = await realpath(path).catch(() => null); if (canonical !== path) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${label} must be an exact realpath.`); const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${label} must be a directory.`); return path; }
async function regular(path, label) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH', 3, `${label} must be a single-link regular file.`); return info; }
async function pathExists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function json(path, name) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, `${name} must be valid JSON.`); } }
async function schema(name) { return json(resolve(ROOT, 'docs/contracts/schemas', name), name); }
function parseOptions(values) { const names = new Set(['source-root', 'handoff-root', 'intake-report', 'bundle-root', 'bundle', 'expected-final-root']); const result = new Map(); for (let index = 0; index < values.length; index += 2) { const flag = values[index]; const value = values[index + 1]; if (!flag?.startsWith('--') || !names.has(flag.slice(2)) || value === undefined || result.has(flag.slice(2))) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Verifier CLI is invalid.'); result.set(flag.slice(2), value); } for (const required of ['source-root', 'handoff-root', 'intake-report', 'bundle-root', 'bundle']) if (!result.has(required)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Verifier CLI is incomplete.'); if (result.get('bundle') !== 'adapter-test-input-bundle.json') fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Bundle name is fixed.'); return { sourceRoot: result.get('source-root'), handoffRoot: result.get('handoff-root'), intakeReport: result.get('intake-report'), bundleRoot: result.get('bundle-root'), ...(result.has('expected-final-root') ? { expectedFinalRoot: result.get('expected-final-root') } : {}) }; }
function absolutePath(value) { if (!value?.startsWith('/')) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Absolute path is required.'); return resolve(value); }
function inside(root, path) { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Relative path is invalid.'); const target = resolve(root, path); const relation = relative(root, target); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Path escapes root.'); return target; }
function git(root, args) { const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }); if (result.status !== 0) fail('GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID', 2, 'Git source preflight failed.'); return result.stdout.trim(); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function sameRaw(left, right) { return left.byte_length === right.byte_length && left.sha256 === right.sha256; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
function fail(code, exitCode, message) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
