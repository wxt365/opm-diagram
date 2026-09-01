import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { runCommonVisualMaterialization } from './canvas06-common-visual-materialization.mjs';
import { canonicalizeColorProfile } from './canvas06-common-visual-color-profile.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { collectFamilyFixtures } from './release-canvas06-golden-materialize.mjs';
import { main as verifyGoldenMaterializationRoot } from './verify-canvas06-golden-materialization.mjs';
import { goldenEnvironmentFingerprintInput, verifyGoldenEnvironmentV02 } from './verify-canvas06-golden-environment-v02.mjs';

const ROOT = resolve('.');
const FONT_INPUT_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-font-input.schema.json';
const LINEAGE_INPUT_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-lineage-input.schema.json';
const AUTHORING_REPORT_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json';
const ADAPTER_REQUEST_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json';
const PLAN_SCHEMA = 'docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json';
const REQUIRED_OPTIONS = [
  'plan', 'source-root', 'runtime-jar', 'materialization-root', 'candidate-root',
  'source-date-epoch', 'common-adapter-request', 'browser-executable', 'font-manifest', 'authoring-lineage'
];

export class GoldenAuthorError extends Error {
  constructor(code, exitCode, message) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseAuthorOptions(values) {
  if (values.length !== REQUIRED_OPTIONS.length * 2) input('Author options are incomplete.');
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    const key = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!REQUIRED_OPTIONS.includes(key) || value === undefined || result.has(key)) input('Author options are invalid.');
    result.set(key, value);
  }
  if (REQUIRED_OPTIONS.some(key => !result.has(key))) input('Author options are incomplete.');
  const epoch = Number(result.get('source-date-epoch'));
  if (!Number.isSafeInteger(epoch) || epoch < 0 || String(epoch) !== result.get('source-date-epoch')) input('source-date-epoch is invalid.');
  return Object.freeze({
    planPath: absolutePath(result.get('plan'), 'Plan'),
    sourceRoot: absolutePath(result.get('source-root'), 'Source root'),
    runtimeJarPath: absolutePath(result.get('runtime-jar'), 'Runtime JAR'),
    materializationRoot: absolutePath(result.get('materialization-root'), 'Materialization root'),
    candidateRoot: absolutePath(result.get('candidate-root'), 'Candidate root'),
    sourceDateEpoch: epoch,
    commonAdapterRequestPath: absolutePath(result.get('common-adapter-request'), 'Common Adapter Request'),
    browserExecutablePath: absolutePath(result.get('browser-executable'), 'Browser executable'),
    fontManifestPath: absolutePath(result.get('font-manifest'), 'Font Manifest'),
    authoringLineagePath: absolutePath(result.get('authoring-lineage'), 'Authoring Lineage')
  });
}

export async function preflightAuthorInvocation(options) {
  const contracts = await loadContracts();
  await assertFreshPath(options.candidateRoot, 'Candidate root');
  await assertOrdinaryDirectory(options.sourceRoot, 'Source root');
  await assertOrdinaryDirectory(options.materializationRoot, 'Materialization root');
  const plan = await readJson(options.planPath, 'Plan');
  if (!contracts.plan(plan)) input('Plan Schema is invalid.');
  if (plan.plan_status !== 'READY_FOR_AUTHORING' || plan.source_date_epoch !== options.sourceDateEpoch) input('Plan status or epoch differs.');
  assertCleanSource(options.sourceRoot, plan.source_build.source_commit);
  const planRef = await rawRef(options.planPath, 'CAPTURE_PLAN');
  const runtimeJarFile = await rawFileIdentity(options.runtimeJarPath);
  if (plan.runtime_jar_ref?.kind !== 'LOCAL_RUNTIME_JAR' || !sameBytes(plan.runtime_jar_ref, runtimeJarFile)) input('Plan Runtime JAR differs from CLI Runtime JAR.');
  const request = await readJson(options.commonAdapterRequestPath, 'Common Adapter Request');
  if (!contracts.adapterRequest(request)) input('Common Adapter Request Schema is invalid.');
  await validateAdapterRequestJoin({ request, planPath: options.planPath, planRef, planRuntimeJarRef: plan.runtime_jar_ref, runtimeJarPath: options.runtimeJarPath, runtimeJarFile, sourceDateEpoch: options.sourceDateEpoch, candidateRoot: options.candidateRoot, sourceRoot: options.sourceRoot, materializationRoot: options.materializationRoot });
  const browser = await executableRef(options.browserExecutablePath);
  const fonts = await loadFontManifest(options.fontManifestPath, contracts.fontInput);
  const lineage = await loadAuthoringLineage(options.authoringLineagePath, contracts.lineageInput, plan.change_id);
  const materialization = await collectVerifiedFamilyMaterialization({ planPath: options.planPath, materializationRoot: options.materializationRoot, plan });
  return Object.freeze({ plan: Object.freeze(plan), planRef, runtimeJarRef: Object.freeze({ ...plan.runtime_jar_ref }), runtimeJarFile, request: Object.freeze(request), browser, fonts, lineage, materialization });
}

export async function validateAdapterRequestJoin({ request, planPath, planRef, planRuntimeJarRef, runtimeJarPath, runtimeJarFile, sourceDateEpoch, candidateRoot, sourceRoot, materializationRoot }) {
  const actualPlanPath = await realpath(planPath);
  const actualRuntimeJarPath = await realpath(runtimeJarPath);
  if (request.plan_path !== actualPlanPath || !sameBytes(request.plan_ref, planRef)) input('Common Adapter Request Plan differs from Author input.');
  if (request.runtime_jar_path !== actualRuntimeJarPath || !sameRaw(request.runtime_jar_ref, planRuntimeJarRef) || !sameBytes(request.runtime_jar_ref, runtimeJarFile)) input('Common Adapter Request Runtime JAR differs from Author input.');
  if (request.source_date_epoch !== sourceDateEpoch) input('Common Adapter Request epoch differs from Author input.');
  await assertFreshPath(request.work_root, 'Common Adapter work root');
  for (const forbiddenRoot of [candidateRoot, sourceRoot, materializationRoot]) {
    if (isInside(forbiddenRoot, request.work_root)) input('Common Adapter work root escapes its ownership boundary.');
  }
}

/**
 * 03B 只消费03A已经通过完整语义校验的固定根；不得以目录扫描补齐成员。
 */
export async function collectVerifiedFamilyMaterialization({ planPath, materializationRoot, plan, verify = verifyGoldenMaterializationRoot }) {
  if (!planPath || !materializationRoot || !plan || typeof verify !== 'function') input('Family Materialization collection input is invalid.');
  try {
    await verify(['--plan', planPath, '--materialization-root', materializationRoot, '--require-materialized']);
  } catch (error) {
    if (error instanceof GoldenAuthorError) throw error;
    if (error?.exitCode === 2) input('Family Materialization root input is invalid.');
    environment('Family Materialization root is not consumable.');
  }

  let fixtures;
  try { fixtures = collectFamilyFixtures(plan); }
  catch { input('Capture Plan Family fixture set is invalid.'); }

  const reportRefs = [];
  const databaseRefs = [];
  for (const fixture of fixtures) {
    const reportPath = resolveInside(materializationRoot, `reports/${fixture.key}.json`);
    const report = await readJson(reportPath, 'Materialization Report');
    const declaredDatabase = report?.target_storage?.database_ref;
    const semanticState = report?.target_storage?.semantic_state_sha256;
    if (report?.report_status !== 'MATERIALIZED' || report.fixture_ref_key !== fixture.key
        || !declaredDatabase || !/^[a-f0-9]{64}$/.test(semanticState ?? '')) {
      environment('Family Materialization Report differs from its verified identity.');
    }
    const reportRef = await logicalRawRef(materializationRoot, reportPath, 'MATERIALIZATION_REPORT', `materialization/reports/${fixture.key}.json`);
    const databasePath = resolveInside(materializationRoot, declaredDatabase.path);
    const databaseRef = await logicalRawRef(materializationRoot, databasePath, 'DATABASE', `materialization/${declaredDatabase.path}`);
    if (declaredDatabase.kind !== databaseRef.kind || !sameBytes(declaredDatabase, databaseRef)) environment('Family Materialization database raw reference differs.');
    reportRefs.push(Object.freeze({ fixture_ref_key: fixture.key, report_ref: reportRef }));
    databaseRefs.push(Object.freeze({ fixture_ref_key: fixture.key, database_ref: databaseRef, semantic_state_sha256: semanticState }));
  }
  return Object.freeze({
    report_refs: Object.freeze(reportRefs),
    database_refs: Object.freeze(databaseRefs)
  });
}

export function assertCleanSource(sourceRoot, expectedCommit) {
  let status;
  let commit;
  try {
    status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  } catch { environment('Source root is not a readable Git checkout.'); }
  if (status) environment('Source checkout is dirty.');
  if (commit !== expectedCommit) environment('Source commit differs from Capture Plan.');
  return commit;
}

export async function loadFontManifest(path, validator) {
  const manifest = await readJson(path, 'Font Manifest');
  if (!validator(manifest)) input('Font Manifest Schema is invalid.');
  const fonts = [];
  for (const font of manifest.fonts) {
    const sourcePath = await realpath(font.source_path).catch(() => input('Font source path is unavailable.'));
    if (sourcePath !== font.source_path || font.source_ref.path !== sourcePath) input('Font source path/ref differs.');
    const ref = await rawRef(sourcePath, 'FONT_FILE');
    if (!sameRaw(font.source_ref, ref)) input('Font source raw reference differs.');
    fonts.push(Object.freeze({ logical_role: font.logical_role, postscript_name: font.postscript_name, font_version: font.font_version, source_path: sourcePath, source_ref: ref }));
  }
  return Object.freeze(fonts);
}

export async function loadAuthoringLineage(path, validator, changeId) {
  const lineage = await readJson(path, 'Authoring Lineage');
  if (!validator(lineage) || lineage.lineage_id !== `dev-canvas-06.golden-authoring-lineage.${changeId}`) input('Authoring Lineage differs from Capture Plan change.');
  return Object.freeze(lineage);
}

export async function writeCandidateGoldenEnvironment({ candidateTemporaryRoot, plan, browser, fonts, captureAssets, blankAssets, runtime }) {
  await assertOrdinaryDirectory(candidateTemporaryRoot, 'Candidate temporary root');
  const captures = await collectCanonicalAssets(candidateTemporaryRoot, captureAssets, plan.captures, 'capture_id', 'PNG', capture => `${capture.capture_id}.png`);
  const blanks = await collectCanonicalAssets(candidateTemporaryRoot, blankAssets, plan.blank_baselines, 'baseline_id', 'BLANK_PNG', baseline => `blank/${baseline.baseline_id}.png`);
  const fontRefs = await copyCandidateFonts(candidateTemporaryRoot, fonts);
  const environment = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001',
    schema_version: '0.2',
    environment_id: '',
    generated_at: new Date(plan.source_date_epoch * 1000).toISOString(),
    os_name: runtime.os_name,
    os_build: runtime.os_build,
    arch: runtime.arch,
    playwright_version: runtime.playwright_version,
    chromium_version: runtime.chromium_version,
    browser_executable: browser,
    launch_args: [...plan.environment_policy.launch_args],
    color_profile: canonicalizeColorProfile(plan.environment_policy.color_profile, plan.environment_policy.launch_args),
    font_refs: fontRefs,
    locale: plan.environment_policy.locale,
    timezone: plan.environment_policy.timezone,
    color_scheme: plan.environment_policy.color_scheme,
    reduced_motion: plan.environment_policy.reduced_motion,
    device_scale_factor: plan.environment_policy.device_scale_factor,
    screenshot_options: { ...plan.environment_policy.screenshot_options, mask_count: 0 },
    environment_fingerprint: '',
    png_refs: captures,
    blank_baseline_refs: blanks
  };
  environment.environment_fingerprint = sha256(Buffer.from(canonicalizeJcs(goldenEnvironmentFingerprintInput(environment)), 'utf8'));
  environment.environment_id = `dev-canvas-06.golden-environment.${environment.environment_fingerprint.slice(0, 12)}`;
  verifyGoldenEnvironmentV02(environment, { sourceDateEpoch: plan.source_date_epoch });
  const path = resolve(candidateTemporaryRoot, 'golden-environment.json');
  await atomicWriteFresh(path, `${canonicalizeJcs(environment)}\n`);
  return Object.freeze({ value: Object.freeze(environment), ref: await logicalRawRef(candidateTemporaryRoot, path, 'GOLDEN_ENVIRONMENT') });
}

export async function writeCandidateAuthoringReport({ candidateTemporaryRoot, plan, capturePlanRef, lineage, authoredEnvironment, materialization, captureAttemptResults, blankAttemptResults, generatorIdentity, materializationVerifierIdentity }) {
  const contracts = await loadContracts();
  const report = buildCandidateAuthoringReport({ plan, capturePlanRef, lineage, authoredEnvironment, materialization, captureAttemptResults, blankAttemptResults, generatorIdentity, materializationVerifierIdentity });
  verifyCandidateAuthoringReport(report, { plan, capturePlanRef, authoredEnvironment, materialization, validator: contracts.authoringReport });
  const path = resolve(candidateTemporaryRoot, 'candidate-authoring-report.json');
  await atomicWriteFresh(path, `${canonicalizeJcs(report)}\n`);
  return Object.freeze({ value: Object.freeze(report), ref: await logicalRawRef(candidateTemporaryRoot, path, 'AUTHORING_REPORT') });
}

export async function runCandidateTransaction(candidateRoot, writer) {
  if (typeof writer !== 'function') input('Candidate transaction writer is invalid.');
  await assertFreshPath(candidateRoot, 'Candidate root');
  await assertOrdinaryDirectory(dirname(candidateRoot), 'Candidate parent');
  const temporary = `${candidateRoot}.tmp-${process.pid}-${Date.now()}`;
  await assertFreshPath(temporary, 'Candidate temporary root');
  await mkdir(temporary, { recursive: false });
  try {
    const result = await writer(temporary);
    await fsyncDirectory(temporary);
    await rename(temporary, candidateRoot);
    await fsyncDirectory(dirname(candidateRoot));
    return result;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function buildCandidateAuthoringReport({ plan, capturePlanRef, lineage, authoredEnvironment, materialization, captureAttemptResults, blankAttemptResults, generatorIdentity, materializationVerifierIdentity }) {
  const environment = authoredEnvironment.value;
  const captureAssets = environment.png_refs.map(value => ({ logical_id: value.capture_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 }));
  const blankAssets = environment.blank_baseline_refs.map(value => ({ logical_id: value.baseline_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 }));
  const fontAssets = environment.font_refs.map(value => ({ logical_id: value.logical_role, path: value.path, byte_length: value.byte_length, sha256: value.sha256 }));
  const sourceBuildDigest = sha256(Buffer.from(canonicalizeJcs(sourceBuildDigestInput(plan.source_build)), 'utf8'));
  const fixtureMaterializationSet = sha256(Buffer.from(canonicalizeJcs(materialization.report_refs), 'utf8'));
  const fixtureDatabaseSet = sha256(Buffer.from(canonicalizeJcs(materialization.database_refs), 'utf8'));
  const candidateAttemptSet = sha256(Buffer.from(canonicalizeJcs({ capture_attempt_results: captureAttemptResults, blank_attempt_results: blankAttemptResults }), 'utf8'));
  const goldenSet = sha256(Buffer.from(canonicalizeJcs({
    capture_plan_sha256: capturePlanRef.sha256,
    capture_set_sha256: plan.capture_set_sha256,
    source_build_digest: sourceBuildDigest,
    runtime_jar_sha256: plan.runtime_jar_ref.sha256,
    web_dist_tree_sha256: plan.web_dist_tree_sha256,
    common_fixture_catalog_sha256: plan.common_fixture_catalog_ref.sha256,
    fixture_materialization_set_sha256: fixtureMaterializationSet,
    fixture_database_set_sha256: fixtureDatabaseSet,
    environment_fingerprint: environment.environment_fingerprint,
    png_refs: captureAssets.map(value => ({ capture_id: value.logical_id, path: value.path, byte_length: value.byte_length, sha256: value.sha256 })),
    blank_baseline_refs: blankAssets.map(value => ({ baseline_id: value.logical_id, path: value.path, byte_length: value.byte_length, sha256: value.sha256 }))
  }), 'utf8'));
  const report = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001', schema_version: '0.2',
    report_id: `dev-canvas-06.golden-authoring-report.${plan.change_id}.candidate`, report_version: '0.2.0', report_status: 'READY_FOR_APPROVAL', change_id: plan.change_id,
    generated_at: new Date(plan.source_date_epoch * 1000).toISOString(), source_date_epoch: plan.source_date_epoch,
    generator_identity: generatorIdentity, capture_plan_ref: capturePlanRef, handoff_ref: plan.handoff_ref, intake_report_ref: plan.intake_report_ref,
    source_build: plan.source_build, source_build_digest: sourceBuildDigest, runtime_jar_ref: plan.runtime_jar_ref, web_dist_tree_sha256: plan.web_dist_tree_sha256,
    input_materialization: plan.input_materialization,
    environment: { environment_fingerprint: environment.environment_fingerprint, locale: environment.locale, timezone: environment.timezone, color_scheme: environment.color_scheme, reduced_motion: environment.reduced_motion, device_scale_factor: environment.device_scale_factor },
    authored_golden_environment_ref: authoredEnvironment.ref,
    capture_summary: { capture_count: 1242, blank_baseline_count: 9, capture_attempt_count: 2484, blank_attempt_count: 18, deterministic: true },
    approved_assets: { png_refs: captureAssets, blank_baseline_refs: blankAssets, font_refs: fontAssets },
    old_golden_set_version: lineage.old_golden_set_version, old_golden_set_sha256: lineage.old_golden_set_sha256,
    new_golden_set_sha256: goldenSet, golden_set_version: lineage.golden_set_version, command: 'npm run release:canvas06:golden:author', failures: [],
    materialization_verifier_identity: materializationVerifierIdentity, fixture_materialization_report_refs: materialization.report_refs, fixture_materialization_set_sha256: fixtureMaterializationSet,
    fixture_database_refs: materialization.database_refs, fixture_database_set_sha256: fixtureDatabaseSet,
    capture_attempt_results: captureAttemptResults, blank_attempt_results: blankAttemptResults, candidate_attempt_set_sha256: candidateAttemptSet, report_payload_sha256: ''
  };
  report.report_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(without(report, 'report_payload_sha256')), 'utf8'));
  return report;
}

export function verifyCandidateAuthoringReport(report, { plan, capturePlanRef, authoredEnvironment, materialization, validator }) {
  if (!validator(report)) environment('Candidate Authoring Report Schema is invalid.');
  const environment = authoredEnvironment.value;
  if (report.report_status !== 'READY_FOR_APPROVAL' || report.change_id !== plan.change_id || !sameRaw(report.capture_plan_ref, capturePlanRef)
      || !sameRaw(report.authored_golden_environment_ref, authoredEnvironment.ref) || report.source_build_digest !== sha256(Buffer.from(canonicalizeJcs(sourceBuildDigestInput(plan.source_build)), 'utf8'))
      || report.fixture_materialization_set_sha256 !== sha256(Buffer.from(canonicalizeJcs(materialization.report_refs), 'utf8'))
      || report.fixture_database_set_sha256 !== sha256(Buffer.from(canonicalizeJcs(materialization.database_refs), 'utf8'))
      || report.candidate_attempt_set_sha256 !== sha256(Buffer.from(canonicalizeJcs({ capture_attempt_results: report.capture_attempt_results, blank_attempt_results: report.blank_attempt_results }), 'utf8'))
      || report.report_payload_sha256 !== sha256(Buffer.from(canonicalizeJcs(without(report, 'report_payload_sha256')), 'utf8'))) environment('Candidate Authoring Report digest closure differs.');
  verifyAttemptOrder(report.capture_attempt_results, plan.captures, 'capture_id', ['png_byte_length', 'png_sha256', 'width', 'height', 'cell_geometry_sha256', 'projection_sha256']);
  verifyAttemptOrder(report.blank_attempt_results, plan.blank_baselines, 'baseline_id', ['png_byte_length', 'png_sha256', 'width', 'height']);
  if (canonicalizeJcs(report.approved_assets.png_refs) !== canonicalizeJcs(environment.png_refs.map(value => ({ logical_id: value.capture_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 })))
      || canonicalizeJcs(report.approved_assets.blank_baseline_refs) !== canonicalizeJcs(environment.blank_baseline_refs.map(value => ({ logical_id: value.baseline_id, path: value.ref.path, byte_length: value.ref.byte_length, sha256: value.ref.sha256 })))
      || canonicalizeJcs(report.approved_assets.font_refs) !== canonicalizeJcs(environment.font_refs.map(value => ({ logical_id: value.logical_role, path: value.path, byte_length: value.byte_length, sha256: value.sha256 })))) environment('Candidate Authoring Report assets differ from Golden Environment.');
}

function verifyAttemptOrder(results, expected, idKey, fields) {
  if (!Array.isArray(results) || results.length !== expected.length * 2) environment('Candidate attempt count differs.');
  for (const [index, expectedEntry] of expected.entries()) {
    const first = results[index * 2]; const second = results[index * 2 + 1];
    if (first?.[idKey] !== expectedEntry[idKey] || second?.[idKey] !== expectedEntry[idKey] || first?.attempt_ordinal !== 1 || second?.attempt_ordinal !== 2 || fields.some(field => first?.[field] !== second?.[field])) environment('Candidate attempt order or determinism differs.');
  }
}

function sourceBuildDigestInput(sourceBuild) {
  return { source_commit: sourceBuild.source_commit, node_full_version: sourceBuild.node_full_version, node_executable_sha256: sourceBuild.node_executable_sha256, npm_version: sourceBuild.npm_version, lockfile_sha256: sourceBuild.lockfile_sha256, build_command: sourceBuild.build_command, web_dist_tree_sha256: sourceBuild.web_dist_tree_sha256, runtime_jar_sha256: sourceBuild.runtime_jar_sha256 };
}

async function collectCanonicalAssets(root, assets, expected, idKey, kind, outputPath) {
  if (!Array.isArray(assets) || assets.length !== expected.length || new Set(assets.map(value => value?.[idKey])).size !== expected.length) environment('Canonical asset set is incomplete.');
  const actual = new Map(assets.map(value => [value?.[idKey], value]));
  const refs = [];
  for (const source of expected) {
    const asset = actual.get(source[idKey]);
    if (!asset || asset.path !== `captures/attempt-1/${source[idKey]}.png`) environment('Canonical asset path differs from Candidate layout.');
    const path = resolveInside(root, asset.path);
    const details = await assertOrdinaryFile(path, 'Canonical PNG');
    refs.push(Object.freeze(idKey === 'capture_id'
      ? { capture_id: source.capture_id, ref: { kind, path: outputPath(source), byte_length: details.size, sha256: sha256(await readFile(path)) } }
      : { baseline_id: source.baseline_id, ref: { kind, path: outputPath(source), byte_length: details.size, sha256: sha256(await readFile(path)) } }));
  }
  return Object.freeze(refs);
}

async function copyCandidateFonts(root, fonts) {
  if (!Array.isArray(fonts) || fonts.length !== 3) environment('Font input set is incomplete.');
  const refs = [];
  for (const font of fonts) {
    const path = resolveInside(root, `environment/fonts/${font.logical_role}/${font.postscript_name}.font`);
    await mkdir(dirname(path), { recursive: true });
    await assertFreshPath(path, 'Candidate font output');
    await copyFile(font.source_path, path);
    const details = await assertOrdinaryFile(path, 'Candidate font output');
    const sha = sha256(await readFile(path));
    if (details.size !== font.source_ref.byte_length || sha !== font.source_ref.sha256) environment('Candidate font copy differs from controlled input.');
    refs.push({ logical_role: font.logical_role, postscript_name: font.postscript_name, font_version: font.font_version, path: relative(root, path), byte_length: details.size, sha256: sha });
  }
  return Object.freeze(refs.sort((left, right) => compareFont(left, right)).map(Object.freeze));
}

async function logicalRawRef(root, path, kind, logicalPath = relative(root, path)) {
  const details = await assertOrdinaryFile(path, kind);
  return Object.freeze({ kind, path: logicalPath, byte_length: details.size, sha256: sha256(await readFile(path)) });
}

async function atomicWriteFresh(path, content) {
  await assertFreshPath(path, 'Candidate output');
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await assertFreshPath(temporary, 'Candidate temporary output');
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(content); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
    await fsyncDirectory(dirname(path));
  } catch (error) {
    throw new GoldenAuthorError('GOLDEN_AUTHOR_INTERNAL_ERROR', 4, error.message);
  }
}

async function fsyncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function executableRef(path) {
  const physical = await realpath(path).catch(() => input('Browser executable is unavailable.'));
  if (physical !== path) input('Browser executable must use its realpath.');
  const ref = await rawRef(physical, 'BROWSER_EXECUTABLE');
  return Object.freeze({ realpath: physical, byte_length: ref.byte_length, sha256: ref.sha256 });
}

async function loadContracts() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const [fontInput, lineageInput, adapterRequest, plan, authoringReport] = await Promise.all([FONT_INPUT_SCHEMA, LINEAGE_INPUT_SCHEMA, ADAPTER_REQUEST_SCHEMA, PLAN_SCHEMA, AUTHORING_REPORT_SCHEMA].map(async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))));
  return Object.freeze({ fontInput: ajv.compile(fontInput), lineageInput: ajv.compile(lineageInput), adapterRequest: ajv.compile(adapterRequest), plan: ajv.compile(plan), authoringReport: ajv.compile(authoringReport) });
}

async function readJson(path, label) {
  await assertOrdinaryFile(path, label);
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { input(`${label} is not valid JSON.`); }
}

async function rawRef(path, kind) {
  const details = await assertOrdinaryFile(path, kind);
  return Object.freeze({ kind, path, byte_length: details.size, sha256: sha256(await readFile(path)) });
}

async function rawFileIdentity(path) {
  const details = await assertOrdinaryFile(path, 'Runtime JAR');
  return Object.freeze({ byte_length: details.size, sha256: sha256(await readFile(path)) });
}

async function assertOrdinaryFile(path, label) {
  try {
    const before = await lstat(path);
    const physical = await realpath(path);
    const after = await lstat(physical);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || physical !== path || !after.isFile() || after.isSymbolicLink() || after.nlink !== 1) throw new Error();
    return await stat(path);
  } catch { input(`${label} must be an ordinary regular file.`); }
}

async function assertOrdinaryDirectory(path, label) {
  try {
    const before = await lstat(path);
    const physical = await realpath(path);
    const after = await lstat(physical);
    if (!before.isDirectory() || before.isSymbolicLink() || physical !== path || !after.isDirectory() || after.isSymbolicLink()) throw new Error();
  } catch { input(`${label} must be an ordinary directory.`); }
}

async function assertFreshPath(path, label) {
  try { await lstat(path); input(`${label} must be fresh.`); }
  catch (error) { if (error?.code !== 'ENOENT') input(`${label} is unreadable.`); }
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) input(`${label} path is invalid.`);
  return value;
}

function resolveInside(root, logicalPath) {
  if (typeof logicalPath !== 'string' || !logicalPath || logicalPath.startsWith('/') || logicalPath.includes('\\') || logicalPath.split('/').includes('..')) environment('Candidate output path is invalid.');
  const target = resolve(root, logicalPath);
  const relation = relative(root, target);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) environment('Candidate output path escapes its root.');
  return target;
}

function isInside(root, target) {
  const relation = relative(root, target);
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`));
}

function sameRaw(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function sameBytes(left, right) {
  return left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function compareFont(left, right) { for (const key of ['logical_role', 'postscript_name', 'path']) { if (left[key] < right[key]) return -1; if (left[key] > right[key]) return 1; } return 0; }
function without(value, key) { const { [key]: ignored, ...rest } = value; return rest; }
function input(message) { throw new GoldenAuthorError('GOLDEN_AUTHOR_INPUT_INVALID', 2, message); }
function environment(message) { throw new GoldenAuthorError('GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH', 3, message); }

async function cli() {
  const options = parseAuthorOptions(process.argv.slice(2));
  await preflightAuthorInvocation(options);
  throw new GoldenAuthorError('GOLDEN_AUTHOR_INTERNAL_ERROR', 4, 'Candidate capture transaction is not implemented.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => {
    process.stderr.write(`${error.code ?? 'GOLDEN_AUTHOR_INTERNAL_ERROR'}\n`);
    if (error.message) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}

void runCommonVisualMaterialization;
