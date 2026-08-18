import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve('.');
const catalogPath = resolve('tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json');

test('Common Fixture Catalog is reproducible from the READY handoff', async () => {
  const result = run('--source-date-epoch', '1782864000');
  assert.equal(result.status, 0, result.stderr);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const handoff = JSON.parse(await readFile(resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json'), 'utf8'));
  assert.equal(catalog.visual_subjects.length, 8);
  assert.equal(catalog.e2e_cases.length, 16);
  assert.deepEqual(catalog.source_binding, handoff.active_binding);
  for (const subject of catalog.visual_subjects) await expectRef(subject.fixture_ref);
  for (const item of catalog.e2e_cases) {
    await expectRef(item.base_fixture_ref);
    await expectRef(item.input_ref);
  }
});

test('Common Fixture Catalog rejects a non-frozen generated_at value', () => {
  const result = run('--source-date-epoch', '0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CANVAS06_COMMON_FIXTURE_CATALOG_DRIFT/);
});

async function expectRef(ref) {
  const bytes = await readFile(resolve('tests/e2e/release/dev-canvas-06/fixtures', ref.path));
  assert.equal(bytes.length, ref.byte_length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256);
}

function run(...args) {
  return spawnSync(process.execPath, ['scripts/author-canvas06-common-fixtures.mjs', ...args], { cwd: root, encoding: 'utf8' });
}
