import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';
import { listSafeArchiveEntries, validateArchiveEntries } from './canvas06-e2e-manifest-v01-archive.mjs';

const archive = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/release/dev-canvas-05-evidence-bundle.jar');

test('fixed jar listing accepts the current Evidence Bundle safe entry set', async () => {
  const entries = await listSafeArchiveEntries({ jarPath: process.env.JAR_PATH || 'jar', archivePath: archive });
  assert.ok(entries.includes('packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json'));
  assert.ok(entries.length > 100);
});

test('archive safety rejects traversal, duplicates and entry count overflow', () => {
  for (const entries of [
    ['../escape.json'], ['nested/../../escape.json'], ['/absolute.json'], ['windows\\escape.json'],
    ['same.json', 'same.json'], ['a'.repeat(513)], Array.from({ length: 4097 }, (_, index) => `entry-${index}.json`)
  ]) {
    assert.throws(() => validateArchiveEntries(entries), invalidArchive);
  }
});

function invalidArchive(error) {
  return error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_ARCHIVE_INVALID';
}
