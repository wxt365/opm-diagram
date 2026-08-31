import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

const root = resolve('.');
const schemas = await Promise.all([
  'opm-dev-canvas-06-visual-manifest.schema.json',
  'opm-dev-canvas-06-visual-manifest-v02.schema.json',
  'opm-dev-canvas-06-visual-report.schema.json',
  'opm-dev-canvas-06-e2e-manifest.schema.json',
  'opm-dev-canvas-06-e2e-manifest-v02.schema.json',
  'opm-dev-canvas-06-e2e-common-setup-plan.schema.json',
  'opm-dev-canvas-06-e2e-report.schema.json',
  'opm-dev-canvas-06-e2e-attempt-artifact.schema.json',
  'opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json',
  'opm-dev-canvas-06-e2e-report-v02.schema.json',
  'opm-dev-canvas-06-e2e-runner-source-set.schema.json',
  'opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json',
  'opm-dev-canvas-06-token-digest-preimage.schema.json',
  'opm-dev-canvas-06-token-digest-parity-vectors.schema.json'
].map(schema));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
schemas.forEach(item => ajv.addSchema(item));
const [validateVisualManifest, validateVisualManifestV02, validateVisualReport, validateE2eManifest, validateE2eManifestV02, validateCommonSetupPlan, validateE2eReportV01, validateE2eArtifact, validateE2eArtifactV02, validateE2eReportV02, validateE2eRunnerSourceSet, validateControlledInvocationContext, validateTokenPreimage, validateTokenParityCatalog] = schemas.map(item => ajv.getSchema(item.$id));

test('Visual Manifest accepts the frozen 378/756/1242/2484 matrix', () => {
  assert.equal(validateVisualManifest(visualManifest()), true, JSON.stringify(validateVisualManifest.errors));
});

test('Visual Manifest requires the Golden Environment reference', () => {
  const manifest = visualManifest();
  delete manifest.golden_environment_ref;
  assert.equal(validateVisualManifest(manifest), false);
});

test('Visual Manifest 0.2 accepts the eight frozen provenance fields and rejects 0.1 or incomplete production inputs', () => {
  assert.equal(validateVisualManifestV02(visualManifestV02()), true, JSON.stringify(validateVisualManifestV02.errors));
  assert.equal(validateVisualManifestV02(visualManifest()), false);
  for (const field of ['golden_authoring_report_ref', 'golden_approval_record_ref', 'golden_set_version', 'golden_set_sha256', 'capture_plan_ref', 'capture_set_sha256', 'fixture_materialization_set_sha256', 'fixture_database_set_sha256']) {
    const incomplete = visualManifestV02();
    delete incomplete[field];
    assert.equal(validateVisualManifestV02(incomplete), false, field);
  }
});

test('E2E Manifest accepts the frozen 194/388/178/130/48/16 matrix', () => {
  assert.equal(validateE2eManifest(e2eManifest()), true, JSON.stringify(validateE2eManifest.errors));
});

test('E2E Manifest rejects the Visual-only Golden Environment field', () => {
  const manifest = e2eManifest();
  manifest.golden_environment_ref = ref('GOLDEN_ENVIRONMENT', 'golden/golden-environment.json');
  assert.equal(validateE2eManifest(manifest), false);
});

test('Active E2E Manifest 0.2 requires the exact five Profile asset kinds', () => {
  const active = e2eManifestV02();
  assert.equal(validateE2eManifestV02(active), true, JSON.stringify(validateE2eManifestV02.errors));
  assert.equal(validateE2eManifest(active), false);

  const missing = e2eManifestV02(); missing.profile_asset_refs.pop();
  assert.equal(validateE2eManifestV02(missing), false);
  const duplicate = e2eManifestV02(); duplicate.profile_asset_refs[4].kind = 'GRAMMAR_ASSET';
  assert.equal(validateE2eManifestV02(duplicate), false);
  const generic = e2eManifestV02(); generic.profile_asset_refs[1].kind = 'PROFILE_ASSET';
  assert.equal(validateE2eManifestV02(generic), false);
});

test('Active E2E Manifest 0.2 closes all four exact driver sources', () => {
  const active = e2eManifestV02();
  assert.equal(validateE2eManifestV02(active), true, JSON.stringify(validateE2eManifestV02.errors));
  active.driver_catalog.pop();
  assert.equal(validateE2eManifestV02(active), false);
});

test('Active E2E Manifest 0.2 requires the exact Common Setup Plan ref', () => {
  const active = e2eManifestV02();
  assert.equal(validateE2eManifestV02(active), true, JSON.stringify(validateE2eManifestV02.errors));
  delete active.common_setup_plan_ref;
  assert.equal(validateE2eManifestV02(active), false);
});

test('Profile package digest closes four dependencies and differs from profile.json raw SHA', async () => {
  const profileRoot = resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
  const profileBytes = await readFile(resolve(profileRoot, 'profile.json'));
  const profile = JSON.parse(profileBytes.toString('utf8'));
  const entries = profile.manifest.entries.filter(entry => entry.required)
    .sort((left, right) => Buffer.compare(Buffer.from(left.logical_path, 'utf8'), Buffer.from(right.logical_path, 'utf8')));
  assert.equal(entries.length, 4);
  const rows = [];
  for (const entry of entries) {
    const bytes = await readFile(resolve(profileRoot, entry.logical_path));
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(bytes.length, entry.byte_length, entry.logical_path);
    assert.equal(sha, entry.digest.digest, entry.logical_path);
    rows.push(`${entry.logical_path}\n${entry.byte_length}\n${sha}\n`);
  }
  const packageDigest = createHash('sha256').update(rows.join(''), 'utf8').digest('hex');
  const profileRawSha = createHash('sha256').update(profileBytes).digest('hex');
  assert.equal(packageDigest, profile.manifest.package_digest.digest);
  assert.notEqual(profileRawSha, packageDigest);
});

test('Visual Report accepts READY only with all fixed outcomes and no failures', () => {
  assert.equal(validateVisualReport(visualReport('READY_FOR_ENABLEMENT_EVALUATION')), true, JSON.stringify(validateVisualReport.errors));
  const invalid = visualReport('READY_FOR_ENABLEMENT_EVALUATION');
  invalid.failures.push(visualFailure());
  assert.equal(validateVisualReport(invalid), false);
});

test('Historical E2E Report 0.1 remains readable and preserves fixed count boundaries', () => {
  const blocked = e2eReport('BLOCKED');
  assert.equal(validateE2eReportV01(blocked), true, JSON.stringify(validateE2eReportV01.errors));
  blocked.failures = [];
  assert.equal(validateE2eReportV01(blocked), false);
  const wrongCount = e2eReport('READY_FOR_ENABLEMENT_EVALUATION');
  wrongCount.summary.attempt_count = 387;
  assert.equal(validateE2eReportV01(wrongCount), false);
});

test('Active E2E Report 0.2 requires Java executable and runner source identities', () => {
  const sourceSet = e2eRunnerSourceSet();
  const active = e2eReportV02('READY_FOR_ENABLEMENT_EVALUATION', sourceSet);
  assert.equal(validateE2eReportV02(active), true, JSON.stringify(validateE2eReportV02.errors));
  assertE2eV02IdentityJoin(active, sourceSet);
  assert.equal(validateE2eReportV02(e2eReport('READY_FOR_ENABLEMENT_EVALUATION')), false);
  assert.equal(validateE2eReportV01(active), false);
});

test('Active E2E Report 0.2 rejects malformed refs and semantic identity drift', () => {
  const sourceSet = e2eRunnerSourceSet();
  const wrongKind = e2eReportV02('READY_FOR_ENABLEMENT_EVALUATION', sourceSet);
  wrongKind.runner_identity.java_executable.mirror_ref.kind = 'LOCAL_RUNTIME_JAR';
  assert.equal(validateE2eReportV02(wrongKind), false);

  const wrongSourceDigest = e2eReportV02('READY_FOR_ENABLEMENT_EVALUATION', sourceSet);
  wrongSourceDigest.runner_identity.runner_source_sha256 = 'f'.repeat(64);
  assert.equal(validateE2eReportV02(wrongSourceDigest), true, JSON.stringify(validateE2eReportV02.errors));
  assert.throws(() => assertE2eV02IdentityJoin(wrongSourceDigest, sourceSet));

  const wrongJavaDirectory = e2eReportV02('READY_FOR_ENABLEMENT_EVALUATION', sourceSet);
  wrongJavaDirectory.runner_identity.java_executable.mirror_ref.path = `inputs/runner/toolchain/java/${'f'.repeat(64)}/java`;
  assert.equal(validateE2eReportV02(wrongJavaDirectory), true, JSON.stringify(validateE2eReportV02.errors));
  assert.throws(() => assertE2eV02IdentityJoin(wrongJavaDirectory, sourceSet));
});

test('E2E Runner Source Set accepts exactly the frozen ordered 24-file allowlist', () => {
  const sourceSet = e2eRunnerSourceSet();
  assert.equal(validateE2eRunnerSourceSet(sourceSet), true, JSON.stringify(validateE2eRunnerSourceSet.errors));
  assertRunnerSourceSetDigest(sourceSet);

  const missing = e2eRunnerSourceSet(); missing.entries.pop();
  assert.equal(validateE2eRunnerSourceSet(missing), false);
  const reordered = e2eRunnerSourceSet(); [reordered.entries[0], reordered.entries[1]] = [reordered.entries[1], reordered.entries[0]];
  assert.equal(validateE2eRunnerSourceSet(reordered), false);
  const extra = e2eRunnerSourceSet(); extra.entries.push({ path: 'scripts/extra.mjs', byte_length: 1, sha256: digest() });
  assert.equal(validateE2eRunnerSourceSet(extra), false);
  const wrongExclusion = e2eRunnerSourceSet(); wrongExclusion.excluded_classes[0] = 'SOME_PATHS_EXCLUDED';
  assert.equal(validateE2eRunnerSourceSet(wrongExclusion), false);
  const digestDrift = e2eRunnerSourceSet(); digestDrift.source_set_sha256 = 'f'.repeat(64);
  assert.equal(validateE2eRunnerSourceSet(digestDrift), true, JSON.stringify(validateE2eRunnerSourceSet.errors));
  assert.throws(() => assertRunnerSourceSetDigest(digestDrift));
});

test('Controlled Invocation Context accepts only the frozen 194/388 schedule shape', () => {
  const context = controlledInvocationContext();
  assert.equal(validateControlledInvocationContext(context), true, JSON.stringify(validateControlledInvocationContext.errors));

  const missing = controlledInvocationContext();
  missing.execution_schedule.pop();
  assert.equal(validateControlledInvocationContext(missing), false);

  const extra = controlledInvocationContext();
  extra.execution_schedule[0].unexpected = true;
  assert.equal(validateControlledInvocationContext(extra), false);

  const wrongTrust = controlledInvocationContext();
  wrongTrust.input_trust.mode = 'CONTROLLED_TEST';
  assert.equal(validateControlledInvocationContext(wrongTrust), false);
});

test('E2E Attempt Artifact Schema accepts all eleven frozen root identities', () => {
  for (const artifact of e2eAttemptArtifacts()) {
    assert.equal(validateE2eArtifact(artifact), true, `${artifact.schema_id}: ${JSON.stringify(validateE2eArtifact.errors)}`);
  }
});

test('E2E Attempt Artifact Schema recursively rejects extra fields and wrong identities', () => {
  for (const artifact of e2eAttemptArtifacts()) {
    artifact.unexpected = true;
    assert.equal(validateE2eArtifact(artifact), false, artifact.schema_id);
  }
  const wrongIdentity = faultPlan();
  wrongIdentity.schema_id = 'OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001';
  assert.equal(validateE2eArtifact(wrongIdentity), false);
});

test('E2E Fault Plan Schema enforces the three controlled case mappings and NONE for all others', () => {
  for (const [caseId, faultKind, target] of [
    ['E2E-CANVAS-007.ASSET_MISSING', 'ASSET_MISSING', 'SYMBOL_CATALOG_ASSET'],
    ['E2E-CANVAS-007.PERSISTENCE_FAILED', 'PERSISTENCE_FAILED', 'SQLITE_BEFORE_REVISION_INSERT'],
    ['E2E-CANVAS-007.READONLY', 'READONLY', 'PROJECT_STORAGE_READ_ONLY']
  ]) {
    assert.equal(validateE2eArtifact(faultPlan(caseId, faultKind, target, 1)), true, JSON.stringify(validateE2eArtifact.errors));
  }
  const invalid = faultPlan();
  invalid.fault_kind = 'READONLY';
  invalid.target = 'PROJECT_STORAGE_READ_ONLY';
  invalid.trigger_count = 1;
  assert.equal(validateE2eArtifact(invalid), false);
});

test('E2E Attempt Artifact Schema rejects incomplete conditional and ordered evidence', () => {
  const familyObservation = attemptObservation();
  familyObservation.capability_id = 'CAP-ISO-PROC-001';
  assert.equal(validateE2eArtifact(familyObservation), false);

  const wrongCycles = runtimeProcess();
  wrongCycles.cycles.reverse();
  assert.equal(validateE2eArtifact(wrongCycles), false);

  const wrongBrowser = browserEnvironment();
  wrongBrowser.chromium_version = '143.0.7499.5';
  assert.equal(validateE2eArtifact(wrongBrowser), false);

  const incompleteTransaction = transactionObservation();
  delete incompleteTransaction.before.receipt_count;
  assert.equal(validateE2eArtifact(incompleteTransaction), false);
});

test('E2E Artifact Index requires exactly one of each ten core artifact kinds', () => {
  const missing = artifactIndex();
  missing.refs.pop();
  assert.equal(validateE2eArtifact(missing), false);

  const duplicate = artifactIndex();
  duplicate.refs[9] = { ...duplicate.refs[0], path: 'attempts/case/1/duplicate-fault-plan.json' };
  assert.equal(validateE2eArtifact(duplicate), false);

  const optionalCore = artifactIndex();
  optionalCore.refs[0].required = false;
  assert.equal(validateE2eArtifact(optionalCore), false);
});

test('Active E2E Attempt Artifact 0.2 closes Profile refs and the 20-entry index', () => {
  for (const artifact of e2eAttemptArtifactsV02()) {
    assert.equal(validateE2eArtifactV02(artifact), true, `${artifact.schema_id}: ${JSON.stringify(validateE2eArtifactV02.errors)}`);
    assert.equal(validateE2eArtifact(artifact), false, artifact.schema_id);
  }

  const missingAsset = artifactIndexV02(); missingAsset.refs.pop();
  assert.equal(validateE2eArtifactV02(missingAsset), false);
  const duplicateAssetKind = artifactIndexV02(); duplicateAssetKind.refs[15].asset_kind = 'GRAMMAR_ASSET';
  assert.equal(validateE2eArtifactV02(duplicateAssetKind), false);
  const genericRawRef = fixtureMaterializationV02(); genericRawRef.profile_asset_refs[1].kind = 'PROFILE_ASSET';
  assert.equal(validateE2eArtifactV02(genericRawRef), false);
  const missingWorking = fixtureMaterializationV02(); delete missingWorking.storage.working_project_db_path;
  assert.equal(validateE2eArtifactV02(missingWorking), false);
  const legacyMutableRef = fixtureMaterializationV02(); legacyMutableRef.storage.project_db_ref.path = 'storage/projects/project.e2e.001/project.db';
  assert.equal(validateE2eArtifactV02(legacyMutableRef), false);
});

test('Active Attempt Artifact 0.2 accepts only the frozen Family and Common case ID forms', () => {
  const familyCaseId = 'G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS';
  const familyPlan = faultPlan(familyCaseId);
  familyPlan.schema_version = '0.2';
  assert.equal(validateE2eArtifactV02(familyPlan), true, JSON.stringify(validateE2eArtifactV02.errors));
  const familyMaterialization = fixtureMaterializationV02();
  familyMaterialization.case_id = familyCaseId;
  familyMaterialization.fixture_kind = 'FAMILY';
  familyMaterialization.fixture_ref = archiveRef('family/base.json');
  familyMaterialization.input_ref = archiveRef('family/input.json');
  assert.equal(validateE2eArtifactV02(familyMaterialization), true, JSON.stringify(validateE2eArtifactV02.errors));

  const familyFileRef = structuredClone(familyMaterialization);
  familyFileRef.fixture_ref = ref('FIXTURE', 'family/base.json');
  assert.equal(validateE2eArtifactV02(familyFileRef), false);
  const commonArchiveRef = fixtureMaterializationV02();
  commonArchiveRef.input_ref = archiveRef('common/input.json');
  assert.equal(validateE2eArtifactV02(commonArchiveRef), false);

  for (const invalidCaseId of [
    'G-OPL-STATE-001.CASE.PASS',
    'G-OPL-PROC-01.CASE.PASS',
    'G-OPL-PROC-001.CASE',
    'G-OPL-PROC-001.case.PASS',
    'G-OPL-PROC-001.CASE.PASS.EXTRA'
  ]) {
    const invalid = faultPlan(invalidCaseId);
    invalid.schema_version = '0.2';
    assert.equal(validateE2eArtifactV02(invalid), false, invalidCaseId);
  }
});

test('Token digest parity catalog matches the frozen JCS bytes and payload SHA', async () => {
  const catalog = JSON.parse(await readFile(resolve(root, 'tests/e2e/release/dev-canvas-06/fixtures/token-digest-v01-parity-vectors.json'), 'utf8'));
  assert.equal(validateTokenParityCatalog(catalog), true, JSON.stringify(validateTokenParityCatalog.errors));
  for (const vector of catalog.positive_vectors) {
    assert.equal(validateTokenPreimage(vector.expected_preimage), true, JSON.stringify(validateTokenPreimage.errors));
    const canonical = canonicalizeJcs(vector.expected_preimage);
    assert.equal(Buffer.from(canonical, 'utf8').toString('hex'), vector.expected_canonical_utf8_hex, vector.vector_id);
    assert.equal(createHash('sha256').update(canonical, 'utf8').digest('hex'), vector.expected_token_sha256, vector.vector_id);
  }
  const payload = structuredClone(catalog); delete payload.catalog_payload_sha256;
  assert.equal(sha256Jcs(payload), catalog.catalog_payload_sha256);
});

function e2eAttemptArtifacts() {
  return [faultPlan(), fixtureMaterialization(), attemptObservation(), runtimeProcess(), browserEnvironment(), networkObservation(), consoleErrors(), transactionObservation(), reopenObservation(), apiExchangeIndex(), artifactIndex()];
}

function e2eAttemptArtifactsV02() {
  return [faultPlan(), fixtureMaterializationV02(), attemptObservationV02(), runtimeProcess(), browserEnvironment(), networkObservation(), consoleErrors(), transactionObservation(), reopenObservation(), apiExchangeIndex(true), artifactIndexV02()]
    .map(artifact => ({ ...artifact, schema_version: '0.2' }));
}

function artifactBase(schemaId, caseId = artifactCaseId()) {
  return { schema_id: schemaId, schema_version: '0.1', case_id: caseId, attempt_ordinal: 1 };
}

function faultPlan(caseId = artifactCaseId(), faultKind = 'NONE', target = 'NONE', triggerCount = 0) {
  return { ...artifactBase('OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001', caseId), fault_kind: faultKind, target, trigger_count: triggerCount, nonce: digest(), plan_sha256: digest(), artifact_payload_sha256: digest() };
}

function fixtureMaterialization() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001'), fixture_kind: 'COMMON',
    fixture_ref: ref('FIXTURE', 'attempts/case/1/fixture.base.json'), input_ref: ref('INPUT', 'attempts/case/1/fixture.input.json'), active_binding: binding(),
    identity: { project_id: 'project.e2e.001', model_id: 'model.e2e.001', context_id: 'context.e2e.001', base_revision: 'revision.e2e.001', head_revision: 'revision.e2e.001' },
    storage: { storage_root: 'storage', project_db_ref: ref('PROJECT_DB', 'attempts/case/1/storage/project.db'), storage_schema_version: '1.0', sqlite_quick_check: 'ok', foreign_key_check_count: 0, sidecar_absent: true },
    materializer_identity: { main_class: 'org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli', runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar'), source_sha256: digest() },
    state_digests: { revision_document_sha256: digest(), projection_sha256: digest(), opl_sha256: digest(), token_sha256: digest(), trace_sha256: digest() },
    materialization_payload_sha256: digest(), artifact_payload_sha256: digest()
  };
}

function attemptObservation() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001'), suite_id: 'E2E-CANVAS-001', expectation: 'PASS',
    fixture_sha256: digest(), input_sha256: digest(), project_id: 'project.e2e.001', model_id: 'model.e2e.001', context_id: 'context.e2e.001',
    base_revision: 'revision.e2e.001', head_revision: 'revision.e2e.002', committed_revision: 'revision.e2e.002', command_id: 'command.e2e.001', option_id: 'option.e2e.001', impact_token_id: null,
    expected_status: 'PASS', observed_status: 'PASS_MATCHED', status: 'PASS_MATCHED', top_error_code: null, detail_error_code: null,
    projection_before_sha256: digest(), projection_after_sha256: digest(), projection_reopen_sha256: digest(),
    opl_before_sha256: digest(), opl_after_sha256: digest(), opl_reopen_sha256: digest(),
    token_before_sha256: digest(), token_after_sha256: digest(), token_reopen_sha256: digest(),
    trace_before_sha256: digest(), trace_after_sha256: digest(), trace_reopen_sha256: digest(), transaction: transaction(),
    assertion_results: [{ assertion_id: 'ASSERT-001', status: 'PASS', evidence_refs: [ref('ASSERTION_EVIDENCE', 'attempts/case/1/api-exchanges/index.json')] }],
    semantic_comparison_digest: digest(), artifact_payload_sha256: digest()
  };
}

function attemptObservationV02() {
  const value = attemptObservation();
  value.revision_document_before_sha256 = digest();
  value.revision_document_after_sha256 = digest();
  value.revision_document_reopen_sha256 = digest();
  value.assertion_results = [{
    assertion_id: 'TRANSACTION_MATCHED', status: 'PASS',
    evidence_refs: [ref('TRANSACTION_OBSERVATION', 'attempts/case/1/transaction-observation.json')]
  }];
  return value;
}

function runtimeProcess() {
  return { ...artifactBase('OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001'), cycles: [processCycle('INITIAL', 1001), processCycle('REOPEN', 1002)], artifact_payload_sha256: digest() };
}

function processCycle(cycle, pid) {
  return {
    cycle, normalized_command: ['java', '-jar', 'inputs/build/local-runtime.jar'], java_ref: ref('JAVA', 'inputs/environment/java'), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar'),
    pid, parent_nonce: digest(), host: '127.0.0.1', port: cycle === 'INITIAL' ? 18080 : 18081,
    health_samples: [1, 2, 3].map(ordinal => ({ ordinal, status: 'UP', observed_at: now() })), started_at: now(), stopped_at: now(),
    termination: { kind: 'NORMAL', exit_code: 0, signal: null, owned_process_terminated: true },
    stdout_ref: ref('STDOUT_LOG', `attempts/case/1/stdout/${cycle.toLowerCase()}.log`), stderr_ref: ref('STDERR_LOG', `attempts/case/1/stderr/${cycle.toLowerCase()}.log`), owned_child_count_after_stop: 0
  };
}

function browserEnvironment() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-001'), node_version: '22.0.0', playwright_version: '1.57.0', chromium_version: '143.0.7499.4',
    browser_executable_ref: ref('CHROMIUM_EXECUTABLE', 'inputs/environment/chromium'),
    launch_args: ['--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--no-first-run', '--no-default-browser-check'],
    viewport: { viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 }, zoom_id: 'Z-100', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce',
    web_server_source_ref: ref('WEB_SERVER_SOURCE', 'inputs/runner/canvas06-e2e-production-web.mjs'), web_dist_ref: ref('WEB_DIST', 'inputs/build/web-dist/index.html'),
    web_origin: 'http://127.0.0.1:15173', runtime_origin: 'http://127.0.0.1:18080', environment_fingerprint: digest(), artifact_payload_sha256: digest()
  };
}

function networkObservation() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-NETWORK-OBSERVATION-001'),
    requests: [{ sequence: 1, method: 'GET', normalized_url: 'http://127.0.0.1:15173/api/v1/projects', resource_type: 'FETCH', status: 200, failure_code: null, request_body_ref: null, response_body_ref: ref('API_RESPONSE_BODY', 'attempts/case/1/api-exchanges/1-response.json'), operation_id: 'listProjects', revision: 'revision.e2e.002', allow_decision: 'ALLOWED' }],
    external_request_count: 0, websocket_count: 0, service_worker_count: 0, download_count: 0, popup_count: 0, artifact_payload_sha256: digest()
  };
}

function consoleErrors() {
  return { ...artifactBase('OPM-DEV-CANVAS-06-E2E-CONSOLE-ERRORS-001'), events: [], artifact_payload_sha256: digest() };
}

function transactionObservation() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-TRANSACTION-OBSERVATION-001'), before: countSnapshot(1), after: countSnapshot(2),
    expected_transaction: transaction(), observed_transaction: transaction(), matches: true, transaction_payload_sha256: digest(), artifact_payload_sha256: digest()
  };
}

function countSnapshot(count) {
  return { revision_document_count: count, revision_parent_count: count, text_artifact_count: count, text_trace_count: count, finding_count: 0, operation_count: count, receipt_count: count, draft_head_revision_id: `revision.e2e.00${count}`, head_sequence: count };
}

function reopenObservation() {
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-REOPEN-OBSERVATION-001'), runtime_process_ref: ref('RUNTIME_PROCESS', 'attempts/case/1/runtime-process.json'),
    initial_process_nonce: digest(), reopen_process_nonce: '1'.repeat(64), initial_browser_context_id: 'browser-context.initial', reopen_browser_context_id: 'browser-context.reopen', new_process: true, new_context: true,
    project_id: 'project.e2e.001', model_id: 'model.e2e.001', context_id: 'context.e2e.001', head_revision: 'revision.e2e.002',
    projection_before_sha256: digest(), projection_reopen_sha256: digest(), opl_before_sha256: digest(), opl_reopen_sha256: digest(), token_before_sha256: digest(), token_reopen_sha256: digest(), trace_before_sha256: digest(), trace_reopen_sha256: digest(),
    projection_matches: true, opl_matches: true, token_matches: true, trace_matches: true, reopen_matches: true, reopen_payload_sha256: digest(), artifact_payload_sha256: digest()
  };
}

function apiExchangeIndex(active = false) {
  const exchange = { sequence: 1, operation_id: 'listProjects', method: 'GET', normalized_url: 'http://127.0.0.1:15173/api/v1/projects', request_ref: null, response_ref: ref('API_RESPONSE_BODY', 'attempts/case/1/api-exchanges/1-response.json'), status: 200, revision: 'revision.e2e.002' };
  if (active) exchange.exchange_ref = ref('API_EXCHANGE', 'attempts/case/1/api-exchanges/exchange-000001.json');
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001'),
    exchanges: [exchange],
    exchange_set_sha256: digest(), artifact_payload_sha256: digest()
  };
}

function artifactIndex() {
  const kinds = ['FAULT_PLAN', 'FIXTURE_MATERIALIZATION', 'ATTEMPT_OBSERVATION', 'RUNTIME_PROCESS', 'BROWSER_ENVIRONMENT', 'NETWORK_OBSERVATION', 'CONSOLE_ERRORS', 'TRANSACTION_OBSERVATION', 'REOPEN_OBSERVATION', 'API_EXCHANGE_INDEX'];
  return {
    ...artifactBase('OPM-DEV-CANVAS-06-E2E-ARTIFACT-INDEX-001'),
    refs: kinds.map((kind, index) => ({ kind, path: `attempts/case/1/${String(index).padStart(2, '0')}-${kind.toLowerCase()}.json`, media_type: 'application/json', byte_length: 1, sha256: digest(), capture_phase: index === 0 ? 'MATERIALIZE' : index < 7 ? 'ACTION' : index < 9 ? 'REOPEN' : 'FINALIZE', required: true })),
    tree_sha256: digest(), artifact_payload_sha256: digest()
  };
}

function fixtureMaterializationV02() {
  const value = fixtureMaterialization();
  value.schema_version = '0.2';
  const projectId = value.identity.project_id;
  value.storage = {
    storage_root: 'storage',
    materialized_base_root: 'storage/materialized-base',
    project_db_ref: ref('PROJECT_DB', `storage/materialized-base/projects/${projectId}/project.db`),
    working_project_db_path: `storage/projects/${projectId}/project.db`,
    working_clone_byte_length: 1,
    working_clone_sha256: digest(),
    storage_schema_version: '1.0',
    sqlite_quick_check: 'ok',
    foreign_key_check_count: 0,
    sidecar_absent: true
  };
  value.profile_asset_tree_ref = ref('PROFILE_ASSET_TREE', 'profile/assets');
  value.profile_asset_refs = profileAssetRefs('profile/assets');
  value.profile_package_digest = value.active_binding.profile.sha256;
  return value;
}

function artifactIndexV02() {
  const value = artifactIndex();
  value.schema_version = '0.2';
  value.refs.push({ ...artifactEntry('PROFILE_ASSET_TREE', 'attempts/case/1/profile/assets'), capture_phase: 'MATERIALIZE' });
  for (const asset of profileAssetRefs('attempts/case/1/profile/assets')) {
    value.refs.push({ ...artifactEntry('PROFILE_ASSET', asset.path), asset_kind: asset.kind, capture_phase: 'MATERIALIZE' });
  }
  value.refs.push({ ...artifactEntry('STDOUT_LOG', 'attempts/case/1/stdout/initial.log'), media_type: 'text/plain', capture_phase: 'RUNTIME' });
  value.refs.push({ ...artifactEntry('STDERR_LOG', 'attempts/case/1/stderr/initial.log'), media_type: 'text/plain', capture_phase: 'RUNTIME' });
  value.refs.push({ ...artifactEntry('STDOUT_LOG', 'attempts/case/1/stdout/reopen.log'), media_type: 'text/plain', capture_phase: 'REOPEN' });
  value.refs.push({ ...artifactEntry('STDERR_LOG', 'attempts/case/1/stderr/reopen.log'), media_type: 'text/plain', capture_phase: 'REOPEN' });
  return value;
}

function artifactEntry(kind, path) {
  return { kind, path, media_type: 'application/json', byte_length: 1, sha256: digest(), capture_phase: 'FINALIZE', required: true };
}

function binding() {
  const asset = id => ({ id, version: '0.2.0', sha256: digest() });
  return { profile: asset('profile'), rule_set: asset('rules'), text_grammar: asset('grammar'), symbol_catalog: asset('symbols'), normalization_adapter: asset('normalization'), binding_digest: digest() };
}

function artifactCaseId() { return 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES'; }

function visualManifest() {
  const capabilityCases = Array.from({ length: 306 }, (_, index) => visualCase(index, 'CAPABILITY'));
  const commonCases = Array.from({ length: 72 }, (_, index) => visualCase(index + 306, 'COMMON'));
  return {
    schema_id: 'OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.visual.0123456789ab.abcdef012345', manifest_version: '0.1.0', generated_at: now(), generator_identity: identity(), intake_report_ref: ref('INTAKE_REPORT', 'intake.json'), handoff_ref: ref('HANDOFF', 'handoff.json'), upstream_source_build: upstreamBuild(), source_build: sourceBuild(), upstream_input_refs: upstreamInputs(), input_materialization: materialization(), common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'fixtures/catalog.json'), environment_policy: environmentPolicy(), golden_environment_ref: ref('GOLDEN_ENVIRONMENT', 'golden/golden-environment.json'), viewport_catalog: viewports(), zoom_catalog: zooms(), common_subjects: subjects(), blank_baselines: Array.from({ length: 9 }, (_, index) => ref('BLANK_PNG', `golden/blank/${index}.png`)), pixel_policy: policy('PIXEL'), geometry_policy: policy('GEOMETRY'), golden_policy: policy('GOLDEN'), cases: [...capabilityCases, ...commonCases], summary: { case_count: 378, capability_case_count: 306, common_case_count: 72, attempt_count: 756, capture_count: 1242, attempt_capture_count: 2484, pass_matched_count: 0, failed_count: 0, skipped_count: 0, retry_count: 0 }
  };
}

function visualManifestV02() {
  const manifest = visualManifest();
  manifest.schema_version = '0.2';
  manifest.manifest_version = '0.2.0';
  manifest.generator_identity.runner_version = '0.2.0';
  manifest.golden_authoring_report_ref = ref('AUTHORING_REPORT', 'golden/authoring-report.json');
  manifest.golden_approval_record_ref = ref('APPROVAL_RECORD', 'golden/approval-record.json');
  manifest.golden_set_version = '1.0.0';
  manifest.golden_set_sha256 = digest();
  manifest.capture_plan_ref = ref('CAPTURE_PLAN', 'golden/capture-plan.json');
  manifest.capture_set_sha256 = digest();
  manifest.fixture_materialization_set_sha256 = digest();
  manifest.fixture_database_set_sha256 = digest();
  return manifest;
}

function visualCase(index, kind) {
  const common = kind === 'COMMON';
  return { case_id: `VIS-${index}`, case_kind: kind, ...(common ? { subject_id: subjects()[index % 8] } : { capability_id: 'CAP-ISO-PROC-001' }), viewport_id: ['VP-1440X900', 'VP-1280X800', 'VP-390X844'][index % 3], zoom_id: ['Z-025', 'Z-100', 'Z-400'][index % 3], variant_captures: [{ visual_variant_key: `variant-${index}`, capture_id: `capture-${index}`, fixture_ref: archiveRef(`fixture-${index}.json`), expected_revision: `revision-${index}`, focus_target_id: `target-${index}`, focus_anchor: 'CENTER', expected_cells: 1, golden_ref: ref('PNG', `golden/capture-${index}.png`), critical_regions: ['FOCUS_BBOX'], expected_projection_sha256: digest() }] };
}

function e2eManifest() {
  const familyCases = Array.from({ length: 178 }, (_, index) => e2eCase(index, index < 130 ? 'PASS' : 'BLOCKED'));
  const commonCases = Array.from({ length: 16 }, (_, index) => ({ case_id: commonCaseIds()[index], suite_id: commonCaseIds()[index].slice(0, 14), expectation: 'PASS', viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref: ref('FIXTURE', `common/${index}.base.json`), input_ref: ref('INPUT', `common/${index}.input.json`), driver_id: 'DRIVER-COMMON', expected_transaction: transaction(), assertion_ids: ['ASSERT-001'] }));
  return {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.e2e.0123456789ab.abcdef012345', manifest_version: '0.1.0', generated_at: now(), generator_identity: identity(), intake_report_ref: ref('INTAKE_REPORT', 'intake.json'), handoff_ref: ref('HANDOFF', 'handoff.json'), upstream_source_build: upstreamBuild(), source_build: sourceBuild(), upstream_input_refs: upstreamInputs(), input_materialization: materialization(), common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'fixtures/catalog.json'), environment_policy: environmentPolicy(), fixture_refs: [archiveRef('family/base.json')], driver_catalog: ['DRIVER-PROCEDURAL', 'DRIVER-CONTROL', 'DRIVER-STRUCTURAL'].map(driver_id => ({ driver_id, source_ref: ref('DRIVER_SOURCE', `drivers/${driver_id}.mjs`) })), suite_catalog: Array.from({ length: 7 }, (_, index) => ({ suite_id: `E2E-CANVAS-00${index + 1}` })), coverage_summary: { family_case_count: 178, pass_expectation_count: 130, blocked_expectation_count: 48, common_case_count: 16 }, transaction_policy: policy('TRANSACTION'), cases: [...familyCases, ...commonCases], summary: { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: 0, blocked_matched_count: 0, failed_count: 0, skipped_count: 0, retry_count: 0 }
  };
}

function e2eManifestV02() {
  const manifest = e2eManifest();
  manifest.schema_version = '0.2';
  manifest.manifest_version = '0.2.0';
  manifest.generator_identity.runner_version = '0.2.0';
  manifest.driver_catalog = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'],
    ['DRIVER-CONTROL', 'control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs'],
    ['DRIVER-COMMON', 'common-driver.mjs']
  ].map(([driver_id, file]) => ({ driver_id, source_ref: ref('E2E_DRIVER_SOURCE', `inputs/drivers/${file}`) }));
  manifest.common_setup_plan_ref = ref('COMMON_SETUP_PLAN', 'inputs/common/dev-canvas-06-common-setup-plan.json');
  manifest.profile_asset_tree_ref = ref('PROFILE_ASSET_TREE', 'inputs/upstream/profile-assets');
  manifest.profile_asset_refs = profileAssetRefs('inputs/upstream/profile-assets');
  return manifest;
}

function profileAssetRefs(rootPath) {
  return [
    ref('GRAMMAR_ASSET', `${rootPath}/grammar/representative-opl-grammar.json`),
    ref('NORMALIZATION_DATA', `${rootPath}/normalization/representative-normalization.json`),
    ref('PROFILE_PACKAGE', `${rootPath}/profile.json`),
    ref('RULE_SET', `${rootPath}/rules/representative-rule-set.json`),
    ref('SYMBOL_ASSET', `${rootPath}/symbols/representative-symbol-catalog.json`)
  ];
}

function e2eCase(index, expectation) {
  const family = index % 3 === 0 ? 'PROC' : index % 3 === 1 ? 'CTRL' : 'STRUCT';
  const suite_id = family === 'PROC' ? 'E2E-CANVAS-002' : family === 'CTRL' ? 'E2E-CANVAS-003' : 'E2E-CANVAS-004';
  return { case_id: `${suite_id}.CAP-ISO-${family}-001.${String(index).padStart(12, '0')}`, suite_id, capability_id: `CAP-ISO-${family}-001`, coverage_key: `coverage-${index}`, expectation, viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref: archiveRef(`family/${index}.base.json`), input_ref: archiveRef(`family/${index}.input.json`), driver_id: family === 'PROC' ? 'DRIVER-PROCEDURAL' : family === 'CTRL' ? 'DRIVER-CONTROL' : 'DRIVER-STRUCTURAL', expected_transaction: transaction(), assertion_ids: ['ASSERT-001'] };
}

function visualReport(status) {
  const ready = status === 'READY_FOR_ENABLEMENT_EVALUATION';
  return reportBase('VISUAL', status, {
    case_count: 378, capability_case_count: 306, common_case_count: 72, attempt_count: 756, capture_count: 1242, attempt_capture_count: 2484, pass_matched_count: ready ? 378 : 0, failed_count: 0, skipped_count: 0, retry_count: 0
  }, Array.from({ length: 34 }, (_, index) => ({ capability_id: `CAP-ISO-PROC-${String(index + 1).padStart(3, '0')}`, family: 'PROCEDURAL', case_ids: Array.from({ length: 9 }, (_, inner) => `VIS-${index}-${inner}`), covered_visual_variant_keys: [`variant-${index}`], pass_matched_count: ready ? 9 : 0, failed_count: 0, status: ready ? 'PASS_MATCHED' : 'FAILED' })), Array.from({ length: 378 }, (_, index) => ({ case_id: `VIS-${index}`, case_kind: index < 306 ? 'CAPABILITY' : 'COMMON', ...(index < 306 ? { capability_id: 'CAP-ISO-PROC-001' } : { subject_id: 'STATE_ROLES' }), status: ready ? 'PASS_MATCHED' : 'FAILED', covered_visual_variant_keys: [`variant-${index}`], attempts: [visualAttempt(1, ready), visualAttempt(2, ready)], failure_codes: ready ? [] : ['VISUAL_CAPTURE_FAILED'] })), ready ? [] : [visualFailure()]);
}

function visualAttempt(ordinal, ready) { return { attempt_ordinal: ordinal, status: ready ? 'PASS_MATCHED' : 'FAILED', revision: 'revision-001', projection_digest: digest(), cell_geometry_hash: digest(), capture_results: [{ capture_id: 'capture-001', actual_ref: ref('PNG', 'actual.png'), probe_ref: ref('PNG', 'probe.png'), golden_ref: ref('PNG', 'golden.png'), blank_ref: ref('BLANK_PNG', 'blank.png'), pixel_statistics: { different_pixel_count: 0, different_pixel_ratio: 0, changed_pixel_count: 64 }, critical_region_statistics: { different_pixel_count: 0 }, geometry_statistics: { cell_count: 1, critical_overlap_count: 0, page_overflow_count: 0, text_clipped_count: 0 } }], assertion_results: [{ assertion_id: 'ASSERT-001', status: ready ? 'PASS' : 'FAILED' }] }; }

function e2eReport(status) {
  const ready = status === 'READY_FOR_ENABLEMENT_EVALUATION';
  const family = Array.from({ length: 178 }, (_, index) => ({ case_id: `E2E-FAMILY-${index}`, suite_id: 'E2E-CANVAS-002', capability_id: 'CAP-ISO-PROC-001', coverage_key: `coverage-${index}`, expectation: index < 130 ? 'PASS' : 'BLOCKED', status: ready ? (index < 130 ? 'PASS_MATCHED' : 'BLOCKED_MATCHED') : 'FAILED', attempts: [e2eAttempt(1, ready ? (index < 130 ? 'PASS_MATCHED' : 'BLOCKED_MATCHED') : 'FAILED'), e2eAttempt(2, ready ? (index < 130 ? 'PASS_MATCHED' : 'BLOCKED_MATCHED') : 'FAILED')], failure_codes: ready ? [] : ['E2E_EXPECTATION_MISMATCH'] }));
  const common = Array.from({ length: 16 }, (_, index) => ({ case_id: commonCaseIds()[index], suite_id: commonCaseIds()[index].slice(0, 14), expectation: 'PASS', status: ready ? 'PASS_MATCHED' : 'FAILED', attempts: [e2eAttempt(1, ready ? 'PASS_MATCHED' : 'FAILED'), e2eAttempt(2, ready ? 'PASS_MATCHED' : 'FAILED')], failure_codes: ready ? [] : ['E2E_EXPECTATION_MISMATCH'] }));
  return reportBase('E2E', status, { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: ready ? 146 : 0, blocked_matched_count: ready ? 48 : 0, failed_count: 0, skipped_count: 0, retry_count: 0 }, Array.from({ length: 34 }, (_, index) => ({ capability_id: `CAP-ISO-PROC-${String(index + 1).padStart(3, '0')}`, family: 'PROCEDURAL', covered_coverage_keys: [`coverage-${index}`], pass_matched_count: ready ? 1 : 0, blocked_matched_count: 0, failed_count: 0, status: ready ? 'PASS_MATCHED' : 'FAILED', case_refs: [`E2E-FAMILY-${index}`] })), [...family, ...common], ready ? [] : [e2eFailure()]);
}

function e2eReportV02(status, sourceSet = e2eRunnerSourceSet()) {
  const value = e2eReport(status);
  value.schema_version = '0.2';
  value.runner_identity = {
    ...identity(), runner_version: '0.2.0', runner_source_sha256: sourceSet.source_set_sha256,
    runner_source_set_ref: ref('E2E_RUNNER_SOURCE_SET', 'inputs/runner/runner-source-set.json'),
    java_executable: javaExecutable()
  };
  for (const item of value.case_results.slice(178, 187)) {
    item.expectation = 'BLOCKED';
    item.status = status === 'READY_FOR_ENABLEMENT_EVALUATION' ? 'BLOCKED_MATCHED' : 'FAILED';
    for (const attempt of item.attempts) attempt.status = item.status;
  }
  if (status === 'READY_FOR_ENABLEMENT_EVALUATION') {
    value.summary.pass_matched_count = 137;
    value.summary.blocked_matched_count = 57;
  }
  return value;
}

function javaExecutable() {
  const executableSha = digest();
  const rootPath = `inputs/runner/toolchain/java/${executableSha}`;
  const value = {
    evidence_version: '0.1.0', major_version: 21, executable_basename: 'java',
    mirror_ref: ref('E2E_JAVA_EXECUTABLE_MIRROR', `${rootPath}/java`),
    version_output_ref: ref('E2E_JAVA_VERSION_OUTPUT', `${rootPath}/java-version.txt`),
    release_metadata_ref: ref('E2E_JAVA_RELEASE_METADATA', `${rootPath}/release`),
    os_arch: 'darwin-arm64'
  };
  value.image_payload_sha256 = sha256Jcs(value);
  return value;
}

function e2eRunnerSourceSet() {
  const paths = [
    'scripts/release-canvas06-e2e-run.mjs',
    'scripts/verify-canvas06-e2e-report.mjs',
    'scripts/canvas06-e2e-run-input.mjs',
    'scripts/canvas06-e2e-run-preflight.mjs',
    'scripts/canvas06-e2e-run-stage.mjs',
    'scripts/canvas06-e2e-run-report.mjs',
    'scripts/canvas06-e2e-run-transaction.mjs',
    'scripts/canvas06-e2e-attempt-artifacts.mjs',
    'scripts/canvas06-e2e-production-web.mjs',
    'scripts/canvas06-projection-digest-v01.mjs',
    'scripts/canvas06-rfc8785.mjs',
    'scripts/canvas06-e2e-common-fixtures.mjs',
    'scripts/canvas06-e2e-manifest-v01-trust.mjs',
    'scripts/canvas06-e2e-manifest-v01-support.mjs',
    'scripts/canvas06-e2e-manifest-v01-input.mjs',
    'scripts/canvas06-e2e-manifest-v01-archive.mjs',
    'scripts/verify-canvas06-e2e-manifest-v01.mjs',
    'scripts/verify-canvas06-controlled-input-bundle.mjs',
    'tests/e2e/release/dev-canvas-06/playwright.release.config.ts',
    'tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts',
    'tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs',
    'tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs',
    'tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs',
    'tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs'
  ];
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001', schema_version: '0.2', source_set_version: '0.2.0',
    selection_policy: 'EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED',
    entries: paths.map(path => ({ path, byte_length: 1, sha256: digest() })),
    excluded_classes: ['ALL_PATHS_NOT_IN_ENTRIES', 'TEST_AND_SPEC_SOURCES_NOT_IN_ENTRIES', 'FIXTURE_TEMPLATE_CATALOG_AND_VECTOR_BYTES', 'CONTRACT_SCHEMA_AND_REFERENCE_BYTES', 'MANIFEST_BUILDER_ONLY_SOURCES', 'PRODUCT_FRONTEND_AND_RUNTIME_SOURCES', 'DEPENDENCY_AND_BUILD_OUTPUT_TREES', 'JAVA_EXECUTABLE_AND_BROWSER_MIRRORS', 'REPORT_INPUT_ATTEMPT_AND_RELEASE_ARTIFACTS', 'VCS_METADATA_AND_DIRTY_PATCH_BYTES', 'SYMLINK_HARDLINK_SOCKET_DEVICE_FIFO']
  };
  value.source_set_sha256 = sha256Jcs(value);
  return value;
}

function controlledInvocationContext() {
  const sourceSet = e2eRunnerSourceSet();
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-CONTROLLED-INVOCATION-CONTEXT-001',
    schema_version: '0.1',
    context_id: `dev-canvas-06.e2e-controlled-invocation.${digest().slice(0, 12)}.${sourceSet.source_set_sha256.slice(0, 12)}`,
    input_mode: 'PRODUCTION_HANDOFF',
    source_root_realpath: '/tmp/source',
    input_trust: { mode: 'PRODUCTION_HANDOFF', root_realpath: '/tmp/handoff', primary_ref: ref('INTAKE_REPORT', 'inputs/raw/intake.json') },
    manifest_root_realpath: '/tmp/manifest',
    manifest_ref: ref('E2E_MANIFEST', 'dev-canvas-06-e2e-manifest.json'),
    profile_asset_root_realpath: '/tmp/manifest/inputs/upstream/profile-assets',
    profile_asset_tree_ref: ref('PROFILE_ASSET_TREE', 'inputs/upstream/profile-assets'),
    profile_asset_refs: [
      ref('GRAMMAR_ASSET', 'inputs/upstream/profile-assets/grammar.json'),
      ref('NORMALIZATION_DATA', 'inputs/upstream/profile-assets/normalization.json'),
      ref('PROFILE_PACKAGE', 'inputs/upstream/profile-assets/profile.json'),
      ref('RULE_SET', 'inputs/upstream/profile-assets/rules.json'),
      ref('SYMBOL_ASSET', 'inputs/upstream/profile-assets/symbols.json')
    ],
    report_staging_root_realpath: '/tmp/report-staging',
    attempt_parent_realpath: '/tmp/report-staging/attempts',
    process_control_parent_realpath: '/tmp/process-control',
    java_executable_ref: ref('JAVA_EXECUTABLE', '/tmp/jdk/bin/java'),
    browser_executable_ref: ref('BROWSER_EXECUTABLE', '/tmp/chromium'),
    runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar'),
    web_dist_ref: ref('WEB_DIST_TREE', 'inputs/build/web-dist'),
    runner_source_set_ref: ref('RUNNER_SOURCE_SET', 'inputs/runner/runner-source-set.json'),
    driver_catalog: [
      { driver_id: 'DRIVER-PROCEDURAL', source_ref: ref('E2E_DRIVER_SOURCE', 'inputs/drivers/procedural-driver.mjs') },
      { driver_id: 'DRIVER-CONTROL', source_ref: ref('E2E_DRIVER_SOURCE', 'inputs/drivers/control-driver.mjs') },
      { driver_id: 'DRIVER-STRUCTURAL', source_ref: ref('E2E_DRIVER_SOURCE', 'inputs/drivers/structural-driver.mjs') },
      { driver_id: 'DRIVER-COMMON', source_ref: ref('E2E_DRIVER_SOURCE', 'inputs/drivers/common-driver.mjs') }
    ],
    runtime_port: 19080,
    web_port: 15173,
    execution_schedule: Array.from({ length: 194 }, (_, index) => [1, 2].map(attempt_ordinal => ({
      ordinal: index * 2 + attempt_ordinal,
      case_ordinal: index + 1,
      case_id: `E2E-CANVAS-001.CASE-${String(index + 1).padStart(3, '0')}`,
      suite_id: 'E2E-CANVAS-001',
      driver_id: 'DRIVER-COMMON',
      expectation: 'PASS',
      attempt_ordinal,
      viewport_id: 'VP-1440X900',
      zoom_id: 'Z-100',
      attempt_root_realpath: `/tmp/report-staging/attempts/case-${index + 1}/${attempt_ordinal}`,
      runtime_port: 19080,
      web_port: 15173
    }))).flat()
  };
  value.context_payload_sha256 = sha256Jcs(value);
  return value;
}

function assertRunnerSourceSetDigest(value) {
  const preimage = structuredClone(value); delete preimage.source_set_sha256;
  assert.equal(value.source_set_sha256, sha256Jcs(preimage));
}

function assertE2eV02IdentityJoin(report, sourceSet) {
  assertRunnerSourceSetDigest(sourceSet);
  assert.equal(report.runner_identity.runner_source_sha256, sourceSet.source_set_sha256);
  const java = report.runner_identity.java_executable;
  const executableSha = java.mirror_ref.sha256;
  const rootPath = `inputs/runner/toolchain/java/${executableSha}`;
  assert.equal(java.mirror_ref.path, `${rootPath}/${java.executable_basename}`);
  assert.equal(java.version_output_ref.path, `${rootPath}/java-version.txt`);
  assert.equal(java.release_metadata_ref.path, `${rootPath}/release`);
  const preimage = structuredClone(java); delete preimage.image_payload_sha256;
  assert.equal(java.image_payload_sha256, sha256Jcs(preimage));
}

function reportBase(kind, report_status, summary, capability_results, case_results, failures) { return { schema_id: `OPM-DEV-CANVAS-06-${kind}-REPORT-001`, schema_version: '0.1', report_id: `dev-canvas-06.${kind.toLowerCase()}-report.0123456789ab.abcdef012345`, generated_at: now(), runner_identity: identity(), manifest_ref: ref('MANIFEST', 'manifest.json'), intake_report_ref: ref('INTAKE_REPORT', 'intake.json'), handoff_ref: ref('HANDOFF', 'handoff.json'), upstream_source_build: upstreamBuild(), source_build: sourceBuild(), environment: { environment_fingerprint: digest(), locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 }, report_status, summary, capability_results, case_results, failures, limitations: [] }; }

function e2eAttempt(ordinal, status) { return { attempt_ordinal: ordinal, status, fixture_sha256: digest(), input_sha256: digest(), project_id: 'project-001', model_id: 'model-001', base_revision: 'revision-000', head_revision: 'revision-001', observed_status: status, transaction: { revision_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, revision_parent_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, text_artifact_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, text_trace_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, finding_delta: 0, operation_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, receipt_delta: status === 'BLOCKED_MATCHED' ? 0 : 1, draft_head_changed: status !== 'BLOCKED_MATCHED' }, reopen_matches: true, artifact_refs: [ref('ATTEMPT', 'attempt.json')] }; }
function visualFailure() { return { code: 'VISUAL_CAPTURE_FAILED', case_id: 'VIS-0', evidence_refs: [ref('EVIDENCE', 'failure.json')], message_key: 'visual.capture.failed' }; }
function e2eFailure() { return { code: 'E2E_EXPECTATION_MISMATCH', case_id: 'E2E-FAMILY-0', evidence_refs: [ref('EVIDENCE', 'failure.json')], message_key: 'e2e.expectation.failed' }; }
function identity() { return { runner_version: '0.1.0', source_commit: sha40(), node_version: 'v22.0.0', playwright_version: '1.57.0', chromium_version: '143.0.0', os: 'macOS', command: 'npm run release', runner_source_sha256: digest() }; }
function sourceBuild() { return { source_commit: sha40(), dirty_before_build: false, build_command: 'npm run build', node_version: 'v22.0.0', lockfile_sha256: digest(), web_dist: ref('WEB_DIST', 'apps/web/dist.tar'), local_runtime_jar: ref('LOCAL_RUNTIME_JAR', 'runtime.jar') }; }
function upstreamBuild() { return { source_commit: sha40(), dirty_before_build: false, evidence_output_root: 'reports', java_version: '21', node_version: 'v22.0.0', os: 'macOS', build_command: 'npm run handoff', lockfile_sha256: digest(), pom_sha256: digest() }; }
function upstreamInputs() { return ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map(input_kind => ({ input_kind, ref: ref(input_kind, `${input_kind}.json`) })); }
function materialization() { return { bundle_ref: ref('EVIDENCE_BUNDLE', 'bundle.jar'), java_version: '21', entry_allowlist: ['input.json'], materialized_count: 1, aggregate_sha256: digest(), temporary_directory_cleaned: true }; }
function environmentPolicy() { return { locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 }; }
function viewports() { return [{ viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 }, { viewport_id: 'VP-1280X800', width: 1280, height: 800, device_scale_factor: 1 }, { viewport_id: 'VP-390X844', width: 390, height: 844, device_scale_factor: 1 }]; }
function zooms() { return [{ zoom_id: 'Z-025', scale: 0.25 }, { zoom_id: 'Z-100', scale: 1 }, { zoom_id: 'Z-400', scale: 4 }]; }
function subjects() { return ['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK']; }
function commonCaseIds() { return ['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION', 'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP', 'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED', 'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED', 'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED', 'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING', 'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY']; }
function transaction() { return { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 1, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true }; }
function policy(policy_id) { return { policy_id, policy_version: '0.1' }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest() }; }
function archiveRef(path) { return { path: `inputs/${path}`, byte_length: 1, sha256: digest(), bundle_sha256: digest(), archive_entry_path: `archive/${path}` }; }
function digest() { return '0'.repeat(64); }
function sha40() { return 'a'.repeat(40); }
function now() { return '2026-07-31T00:00:00.000Z'; }
async function schema(file) { return JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas', file), 'utf8')); }
