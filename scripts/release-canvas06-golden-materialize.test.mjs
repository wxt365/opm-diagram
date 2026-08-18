import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { collectFamilyFixtures, createFreshRoot, fixtureRefKey, quarantineCleanupFailure, resolveJava21, runOrdered, withKeyLock, writeQuarantineMarker } from './release-canvas06-golden-materialize.mjs';
import { rootTreeDigest } from './verify-canvas06-golden-materialization.mjs';

const root = resolve('.');
const [schema, markerSchema] = await Promise.all(['opm-dev-canvas-06-golden-fixture-materialization-report.schema.json', 'opm-dev-canvas-06-golden-fixture-quarantine-marker.schema.json'].map(name => readFile(resolve(root, 'docs/contracts/schemas', name), 'utf8').then(JSON.parse)));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validate = ajv.compile(schema); const validateMarker = ajv.compile(markerSchema);

test('1170 Family captures deterministically collapse to 130 exact archive fixture refs', () => {
  const captures = Array.from({ length: 130 }, (_, index) => Array.from({ length: 9 }, () => ({ capture_kind: 'FAMILY', fixture_ref: archiveRef(index) }))).flat();
  const fixtures = collectFamilyFixtures({ captures, input_materialization: { bundle_ref: { sha256: digest('bundle') } } });
  assert.equal(fixtures.length, 130);
  assert.equal(fixtures[0].count, 9);
  assert.deepEqual(fixtures.map(item => item.key), [...fixtures.map(item => item.key)].sort());
});

test('Materializer rejects fixture cardinality, normal refs, bundle mismatch and key collision before a child starts', () => {
  const captures = Array.from({ length: 129 }, (_, index) => Array.from({ length: 9 }, () => ({ capture_kind: 'FAMILY', fixture_ref: archiveRef(index) }))).flat();
  assert.throws(() => collectFamilyFixtures({ captures, input_materialization: { bundle_ref: { sha256: digest('bundle') } } }), error => error.code === 'GFM_FIXTURE_SET_MISMATCH');
  const normal = Array.from({ length: 130 }, (_, index) => Array.from({ length: 9 }, () => ({ capture_kind: 'FAMILY', fixture_ref: index === 0 ? { kind: 'FIXTURE', path: 'wrong.json', byte_length: 1, sha256: digest('wrong') } : archiveRef(index) }))).flat();
  assert.throws(() => collectFamilyFixtures({ captures: normal, input_materialization: { bundle_ref: { sha256: digest('bundle') } } }), error => error.code === 'GFM_FIXTURE_SET_MISMATCH');
  const mismatch = Array.from({ length: 130 }, (_, index) => Array.from({ length: 9 }, () => ({ capture_kind: 'FAMILY', fixture_ref: archiveRef(index, index === 0 ? digest('different') : digest('bundle')) }))).flat();
  assert.throws(() => collectFamilyFixtures({ captures: mismatch, input_materialization: { bundle_ref: { sha256: digest('bundle') } } }), error => error.code === 'GFM_BUNDLE_REF_MISMATCH');
  const left = archiveRef(0); const right = { ...left, archive_entry_path: 'other.json' };
  assert.notEqual(fixtureRefKey(left), fixtureRefKey(right));
});

test('ordered queue supports one or four workers, caps concurrency, and returns results in fixture key order', async () => {
  const serialCalls = [];
  const serial = await runOrdered([{ key: 'b' }, { key: 'a' }], 1, async item => {
    serialCalls.push(item.key);
    return 0;
  });
  assert.deepEqual(serialCalls, ['b', 'a']);
  assert.deepEqual(serial.results.map(entry => entry.key), ['a', 'b']);

  const items = ['d', 'a', 'c', 'b', 'e'].map(key => ({ key }));
  let active = 0; let maximum = 0;
  const result = await runOrdered(items, 4, async item => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, item.key === 'a' ? 8 : 2));
    active -= 1;
    return 0;
  });
  assert.equal(maximum, 4);
  assert.equal(result.failed, false);
  assert.deepEqual(result.results.map(entry => entry.key), ['a', 'b', 'c', 'd', 'e']);
});

test('ordered queue stops scheduling after failure and waits for active sibling', async () => {
  const sibling = deferred(); const started = []; const finished = [];
  const pending = runOrdered([{ key: 'a' }, { key: 'b' }, { key: 'c' }], 2, async item => {
    started.push(item.key);
    if (item.key === 'a') return 3;
    await sibling.promise;
    finished.push(item.key);
    return 0;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a', 'b']);
  sibling.resolve();
  const result = await pending;
  assert.equal(result.failed, true);
  assert.deepEqual(finished, ['b']);
  assert.deepEqual(result.results, [{ key: 'a', code: 3 }, { key: 'b', code: 0 }]);
});

test('ordered queue preserves a callback failure after active work drains', async () => {
  const sibling = deferred(); const failure = Object.assign(new Error('quarantine failed'), { code: 'GFM_QUARANTINE_FAILED', exitCode: 4 });
  const pending = runOrdered([{ key: 'a' }, { key: 'b' }, { key: 'c' }], 2, async item => {
    if (item.key === 'a') throw failure;
    await sibling.promise;
    return 0;
  });
  await new Promise(resolve => setImmediate(resolve));
  sibling.resolve();
  const result = await pending;
  assert.equal(result.error, failure);
  assert.deepEqual(result.results, [{ key: 'a', code: 4 }, { key: 'b', code: 0 }]);
});

test('fresh root and per-key lock reject reuse, remove lock artifacts, and preserve the lock conflict code', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'opm-materialization-root-'));
  const materializationRoot = resolve(parent, 'run');
  await createFreshRoot(materializationRoot);
  await assert.rejects(() => createFreshRoot(materializationRoot), error => error.code === 'GFM_TARGET_STORAGE_NOT_EMPTY' && error.exitCode === 3);

  const key = digest('fixture-key'); const callback = deferred(); const lockEntered = deferred();
  const holder = withKeyLock(materializationRoot, key, async () => {
    lockEntered.resolve();
    return await callback.promise;
  });
  await lockEntered.promise;
  await assert.rejects(() => withKeyLock(materializationRoot, key, async () => 0), error => error.code === 'GFM_STORAGE_WRITE_FAILED' && error.exitCode === 3);
  callback.resolve(0);
  assert.equal(await holder, 0);
  await assert.rejects(() => access(resolve(materializationRoot, '.locks')), error => error.code === 'ENOENT');
});

test('Materializer accepts only a regular Java 21 executable from JAVA_HOME', async () => {
  const javaHome = await mkdtemp(resolve(tmpdir(), 'opm-java-home-'));
  const executable = resolve(javaHome, 'bin', 'java');
  await mkdir(resolve(javaHome, 'bin'));
  await writeFile(executable, 'test');

  await assert.rejects(() => resolveJava21(undefined), error => error.code === 'GFM_ARGUMENT_INVALID' && error.exitCode === 2);
  await assert.rejects(() => resolveJava21(javaHome, async () => 'openjdk version "17.0.12"'), error => error.code === 'GFM_ARGUMENT_INVALID' && error.exitCode === 2);
  assert.equal(await resolveJava21(javaHome, async () => 'openjdk version "21.0.7"'), executable);
});

test('Materialization Report Schema accepts a complete MATERIALIZED report and rejects state or payload boundary violations', () => {
  const success = report('MATERIALIZED');
  assert.equal(validate(success), true, JSON.stringify(validate.errors));
  const missingPersistence = report('MATERIALIZED'); delete missingPersistence.persistence;
  assert.equal(validate(missingPersistence), false);
  const blocked = report('BLOCKED');
  assert.equal(validate(blocked), true, JSON.stringify(validate.errors));
  blocked.target_storage = success.target_storage;
  assert.equal(validate(blocked), false);
  const escaped = report('MATERIALIZED'); escaped.target_storage.storage_root = '../storage';
  assert.equal(validate(escaped), false);
});

test('Quarantine Marker Schema accepts only the frozen non-consumable layout', () => {
  const key = digest('fixture-key'); const marker = { schema_id: 'OPM-DEV-CANVAS-06-GFM-QUARANTINE-MARKER-001', schema_version: '0.1', change_id: 'GOLDEN-CANVAS06-20260731-001', fixture_ref_key: key, source_storage_path: `fixtures/${key}/storage`, quarantine_storage_path: `quarantine/${key}/storage`, primary_failure_code: 'GFM_STORAGE_WRITE_FAILED', cleanup_failure_code: 'GFM_CLEANUP_FAILED', generated_at: '2026-07-31T00:00:00.000Z', marker_payload_sha256: digest('marker') };
  assert.equal(validateMarker(marker), true, JSON.stringify(validateMarker.errors));
  assert.equal(validateMarker({ ...marker, source_storage_path: '../storage' }), false);
  assert.equal(validateMarker({ ...marker, cleanup_failure_code: 'GFM_STORAGE_WRITE_FAILED' }), false);
});

test('Quarantine Marker writer derives the fixed layout and writes an atomic payload', async () => {
  const key = digest('fixture-key'); const work = await mkdtemp(resolve(tmpdir(), 'opm-quarantine-marker-'));
  const marker = await writeQuarantineMarker({ materializationRoot: work, changeId: 'GOLDEN-CANVAS06-20260731-001', fixtureRefKey: key, primaryFailureCode: 'GFM_STORAGE_WRITE_FAILED', epoch: 1782864000 });
  assert.equal(validateMarker(marker), true, JSON.stringify(validateMarker.errors));
  assert.equal(marker.marker_payload_sha256, cryptoSha(marker));
  assert.equal(JSON.parse(await readFile(resolve(work, 'quarantine', key, 'non-consumable.json'), 'utf8')).fixture_ref_key, key);
});

test('cleanup secondary failure moves residual storage and writes the fixed quarantine marker', async () => {
  const key = digest('fixture-key'); const work = await mkdtemp(resolve(tmpdir(), 'opm-quarantine-move-'));
  const fixture = { key, ref: archiveRef(0) };
  const report = cleanupReport(key, fixture.ref);
  await mkdir(resolve(work, 'reports'), { recursive: true });
  await mkdir(resolve(work, 'fixtures', key, 'storage', 'projects', 'partial'), { recursive: true });
  await writeFile(resolve(work, 'reports', `${key}.json`), JSON.stringify(report));
  await writeFile(resolve(work, 'fixtures', key, 'storage', 'projects', 'partial', 'project.db'), 'partial');

  let verified = false;
  assert.equal(await quarantineCleanupFailure({ materializationRoot: work, planPath: resolve(work, 'capture-plan.json'), plan: { change_id: report.change_id }, fixture, epoch: 1782864000,
    verifyPending: pendingAttestation, verifySelectedDiagnostic: async () => { verified = true; return { exitCode: 3, topCode: 'GFMV_ROOT_NOT_CONSUMABLE' }; } }), true);
  assert.equal(verified, true);
  assert.equal(await readFile(resolve(work, 'quarantine', key, 'storage', 'projects', 'partial', 'project.db'), 'utf8'), 'partial');
  assert.equal(JSON.parse(await readFile(resolve(work, 'quarantine', key, 'non-consumable.json'), 'utf8')).primary_failure_code, 'GFM_STORAGE_WRITE_FAILED');
});

test('cleanup quarantine refuses an occupied target and preserves the residual storage for manual inspection', async () => {
  const key = digest('fixture-key'); const work = await mkdtemp(resolve(tmpdir(), 'opm-quarantine-failure-'));
  const fixture = { key, ref: archiveRef(0) };
  const report = cleanupReport(key, fixture.ref);
  await mkdir(resolve(work, 'reports'), { recursive: true });
  await mkdir(resolve(work, 'fixtures', key, 'storage'), { recursive: true });
  await mkdir(resolve(work, 'quarantine', key, 'storage'), { recursive: true });
  await writeFile(resolve(work, 'reports', `${key}.json`), JSON.stringify(report));
  await writeFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'retain');

  await assert.rejects(() => quarantineCleanupFailure({ materializationRoot: work, planPath: resolve(work, 'capture-plan.json'), plan: { change_id: report.change_id }, fixture, epoch: 1782864000,
    verifyPending: pendingAttestation, verifySelectedDiagnostic: async () => ({ exitCode: 3, topCode: 'GFMV_ROOT_NOT_CONSUMABLE' }) }),
    error => error.code === 'GFM_QUARANTINE_FAILED' && error.exitCode === 4);
  assert.equal(await readFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'utf8'), 'retain');
});

test('cleanup quarantine refuses a BLOCKED Report that does not pass the semantic verifier', async () => {
  const key = digest('fixture-key'); const work = await mkdtemp(resolve(tmpdir(), 'opm-quarantine-verify-'));
  const fixture = { key, ref: archiveRef(0) };
  const report = cleanupReport(key, fixture.ref);
  await mkdir(resolve(work, 'reports'), { recursive: true });
  await mkdir(resolve(work, 'fixtures', key, 'storage'), { recursive: true });
  await writeFile(resolve(work, 'reports', `${key}.json`), JSON.stringify(report));
  await writeFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'retain');

  await assert.rejects(() => quarantineCleanupFailure({ materializationRoot: work, planPath: resolve(work, 'capture-plan.json'), plan: { change_id: report.change_id }, fixture, epoch: 1782864000,
    verifyPending: async () => { throw Object.assign(new Error('invalid'), { code: 'GFMV_REPORT_SCHEMA_INVALID', exitCode: 2 }); } }), error => error.code === 'GFM_QUARANTINE_FAILED' && error.exitCode === 4);
  assert.equal(await readFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'utf8'), 'retain');
});

test('residual storage without a reportable invocation is quarantined as an unrecoverable failure', async () => {
  const key = digest('fixture-key'); const work = await mkdtemp(resolve(tmpdir(), 'opm-quarantine-no-report-'));
  const fixture = { key, ref: archiveRef(0) };
  await mkdir(resolve(work, 'fixtures', key, 'storage'), { recursive: true });
  await writeFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'retain');
  await assert.rejects(() => quarantineCleanupFailure({ materializationRoot: work, planPath: resolve(work, 'capture-plan.json'), plan: { change_id: 'GOLDEN-CANVAS06-20260731-001' }, fixture, epoch: 1782864000 }),
    error => error.code === 'GFM_QUARANTINE_FAILED' && error.exitCode === 4);
  assert.equal(await readFile(resolve(work, 'fixtures', key, 'storage', 'residual.txt'), 'utf8'), 'retain');
});

function archiveRef(index, bundleSha = digest('bundle')) { return { path: `fixtures/${index}.json`, byte_length: index + 1, sha256: digest(`fixture-${index}`), bundle_sha256: bundleSha, archive_entry_path: `archive/fixtures/${index}.json` }; }
function report(status) {
  const key = digest('fixture-key');
  const common = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001', schema_version: '0.1', report_id: `dev-canvas-06.fixture-materialization.GOLDEN-CANVAS06-20260731-001.${key}`, report_version: '0.1.0', report_status: status, change_id: 'GOLDEN-CANVAS06-20260731-001', materialization_id: `dev-canvas-06.fixture-materialization.GOLDEN-CANVAS06-20260731-001.${key}`, generated_at: '2026-07-31T00:00:00.000Z', source_date_epoch: 1782864000, runner_identity: { contract_version: '0.1.0', runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime.jar'), java_version: '21.0.7', java_vendor: 'OpenJDK', command: 'java -jar runtime.jar' }, capture_plan_ref: ref('CAPTURE_PLAN', 'capture-plan.json'), evidence_bundle_ref: ref('EVIDENCE_BUNDLE', 'bundle.jar'), source_fixture_ref: archiveRef(0), fixture_ref_key: key, runtime_binding: binding(), fixture_identity: { schema_id: 'MS-REV-001', schema_version: '0.2', model_id: 'model.fixture', revision_id: 'revision.fixture', revision_sequence: 2, parent_revision_id: 'revision.parent', fixture_sha256: digest('fixture') }, checks: checks(status), failures: status === 'BLOCKED' ? [{ code: 'GFM_PLAN_INVALID', message_key: 'gfm.plan.invalid' }] : [], report_payload_sha256: digest('payload') };
  if (status === 'BLOCKED') return { ...common, primary_failure: { code: 'GFM_PLAN_INVALID', message_key: 'gfm.plan.invalid' } };
  return { ...common, materialized_identity: { project_id: `project.golden.fixture.${digest('fixture')}`, model_id: 'model.fixture', revision_id: 'revision.fixture', revision_sequence: 2, draft_head_revision_id: 'revision.fixture', head_sequence: 2, history_mode: 'SINGLE_REVISION_SNAPSHOT' }, target_storage: { storage_root: 'fixtures/key/storage', database_ref: ref('DATABASE', 'fixtures/key/storage/projects/project.golden.fixture.db/project.db'), storage_schema_version: '1.0', database_sha256: digest('db'), semantic_state_sha256: digest('state') }, persistence: { transaction_status: 'COMMITTED', table_counts: tableCounts(), integrity_check: 'ok', foreign_key_check: 0, reopen_matched: true, sidecar_absent: true, stage_durations_us: { preflight: 1, migration: 1, seed: 1, verify: 1, report: 1 }, peak_rss_bytes: 1 } };
}
function cleanupReport(key, sourceFixtureRef) {
  const value = report('BLOCKED');
  const primary = { code: 'GFM_STORAGE_WRITE_FAILED', message_key: 'gfm.blocked' };
  value.fixture_ref_key = key;
  value.source_fixture_ref = sourceFixtureRef;
  value.checks = value.checks.map(check => ({ ...check, status: 'PASSED' }));
  value.primary_failure = primary;
  value.failures = [primary, { code: 'GFM_CLEANUP_FAILED', message_key: 'gfm.cleanup.failed' }];
  value.report_payload_sha256 = payloadSha(value, 'report_payload_sha256');
  return value;
}
async function pendingAttestation({ materializationRoot, fixtureRefKey: key, reportRelativePath, sourceStorageRelativePath, quarantineStorageRelativePath, markerRelativePath }) {
  const source = resolve(materializationRoot, `fixtures/${key}/storage`);
  const details = await lstat(source);
  return Object.freeze({ attestation_version: 'PENDING-QUARANTINE-IN-MEMORY-1', change_id: 'GOLDEN-CANVAS06-20260731-001', fixture_ref_key: key,
    plan_raw_sha256: digest('plan'), report_raw_sha256: digest('report'), report_payload_sha256: digest('payload'), source_storage_dev: details.dev, source_storage_ino: details.ino,
    report_relative_path: reportRelativePath, source_storage_relative_path: sourceStorageRelativePath, quarantine_storage_relative_path: quarantineStorageRelativePath, marker_relative_path: markerRelativePath,
    primary_failure_code: 'GFM_STORAGE_WRITE_FAILED', cleanup_failure_code: 'GFM_CLEANUP_FAILED', root_tree_sha256_before_move: await rootTreeDigest(materializationRoot) });
}
function checks(status) { return ['GFM-CHECK-MODE', 'GFM-CHECK-ARGS', 'GFM-CHECK-RUNTIME-JAR', 'GFM-CHECK-PLAN', 'GFM-CHECK-FIXTURE-MEMBERSHIP', 'GFM-CHECK-BUNDLE', 'GFM-CHECK-ARCHIVE', 'GFM-CHECK-FIXTURE', 'GFM-CHECK-BINDING', 'GFM-CHECK-STORAGE'].map((check_id, index) => ({ check_id, status: status === 'BLOCKED' && index === 0 ? 'FAILED' : status === 'BLOCKED' ? 'NOT_RUN' : 'PASSED' })); }
function tableCounts() { return { project_metadata: 1, profile_package: 1, rule_set_package: 1, grammar_package: 1, model_catalog: 1, revision_document: 1, model_head: 1, revision_parent: 0, operation_record: 0, idempotency_record: 0, background_task: 0, asset_manifest: 0, element_index: 0, fact_endpoint_index: 0, occurrence_index: 0, finding_index: 0, text_trace_index: 0 }; }
function binding() { return { profile: asset('profile'), rule_set: asset('rule'), text_grammar: asset('grammar'), symbol_catalog: asset('symbol'), normalization_adapter: asset('normalization'), binding_digest: digest('binding') }; }
function asset(id) { return { id, version: '0.1.0', sha256: digest(id) }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest(path) }; }
function digest(value) { return (value.length.toString(16).padStart(2, '0') + '0'.repeat(64)).slice(0, 64); }
function cryptoSha(value) { const copy = { ...value }; delete copy.marker_payload_sha256; return createHash('sha256').update(jcs(copy)).digest('hex'); }
function payloadSha(value, field) { const copy = { ...value }; delete copy[field]; return createHash('sha256').update(jcs(copy)).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
