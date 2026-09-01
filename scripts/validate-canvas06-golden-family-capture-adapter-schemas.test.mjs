import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const ROOT = resolve('.');
const DIGEST = 'a'.repeat(64);

test('Family Capture Identity、Clone Result、Runtime Ready、Callback 与 Adapter Result Schema 接受封闭正例', async () => {
  const validators = await loadValidators();
  const identity = familyIdentity();
  const clone = familyClone(identity);
  const ready = familyReady(identity, clone);
  assert.equal(validators.identity(identity), true, JSON.stringify(validators.identity.errors));
  assert.equal(validators.clone(clone), true, JSON.stringify(validators.clone.errors));
  assert.equal(validators.ready(ready), true, JSON.stringify(validators.ready.errors));
  const invocation = familyInvocation(identity, clone, ready);
  const observed = familyObserved(identity);
  assert.equal(validators.invocation(invocation), true, JSON.stringify(validators.invocation.errors));
  assert.equal(validators.observed(observed), true, JSON.stringify(validators.observed.errors));
});

test('Family Schema 拒绝未知字段、状态、raw ref 和 identity 漂移', async () => {
  const validators = await loadValidators();
  const identity = familyIdentity();
  identity.unknown = true;
  assert.equal(validators.identity(identity), false);

  const clone = familyClone(familyIdentity());
  clone.status = 'READY_FOR_BROWSER';
  assert.equal(validators.clone(clone), false);

  const ready = familyReady(familyIdentity(), familyClone(familyIdentity()));
  ready.runtime_jar_ref.kind = 'LOCAL_RUNTIME_JAR';
  assert.equal(validators.ready(ready), false);
});

test('Family artifact payload 摘要使用删除摘要字段后的 RFC8785 JCS preimage', () => {
  const identity = familyIdentity();
  identity.identity_payload_sha256 = payloadDigest(identity, 'identity_payload_sha256');
  assert.equal(identity.identity_payload_sha256, payloadDigest(identity, 'identity_payload_sha256'));
  identity.capture_id = 'VIS-CANVAS.CAP-ISO-PROC-001.VP-1280X800.Z-100.abcdef123456';
  assert.notEqual(identity.identity_payload_sha256, payloadDigest(identity, 'identity_payload_sha256'));
});

test('Family callback Schema 拒绝未知字段和 identity/projection 漂移', async () => {
  const validators = await loadValidators();
  const observed = familyObserved(familyIdentity());
  observed.unknown = true;
  assert.equal(validators.observed(observed), false);
  const invocation = familyInvocation(familyIdentity(), familyClone(familyIdentity()), familyReady(familyIdentity(), familyClone(familyIdentity())));
  invocation.web_base_url = 'http://example.invalid:41001';
  assert.equal(validators.invocation(invocation), false);
});

async function loadValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const load = async file => ajv.compile(JSON.parse(await readFile(resolve(ROOT, 'docs/contracts/schemas', file), 'utf8')));
  return {
    identity: await load('opm-dev-canvas-06-golden-family-capture-identity.schema.json'),
    clone: await load('opm-dev-canvas-06-golden-family-clone-result.schema.json'),
    ready: await load('opm-dev-canvas-06-golden-family-runtime-ready.schema.json'),
    invocation: await load('opm-dev-canvas-06-golden-family-capture-invocation.schema.json'),
    observed: await load('opm-dev-canvas-06-golden-family-capture-observed-result.schema.json')
  };
}

function familyIdentity() {
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-IDENTITY-001', schema_version: '0.1', identity_version: '0.1.0',
    capture_id: 'VIS-CANVAS.CAP-ISO-PROC-001.VP-1440X900.Z-100.abcdef123456', attempt_ordinal: 1, source_date_epoch: 1782864000,
    fixture_ref: { path: 'golden/fixtures/family.json', byte_length: 10, sha256: DIGEST, bundle_sha256: 'b'.repeat(64), archive_entry_path: 'input/golden/fixtures/family.json' },
    materialization_report_ref: ref('MATERIALIZATION_REPORT', 'materialization/reports/key.json'), materialized_identity: materializedIdentity(),
    model_id: 'model.family', revision_id: 'revision.family.1', revision_sequence: 1, context_id: 'context.family.root', capability_id: 'CAP-ISO-PROC-001',
    viewport_id: 'VP-1440X900', zoom_id: 'Z-100', expected_projection_sha256: 'c'.repeat(64), focus_target_id: 'occurrence.family', focus_anchor: 'CENTER', expected_cells: 1,
    critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], identity_payload_sha256: DIGEST
  };
  return value;
}

function familyClone(identity) {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CLONE-RESULT-001', schema_version: '0.1', result_version: '0.1.0', status: 'READY_FOR_RUNTIME',
    capture_id: identity.capture_id, attempt_ordinal: identity.attempt_ordinal, source_date_epoch: identity.source_date_epoch,
    family_capture_identity_ref: ref('FAMILY_CAPTURE_IDENTITY', 'inputs/family-capture-identity.json'), materialization_report_ref: identity.materialization_report_ref,
    materialized_identity: identity.materialized_identity, base_database_ref: ref('DATABASE', 'projects/project.golden.fixture.' + 'd'.repeat(64) + '/project.db'),
    base_tree_sha256_before: 'e'.repeat(64), base_tree_sha256_after: 'e'.repeat(64), attempt_database_ref: ref('PROJECT_DB', 'projects/project.golden.fixture.' + 'd'.repeat(64) + '/project.db'),
    attempt_tree_sha256: 'f'.repeat(64), result_payload_sha256: DIGEST
  };
}

function familyReady(identity, clone) {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-RUNTIME-READY-001', schema_version: '0.1', ready_version: '0.1.0', status: 'READY_FOR_BROWSER',
    capture_id: identity.capture_id, attempt_ordinal: identity.attempt_ordinal, source_date_epoch: identity.source_date_epoch, launch_nonce: '1'.repeat(64), process_id: 123,
    runtime_jar_ref: ref('RUNTIME_JAR', 'inputs/build/local-runtime.jar'), profile_asset_refs: Array.from({ length: 5 }, (_, index) => ref('PROFILE_ASSET', `profile/assets/${index}.json`)),
    profile_asset_tree_sha256: '2'.repeat(64), family_capture_identity_ref: ref('FAMILY_CAPTURE_IDENTITY', 'inputs/family-capture-identity.json'), clone_result_ref: ref('FAMILY_CLONE_RESULT', 'clone-result.json'),
    attempt_database_ref: clone.attempt_database_ref, attempt_tree_sha256_before: clone.attempt_tree_sha256, server_port: 41001, management_server_port: 41002,
    runtime_base_url: 'http://127.0.0.1:41001', management_base_url: 'http://127.0.0.1:41002', readiness_path: '/actuator/health/readiness', bootstrap_path: '/opm-bootstrap.js', ready_payload_sha256: DIGEST
  };
}

function familyInvocation(identity, clone, ready) {
  return { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-INVOCATION-001', schema_version: '0.1', invocation_version: '0.1.0', capture_ordinal: 0, capture_id: identity.capture_id, attempt_ordinal: 1, family_capture_identity_ref: ref('FAMILY_CAPTURE_IDENTITY', 'inputs/family-capture-identity.json'), fixture_ref: ref('FIXTURE', 'fixture.json'), clone_result_ref: ref('FAMILY_CLONE_RESULT', 'clone-result.json'), runtime_ready_ref: ref('FAMILY_RUNTIME_READY', 'runtime-ready.json'), project_id: identity.materialized_identity.project_id, model_id: identity.model_id, revision_id: identity.revision_id, context_id: identity.context_id, runtime_base_url: ready.runtime_base_url, web_base_url: 'http://127.0.0.1:41003', viewport_id: identity.viewport_id, zoom_id: identity.zoom_id, expected_projection_sha256: identity.expected_projection_sha256, focus_target_id: identity.focus_target_id, focus_anchor: identity.focus_anchor, expected_cells: identity.expected_cells, critical_regions: identity.critical_regions, attempt_artifact_root: '/tmp/family/attempt/artifacts' };
}

function familyObserved(identity) {
  const value = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-OBSERVED-RESULT-001', schema_version: '0.1', result_version: '0.1.0', capture_id: identity.capture_id, attempt_ordinal: 1, identity_payload_sha256: identity.identity_payload_sha256, ui_setup_status: 'READY', stability_status: 'STABLE', png_ref: ref('FAMILY_CAPTURE_PNG', 'artifacts/capture.png'), projection_ref: ref('FAMILY_CAPTURE_PROJECTION', 'artifacts/projection.json'), geometry_ref: ref('FAMILY_CAPTURE_GEOMETRY', 'artifacts/geometry.json'), png_byte_length: 1, png_sha256: DIGEST, width: 1, height: 1, cell_geometry_sha256: DIGEST, projection_sha256: identity.expected_projection_sha256, observed_cells: 1, focus_target_id: identity.focus_target_id, focus_anchor: identity.focus_anchor, result_payload_sha256: '' };
  value.result_payload_sha256 = payloadDigest(value, 'result_payload_sha256');
  return value;
}

function materializedIdentity() {
  return { project_id: 'project.golden.fixture.' + 'd'.repeat(64), model_id: 'model.family', revision_id: 'revision.family.1', revision_sequence: 1, draft_head_revision_id: 'revision.family.1', head_sequence: 1, history_mode: 'SINGLE_REVISION_SNAPSHOT' };
}

function ref(kind, path) { return { kind, path, byte_length: 1, sha256: DIGEST }; }

function payloadDigest(value, key) {
  const copy = { ...value };
  delete copy[key];
  return createHash('sha256').update(canonicalizeJcs(copy), 'utf8').digest('hex');
}
