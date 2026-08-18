import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { jcs, sha } from './verify-canvas06-performance.mjs';

const root = resolve('.');
const runner = resolve('scripts/verify-canvas06-performance.mjs');
const stamp = '2026-08-03T00:00:00.000Z';
const fixtures = ['PERF-FIXTURE-SMALL', 'PERF-FIXTURE-OPD-300-600', 'PERF-FIXTURE-OPD-1000-2000', 'PERF-FIXTURE-MODEL-10000'];
const scenarios = [
  ['PERF-CANVAS-001.EDIT_FEEDBACK', 'PERF-FIXTURE-SMALL', [['EDIT_TOOL_SWITCH_US', 'BROWSER_PERFORMANCE', 5, 100, 100000], ['EDIT_SELECTION_US', 'BROWSER_PERFORMANCE', 5, 100, 100000], ['EDIT_INSPECTOR_FEEDBACK_US', 'BROWSER_PERFORMANCE', 5, 100, 100000]]],
  ['PERF-CANVAS-002.INCREMENTAL_OPL', 'PERF-FIXTURE-SMALL', [['INCREMENTAL_OPL_VISIBLE_US', 'BROWSER_PERFORMANCE', 8, 100, 500000]]],
  ['PERF-CANVAS-003.BASELINE_OPD', 'PERF-FIXTURE-OPD-300-600', [['PAN_ZOOM_FRAME_US', 'BROWSER_RAF', 2, 900, 32000, true], ['SELECTION_FEEDBACK_US', 'BROWSER_PERFORMANCE', 5, 100, 100000]]],
  ['PERF-CANVAS-004.STRESS_OPD', 'PERF-FIXTURE-OPD-1000-2000', [['PAN_ZOOM_FRAME_US', 'BROWSER_RAF', 2, 600, 50000, true], ['SELECTION_FEEDBACK_US', 'BROWSER_PERFORMANCE', 5, 100, 200000]]],
  ['PERF-CANVAS-005.LARGE_MODEL_SAVE', 'PERF-FIXTURE-MODEL-10000', [['LARGE_MODEL_SAVE_US', 'NODE_HRTIME', 0, 5, 10000000]]],
  ['PERF-CANVAS-006.LARGE_MODEL_SNAPSHOT', 'PERF-FIXTURE-MODEL-10000', [['LARGE_MODEL_SNAPSHOT_US', 'NODE_HRTIME', 0, 5, 15000000]]],
  ['PERF-CANVAS-007.LARGE_MODEL_VALIDATE', 'PERF-FIXTURE-MODEL-10000', [['LARGE_MODEL_VALIDATE_US', 'NODE_HRTIME', 0, 5, 60000000]]]
];

test('READY evidence is accepted only after raw samples are recomputed', async () => {
  const fixture = await prepare();
  try { const result = run(fixture); assert.equal(result.status, 0, result.stderr); } finally { await cleanup(fixture); }
});

test('raw SHA tampering is rejected before report statistics are trusted', async () => {
  const fixture = await prepare();
  try {
    const raw = resolve(fixture.root, 'performance/raw/PERF-CANVAS-001.EDIT_FEEDBACK.samples.json');
    const value = JSON.parse(await readFile(raw, 'utf8')); value.series[0].measured_samples[0].duration_us += 1;
    await writeFile(raw, JSON.stringify(value));
    assert.equal(run(fixture).status, 2);
  } finally { await cleanup(fixture); }
});

test('schema-valid P95 tampering is rejected by nearest-rank recomputation', async () => {
  const fixture = await prepare();
  try {
    const report = await json(fixture.report); report.scenario_results[0].metric_results[0].p95_us += 1;
    await writeFile(fixture.report, JSON.stringify(report));
    assert.equal(run(fixture).status, 2);
  } finally { await cleanup(fixture); }
});

test('a legal BLOCKED report is inspectable but fails require-ready', async () => {
  const fixture = await prepare();
  try {
    const report = await json(fixture.report); report.report_status = 'BLOCKED'; report.failures = [{ code: 'PERF_RUNTIME_ERROR', evidence_refs: [await ref(fixture.root, resolve(fixture.root, 'evidence.json'), 'EVIDENCE')], message_key: 'PERF_RUNTIME_ERROR' }];
    await writeFile(fixture.report, JSON.stringify(report));
    const inspect = run(fixture); assert.equal(inspect.status, 0, inspect.stderr);
    const requireReady = run(fixture, true); assert.equal(requireReady.status, 3, requireReady.stderr);
  } finally { await cleanup(fixture); }
});

async function prepare() {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-performance-'));
  const evidenceRoot = resolve(directory, 'evidence');
  await mkdir(evidenceRoot, { recursive: true });
  const evidence = await write(evidenceRoot, 'evidence.json', { value: 'evidence' });
  const handoff = await write(evidenceRoot, 'handoff.json', { value: 'handoff' });
  const intake = await write(evidenceRoot, 'intake.json', { intake_status: 'READY_FOR_RELEASE_VALIDATION' });
  const buildWeb = await write(evidenceRoot, 'build/web.json', { value: 'web' });
  const buildJar = await write(evidenceRoot, 'build/runtime.jar', { value: 'jar' });
  const fixtureRefs = new Map();
  for (const fixtureId of fixtures) fixtureRefs.set(fixtureId, await write(evidenceRoot, `fixtures/${fixtureId}.json`, { fixtureId }));
  const manifest = manifestValue({ handoff, intake, buildWeb, buildJar, fixtureRefs });
  const manifestPath = resolve(evidenceRoot, 'performance/manifest.json');
  await writeFileWithParents(manifestPath, JSON.stringify(manifest));
  const manifestRef = await ref(evidenceRoot, manifestPath, 'PERFORMANCE_MANIFEST');
  const raw = [];
  for (const scenario of scenarios) {
    const samples = samplesValue(scenario, manifestRef, fixtureRefs.get(scenario[1]));
    const path = resolve(evidenceRoot, `performance/raw/${scenario[0]}.samples.json`);
    await writeFileWithParents(path, JSON.stringify(samples));
    raw.push(await ref(evidenceRoot, path, 'RAW_SAMPLE'));
  }
  const report = reportValue({ handoff, intake, manifestRef, buildWeb, buildJar, fixtureRefs, raw, evidence });
  const reportPath = resolve(evidenceRoot, 'performance/report.json');
  await writeFileWithParents(reportPath, JSON.stringify(report));
  return { directory, root: evidenceRoot, report: reportPath };
}

function manifestValue({ handoff, intake, buildWeb, buildJar, fixtureRefs }) {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.performance.aaaaaaaaaaaa.bbbbbbbbbbbb', manifest_version: '0.1.0', generated_at: stamp,
    generator_identity: identity('generator'), handoff_ref: handoff, intake_report_ref: intake, upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(buildWeb, buildJar),
    environment_policy: policy(), statistic_policy: { unit: 'MICROSECONDS', percentile_method: 'NEAREST_RANK', p50_rank: 'ceil(0.50*N)-1', p95_rank: 'ceil(0.95*N)-1', outlier_removal: false, retry_allowed: false },
    fixture_catalog: fixtures.map((fixtureId, index) => {
      const fixtureRef = fixtureRefs.get(fixtureId);
      return {
        fixture_id: fixtureId, generator_id: 'factory', generator_version: '0.1', seed: 'canvas06-performance-v1', fixed_clock: stamp,
        source_revision_ref: fixtureRef, context_count: 1, semantic_construct_count: index === 3 ? 10000 : 1,
        fact_count: index === 3 ? 20000 : 1, projection_junction_count: 0, cell_count: 1,
        capability_counts: { total: 34 }, asset_binding: { binding: digest('binding') }, artifact_refs: [fixtureRef],
        fixture_digest: fixtureRef.sha256, expected_result_digests: { projection: digest(fixtureId) }
      };
    }),
    scenario_catalog: scenarios.map(([scenarioId, fixtureId, metrics]) => ({ scenario_id: scenarioId, fixture_id: fixtureId, sample_set_path: `performance/raw/${scenarioId}.samples.json`, ordered_metrics: metrics.map(metric), functional_check_ids: [`functional.${scenarioId}`], timeout_policy: { limit_us: 30000000 } })),
    summary: { fixture_count: 4, scenario_count: 7, metric_count: 11, raw_sample_set_count: 7, required_non_frame_measured_sample_count: 615, minimum_baseline_frame_sample_count: 900, minimum_stress_frame_sample_count: 600, minimum_total_measured_sample_count: 2115 }
  };
}

function samplesValue([scenarioId, fixtureId, metrics], manifestRef, fixtureRef) {
  let ordinal = 1;
  const series = metrics.map(definition => {
    const descriptor = metric(definition);
    const warmup = Array.from({ length: descriptor.required_warmup_count }, () => sample(ordinal++));
    const measured = Array.from({ length: definition[3] }, () => sample(ordinal++));
    const { threshold_policy, minimum_measured_count, ...seriesPolicy } = descriptor;
    const value = { ...seriesPolicy, observed_warmup_count: warmup.length, observed_measured_count: measured.length, warmup_samples: warmup, measured_samples: measured };
    if (descriptor.required_measured_duration_us) value.observed_measured_duration_us = measured.reduce((sum, item) => sum + item.duration_us, 0);
    value.series_digest = sha(jcs(value));
    return value;
  });
  return { schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-SAMPLES-001', schema_version: '0.1', sample_set_id: `dev-canvas-06.performance-samples.${digest(scenarioId).slice(0, 12)}`, generated_at: stamp, manifest_ref: manifestRef, scenario_id: scenarioId, fixture_ref: fixtureRef, environment_fingerprint: digest('environment'), series, integrity: { status: 'MATCHED', series_count: series.length, sample_count: ordinal - 1, ordinal_contiguous: true, duplicate_count: 0, missing_count: 0, ordered_samples_sha256: sha(jcs(series.map(item => ({ metric_id: item.metric_id, warmup_samples: item.warmup_samples, measured_samples: item.measured_samples })))) } };
}

function reportValue({ handoff, intake, manifestRef, buildWeb, buildJar, fixtureRefs, raw, evidence }) {
  const scenarioResults = scenarios.map(([scenarioId, fixtureId, definitions], index) => ({ scenario_id: scenarioId, fixture_id: fixtureId, raw_sample_ref: raw[index], metric_results: definitions.map(definition => ({ metric_id: definition[0], observed_measured_count: definition[3], p50_us: 10, p95_us: 10, max_us: 10, threshold_status: 'PASS_MATCHED', ...(definition[5] ? { observed_measured_duration_us: definition[3] * 10 } : {}) })), functional_check_results: [{ check_id: `functional.${scenarioId}`, status: 'PASS_MATCHED' }], failed_sample_count: 0, timeout_count: 0, oom_count: 0, status: 'PASS_MATCHED', evidence_refs: [evidence] }));
  return {
    schema_id: 'OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.performance-report.aaaaaaaaaaaa.bbbbbbbbbbbb', generated_at: stamp, runner_identity: identity('runner'), manifest_ref: manifestRef, handoff_ref: handoff, intake_report_ref: intake, upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(buildWeb, buildJar),
    environment: { valid: true, logical_cpu_count: 8, ram_bytes: 17179869184, ssd: true, browser_engine: 'chromium', browser_version: '143.0.7499.4', java_version: '21', node_version: '22', locale: 'zh-CN', timezone: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, device_scale_factor: 1, hmr_enabled: false, devtools_enabled: false, throttling_enabled: false, external_interference: false }, environment_fingerprint: digest('environment'), report_status: 'READY_FOR_ENABLEMENT_EVALUATION',
    summary: { fixture_count: 4, scenario_count: 7, metric_count: 11, raw_sample_set_count: 7, non_frame_measured_sample_count: 615, baseline_frame_sample_count: 900, stress_frame_sample_count: 600, total_measured_sample_count: 2115, failed_sample_count: 0, timeout_count: 0, oom_count: 0, sample_integrity_failure_count: 0, functional_failure_count: 0, result_incomplete_count: 0, external_interference_count: 0, skipped_count: 0, retry_count: 0 },
    fixture_results: fixtures.map(fixtureId => ({ fixture_id: fixtureId, source_fixture_ref: fixtureRefs.get(fixtureId), before_digest: fixtureRefs.get(fixtureId).sha256, after_digest: fixtureRefs.get(fixtureId).sha256, counts_status: 'MATCHED', result_status: 'MATCHED', evidence_refs: [evidence] })), scenario_results: scenarioResults, raw_sample_refs: raw, failures: [], limitations: ['Cold start is outside this Gate.']
  };
}

function metric([metric_id, timing_domain, warmup, measured, limit, duration]) { return { metric_id, timing_domain, unit: 'MICROSECONDS', measurement_method: timing_domain === 'NODE_HRTIME' ? 'LOOPBACK' : 'RAF_VISIBLE', required_warmup_count: warmup, ...(duration ? { required_measured_duration_us: measured * 10, minimum_measured_count: measured } : { required_measured_count: measured }), threshold_policy: { statistic: 'P95', operator: 'LTE', limit_us: limit } }; }
function sample(ordinal) { return { ordinal, status: 'SUCCEEDED', started_at_monotonic_us: ordinal * 10, ended_at_monotonic_us: ordinal * 10 + 10, duration_us: 10 }; }
function sourceBuild(web_dist, local_runtime_jar) { return { source_commit: 'a'.repeat(40), dirty_before_build: false, build_command: 'npm run build', node_version: '22', lockfile_sha256: digest('lockfile'), web_dist, local_runtime_jar }; }
function policy() { return { minimum_logical_cpu_count: 8, minimum_ram_bytes: 17179869184, ssd_required: true, browser_engine: 'chromium', headful: true, hardware_acceleration: true, viewport: { width: 1440, height: 900 }, device_scale_factor: 1, locale: 'zh-CN', timezone: 'Asia/Shanghai', hmr_enabled: false, devtools_enabled: false, throttling_enabled: false }; }
function identity(command) { return { runner_version: '0.1.0', source_commit: 'b'.repeat(40), node_version: '22', os: 'test', command, runner_source_sha256: digest(command) }; }
async function write(rootPath, path, value) { const absolute = resolve(rootPath, path); await writeFileWithParents(absolute, JSON.stringify(value)); return ref(rootPath, absolute, path.endsWith('.jar') ? 'LOCAL_RUNTIME_JAR' : 'EVIDENCE'); }
async function writeFileWithParents(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, value); }
async function ref(rootPath, path, kind) { const bytes = await readFile(path); const info = await stat(path); return { kind, path: path.slice(rootPath.length + 1), byte_length: info.size, sha256: sha(bytes) }; }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function run(fixture, requireReady = false) { return spawnSync(process.execPath, [runner, '--evidence-root', fixture.root, '--report', 'performance/report.json', ...(requireReady ? ['--require-ready'] : [])], { cwd: root, encoding: 'utf8' }); }
async function cleanup(fixture) { await rm(fixture.directory, { recursive: true, force: true }); }
function digest(value) { return sha(value); }
