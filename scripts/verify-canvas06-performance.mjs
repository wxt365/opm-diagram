import { createHash } from 'node:crypto';
import { lstat, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const workspace = resolve('.');
const expectedFixtureIds = ['PERF-FIXTURE-SMALL', 'PERF-FIXTURE-OPD-300-600', 'PERF-FIXTURE-OPD-1000-2000', 'PERF-FIXTURE-MODEL-10000'];
const expectedScenarioIds = ['PERF-CANVAS-001.EDIT_FEEDBACK', 'PERF-CANVAS-002.INCREMENTAL_OPL', 'PERF-CANVAS-003.BASELINE_OPD', 'PERF-CANVAS-004.STRESS_OPD', 'PERF-CANVAS-005.LARGE_MODEL_SAVE', 'PERF-CANVAS-006.LARGE_MODEL_SNAPSHOT', 'PERF-CANVAS-007.LARGE_MODEL_VALIDATE'];

if (isEntrypoint()) {
  try {
    await main();
  } catch (error) {
    console.error(error.code ?? 'PERF_RUNTIME_ERROR');
    if (error.message && error.message !== error.code) console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const evidenceRoot = await safeEvidenceRoot(required(options, 'evidence-root'));
  const reportPath = resolveInside(evidenceRoot, required(options, 'report'));
  const report = await readJson(reportPath, 'PERF_INPUT_INVALID');
  const validators = await loadValidators();
  validate(validators.report, report, 'Performance Report');
  await verifyAllReferences(evidenceRoot, report);

  const reportRef = await fileRef(evidenceRoot, reportPath, 'PERFORMANCE_REPORT');
  const manifest = await readReferencedJson(evidenceRoot, report.manifest_ref, 'PERF_INPUT_INVALID');
  validate(validators.manifest, manifest, 'Performance Manifest');
  await verifyAllReferences(evidenceRoot, manifest);
  verifyCatalog(manifest);
  assertSame(report.handoff_ref, manifest.handoff_ref, 'Report Handoff reference differs from Manifest.');
  assertSame(report.intake_report_ref, manifest.intake_report_ref, 'Report Intake reference differs from Manifest.');
  assertSame(report.upstream_source_build, manifest.upstream_source_build, 'Report upstream build differs from Manifest.');
  assertSame(report.source_build, manifest.source_build, 'Report source build differs from Manifest.');
  if (report.source_build?.dirty_before_build !== false) fail('PERF_INPUT_INVALID', 2, 'Report source build must be clean.');

  const manifestPath = resolveInside(evidenceRoot, report.manifest_ref.path);
  const actualManifestRef = await fileRef(evidenceRoot, manifestPath, report.manifest_ref.kind);
  assertSame(actualManifestRef, report.manifest_ref, 'Performance Manifest reference does not match bytes.');
  const intake = await readReferencedJson(evidenceRoot, report.intake_report_ref, 'PERF_INPUT_INVALID');
  if (intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION') fail('PERF_INPUT_INVALID', 2, 'Performance evidence requires a READY Intake report.');

  const rawSets = await loadRawSets({ evidenceRoot, report, manifest, validators });
  if (report.report_status === 'BLOCKED') {
    if (options.has('require-ready')) fail('PERF_REPORT_BLOCKED', 3);
    return { reportRef, report, manifest, rawSets };
  }

  verifyReady({ report, manifest, rawSets });
  return { reportRef, report, manifest, rawSets };
}

async function loadRawSets({ evidenceRoot, report, manifest, validators }) {
  const scenarioById = indexBy(manifest.scenario_catalog, 'scenario_id', 'Manifest scenario catalog');
  const fixtureById = indexBy(manifest.fixture_catalog, 'fixture_id', 'Manifest fixture catalog');
  const reportById = indexBy(report.scenario_results, 'scenario_id', 'Report scenario results');
  const reportRawByPath = new Map(report.raw_sample_refs.map(reference => [reference.path, reference]));
  if (reportRawByPath.size !== report.raw_sample_refs.length) fail('PERF_INPUT_INVALID', 2, 'Report raw sample references must be unique.');
  const rawSets = new Map();
  for (const scenarioId of expectedScenarioIds) {
    const scenario = scenarioById.get(scenarioId);
    const result = reportById.get(scenarioId);
    if (!scenario || !result) fail('PERF_INPUT_INVALID', 2, `Missing scenario: ${scenarioId}`);
    const reference = reportRawByPath.get(scenario.sample_set_path);
    if (!reference || !same(reference, result.raw_sample_ref)) fail('PERF_INPUT_INVALID', 2, `Raw sample reference mismatch: ${scenarioId}`);
    const value = await readReferencedJson(evidenceRoot, reference, 'PERF_INPUT_INVALID');
    validate(validators.samples, value, 'Performance Samples');
    await verifyAllReferences(evidenceRoot, value);
    const fixture = fixtureById.get(scenario.fixture_id);
    if (value.scenario_id !== scenarioId || !fixture?.artifact_refs.some(item => same(item, value.fixture_ref)) || value.environment_fingerprint !== report.environment_fingerprint) {
      fail('PERF_INPUT_INVALID', 2, `Raw sample binding mismatch: ${scenarioId}`);
    }
    const manifestPath = resolveInside(evidenceRoot, report.manifest_ref.path);
    const manifestRef = await fileRef(evidenceRoot, manifestPath, value.manifest_ref.kind);
    assertSame(value.manifest_ref, manifestRef, `Raw sample Manifest reference mismatch: ${scenarioId}`);
    rawSets.set(scenarioId, { scenario, result, value, reference });
  }
  if (rawSets.size !== 7 || reportRawByPath.size !== 7) fail('PERF_INPUT_INVALID', 2, 'Performance Report must bind exactly seven raw sample sets.');
  return rawSets;
}

function verifyReady({ report, manifest, rawSets }) {
  if (report.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') fail('PERF_INPUT_INVALID', 2, 'Unexpected Performance Report status.');
  if (!report.environment.valid || report.environment.external_interference || report.failures.length) fail('PERF_INPUT_INVALID', 2, 'READY Report contains invalid environment or failures.');
  verifyFixtureResults(report, manifest);

  let nonFrame = 0;
  let baselineFrames = 0;
  let stressFrames = 0;
  for (const { scenario, result, value } of rawSets.values()) {
    const counts = verifyScenario({ scenario, result, samples: value });
    if (scenario.scenario_id === 'PERF-CANVAS-003.BASELINE_OPD') baselineFrames += counts.frame;
    else if (scenario.scenario_id === 'PERF-CANVAS-004.STRESS_OPD') stressFrames += counts.frame;
    nonFrame += counts.nonFrame;
  }
  const expectedSummary = {
    fixture_count: 4, scenario_count: 7, metric_count: 11, raw_sample_set_count: 7,
    non_frame_measured_sample_count: nonFrame, baseline_frame_sample_count: baselineFrames,
    stress_frame_sample_count: stressFrames, total_measured_sample_count: nonFrame + baselineFrames + stressFrames,
    failed_sample_count: 0, timeout_count: 0, oom_count: 0, sample_integrity_failure_count: 0,
    functional_failure_count: 0, result_incomplete_count: 0, external_interference_count: 0, skipped_count: 0, retry_count: 0
  };
  assertSame(report.summary, expectedSummary, 'READY Report summary does not match recomputed raw samples.');
  if (baselineFrames < 900 || stressFrames < 600 || nonFrame !== 615 || expectedSummary.total_measured_sample_count < 2115) {
    fail('PERF_INPUT_INVALID', 2, 'READY Report does not meet frozen measured sample floors.');
  }
}

function verifyFixtureResults(report, manifest) {
  const fixtures = indexBy(manifest.fixture_catalog, 'fixture_id', 'Manifest fixture catalog');
  const results = indexBy(report.fixture_results, 'fixture_id', 'Report fixture results');
  if (fixtures.size !== 4 || results.size !== 4) fail('PERF_INPUT_INVALID', 2, 'Fixture catalog/result count mismatch.');
  for (const fixtureId of expectedFixtureIds) {
    const fixture = fixtures.get(fixtureId);
    const result = results.get(fixtureId);
    if (!fixture || !result || result.counts_status !== 'MATCHED' || result.result_status !== 'MATCHED' || result.before_digest !== fixture.fixture_digest || result.after_digest !== fixture.fixture_digest) {
      fail('PERF_INPUT_INVALID', 2, `Fixture result mismatch: ${fixtureId}`);
    }
    if (!fixture.artifact_refs.some(reference => same(reference, result.source_fixture_ref))) fail('PERF_INPUT_INVALID', 2, `Fixture source reference mismatch: ${fixtureId}`);
  }
}

function verifyScenario({ scenario, result, samples }) {
  if (result.fixture_id !== scenario.fixture_id || result.status !== 'PASS_MATCHED' || result.failed_sample_count !== 0 || result.timeout_count !== 0 || result.oom_count !== 0) {
    fail('PERF_INPUT_INVALID', 2, `Scenario result mismatch: ${scenario.scenario_id}`);
  }
  const metricResults = indexBy(result.metric_results, 'metric_id', `Metric results ${scenario.scenario_id}`);
  const seriesByMetric = indexBy(samples.series, 'metric_id', `Raw series ${scenario.scenario_id}`);
  if (!same(samples.series.map(value => value.metric_id), scenario.ordered_metrics.map(value => value.metric_id)) || metricResults.size !== scenario.ordered_metrics.length) {
    fail('PERF_INPUT_INVALID', 2, `Metric ordering mismatch: ${scenario.scenario_id}`);
  }
  if (!same(result.functional_check_results.map(value => value.check_id), scenario.functional_check_ids) || result.functional_check_results.some(value => value.status !== 'PASS_MATCHED')) {
    fail('PERF_INPUT_INVALID', 2, `Functional guard mismatch: ${scenario.scenario_id}`);
  }
  let frame = 0;
  let nonFrame = 0;
  const orderedEntries = [];
  for (const metric of scenario.ordered_metrics) {
    const series = seriesByMetric.get(metric.metric_id);
    const metricResult = metricResults.get(metric.metric_id);
    if (!series || !metricResult) fail('PERF_INPUT_INVALID', 2, `Metric missing: ${scenario.scenario_id}/${metric.metric_id}`);
    verifySeries(metric, series, metricResult, scenario.scenario_id);
    orderedEntries.push({ metric_id: metric.metric_id, warmup_samples: series.warmup_samples, measured_samples: series.measured_samples });
    const count = series.measured_samples.length;
    if (metric.metric_id === 'PAN_ZOOM_FRAME_US') frame += count;
    else nonFrame += count;
  }
  const total = samples.series.reduce((count, series) => count + series.warmup_samples.length + series.measured_samples.length, 0);
  const ordinals = samples.series.flatMap(series => [...series.warmup_samples, ...series.measured_samples].map(sample => sample.ordinal));
  if (samples.integrity.status !== 'MATCHED' || samples.integrity.series_count !== samples.series.length || samples.integrity.sample_count !== total || !samples.integrity.ordinal_contiguous || samples.integrity.duplicate_count !== 0 || samples.integrity.missing_count !== 0 || !same(ordinals, Array.from({ length: ordinals.length }, (_, index) => index + 1)) || samples.integrity.ordered_samples_sha256 !== sha(jcs(orderedEntries))) {
    fail('PERF_INPUT_INVALID', 2, `Raw sample integrity mismatch: ${scenario.scenario_id}`);
  }
  return { frame, nonFrame };
}

function verifySeries(metric, series, result, scenarioId) {
  for (const key of ['timing_domain', 'unit', 'measurement_method', 'required_warmup_count', 'required_measured_count', 'required_measured_duration_us']) {
    if ((metric[key] ?? null) !== (series[key] ?? null)) fail('PERF_INPUT_INVALID', 2, `Series policy mismatch: ${scenarioId}/${metric.metric_id}`);
  }
  if (series.observed_warmup_count !== series.warmup_samples.length || series.observed_measured_count !== series.measured_samples.length || series.warmup_samples.length !== metric.required_warmup_count) {
    fail('PERF_INPUT_INVALID', 2, `Series count mismatch: ${scenarioId}/${metric.metric_id}`);
  }
  if (metric.minimum_measured_count !== undefined && series.observed_measured_count < metric.minimum_measured_count) fail('PERF_INPUT_INVALID', 2, `Series minimum count mismatch: ${scenarioId}/${metric.metric_id}`);
  const duration = series.measured_samples.reduce((sum, sample) => sum + sample.duration_us, 0);
  if ((series.observed_measured_duration_us ?? null) !== (metric.required_measured_duration_us === undefined ? null : duration)) fail('PERF_INPUT_INVALID', 2, `Series duration mismatch: ${scenarioId}/${metric.metric_id}`);
  for (const sample of [...series.warmup_samples, ...series.measured_samples]) {
    if (sample.status !== 'SUCCEEDED' || sample.ended_at_monotonic_us < sample.started_at_monotonic_us || sample.duration_us !== sample.ended_at_monotonic_us - sample.started_at_monotonic_us) fail('PERF_INPUT_INVALID', 2, `Sample mismatch: ${scenarioId}/${metric.metric_id}`);
  }
  const digestInput = { ...series }; delete digestInput.series_digest;
  if (series.series_digest !== sha(jcs(digestInput))) fail('PERF_INPUT_INVALID', 2, `Series digest mismatch: ${scenarioId}/${metric.metric_id}`);
  const values = series.measured_samples.map(sample => sample.duration_us).sort((left, right) => left - right);
  const expected = { p50_us: nearestRank(values, 0.5), p95_us: nearestRank(values, 0.95), max_us: values.at(-1) };
  if (result.observed_measured_count !== values.length || (result.observed_measured_duration_us ?? null) !== (metric.required_measured_duration_us === undefined ? null : duration) || result.p50_us !== expected.p50_us || result.p95_us !== expected.p95_us || result.max_us !== expected.max_us) {
    fail('PERF_INPUT_INVALID', 2, `Metric statistics mismatch: ${scenarioId}/${metric.metric_id}`);
  }
  const thresholdValue = metric.threshold_policy.statistic === 'P95' ? expected.p95_us : metric.threshold_policy.statistic === 'MAX' ? expected.max_us : expected.max_us;
  if (thresholdValue > metric.threshold_policy.limit_us || result.threshold_status !== 'PASS_MATCHED') fail('PERF_INPUT_INVALID', 2, `Metric threshold mismatch: ${scenarioId}/${metric.metric_id}`);
}

function verifyCatalog(manifest) {
  if (!same(manifest.fixture_catalog.map(value => value.fixture_id), expectedFixtureIds) || !same(manifest.scenario_catalog.map(value => value.scenario_id), expectedScenarioIds)) {
    fail('PERF_INPUT_INVALID', 2, 'Performance catalog must use frozen IDs and ordering.');
  }
}

async function loadValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
  const [manifest, samples, report] = await Promise.all(['manifest', 'samples', 'report'].map(kind => readJson(resolve(workspace, `docs/contracts/schemas/opm-dev-canvas-06-performance-${kind}.schema.json`), 'PERF_RUNTIME_ERROR')));
  return { manifest: ajv.compile(manifest), samples: ajv.compile(samples), report: ajv.compile(report) };
}

async function verifyAllReferences(root, value) {
  const references = [];
  collectReferences(value, references);
  for (const reference of references) await verifyReference(root, reference);
}

function collectReferences(value, references) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && isReference(value)) references.push(value);
  for (const child of Object.values(value)) collectReferences(child, references);
}

function isReference(value) { return typeof value.kind === 'string' && typeof value.path === 'string' && Number.isInteger(value.byte_length) && typeof value.sha256 === 'string'; }
async function readReferencedJson(root, reference, code) { await verifyReference(root, reference); return readJson(resolveInside(root, reference.path), code); }
async function verifyReference(root, reference) {
  const path = resolveInside(root, reference.path);
  let info;
  try { info = await lstat(path); } catch { fail('PERF_INPUT_INVALID', 2, `Referenced file is missing: ${reference.path}`); }
  if (!info.isFile() || info.isSymbolicLink()) fail('PERF_INPUT_INVALID', 2, `Referenced file is unsafe: ${reference.path}`);
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha(bytes) !== reference.sha256) fail('PERF_INPUT_INVALID', 2, `Referenced file integrity mismatch: ${reference.path}`);
}
async function fileRef(root, path, kind) { const bytes = await readFile(path); const info = await stat(path); return { kind, path: relative(root, path).split(sep).join('/'), byte_length: info.size, sha256: sha(bytes) }; }
async function safeEvidenceRoot(path) { const absolute = resolve(path); let info; try { info = await lstat(absolute); } catch { fail('PERF_INPUT_INVALID', 2, 'Evidence root does not exist.'); } if (!info.isDirectory() || info.isSymbolicLink()) fail('PERF_INPUT_INVALID', 2, 'Evidence root is unsafe.'); return absolute; }
async function readJson(path, code) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail(code, code === 'PERF_RUNTIME_ERROR' ? 4 : 2, `Invalid JSON: ${path}`); } }
function resolveInside(root, path) { if (!path || isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.split(/[\\/]/).includes('..')) fail('PERF_INPUT_INVALID', 2, `Path must remain inside evidence root: ${path}`); const output = resolve(root, path); const relation = relative(root, output); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('PERF_INPUT_INVALID', 2, `Path escapes evidence root: ${path}`); return output; }
function validate(validator, value, label) { if (!validator(value)) fail('PERF_INPUT_INVALID', 2, `${label} schema validation failed: ${JSON.stringify(validator.errors)}`); }
function indexBy(values, key, label) { const output = new Map(values.map(value => [value[key], value])); if (output.size !== values.length) fail('PERF_INPUT_INVALID', 2, `${label} contains duplicate identifiers.`); return output; }
function nearestRank(values, percentile) { return values[Math.ceil(percentile * values.length) - 1]; }
function parseOptions(values) { const allowed = new Set(['evidence-root', 'report', 'require-ready']); const output = new Map(); for (let index = 0; index < values.length; index += 1) { const flag = values[index]; if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || output.has(flag.slice(2))) fail('PERF_INPUT_INVALID', 2, 'Usage: --evidence-root <path> --report <path> [--require-ready].'); if (flag === '--require-ready') { output.set('require-ready', true); continue; } const value = values[index + 1]; if (!value || value.startsWith('--')) fail('PERF_INPUT_INVALID', 2, 'Usage: --evidence-root <path> --report <path> [--require-ready].'); output.set(flag.slice(2), value); index += 1; } return output; }
function required(values, key) { const value = values.get(key); if (!value) fail('PERF_INPUT_INVALID', 2, `Missing --${key}.`); return value; }
function assertSame(left, right, message) { if (!same(left, right)) fail('PERF_INPUT_INVALID', 2, message); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
export function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
export function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code, exitCode, message = code) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
function isEntrypoint() { return process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname; }
