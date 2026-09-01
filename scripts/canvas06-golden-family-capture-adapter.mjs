import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { dirname, relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { fixtureRefKey } from './release-canvas06-golden-materialize.mjs';
import { startProductionWebServer } from './canvas06-e2e-production-web.mjs';

const ROOT = resolve('.');
const SCHEMAS = Object.freeze({
  identity: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-identity.schema.json',
  clone: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-clone-result.schema.json',
  ready: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-runtime-ready.schema.json',
  invocation: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-invocation.schema.json',
  observed: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-observed-result.schema.json',
  result: 'docs/contracts/schemas/opm-dev-canvas-06-golden-family-capture-adapter-result.schema.json'
});

/** 03B Family 的唯一 Node 调度入口；拒绝所有未经过 Author preflight 的替代物理输入。 */
export async function runFamilyGoldenCaptureAdapter({ plan, plan_ref, materialization, runtime_jar, profile_assets, web_dist, java_executable, browser, work_root, capture_callback, dependencies = {} }) {
  if (typeof capture_callback !== 'function') input('Family capture callback is required.');
  const validators = await loadContracts();
  const inputs = await preflight({ plan, plan_ref, materialization, runtime_jar, profile_assets, web_dist, java_executable, browser, work_root, dependencies });
  const staging = await verifyBundleStaging(inputs);
  const results = [];
  const family = inputs.plan.captures.filter(capture => capture.capture_kind === 'FAMILY');
  if (family.length !== 1170) input('Capture Plan must contain 1170 Family captures.');
  for (const [captureOrdinal, capture] of family.entries()) {
    for (const attemptOrdinal of [1, 2]) results.push(await runAttempt({ inputs, staging, capture, captureOrdinal, attemptOrdinal, capture_callback, validators }));
  }
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-ADAPTER-RESULT-001', schema_version: '0.1', result_version: '0.1.0',
    status: 'READY_FOR_CANDIDATE_TRANSACTION', plan_ref: inputs.planRef, runtime_jar_ref: inputs.runtimeJar.ref,
    source_date_epoch: inputs.plan.source_date_epoch, attempt_results: results, attempt_set_sha256: shaJcs(results), result_payload_sha256: '',
    summary: { family_capture_count: 1170, attempt_count: 2340, deterministic: true }
  };
  value.result_payload_sha256 = shaJcs(without(value, 'result_payload_sha256'));
  requireSchema(validators.result, value, 'Family Adapter Result is invalid.');
  return Object.freeze(value);
}

/** Family 的唯一 Playwright callback：只消费 Invocation 0.1，并在固定 artifacts 布局写入浏览器证据。 */
export function createFamilyCaptureCallback({ browser_executable, environment_policy, chromium_factory } = {}) {
  if (typeof browser_executable !== 'string' || !browser_executable.startsWith('/') || !isPlainObject(environment_policy)) input('Family browser callback input is invalid.');
  const viewportFor = viewportId => ({ 'VP-1440X900': { width: 1440, height: 900 }, 'VP-1280X800': { width: 1280, height: 800 }, 'VP-390X844': { width: 390, height: 844 } })[viewportId];
  return async invocation => {
    const viewport = viewportFor(invocation.viewport_id); if (!viewport) failure('Family viewport is invalid.', 3);
    const chromium = chromium_factory ?? (await import('@playwright/test')).chromium;
    const browser = await chromium.launch({ executablePath: browser_executable, headless: true, args: environment_policy.launch_args });
    let context; let page;
    try {
      context = await browser.newContext({ viewport, locale: environment_policy.locale, timezoneId: environment_policy.timezone, colorScheme: environment_policy.color_scheme === 'light' ? 'light' : 'dark', reducedMotion: environment_policy.reduced_motion, deviceScaleFactor: environment_policy.device_scale_factor });
      page = await context.newPage();
      await page.goto(workbenchRoute(invocation), { waitUntil: 'networkidle', timeout: 30000 });
      await uniqueVisible(page.getByTestId('p03-workbench'));
      await setZoom(page, invocation.zoom_id);
      const focus = page.locator(`[data-opm-capture-cell-id="${cssEscape(invocation.focus_target_id)}"]`);
      await uniqueVisible(focus); await focus.scrollIntoViewIfNeeded();
      const first = await captureStableState(page, invocation);
      await page.waitForTimeout(200);
      const second = await captureStableState(page, invocation);
      if (first.geometry_sha256 !== second.geometry_sha256 || first.projection_sha256 !== second.projection_sha256) failure('Family canvas did not stabilize.', 3);
      await mkdir(invocation.attempt_artifact_root, { recursive: true, mode: 0o700 });
      const pngPath = resolve(invocation.attempt_artifact_root, 'capture.png'); const projectionPath = resolve(invocation.attempt_artifact_root, 'projection.json'); const geometryPath = resolve(invocation.attempt_artifact_root, 'geometry.json');
      await page.screenshot({ path: pngPath, animations: environment_policy.screenshot_options?.animations ?? 'disabled', caret: environment_policy.screenshot_options?.caret ?? 'hide', scale: environment_policy.screenshot_options?.scale ?? 'css' });
      await atomicWrite(projectionPath, `${canonicalizeJcs(first.projection)}\n`); await atomicWrite(geometryPath, `${canonicalizeJcs(first.geometry)}\n`);
      const attemptRoot = dirname(invocation.attempt_artifact_root);
      const pngRef = await logicalRef(attemptRoot, pngPath, 'FAMILY_CAPTURE_PNG'); const projectionRef = await logicalRef(attemptRoot, projectionPath, 'FAMILY_CAPTURE_PROJECTION'); const geometryRef = await logicalRef(attemptRoot, geometryPath, 'FAMILY_CAPTURE_GEOMETRY');
      const value = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-OBSERVED-RESULT-001', schema_version: '0.1', result_version: '0.1.0', capture_id: invocation.capture_id, attempt_ordinal: invocation.attempt_ordinal, identity_payload_sha256: await identityDigest(attemptRoot, invocation.family_capture_identity_ref), ui_setup_status: 'READY', stability_status: 'STABLE', png_ref: pngRef, projection_ref: projectionRef, geometry_ref: geometryRef, png_byte_length: pngRef.byte_length, png_sha256: pngRef.sha256, width: viewport.width, height: viewport.height, cell_geometry_sha256: first.geometry_sha256, projection_sha256: first.projection_sha256, observed_cells: first.geometry.length, focus_target_id: invocation.focus_target_id, focus_anchor: invocation.focus_anchor, result_payload_sha256: '' };
      value.result_payload_sha256 = shaJcs(without(value, 'result_payload_sha256'));
      return Object.freeze(value);
    } finally {
      await page?.close().catch(() => undefined); await context?.close().catch(() => undefined); await browser.close().catch(() => undefined);
    }
  };
}

function workbenchRoute(invocation) { return `${invocation.web_base_url}/projects/${encodeURIComponent(invocation.project_id)}/models/${encodeURIComponent(invocation.model_id)}/workbench?context=${encodeURIComponent(invocation.context_id)}&revision=${encodeURIComponent(invocation.revision_id)}`; }
async function setZoom(page, zoomId) { const target = Number(zoomId.slice(2)); const output = page.getByTestId('p03-zoom-output'); await uniqueVisible(output); for (let current = Number((await output.textContent())?.replace('%', '')); current !== target;) { if (!Number.isSafeInteger(current) || current < 25 || current > 400) failure('Family zoom output is invalid.', 3); await page.getByTestId(current < target ? 'p03-zoom-in' : 'p03-zoom-out').click(); const next = Number((await output.textContent())?.replace('%', '')); if (next === current) failure('Family zoom cannot reach target.', 3); current = next; } }
async function captureStableState(page, invocation) { await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))); const projection = await page.evaluate(async ({ projectId, modelId, contextId, revisionId, captureId, ordinal }) => { const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/projection?request_id=golden.family.${encodeURIComponent(captureId)}.${ordinal}&revision=${encodeURIComponent(revisionId)}`); if (!response.ok) throw new Error('projection'); const value = await response.json(); return value.data; }, { projectId: invocation.project_id, modelId: invocation.model_id, contextId: invocation.context_id, revisionId: invocation.revision_id, captureId: invocation.capture_id, ordinal: invocation.attempt_ordinal }); const geometry = await page.locator('[data-opm-capture-cell-id]').evaluateAll((elements, canvasTestId) => { const canvas = document.querySelector(`[data-testid="${canvasTestId}"]`); if (!canvas) throw new Error('canvas'); const root = canvas.getBoundingClientRect(); return elements.map(element => { const rect = element.getBoundingClientRect(); return { cell_id: element.getAttribute('data-opm-capture-cell-id'), x: rect.x - root.x, y: rect.y - root.y, width: rect.width, height: rect.height }; }).filter(value => typeof value.cell_id === 'string').sort((left, right) => left.cell_id.localeCompare(right.cell_id)); }, 'p03-canvas'); const projectionSha = shaJcs(projection); const geometrySha = shaJcs(geometry); if (projectionSha !== invocation.expected_projection_sha256 || geometry.length !== invocation.expected_cells) failure('Family projection or geometry differs from Capture Plan.', 3); return { projection, projection_sha256: projectionSha, geometry, geometry_sha256: geometrySha }; }
async function identityDigest(attemptRoot, ref) { const identity = await readJson(resolveInside(attemptRoot, ref.path)); return identity.identity_payload_sha256; }
async function uniqueVisible(locator) { if (await locator.count() !== 1 || !await locator.isVisible()) failure('Family required UI locator is not uniquely visible.', 3); }
function cssEscape(value) { if (typeof value !== 'string' || value.length === 0 || /["\\\0]/u.test(value)) failure('Family focus target is unsafe.', 3); return value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `); }

async function preflight({ plan, plan_ref, materialization, runtime_jar, profile_assets, web_dist, java_executable, browser, work_root, dependencies }) {
  if (!isPlainObject(plan) || plan.plan_status !== 'READY_FOR_AUTHORING' || !isRef(plan_ref, 'CAPTURE_PLAN')) input('Plan input is invalid.');
  if (!isPlainObject(materialization) || typeof materialization.root !== 'string' || !materialization.root.startsWith('/') || !Array.isArray(materialization.report_refs) || materialization.report_refs.length !== 130) input('Materialization input is invalid.');
  const paths = [runtime_jar?.path, profile_assets?.root, web_dist?.root, java_executable?.path, work_root];
  if (paths.some(path => typeof path !== 'string' || !path.startsWith('/'))) input('Family physical input is invalid.');
  await exactFile(runtime_jar.path, runtime_jar.ref, 'Runtime JAR');
  await exactDirectory(materialization.root, 'Materialization root'); await exactDirectory(profile_assets.root, 'Profile assets'); await exactDirectory(web_dist.root, 'Web dist');
  await exactFile(java_executable.path, java_executable.ref, 'Java executable');
  if (await javaMajor(java_executable.path, dependencies) !== 21) input('Java executable must be Java 21.');
  await freshPath(work_root);
  if (web_dist.tree_sha256 !== plan.web_dist_tree_sha256 || !isDigest(web_dist.tree_sha256)) input('Web dist tree differs from Plan.');
  const bundlePath = resolveInside(dirname(plan_ref.path), plan.input_materialization?.bundle_ref?.path);
  await exactFile(bundlePath, plan.input_materialization?.bundle_ref, 'Evidence Bundle');
  return Object.freeze({ plan, planRef: plan_ref, materialization, runtimeJar: runtime_jar, profileAssets: profile_assets, webDist: web_dist, java: java_executable.path, browser, workRoot: work_root, bundlePath, dependencies });
}

async function verifyBundleStaging(inputs) {
  const staging = resolve(inputs.workRoot, 'verified-bundle');
  await mkdir(inputs.workRoot, { mode: 0o700 });
  await freshPath(staging);
  const jar = resolve(dirname(dirname(inputs.java)), 'bin', 'jar');
  await exactRegular(jar, 'JDK jar');
  const run = inputs.dependencies.runCommand ?? runCommand;
  let listed;
  try { listed = await run(jar, ['tf', inputs.bundlePath]); } catch { await rm(inputs.workRoot, { recursive: true, force: true }); input('Evidence Bundle list command failed.'); }
  const entries = String(listed.stdout ?? listed).split(/\r?\n/).filter(Boolean);
  const allowlist = inputs.plan.input_materialization.entry_allowlist;
  if (!Array.isArray(allowlist) || entries.length !== new Set(entries).size || entries.some(entry => !safeArchiveEntry(entry) || !allowlist.includes(entry))) {
    await rm(inputs.workRoot, { recursive: true, force: true }); input('Evidence Bundle entry list is invalid.');
  }
  try { await mkdir(staging, { mode: 0o700 }); await run(jar, ['xf', inputs.bundlePath], { cwd: staging }); } catch { await rm(inputs.workRoot, { recursive: true, force: true }); input('Evidence Bundle extraction failed.'); }
  for (const capture of inputs.plan.captures.filter(value => value.capture_kind === 'FAMILY')) {
    const target = resolveInside(staging, capture.fixture_ref.archive_entry_path);
    await exactFile(target, capture.fixture_ref, `Family fixture ${capture.capture_id}`);
  }
  return staging;
}

async function runAttempt({ inputs, staging, capture, captureOrdinal, attemptOrdinal, capture_callback, validators }) {
  const attemptRoot = resolve(inputs.workRoot, 'attempts', String(captureOrdinal).padStart(4, '0'), `attempt-${attemptOrdinal}`);
  await freshPath(attemptRoot); await mkdir(resolve(attemptRoot, 'inputs'), { recursive: true, mode: 0o700 });
  const fixturePath = resolveInside(staging, capture.fixture_ref.archive_entry_path);
  const copiedFixture = resolve(attemptRoot, 'inputs', 'fixture.json'); await copyFile(fixturePath, copiedFixture, COPYFILE_EXCL);
  await exactFile(copiedFixture, capture.fixture_ref, 'Attempt fixture');
  const report = await reportForCapture(inputs, capture);
  const identityPath = resolve(attemptRoot, 'inputs', 'family-capture-identity.json');
  const fixture = await readJson(copiedFixture);
  const identity = buildIdentity(inputs, capture, attemptOrdinal, report, fixture);
  requireSchema(validators.identity, identity, 'Family Capture Identity is invalid.');
  await atomicWrite(identityPath, `${canonicalizeJcs(identity)}\n`);
  const identityRef = await logicalRef(attemptRoot, identityPath, 'FAMILY_CAPTURE_IDENTITY');
  const clone = await cloneAttempt({ inputs, capture, attemptOrdinal, report, identityPath, attemptRoot, validators });
  const runtime = await startRuntime({ inputs, capture, attemptOrdinal, identityPath, clone, attemptRoot, validators });
  let web;
  let observed; let primary;
  try {
    await verifyEndpoints(runtime.ready);
    web = await (inputs.dependencies.startProductionWeb ?? startProductionWebServer)({ root: inputs.webDist.root, host: '127.0.0.1', port: 0, runtimeOrigin: runtime.ready.runtime_base_url });
    const invocation = buildInvocation({ capture, captureOrdinal, attemptOrdinal, identity, identityRef, clone, runtime, web, attemptRoot });
    requireSchema(validators.invocation, invocation, 'Family Capture Invocation is invalid.');
    observed = await capture_callback(Object.freeze(invocation));
    await verifyObserved(observed, invocation, identity, validators.observed, attemptRoot);
  } catch (error) { primary = error; }
  let closed;
  try { if (web) await web.close(); closed = await closeRuntime({ inputs, runtime, clone }); } catch (error) { primary ??= error; }
  if (primary) throw primary;
  return Object.freeze({ capture_ordinal: captureOrdinal, capture_id: capture.capture_id, attempt_ordinal: attemptOrdinal, family_capture_identity_ref: identityRef, clone_result_ref: clone.ref, runtime_ready_ref: runtime.ref, observed: compactObserved(observed), attempt_tree_sha256: closed.attemptTreeSha256, base_tree_sha256_before: clone.baseTreeSha256, base_tree_sha256_after: closed.baseTreeSha256, runtime_shutdown_status: 'CLOSED' });
}

async function reportForCapture(inputs, capture) {
  const key = fixtureRefKey(capture.fixture_ref); const ref = inputs.materialization.report_refs.find(item => item.fixture_ref_key === key)?.report_ref;
  if (!ref) failure('Missing Family Materialization Report.', 2);
  const path = resolve(inputs.materialization.root, 'reports', `${key}.json`);
  await exactFile(path, ref, 'Family Materialization Report');
  const value = await readJson(path);
  if (value?.report_status !== 'MATERIALIZED' || value.fixture_ref_key !== key || !sameJcs(value.source_fixture_ref, capture.fixture_ref) || !isPlainObject(value.fixture_identity) || !isPlainObject(value.materialized_identity)) failure('Family Materialization Report does not close capture.', 2);
  return { key, ref, value };
}

function buildIdentity(inputs, capture, attemptOrdinal, report, fixture) {
  const fixtureIdentity = report.value.fixture_identity; const materialized = report.value.materialized_identity; const contextId = fixture?.model_header?.root_context_id;
  if (fixtureIdentity.model_id !== materialized.model_id || fixtureIdentity.revision_id !== capture.expected_revision || !Number.isSafeInteger(fixtureIdentity.revision_sequence) || fixtureIdentity.revision_sequence < 1 || typeof contextId !== 'string' || contextId.length === 0) failure('Family fixture/report identity does not close capture.', 2);
  const value = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-IDENTITY-001', schema_version: '0.1', identity_version: '0.1.0', capture_id: capture.capture_id, attempt_ordinal: attemptOrdinal, source_date_epoch: inputs.plan.source_date_epoch, fixture_ref: capture.fixture_ref, materialization_report_ref: report.ref, materialized_identity: materialized, model_id: fixtureIdentity.model_id, revision_id: fixtureIdentity.revision_id, revision_sequence: fixtureIdentity.revision_sequence, context_id: contextId, capability_id: capture.capability_id, viewport_id: capture.viewport_id, zoom_id: capture.zoom_id, expected_projection_sha256: capture.expected_projection_sha256, focus_target_id: capture.focus_target_id, focus_anchor: capture.focus_anchor, expected_cells: capture.expected_cells, critical_regions: capture.critical_regions, identity_payload_sha256: '' };
  value.identity_payload_sha256 = shaJcs(without(value, 'identity_payload_sha256'));
  return value;
}

async function cloneAttempt({ inputs, capture, attemptOrdinal, report, identityPath, attemptRoot, validators }) {
  const storage = resolve(attemptRoot, 'storage'); const out = resolve(attemptRoot, 'clone-result.json');
  await runJava(inputs, ['-jar', inputs.runtimeJar.path, '--spring.profiles.active=release-golden-authoring', '--spring.main.web-application-type=none', '--opm.runtime.mode=RELEASE_GOLDEN_FAMILY_CLONE', '--opm.release.golden-authoring=true', '--opm.release.golden-family.clone=true', `--opm.release.golden-family.capture-id=${capture.capture_id}`, `--opm.release.golden-family.attempt-ordinal=${attemptOrdinal}`, `--opm.release.golden-family.family-capture-identity=${identityPath}`, `--opm.release.golden-family.base-storage-root=${resolve(inputs.materialization.root, 'fixtures', report.key, 'storage')}`, `--opm.release.golden-family.attempt-storage-root=${storage}`, `--opm.release.golden-family.clone-result-out=${out}`, `--opm.release.source-date-epoch=${inputs.plan.source_date_epoch}`]);
  const value = await readJson(out); requireSchema(validators.clone, value, 'Family Clone Result is invalid.');
  return { value, ref: await logicalRef(attemptRoot, out, 'FAMILY_CLONE_RESULT'), storage, baseTreeSha256: value.base_tree_sha256_before };
}

async function startRuntime({ inputs, capture, attemptOrdinal, identityPath, clone, attemptRoot, validators }) {
  const readyPath = resolve(attemptRoot, 'runtime-ready.json'); const nonce = randomBytes(32).toString('hex');
  const child = await spawnJava(inputs, ['-jar', inputs.runtimeJar.path, '--spring.profiles.active=release-golden-authoring', '--spring.main.web-application-type=servlet', '--opm.runtime.mode=RELEASE_GOLDEN_FAMILY_WEB', '--opm.release.golden-authoring=true', '--opm.release.golden-family.web-runtime=true', `--opm.release.golden-family.capture-id=${capture.capture_id}`, `--opm.release.golden-family.attempt-ordinal=${attemptOrdinal}`, `--opm.release.golden-family.family-capture-identity=${identityPath}`, `--opm.release.golden-family.clone-result=${resolve(attemptRoot, 'clone-result.json')}`, `--opm.release.golden-family.runtime-ready-out=${readyPath}`, `--opm.release.golden-family.launch-nonce=${nonce}`, `--opm.storage.root=${clone.storage}`, `--opm.assets.root=${inputs.profileAssets.root}`, '--server.address=127.0.0.1', '--server.port=0', '--management.server.address=127.0.0.1', '--management.server.port=0', '--management.endpoints.web.exposure.include=health', '--management.endpoint.health.probes.enabled=true', `--opm.release.source-date-epoch=${inputs.plan.source_date_epoch}`]);
  const value = await waitReady(readyPath, child, nonce); requireSchema(validators.ready, value, 'Family Runtime Ready is invalid.');
  return { child, ready: value, ref: await logicalRef(attemptRoot, readyPath, 'FAMILY_RUNTIME_READY') };
}

function buildInvocation({ capture, captureOrdinal, attemptOrdinal, identity, identityRef, clone, runtime, web, attemptRoot }) { return { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-INVOCATION-001', schema_version: '0.1', invocation_version: '0.1.0', capture_ordinal: captureOrdinal, capture_id: capture.capture_id, attempt_ordinal: attemptOrdinal, family_capture_identity_ref: identityRef, fixture_ref: capture.fixture_ref, clone_result_ref: clone.ref, runtime_ready_ref: runtime.ref, project_id: identity.materialized_identity.project_id, model_id: identity.model_id, revision_id: identity.revision_id, context_id: identity.context_id, runtime_base_url: runtime.ready.runtime_base_url, web_base_url: web.origin, viewport_id: capture.viewport_id, zoom_id: capture.zoom_id, expected_projection_sha256: capture.expected_projection_sha256, focus_target_id: capture.focus_target_id, focus_anchor: capture.focus_anchor, expected_cells: capture.expected_cells, critical_regions: capture.critical_regions, attempt_artifact_root: resolve(attemptRoot, 'artifacts') }; }

async function verifyObserved(value, invocation, identity, validator, attemptRoot) { requireSchema(validator, value, 'Family Capture Observed Result is invalid.'); if (value.result_payload_sha256 !== shaJcs(without(value, 'result_payload_sha256')) || value.capture_id !== invocation.capture_id || value.attempt_ordinal !== invocation.attempt_ordinal || value.identity_payload_sha256 !== identity.identity_payload_sha256 || value.projection_sha256 !== invocation.expected_projection_sha256 || value.observed_cells !== invocation.expected_cells || value.focus_target_id !== invocation.focus_target_id || value.focus_anchor !== invocation.focus_anchor) failure('Family callback result does not close invocation.', 3); for (const [field, kind] of [['png_ref', 'FAMILY_CAPTURE_PNG'], ['projection_ref', 'FAMILY_CAPTURE_PROJECTION'], ['geometry_ref', 'FAMILY_CAPTURE_GEOMETRY']]) await exactFile(resolveInside(attemptRoot, value[field].path), value[field], kind); if (value.png_ref.byte_length !== value.png_byte_length || value.png_ref.sha256 !== value.png_sha256) failure('Family PNG artifact reference differs.', 3); }
function compactObserved(value) { const { capture_id, attempt_ordinal, identity_payload_sha256, png_byte_length, png_sha256, width, height, cell_geometry_sha256, projection_sha256 } = value; return { capture_id, attempt_ordinal, identity_payload_sha256, png_byte_length, png_sha256, width, height, cell_geometry_sha256, projection_sha256 }; }
async function verifyEndpoints(ready) { const response = await fetch(`${ready.management_base_url}${ready.readiness_path}`).catch(() => null); if (!response?.ok || (await response.json().catch(() => null))?.status !== 'UP') failure('Family Runtime readiness is unavailable.', 3); }
async function closeRuntime({ inputs, runtime, clone }) { runtime.child.kill('SIGTERM'); const exit = await waitClose(runtime.child, 10000); if (!exit) { runtime.child.kill('SIGKILL'); failure('Family Runtime did not stop after SIGTERM.', 3); } if (!allowedExit(exit) || !await portClosed(runtime.ready.server_port) || !await portClosed(runtime.ready.management_server_port)) failure('Family Runtime shutdown is invalid.', 3); const attemptTreeSha256 = await treeDigest(clone.storage); const baseTreeSha256 = clone.value.base_tree_sha256_after; if (baseTreeSha256 !== clone.baseTreeSha256) failure('Family base tree drifted.', 3); return { attemptTreeSha256, baseTreeSha256 }; }
function allowedExit(exit) { return (exit.code === 0 && exit.signal === null) || (exit.code === null && exit.signal === 'SIGTERM') || exit.code === 143; }
async function runJava(inputs, args) { const result = await (inputs.dependencies.runJava ?? runCommand)(inputs.java, args, { env: controlledEnv(inputs.java) }); if (result?.code !== undefined && result.code !== 0) failure('Family Clone command failed.', 3); }
async function spawnJava(inputs, args) { if (inputs.dependencies.spawnJava) return await inputs.dependencies.spawnJava(inputs.java, args, { env: controlledEnv(inputs.java) }); const { spawn } = await import('node:child_process'); return spawn(inputs.java, args, { stdio: ['ignore', 'ignore', 'pipe'], env: controlledEnv(inputs.java) }); }
async function waitReady(path, child, nonce) { const end = Date.now() + 30000; while (Date.now() < end) { if (child.exitCode !== null) failure('Family Runtime exited before READY.', 3); try { const ready = await readJson(path); if (ready.launch_nonce !== nonce || ready.process_id !== child.pid) failure('Family Runtime Ready differs.', 3); return ready; } catch (error) { if (error?.code !== 'ENOENT') throw error; await delay(100); } } failure('Family Runtime READY timeout.', 3); }
async function loadContracts() { const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }); const validators = {}; for (const [name, path] of Object.entries(SCHEMAS)) validators[name] = ajv.compile(JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))); return validators; }
async function exactFile(path, ref, label) { if (!isRef(ref)) input(`${label} ref is invalid.`); await exactRegular(path, label); const info = await stat(path); if (info.size !== ref.byte_length || sha(await readFile(path)) !== ref.sha256) input(`${label} bytes differ.`); }
async function exactRegular(path, label) { const value = await lstat(path).catch(() => null); if (!value?.isFile() || value.isSymbolicLink() || value.nlink !== 1) input(`${label} must be a regular file.`); }
async function exactDirectory(path, label) { const value = await lstat(path).catch(() => null); if (!value?.isDirectory() || value.isSymbolicLink() || await realpath(path) !== path) input(`${label} must be an ordinary directory.`); }
async function freshPath(path) { try { await lstat(path); input('Output path must be fresh.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function resolveInside(root, path) { if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) input('Logical path is unsafe.'); const target = resolve(root, path); const relation = relative(root, target); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) input('Logical path escapes root.'); return target; }
function safeArchiveEntry(entry) { return typeof entry === 'string' && entry.length > 0 && !entry.startsWith('/') && !entry.includes('\\') && !entry.split('/').includes('..') && !entry.endsWith('/'); }
async function logicalRef(root, path, kind) { const info = await stat(path); return { kind, path: relative(root, path).split(sep).join('/'), byte_length: info.size, sha256: sha(await readFile(path)) }; }
async function treeDigest(root) { const entries = []; async function walk(directory, prefix = '') { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); const logical = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) await walk(path, logical); else { await exactRegular(path, 'Storage entry'); entries.push({ path: logical, sha256: sha(await readFile(path)) }); } } } await walk(root); return shaJcs(entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))); }
async function javaMajor(java, dependencies) { if (dependencies.javaMajor) return await dependencies.javaMajor(java); const output = await runCommand(java, ['-version'], { env: controlledEnv(java) }); return Number(/version\s+"?(\d+)/.exec(`${output.stdout ?? ''}${output.stderr ?? ''}`)?.[1]); }
function controlledEnv(java) { return { JAVA_HOME: dirname(dirname(java)), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' }; }
async function runCommand(command, args, options = {}) { return await new Promise((resolveResult, rejectResult) => execFile(command, args, options, (error, stdout, stderr) => error ? rejectResult(error) : resolveResult({ code: 0, stdout, stderr }))); }
async function waitClose(child, timeout) { return await Promise.race([new Promise(resolveClose => child.once('close', (code, signal) => resolveClose({ code, signal }))), delay(timeout).then(() => null)]); }
async function portClosed(port) { return await new Promise(resolveClosed => { const socket = connect({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolveClosed(false); }); socket.once('error', () => resolveClosed(true)); socket.setTimeout(1000, () => { socket.destroy(); resolveClosed(false); }); }); }
async function atomicWrite(path, content) { const temporary = `${path}.tmp`; await writeFile(temporary, content, { flag: 'wx' }); await rename(temporary, path); }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function requireSchema(validator, value, message) { if (!validator(value)) failure(message, 4); }
function isRef(value, kind) { return isPlainObject(value) && Object.keys(value).length === 4 && (kind === undefined || value.kind === kind) && typeof value.path === 'string' && Number.isSafeInteger(value.byte_length) && value.byte_length > 0 && isDigest(value.sha256); }
function isDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function shaJcs(value) { return sha(Buffer.from(canonicalizeJcs(value), 'utf8')); }
function sameJcs(left, right) { return shaJcs(left) === shaJcs(right); }
function without(value, key) { const { [key]: ignored, ...rest } = value; return rest; }
function delay(value) { return new Promise(resolveDelay => setTimeout(resolveDelay, value)); }
function failure(message, exitCode) { const error = new Error(message); error.code = exitCode === 2 ? 'GOLDEN_FAMILY_CAPTURE_INPUT_INVALID' : exitCode === 3 ? 'GOLDEN_FAMILY_CAPTURE_FAILED' : 'GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR'; error.exitCode = exitCode; throw error; }
function input(message) { failure(message, 2); }
const COPYFILE_EXCL = 1;
