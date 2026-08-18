import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { collectFamilyFixtures } from './release-canvas06-golden-materialize.mjs';

const workspace = resolve('.');
const ids = ['GFM-CHECK-MODE', 'GFM-CHECK-ARGS', 'GFM-CHECK-RUNTIME-JAR', 'GFM-CHECK-PLAN', 'GFM-CHECK-FIXTURE-MEMBERSHIP', 'GFM-CHECK-BUNDLE', 'GFM-CHECK-ARCHIVE', 'GFM-CHECK-FIXTURE', 'GFM-CHECK-BINDING', 'GFM-CHECK-STORAGE'];
const materializedFailureCodes = new Set(['GFM_STORAGE_MIGRATION_FAILED', 'GFM_STORAGE_WRITE_FAILED', 'GFM_STORAGE_VERIFY_FAILED', 'GFM_REPORT_CONTENT_INVALID']);
const sqlite = promisify(execFile);
const tables = ['project_metadata', 'profile_package', 'rule_set_package', 'grammar_package', 'model_catalog', 'revision_document', 'model_head', 'revision_parent', 'operation_record', 'idempotency_record', 'background_task', 'asset_manifest', 'element_index', 'fact_endpoint_index', 'occurrence_index', 'finding_index', 'text_trace_index'];

if (resolve(process.argv[1] ?? '') === new URL(import.meta.url).pathname) {
  try { await main(); } catch (error) { console.error(error.code ?? 'GFMV_INTERNAL_ERROR'); if (error.message && error.message !== error.code) console.error(error.message); process.exitCode = error.exitCode ?? 4; }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = args(argv);
  const planPath = requiredPath(options, 'plan');
  const base = requiredPath(options, 'materialization-root');
  const selectedKey = options.get('fixture-ref-key');
  const required = options.has('require-materialized');
  const plan = await readJson(planPath, 'GFMV_PLAN_INVALID', 2);
  const fixtures = fixturesFromPlan(plan);
  const selected = selectedKey ? fixtures.filter(item => item.key === selectedKey) : fixtures;
  if (selectedKey && !selected.length) fail('GFMV_FIXTURE_KEY_NOT_IN_PLAN', 2);

  const root = await scanRoot(base, new Set(fixtures.map(item => item.key)), dependencies);
  const reportSchema = await readJson(resolve(workspace, 'docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json'), 'GFMV_INTERNAL_ERROR', 4);
  const markerSchema = await readJson(resolve(workspace, 'docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-quarantine-marker.schema.json'), 'GFMV_INTERNAL_ERROR', 4);
  const validateReport = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(reportSchema);
  const validateMarker = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(markerSchema);
  const planDirectory = dirname(planPath);
  const planRef = await fileRef('CAPTURE_PLAN', planDirectory, planPath);
  const bundle = await exactPlanBundle(plan, planDirectory);
  if (dependencies.fault === 'IO') fail('GFMV_IO_ERROR', 4);
  if (dependencies.fault === 'INTERNAL') fail('GFMV_INTERNAL_ERROR', 4);

  let incomplete = false;
  let notConsumable = false;
  for (const fixture of selected) {
    const reportPath = resolve(base, 'reports', `${fixture.key}.json`);
    if (!root.files.has(relative(base, reportPath))) { incomplete = true; continue; }
    const result = await verifyReport({ reportPath, plan, planRef, bundle, fixture, base, root, validateReport, validateMarker });
    notConsumable ||= result.blocked;
    incomplete ||= result.incomplete;
  }

  if (!selectedKey) {
    for (const fixture of fixtures) {
      if (!root.files.has(`reports/${fixture.key}.json`)) incomplete = true;
    }
  }
  if (incomplete) fail('GFMV_ROOT_INCOMPLETE', 3);
  if (notConsumable) fail('GFMV_ROOT_NOT_CONSUMABLE', 3);
  if (required && selectedKey && !selected[0]) fail('GFMV_FIXTURE_KEY_NOT_IN_PLAN', 2);
}

/**
 * 只验证 cleanup 尚未迁移时的唯一过渡态；成功结果只在当前进程内使用。
 */
export async function verifyPendingQuarantine({
  capturePlanPath,
  materializationRoot,
  fixtureRefKey,
  reportRelativePath,
  sourceStorageRelativePath,
  quarantineStorageRelativePath,
  markerRelativePath
}, dependencies = {}) {
  const planPath = resolve(capturePlanPath ?? '');
  const base = resolve(materializationRoot ?? '');
  const expected = {
    report: `reports/${fixtureRefKey}.json`,
    source: `fixtures/${fixtureRefKey}/storage`,
    quarantine: `quarantine/${fixtureRefKey}/storage`,
    marker: `quarantine/${fixtureRefKey}/non-consumable.json`
  };
  if (!/^[a-f0-9]{64}$/.test(fixtureRefKey ?? '')
      || reportRelativePath !== expected.report
      || sourceStorageRelativePath !== expected.source
      || quarantineStorageRelativePath !== expected.quarantine
      || markerRelativePath !== expected.marker) {
    fail('GFMV_PENDING_QUARANTINE_INVALID', 2);
  }

  const plan = await readJson(planPath, 'GFMV_PLAN_INVALID', 2);
  const fixtures = fixturesFromPlan(plan);
  const fixture = fixtures.find(item => item.key === fixtureRefKey);
  if (!fixture) fail('GFMV_FIXTURE_KEY_NOT_IN_PLAN', 2);
  const root = await scanRoot(base, new Set(fixtures.map(item => item.key)), dependencies);
  const reportSchema = await readJson(resolve(workspace, 'docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json'), 'GFMV_INTERNAL_ERROR', 4);
  const markerSchema = await readJson(resolve(workspace, 'docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-quarantine-marker.schema.json'), 'GFMV_INTERNAL_ERROR', 4);
  const validateReport = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(reportSchema);
  const validateMarker = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(markerSchema);
  const planDirectory = dirname(planPath);
  const planRef = await fileRef('CAPTURE_PLAN', planDirectory, planPath);
  const bundle = await exactPlanBundle(plan, planDirectory);
  const reportPath = resolveInside(base, expected.report, 'GFMV_PENDING_QUARANTINE_INVALID');
  if (!root.files.has(expected.report)) fail('GFMV_ROOT_INCOMPLETE', 3);
  const pending = await verifyReport({ reportPath, plan, planRef, bundle, fixture, base, root, validateReport, validateMarker, pendingQuarantine: true });
  if (!pending.blocked || pending.report.target_storage !== undefined) {
    fail('GFMV_PENDING_QUARANTINE_INVALID', 2);
  }
  if (pending.report.failures.length !== 2
      || pending.report.failures[1]?.code !== 'GFM_CLEANUP_FAILED') {
    fail('GFMV_FAILURE_PRECEDENCE_INVALID', 2);
  }

  // 其余 129 项必须已经是可复核的 materialized sibling，不能借 pending 流程掩盖残留。
  for (const sibling of fixtures) {
    if (sibling.key === fixture.key) continue;
    const siblingPath = resolve(base, 'reports', `${sibling.key}.json`);
    if (!root.files.has(`reports/${sibling.key}.json`)) fail('GFMV_ROOT_INCOMPLETE', 3);
    const siblingResult = await verifyReport({ reportPath: siblingPath, plan, planRef, bundle, fixture: sibling, base, root, validateReport, validateMarker });
    if (siblingResult.blocked || siblingResult.incomplete) fail('GFMV_PENDING_QUARANTINE_INVALID', 2);
  }

  const source = resolveInside(base, expected.source, 'GFMV_PENDING_QUARANTINE_INVALID');
  const sourceInfo = await directoryInfo(source, 'GFMV_PENDING_QUARANTINE_INVALID');
  if (!sourceInfo || await emptyDirectory(source)) fail('GFMV_PENDING_QUARANTINE_INVALID', 2);
  if (root.paths.has(`quarantine/${fixture.key}`) || root.paths.has(expected.quarantine) || root.files.has(expected.marker)) {
    fail('GFMV_PENDING_QUARANTINE_INVALID', 2);
  }
  const reportBytes = await readFile(reportPath);
  const attestation = {
    attestation_version: 'PENDING-QUARANTINE-IN-MEMORY-1',
    change_id: plan.change_id,
    fixture_ref_key: fixture.key,
    plan_raw_sha256: planRef.sha256,
    report_relative_path: expected.report,
    report_raw_sha256: sha(reportBytes),
    report_payload_sha256: pending.report.report_payload_sha256,
    source_storage_relative_path: expected.source,
    source_storage_dev: sourceInfo.dev,
    source_storage_ino: sourceInfo.ino,
    quarantine_storage_relative_path: expected.quarantine,
    marker_relative_path: expected.marker,
    primary_failure_code: pending.report.primary_failure.code,
    cleanup_failure_code: 'GFM_CLEANUP_FAILED',
    root_tree_sha256_before_move: await rootTreeDigest(base)
  };
  return Object.freeze(attestation);
}

async function verifyReport({ reportPath, plan, planRef, bundle, fixture, base, root, validateReport, validateMarker, pendingQuarantine = false }) {
  const report = await readJson(reportPath, 'GFMV_REPORT_SCHEMA_INVALID', 2);
  if (!validateReport(report)) fail('GFMV_REPORT_SCHEMA_INVALID', 2);
  verifyChecks(report);
  verifyReportIdentity(report, plan, fixture);
  verifyPayload(report);
  const fixtureInput = readFixture(bundle.path, fixture.ref);
  verifyInputRefs(report, plan, planRef, bundle.ref, fixture, fixtureInput);
  const expectedBinding = normalizeBinding(plan.active_binding);
  const fixtureBinding = normalizeBinding(fixtureInput.json.profile_binding);
  verifyFixtureIdentity(report, fixtureInput);
  const blocked = report.report_status === 'BLOCKED';
  verifyBinding(report, expectedBinding, fixtureBinding, blocked);
  verifyFailures(report, blocked);
  if (blocked) {
    if (!pendingQuarantine) await verifyBlockedStorage({ report, fixture, base, root, validateMarker });
    return { report, blocked: true, incomplete: false };
  }
  verifyMaterializedIdentity(report, fixtureInput);
  const database = await verifyDatabase(report, fixtureInput, fixture, base, root);
  return { report, blocked: false, incomplete: database.missing };
}

function fixturesFromPlan(plan) {
  if (plan?.plan_status !== 'READY_FOR_AUTHORING' || !Number.isInteger(plan?.source_date_epoch) || typeof plan?.change_id !== 'string') fail('GFMV_PLAN_INVALID', 2);
  try { return collectFamilyFixtures(plan); } catch { fail('GFMV_PLAN_INVALID', 2); }
}

async function exactPlanBundle(plan, planDirectory) {
  const ref = plan.input_materialization?.bundle_ref;
  if (!fileReference(ref)) fail('GFMV_PLAN_INVALID', 2);
  const path = resolveInside(planDirectory, ref.path, 'GFMV_PLAN_INVALID');
  if (!await regularFile(path)) fail('GFMV_INPUT_REF_MISMATCH', 2);
  const actual = await fileRef(ref.kind, planDirectory, path);
  if (!same(actual, ref)) fail('GFMV_INPUT_REF_MISMATCH', 2);
  return { path, ref };
}

function verifyChecks(report) {
  if (!Array.isArray(report.checks) || report.checks.length !== ids.length || report.checks.some((value, index) => value.check_id !== ids[index])) fail('GFMV_CHECK_SEQUENCE_INVALID', 2);
  const statuses = report.checks.map(value => value.status);
  if (report.report_status === 'MATERIALIZED') {
    if (statuses.some(status => status !== 'PASSED') || report.checks.some(value => 'code' in value)) fail('GFMV_CHECK_SEQUENCE_INVALID', 2);
    return;
  }
  if (statuses.slice(0, 8).some(status => status !== 'PASSED')) fail('GFMV_CHECK_SEQUENCE_INVALID', 2);
  const primary = report.primary_failure?.code;
  const binding = statuses[8] === 'FAILED' && statuses[9] === 'NOT_RUN' && report.checks[8].code === 'GFM_BINDING_MISMATCH' && report.checks[9].code === 'NOT_RUN' && primary === 'GFM_BINDING_MISMATCH';
  const storage = statuses[8] === 'PASSED' && statuses[9] === 'FAILED' && report.checks[9].code === primary;
  const persisted = statuses.every(status => status === 'PASSED') && materializedFailureCodes.has(primary);
  if (!binding && !storage && !persisted) fail('GFMV_CHECK_SEQUENCE_INVALID', 2);
}

function verifyReportIdentity(report, plan, fixture) {
  const expected = `dev-canvas-06.fixture-materialization.${plan.change_id}.${fixture.key}`;
  if (report.report_id !== expected || report.materialization_id !== expected || report.change_id !== plan.change_id || report.fixture_ref_key !== fixture.key || report.source_date_epoch !== plan.source_date_epoch) fail('GFMV_REPORT_IDENTITY_MISMATCH', 2);
}

function verifyPayload(report) {
  const payload = { ...report }; delete payload.report_payload_sha256;
  if (report.report_payload_sha256 !== sha(jcs(payload))) fail('GFMV_REPORT_PAYLOAD_MISMATCH', 2);
}

function verifyInputRefs(report, plan, planRef, bundleRef, fixture, input) {
  if (!same(report.capture_plan_ref, planRef) || !same(report.evidence_bundle_ref, bundleRef) || !same(report.source_fixture_ref, fixture.ref) || fixture.ref.bundle_sha256 !== bundleRef.sha256 || input.sha256 !== fixture.ref.sha256 || input.bytes.length !== fixture.ref.byte_length) fail('GFMV_INPUT_REF_MISMATCH', 2);
  if (!same(report.runner_identity?.runtime_jar_ref, plan.runtime_jar_ref)) fail('GFMV_INPUT_REF_MISMATCH', 2);
}

function verifyFixtureIdentity(report, input) {
  const value = input.json;
  const expected = { schema_id: value.schema_id, schema_version: value.schema_version, model_id: value.model_id, revision_id: value.revision_id, revision_sequence: value.revision_sequence, parent_revision_id: value.parent_revision_id ?? null, fixture_sha256: input.sha256 };
  if (!same(report.fixture_identity, expected)) fail('GFMV_FIXTURE_IDENTITY_MISMATCH', 2);
}

function verifyBinding(report, planBinding, fixtureBinding, blocked) {
  const observed = report.runtime_binding;
  if (!blocked && (!same(planBinding, fixtureBinding) || !same(observed, planBinding))) fail('GFMV_BINDING_MISMATCH', 2);
  if (blocked && report.primary_failure.code === 'GFM_BINDING_MISMATCH' && same(observed, planBinding) && same(observed, fixtureBinding)) fail('GFMV_BINDING_MISMATCH', 2);
  if (blocked && report.primary_failure.code !== 'GFM_BINDING_MISMATCH' && (!same(planBinding, fixtureBinding) || !same(observed, planBinding))) fail('GFMV_BINDING_MISMATCH', 2);
}

function verifyFailures(report, blocked) {
  if (!blocked) {
    if (report.failures.length !== 0 || 'primary_failure' in report) fail('GFMV_FAILURE_PRECEDENCE_INVALID', 2);
    return;
  }
  if (!Array.isArray(report.failures) || report.failures.length < 1 || !same(report.primary_failure, report.failures[0])) fail('GFMV_FAILURE_PRECEDENCE_INVALID', 2);
  const cleanup = report.failures.map((item, index) => item.code === 'GFM_CLEANUP_FAILED' ? index : -1).filter(index => index >= 0);
  if (cleanup.length > 1 || (cleanup.length === 1 && cleanup[0] !== 1)) fail('GFMV_FAILURE_PRECEDENCE_INVALID', 2);
  if (report.failures.some((item, index) => index > 0 && item.code !== 'GFM_CLEANUP_FAILED')) fail('GFMV_FAILURE_PRECEDENCE_INVALID', 2);
}

async function verifyBlockedStorage({ report, fixture, base, root, validateMarker }) {
  const source = `fixtures/${fixture.key}/storage`;
  const quarantine = `quarantine/${fixture.key}`;
  const cleanupFailure = report.failures.length === 2;
  if (!cleanupFailure) {
    if (root.paths.has(quarantine) || root.paths.has(`${quarantine}/storage`) || root.files.has(`${quarantine}/non-consumable.json`)) fail('GFMV_QUARANTINE_INVALID', 2);
    if (root.paths.has(source) && !await emptyDirectory(resolve(base, source))) fail('GFMV_ROOT_EXTRA_ENTRY', 2);
    return;
  }
  const markerPath = `${quarantine}/non-consumable.json`;
  const storagePath = `${quarantine}/storage`;
  if (root.paths.has(source) && !await emptyDirectory(resolve(base, source))) fail('GFMV_ROOT_EXTRA_ENTRY', 2);
  if (!root.files.has(markerPath) || !root.paths.has(storagePath) || root.paths.has(source)) fail('GFMV_QUARANTINE_INVALID', 2);
  const marker = await readJson(resolve(base, markerPath), 'GFMV_QUARANTINE_INVALID', 2);
  const payload = { ...marker }; delete payload.marker_payload_sha256;
  if (!validateMarker(marker) || marker.marker_payload_sha256 !== sha(jcs(payload)) || marker.change_id !== report.change_id || marker.fixture_ref_key !== fixture.key || marker.source_storage_path !== source || marker.quarantine_storage_path !== storagePath || marker.primary_failure_code !== report.primary_failure.code || marker.cleanup_failure_code !== 'GFM_CLEANUP_FAILED' || await emptyDirectory(resolve(base, storagePath))) fail('GFMV_QUARANTINE_INVALID', 2);
}

async function verifyDatabase(report, input, fixture, base, root) {
  const path = report.target_storage.database_ref.path;
  const expectedStorage = `fixtures/${fixture.key}/storage`;
  const expectedProject = `project.golden.fixture.${input.sha256}`;
  const expectedPath = `${expectedStorage}/projects/${expectedProject}/project.db`;
  if (report.target_storage.storage_root !== expectedStorage || path !== expectedPath || report.target_storage.database_ref.kind !== 'DATABASE') fail('GFMV_DATABASE_REF_MISMATCH', 2);
  if (!root.files.has(path)) return { missing: true };
  if (root.paths.has(`quarantine/${fixture.key}`) || await hasSidecar(resolve(base, path))) fail('GFMV_DATABASE_REF_MISMATCH', 2);
  const database = resolveInside(base, path, 'GFMV_DATABASE_REF_MISMATCH');
  const actual = await fileRef('DATABASE', base, database);
  if (!same(actual, report.target_storage.database_ref) || actual.sha256 !== report.target_storage.database_sha256) fail('GFMV_DATABASE_REF_MISMATCH', 2);
  if (!await onlyDatabaseTree(resolve(base, expectedStorage), database)) fail('GFMV_ROOT_EXTRA_ENTRY', 2);
  const state = { storage_schema_version: report.target_storage.storage_schema_version, project_id: report.materialized_identity.project_id, model_id: report.materialized_identity.model_id, revision_id: report.materialized_identity.revision_id, revision_sequence: report.materialized_identity.revision_sequence, draft_head_revision_id: report.materialized_identity.draft_head_revision_id, head_sequence: report.materialized_identity.head_sequence, profile_binding: report.runtime_binding, document_sha256: report.source_fixture_ref.sha256, table_counts: report.persistence.table_counts };
  if (report.target_storage.semantic_state_sha256 !== sha(jcs(state))) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2);
  await verifySqliteState(database, report, input);
  return { missing: false };
}

function verifyMaterializedIdentity(report, input) {
  const fixture = report.fixture_identity;
  const value = report.materialized_identity;
  if (value.project_id !== `project.golden.fixture.${input.sha256}` || value.model_id !== fixture.model_id || value.revision_id !== fixture.revision_id || value.revision_sequence !== fixture.revision_sequence || value.draft_head_revision_id !== fixture.revision_id || value.head_sequence !== fixture.revision_sequence || value.history_mode !== 'SINGLE_REVISION_SNAPSHOT') fail('GFMV_FIXTURE_IDENTITY_MISMATCH', 2);
}

function readFixture(bundle, ref) {
  if (!safeRelative(ref.archive_entry_path)) fail('GFMV_INPUT_REF_MISMATCH', 2);
  let entries; let bytes;
  try {
    entries = execFileSync('unzip', ['-Z1', bundle], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (entries.filter(value => value === ref.archive_entry_path).length !== 1) fail('GFMV_INPUT_REF_MISMATCH', 2);
    bytes = execFileSync('unzip', ['-p', bundle, ref.archive_entry_path], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    if (error.code?.startsWith('GFMV_')) throw error;
    fail('GFMV_IO_ERROR', 4);
  }
  let json;
  try { json = JSON.parse(bytes.toString('utf8')); } catch { fail('GFMV_FIXTURE_IDENTITY_MISMATCH', 2); }
  return { bytes, sha256: sha(bytes), json };
}

function normalizeBinding(value) {
  try {
    const asset = name => ({ id: value[name].id, version: value[name].version, sha256: value[name].sha256 ?? value[name].digest.digest });
    return { profile: asset('profile'), rule_set: asset('rule_set'), text_grammar: asset('text_grammar'), symbol_catalog: asset('symbol_catalog'), normalization_adapter: asset('normalization_adapter'), binding_digest: value.binding_digest.digest ?? value.binding_digest };
  } catch { fail('GFMV_BINDING_MISMATCH', 2); }
}

async function scanRoot(base, keys, dependencies = {}) {
  let details;
  try { details = await lstat(base); } catch (error) { if (error.code === 'ENOENT') return { files: new Set(), paths: new Set() }; fail('GFMV_IO_ERROR', 4); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('GFMV_ROOT_UNSAFE', 2);
  const files = new Set(); const paths = new Set();
  const walk = async (directory, relativePath = '') => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { fail('GFMV_IO_ERROR', 4); }
    const ordered = dependencies.enumerateEntries ? dependencies.enumerateEntries([...entries]) : entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of ordered) {
      const child = resolve(directory, entry.name); const current = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      let childInfo;
      try { childInfo = await lstat(child); } catch { fail('GFMV_IO_ERROR', 4); }
      if (childInfo.isSymbolicLink()) fail('GFMV_ROOT_UNSAFE', 2);
      if (childInfo.isDirectory()) { paths.add(current); await walk(child, current); continue; }
      if (!childInfo.isFile()) fail('GFMV_ROOT_UNSAFE', 2);
      files.add(current);
    }
  };
  await walk(base);
  for (const path of [...paths, ...files]) assertAllowedRootPath(path, keys);
  return { files, paths };
}

/** 只读计算根目录树摘要，供 pending attestation 与移动前重检共同使用。 */
export async function rootTreeDigest(base) {
  const root = resolve(base);
  const entries = [];
  const walk = async (directory) => {
    let children;
    try { children = await readdir(directory, { withFileTypes: true }); }
    catch { fail('GFMV_IO_ERROR', 4); }
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, child.name);
      let details;
      try { details = await lstat(path); }
      catch { fail('GFMV_IO_ERROR', 4); }
      const pathRelative = relative(root, path).split('\\').join('/');
      if (details.isSymbolicLink() || (!details.isDirectory() && !details.isFile())) fail('GFMV_ROOT_UNSAFE', 2);
      if (details.isDirectory()) {
        entries.push({ relative_path: pathRelative, type: 'DIRECTORY' });
        await walk(path);
      } else {
        entries.push({ relative_path: pathRelative, type: 'FILE', byte_length: details.size, raw_sha256: await shaFile(path) });
      }
    }
  };
  await walk(root);
  entries.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  return sha(jcs(entries));
}

function assertAllowedRootPath(path, keys) {
  const parts = path.split('/');
  if (parts[0] === 'reports' && parts.length === 2 && keys.has(parts[1].replace(/\.json$/, '')) && parts[1].endsWith('.json')) return;
  if (parts[0] === 'fixtures' && keys.has(parts[1]) && (parts.length === 2 || parts[2] === 'storage')) return;
  if (parts[0] === 'quarantine' && keys.has(parts[1]) && (parts.length === 2 || parts[2] === 'storage' || (parts.length === 3 && parts[2] === 'non-consumable.json'))) return;
  if ((path === 'reports' || path === 'fixtures' || path === 'quarantine')) return;
  fail('GFMV_ROOT_EXTRA_ENTRY', 2);
}

async function onlyDatabaseTree(storage, database) {
  if (!await regularDirectory(storage)) return false;
  const entries = await allFiles(storage);
  return entries.length === 1 && entries[0] === database;
}

async function allFiles(directory) {
  const files = [];
  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name); const details = await lstat(child);
      if (details.isSymbolicLink() || (!details.isDirectory() && !details.isFile())) return [];
      if (details.isDirectory()) await walk(child); else files.push(child);
    }
  };
  await walk(directory);
  return files;
}

async function emptyDirectory(path) {
  if (!await regularDirectory(path)) return false;
  return (await readdir(path)).length === 0;
}

async function directoryInfo(path, code) {
  let details;
  try { details = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; fail('GFMV_IO_ERROR', 4); }
  if (details.isSymbolicLink()) fail('GFMV_ROOT_UNSAFE', 2);
  if (!details.isDirectory()) return null;
  return { dev: details.dev, ino: details.ino };
}

async function hasSidecar(database) {
  for (const suffix of ['-wal', '-shm', '-journal']) if (await pathExists(`${database}${suffix}`)) return true;
  return false;
}

async function verifySqliteState(database, report, input) {
  const integrity = (await sqliteText(database, 'PRAGMA integrity_check;')).trim();
  const foreignKeys = (await sqliteText(database, 'PRAGMA foreign_key_check;')).trim();
  if (integrity !== 'ok' || foreignKeys !== '') fail('GFMV_SEMANTIC_STATE_MISMATCH', 2);
  const countSql = tables.map(table => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM ${table}`).join(' UNION ALL ');
  const counts = Object.fromEntries((await sqliteJson(database, countSql)).map(row => [row.table_name, row.row_count]));
  const identity = (await sqliteJson(database, `
    SELECT
      (SELECT project_id FROM project_metadata LIMIT 1) AS project_id,
      (SELECT model_id FROM model_catalog LIMIT 1) AS model_id,
      (SELECT profile_binding_json FROM model_catalog LIMIT 1) AS model_binding_json,
      (SELECT revision_id FROM revision_document LIMIT 1) AS revision_id,
      (SELECT revision_sequence FROM revision_document LIMIT 1) AS revision_sequence,
      (SELECT profile_binding_json FROM revision_document LIMIT 1) AS revision_binding_json,
      (SELECT schema_set_json FROM revision_document LIMIT 1) AS schema_set_json,
      (SELECT document_json FROM revision_document LIMIT 1) AS document_json,
      (SELECT document_digest FROM revision_document LIMIT 1) AS document_digest,
      (SELECT draft_head_revision_id FROM model_head LIMIT 1) AS head_revision_id,
      (SELECT head_sequence FROM model_head LIMIT 1) AS head_sequence
  `))[0];
  let modelBinding; let revisionBinding; let schemaSet;
  try { modelBinding = normalizeBinding(JSON.parse(identity.model_binding_json)); revisionBinding = normalizeBinding(JSON.parse(identity.revision_binding_json)); schemaSet = JSON.parse(identity.schema_set_json); }
  catch { fail('GFMV_SEMANTIC_STATE_MISMATCH', 2); }
  const fixture = input.json;
  if (!same(counts, report.persistence.table_counts)) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, 'SQLite table counts differ.');
  if (identity.project_id !== report.materialized_identity.project_id || identity.model_id !== report.materialized_identity.model_id || identity.revision_id !== report.materialized_identity.revision_id || identity.revision_sequence !== report.materialized_identity.revision_sequence || identity.head_revision_id !== report.materialized_identity.draft_head_revision_id || identity.head_sequence !== report.materialized_identity.head_sequence) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, 'SQLite identity differs.');
  if (identity.document_digest !== input.sha256 || identity.document_json !== input.bytes.toString('utf8')) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, 'SQLite revision document differs.');
  if (!same(modelBinding, report.runtime_binding) || !same(revisionBinding, report.runtime_binding)) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, 'SQLite binding differs.');
  if (!same(schemaSet, fixture.schema_set_ref)) fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, 'SQLite schema set differs.');
}

async function sqliteText(database, sql) {
  try { return (await sqlite('sqlite3', ['-readonly', sqliteUri(database), sql], { maxBuffer: 4 * 1024 * 1024 })).stdout; }
  catch (error) { sqliteFailure(error); }
}

async function sqliteJson(database, sql) {
  let stdout;
  try { stdout = (await sqlite('sqlite3', ['-readonly', '-json', sqliteUri(database), sql], { maxBuffer: 4 * 1024 * 1024 })).stdout; }
  catch (error) { sqliteFailure(error); }
  try { return JSON.parse(stdout); } catch { fail('GFMV_SEMANTIC_STATE_MISMATCH', 2); }
}

function sqliteFailure(error) {
  if (error?.code === 'ENOENT') fail('GFMV_INTERNAL_ERROR', 4, 'SQLite verifier adapter is unavailable.');
  if (error?.code === 'EACCES' || error?.code === 'EIO') fail('GFMV_IO_ERROR', 4, 'SQLite verifier read failed.');
  const detail = String(error?.stderr ?? '').replace(/[\r\n]+/g, ' ').slice(0, 160);
  fail('GFMV_SEMANTIC_STATE_MISMATCH', 2, detail ? `SQLite cannot satisfy the declared read contract: ${detail}` : 'SQLite cannot satisfy the declared read contract.');
}

function sqliteUri(database) { return `file:${database}?immutable=1`; }

async function fileRef(kind, base, file) {
  const details = await stat(file); return { kind, path: relative(base, file), byte_length: details.size, sha256: await shaFile(file) };
}
async function regularFile(path) { try { return (await lstat(path)).isFile(); } catch { return false; } }
async function regularDirectory(path) { try { const details = await lstat(path); return details.isDirectory() && !details.isSymbolicLink(); } catch { return false; } }
async function pathExists(path) { try { await lstat(path); return true; } catch { return false; } }
async function shaFile(path) { try { return sha(await readFile(path)); } catch { fail('GFMV_IO_ERROR', 4); } }
async function readJson(path, code, exitCode) { let content; try { content = await readFile(path, 'utf8'); } catch { fail('GFMV_IO_ERROR', 4); } try { return JSON.parse(content); } catch { fail(code, exitCode); } }
function args(argv) { const allowed = new Set(['plan', 'materialization-root', 'fixture-ref-key', 'require-materialized']); const result = new Map(); for (let index = 0; index < argv.length;) { const flag = argv[index++]; const name = flag?.startsWith('--') ? flag.slice(2) : ''; if (!allowed.has(name) || result.has(name)) fail('GFMV_ARGUMENT_INVALID', 2); if (name === 'require-materialized') { result.set(name, true); continue; } const value = argv[index++]; if (!value) fail('GFMV_ARGUMENT_INVALID', 2); result.set(name, value); } return result; }
function requiredPath(options, name) { const value = options.get(name); if (typeof value !== 'string') fail('GFMV_ARGUMENT_INVALID', 2); return resolve(value); }
function resolveInside(base, value, code) { if (!safeRelative(value)) fail(code, 2); const result = resolve(base, value); if (result !== resolve(base) && !result.startsWith(`${resolve(base)}${sep}`)) fail(code, 2); return result; }
function safeRelative(value) { return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && !value.includes('//'); }
function fileReference(value) { return value && typeof value === 'object' && typeof value.kind === 'string' && safeRelative(value.path) && Number.isInteger(value.byte_length) && typeof value.sha256 === 'string'; }
function same(left, right) { return jcs(left) === jcs(right); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
function fail(code, exitCode, message = code) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
