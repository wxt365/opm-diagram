import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createFamilyCaptureCallback, runFamilyGoldenCaptureAdapter } from './canvas06-golden-family-capture-adapter.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

test('Family Adapter 缺失 callback 时在创建工作根前拒绝', async () => {
  await assert.rejects(() => runFamilyGoldenCaptureAdapter({}), error => error.code === 'GOLDEN_FAMILY_CAPTURE_INPUT_INVALID' && error.exitCode === 2);
});

test('Bundle entry 预检失败时零 attempt root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opm-family-adapter-'));
  const planPath = join(root, 'plan.json'); const bundle = join(root, 'bundle.zip'); const runtime = join(root, 'runtime.jar');
  const java = join(root, 'jdk', 'bin', 'java'); const jar = join(root, 'jdk', 'bin', 'jar'); const assets = join(root, 'assets'); const web = join(root, 'web'); const materialization = join(root, 'materialization'); const work = join(root, 'work');
  await mkdir(resolve(java, '..'), { recursive: true }); await mkdir(assets); await mkdir(web); await mkdir(materialization); await writeFile(join(web, 'index.html'), 'ok');
  await Promise.all([writeFile(bundle, 'bundle'), writeFile(runtime, 'runtime'), writeFile(java, 'java'), writeFile(jar, 'jar')]);
  const plan = { plan_status: 'READY_FOR_AUTHORING', source_date_epoch: 1, web_dist_tree_sha256: digest('web'), input_materialization: { bundle_ref: ref('EVIDENCE_BUNDLE', 'bundle.zip', await bytes(bundle)), entry_allowlist: ['fixtures/a.json'] }, captures: Array.from({ length: 1170 }, (_, index) => capture(index)) };
  await writeFile(planPath, JSON.stringify(plan));
  const planRef = ref('CAPTURE_PLAN', planPath, await bytes(planPath));
  const runtimeRef = ref('LOCAL_RUNTIME_JAR', runtime, await bytes(runtime));
  const javaRef = ref('JAVA_EXECUTABLE', java, await bytes(java));
  await assert.rejects(() => runFamilyGoldenCaptureAdapter({
    plan, plan_ref: planRef, materialization: { root: materialization, report_refs: Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), report_ref: ref('MATERIALIZATION_REPORT', `materialization/reports/${key(index)}.json`, Buffer.from('r')) })) },
    runtime_jar: { path: runtime, ref: runtimeRef }, profile_assets: { root: assets, refs: [], tree_sha256: digest('assets') }, web_dist: { root: web, tree_sha256: plan.web_dist_tree_sha256 }, java_executable: { path: java, ref: javaRef }, browser: {}, work_root: work, capture_callback: async () => { throw new Error('must not invoke'); },
    dependencies: { javaMajor: async () => 21, runCommand: async () => ({ code: 0, stdout: 'fixtures/a.json\nfixtures/a.json\n' }) }
  }), error => error.code === 'GOLDEN_FAMILY_CAPTURE_INPUT_INVALID' && error.exitCode === 2);
  await assert.rejects(() => lstat(join(work, 'attempts')), { code: 'ENOENT' });
});

test('Family Playwright callback 固定写入 PNG、Projection 与 Geometry artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opm-family-callback-')); const attempt = join(root, 'attempt');
  await mkdir(join(attempt, 'inputs'), { recursive: true });
  const projection = { constructs: [], suppressed_states: [] }; const geometry = [{ cell_id: 'target', x: 0, y: 0, width: 1, height: 1 }];
  const identity = { identity_payload_sha256: digest('identity') };
  await writeFile(join(attempt, 'inputs', 'family-capture-identity.json'), JSON.stringify(identity));
  const callback = createFamilyCaptureCallback({ browser_executable: join(root, 'chromium'), environment_policy: { launch_args: [], locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css' } }, chromium_factory: fakeChromium(projection, geometry) });
  const invocation = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-INVOCATION-001', schema_version: '0.1', invocation_version: '0.1.0', capture_ordinal: 0, capture_id: 'capture.1', attempt_ordinal: 1, family_capture_identity_ref: ref('FAMILY_CAPTURE_IDENTITY', 'inputs/family-capture-identity.json', await bytes(join(attempt, 'inputs', 'family-capture-identity.json'))), fixture_ref: ref('FIXTURE', 'fixture.json', Buffer.from('f')), clone_result_ref: ref('FAMILY_CLONE_RESULT', 'clone-result.json', Buffer.from('c')), runtime_ready_ref: ref('FAMILY_RUNTIME_READY', 'runtime-ready.json', Buffer.from('r')), project_id: 'project.1', model_id: 'model.1', revision_id: 'revision.1', context_id: 'context.1', runtime_base_url: 'http://127.0.0.1:41001', web_base_url: 'http://127.0.0.1:41002', viewport_id: 'VP-1440X900', zoom_id: 'Z-100', expected_projection_sha256: digestJcs(projection), focus_target_id: 'target', focus_anchor: 'CENTER', expected_cells: 1, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], attempt_artifact_root: join(attempt, 'artifacts') };
  const result = await callback(Object.freeze(invocation));
  assert.equal(result.png_sha256, digest('png')); assert.equal(result.projection_sha256, digestJcs(projection)); assert.equal(result.cell_geometry_sha256, digestJcs(geometry));
  assert.equal(result.png_ref.path, 'artifacts/capture.png'); assert.equal(result.observed_cells, 1);
});

function capture(index) { const fixture = { path: `fixtures/${index % 130}.json`, byte_length: 1, sha256: digest(`fixture-${index % 130}`), bundle_sha256: digest('bundle'), archive_entry_path: `fixtures/${index % 130}.json` }; return { capture_kind: 'FAMILY', capture_id: `VIS-CANVAS.CAP-ISO-PROC-001.VP-1440X900.Z-100.${String(index).padStart(12, '0')}`, fixture_ref: fixture, expected_revision: 'revision.1', capability_id: 'CAP-ISO-PROC-001', viewport_id: 'VP-1440X900', zoom_id: 'Z-100', expected_projection_sha256: digest('projection'), focus_target_id: 'target', focus_anchor: 'CENTER', expected_cells: 1, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }] }; }
function key(index) { return digest(`fixture-${index}`); }
function ref(kind, path, value) { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); return { kind, path, byte_length: bytes.length, sha256: digest(bytes) }; }
async function bytes(path) { return await (await import('node:fs/promises')).readFile(path); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function digestJcs(value) { return digest(canonicalizeJcs(value)); }

function fakeChromium(projection, geometry) {
  return { async launch() { return { async newContext() { return { async newPage() { return fakePage(projection, geometry); }, async close() {} }; }, async close() {} }; } };
}
function fakePage(projection, geometry) {
  const simple = { async count() { return 1; }, async isVisible() { return true; }, async scrollIntoViewIfNeeded() {}, async textContent() { return '100%'; }, async click() {} };
  return { async goto() {}, getByTestId() { return simple; }, locator(selector) { return selector === '[data-opm-capture-cell-id]' ? { async evaluateAll() { return geometry; } } : simple; }, async evaluate(_fn, arg) { return arg ? projection : undefined; }, async waitForTimeout() {}, async screenshot({ path }) { await writeFile(path, 'png'); }, async close() {} };
}
