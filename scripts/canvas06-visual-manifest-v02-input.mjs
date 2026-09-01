import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

import { verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';
import { loadProductionReadyTrustChain } from './canvas06-e2e-manifest-v01-trust.mjs';

const COMMON = Object.freeze(['input-mode', 'source-root', 'runtime-jar', 'web-dist', 'approved-version-root', 'output-root', 'out']);
const PRODUCTION = Object.freeze(['handoff-root', 'intake-report']);
const CONTROLLED = Object.freeze(['controlled-bundle-root']);

export class VisualManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VisualManifestError';
    this.code = code;
    this.exitCode = code === 'VISUAL_MANIFEST_IO_FAILED' ? 4 : code.startsWith('VISUAL_GOLDEN_') ? 3 : 2;
  }
}

export function parseVisualManifestOptions(argv, { verifier = false } = {}) {
  const allowed = new Set([...COMMON, ...PRODUCTION, ...CONTROLLED, ...(verifier ? ['require-production'] : [])]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (typeof flag !== 'string' || !flag.startsWith('--') || flag.includes('=')) input('Visual Manifest received an unsupported argument.');
    const name = flag.slice(2);
    if (!allowed.has(name) || values.has(name)) input('Visual Manifest arguments are invalid.');
    if (name === 'require-production') { values.set(name, true); continue; }
    const value = argv[++index];
    if (typeof value !== 'string' || !value || value.startsWith('--')) input('Visual Manifest argument value is missing.');
    values.set(name, value);
  }
  for (const name of COMMON) if (!values.has(name)) input(`Visual Manifest requires --${name}.`);
  const mode = values.get('input-mode');
  if (!['CONTROLLED_TEST', 'PRODUCTION_HANDOFF'].includes(mode)) input('Visual Manifest input mode is invalid.');
  const active = mode === 'CONTROLLED_TEST' ? CONTROLLED : PRODUCTION;
  const inactive = mode === 'CONTROLLED_TEST' ? PRODUCTION : CONTROLLED;
  for (const name of active) if (!values.has(name)) input(`Visual Manifest requires --${name} for ${mode}.`);
  for (const name of inactive) if (values.has(name)) input(`Visual Manifest forbids --${name} for ${mode}.`);
  if (!verifier && values.has('require-production')) input('Producer forbids --require-production.');
  if (verifier && values.get('require-production') && mode !== 'PRODUCTION_HANDOFF') input('--require-production requires PRODUCTION_HANDOFF.');
  const outputRoot = absolute(values.get('output-root'), 'Output root');
  if (values.get('out') !== 'visual-manifest.json') input('--out must be visual-manifest.json.');
  return Object.freeze({
    inputMode: mode,
    sourceRoot: absolute(values.get('source-root'), 'Source root'),
    runtimeJar: absolute(values.get('runtime-jar'), 'Runtime JAR'),
    webDist: absolute(values.get('web-dist'), 'Web dist'),
    approvedVersionRoot: absolute(values.get('approved-version-root'), 'Approved version root'),
    outputRoot,
    outPath: resolve(outputRoot, values.get('out')),
    handoffRoot: values.has('handoff-root') ? absolute(values.get('handoff-root'), 'Handoff root') : null,
    intakeReport: values.get('intake-report') ?? null,
    controlledBundleRoot: values.has('controlled-bundle-root') ? absolute(values.get('controlled-bundle-root'), 'Controlled bundle root') : null,
    requireProduction: values.get('require-production') === true
  });
}

export async function loadVisualManifestInputs(options, { verifyApprovedVersion }) {
  await directory(options.sourceRoot, 'Source root');
  await regularFile(options.runtimeJar, 'Runtime JAR');
  await directory(options.webDist, 'Web dist');
  await directory(options.approvedVersionRoot, 'Approved version root');
  const trust = await loadTrust(options);
  const approved = await verifyApprovedVersion(options.approvedVersionRoot);
  const { report, approval, environment } = approved;
  const planPath = resolve(options.approvedVersionRoot, 'capture-plan.json');
  const plan = await json(planPath, 'Capture Plan');
  const refs = await approvedRefs(options.approvedVersionRoot);
  verifyApprovedJoin({ options, trust, report, approval, environment, plan, refs });
  return Object.freeze({ trust, report, approval, environment, plan, refs });
}

export async function loadTrust(options) {
  if (options.inputMode === 'CONTROLLED_TEST') {
    let bundle;
    try { bundle = await verifyControlledInputBundle({ bundleRoot: options.controlledBundleRoot, consumer: 'VISUAL' }); }
    catch (error) { unavailable(`Controlled bundle is invalid: ${error.message}`); }
    if (bundle.approved_version.root !== options.approvedVersionRoot) input('Controlled approved version root differs from CLI input.');
    const handoff = await json(bundle.references.handoff_ref.absolute_path, 'Controlled Handoff');
    return Object.freeze({ mode: 'CONTROLLED_TEST', root: bundle.root, intake: externalRef(bundle.references.intake_report_ref), handoff: externalRef(bundle.references.handoff_ref), upstreamSourceBuild: handoff.source_build, approvedReportRef: bundle.approved_version.ref });
  }
  try {
    const intake = await jsonRef(options.handoffRoot, options.intakeReport, 'INTAKE_REPORT');
    const chain = await loadProductionReadyTrustChain({ root: options.handoffRoot, intakePath: options.intakeReport, handoffPath: intake.value.handoff_ref.path });
    return Object.freeze({ mode: 'PRODUCTION_HANDOFF', root: options.handoffRoot, intake: chain.intake.ref, handoff: chain.handoff.ref, upstreamSourceBuild: chain.handoff.value.source_build, approvedReportRef: null });
  } catch (error) {
    unavailable(`Production Handoff chain is invalid: ${error.message}`);
  }
}

export function assembleVisualManifest({ inputs, runnerIdentity }) {
  const { trust, report, approval, environment, plan, refs } = inputs;
  const cases = groupCases(plan, report);
  const blankBaselines = mapBlanks(plan, report);
  const manifest = {
    schema_id: 'OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001', schema_version: '0.2',
    manifest_id: `dev-canvas-06.visual.${runnerIdentity.source_commit.slice(0, 12)}.${refs.authoring.sha256.slice(0, 12)}`,
    manifest_version: '0.2.0', generated_at: plan.generated_at,
    generator_identity: runnerIdentity,
    intake_report_ref: trust.intake, handoff_ref: trust.handoff,
    upstream_source_build: trust.upstreamSourceBuild,
    source_build: {
      source_commit: report.source_build.source_commit, dirty_before_build: false,
      build_command: report.source_build.build_command, node_version: report.source_build.node_full_version,
      lockfile_sha256: report.source_build.lockfile_sha256,
      web_dist: { kind: 'WEB_DIST_TREE', path: 'apps/web/dist', byte_length: 0, sha256: report.web_dist_tree_sha256 },
      local_runtime_jar: report.runtime_jar_ref
    },
    upstream_input_refs: plan.upstream_input_refs, input_materialization: plan.input_materialization,
    common_fixture_catalog_ref: plan.common_fixture_catalog_ref,
    environment_policy: pickEnvironmentPolicy(plan.environment_policy),
    golden_environment_ref: refs.environment, golden_authoring_report_ref: refs.authoring,
    golden_approval_record_ref: refs.approval, golden_set_version: report.golden_set_version,
    golden_set_sha256: report.new_golden_set_sha256, capture_plan_ref: refs.plan,
    capture_set_sha256: plan.capture_set_sha256,
    fixture_materialization_set_sha256: report.fixture_materialization_set_sha256,
    fixture_database_set_sha256: report.fixture_database_set_sha256,
    viewport_catalog: viewports(), zoom_catalog: zooms(), common_subjects: subjects(), blank_baselines: blankBaselines,
    pixel_policy: { policy_id: 'VISUAL_PIXEL_DIFF', policy_version: '0.1' },
    geometry_policy: { policy_id: 'VISUAL_GEOMETRY', policy_version: '0.1' },
    golden_policy: { policy_id: 'APPROVED_GOLDEN_ONLY', policy_version: '0.1' },
    cases,
    summary: { case_count: 378, capability_case_count: 306, common_case_count: 72, attempt_count: 756, capture_count: 1242, attempt_capture_count: 2484, pass_matched_count: 0, failed_count: 0, skipped_count: 0, retry_count: 0 }
  };
  return Object.freeze(manifest);
}

function verifyApprovedJoin({ options, trust, report, approval, environment, plan, refs }) {
  if (basename(options.approvedVersionRoot) !== report.golden_set_version || approval.golden_set_version !== report.golden_set_version || approval.approved_output_path !== `versions/${report.golden_set_version}`) unavailable('Approved version identity differs.');
  if (!sameRaw(report.approval_record_ref, refs.approval) || !sameRaw(report.golden_environment_ref, refs.environment) || !sameRaw(report.capture_plan_ref, refs.plan)) unavailable('Approved authoring references differ.');
  if (!sameRaw(approval.authored_golden_environment_ref, refs.environment) || !sameRaw(approval.capture_plan_ref, refs.plan)) unavailable('Approval references differ.');
  if (report.capture_set_sha256 !== undefined && report.capture_set_sha256 !== plan.capture_set_sha256) unavailable('Capture set differs.');
  if (report.fixture_materialization_report_refs?.length !== 130 || report.fixture_database_refs?.length !== 130 || report.approved_assets?.png_refs?.length !== 1242 || report.approved_assets?.blank_baseline_refs?.length !== 9) unavailable('Approved evidence count differs.');
  if (options.inputMode === 'CONTROLLED_TEST' && !sameControlledApprovedReport(trust.approvedReportRef, refs.authoring, options.approvedVersionRoot)) unavailable('Controlled approved version reference differs.');
  if (!trust.upstreamSourceBuild || trust.upstreamSourceBuild.source_commit !== report.source_build.source_commit) unavailable('Handoff and approved source build differ.');
  const commit = git(options.sourceRoot, ['rev-parse', 'HEAD']);
  if (git(options.sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']) || commit !== report.source_build.source_commit || plan.source_build.source_commit !== commit) unavailable('Source root is not the exact clean approved build.');
}

function groupCases(plan, report) {
  const golden = new Map(report.approved_assets.png_refs.map(item => [item.logical_id, item]));
  const groups = new Map();
  for (const capture of plan.captures) {
    const asset = golden.get(capture.capture_id);
    if (!asset) unavailable(`Approved PNG is missing for ${capture.capture_id}.`);
    const item = { visual_variant_key: capture.visual_variant_key, capture_id: capture.capture_id, fixture_ref: capture.fixture_ref,
      expected_revision: capture.expected_revision, focus_target_id: capture.focus_target_id, focus_anchor: capture.focus_anchor,
      expected_cells: capture.expected_cells, golden_ref: { kind: 'GOLDEN_PNG', path: asset.path, byte_length: asset.byte_length, sha256: asset.sha256 },
      critical_regions: capture.critical_regions.map(region => region.region_id), expected_projection_sha256: capture.expected_projection_sha256 };
    const current = groups.get(capture.case_id) ?? { case_id: capture.case_id, case_kind: capture.capture_kind === 'FAMILY' ? 'CAPABILITY' : 'COMMON', viewport_id: capture.viewport_id, zoom_id: capture.zoom_id, variant_captures: [] };
    if (capture.capture_kind === 'FAMILY') current.capability_id = capture.capability_id; else current.subject_id = capture.subject_id;
    current.variant_captures.push(item); groups.set(capture.case_id, current);
  }
  const cases = [...groups.values()];
  if (cases.length !== 378 || cases.filter(item => item.case_kind === 'CAPABILITY').length !== 306 || cases.filter(item => item.case_kind === 'COMMON').length !== 72) unavailable('Capture Plan case matrix differs.');
  return cases;
}

function mapBlanks(plan, report) {
  const assets = new Map(report.approved_assets.blank_baseline_refs.map(item => [item.logical_id, item]));
  return plan.blank_baselines.map(baseline => {
    const asset = assets.get(baseline.baseline_id);
    if (!asset) unavailable(`Approved blank baseline is missing for ${baseline.baseline_id}.`);
    return { kind: 'BLANK_PNG', path: asset.path, byte_length: asset.byte_length, sha256: asset.sha256 };
  });
}

function pickEnvironmentPolicy(value) { return { locale: value.locale, timezone: value.timezone, color_scheme: value.color_scheme, reduced_motion: value.reduced_motion, device_scale_factor: value.device_scale_factor }; }
function viewports() { return [{ viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 }, { viewport_id: 'VP-1280X800', width: 1280, height: 800, device_scale_factor: 1 }, { viewport_id: 'VP-390X844', width: 390, height: 844, device_scale_factor: 1 }]; }
function zooms() { return [{ zoom_id: 'Z-025', scale: 0.25 }, { zoom_id: 'Z-100', scale: 1 }, { zoom_id: 'Z-400', scale: 4 }]; }
function subjects() { return ['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK']; }

async function approvedRefs(root) { return Object.freeze({ authoring: await rawRef(root, 'authoring-report.json', 'AUTHORING_REPORT'), approval: await rawRef(root, 'approval-record.json', 'APPROVAL_RECORD'), environment: await rawRef(root, 'golden-environment.json', 'GOLDEN_ENVIRONMENT'), plan: await rawRef(root, 'capture-plan.json', 'CAPTURE_PLAN') }); }
async function json(path, label) { await regularFile(path, label); try { return JSON.parse(await readFile(path, 'utf8')); } catch { input(`${label} is not valid JSON.`); } }
async function jsonRef(root, path, kind) { const value = await json(resolve(root, path), kind); return { value, ref: await rawRef(root, path, kind) }; }
async function rawRef(root, path, kind) { const target = resolve(root, path); await regularFile(target, kind); const bytes = await readFile(target); return { kind, path: relative(root, target).replaceAll('\\', '/'), byte_length: bytes.length, sha256: digest(bytes) }; }
async function regularFile(path, label) { try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || (await realpath(path)) !== resolve(path)) throw new Error(); } catch { input(`${label} must be a regular non-symlink file.`); } }
async function directory(path, label) { try { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(path)) !== resolve(path)) throw new Error(); } catch { input(`${label} must be a directory.`); } }
function absolute(value, label) { if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) input(`${label} must be an absolute safe path.`); return resolve(value); }
function git(root, args) { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); } catch { unavailable('Source root is not a readable Git checkout.'); } }
function sameRaw(left, right) { return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function sameControlledApprovedReport(bundleRef, approvedRef, approvedRoot) { return bundleRef?.absolute_path === resolve(approvedRoot, 'authoring-report.json') && bundleRef.byte_length === approvedRef?.byte_length && bundleRef.sha256 === approvedRef?.sha256; }
function externalRef(reference) { return { kind: reference.kind, path: reference.path, byte_length: reference.byte_length, sha256: reference.sha256 }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function input(message) { throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', message); }
function unavailable(message) { throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', message); }
