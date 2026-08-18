import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  E2eManifestInputError,
  collectFixtureRefs,
  deriveCommonCases,
  deriveFamilyCases,
  resolveSymbolLogicalPath,
  verifyFamilyFixtureIdentityCatalog
} from './canvas06-e2e-manifest-v01-input.mjs';

const root = resolve('.');
const profileRoot = resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');

test('family join deterministically derives the frozen 178/130/48 matrix', async () => {
  const [coverage, goldenManifest, replay] = await Promise.all([
    json(resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json')),
    json(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json')),
    json(resolve(profileRoot, 'handoff/reports/golden-replay.json'))
  ]);
  const materializedEntries = new Map();
  for (const item of goldenManifest.cases) {
    for (const entry of [item.base_revision_fixture, item.input_revision_fixture]) {
      materializedEntries.set(entry, archiveRef(entry));
    }
  }

  const cases = deriveFamilyCases({ coverage, goldenManifest, replay, materializedEntries });
  assert.equal(cases.length, 178);
  assert.equal(cases.filter(item => item.expectation === 'PASS').length, 130);
  assert.equal(cases.filter(item => item.expectation === 'BLOCKED').length, 48);
  assert.deepEqual(cases.find(item => item.expectation === 'BLOCKED').assertion_ids, ['ERROR_CODE_MATCHED', 'TRANSACTION_ZERO', 'HEAD_UNCHANGED', 'PROJECTION_UNCHANGED', 'REOPEN_MATCHED']);
  assert.equal(cases[0].driver_id, 'DRIVER-PROCEDURAL');
  assert.ok(collectFixtureRefs(cases).length >= 130);
});

test('family join rejects an inconsistent replay transaction', async () => {
  const [coverage, goldenManifest, replay] = await Promise.all([
    json(resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json')),
    json(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json')),
    json(resolve(profileRoot, 'handoff/reports/golden-replay.json'))
  ]);
  const copiedReplay = structuredClone(replay);
  copiedReplay.cases[0].attempts[1].transaction.revision_delta += 1;
  const refs = new Map();
  for (const item of goldenManifest.cases) {
    refs.set(item.base_revision_fixture, archiveRef(item.base_revision_fixture));
    refs.set(item.input_revision_fixture, archiveRef(item.input_revision_fixture));
  }
  assert.throws(
    () => deriveFamilyCases({ coverage, goldenManifest, replay: copiedReplay, materializedEntries: refs }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_JOIN_MISMATCH'
  );
});

test('family join rejects a duplicate Coverage join even when coverage keys remain unique', async () => {
  const [coverage, goldenManifest, replay] = await Promise.all([
    json(resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json')),
    json(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json')),
    json(resolve(profileRoot, 'handoff/reports/golden-replay.json'))
  ]);
  const copiedCoverage = structuredClone(coverage);
  copiedCoverage.requirements[1] = {
    ...copiedCoverage.requirements[0],
    coverage_key: copiedCoverage.requirements[1].coverage_key
  };
  const refs = new Map();
  for (const item of goldenManifest.cases) {
    refs.set(item.base_revision_fixture, archiveRef(item.base_revision_fixture));
    refs.set(item.input_revision_fixture, archiveRef(item.input_revision_fixture));
  }
  assert.throws(
    () => deriveFamilyCases({ coverage: copiedCoverage, goldenManifest, replay, materializedEntries: refs }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_JOIN_MISMATCH'
  );
});

test('family identity catalog closes the two exact base fixtures and rejects identity drift', async () => {
  const [goldenManifest, catalog] = await Promise.all([
    json(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json')),
    json(resolve(profileRoot, 'golden/opm-e2e-family-fixture-identity-catalog.json'))
  ]);
  const fixtureBytesByEntry = new Map();
  for (const entry of new Set(goldenManifest.cases.map(item => item.base_revision_fixture))) {
    fixtureBytesByEntry.set(entry, await readFile(resolve(profileRoot, entry)));
  }
  const goldenManifestBytes = await readFile(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json'));
  verifyFamilyFixtureIdentityCatalog({ catalog, goldenManifest, goldenManifestBytes, fixtureBytesByEntry });

  const drift = structuredClone(catalog);
  drift.entries[0].project_id = drift.entries[1].project_id;
  assert.throws(
    () => verifyFamilyFixtureIdentityCatalog({ catalog: drift, goldenManifest, goldenManifestBytes, fixtureBytesByEntry }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_JOIN_MISMATCH'
  );
});

test('common catalog derives all sixteen deterministic cases', async () => {
  const catalog = await json(resolve(root, 'tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json'));
  const refs = new Map();
  for (const item of catalog.e2e_cases) {
    refs.set(item.base_fixture_ref.path, fileRef(item.base_fixture_ref));
    refs.set(item.input_ref.path, fileRef(item.input_ref));
  }
  const cases = deriveCommonCases({ catalog, materializedRefs: refs });
  assert.equal(cases.length, 16);
  assert.equal(cases.every(item => item.driver_id === 'DRIVER-COMMON'), true);
  assert.deepEqual(cases.map(item => item.case_id), catalog.e2e_cases.map(item => item.case_id));
});

test('common catalog rejects non-determinate actions and unresolved fixture refs', async () => {
  const catalog = await json(resolve(root, 'tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json'));
  const refs = new Map();
  for (const item of catalog.e2e_cases) {
    refs.set(item.base_fixture_ref.path, fileRef(item.base_fixture_ref));
    refs.set(item.input_ref.path, fileRef(item.input_ref));
  }
  const multipleActions = structuredClone(catalog);
  multipleActions.e2e_cases[0].actions.push(structuredClone(multipleActions.e2e_cases[0].actions[0]));
  assert.throws(
    () => deriveCommonCases({ catalog: multipleActions, materializedRefs: refs }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'
  );
  const missingRef = new Map(refs);
  missingRef.delete(catalog.e2e_cases[0].input_ref.path);
  assert.throws(
    () => deriveCommonCases({ catalog, materializedRefs: missingRef }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'
  );
});

test('active profile resolves one required Symbol logical path bound to the handoff', async () => {
  const [profile, handoff] = await Promise.all([
    json(resolve(profileRoot, 'profile.json')),
    json(resolve(profileRoot, 'handoff/dev-canvas-05-handoff.json'))
  ]);
  assert.equal(resolveSymbolLogicalPath({ profile, activeBinding: handoff.active_binding }), 'symbols/representative-symbol-catalog.json');
});

test('active profile rejects a Symbol binding that differs from the active handoff', async () => {
  const [profile, handoff] = await Promise.all([
    json(resolve(profileRoot, 'profile.json')),
    json(resolve(profileRoot, 'handoff/dev-canvas-05-handoff.json'))
  ]);
  const binding = structuredClone(handoff.active_binding);
  binding.symbol_catalog.sha256 = '0'.repeat(64);
  assert.throws(
    () => resolveSymbolLogicalPath({ profile, activeBinding: binding }),
    error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_INPUT_REF_MISMATCH'
  );
});

function archiveRef(entry) {
  return {
    path: `inputs/upstream/fixtures/${encode(entry)}.json`,
    byte_length: 1,
    sha256: 'a'.repeat(64),
    bundle_sha256: 'b'.repeat(64),
    archive_entry_path: entry
  };
}

function fileRef(reference) {
  return { kind: reference.kind, path: `inputs/common/${reference.path}`, byte_length: reference.byte_length, sha256: reference.sha256 };
}

function encode(value) {
  return Buffer.from(value, 'utf8').toString('hex').toUpperCase();
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
