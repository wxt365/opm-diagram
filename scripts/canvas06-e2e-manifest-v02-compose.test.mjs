import assert from 'node:assert/strict';
import test from 'node:test';

import { composeE2eManifestV02, manifestBytes } from './canvas06-e2e-manifest-v02-compose.mjs';

test('活动 v0.2 组合四个 driver 与 130/48/7/9 聚合', () => {
  const manifest = composeE2eManifestV02(input());
  assert.equal(manifest.schema_version, '0.2');
  assert.equal(manifest.driver_catalog.length, 4);
  assert.equal(manifest.cases.length, 194);
  assert.equal(manifest.cases.filter(item => !item.capability_id && item.expectation === 'BLOCKED').length, 9);
  assert.equal(manifestBytes(manifest).endsWith('\n'), true);
});

function input() {
  const archive = ref('EVIDENCE_BUNDLE', 'inputs/trust/evidence-bundle.zip', 'archive');
  const family = Array.from({ length: 178 }, (_, index) => familyCase(index, archive.sha256));
  const common = Array.from({ length: 16 }, (_, index) => commonCase(index));
  const profileAssetRefs = [
    ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'], ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'], ['PROFILE_PACKAGE', 'profile.json'], ['RULE_SET', 'rules/representative-rule-set.json'], ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
  ].map(([kind, path]) => ref(kind, `inputs/upstream/profile-assets/${path}`, path));
  return {
    source_date_epoch: '1782864000', node_version: 'v22.22.0', playwright_version: '1.57.0', chromium_version: '1200', os: 'darwin-arm64', command: 'node scripts/release-canvas06-e2e-manifest-v02.mjs', runner_source_sha256: digest('runner'),
    intake_report_ref: ref('INTAKE_REPORT', 'inputs/trust/intake-report.json', 'intake'), handoff_ref: ref('HANDOFF', 'inputs/trust/handoff.json', 'handoff'),
    upstream_source_build: upstreamBuild(), source_build: sourceBuild(),
    upstream_input_refs: ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map((input_kind, index) => ({ input_kind, ref: index === 3 ? profileAssetRefs[4] : index === 4 ? archive : archiveRef(`input-${index}.json`, archive.sha256) })),
    input_materialization: { bundle_ref: archive, java_version: '21', entry_allowlist: ['one.json'], materialized_count: 1, aggregate_sha256: digest('aggregate'), temporary_directory_cleaned: true },
    common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'inputs/common/dev-canvas-06-common-fixture-catalog.json', 'catalog'), fixture_refs: [archiveRef('fixture.json', archive.sha256)],
    driver_catalog: [['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'], ['DRIVER-STRUCTURAL', 'structural-driver.mjs'], ['DRIVER-COMMON', 'common-driver.mjs']].map(([driver_id, file]) => ({ driver_id, source_ref: ref('E2E_DRIVER_SOURCE', `inputs/drivers/${file}`, file) })),
    cases: [...family, ...common], profile_asset_tree_ref: { kind: 'PROFILE_ASSET_TREE', path: 'inputs/upstream/profile-assets', byte_length: 5, sha256: digest('profile-tree') }, profile_asset_refs: profileAssetRefs
  };
}

function familyCase(index, bundle) { return caseRow(`FAMILY-${index}`, index < 130 ? 'PASS' : 'BLOCKED', 'DRIVER-PROCEDURAL', { capability_id: 'CAP-ISO-PROC-001', coverage_key: `coverage-${index}` }, archiveRef(`family-${index}.json`, bundle), archiveRef(`family-input-${index}.json`, bundle)); }
function commonCase(index) { return caseRow(`E2E-CANVAS-001.COMMON-${index}`, index < 7 ? 'PASS' : 'BLOCKED', 'DRIVER-COMMON', { suite_id: 'E2E-CANVAS-001' }, ref('FIXTURE', `inputs/common/${index}.base.json`, `base-${index}`), ref('INPUT', `inputs/common/${index}.input.json`, `input-${index}`)); }
function caseRow(case_id, expectation, driver_id, extra, fixture_ref, input_ref) { return { case_id, suite_id: extra.suite_id ?? 'E2E-CANVAS-002', ...extra, expectation, viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref, input_ref, driver_id, expected_transaction: { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 1, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true }, assertion_ids: ['ASSERT'] }; }
function upstreamBuild() { return { source_commit: 'a'.repeat(40), dirty_before_build: false, evidence_output_root: 'reports', java_version: '21', node_version: 'v22.22.0', os: 'darwin-arm64', build_command: 'handoff', lockfile_sha256: digest('lock'), pom_sha256: digest('pom') }; }
function sourceBuild() { return { source_commit: 'a'.repeat(40), dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build', node_version: 'v22.22.0', lockfile_sha256: digest('lock'), web_dist: ref('WEB_DIST_TREE', 'inputs/build/web-dist', 'web'), local_runtime_jar: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar', 'jar') }; }
function archiveRef(path, bundle_sha256) { return { path: `inputs/upstream/family/${path}`, byte_length: 1, sha256: digest(path), bundle_sha256, archive_entry_path: path }; }
function ref(kind, path, value) { return { kind, path, byte_length: 1, sha256: digest(value) }; }
function digest(value) { return `${String(value).replace(/[^a-f0-9]/g, 'a').slice(0, 12).padEnd(12, 'a')}${'0'.repeat(52)}`; }
