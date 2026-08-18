import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { composeRecoveryManifestAndGateFixture, RecoveryManifestComposeError } from './canvas06-recovery-manifest-compose.mjs';

const modelTemplate = JSON.parse(await readFile(new URL('../tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json', import.meta.url)));
const gateTemplate = JSON.parse(await readFile(new URL('../tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json', import.meta.url)));
const reopenCatalog = JSON.parse(await readFile(new URL('../tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json', import.meta.url)));
const recoveryManifestSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest-v02.schema.json', import.meta.url)));
const gateFixtureSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-gate-fixture.schema.json', import.meta.url)));
const reopenCatalogSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(reopenCatalogSchema);
const validateRecoveryManifest = ajv.compile(recoveryManifestSchema);
const validateGateFixture = ajv.compile(gateFixtureSchema);

test('composes the active Manifest 0.2 and a distinct test-only Gate Fixture', () => {
  const result = composeRecoveryManifestAndGateFixture(inputs());
  assert.equal(validateRecoveryManifest(result.manifest), true, JSON.stringify(validateRecoveryManifest.errors));
  assert.equal(validateGateFixture(result.gateFixture), true, JSON.stringify(validateGateFixture.errors));
  assert.equal(result.manifest.schema_version, '0.2');
  assert.equal(result.manifest.manifest_version, '0.2.0');
  assert.equal(result.manifest.case_catalog.length, 28);
  assert.equal(result.manifest.summary.required_attempt_count, 56);
  assert.equal(result.gateFixture.test_only, true);
  assert.equal(result.gateFixture.production_loader_expected_status, 'REJECTED');
  assert.equal(result.gateFixture.enabled_capability_ids.length, 34);
  assert.equal(result.gateFixture.dependency_graph.edges.length, 20);
  assert.equal(Object.isFrozen(result.manifest.case_catalog), true);
});

test('rejects a Template binding that does not close the exact Intake ref', () => {
  const value = inputs();
  value.modelTemplate.source_build_binding.intake_report_ref.sha256 = '0'.repeat(64);
  assert.throws(
    () => composeRecoveryManifestAndGateFixture(value),
    error => error instanceof RecoveryManifestComposeError && error.code === 'RECOVERY_INPUT_INVALID'
  );
});

test('rejects a Gate Template whose production guard is not disabled', () => {
  const value = inputs();
  value.gateTemplate.production_gate_guard.after.state = 'ENABLED';
  assert.throws(
    () => composeRecoveryManifestAndGateFixture(value),
    error => error instanceof RecoveryManifestComposeError && error.code === 'RECOVERY_INPUT_INVALID'
  );
});

function inputs() {
  const handoffRef = ref('HANDOFF', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json', 37088, '0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326');
  const intakeReportRef = ref('INTAKE_REPORT', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json', 50823, '54d56bab7792122781bc2b8b785c3488a4bd1d4f7ecc741845ecbcccdb2d85ee');
  const runtimeRef = ref('LOCAL_RUNTIME_JAR', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar', 1, 'a'.repeat(64));
  const sourceBuild = {
    source_commit: 'b940ac9bb73442c3a697cce8bfa7c9df52856b3a', dirty_before_build: false,
    build_command: 'npm ci --ignore-scripts && npm run build', node_version: '22.0.0', lockfile_sha256: 'b'.repeat(64),
    web_dist: ref('WEB_DIST_TREE', 'dev-canvas-06/recovery/build/web-dist.json', 1, 'c'.repeat(64)), local_runtime_jar: runtimeRef
  };
  const model = structuredClone(modelTemplate);
  const gate = structuredClone(gateTemplate);
  model.source_build_binding.handoff_ref = structuredClone(handoffRef);
  model.source_build_binding.intake_report_ref = structuredClone(intakeReportRef);
  model.source_build_binding.runtime_jar_ref = structuredClone(runtimeRef);
  gate.handoff_identity.handoff_ref = structuredClone(handoffRef);
  gate.intake_identity.intake_report_ref = structuredClone(intakeReportRef);
  return {
    sourceDateEpoch: 1785758631,
    generatorIdentity: { runner_version: '0.1.0', source_commit: sourceBuild.source_commit, node_version: '22.0.0', os: 'darwin-arm64', command: 'release:canvas06:recovery:manifest', runner_source_sha256: 'd'.repeat(64) },
    handoffRef, intakeReportRef, upstreamSourceBuild: { source_commit: sourceBuild.source_commit, dirty_before_build: false, evidence_output_root: 'release', java_version: '21', node_version: '22.0.0', os: 'darwin-arm64', build_command: 'build', lockfile_sha256: 'e'.repeat(64), pom_sha256: 'f'.repeat(64) },
    sourceBuild, modelTemplate: model, gateTemplate: gate,
    modelTemplateRef: ref('RECOVERY_TEMPLATE', 'dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-model-template.json', 27745, '76d906ad7ef8eb14028433458b23aebf8c9dd3db22a75d9d95f7d81a1785bc4a'),
    gateTemplateRef: ref('RECOVERY_TEMPLATE', 'dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-gate-template.json', 9116, '69bf9389d5e19f8b8b589349e689c030a1be5456aa2332315dc5cb3aad9172b5'),
    reopenCatalog: structuredClone(reopenCatalog),
    reopenCatalogRef: ref('RECOVERY_REOPEN_EXPECTATION_CATALOG', 'dev-canvas-06/recovery/fixtures/catalogs/0.1.0/recovery-reopen-expectation-catalog.json', 9308, '9c5d95c454aa680b12a8d3b3bfb958c4f4ec8b8f971bc21e7bb464f6ef32622e')
  };
}

function ref(kind, path, byte_length, sha256) {
  return { kind, path, byte_length, sha256 };
}
