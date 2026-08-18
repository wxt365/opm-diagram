import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ProjectionDigestV01Error,
  buildProjectionDigestPreimageV01,
  canonicalBytesProjectionV01,
  sha256ProjectionV01
} from './canvas06-projection-digest-v01.mjs';

const vectors = JSON.parse(await readFile(new URL('../tests/e2e/release/dev-canvas-06/fixtures/projection-digest-v01-parity-vectors.json', import.meta.url), 'utf8'));

test('matches all four frozen Projection Digest 0.1 positive vectors', () => {
  for (const vector of vectors.positive_vectors) {
    const data = materializeInput(vector.input_projection_data);
    assert.deepEqual(buildProjectionDigestPreimageV01(data), vector.expected_preimage, vector.vector_id);
    assert.equal(canonicalBytesProjectionV01(data).toString('hex'), vector.expected_canonical_utf8_hex, vector.vector_id);
    assert.equal(sha256ProjectionV01(data), vector.expected_projection_sha256, vector.vector_id);
  }
  assert.notEqual(sha256ProjectionV01(materializeInput(vectors.positive_vectors[1].input_projection_data)), sha256ProjectionV01({
    ...materializeInput(vectors.positive_vectors[1].input_projection_data),
    constructs: [{ ...materializeInput(vectors.positive_vectors[1].input_projection_data).constructs[0], layout: { ...materializeInput(vectors.positive_vectors[1].input_projection_data).constructs[0].layout, y: 0 } }]
  }));
});

test('matches all nine frozen Projection Digest 0.1 negative vectors', () => {
  const base = vectors.positive_vectors.find(vector => vector.vector_id === 'PDV01-FULL-ORDERED');
  for (const vector of vectors.negative_vectors) {
    const input = materializeInput(base.input_projection_data);
    applyMutation(input, vector.mutation);
    assert.throws(() => buildProjectionDigestPreimageV01(input), error => {
      assert.ok(error instanceof ProjectionDigestV01Error, vector.vector_id);
      assert.equal(error.code, vector.expected_error_code, vector.vector_id);
      assert.equal(error.jsonPointer, vector.expected_error_pointer, vector.vector_id);
      return true;
    });
  }
});

function materializeInput(value) {
  if (Array.isArray(value)) return value.map(materializeInput);
  if (!value || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1 && typeof value.$input_binary64 === 'string') return binary64(value.$input_binary64);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeInput(item)]));
}

function applyMutation(value, mutation) {
  const segments = mutation.json_pointer.split('/').slice(1);
  let parent = value;
  for (const segment of segments.slice(0, -1)) parent = parent[segment];
  const field = segments.at(-1);
  if (mutation.operation === 'REMOVE_PROPERTY') delete parent[field];
  else if (mutation.operation === 'ADD_JSON_STRING') parent[field] = mutation.value_token.slice('STRING:'.length);
  else if (mutation.operation === 'SET_JSON_STRING') parent[field] = '\ud800';
  else if (mutation.value_token === 'NAN') parent[field] = Number.NaN;
  else if (mutation.value_token === 'POSITIVE_INFINITY') parent[field] = Number.POSITIVE_INFINITY;
  else if (mutation.value_token === 'NEGATIVE_INFINITY') parent[field] = Number.NEGATIVE_INFINITY;
  else parent[field] = Number(mutation.value_token.slice('NUMBER:'.length));
}

function binary64(hex) {
  const bytes = Uint8Array.from(hex.match(/../g), byte => Number.parseInt(byte, 16));
  return new DataView(bytes.buffer).getFloat64(0, false);
}
