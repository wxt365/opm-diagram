import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

const preimageSchemaUrl = new URL('../docs/contracts/schemas/opm-dev-canvas-06-projection-digest-preimage.schema.json', import.meta.url);
const vectorSchemaUrl = new URL('../docs/contracts/schemas/opm-dev-canvas-06-projection-digest-parity-vectors.schema.json', import.meta.url);
const vectorUrl = new URL('../tests/e2e/release/dev-canvas-06/fixtures/projection-digest-v01-parity-vectors.json', import.meta.url);

const [preimageSchemaRaw, vectorSchemaRaw, vectorRaw] = await Promise.all([
  readFile(preimageSchemaUrl, 'utf8'),
  readFile(vectorSchemaUrl, 'utf8'),
  readFile(vectorUrl, 'utf8')
]);
const preimageSchema = JSON.parse(preimageSchemaRaw);
const vectorSchema = JSON.parse(vectorSchemaRaw);
const vectors = JSON.parse(vectorRaw);

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(preimageSchema);
const validatePreimage = ajv.getSchema(preimageSchema.$id);
const validateVectors = ajv.compile(vectorSchema);

const rawSha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

test('Projection Digest 0.1 Schema与不可变raw identity闭合', () => {
  assert.equal(preimageSchema.$id, 'urn:opm:contract:dev-canvas-06-projection-digest-preimage:0.1');
  assert.equal(vectorSchema.$id, 'urn:opm:contract:dev-canvas-06-projection-digest-parity-vectors:0.1');
  assert.equal(Buffer.byteLength(preimageSchemaRaw), 4679);
  assert.equal(Buffer.byteLength(vectorSchemaRaw), 9725);
  assert.equal(Buffer.byteLength(vectorRaw), 18778);
  assert.equal(rawSha256(preimageSchemaRaw), 'cc7e8811963498830f0fb5ce2aa197686c1fbdf089e9d3ef8efba36b8a672646');
  assert.equal(rawSha256(vectorSchemaRaw), 'ffd46e3c92c2381ea11c6c6dda0ece7cad4679a2335137b4243e308278b53417');
  assert.equal(rawSha256(vectorRaw), '470a4b2edd6368576bfe35e65f89dad9724109873084250cae5e9ed8e1b83f6d');
  for (const raw of [preimageSchemaRaw, vectorSchemaRaw, vectorRaw]) {
    assert.ok(raw.endsWith('\n'));
    assert.ok(!raw.includes('\r'));
  }
});

test('Projection Digest 0.1正向量的preimage、canonical bytes与SHA闭合', () => {
  assert.equal(validateVectors(vectors), true, JSON.stringify(validateVectors.errors));
  assert.deepEqual(vectors.positive_vectors.map(item => item.vector_id), [
    'PDV01-EMPTY',
    'PDV01-SIGNED-ZERO',
    'PDV01-EXTREME-FINITE',
    'PDV01-FULL-ORDERED'
  ]);
  for (const vector of vectors.positive_vectors) {
    assert.equal(validatePreimage(vector.expected_preimage), true, `${vector.vector_id}: ${JSON.stringify(validatePreimage.errors)}`);
    const canonical = canonicalizeJcs(vector.expected_preimage);
    assert.equal(Buffer.from(canonical, 'utf8').toString('hex'), vector.expected_canonical_utf8_hex, vector.vector_id);
    assert.equal(sha256Jcs(vector.expected_preimage), vector.expected_projection_sha256, vector.vector_id);
    assertInputBitsMatchExpected(vector);
  }
  const payload = structuredClone(vectors);
  delete payload.catalog_payload_sha256;
  assert.equal(sha256Jcs(payload), vectors.catalog_payload_sha256);
});

test('Projection Digest 0.1负向量的mutation与稳定错误边界闭合', () => {
  const expected = [
    ['PDV01-NEG-NAN', 'SET_RUNTIME_NUMBER', '/constructs/1/layout/x', 'NAN', 'PROJECTION_DIGEST_NON_FINITE_FLOAT', '/data/constructs/1/layout/x'],
    ['PDV01-NEG-POSITIVE-INFINITY', 'SET_RUNTIME_NUMBER', '/constructs/1/layout/y', 'POSITIVE_INFINITY', 'PROJECTION_DIGEST_NON_FINITE_FLOAT', '/data/constructs/1/layout/y'],
    ['PDV01-NEG-NEGATIVE-INFINITY', 'SET_RUNTIME_NUMBER', '/constructs/1/layout/width', 'NEGATIVE_INFINITY', 'PROJECTION_DIGEST_NON_FINITE_FLOAT', '/data/constructs/1/layout/width'],
    ['PDV01-NEG-MISSING-LAYOUT-FIELD', 'REMOVE_PROPERTY', '/constructs/1/layout/height', 'ABSENT', 'PROJECTION_DIGEST_SCHEMA_MISMATCH', '/data/constructs/1/layout/height'],
    ['PDV01-NEG-UNKNOWN-LAYOUT-FIELD', 'ADD_JSON_STRING', '/constructs/1/layout/depth', 'STRING:x', 'PROJECTION_DIGEST_SCHEMA_MISMATCH', '/data/constructs/1/layout/depth'],
    ['PDV01-NEG-NON-LAYOUT-FRACTION', 'SET_RUNTIME_NUMBER', '/constructs/1/layout/z_order', 'NUMBER:1.5', 'PROJECTION_DIGEST_NUMBER_DOMAIN_INVALID', '/data/constructs/1/layout/z_order'],
    ['PDV01-NEG-UNSAFE-INTEGER', 'SET_RUNTIME_NUMBER', '/constructs/1/endpoints/0/ordinal', 'NUMBER:9007199254740992', 'PROJECTION_DIGEST_NUMBER_DOMAIN_INVALID', '/data/constructs/1/endpoints/0/ordinal'],
    ['PDV01-NEG-UNKNOWN-CONSTRUCT-FIELD', 'ADD_JSON_STRING', '/constructs/1/debug', 'STRING:x', 'PROJECTION_DIGEST_SCHEMA_MISMATCH', '/data/constructs/1/debug'],
    ['PDV01-NEG-LONE-SURROGATE', 'SET_JSON_STRING', '/constructs/1/label', 'UTF16_LONE_HIGH_D800', 'PROJECTION_DIGEST_UNICODE_INVALID', '/data/constructs/1/label']
  ];
  assert.deepEqual(vectors.negative_vectors.map(item => [
    item.vector_id,
    item.mutation.operation,
    item.mutation.json_pointer,
    item.mutation.value_token,
    item.expected_error_code,
    item.expected_error_pointer
  ]), expected);
});

test('Projection Digest 0.1 Schema拒绝extra、错误hex、顺序和payload篡改', () => {
  const extra = structuredClone(vectors.positive_vectors[0].expected_preimage);
  extra.unknown = true;
  assert.equal(validatePreimage(extra), false);

  const uppercase = structuredClone(vectors.positive_vectors[1].expected_preimage);
  uppercase.data.constructs[0].layout.x.$binary64 = '3FF0000000000000';
  assert.equal(validatePreimage(uppercase), false);

  const reordered = structuredClone(vectors);
  [reordered.positive_vectors[0], reordered.positive_vectors[1]] = [reordered.positive_vectors[1], reordered.positive_vectors[0]];
  assert.equal(validateVectors(reordered), false);

  const wrongPayload = structuredClone(vectors);
  wrongPayload.catalog_payload_sha256 = '0'.repeat(64);
  assert.equal(validateVectors(wrongPayload), true);
  const payload = structuredClone(wrongPayload);
  delete payload.catalog_payload_sha256;
  assert.notEqual(sha256Jcs(payload), wrongPayload.catalog_payload_sha256);
});

function assertInputBitsMatchExpected(vector) {
  for (let index = 0; index < vector.input_projection_data.constructs.length; index += 1) {
    const inputLayout = vector.input_projection_data.constructs[index].layout;
    const expectedLayout = vector.expected_preimage.data.constructs[index].layout;
    for (const field of ['x', 'y', 'width', 'height']) {
      const inputHex = inputLayout[field].$input_binary64;
      assert.equal(inputHex, expectedLayout[field].$binary64, `${vector.vector_id}:${index}:${field}`);
      assert.equal(bitsOf(materializeBinary64(inputHex)), inputHex, `${vector.vector_id}:${index}:${field}:roundtrip`);
      assert.equal(Number.isFinite(materializeBinary64(inputHex)), true, `${vector.vector_id}:${index}:${field}:finite`);
    }
  }
}

function materializeBinary64(hex) {
  const bytes = Uint8Array.from(hex.match(/../g), pair => Number.parseInt(pair, 16));
  return new DataView(bytes.buffer).getFloat64(0, false);
}

function bitsOf(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return [...bytes].map(item => item.toString(16).padStart(2, '0')).join('');
}
