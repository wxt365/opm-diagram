import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const manifestSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-release-candidate-manifest.schema.json'), 'utf8'));
const reportSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-release-candidate-report.schema.json'), 'utf8'));
const manifestValidator = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(manifestSchema);
const reportValidator = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(reportSchema);

test('Release Candidate Manifest Schema accepts a complete smoke-ready manifest', () => {
  assert.equal(manifestValidator(manifest()), true, JSON.stringify(manifestValidator.errors));
});

test('Release Candidate Manifest Schema rejects incomplete artifacts and a non-disabled production gate', () => {
  const missingArtifact = manifest();
  delete missingArtifact.artifacts.release_zip_ref;
  assert.equal(manifestValidator(missingArtifact), false);

  const activeGate = manifest();
  activeGate.production_gate.state = 'ENABLED';
  assert.equal(manifestValidator(activeGate), false);
});

test('Release Candidate Report Schema accepts the fixed two-lane READY evidence shape', () => {
  assert.equal(reportValidator(report()), true, JSON.stringify(reportValidator.errors));
});

test('Release Candidate Report Schema rejects legacy field names, invalid failure codes, and incomplete READY aggregation', () => {
  const legacy = report();
  legacy.report_status = legacy.release_status;
  delete legacy.release_status;
  assert.equal(reportValidator(legacy), false);

  const failureCode = report();
  failureCode.release_status = 'BLOCKED';
  failureCode.failures = [{ code: 'NOT_A_RELEASE_CODE', evidence_refs: [ref('EVIDENCE')], message_key: 'NOT_A_RELEASE_CODE' }];
  assert.equal(reportValidator(failureCode), false);

  const incomplete = report();
  incomplete.aggregation.pass_matched_count = 11;
  assert.equal(reportValidator(incomplete), false);
});

function manifest() {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.release.aaaaaaaaaaaa.bbbbbbbbbbbb.darwin.arm64', generated_at: stamp(), generator: generator(),
    manifest_status: 'READY_FOR_RELEASE_SMOKE', release_scope: 'COMPLETE', handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), release_evidence: evidence(), enablement_candidate_ref: ref('ENABLEMENT_CANDIDATE'),
    source_build: sourceBuild(), dependency_locks: dependencyLocks(), artifacts: { status: 'ASSEMBLED', web_dist: { file_count: 1, tree_sha256: digest('web'), file_manifest_ref: ref('WEB_DIST_FILES') }, local_runtime_jar_ref: ref('LOCAL_RUNTIME_JAR'), profile_assets_tree_ref: ref('PROFILE_ASSETS_TREE'), bundle_content_ref: ref('BUNDLE_CONTENT'), release_zip_ref: ref('RELEASE_ZIP') },
    target_environment: targetEnvironment(), smoke_catalog: smokeCatalog(), production_gate: gate(), blockers: []
  };
}

function report() {
  const open = { project_id: 'project.001', model_id: 'model.001', context_id: 'context.001', head_revision_id: 'revision.001', head_sequence: 2, projection_sha256: digest('projection'), opl_sha256: digest('opl'), trace_sha256: digest('trace'), canvas_nonblank: true, console_error_count: 0, page_error_count: 0, external_request_count: 0 };
  const lane = (lane_id, attempt_ordinal) => ({ lane_id, status: 'PASS_MATCHED', install_root_was_empty: true, storage_root_was_empty: true, browser_profile_was_empty: true, process_identity_refs: [ref('PROCESS')], evidence_refs: [ref('EVIDENCE')], case_results: smokeIds().map((case_id, index) => ({ case_id, status: 'PASS_MATCHED', attempt_ordinal, started_at: stamp(), finished_at: '2026-08-02T00:00:01.000Z', duration_us: 1000, observations: index === 3 || index === 4 ? open : { result: 'PASS' }, evidence_refs: [ref('EVIDENCE')], failure_codes: [] })) });
  return {
    schema_id: 'OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.release-report.aaaaaaaaaaaa', generated_at: stamp(), generator: generator(), release_status: 'READY',
    release_manifest_ref: ref('RELEASE_CANDIDATE_MANIFEST'), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), release_evidence: evidence(), enablement_candidate_ref: ref('ENABLEMENT_CANDIDATE'), source_build: sourceBuild(),
    artifact_observations: { release_zip_ref: ref('RELEASE_ZIP'), installed_payload_ref: ref('INSTALLED_PAYLOAD'), jar_web_dist_ref: ref('JAR_WEB_DIST'), profile_assets_ref: ref('PROFILE_ASSETS') },
    environment: { target_os: 'darwin', os_build: '24A', target_arch: 'arm64', java_vendor: 'OpenJDK', java_version: '21.0.7', java_executable_sha256: digest('java'), chromium_version: '143.0.7499.4', cpu: 'test-cpu', logical_cpu_count: 1, ram_bytes: 1, ssd: true, locale: 'zh-CN', timezone: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, device_scale_factor: 1, loopback_ports: [41001, 41002], network_mode: 'LOOPBACK_ONLY', hmr_enabled: false, devtools_enabled: false }, environment_fingerprint: digest('environment'),
    lane_results: [lane('LANE-01', 1), lane('LANE-02', 2)], aggregation: { lane_count: 2, case_count: 6, expected_attempt_count: 12, observed_attempt_count: 12, pass_matched_count: 12, failed_count: 0, skipped_count: 0, retry_count: 0, external_request_count: 0, production_gate_mutation_count: 0 }, production_gate_observation: { before: gate(), during: gate(), after: gate() }, failures: [], residual_risks: [], conformance_boundary: { product_release_evidence: 'PRODUCT_RELEASE_EVIDENCE_ONLY', iso_19450_2024: 'ISO_19450_2024_CONFORMANCE_NOT_ESTABLISHED' }
  };
}

function sourceBuild() { return { git_commit: 'a'.repeat(40), git_tree: 'b'.repeat(40), dirty_before_build: false, build_commands: ['npm run build'], build_exit_codes: [0], build_log_refs: [ref('BUILD_LOG')], toolchain: { java_version: '21.0.7', node_version: '22.0.0', maven_version: '3.9.0', os: 'darwin' }, dependency_lock_refs: [ref('PACKAGE_LOCK'), ref('ROOT_PACKAGE_JSON'), ref('WEB_PACKAGE_JSON'), ref('LOCAL_RUNTIME_POM'), ref('MAVEN_WRAPPER_PROPERTIES')], source_input_refs: [ref('PACKAGE_LOCK'), ref('ROOT_PACKAGE_JSON'), ref('WEB_PACKAGE_JSON'), ref('LOCAL_RUNTIME_POM')] }; }
function dependencyLocks() { return { package_lock_ref: ref('PACKAGE_LOCK'), root_package_json_ref: ref('ROOT_PACKAGE_JSON'), web_package_json_ref: ref('WEB_PACKAGE_JSON'), local_runtime_pom_ref: ref('LOCAL_RUNTIME_POM'), maven_wrapper_properties_ref: ref('MAVEN_WRAPPER_PROPERTIES') }; }
function targetEnvironment() { return { target_os: 'darwin', target_arch: 'arm64', java_major: 21, loopback_only: true, single_origin: true, no_external_network: true, browser_engine: 'chromium', browser_patch: '143.0.7499.4', viewport: { width: 1440, height: 900 }, device_scale_factor: 1 }; }
function smokeCatalog() { return smokeIds().map(case_id => ({ case_id, required_attempt_count: 2, threshold_us: 30_000_000 })); }
function smokeIds() { return ['SMK-CANVAS-001.CLEAN_INSTALL', 'SMK-CANVAS-002.START', 'SMK-CANVAS-003.HEALTH', 'SMK-CANVAS-004.OPEN', 'SMK-CANVAS-005.REOPEN', 'SMK-CANVAS-006.EXIT']; }
function evidence() { return Object.fromEntries(['visual_manifest_ref', 'visual_report_ref', 'e2e_manifest_ref', 'e2e_report_ref', 'performance_manifest_ref', 'performance_report_ref', 'recovery_manifest_ref', 'recovery_report_ref'].map(key => [key, ref('EVIDENCE')])); }
function generator() { return { runner_version: '0.1.0', source_commit: 'c'.repeat(40), node_version: '22.0.0', os: 'darwin', command: 'release:canvas06:smoke', runner_source_sha256: digest('runner') }; }
function gate() { return { state: 'DISABLED', enabled_capability_ids: [], candidate_loader_status: 'NOT_ACTIVE' }; }
function ref(kind) { return { kind, path: `release/${kind.toLowerCase()}.json`, byte_length: 1, sha256: digest(kind) }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function stamp() { return '2026-08-02T00:00:00.000Z'; }
