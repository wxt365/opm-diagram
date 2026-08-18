import { access, appendFile, copyFile, cp, mkdir, readFile, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rootTreeDigest } from './canvas06-golden-verifier-controlled-support.mjs';
import { main as verify, verifyPendingQuarantine } from './verify-canvas06-golden-materialization.mjs';

const sqlite = promisify(execFile);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    console.error(error.code ?? 'GFMV_CONTROLLED_RUNNER_INTERNAL_ERROR');
    if (error.message) console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseOptions(argv);
  const planPath = resolve(required(options, 'plan'));
  const baseRoot = resolve(required(options, 'base-root'));
  const outputRoot = resolve(required(options, 'output-root'));
  if (!await exists(planPath) || !await directory(baseRoot)) fail('GFMV_CONTROLLED_RUNNER_INPUT_INVALID', 2, 'Plan or controlled base root is unavailable.');
  if (await exists(outputRoot)) fail('GFMV_CONTROLLED_RUNNER_OUTPUT_EXISTS', 3, 'Controlled case output root must not exist.');
  const inputs = JSON.parse(await readFile(resolve(dirname(planPath), '..', 'controlled-inputs.json'), 'utf8'));
  const selectedKey = inputs.aliases?.K001;
  if (!/^[a-f0-9]{64}$/.test(selectedKey ?? '')) fail('GFMV_CONTROLLED_RUNNER_INPUT_INVALID', 2, 'Controlled alias K001 is unavailable.');
  const runVerifier = dependencies.verifier ?? verify;
  const runPendingVerifier = dependencies.pendingVerifier ?? verifyPendingQuarantine;
  const cases = dependencies.cases ?? controlledCases(inputs.aliases);
  await mkdir(outputRoot, { recursive: true });
  const results = [];
  for (const controlled of cases) {
    const caseRoot = resolve(outputRoot, controlled.case_id);
    const materializationRoot = resolve(caseRoot, 'materialization-root');
    await mkdir(caseRoot);
    const casePlanPath = controlled.preparePlan ? resolve(caseRoot, 'capture-plan.json') : planPath;
    if (controlled.preparePlan) { await copyFile(planPath, casePlanPath); await controlled.preparePlan(casePlanPath); }
    await cp(baseRoot, materializationRoot, { recursive: true, force: false, verbatimSymlinks: true });
    await controlled.prepare?.({ materializationRoot, aliases: inputs.aliases });
    const before = await rootTreeDigest(materializationRoot);
    const invocation = controlled.pending
      ? controlled.pendingArgs({ planPath: casePlanPath, materializationRoot, selectedKey })
      : controlled.argv({ planPath: casePlanPath, materializationRoot, selectedKey });
    const runner = controlled.pending ? runPendingVerifier : runVerifier;
    const result = await execute(runner, invocation, controlled.dependencies);
    for (const enumerateEntries of enumerationModes()) {
      const repeated = await execute(runner, invocation, { ...controlled.dependencies, enumerateEntries });
      if (repeated.exitCode !== result.exitCode || repeated.top_code !== result.top_code) fail('GFMV_CONTROLLED_ENUMERATION_MISMATCH', 4, `${controlled.case_id} enumeration changed the verifier result.`);
    }
    const after = await rootTreeDigest(materializationRoot);
    if (before !== after) fail('GFMV_CONTROLLED_TREE_MUTATED', 4, `${controlled.case_id} changed the case root.`);
    if (result.exitCode !== controlled.expected_exit_code || result.top_code !== controlled.expected_top_code) {
      fail('GFMV_CONTROLLED_EXPECTATION_MISMATCH', 4, `${controlled.case_id} returned an unexpected verifier result.`);
    }
    const expected = { case_id: controlled.case_id, mode: controlled.mode, selected_fixture_alias: controlled.selected ? 'K001' : null, expected_exit_code: controlled.expected_exit_code, expected_top_code: controlled.expected_top_code, root_digest_before: before, root_digest_after: after };
    await writeFile(resolve(caseRoot, 'expected.json'), `${JSON.stringify(expected)}\n`, { flag: 'wx' });
    results.push(expected);
  }
  return results;
}

export function controlledCases(aliases) {
  const argv = ({ planPath, materializationRoot, selectedKey: key }, selected) => [
    '--plan', planPath, '--materialization-root', materializationRoot,
    ...(selected ? ['--fixture-ref-key', key] : []), '--require-materialized'
  ];
  return [
    { case_id: 'GFMV-BASE-001', mode: 'full required', selected: false, expected_exit_code: 0, expected_top_code: null, argv: values => argv(values, false) },
    { case_id: 'GFMV-RP-001', mode: 'selected required', selected: true, expected_exit_code: 0, expected_top_code: null, argv: values => argv(values, true) },
    blockedCase('GFMV-RP-002', 'binding', true),
    blockedCase('GFMV-RP-003', 'storage', true),
    blockedCase('GFMV-RP-004', 'persistence', true),
    blockedCase('GFMV-RP-005', 'content', true),
    blockedCase('GFMV-RP-006', 'cleanup', true),
    reportCase('GFMV-RN-001', 'GFMV_REPORT_SCHEMA_INVALID', report => { report.checks.pop(); }),
    reportCase('GFMV-RN-002', 'GFMV_CHECK_SEQUENCE_INVALID', report => { report.checks[1].check_id = report.checks[0].check_id; }),
    reportCase('GFMV-RN-003', 'GFMV_CHECK_SEQUENCE_INVALID', report => { [report.checks[0], report.checks[1]] = [report.checks[1], report.checks[0]]; }),
    reportCase('GFMV-RN-004', 'GFMV_REPORT_IDENTITY_MISMATCH', report => { report.report_id = replaceLastDigestNibble(report.report_id); }),
    reportCase('GFMV-RN-005', 'GFMV_REPORT_IDENTITY_MISMATCH', report => { report.materialization_id = replaceLastDigestNibble(report.materialization_id); }),
    reportCase('GFMV-RN-006', 'GFMV_REPORT_IDENTITY_MISMATCH', report => { report.change_id = 'GOLDEN-CANVAS06-20260801-902'; }),
    reportCase('GFMV-RN-007', 'GFMV_REPORT_IDENTITY_MISMATCH', report => { report.fixture_ref_key = aliases.K002; }),
    reportCase('GFMV-RN-008', 'GFMV_REPORT_PAYLOAD_MISMATCH', report => { report.persistence.stage_durations_us.verify += 1; }, false, 'storage', false),
    reportCase('GFMV-RN-009', 'GFMV_INPUT_REF_MISMATCH', report => { report.capture_plan_ref.sha256 = '0'.repeat(64); }),
    reportCase('GFMV-RN-010', 'GFMV_INPUT_REF_MISMATCH', report => { report.evidence_bundle_ref.sha256 = '0'.repeat(64); }),
    reportCase('GFMV-RN-011', 'GFMV_INPUT_REF_MISMATCH', report => { report.source_fixture_ref.sha256 = '0'.repeat(64); }),
    reportCase('GFMV-RN-012', 'GFMV_BINDING_MISMATCH', report => { report.runtime_binding.binding_digest = '0'.repeat(64); }),
    reportCase('GFMV-RN-013', 'GFMV_FIXTURE_IDENTITY_MISMATCH', report => { report.fixture_identity.model_id = 'model.controlled.tampered'; }),
    reportCase('GFMV-RN-014', 'GFMV_FIXTURE_IDENTITY_MISMATCH', report => { report.materialized_identity.model_id = 'model.controlled.tampered'; }),
    reportCase('GFMV-RN-015', 'GFMV_FIXTURE_IDENTITY_MISMATCH', report => { report.fixture_identity.model_id = 'model.placeholder'; }, true, 'storage'),
    reportCase('GFMV-RN-016', 'GFMV_FAILURE_PRECEDENCE_INVALID', report => { report.primary_failure = { code: 'GFM_STORAGE_VERIFY_FAILED', message_key: 'gfm.other.failure' }; }, true, 'persistence'),
    reportCase('GFMV-RN-017', 'GFMV_REPORT_SCHEMA_INVALID', report => { report.target_storage = {}; }, true, 'storage'),
    databaseCase('GFMV-RN-018', 'GFMV_DATABASE_REF_MISMATCH', async path => await appendFile(path, 'raw-mismatch')),
    databaseCase('GFMV-RN-019', 'GFMV_SEMANTIC_STATE_MISMATCH', async path => { await sqlite('sqlite3', [path, 'UPDATE model_head SET head_sequence = 999;']); await removeSidecars(path); }, true),
    databaseCase('GFMV-RN-020', 'GFMV_DATABASE_REF_MISMATCH', async path => await writeFile(`${path}-wal`, 'sidecar')),
    databaseCase('GFMV-RN-021', 'GFMV_SEMANTIC_STATE_MISMATCH', async path => { const bytes = await readFile(path); bytes[0] ^= 0xff; await writeFile(path, bytes); }, true),
    rootCase('GFMV-XN-001', 'GFMV_ROOT_INCOMPLETE', 3, async ({ materializationRoot, aliases }) => await removeFixture(materializationRoot, aliases.K002)),
    rootCase('GFMV-XN-002', 'GFMV_ROOT_INCOMPLETE', 3, async ({ materializationRoot, aliases }) => await Promise.all(Object.entries(aliases).filter(([alias]) => alias !== 'K001').map(([, key]) => removeFixture(materializationRoot, key)))),
    rootCase('GFMV-XN-003', 'GFMV_ROOT_EXTRA_ENTRY', 2, async ({ materializationRoot }) => await writeFile(resolve(materializationRoot, 'reports', `${'f'.repeat(64)}.json`), '{}')),
    rootCase('GFMV-XN-004', 'GFMV_ROOT_EXTRA_ENTRY', 2, async ({ materializationRoot }) => await writeFile(resolve(materializationRoot, 'reports', `${'e'.repeat(64)}.json`), '{}')),
    rootCase('GFMV-XN-005', 'GFMV_ROOT_EXTRA_ENTRY', 2, async ({ materializationRoot, aliases }) => await writeFile(resolve(materializationRoot, 'fixtures', aliases.K001, 'storage', 'extra.db'), 'extra')),
    rootCase('GFMV-XN-008', 'GFMV_ROOT_EXTRA_ENTRY', 2, async ({ materializationRoot }) => await writeFile(resolve(materializationRoot, 'dangling.tmp'), 'tmp')),
    rootCase('GFMV-XN-006', 'GFMV_ROOT_UNSAFE', 2, async ({ materializationRoot }) => { const target = `${materializationRoot}.target`; await rename(materializationRoot, target); await symlink(target, materializationRoot); }),
    rootCase('GFMV-XN-007', 'GFMV_ROOT_UNSAFE', 2, async ({ materializationRoot }) => { const reports = resolve(materializationRoot, 'reports'); const target = `${reports}.target`; await rename(reports, target); await symlink(target, reports); }),
    quarantineCase('GFMV-XN-009', 'GFMV_QUARANTINE_INVALID', async ({ quarantine }) => await rm(resolve(quarantine, 'storage'), { recursive: true, force: false })),
    quarantineCase('GFMV-XN-010', 'GFMV_QUARANTINE_INVALID', async ({ quarantine }) => await rm(resolve(quarantine, 'non-consumable.json'), { force: false })),
    quarantineCase('GFMV-XN-011', 'GFMV_QUARANTINE_INVALID', async ({ quarantine }) => { const path = resolve(quarantine, 'non-consumable.json'); const marker = JSON.parse(await readFile(path, 'utf8')); marker.marker_payload_sha256 = '0'.repeat(64); await writeFile(path, `${JSON.stringify(marker)}\n`); }),
    quarantineCase('GFMV-XN-012', 'GFMV_QUARANTINE_INVALID', async ({ quarantine }) => { const path = resolve(quarantine, 'non-consumable.json'); const marker = JSON.parse(await readFile(path, 'utf8')); marker.primary_failure_code = 'GFM_STORAGE_VERIFY_FAILED'; const payload = { ...marker }; delete payload.marker_payload_sha256; marker.marker_payload_sha256 = sha(jcs(payload)); await writeFile(path, `${JSON.stringify(marker)}\n`); }),
    databaseCase('GFMV-XN-013', 'GFMV_DATABASE_REF_MISMATCH', async () => {}, true, true),
    quarantineCase('GFMV-XN-014', 'GFMV_ROOT_EXTRA_ENTRY', async ({ materializationRoot, key }) => { await mkdir(resolve(materializationRoot, 'fixtures', key, 'storage'), { recursive: true }); await writeFile(resolve(materializationRoot, 'fixtures', key, 'storage', 'residual'), 'residual'); }),
    faultCase('GFMV-XN-015', 'GFMV_IO_ERROR', 'IO'),
    faultCase('GFMV-XN-016', 'GFMV_INTERNAL_ERROR', 'INTERNAL'),
    { case_id: 'GFMV-XN-017', mode: 'full diagnostic', selected: false, expected_exit_code: 2, expected_top_code: 'GFMV_PLAN_INVALID', argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot], preparePlan: async path => { const plan = JSON.parse(await readFile(path, 'utf8')); plan.plan_status = 'DRAFT'; await writeFile(path, `${JSON.stringify(plan)}\n`); } },
    { case_id: 'GFMV-XN-018', mode: 'selected diagnostic', selected: true, expected_exit_code: 2, expected_top_code: 'GFMV_FIXTURE_KEY_NOT_IN_PLAN', argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot, '--fixture-ref-key', 'f'.repeat(64)] },
    { case_id: 'GFMV-XN-019', mode: 'CLI invalid', selected: false, expected_exit_code: 2, expected_top_code: 'GFMV_ARGUMENT_INVALID', argv: values => ['--plan', values.planPath, '--plan', values.planPath, '--materialization-root', values.materializationRoot] },
    { case_id: 'GFMV-PRI-001', mode: 'CLI priority', selected: false, expected_exit_code: 2, expected_top_code: 'GFMV_ARGUMENT_INVALID', argv: values => ['--plan', values.planPath, '--plan', values.planPath, '--materialization-root', values.materializationRoot] },
    rootCase('GFMV-PRI-002', 'GFMV_ROOT_UNSAFE', 2, async ({ materializationRoot, aliases }) => { await mutateFixtureReport(materializationRoot, aliases.K001, report => { [report.checks[0], report.checks[1]] = [report.checks[1], report.checks[0]]; }, true); const reports = resolve(materializationRoot, 'reports'); const target = `${reports}.target`; await rename(reports, target); await symlink(target, reports); }),
    priorityCase('GFMV-PRI-003', 'GFMV_REPORT_PAYLOAD_MISMATCH', async ({ materializationRoot, aliases }) => { await mutateFixtureReport(materializationRoot, aliases.K001, report => { report.persistence.stage_durations_us.verify += 1; }, false); await mutateFixtureReport(materializationRoot, aliases.K002, report => { report.checks.pop(); }, true); }),
    priorityCase('GFMV-PRI-004', 'GFMV_REPORT_SCHEMA_INVALID', async ({ materializationRoot, aliases }) => await mutateFixtureReport(materializationRoot, aliases.K001, report => { report.checks.pop(); report.persistence.stage_durations_us.verify += 1; }, false)),
    rootCase('GFMV-PRI-005', 'GFMV_ROOT_INCOMPLETE', 3, async ({ materializationRoot, aliases }) => { await blockFixture(materializationRoot, aliases.K001, 'storage'); await removeFixture(materializationRoot, aliases.K002); }),
    { case_id: 'GFMV-XP-001', mode: 'full required', selected: false, expected_exit_code: 0, expected_top_code: null, argv: values => argv(values, false) },
    { case_id: 'GFMV-XP-002', mode: 'selected required', selected: true, expected_exit_code: 0, expected_top_code: null, argv: values => argv(values, true) },
    blockedCase('GFMV-XP-003', 'storage', false),
    blockedCase('GFMV-XP-004', 'cleanup', false),
    { case_id: 'GFMV-XP-005', mode: 'full diagnostic', selected: false, expected_exit_code: 3, expected_top_code: 'GFMV_ROOT_INCOMPLETE', argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot], prepare: async ({ materializationRoot }) => await removeFixture(materializationRoot, aliases.K002) },
    pendingCase('GFMV-PQP-001', null, 0),
    pendingCase('GFMV-PQN-001', 'GFMV_FAILURE_PRECEDENCE_INVALID', 2, async ({ materializationRoot, aliases }) => await mutateFixtureReport(materializationRoot, aliases.K001, report => { report.failures = [report.primary_failure]; }, true)),
    pendingCase('GFMV-PQN-002', 'GFMV_PENDING_QUARANTINE_INVALID', 2, async ({ materializationRoot, aliases }) => await rm(resolve(materializationRoot, 'fixtures', aliases.K001, 'storage'), { recursive: true, force: false })),
    pendingCase('GFMV-PQN-003', 'GFMV_ROOT_UNSAFE', 2, async ({ materializationRoot, aliases }) => { const source = resolve(materializationRoot, 'fixtures', aliases.K001, 'storage'); await rm(source, { recursive: true, force: false }); await symlink(resolve(materializationRoot, 'fixtures', aliases.K001), source); }),
    pendingCase('GFMV-PQN-004', 'GFMV_PENDING_QUARANTINE_INVALID', 2, async ({ materializationRoot, aliases }) => await mkdir(resolve(materializationRoot, 'quarantine', aliases.K001, 'storage'), { recursive: true })),
    pendingCase('GFMV-PQN-005', 'GFMV_ROOT_EXTRA_ENTRY', 2, async ({ materializationRoot }) => await writeFile(resolve(materializationRoot, 'unexpected-pending-artifact'), 'unexpected'))
  ];
}

function blockedCase(caseId, kind, selected) {
  return {
    case_id: caseId,
    mode: selected ? 'selected diagnostic' : 'full diagnostic',
    selected,
    expected_exit_code: 3,
    expected_top_code: 'GFMV_ROOT_NOT_CONSUMABLE',
    argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot, ...(selected ? ['--fixture-ref-key', values.selectedKey] : [])],
    prepare: async ({ materializationRoot, aliases }) => await blockFixture(materializationRoot, aliases.K001, kind)
  };
}

function reportCase(caseId, topCode, mutate, fromBlocked = false, blockedKind = 'storage', recomputePayload = true) {
  return {
    case_id: caseId, mode: 'selected diagnostic', selected: true, expected_exit_code: 2, expected_top_code: topCode,
    argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot, '--fixture-ref-key', values.selectedKey],
    prepare: async ({ materializationRoot, aliases }) => {
      if (fromBlocked) await blockFixture(materializationRoot, aliases.K001, blockedKind);
      await mutateFixtureReport(materializationRoot, aliases.K001, mutate, recomputePayload);
    }
  };
}

function databaseCase(caseId, topCode, mutate, updateRawReference = false) {
  return {
    case_id: caseId, mode: 'selected diagnostic', selected: true, expected_exit_code: 2, expected_top_code: topCode,
    argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot, '--fixture-ref-key', values.selectedKey],
    prepare: async ({ materializationRoot, aliases }) => {
      if (caseId === 'GFMV-XN-013') return await crossReferenceDatabase(materializationRoot, aliases.K001, aliases.K002);
      await mutateFixtureDatabase(materializationRoot, aliases.K001, mutate, updateRawReference);
    }
  };
}

function quarantineCase(caseId, topCode, mutate) { return rootCase(caseId, topCode, 2, async ({ materializationRoot, aliases }) => { await blockFixture(materializationRoot, aliases.K001, 'cleanup'); await mutate({ materializationRoot, key: aliases.K001, quarantine: resolve(materializationRoot, 'quarantine', aliases.K001) }); }); }

function rootCase(caseId, topCode, exitCode, prepare) {
  return { case_id: caseId, mode: 'full diagnostic', selected: false, expected_exit_code: exitCode, expected_top_code: topCode, argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot], prepare };
}

function priorityCase(caseId, topCode, prepare) { return rootCase(caseId, topCode, 2, prepare); }

function faultCase(caseId, topCode, fault) { return { case_id: caseId, mode: 'selected diagnostic', selected: true, expected_exit_code: 4, expected_top_code: topCode, argv: values => ['--plan', values.planPath, '--materialization-root', values.materializationRoot, '--fixture-ref-key', values.selectedKey], dependencies: { fault } }; }

function pendingCase(caseId, topCode, exitCode, mutate) {
  return {
    case_id: caseId,
    mode: 'pending-quarantine prevalidation',
    selected: true,
    pending: true,
    expected_exit_code: exitCode,
    expected_top_code: topCode,
    pendingArgs: ({ planPath, materializationRoot, selectedKey }) => ({
      capturePlanPath: planPath,
      materializationRoot,
      fixtureRefKey: selectedKey,
      reportRelativePath: `reports/${selectedKey}.json`,
      sourceStorageRelativePath: `fixtures/${selectedKey}/storage`,
      quarantineStorageRelativePath: `quarantine/${selectedKey}/storage`,
      markerRelativePath: `quarantine/${selectedKey}/non-consumable.json`
    }),
    prepare: async ({ materializationRoot, aliases }) => {
      await blockFixture(materializationRoot, aliases.K001, 'pending-cleanup');
      await mutate?.({ materializationRoot, aliases });
    }
  };
}

async function blockFixture(materializationRoot, key, kind) {
  const reportPath = resolve(materializationRoot, 'reports', `${key}.json`);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const primary = kind === 'binding'
    ? { code: 'GFM_BINDING_MISMATCH', message_key: 'gfm.binding.mismatch' }
    : { code: kind === 'content' ? 'GFM_REPORT_CONTENT_INVALID' : 'GFM_STORAGE_WRITE_FAILED', message_key: 'gfm.controlled.blocked' };
  report.report_status = 'BLOCKED';
  report.primary_failure = primary;
  report.failures = ['cleanup', 'pending-cleanup'].includes(kind) ? [primary, { code: 'GFM_CLEANUP_FAILED', message_key: 'gfm.cleanup.failed' }] : [primary];
  delete report.materialized_identity; delete report.target_storage; delete report.persistence;
  report.checks = report.checks.map((check, index) => ({ check_id: check.check_id, status: index < 8 || (kind !== 'binding' && index === 8) || ['persistence', 'content', 'cleanup', 'pending-cleanup'].includes(kind) ? 'PASSED' : index === 9 && kind !== 'binding' ? 'FAILED' : index === 8 ? 'FAILED' : 'NOT_RUN', ...(index === 8 && kind === 'binding' ? { code: 'GFM_BINDING_MISMATCH' } : index === 9 && ['storage'].includes(kind) ? { code: primary.code } : index === 9 && kind === 'binding' ? { code: 'NOT_RUN' } : {}) }));
  if (kind === 'binding') report.runtime_binding.binding_digest = '0'.repeat(64);
  report.report_payload_sha256 = payloadSha(report);
  await writeFile(reportPath, `${JSON.stringify(report)}\n`);
  const storage = resolve(materializationRoot, 'fixtures', key, 'storage');
  if (kind === 'cleanup') {
    const quarantine = resolve(materializationRoot, 'quarantine', key, 'storage');
    await mkdir(resolve(quarantine, '..'), { recursive: true });
    await rename(storage, quarantine);
    const marker = { schema_id: 'OPM-DEV-CANVAS-06-GFM-QUARANTINE-MARKER-001', schema_version: '0.1', change_id: report.change_id, fixture_ref_key: key, source_storage_path: `fixtures/${key}/storage`, quarantine_storage_path: `quarantine/${key}/storage`, primary_failure_code: primary.code, cleanup_failure_code: 'GFM_CLEANUP_FAILED', generated_at: report.generated_at };
    marker.marker_payload_sha256 = sha(jcs(marker));
    await writeFile(resolve(quarantine, '..', 'non-consumable.json'), `${JSON.stringify(marker)}\n`, { flag: 'wx' });
  } else if (kind !== 'pending-cleanup') {
    await rm(storage, { recursive: true, force: false });
  }
}

async function removeFixture(materializationRoot, key) {
  await rm(resolve(materializationRoot, 'reports', `${key}.json`), { force: false });
  await rm(resolve(materializationRoot, 'fixtures', key), { recursive: true, force: false });
}

async function mutateFixtureReport(materializationRoot, key, mutate, recomputePayload) {
  const path = resolve(materializationRoot, 'reports', `${key}.json`);
  const report = JSON.parse(await readFile(path, 'utf8'));
  mutate(report);
  if (recomputePayload) report.report_payload_sha256 = payloadSha(report);
  await writeFile(path, `${JSON.stringify(report)}\n`);
}

async function mutateFixtureDatabase(materializationRoot, key, mutate, updateRawReference) {
  const reportPath = resolve(materializationRoot, 'reports', `${key}.json`);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const database = resolve(materializationRoot, report.target_storage.database_ref.path);
  await mutate(database);
  if (!updateRawReference) return;
  const details = await stat(database); const digest = sha(await readFile(database));
  report.target_storage.database_ref.byte_length = details.size;
  report.target_storage.database_ref.sha256 = digest;
  report.target_storage.database_sha256 = digest;
  report.report_payload_sha256 = payloadSha(report);
  await writeFile(reportPath, `${JSON.stringify(report)}\n`);
}

async function crossReferenceDatabase(materializationRoot, key, otherKey) { const path = resolve(materializationRoot, 'reports', `${key}.json`); const report = JSON.parse(await readFile(path, 'utf8')); const other = JSON.parse(await readFile(resolve(materializationRoot, 'reports', `${otherKey}.json`), 'utf8')); report.target_storage.database_ref = other.target_storage.database_ref; report.target_storage.database_sha256 = other.target_storage.database_sha256; report.report_payload_sha256 = payloadSha(report); await writeFile(path, `${JSON.stringify(report)}\n`); }

async function removeSidecars(path) { for (const suffix of ['-wal', '-shm', '-journal']) { try { await unlink(`${path}${suffix}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } } }

async function execute(verifier, argv, dependencies) {
  try { await verifier(argv, dependencies); return { exitCode: 0, top_code: null }; }
  catch (error) { return { exitCode: error.exitCode ?? 4, top_code: error.code ?? 'GFMV_INTERNAL_ERROR' }; }
}

function parseOptions(argv) {
  const allowed = new Set(['plan', 'base-root', 'output-root']); const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1]; const name = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(name) || !value || options.has(name)) fail('GFMV_CONTROLLED_RUNNER_ARGUMENT_INVALID', 2, 'Invalid controlled runner options.');
    options.set(name, value);
  }
  return options;
}

function required(options, name) { const value = options.get(name); if (!value) fail('GFMV_CONTROLLED_RUNNER_ARGUMENT_INVALID', 2, `--${name} is required.`); return value; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function directory(path) { try { return (await (await import('node:fs/promises')).lstat(path)).isDirectory(); } catch { return false; } }
function dirname(path) { return resolve(path, '..'); }
function payloadSha(report) { const value = { ...report }; delete value.report_payload_sha256; return sha(jcs(value)); }
function replaceLastDigestNibble(value) { return `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`; }
function enumerationModes() { return [entries => entries.sort((left, right) => left.name.localeCompare(right.name)).reverse(), entries => entries.sort((left, right) => sha(left.name).localeCompare(sha(right.name)))]; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; }
function fail(code, exitCode, message) { const error = new Error(message ?? code); error.code = code; error.exitCode = exitCode; throw error; }
