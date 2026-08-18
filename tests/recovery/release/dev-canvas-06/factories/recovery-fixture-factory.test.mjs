import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { RecoveryFixtureFactoryError, loadRecoveryTemplate, materializeRecoveryAttempt, verifyAttemptMaterialization } from './recovery-fixture-factory.mjs';

const repositoryRoot = resolve('.');
const profileRoot = 'packages/profiles/profile.iso19450.2024.draft/0.2.0';
const handoffPath = `${profileRoot}/handoff/dev-canvas-05-handoff.json`;
const intakePath = `${profileRoot}/handoff/releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json`;
const runtimePath = `${profileRoot}/handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar`;
const templateRoot = 'dev-canvas-06/recovery/fixtures/templates/0.1.0';
const manifestPath = 'dev-canvas-06/recovery/recovery-manifest-v02.json';
const execFile = promisify(execFileCallback);
const reopenCatalogPath = 'dev-canvas-06/recovery/fixtures/catalogs/0.1.0/recovery-reopen-expectation-catalog.json';

test('loads a Manifest 0.2 Template only after the exact trust chain closes', async t => {
  const evidence = await createEvidenceRoot(t);
  const result = await loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef: evidence.manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  });

  assert.equal(result.fixture_id, 'RECOVERY-FIXTURE-MODEL');
  assert.equal(result.model_base_inputs.length, 4);
  assert.equal(result.profile_source_refs.profile_ref.kind, 'PROFILE_PACKAGE');
  assert.equal(result.runtime_jar_ref.sha256, evidence.runtimeRef.sha256);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.model_base_inputs), true);
});

test('rejects a Manifest 0.2 fixture reference that differs from immutable Template bytes', async t => {
  const evidence = await createEvidenceRoot(t);
  const broken = structuredClone(evidence.manifest);
  broken.fixture_catalog[0].source_ref.sha256 = '0'.repeat(64);
  await writeJson(resolve(evidence.root, manifestPath), broken);
  const manifestRef = await reference(evidence.root, manifestPath, 'RECOVERY_MANIFEST');

  await rejects(() => loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  }));
});

test('rejects a non-READY Intake before returning a partial Template', async t => {
  const evidence = await createEvidenceRoot(t);
  const intake = JSON.parse(await readFile(resolve(evidence.root, intakePath), 'utf8'));
  intake.intake_status = 'BLOCKED';
  await writeJson(resolve(evidence.root, intakePath), intake);
  const intakeRef = await reference(evidence.root, intakePath, 'INTAKE_REPORT');
  const manifest = structuredClone(evidence.manifest);
  manifest.intake_report_ref = intakeRef;
  await writeJson(resolve(evidence.root, manifestPath), manifest);
  const manifestRef = await reference(evidence.root, manifestPath, 'RECOVERY_MANIFEST');

  await rejects(() => loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  }));
});

test('rejects the frozen Runtime JAR before staging when its Helper surface is incomplete', async t => {
  const javaHome = process.env.JAVA_HOME;
  assert.ok(javaHome, 'JAVA_HOME is required for Recovery Factory integration testing');
  await execFile('mvn', [
    '-pl', 'services/recovery-test-tools', '-am', '-DskipTests',
    '-Dproject.build.outputTimestamp=1785758631',
    '-Dopm.recovery.sourceCommit=b940ac9bb73442c3a697cce8bfa7c9df52856b3a', 'package'
  ], { cwd: repositoryRoot, env: { ...process.env, JAVA_HOME: javaHome } });
  const evidence = await createEvidenceRoot(t);
  const helperPath = 'dev-canvas-06/recovery/build/recovery-test-tools.jar';
  await copy(evidence.root, helperPath, 'services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar');
  const helperRef = await reference(evidence.root, helperPath, 'RECOVERY_TEST_TOOLS_JAR');
  const model = await loadRecoveryTemplate({
    evidenceRoot: evidence.root, manifestRef: evidence.manifestRef,
    templateSourceRef: evidence.modelRef, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  });
  const gate = await loadRecoveryTemplate({
    evidenceRoot: evidence.root, manifestRef: evidence.manifestRef,
    templateSourceRef: evidence.gateRef, expectedFixtureId: 'RECOVERY-FIXTURE-GATE'
  });
  const caseDefinition = evidence.manifest.case_catalog.find(value => value.case_id === 'RCV-CANVAS-001.RULE_IDENTITY');
  const attemptRoot = resolve(evidence.root, 'dev-canvas-06/recovery/attempts/RCV-CANVAS-001.RULE_IDENTITY/1');
  await mkdir(resolve(attemptRoot, '..'), { recursive: true });

  await assert.rejects(() => materializeRecoveryAttempt({
    evidenceRoot: evidence.root, modelTemplate: model, gateTemplate: gate, gateFixtureRef: null,
    factoryHelperJarRef: helperRef, caseDefinition, attemptOrdinal: 1, attemptRoot, sourceDateEpoch: 1785758631
  }), error => error instanceof RecoveryFixtureFactoryError && error.code === 'RECOVERY_BUILD_MISMATCH' && error.exitCode === 2);
  await assert.rejects(() => readFile(resolve(attemptRoot, 'fixture/materialization.json')));
});

async function createEvidenceRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-recovery-fixture-factory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modelTemplate = JSON.parse(await readFile(resolve(repositoryRoot, `tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json`), 'utf8'));
  const gateTemplate = JSON.parse(await readFile(resolve(repositoryRoot, `tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json`), 'utf8'));
  const reopenCatalog = JSON.parse(await readFile(resolve(repositoryRoot, 'tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json'), 'utf8'));

  await cp(resolve(repositoryRoot, 'tests/recovery/release/dev-canvas-06/templates/0.1.0'), resolve(root, templateRoot), { recursive: true });
  await copy(root, handoffPath);
  await copy(root, intakePath);
  await copy(root, runtimePath);
  await copy(root, `${profileRoot}/profile.json`);
  for (const path of ['rules/representative-rule-set.json', 'symbols/representative-symbol-catalog.json', 'grammar/representative-opl-grammar.json', 'normalization/representative-normalization.json']) {
    await copy(root, `${profileRoot}/${path}`);
  }
  for (const scenario of modelTemplate.command_scenarios) await copy(root, scenario.base_revision_ref.path);
  await mkdir(resolve(root, 'dev-canvas-06/recovery/fixtures/catalogs/0.1.0'), { recursive: true });
  await writeFile(resolve(root, reopenCatalogPath), JSON.stringify(reopenCatalog));

  const handoff = JSON.parse(await readFile(resolve(root, handoffPath), 'utf8'));
  const modelRef = await reference(root, `${templateRoot}/recovery-model-template.json`, 'RECOVERY_TEMPLATE');
  const gateRef = await reference(root, `${templateRoot}/recovery-gate-template.json`, 'RECOVERY_TEMPLATE');
  const handoffRef = await reference(root, handoffPath, 'HANDOFF');
  const intakeRef = await reference(root, intakePath, 'INTAKE_REPORT');
  const runtimeRef = await reference(root, runtimePath, 'LOCAL_RUNTIME_JAR');
  const reopenRef = await reference(root, reopenCatalogPath, 'RECOVERY_REOPEN_EXPECTATION_CATALOG');
  const manifest = manifestV02({ modelTemplate, gateTemplate, reopenCatalog, modelRef, gateRef, handoffRef, intakeRef, runtimeRef, reopenRef, handoff });
  await writeJson(resolve(root, manifestPath), manifest);
  return { root, manifest, manifestRef: await reference(root, manifestPath, 'RECOVERY_MANIFEST'), modelRef, gateRef, runtimeRef };
}

function manifestV02({ modelTemplate, gateTemplate, reopenCatalog, modelRef, gateRef, handoffRef, intakeRef, runtimeRef, reopenRef, handoff }) {
  const profiles = new Map(reopenCatalog.profiles.map(profile => [profile.profile_id, profile]));
  const categories = ['PRE_COMMIT', 'SQLITE', 'FORCED_RESTART', 'SERVICE_RECOVERY', 'ROLLBACK'];
  return {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001',
    schema_version: '0.2',
    manifest_id: 'dev-canvas-06.recovery.aaaaaaaaaaaa.bbbbbbbbbbbb',
    manifest_version: '0.2.0',
    generated_at: new Date(modelTemplate.source_date_epoch * 1000).toISOString(),
    generator_identity: identity(),
    handoff_ref: handoffRef,
    intake_report_ref: intakeRef,
    reopen_expectation_catalog_ref: reopenRef,
    reopen_expectation_catalog_payload_sha256: reopenCatalog.catalog_payload_sha256,
    upstream_source_build: handoff.source_build,
    source_build: {
      source_commit: handoff.source_build.source_commit,
      dirty_before_build: false,
      build_command: 'npm run build',
      node_version: 'v22.22.0',
      lockfile_sha256: digest('lockfile'),
      web_dist: ref('WEB_DIST_TREE', 'build/web-dist'),
      local_runtime_jar: runtimeRef
    },
    environment_policy: { java_major: 21, node_major: 22, loopback_only: true, production_gate_read_only: true },
    fixture_catalog: [
      { fixture_id: 'RECOVERY-FIXTURE-MODEL', source_ref: modelRef, fixture_digest: 'bff0fb2a1c602bf4a0c0ff118bb80c47eda83e48ed9e2e98912281283d21fbbd', expected_result_digests: modelTemplate.expected_result_digests },
      { fixture_id: 'RECOVERY-FIXTURE-GATE', source_ref: gateRef, fixture_digest: '454438e640b43dbb00c8376de9c648341b2423c21e7621e43ae432b74eea54fd', expected_result_digests: gateTemplate.expected_result_digests }
    ],
    fault_policy: { required_attempt_count: 2, runner_retry_count: 0, forced_termination: 'OS_CHILD_PROCESS', evidence_capture_before_cleanup: true },
    case_catalog: reopenCatalog.cases.map((mapping, index) => ({
      case_id: mapping.case_id,
      category: categories[Math.min(4, index < 8 ? 0 : index < 15 ? 1 : index < 19 ? 2 : index < 22 ? 3 : 4)],
      fixture_ref: modelRef,
      fault: { stage: categories[Math.min(4, index < 8 ? 0 : index < 15 ? 1 : index < 19 ? 2 : index < 22 ? 3 : 4)], variant: mapping.case_id.split('.')[1], requires_forced_termination: index >= 15 && index <= 18 },
      expected_process_outcome: 'BLOCKED_ZERO_DELTA',
      expected_transaction: transaction(),
      expected_reopen: profiles.get(mapping.expected_reopen_profile_id).expected_reopen,
      expected_reopen_sha256: mapping.expected_reopen_sha256,
      expected_gate: { status: index >= 22 ? 'PARTIAL' : 'UNCHANGED_DISABLED' },
      required_attempt_count: 2
    })),
    summary: { fixture_count: 2, case_count: 28, pre_commit_case_count: 8, sqlite_case_count: 7, forced_restart_case_count: 4, service_recovery_case_count: 3, rollback_case_count: 6, required_attempt_count: 56 }
  };
}

async function copy(root, path, source = path) {
  const target = resolve(root, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(resolve(repositoryRoot, source), target);
}


async function reference(root, path, kind) {
  const bytes = await readFile(resolve(root, path));
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value));
}

async function rejects(action) {
  await assert.rejects(action, error => error instanceof RecoveryFixtureFactoryError && error.code === 'RECOVERY_FIXTURE_MISMATCH' && error.exitCode === 2);
}

function identity() {
  return { runner_version: '0.1.0', source_commit: 'b940ac9bb73442c3a697cce8bfa7c9df52856b3a', node_version: 'v22.22.0', os: 'darwin-arm64', command: 'release:canvas06:recovery', runner_source_sha256: digest('runner') };
}

function transaction() {
  return { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false };
}

function ref(kind, path) {
  return { kind, path, byte_length: 1, sha256: digest(`${kind}:${path}`) };
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
