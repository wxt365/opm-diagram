import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

test('matches all frozen Common Visual Node/Java parity vectors', async () => {
  const raw = await readFile(new URL('../tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json', import.meta.url), 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(!raw.includes('\r'));
  const vectors = JSON.parse(raw);
  assert.equal(vectors.length, 10);
  assert.equal(new Set(vectors.map(vector => vector.vector_id)).size, 10);
  for (const vector of vectors) {
    assert.equal(canonicalizeJcs(vector.input), vector.canonical_utf8, vector.vector_id);
    assert.equal(sha256Jcs(vector.input), vector.sha256, vector.vector_id);
  }
});

test('uses UTF-16 key order and rejects all values outside the frozen domain', () => {
  assert.equal(canonicalizeJcs({ '\ue000': 2, '😀': 1, a: 0 }), '{"a":0,"😀":1,"":2}');
  for (const value of [0.1, Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992, -9007199254740992, undefined, () => {}, Symbol('x'), 1n, '\ud800', { '\udc00': 1 }]) {
    assert.throws(() => canonicalizeJcs(value));
  }
  const circular = {};
  circular.self = circular;
  assert.throws(() => canonicalizeJcs(circular));
});
