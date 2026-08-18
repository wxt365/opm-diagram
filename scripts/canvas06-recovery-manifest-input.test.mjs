import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deriveRecoveryCaseCatalog, RecoveryManifestInputError } from './canvas06-recovery-manifest-input.mjs';

const root = new URL('../', import.meta.url);
const modelTemplate = JSON.parse(await readFile(new URL('../tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json', import.meta.url)));
const reopenCatalog = JSON.parse(await readFile(new URL('../tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json', import.meta.url)));
const modelFixtureRef = {
  kind: 'RECOVERY_TEMPLATE',
  path: 'dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-model-template.json',
  byte_length: 27745,
  sha256: '76d906ad7ef8eb14028433458b23aebf8c9dd3db22a75d9d95f7d81a1785bc4a'
};

test('derives all frozen Recovery cases from the immutable Template and Reopen Catalog', () => {
  const cases = deriveRecoveryCaseCatalog({ modelTemplate, reopenCatalog, modelFixtureRef });
  assert.equal(cases.length, 28);
  const categoryCounts = {};
  for (const value of cases) {
    categoryCounts[value.category] = (categoryCounts[value.category] ?? 0) + 1;
  }
  assert.deepEqual(categoryCounts, {
    PRE_COMMIT: 8, SQLITE: 7, FORCED_RESTART: 4, SERVICE_RECOVERY: 3, ROLLBACK: 6
  });
  assert.equal(cases.filter(value => value.fault.requires_forced_termination).length, 4);
  assert.equal(cases[17].expected_process_outcome, 'COMMITTED_RECOVERED');
  assert.equal(cases[17].expected_transaction.revision_delta, 1);
  assert.equal(cases[20].expected_reopen_sha256, '23e6348c4d5a4ba897bb8fc078d590b9112a502e1370a536e092a83fa3173060');
  assert.equal(cases[25].expected_gate.status, 'FULL');
  assert.equal(Object.isFrozen(cases[0].expected_reopen), true);
});

test('rejects a reordered Catalog before it can become a Manifest case list', () => {
  const mutated = structuredClone(reopenCatalog);
  [mutated.cases[0], mutated.cases[1]] = [mutated.cases[1], mutated.cases[0]];
  assert.throws(
    () => deriveRecoveryCaseCatalog({ modelTemplate, reopenCatalog: mutated, modelFixtureRef }),
    error => error instanceof RecoveryManifestInputError && error.code === 'RECOVERY_INPUT_INVALID'
  );
});

test('rejects a committed case whose frozen transaction is not available', () => {
  const mutated = structuredClone(modelTemplate);
  const procedural = mutated.command_scenarios.find(value => value.scenario_id === 'RECOVERY-COMMAND-PROCEDURAL-001');
  procedural.expected_result.transaction.revision_delta = 0;
  assert.throws(
    () => deriveRecoveryCaseCatalog({ modelTemplate: mutated, reopenCatalog, modelFixtureRef }),
    error => error instanceof RecoveryManifestInputError && error.code === 'RECOVERY_INPUT_INVALID'
  );
});
