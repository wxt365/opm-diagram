import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const schemas = Object.fromEntries(await Promise.all(['manifest', 'samples', 'report'].map(async kind => [kind, JSON.parse(await readFile(resolve(root, `docs/contracts/schemas/opm-dev-canvas-06-performance-${kind}.schema.json`), 'utf8'))])));
const validators = Object.fromEntries(Object.entries(schemas).map(([kind, schema]) => [kind, new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema)]));

test('Performance Manifest Schema accepts the frozen 4 fixture and 7 scenario catalog', () => assert.equal(validators.manifest(manifest()), true, JSON.stringify(validators.manifest.errors)));
test('Performance Manifest Schema rejects a duplicate fixed scenario ID', () => {
  const invalid = manifest(); invalid.scenario_catalog[6].scenario_id = invalid.scenario_catalog[0].scenario_id;
  assert.equal(validators.manifest(invalid), false);
});
test('Performance Samples Schema accepts monotonic raw samples and rejects an invalid sample status', () => {
  assert.equal(validators.samples(samples()), true, JSON.stringify(validators.samples.errors));
  const invalid = samples(); invalid.series[0].measured_samples[0].status = 'SKIPPED';
  assert.equal(validators.samples(invalid), false);
});
test('Performance Report Schema accepts the fixed READY aggregate', () => assert.equal(validators.report(report()), true, JSON.stringify(validators.report.errors)));
test('Performance Report Schema rejects incomplete READY counts and unknown stable failure codes', () => {
  const incomplete = report(); incomplete.summary.baseline_frame_sample_count = 899;
  assert.equal(validators.report(incomplete), false);
  const invalidCode = report(); invalidCode.report_status = 'BLOCKED'; invalidCode.failures = [{ code: 'PERF_UNKNOWN', evidence_refs: [ref('EVIDENCE')], message_key: 'PERF_UNKNOWN' }];
  assert.equal(validators.report(invalidCode), false);
});

function manifest() {
  const fixtures = ['PERF-FIXTURE-SMALL', 'PERF-FIXTURE-OPD-300-600', 'PERF-FIXTURE-OPD-1000-2000', 'PERF-FIXTURE-MODEL-10000'];
  return { schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.performance.aaaaaaaaaaaa.bbbbbbbbbbbb', manifest_version: '0.1.0', generated_at: stamp(), generator_identity: identity(), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(), environment_policy: { minimum_logical_cpu_count: 8, minimum_ram_bytes: 17179869184, ssd_required: true, browser_engine: 'chromium', headful: true, hardware_acceleration: true, viewport: { width: 1440, height: 900 }, device_scale_factor: 1, locale: 'zh-CN', timezone: 'Asia/Shanghai', hmr_enabled: false, devtools_enabled: false, throttling_enabled: false }, statistic_policy: { unit: 'MICROSECONDS', percentile_method: 'NEAREST_RANK', p50_rank: 'ceil(0.50*N)-1', p95_rank: 'ceil(0.95*N)-1', outlier_removal: false, retry_allowed: false }, fixture_catalog: fixtures.map((fixture_id, index) => fixture(fixture_id, index)), scenario_catalog: scenarioIds().map((scenario_id, index) => scenario(scenario_id, fixtures[Math.min(index, 3)])), summary: { fixture_count: 4, scenario_count: 7, metric_count: 11, raw_sample_set_count: 7, required_non_frame_measured_sample_count: 615, minimum_baseline_frame_sample_count: 900, minimum_stress_frame_sample_count: 600, minimum_total_measured_sample_count: 2115 } };
}

function samples() { return { schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-SAMPLES-001', schema_version: '0.1', sample_set_id: 'dev-canvas-06.performance-samples.aaaaaaaaaaaa', generated_at: stamp(), manifest_ref: ref('PERFORMANCE_MANIFEST'), scenario_id: 'PERF-CANVAS-001.EDIT_FEEDBACK', fixture_ref: ref('PERFORMANCE_FIXTURE'), environment_fingerprint: digest('environment'), series: [{ metric_id: 'EDIT_TOOL_SWITCH_US', timing_domain: 'BROWSER_PERFORMANCE', unit: 'MICROSECONDS', measurement_method: 'RAF_VISIBLE', required_warmup_count: 5, observed_warmup_count: 5, required_measured_count: 1, observed_measured_count: 1, warmup_samples: [sample(1)], measured_samples: [sample(1)], series_digest: digest('series') }], integrity: { status: 'MATCHED', series_count: 1, sample_count: 2, ordinal_contiguous: true, duplicate_count: 0, missing_count: 0, ordered_samples_sha256: digest('ordered') } }; }

function report() {
  const metric = { metric_id: 'EDIT_TOOL_SWITCH_US', observed_measured_count: 1, p50_us: 1, p95_us: 1, max_us: 1, threshold_status: 'PASS_MATCHED' };
  const scenario_results = scenarioIds().map((scenario_id, index) => ({ scenario_id, fixture_id: `fixture.${index}`, raw_sample_ref: ref('RAW_SAMPLE'), metric_results: [metric], functional_check_results: [{ check_id: 'functional.001', status: 'PASS_MATCHED' }], failed_sample_count: 0, timeout_count: 0, oom_count: 0, status: 'PASS_MATCHED', evidence_refs: [ref('EVIDENCE')] }));
  return { schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.performance-report.aaaaaaaaaaaa.bbbbbbbbbbbb', generated_at: stamp(), runner_identity: identity(), manifest_ref: ref('PERFORMANCE_MANIFEST'), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(), environment: { valid: true, logical_cpu_count: 8, ram_bytes: 17179869184, ssd: true, browser_engine: 'chromium', browser_version: '143.0.7499.4', java_version: '21.0.7', node_version: '22.0.0', locale: 'zh-CN', timezone: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, device_scale_factor: 1, hmr_enabled: false, devtools_enabled: false, throttling_enabled: false, external_interference: false }, environment_fingerprint: digest('environment'), report_status: 'READY_FOR_ENABLEMENT_EVALUATION', summary: { fixture_count: 4, scenario_count: 7, metric_count: 11, raw_sample_set_count: 7, non_frame_measured_sample_count: 615, baseline_frame_sample_count: 900, stress_frame_sample_count: 600, total_measured_sample_count: 2115, failed_sample_count: 0, timeout_count: 0, oom_count: 0, sample_integrity_failure_count: 0, functional_failure_count: 0, result_incomplete_count: 0, external_interference_count: 0, skipped_count: 0, retry_count: 0 }, fixture_results: Array.from({ length: 4 }, (_, index) => ({ fixture_id: `fixture.${index}`, source_fixture_ref: ref('PERFORMANCE_FIXTURE'), before_digest: digest(`before${index}`), after_digest: digest(`after${index}`), counts_status: 'MATCHED', result_status: 'MATCHED', evidence_refs: [ref('EVIDENCE')] })), scenario_results, raw_sample_refs: Array.from({ length: 7 }, () => ref('RAW_SAMPLE')), failures: [], limitations: [] };
}

function fixture(fixture_id, index) { return { fixture_id, generator_id: 'performance-factory', generator_version: '0.1', seed: 'canvas06-performance-v1', fixed_clock: stamp(), source_revision_ref: ref('REVISION'), context_count: 1, semantic_construct_count: index === 3 ? 10000 : 1, fact_count: index === 3 ? 20000 : 1, projection_junction_count: 0, cell_count: 1, capability_counts: { total: 34 }, asset_binding: { binding_digest: digest('binding') }, artifact_refs: [ref('FIXTURE_ARTIFACT')], fixture_digest: digest(fixture_id), expected_result_digests: { projection: digest(`projection${index}`) } }; }
function scenario(scenario_id, fixture_id) { return { scenario_id, fixture_id, sample_set_path: `performance/raw/${scenario_id}.samples.json`, ordered_metrics: [{ metric_id: 'EDIT_TOOL_SWITCH_US', timing_domain: 'BROWSER_PERFORMANCE', unit: 'MICROSECONDS', measurement_method: 'RAF_VISIBLE', required_warmup_count: 5, required_measured_count: 100, threshold_policy: { statistic: 'P95', operator: 'LTE', limit_us: 100000 } }], functional_check_ids: ['functional.001'], timeout_policy: { limit_us: 30000000 } }; }
function sample(ordinal) { return { ordinal, status: 'SUCCEEDED', started_at_monotonic_us: 1, ended_at_monotonic_us: 2, duration_us: 1 }; }
function scenarioIds() { return ['PERF-CANVAS-001.EDIT_FEEDBACK', 'PERF-CANVAS-002.INCREMENTAL_OPL', 'PERF-CANVAS-003.BASELINE_OPD', 'PERF-CANVAS-004.STRESS_OPD', 'PERF-CANVAS-005.LARGE_MODEL_SAVE', 'PERF-CANVAS-006.LARGE_MODEL_SNAPSHOT', 'PERF-CANVAS-007.LARGE_MODEL_VALIDATE']; }
function sourceBuild() { return { source_commit: 'a'.repeat(40), dirty_before_build: false, build_command: 'npm run build', node_version: '22.0.0', lockfile_sha256: digest('lock'), web_dist: ref('WEB_DIST'), local_runtime_jar: ref('LOCAL_RUNTIME_JAR') }; }
function identity() { return { runner_version: '0.1.0', source_commit: 'b'.repeat(40), node_version: '22.0.0', os: 'darwin', command: 'release:canvas06:performance', runner_source_sha256: digest('runner') }; }
function ref(kind) { return { kind, path: `performance/${kind.toLowerCase()}.json`, byte_length: 1, sha256: digest(kind) }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function stamp() { return '2026-08-02T00:00:00.000Z'; }
