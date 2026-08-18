import assert from 'node:assert/strict';
import test from 'node:test';

import { composeE2eManifest, manifestBytes } from './canvas06-e2e-manifest-v01-compose.mjs';

test('composes the frozen 194/388 E2E Manifest 0.1 shape', () => {
  const manifest = composeE2eManifest(input());
  assert.equal(manifest.manifest_id, 'dev-canvas-06.e2e.aaaaaaaaaaaa.abcdef012345');
  assert.equal(manifest.cases.length, 194);
  assert.equal(manifest.summary.attempt_count, 388);
  assert.equal(manifestBytes(manifest).endsWith('\n'), true);
});

function input() {
  const family = Array.from({ length: 178 }, (_, index) => familyCase(index));
  const common = Array.from({ length: 16 }, (_, index) => commonCase(index));
  return {
    source_date_epoch: '1782864000', node_version: 'v22.22.0', playwright_version: '1.57.0', chromium_version: '143.0.0', os: 'darwin-arm64', command: 'release:canvas06:e2e:manifest', runner_source_sha256: digest('runner'),
    intake_report_ref: ref('INTAKE_REPORT', 'inputs/raw/intake/dev-canvas-06-intake-report.json', 'intake'), handoff_ref: ref('HANDOFF', 'inputs/raw/handoff/dev-canvas-05-handoff.json', 'handoff'),
    upstream_source_build: { source_commit: sha40(), dirty_before_build: false, evidence_output_root: 'reports', java_version: '21', node_version: 'v22.22.0', os: 'darwin-arm64', build_command: 'handoff', lockfile_sha256: digest('lock'), pom_sha256: digest('pom') },
    source_build: { source_commit: sha40(), dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build', node_version: 'v22.22.0', lockfile_sha256: digest('lock'), web_dist: ref('WEB_DIST_TREE', 'inputs/build/web-dist', 'web'), local_runtime_jar: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar', 'jar') },
    upstream_input_refs: ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map((kind, index) => ({ input_kind: kind, ref: index === 4 ? ref('EVIDENCE_BUNDLE', 'inputs/raw/release/dev-canvas-05-evidence-bundle.jar', 'archive') : archiveRef(`entry-${index}.json`) })),
    input_materialization: { bundle_ref: ref('EVIDENCE_BUNDLE', 'inputs/raw/release/dev-canvas-05-evidence-bundle.jar', 'archive'), java_version: '21', entry_allowlist: ['entry-0.json'], materialized_count: 1, aggregate_sha256: digest('aggregate'), temporary_directory_cleaned: true },
    common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'inputs/common/dev-canvas-06-common-fixture-catalog.json', 'catalog'), fixture_refs: [archiveRef('fixture.json')],
    driver_catalog: ['DRIVER-PROCEDURAL', 'DRIVER-CONTROL', 'DRIVER-STRUCTURAL'].map(id => ({ driver_id: id, source_ref: ref('DRIVER_SOURCE', `inputs/drivers/${id}.mjs`, id) })), cases: [...family, ...common]
  };
}

function familyCase(index) { const expectation = index < 130 ? 'PASS' : 'BLOCKED'; return { case_id: `FAMILY-${index}`, suite_id: 'E2E-CANVAS-002', capability_id: 'CAP-ISO-PROC-001', coverage_key: `coverage-${index}`, expectation, viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref: archiveRef(`fixture-${index}.json`), input_ref: archiveRef(`input-${index}.json`), driver_id: 'DRIVER-PROCEDURAL', expected_transaction: transaction(), assertion_ids: ['ASSERT'] }; }
function commonCase(index) { return { case_id: `E2E-CANVAS-001.COMMON-${index}`, suite_id: 'E2E-CANVAS-001', expectation: 'PASS', viewport_id: 'VP-1440X900', zoom_id: 'Z-100', fixture_ref: ref('FIXTURE', `common/${index}.base.json`, `b${index}`), input_ref: ref('INPUT', `common/${index}.input.json`, `i${index}`), driver_id: 'DRIVER-COMMON', expected_transaction: transaction(), assertion_ids: ['ASSERT'] }; }
function archiveRef(path) { return { path: `inputs/upstream/${path}`, byte_length: 1, sha256: digest(path), bundle_sha256: digest('archive'), archive_entry_path: path }; }
function ref(kind, path, value) { return { kind, path, byte_length: 1, sha256: digest(value) }; }
function transaction() { return { revision_delta: 1, revision_parent_delta: 1, text_artifact_delta: 1, text_trace_delta: 1, finding_delta: 0, operation_delta: 1, receipt_delta: 1, draft_head_changed: true }; }
function digest() { return `abcdef012345${'0'.repeat(52)}`; }
function sha40() { return 'a'.repeat(40); }
