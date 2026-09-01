import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { assembleVisualManifest, parseVisualManifestOptions, VisualManifestError } from './canvas06-visual-manifest-v02-input.mjs';

const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-06-visual-manifest-v02.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

test('Visual Manifest 0.2 从批准 Plan 精确组装 378 case 和 1242 capture', () => {
  const manifest = assembleVisualManifest({ inputs: inputs(), runnerIdentity: identity() });
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.equal(manifest.cases.length, 378);
  assert.equal(manifest.cases.filter(item => item.case_kind === 'CAPABILITY').length, 306);
  assert.equal(manifest.cases.filter(item => item.case_kind === 'COMMON').length, 72);
  assert.equal(manifest.cases.flatMap(item => item.variant_captures).length, 1242);
  assert.deepEqual(manifest.pixel_policy, { policy_id: 'VISUAL_PIXEL_DIFF', policy_version: '0.1' });
});

test('Visual Manifest 0.2 拒绝非唯一 CLI、模式混用和非固定输出名', () => {
  const common = ['--input-mode', 'CONTROLLED_TEST', '--source-root', '/source', '--runtime-jar', '/runtime.jar', '--web-dist', '/dist', '--approved-version-root', '/approved/versions/1.0.0', '--output-root', '/out', '--out', 'visual-manifest.json', '--controlled-bundle-root', '/bundle'];
  assert.equal(parseVisualManifestOptions(common).inputMode, 'CONTROLLED_TEST');
  assert.throws(() => parseVisualManifestOptions([...common, '--handoff-root', '/handoff']), VisualManifestError);
  assert.throws(() => parseVisualManifestOptions([...common.slice(0, -1), 'wrong.json']), VisualManifestError);
  assert.throws(() => parseVisualManifestOptions([...common, '--out', 'visual-manifest.json']), VisualManifestError);
});

test('Visual Manifest 0.2 缺失批准 PNG 或 case 数时拒绝组装', () => {
  const value = inputs();
  value.report.approved_assets.png_refs.pop();
  assert.throws(() => assembleVisualManifest({ inputs: value, runnerIdentity: identity() }), VisualManifestError);
  const wrong = inputs();
  wrong.plan.captures.pop();
  assert.throws(() => assembleVisualManifest({ inputs: wrong, runnerIdentity: identity() }), VisualManifestError);
});

function inputs() {
  const captures = [];
  for (let index = 0; index < 306; index += 1) {
    const count = index < 252 ? 4 : 3;
    for (let variant = 0; variant < count; variant += 1) captures.push(capture(`cap-${index}-${variant}`, `VIS-CANVAS.CAP-ISO-PROC-001.${index}`, 'FAMILY', 'CAP-ISO-PROC-001'));
  }
  for (let index = 0; index < 72; index += 1) captures.push(capture(`common-${index}`, `VIS-CANVAS.COMMON.STATE_ROLES.${index}`, 'COMMON', null));
  const png = captures.map(item => asset(item.capture_id, `captures/${item.capture_id}.png`));
  const blanks = ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => asset(`${viewport}.${zoom}`, `blank/${viewport}.${zoom}.png`)));
  const ref = (kind, path) => ({ kind, path, byte_length: 1, sha256: hash() });
  return {
    trust: { intake: ref('INTAKE_REPORT', 'handoff/intake.json'), handoff: ref('HANDOFF', 'handoff/handoff.json'), upstreamSourceBuild: { source_commit: 'a'.repeat(40), dirty_before_build: false, evidence_output_root: 'reports', java_version: '21.0.7', node_version: 'v22.22.0', os: 'darwin-arm64', build_command: 'npm run release', lockfile_sha256: hash(), pom_sha256: hash() } },
    report: { source_build: { source_commit: 'a'.repeat(40), build_command: 'npm ci --ignore-scripts && npm run build', node_full_version: 'v22.22.0', lockfile_sha256: hash() }, runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime.jar'), web_dist_tree_sha256: hash(), golden_set_version: '1.0.0', new_golden_set_sha256: hash(), fixture_materialization_set_sha256: hash(), fixture_database_set_sha256: hash(), approved_assets: { png_refs: png, blank_baseline_refs: blanks } },
    approval: {}, environment: {},
    plan: { generated_at: '2026-09-01T00:00:00.000Z', source_build: { source_commit: 'a'.repeat(40) }, upstream_input_refs: ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map(kind => ({ input_kind: kind, ref: ref(kind, `upstream/${kind}.json`) })), input_materialization: { bundle_ref: ref('EVIDENCE_BUNDLE', 'bundle.jar'), java_version: '21.0.7', entry_allowlist: ['fixture.json'], materialized_count: 130, aggregate_sha256: hash(), temporary_directory_cleaned: true }, common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'common/catalog.json'), environment_policy: { locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 }, capture_set_sha256: hash(), captures, blank_baselines: blanks.map(item => ({ baseline_id: item.logical_id, viewport_id: item.logical_id.split('.')[0], zoom_id: item.logical_id.split('.')[1] })) },
    refs: { authoring: ref('AUTHORING_REPORT', 'authoring-report.json'), approval: ref('APPROVAL_RECORD', 'approval-record.json'), environment: ref('GOLDEN_ENVIRONMENT', 'golden-environment.json'), plan: ref('CAPTURE_PLAN', 'capture-plan.json') }
  };
}

function capture(capture_id, case_id, kind, capability_id) { return { capture_id, case_id, capture_kind: kind, ...(capability_id ? { capability_id } : { subject_id: 'STATE_ROLES' }), visual_variant_key: capture_id, viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref: { kind: 'FIXTURE', path: `fixtures/${capture_id}.json`, byte_length: 1, sha256: hash() }, expected_revision: `revision-${capture_id}`, expected_projection_sha256: hash(), focus_target_id: 'fact.target', focus_anchor: 'TARGET', expected_cells: 3, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }] }; }
function identity() { return { runner_version: '0.2.0', source_commit: 'a'.repeat(40), node_version: 'v22.22.0', playwright_version: '1.57.0', chromium_version: '143.0.7499.4', os: 'darwin-arm64', command: 'test', runner_source_sha256: hash() }; }
function asset(logical_id, path) { return { logical_id, path, byte_length: 1, sha256: hash() }; }
function hash() { return '0'.repeat(64); }
