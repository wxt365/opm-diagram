import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { verifyCommonFixtureInput } from './canvas06-e2e-common-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
const commonFixtureBuilder = resolve(root, 'scripts/build-canvas06-common-visual-fixtures.mjs');
const handoff = resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json');

test('verifies the exact Common Fixture Catalog, Factory, and sixteen BASE/INPUT pairs', async t => {
  const fixtureRoot = await activeFixtures(t);
  const catalog = await catalogAt(fixtureRoot);
  const result = await verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: catalog.source_binding
  });
  assert.equal(result.cases.length, 16);
  assert.equal(result.cases[0].case_id, 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES');
  assert.equal(result.cases.at(-1).case_id, 'E2E-CANVAS-007.READONLY');
});

test('rejects a Catalog whose active binding differs', async t => {
  const fixtureRoot = await activeFixtures(t);
  const catalog = await catalogAt(fixtureRoot);
  await assert.rejects(() => verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: { ...catalog.source_binding, binding_digest: '0'.repeat(64) }
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects Factory output that is raw-reference valid but JCS-inconsistent with BASE/INPUT', async t => {
  const fixtureRoot = await activeFixtures(t);
  const factoryPath = resolve(fixtureRoot, 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
  const source = await readFile(factoryPath, 'utf8');
  await writeFile(factoryPath, source.replace("project_name: `Release E2E ${caseId}`", "project_name: `Tampered E2E ${caseId}`"));

  const catalogPath = resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json');
  const catalog = await catalogAt(fixtureRoot);
  const bytes = await readFile(factoryPath);
  for (const item of catalog.e2e_cases) {
    item.factory_source_ref.byte_length = bytes.length;
    item.factory_source_ref.sha256 = await digest(bytes);
  }
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  await assert.rejects(() => verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: catalog.source_binding
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects a Factory mirror with a non-frozen dependency declaration', async t => {
  const fixtureRoot = await activeFixtures(t);
  const factoryPath = resolve(fixtureRoot, 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
  const source = await readFile(factoryPath, 'utf8');
  await writeFile(factoryPath, source.replace("../../../../../../scripts/canvas06-rfc8785.mjs", '../../unexpected-jcs.mjs'));

  const catalogPath = resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json');
  const catalog = await catalogAt(fixtureRoot);
  const bytes = await readFile(factoryPath);
  for (const item of catalog.e2e_cases) {
    item.factory_source_ref.byte_length = bytes.length;
    item.factory_source_ref.sha256 = await digest(bytes);
  }
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  await assert.rejects(() => verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: catalog.source_binding
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects duplicate Common case IDs before importing the Factory', async t => {
  const fixtureRoot = await activeFixtures(t);
  const catalogPath = resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json');
  const catalog = await catalogAt(fixtureRoot);
  catalog.e2e_cases[1].case_id = catalog.e2e_cases[0].case_id;
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  await assert.rejects(() => verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: catalog.source_binding
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects a Common Fixture reference that crosses a symbolic-link parent', async t => {
  const fixtureRoot = await activeFixtures(t);
  const catalog = await catalogAt(fixtureRoot);
  const base = catalog.e2e_cases[0].base_fixture_ref.path;
  const source = resolve(fixtureRoot, base);
  const redirected = resolve(fixtureRoot, 'redirected-base.json');
  await writeFile(redirected, await readFile(source));
  await rm(source);
  await symlink(redirected, source);

  await assert.rejects(() => verifyCommonFixtureInput({
    commonRoot: fixtureRoot,
    catalogPath: 'dev-canvas-06-common-fixture-catalog.json',
    activeBinding: catalog.source_binding
  }), error => error.code === 'E2E_INPUT_INVALID');
});

async function activeFixtures(t) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'canvas06-common-fixtures-'));
  const target = resolve(temporary, 'fixtures');
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [
    commonFixtureBuilder,
    '--handoff', handoff,
    '--fixture-root', target,
    '--source-date-epoch', '1782864000'
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return target;
}

async function catalogAt(fixtures) {
  return JSON.parse(await readFile(resolve(fixtures, 'dev-canvas-06-common-fixture-catalog.json'), 'utf8'));
}

async function digest(value) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}
