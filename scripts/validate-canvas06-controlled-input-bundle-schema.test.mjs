import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const schema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

test('受控 descriptor 接受 Visual 的 exact approved version 对象', () => {
  assert.equal(validate(descriptor(approvedVersionRef())), true, JSON.stringify(validate.errors));
});

test('受控 descriptor 接受 E2E 的显式 approved version null', () => {
  assert.equal(validate(descriptor(null)), true, JSON.stringify(validate.errors));
});

test('受控 descriptor 拒绝缺失 approved version ref', () => {
  const value = descriptor(null);
  delete value.approved_version_ref;
  assert.equal(validate(value), false);
});

test('受控 descriptor 拒绝不完整 approved version 对象和不安全路径', () => {
  const incomplete = descriptor(approvedVersionRef());
  delete incomplete.approved_version_ref.authoring_report_ref;
  assert.equal(validate(incomplete), false);

  const unsafe = descriptor(approvedVersionRef());
  unsafe.approved_version_ref.path = '../approved/versions/1.2.3';
  assert.equal(validate(unsafe), false);
});

test('受控 descriptor 拒绝非法 bundle ID、未知字段和不安全引用路径', () => {
  const invalidId = descriptor(null);
  invalidId.bundle_id = 'canvas06-production-' + digest();
  assert.equal(validate(invalidId), false);

  const unknown = descriptor(null);
  unknown.unfrozen = true;
  assert.equal(validate(unknown), false);

  const unsafeRef = descriptor(null);
  unsafeRef.evidence_bundle_ref.path = '/evidence/bundle.zip';
  assert.equal(validate(unsafeRef), false);
});

function descriptor(approved_version_ref) {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001',
    schema_version: '0.1',
    bundle_class: 'CONTROLLED_TEST',
    bundle_id: `canvas06-controlled-${digest()}`,
    bundle_identity_sha256: digest(),
    handoff_ref: ref('HANDOFF', 'handoff/dev-canvas-05-handoff.json'),
    intake_report_ref: ref('INTAKE_REPORT', 'intake/intake-report.json'),
    evidence_bundle_ref: ref('HANDOFF_EVIDENCE_BUNDLE', 'evidence/dev-canvas-05.zip'),
    approved_version_ref
  };
}

function approvedVersionRef() {
  return {
    path: 'approved/versions/1.2.3',
    golden_set_version: '1.2.3',
    authoring_report_ref: ref('GOLDEN_AUTHORING_REPORT', 'approved/versions/1.2.3/authoring-report.json')
  };
}

function ref(kind, path) {
  return { kind, path, byte_length: 1, sha256: digest() };
}

function digest() {
  return '0'.repeat(64);
}
