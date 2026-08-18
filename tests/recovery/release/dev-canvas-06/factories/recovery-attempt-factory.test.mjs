import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { RecoveryFactoryError, loadRecoveryTemplate } from './recovery-attempt-factory.mjs';

const repositoryRoot = resolve('.');
const profileRoot = 'packages/profiles/profile.iso19450.2024.draft/0.2.0';
const handoffPath = `${profileRoot}/handoff/dev-canvas-05-handoff.json`;
const intakePath = `${profileRoot}/handoff/releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json`;
const runtimePath = `${profileRoot}/handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar`;
const modelTemplatePath = 'dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-model-template.json';
const gateTemplatePath = 'dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-gate-template.json';
const manifestPath = 'dev-canvas-06/recovery/recovery-manifest.json';

test('loads a frozen model Template only when the full Manifest trust chain closes', async t => {
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
  assert.equal(result.runtime_jar_ref.sha256, '0cfe0f14f2190e64e4cbc39b8a8bfbb8c9a5b733607cb24c4801c872f87b3f49');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.model_base_inputs), true);
});

test('rejects a Handoff raw reference mismatch before returning a partial Template', async t => {
  const evidence = await createEvidenceRoot(t);
  const brokenManifest = { ...evidence.manifest, handoff_ref: { ...evidence.manifest.handoff_ref, sha256: '0'.repeat(64) } };
  await writeJson(resolve(evidence.root, manifestPath), brokenManifest);
  const manifestRef = await reference(evidence.root, manifestPath, 'RECOVERY_MANIFEST');

  await rejects(() => loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  }));
});

test('rejects a Manifest source commit that differs from immutable Template binding', async t => {
  const evidence = await createEvidenceRoot(t);
  const brokenManifest = { ...evidence.manifest, source_build: { ...evidence.manifest.source_build, source_commit: 'f'.repeat(40) } };
  await writeJson(resolve(evidence.root, manifestPath), brokenManifest);
  const manifestRef = await reference(evidence.root, manifestPath, 'RECOVERY_MANIFEST');

  await rejects(() => loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  }));
});

test('rejects the historical Recovery Manifest 0.1 before reading Template inputs', async t => {
  const evidence = await createEvidenceRoot(t);
  const historical = { ...evidence.manifest, schema_version: '0.1', manifest_version: '0.1.0' };
  await writeJson(resolve(evidence.root, manifestPath), historical);
  const manifestRef = await reference(evidence.root, manifestPath, 'RECOVERY_MANIFEST');

  await rejects(() => loadRecoveryTemplate({
    evidenceRoot: evidence.root,
    manifestRef,
    templateSourceRef: evidence.modelRef,
    expectedFixtureId: 'RECOVERY-FIXTURE-MODEL'
  }));
});

async function createEvidenceRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-recovery-factory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modelSource = JSON.parse(await readFile(resolve(repositoryRoot, 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json'), 'utf8'));

  await cp(resolve(repositoryRoot, 'tests/recovery/release/dev-canvas-06/templates/0.1.0'), resolve(root, 'dev-canvas-06/recovery/fixtures/templates/0.1.0'), { recursive: true });
  await copy(root, handoffPath);
  await copy(root, intakePath);
  await copy(root, runtimePath);
  await copy(root, `${profileRoot}/profile.json`);
  for (const logicalPath of ['rules/representative-rule-set.json', 'symbols/representative-symbol-catalog.json', 'grammar/representative-opl-grammar.json', 'normalization/representative-normalization.json']) {
    await copy(root, `${profileRoot}/${logicalPath}`);
  }
  for (const scenario of modelSource.command_scenarios) await copy(root, scenario.base_revision_ref.path);

  const modelRef = await reference(root, modelTemplatePath, 'RECOVERY_TEMPLATE');
  const gateRef = await reference(root, gateTemplatePath, 'RECOVERY_TEMPLATE');
  const handoffRef = await reference(root, handoffPath, 'HANDOFF');
  const intakeRef = await reference(root, intakePath, 'INTAKE_REPORT');
  const runtimeRef = await reference(root, runtimePath, 'LOCAL_RUNTIME_JAR');
  const manifest = {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001',
    schema_version: '0.2',
    manifest_version: '0.2.0',
    generated_at: '2026-08-03T12:03:51.000Z',
    handoff_ref: handoffRef,
    intake_report_ref: intakeRef,
    source_build: { source_commit: 'b940ac9bb73442c3a697cce8bfa7c9df52856b3a', local_runtime_jar: runtimeRef },
    fixture_catalog: [
      {
        fixture_id: 'RECOVERY-FIXTURE-MODEL',
        source_ref: modelRef,
        fixture_digest: 'bff0fb2a1c602bf4a0c0ff118bb80c47eda83e48ed9e2e98912281283d21fbbd',
        expected_result_digests: modelSource.expected_result_digests
      },
      {
        fixture_id: 'RECOVERY-FIXTURE-GATE',
        source_ref: gateRef,
        fixture_digest: '454438e640b43dbb00c8376de9c648341b2423c21e7621e43ae432b74eea54fd',
        expected_result_digests: JSON.parse(await readFile(resolve(repositoryRoot, 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json'), 'utf8')).expected_result_digests
      }
    ]
  };
  await writeJson(resolve(root, manifestPath), manifest);
  return { root, manifest, manifestRef: await reference(root, manifestPath, 'RECOVERY_MANIFEST'), modelRef };
}

async function copy(root, path) {
  const target = resolve(root, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(resolve(repositoryRoot, path), target);
}

async function reference(root, path, kind) {
  const bytes = await readFile(resolve(root, path));
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function rejects(action) {
  await assert.rejects(action, error => error instanceof RecoveryFactoryError
    && error.code === 'RECOVERY_FIXTURE_MISMATCH' && error.exitCode === 2);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
