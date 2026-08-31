import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SUBJECTS = Object.freeze(['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK']);
const SCHEMAS = Object.freeze({
  request: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json',
  plan: 'docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json',
  catalog: 'docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json',
  invocation: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-capture-invocation.schema.json',
  observed: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-capture-observed-result.schema.json',
  clone: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-clone-result.schema.json',
  ready: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-runtime-ready.schema.json',
  normalized: 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-normalized-result.schema.json'
});

/** Common Visual 唯一生产入口；所有物理输入必须由活动 Request 0.2 显式提供。 */
export async function runCommonVisualMaterialization(request, captureCallback) {
  if (typeof captureCallback !== 'function') adapterInput('Capture callback is required.');
  const validators = await loadContracts();
  requireSchema(validators.request, request, 'Adapter Request is invalid.', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  const inputs = await preflight(request, validators);
  const bases = await materializeBases(request, inputs);
  const attemptResults = await cloneAttempts(request, inputs, bases, captureCallback, validators);
  const result = buildNormalizedResult(request, inputs, bases, attemptResults);
  requireSchema(validators.normalized, result, 'Normalized Result is invalid.', 'GOLDEN_COMMON_NORMALIZED_RESULT_INVALID', 4);
  verifyNormalizedResult(result, inputs, bases);
  return result;
}

async function preflight(request, validators) {
  await exactAbsoluteFile(request.java_executable_ref.path, request.java_executable_ref, 'JAVA_EXECUTABLE');
  if (await javaMajor(request.java_executable_ref.path) !== 21) adapterInput('Java executable is not Java 21.');
  await exactRawFile(request.runtime_jar_path, request.runtime_jar_ref, 'Runtime JAR');
  await exactDirectory(request.common_fixture_root, 'Common fixture root');
  await exactDirectory(request.profile_asset_root, 'Profile asset root');
  await exactRawFile(request.plan_path, request.plan_ref, 'Capture Plan');
  await exactFreshPath(request.work_root);
  const plan = await readJson(request.plan_path, 'Capture Plan', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  requireSchema(validators.plan, plan, 'Capture Plan is invalid.', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  if (plan.plan_status !== 'READY_FOR_AUTHORING' || plan.source_date_epoch !== request.source_date_epoch || !sameJcs(plan.runtime_jar_ref, request.runtime_jar_ref)) adapterInput('Capture Plan does not join the request.');
  const profile = await loadProfileClosure(request, plan.active_binding);
  const catalogRef = plan.common_fixture_catalog_ref;
  if (!catalogRef || catalogRef.kind !== 'COMMON_FIXTURE_CATALOG') adapterInput('Capture Plan has no Common Catalog reference.');
  const catalogPath = resolveInside(request.common_fixture_root, catalogRef.path);
  await exactRawFile(catalogPath, catalogRef, 'Common Catalog');
  const catalog = await readJson(catalogPath, 'Common Catalog', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  requireSchema(validators.catalog, catalog, 'Common Catalog is invalid.', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  const captures = await loadCommonCaptures(request, plan, catalog, catalogRef, validators);
  return { plan, catalog, catalogRef, captures, profile };
}

async function loadProfileClosure(request, activeBinding) {
  let closure;
  try { closure = await loadProfileAssetClosure({ assetRoot: request.profile_asset_root, manifestRootPath: 'profile/assets', activeBinding }); }
  catch { adapterInput('Profile asset closure is invalid.'); }
  if (!sameJcs(closure.profile_asset_refs, request.profile_asset_refs) || !sameJcs(closure.profile_asset_tree_ref, request.profile_asset_tree_ref)) adapterInput('Profile raw references or tree digest differ.');
  return closure;
}

async function loadCommonCaptures(request, plan, catalog, catalogRef, validators) {
  if (catalog.catalog_version !== '0.2.0' || !Array.isArray(catalog.visual_subjects) || catalog.visual_subjects.length !== 8 || !catalog.visual_subjects.every((item, index) => item.subject_id === SUBJECTS[index])) adapterInput('Common Catalog subject order differs.');
  const fixtureBySubject = new Map();
  for (const subject of catalog.visual_subjects) {
    const path = resolveInside(request.common_fixture_root, subject.fixture_ref.path);
    await exactRawFile(path, subject.fixture_ref, `Fixture ${subject.subject_id}`);
    const fixture = await readJson(path, `Fixture ${subject.subject_id}`, 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
    requireSchema(validators.fixture, fixture, `Fixture ${subject.subject_id} is invalid.`, 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
    if (fixture.subject_id !== subject.subject_id || fixture.revision_document.revision_id !== subject.expected_revision || fixture.capture_setup.expected_focus_target_id !== subject.focus_target_id || fixture.capture_setup.expected_focus_anchor !== subject.focus_anchor || expectedCellCount(fixture.expected_projection) !== subject.expected_cells || !sameJcs(fixture.capture_setup.critical_regions, subject.critical_regions)) adapterInput(`Fixture ${subject.subject_id} does not close Catalog.`);
    fixtureBySubject.set(subject.subject_id, fixture);
  }
  const common = plan.captures.filter(item => item.capture_kind === 'COMMON');
  if (common.length !== 72 || new Set(common.map(item => item.capture_id)).size !== 72) adapterInput('Plan must contain 72 unique Common captures.');
  for (const capture of common) {
    const fixture = fixtureBySubject.get(capture.subject_id);
    const subject = catalog.visual_subjects.find(item => item.subject_id === capture.subject_id);
    if (!fixture || !subject || !sameJcs(capture.fixture_ref, subject.fixture_ref) || !sameJcs(capture.common_fixture_catalog_ref, catalogRef) || capture.expected_revision !== fixture.revision_document.revision_id || capture.expected_projection_sha256 !== sha256Jcs(fixture.expected_projection) || capture.focus_target_id !== fixture.capture_setup.expected_focus_target_id || capture.focus_anchor !== fixture.capture_setup.expected_focus_anchor || capture.expected_cells !== expectedCellCount(fixture.expected_projection) || !sameJcs(capture.critical_regions, fixture.capture_setup.critical_regions)) adapterInput(`Common capture ${capture.capture_id} does not close Plan, Catalog, and fixture.`);
  }
  return common.map((capture, commonCaptureOrdinal) => ({ capture, commonCaptureOrdinal, fixture: fixtureBySubject.get(capture.subject_id) }));
}

async function materializeBases(request, inputs) {
  await mkdir(request.work_root, { mode: 0o700 });
  const bases = new Map();
  for (const subject of inputs.catalog.visual_subjects) {
    const subjectRoot = resolve(request.work_root, 'bases', subject.subject_id);
    const storageRoot = resolve(subjectRoot, 'storage');
    const attestationPath = resolve(subjectRoot, 'attestation.json');
    await mkdir(subjectRoot, { recursive: true, mode: 0o700 });
    await runJava(request.java_executable_ref.path, [
      '-jar', request.runtime_jar_path, '--spring.profiles.active=release-golden-authoring', '--opm.runtime.mode=RELEASE_GOLDEN_COMMON_BASE', '--opm.release.golden-authoring=true', '--opm.release.visual-common-materializer=true', '--spring.main.web-application-type=none',
      `--opm.release.visual-common.fixture=${resolveInside(request.common_fixture_root, subject.fixture_ref.path)}`,
      `--opm.release.visual-common.storage-root=${storageRoot}`, `--opm.release.visual-common.attestation-out=${attestationPath}`, `--opm.release.source-date-epoch=${request.source_date_epoch}`
    ], 'GOLDEN_COMMON_MIGRATION_FAILED');
    const attestation = await readJson(attestationPath, `Base attestation ${subject.subject_id}`, 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3);
    const fixture = inputs.captures.find(item => item.capture.subject_id === subject.subject_id)?.fixture;
    bases.set(subject.subject_id, await verifyBaseAttestation(subject, fixture, storageRoot, attestationPath, attestation, request.source_date_epoch));
  }
  return bases;
}

async function verifyBaseAttestation(subject, fixture, storageRoot, attestationPath, attestation, epoch) {
  const required = ['contract_version', 'subject_id', 'fixture_ref', 'project_id', 'model_id', 'revision_id', 'database_ref', 'semantic_state_sha256', 'committed_projection_sha256', 'index_counts', 'materializer_identity', 'source_date_epoch'];
  if (!fixture || !isExactObject(attestation, required) || attestation.contract_version !== '0.1.0' || attestation.subject_id !== subject.subject_id || attestation.project_id !== fixture.project.project_id || attestation.model_id !== fixture.model.model_id || attestation.revision_id !== fixture.revision_document.revision_id || !sameRaw(attestation.fixture_ref, subject.fixture_ref) || attestation.source_date_epoch !== epoch || !isHex(attestation.semantic_state_sha256) || attestation.committed_projection_sha256 !== sha256Jcs(fixture.expected_projection.committed_cells) || !isPlainJson(attestation.index_counts) || !isPlainJson(attestation.materializer_identity)) storageFailure('Base attestation shape or identity is invalid.');
  const databaseRef = attestation.database_ref;
  if (!isFileRef(databaseRef, 'DATABASE')) storageFailure('Base database reference is invalid.');
  const databasePath = resolveInside(storageRoot, databaseRef.path, 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3);
  await exactRawFile(databasePath, databaseRef, 'Base database', 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3);
  await assertNoSqliteSidecars(databasePath, 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3);
  return {
    subjectId: subject.subject_id, storageRoot, attestationPath,
    attestationRef: await logicalRef(attestationPath, 'attestation.json', 'COMMON_BASE_ATTESTATION', 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3),
    databaseRef: { kind: 'PROJECT_DB', path: databaseRef.path, byte_length: databaseRef.byte_length, sha256: databaseRef.sha256 },
    semanticStateSha256: attestation.semantic_state_sha256, committedProjectionSha256: attestation.committed_projection_sha256,
    baseTreeSha256: await storageTreeDigest(storageRoot, 'GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3)
  };
}

async function cloneAttempts(request, inputs, bases, captureCallback, validators) {
  const results = [];
  for (const { capture, commonCaptureOrdinal, fixture } of inputs.captures) {
    const base = bases.get(capture.subject_id);
    if (!base) cloneFailure('Common capture has no materialized base.');
    for (const attemptOrdinal of [1, 2]) {
      const attemptRoot = resolve(request.work_root, 'attempts', String(commonCaptureOrdinal).padStart(3, '0'), `attempt-${attemptOrdinal}`);
      const storageRoot = resolve(attemptRoot, 'storage'); const cloneResultPath = resolve(attemptRoot, 'clone-result.json');
      await mkdir(attemptRoot, { recursive: true, mode: 0o700 });
      await runJava(request.java_executable_ref.path, cloneArguments(request, capture, attemptOrdinal, base, storageRoot, cloneResultPath), 'GOLDEN_COMMON_CLONE_FAILED');
      const clone = await verifyCloneResult(request, capture, attemptOrdinal, base, storageRoot, cloneResultPath, validators);
      const runtime = await startWebRuntime(request, capture, attemptOrdinal, storageRoot, cloneResultPath, attemptRoot);
      let observed; let primaryError;
      try {
        await verifyRuntimeReady(runtime.ready, request, inputs.profile, capture, attemptOrdinal, clone, cloneResultPath, storageRoot, runtime.child.pid, runtime.nonce, validators);
        await verifyRuntimeEndpoints(runtime.ready);
        const invocation = await buildInvocation(request, capture, commonCaptureOrdinal, fixture, attemptOrdinal, storageRoot, attemptRoot, base, runtime.ready);
        requireSchema(validators.invocation, invocation, 'Capture Invocation is invalid.', 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
        try { observed = await captureCallback(invocation); } catch { callbackFailure('Capture callback failed.'); }
        verifyObservedResult(observed, invocation, validators.observed);
      } catch (error) { primaryError = error; }
      let shutdown;
      try { shutdown = await closeWebRuntime(runtime, storageRoot, base); } catch (error) { if (!primaryError) primaryError = error; }
      if (primaryError) throw primaryError;
      results.push({ common_capture_ordinal: commonCaptureOrdinal, capture_id: capture.capture_id, subject_id: capture.subject_id, attempt_ordinal: attemptOrdinal, attempt_storage_ref: clone.attemptDatabaseRef, attempt_tree_sha256: shutdown.attemptTreeSha256, base_tree_sha256_before: clone.baseTreeSha256Before, base_tree_sha256_after: shutdown.baseTreeSha256After, runtime_shutdown_status: 'CLOSED', observed });
    }
  }
  return results;
}

function cloneArguments(request, capture, ordinal, base, storageRoot, cloneResultPath) {
  return ['-jar', request.runtime_jar_path, '--spring.profiles.active=release-golden-authoring', '--spring.main.web-application-type=none', '--opm.runtime.mode=RELEASE_GOLDEN_COMMON_CLONE', '--opm.release.golden-authoring=true', '--opm.release.visual-common.clone=true', `--opm.release.visual-common.request-id=${request.request_id}`, `--opm.release.visual-common.capture-id=${capture.capture_id}`, `--opm.release.visual-common.subject-id=${capture.subject_id}`, `--opm.release.visual-common.attempt-ordinal=${ordinal}`, `--opm.release.visual-common.base-root=${base.storageRoot}`, `--opm.release.visual-common.base-attestation=${base.attestationPath}`, `--opm.release.visual-common.attempt-storage-root=${storageRoot}`, `--opm.release.visual-common.clone-result-out=${cloneResultPath}`, `--opm.release.source-date-epoch=${request.source_date_epoch}`];
}

async function verifyCloneResult(request, capture, ordinal, base, storageRoot, cloneResultPath, validators) {
  const clone = await readJson(cloneResultPath, 'Clone Result', 'GOLDEN_COMMON_CLONE_FAILED', 3);
  requireSchema(validators.clone, clone, 'Clone Result is invalid.', 'GOLDEN_COMMON_CLONE_FAILED', 3);
  if (clone.result_payload_sha256 !== sha256Jcs(without(clone, 'result_payload_sha256')) || clone.request_id !== request.request_id || clone.capture_id !== capture.capture_id || clone.subject_id !== capture.subject_id || clone.attempt_ordinal !== ordinal || clone.source_date_epoch !== request.source_date_epoch || !sameRaw(clone.base_attestation_ref, base.attestationRef) || !sameRaw(clone.base_database_ref, base.databaseRef) || clone.base_tree_sha256_before !== base.baseTreeSha256 || clone.base_tree_sha256_after !== base.baseTreeSha256) cloneFailure('Clone Result does not join its base and capture.');
  const databasePath = resolveInside(storageRoot, clone.attempt_database_ref.path, 'GOLDEN_COMMON_CLONE_FAILED', 3);
  await exactRawFile(databasePath, clone.attempt_database_ref, 'Attempt database', 'GOLDEN_COMMON_CLONE_FAILED', 3);
  await assertNoSqliteSidecars(databasePath, 'GOLDEN_COMMON_CLONE_FAILED', 3);
  const attemptTreeSha256 = await storageTreeDigest(storageRoot, 'GOLDEN_COMMON_CLONE_FAILED', 3);
  if (clone.attempt_tree_sha256 !== attemptTreeSha256) cloneFailure('Clone Result attempt tree differs.');
  return { ref: await logicalRef(cloneResultPath, 'clone-result.json', 'COMMON_CLONE_RESULT', 'GOLDEN_COMMON_CLONE_FAILED', 3), attemptDatabaseRef: clone.attempt_database_ref, baseTreeSha256Before: clone.base_tree_sha256_before, attemptTreeSha256 };
}

async function startWebRuntime(request, capture, ordinal, storageRoot, cloneResultPath, attemptRoot) {
  const { spawn } = await import('node:child_process');
  const readyPath = resolve(attemptRoot, 'runtime-ready.json'); const nonce = randomBytes(32).toString('hex');
  const args = ['-jar', request.runtime_jar_path, '--spring.profiles.active=release-golden-authoring', '--spring.main.web-application-type=servlet', '--opm.runtime.mode=RELEASE_GOLDEN_COMMON_WEB', '--opm.release.golden-authoring=true', '--opm.release.visual-common.web-runtime=true', `--opm.release.visual-common.request-id=${request.request_id}`, `--opm.release.visual-common.capture-id=${capture.capture_id}`, `--opm.release.visual-common.subject-id=${capture.subject_id}`, `--opm.release.visual-common.attempt-ordinal=${ordinal}`, `--opm.release.visual-common.launch-nonce=${nonce}`, `--opm.release.visual-common.attempt-storage-root=${storageRoot}`, `--opm.release.visual-common.clone-result=${cloneResultPath}`, `--opm.release.visual-common.runtime-ready-out=${readyPath}`, `--opm.storage.root=${storageRoot}`, `--opm.assets.root=${request.profile_asset_root}`, '--server.address=127.0.0.1', '--server.port=0', '--management.server.address=127.0.0.1', '--management.server.port=0', '--management.endpoints.web.exposure.include=health', '--management.endpoint.health.probes.enabled=true', `--opm.release.source-date-epoch=${request.source_date_epoch}`];
  if (capture.subject_id === 'BLOCKED_FEEDBACK') args.push('--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert', '--opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed', '--opm.release.visual-common.fault-max-invocations=1');
  const child = spawn(request.java_executable_ref.path, args, { stdio: ['ignore', 'ignore', 'pipe'], env: controlledJavaEnv(request.java_executable_ref.path) });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const ready = await waitForReady(readyPath, child, nonce, capture, ordinal, () => stderr);
  return { child, ready, nonce };
}

async function waitForReady(path, child, nonce, capture, ordinal, stderr) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) uiFailure(`Web Runtime exited before READY: ${stderr()}`);
    try {
      const ready = await readJson(path, 'Runtime Ready', 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
      if (ready.launch_nonce !== nonce || ready.capture_id !== capture.capture_id || ready.subject_id !== capture.subject_id || ready.attempt_ordinal !== ordinal || ready.process_id !== child.pid) uiFailure('Runtime Ready identity differs.');
      return ready;
    } catch (error) {
      if (error?.code === 'ENOENT') { await delay(100); continue; }
      if (error?.code === 'GOLDEN_COMMON_UI_SETUP_FAILED') throw error;
      await delay(100);
    }
  }
  uiFailure('Web Runtime did not publish READY within 30 seconds.');
}

async function verifyRuntimeReady(ready, request, profile, capture, ordinal, clone, cloneResultPath, storageRoot, pid, nonce, validators) {
  requireSchema(validators.ready, ready, 'Runtime Ready is invalid.', 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
  const runtimeProfileRefs = profile.profile_asset_refs.map(ref => ({ ...ref, path: ref.path.slice('profile/assets/'.length) }));
  if (ready.ready_payload_sha256 !== sha256Jcs(without(ready, 'ready_payload_sha256')) || ready.request_id !== request.request_id || ready.capture_id !== capture.capture_id || ready.subject_id !== capture.subject_id || ready.attempt_ordinal !== ordinal || ready.launch_nonce !== nonce || ready.process_id !== pid || !sameRaw(ready.runtime_jar_ref, request.runtime_jar_ref) || !sameJcs(ready.profile_asset_refs, runtimeProfileRefs) || ready.profile_asset_tree_sha256 !== sha256Jcs(runtimeProfileRefs) || !sameRaw(ready.clone_result_ref, clone.ref) || !sameJcs(ready.attempt_database_ref, clone.attemptDatabaseRef) || ready.attempt_tree_sha256_before !== clone.attemptTreeSha256 || ready.runtime_base_url !== `http://127.0.0.1:${ready.server_port}` || ready.management_base_url !== `http://127.0.0.1:${ready.management_server_port}` || ready.server_port === ready.management_server_port) uiFailure('Runtime Ready does not close its source and attempt identities.');
  await exactRawFile(resolveInside(dirname(cloneResultPath), ready.clone_result_ref.path, 'GOLDEN_COMMON_UI_SETUP_FAILED', 3), ready.clone_result_ref, 'Runtime Ready clone result', 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
  await exactRawFile(resolveInside(storageRoot, ready.attempt_database_ref.path, 'GOLDEN_COMMON_UI_SETUP_FAILED', 3), ready.attempt_database_ref, 'Runtime Ready database', 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
}

async function verifyRuntimeEndpoints(ready) {
  let health; let bootstrap;
  try { health = await fetch(`${ready.management_base_url}${ready.readiness_path}`, { redirect: 'error' }); bootstrap = await fetch(`${ready.runtime_base_url}${ready.bootstrap_path}`, { redirect: 'error' }); } catch { uiFailure('Runtime health or bootstrap endpoint is unavailable.'); }
  let payload; try { payload = await health.json(); } catch { uiFailure('Management readiness response is not JSON.'); }
  if (!health.ok || payload?.status !== 'UP' || !bootstrap.ok || !bootstrap.headers.get('content-type')?.startsWith('application/javascript')) uiFailure('Runtime endpoint is invalid.');
}

function buildInvocation(request, capture, commonCaptureOrdinal, fixture, ordinal, storageRoot, attemptRoot, base, ready) {
  return { schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-INVOCATION-001', schema_version: '0.1', invocation_version: '0.1.0', request_id: request.request_id, plan_ref: request.plan_ref, common_capture_ordinal: commonCaptureOrdinal, capture_id: capture.capture_id, subject_id: capture.subject_id, attempt_ordinal: ordinal, visual_variant_key: capture.visual_variant_key, viewport_id: capture.viewport_id, zoom_id: capture.zoom_id, fixture_ref: capture.fixture_ref, capture_setup: fixture.capture_setup, expected_projection: fixture.expected_projection, expected_projection_sha256: capture.expected_projection_sha256, expected_revision: capture.expected_revision, focus_target_id: capture.focus_target_id, focus_anchor: capture.focus_anchor, expected_cells: capture.expected_cells, critical_regions: capture.critical_regions, attempt_root: attemptRoot, storage_root: storageRoot, runtime_base_url: ready.runtime_base_url, base_attestation_ref: base.attestationRef, base_tree_sha256: base.baseTreeSha256, fault_mode: capture.subject_id === 'BLOCKED_FEEDBACK' ? 'BLOCKED_FEEDBACK_ONE_SHOT' : 'NONE' };
}

function verifyObservedResult(observed, invocation, validator) {
  requireSchema(validator, observed, 'Capture observed result is invalid.', 'GOLDEN_COMMON_CAPTURE_RESULT_INVALID', 3);
  const fault = invocation.fault_mode === 'BLOCKED_FEEDBACK_ONE_SHOT' ? { mode: 'BLOCKED_FEEDBACK_ONE_SHOT', trigger_count: 1, error_code: 'PERSISTENCE_FAILED' } : { mode: 'NONE', trigger_count: 0, error_code: null };
  if (observed.request_id !== invocation.request_id || observed.capture_id !== invocation.capture_id || observed.subject_id !== invocation.subject_id || observed.attempt_ordinal !== invocation.attempt_ordinal || !sameJcs(observed.normalized_projection, invocation.expected_projection) || observed.projection_sha256 !== sha256Jcs(invocation.expected_projection) || observed.projection_sha256 !== invocation.expected_projection_sha256 || observed.observed_cells !== invocation.expected_cells || observed.focus_target_id !== invocation.focus_target_id || observed.focus_anchor !== invocation.focus_anchor || !sameJcs(observed.fault_observation, fault)) captureResultFailure('Capture observed result does not close its invocation.');
}

async function closeWebRuntime(runtime, storageRoot, base) {
  if (!runtime.child.kill('SIGTERM')) uiFailure('Cannot signal Web Runtime.');
  const exit = await waitForChildClose(runtime.child, 10000);
  if (!exit) { runtime.child.kill('SIGKILL'); uiFailure('Web Runtime required SIGKILL.'); }
  if (!((exit.code === 0 && exit.signal === null) || (exit.code === null && exit.signal === 'SIGTERM'))) uiFailure('Web Runtime exited unexpectedly.');
  if (!(await portClosed(runtime.ready.server_port)) || !(await portClosed(runtime.ready.management_server_port))) uiFailure('Web Runtime port remains reachable after shutdown.');
  await assertNoSqliteSidecars(resolveInside(storageRoot, runtime.ready.attempt_database_ref.path, 'GOLDEN_COMMON_UI_SETUP_FAILED', 3), 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
  const attemptTreeSha256 = await storageTreeDigest(storageRoot, 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
  const baseTreeSha256After = await storageTreeDigest(base.storageRoot, 'GOLDEN_COMMON_UI_SETUP_FAILED', 3);
  if (baseTreeSha256After !== base.baseTreeSha256) uiFailure('Immutable base changed during an attempt.');
  return { attemptTreeSha256, baseTreeSha256After };
}

function buildNormalizedResult(request, inputs, bases, attemptResults) {
  const baseResults = inputs.catalog.visual_subjects.map(subject => { const base = bases.get(subject.subject_id); return { subject_id: subject.subject_id, fixture_ref: subject.fixture_ref, attestation_ref: base.attestationRef, database_ref: base.databaseRef, semantic_state_sha256: base.semanticStateSha256, committed_projection_sha256: base.committedProjectionSha256, base_tree_sha256: base.baseTreeSha256, base_read_only: true }; });
  const result = { schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-NORMALIZED-RESULT-001', schema_version: '0.1', result_version: '0.1.0', status: 'READY_FOR_CANDIDATE_TRANSACTION', request_id: request.request_id, plan_ref: request.plan_ref, catalog_ref: inputs.catalogRef, runtime_jar_ref: request.runtime_jar_ref, source_date_epoch: request.source_date_epoch, base_results: baseResults, attempt_results: attemptResults, base_set_sha256: sha256Jcs(baseResults), attempt_set_sha256: sha256Jcs(attemptResults), summary: { subject_count: 8, base_count: 8, common_capture_count: 72, attempt_count: 144, deterministic: true } };
  result.result_payload_sha256 = sha256Jcs(result); return result;
}

function verifyNormalizedResult(result, inputs, bases) {
  if (result.base_set_sha256 !== sha256Jcs(result.base_results) || result.attempt_set_sha256 !== sha256Jcs(result.attempt_results) || result.result_payload_sha256 !== sha256Jcs(without(result, 'result_payload_sha256')) || result.base_results.length !== 8 || result.attempt_results.length !== 144) normalizedFailure('Normalized Result digest or cardinality differs.');
  for (const [index, baseResult] of result.base_results.entries()) { const subject = inputs.catalog.visual_subjects[index]; const base = bases.get(subject.subject_id); if (baseResult.subject_id !== subject.subject_id || !sameJcs(baseResult.fixture_ref, subject.fixture_ref) || !sameJcs(baseResult.attestation_ref, base.attestationRef) || !sameJcs(baseResult.database_ref, base.databaseRef) || baseResult.base_tree_sha256 !== base.baseTreeSha256 || baseResult.base_read_only !== true) normalizedFailure('Normalized base order or identity differs.'); }
  for (const [index, attempt] of result.attempt_results.entries()) { const entry = inputs.captures[Math.floor(index / 2)]; const base = bases.get(entry.capture.subject_id); if (attempt.common_capture_ordinal !== entry.commonCaptureOrdinal || attempt.capture_id !== entry.capture.capture_id || attempt.subject_id !== entry.capture.subject_id || attempt.attempt_ordinal !== (index % 2) + 1 || attempt.base_tree_sha256_before !== base.baseTreeSha256 || attempt.base_tree_sha256_after !== base.baseTreeSha256 || attempt.runtime_shutdown_status !== 'CLOSED') normalizedFailure('Normalized attempt order or base closure differs.'); }
}

async function loadContracts() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  for (const path of ['docs/contracts/schemas/opm-revision-v0.2.schema.json', 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json']) ajv.addSchema(JSON.parse(await readFile(resolve(ROOT, path), 'utf8')));
  const validators = { fixture: ajv.getSchema('urn:opm:contract:dev-canvas-06-common-visual-fixture:0.1') };
  for (const [name, path] of Object.entries(SCHEMAS)) validators[name] = ajv.compile(JSON.parse(await readFile(resolve(ROOT, path), 'utf8')));
  return validators;
}

function requireSchema(validator, value, message, code, exitCode) { if (!isPlainJson(value) || !validator(value)) fail(code, exitCode, `${message} ${JSON.stringify(validator.errors)}`); }
async function exactAbsoluteFile(path, reference, kind) { if (reference?.kind !== kind || reference.path !== path || !path?.startsWith('/')) adapterInput(`${kind} path is invalid.`); await exactRawFile(path, reference, kind); }
async function exactRawFile(path, reference, label, code = 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', exitCode = 2) { if (!isFileRef(reference) || !path?.startsWith('/')) fail(code, exitCode, `${label} reference is invalid.`); const info = await regularFile(path, label, code, exitCode); if (info.size !== reference.byte_length || sha(await readFile(path)) !== reference.sha256) fail(code, exitCode, `${label} raw reference differs.`); }
async function exactDirectory(path, label) { try { const before = await lstat(path); const canonical = await realpath(path); const after = await lstat(canonical); if (!before.isDirectory() || before.isSymbolicLink() || canonical !== path || !after.isDirectory() || after.isSymbolicLink()) throw new Error(); } catch { adapterInput(`${label} is not an exact ordinary directory.`); } }
async function exactFreshPath(path) { if (!path?.startsWith('/')) adapterInput('Work root is invalid.'); try { await lstat(path); adapterInput('Work root must be fresh.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function regularFile(path, label, code, exitCode) { try { const before = await lstat(path); const canonical = await realpath(path); const after = await lstat(canonical); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || canonical !== path || !after.isFile() || after.isSymbolicLink() || after.nlink !== 1) throw new Error(); return stat(path); } catch { fail(code, exitCode, `${label} is not an exact ordinary file.`); } }
function resolveInside(root, logicalPath, code = 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', exitCode = 2) { if (!logicalPath || logicalPath.startsWith('/') || logicalPath.includes('\\') || logicalPath.split('/').includes('..')) fail(code, exitCode, 'Logical path is unsafe.'); const target = resolve(root, logicalPath); const relation = relative(root, target); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail(code, exitCode, 'Logical path escapes its root.'); return target; }
async function readJson(path, label, code, exitCode) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') throw error; fail(code, exitCode, `${label} must be valid JSON.`); } }
async function logicalRef(path, logicalPath, kind, code, exitCode) { const info = await regularFile(path, kind, code, exitCode); return { kind, path: logicalPath, byte_length: info.size, sha256: sha(await readFile(path)) }; }
async function storageTreeDigest(root, code, exitCode) { const entries = new Map(); async function walk(directory, prefix = '') { let children; try { children = await readdir(directory, { withFileTypes: true }); } catch { fail(code, exitCode, 'Storage tree is unreadable.'); } for (const child of children) { const logical = prefix ? `${prefix}/${child.name}` : child.name; const path = resolve(directory, child.name); if (child.isDirectory()) { const details = await lstat(path); if (details.isSymbolicLink()) fail(code, exitCode, 'Storage tree contains a symbolic directory.'); await walk(path, logical); } else { await regularFile(path, 'Storage entry', code, exitCode); entries.set(logical, sha(await readFile(path))); } } } await walk(root); return sha256Jcs(Object.fromEntries([...entries.entries()].sort(([left], [right]) => compareUtf8(left, right)))); }
async function assertNoSqliteSidecars(databasePath, code, exitCode) { for (const path of [`${databasePath}-wal`, `${databasePath}-shm`]) { try { await lstat(path); fail(code, exitCode, 'SQLite sidecar exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } } }
async function javaMajor(java) { const { spawn } = await import('node:child_process'); return new Promise((resolveMajor, reject) => { const child = spawn(java, ['-version'], { stdio: ['ignore', 'ignore', 'pipe'], env: controlledJavaEnv(java) }); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.once('error', reject); child.once('close', code => { const match = stderr.match(/version \"(\d+)(?:[._]|\")/); if (code !== 0 || !match) return reject(new Error('Java version is unreadable.')); resolveMajor(Number(match[1])); }); }).catch(() => adapterInput('Java executable cannot report its version.')); }
function controlledJavaEnv(java) { return { JAVA_HOME: dirname(dirname(java)), PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' }; }
async function runJava(java, args, code) { const { spawn } = await import('node:child_process'); await new Promise((resolveRun, reject) => { const child = spawn(java, args, { stdio: ['ignore', 'ignore', 'pipe'], env: controlledJavaEnv(java) }); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.once('error', reject); child.once('close', status => status === 0 ? resolveRun() : reject(new Error(stderr))); }).catch(() => fail(code, 3, 'Common Visual Java command failed.')); }
async function waitForChildClose(child, timeout) { return Promise.race([new Promise(resolveClose => child.once('close', (code, signal) => resolveClose({ code, signal }))), delay(timeout).then(() => null)]); }
async function portClosed(port) { return new Promise(resolveClosed => { const socket = connect({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolveClosed(false); }); socket.once('error', () => resolveClosed(true)); socket.setTimeout(1000, () => { socket.destroy(); resolveClosed(false); }); }); }
function expectedCellCount(projection) { return projection.committed_cells.length + projection.transient_cells.length; }
function without(value, key) { const { [key]: ignored, ...rest } = value; return rest; }
function sameRaw(left, right) { return isFileRef(left) && isFileRef(right) && left.byte_length === right.byte_length && left.sha256 === right.sha256; }
function sameJcs(left, right) { return isPlainJson(left) && isPlainJson(right) && sha256Jcs(left) === sha256Jcs(right); }
function isFileRef(value, kind) { return isExactObject(value, ['kind', 'path', 'byte_length', 'sha256']) && (kind === undefined || value.kind === kind) && typeof value.path === 'string' && Number.isSafeInteger(value.byte_length) && value.byte_length > 0 && isHex(value.sha256); }
function isHex(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function isExactObject(value, keys) { return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype; }
function isPlainJson(value, seen = new Set()) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return true; if (typeof value === 'number') return Number.isSafeInteger(value); if (Array.isArray(value)) { if (seen.has(value)) return false; seen.add(value); const valid = value.every(item => isPlainJson(item, seen)); seen.delete(value); return valid; } if (!isPlainObject(value) || seen.has(value)) return false; seen.add(value); const valid = Object.values(value).every(item => isPlainJson(item, seen)); seen.delete(value); return valid; }
function compareUtf8(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function delay(milliseconds) { return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)); }
function fail(code, exitCode, message) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
function adapterInput(message) { fail('GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2, message); }
function storageFailure(message) { fail('GOLDEN_COMMON_STORAGE_VERIFY_FAILED', 3, message); }
function cloneFailure(message) { fail('GOLDEN_COMMON_CLONE_FAILED', 3, message); }
function callbackFailure(message) { fail('GOLDEN_COMMON_CAPTURE_CALLBACK_FAILED', 3, message); }
function captureResultFailure(message) { fail('GOLDEN_COMMON_CAPTURE_RESULT_INVALID', 3, message); }
function uiFailure(message) { fail('GOLDEN_COMMON_UI_SETUP_FAILED', 3, message); }
function normalizedFailure(message) { fail('GOLDEN_COMMON_NORMALIZED_RESULT_INVALID', 4, message); }

async function cli() {
  const args = process.argv.slice(2);
  const modes = new Map([['--validate-request', ['request', 'REQUEST']], ['--validate-capture-invocation', ['invocation', 'INVOCATION']], ['--validate-capture-result', ['observed', 'CAPTURE_RESULT']], ['--validate-normalized-result', ['normalized', 'NORMALIZED_RESULT']]]);
  if (args.length !== 2 || !modes.has(args[0])) adapterInput('Exactly one contract validation mode and one file are required.');
  const path = resolve(args[1]); await regularFile(path, 'Contract input', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  const [contract, label] = modes.get(args[0]); const value = await readJson(path, 'Contract input', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  requireSchema((await loadContracts())[contract], value, 'Contract input is invalid.', 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID', 2);
  process.stdout.write(`COMMON_VISUAL_CONTRACT_VALID\t${label}\t${sha(await readFile(path))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { process.stderr.write(`${error.code ?? 'GOLDEN_COMMON_INTERNAL_ERROR'}\n`); process.exitCode = error.exitCode ?? 4; });
