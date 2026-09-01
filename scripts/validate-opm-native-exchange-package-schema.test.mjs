import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-native-exchange-package-v1.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

test('native exchange package schema accepts the fixed MODEL_REVISION manifest shape', () => {
  assert.equal(validate(manifest()), true, JSON.stringify(validate.errors));
});

test('native exchange package schema rejects unknown fields and invalid source identity', () => {
  const unknown = manifest(); unknown.untrusted = true;
  assert.equal(validate(unknown), false);
  const source = manifest(); source.source.project_id = 'project-001';
  assert.equal(validate(source), false);
  const unsafePath = manifest(); unsafePath.entries[0].logical_path = 'evidence/';
  assert.equal(validate(unsafePath), false);
});

function manifest() {
  return {
    schema_id: 'OPM-NATIVE-EXCHANGE-001', schema_version: '1.0', package_id: 'exchange-001', package_kind: 'MODEL_REVISION',
    exchange_format_version: '1.0', minimum_reader_version: '1.0', created_at: '2026-09-01T00:00:00Z',
    producer_application: { application_id: 'opm-local-runtime', version: '0.1.0' }, identity_namespace: 'urn:opm:runtime',
    source: { project_id: null, model_id: 'model-001', revision_id: 'revision-001', baseline_id: null },
    entries: [entry('CAPABILITY_REPORT', 'CAPABILITY_REPORT', 'evidence/capability-report.json', ['SEMANTIC_REVISION']), entry('MODEL_CATALOG', 'MODEL_CATALOG', 'model/model.json', []), entry('SEMANTIC_REVISION', 'SEMANTIC_REVISION', 'revisions/revision-001.json', ['MODEL_CATALOG'])],
    extensions: [], package_digest: digest()
  };
}

function entry(entry_id, entry_role, logical_path, depends_on) {
  return { entry_id, entry_role, logical_path, media_type: 'application/json', schema_ref: { schema_id: entry_role === 'SEMANTIC_REVISION' ? 'MS-REV-001' : 'OPM-EXCHANGE-OPAQUE-JSON', schema_version: entry_role === 'SEMANTIC_REVISION' ? '0.2' : '1.0' }, required: true, byte_length: 1, sha256: digest(), depends_on };
}

function digest() { return '0'.repeat(64); }
