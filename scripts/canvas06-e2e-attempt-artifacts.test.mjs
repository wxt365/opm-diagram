import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { createFaultPlan, writeArtifactIndex, writeAttemptArtifact, writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const CASE_ID = 'E2E-CANVAS-007.ASSET_MISSING';

test('builds and atomically writes the frozen fault plan mapping', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-artifact-'));
  const nonce = 'a'.repeat(64);
  const plan = createFaultPlan({ caseId: CASE_ID, attemptOrdinal: 1, nonce });
  assert.equal(plan.fault_kind, 'ASSET_MISSING');
  assert.equal(plan.target, 'SYMBOL_CATALOG_ASSET');
  assert.equal(plan.trigger_count, 1);
  assert.equal(plan.plan_sha256, sha256Jcs({ case_id: CASE_ID, attempt_ordinal: 1, fault_kind: 'ASSET_MISSING', target: 'SYMBOL_CATALOG_ASSET', trigger_count: 1, nonce }));

  const ref = await writeFaultPlan({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, nonce });
  const written = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
  assert.deepEqual(written, plan);
  await assert.rejects(() => writeFaultPlan({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, nonce }), error => error.code === 'E2E_INPUT_INVALID');
});

test('rejects a filename whose root schema identity does not match', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-artifact-invalid-'));
  await assert.rejects(() => writeAttemptArtifact({
    reportRoot: root,
    caseId: CASE_ID,
    attemptOrdinal: 1,
    filename: 'runtime-process.json',
    artifact: createFaultPlan({ caseId: CASE_ID, attemptOrdinal: 1, nonce: 'b'.repeat(64) })
  }), error => error.code === 'E2E_INPUT_INVALID');
});

test('creates the fixed api-exchanges parent for a valid nested root', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-api-index-'));
  const exchanges = [{
    sequence: 1,
    operation_id: 'OPM-WORKSPACE-001',
    method: 'GET',
    normalized_url: 'http://127.0.0.1:15173/api/v1/projects',
    request_ref: null,
    response_ref: null,
    status: 200,
    revision: null
  }];
  const artifact = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001',
    schema_version: '0.1',
    case_id: CASE_ID,
    attempt_ordinal: 1,
    exchanges,
    exchange_set_sha256: sha256Jcs(exchanges)
  };
  const ref = await writeAttemptArtifact({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, filename: 'api-exchanges/index.json', artifact });
  assert.equal(ref.path, `attempts/${CASE_ID}/1/api-exchanges/index.json`);
});

test('constructs an index from exact regular files and rejects unindexed evidence', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-'));
  const attempt = resolve(root, 'attempts', CASE_ID, '1');
  await mkdir(resolve(attempt, 'api-exchanges'), { recursive: true });
  const entries = coreEntries(CASE_ID);
  for (const entry of entries) {
    const file = resolve(root, entry.path);
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file, `${entry.kind}\n`);
  }
  const ref = await writeArtifactIndex({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, entries });
  const index = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
  assert.equal(index.refs.length, 10);
  assert.equal(index.tree_sha256, sha256Jcs(index.refs));

  const rootWithExtra = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-extra-'));
  const extraEntries = coreEntries(CASE_ID);
  for (const entry of extraEntries) {
    const file = resolve(rootWithExtra, entry.path);
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file, `${entry.kind}\n`);
  }
  const extraAttempt = resolve(rootWithExtra, 'attempts', CASE_ID, '1');
  await writeFile(resolve(extraAttempt, 'unindexed.log'), 'extra\n');
  await assert.rejects(() => writeArtifactIndex({ reportRoot: rootWithExtra, caseId: CASE_ID, attemptOrdinal: 1, entries: extraEntries }), error => error.code === 'E2E_INPUT_INVALID');
});

function coreEntries(caseId) {
  const base = `attempts/${caseId}/1`;
  return [
    ['FAULT_PLAN', 'fault-plan.json', 'MATERIALIZE'],
    ['FIXTURE_MATERIALIZATION', 'fixture-materialization.json', 'MATERIALIZE'],
    ['ATTEMPT_OBSERVATION', 'attempt-observation.json', 'FINALIZE'],
    ['RUNTIME_PROCESS', 'runtime-process.json', 'RUNTIME'],
    ['BROWSER_ENVIRONMENT', 'browser-environment.json', 'ACTION'],
    ['NETWORK_OBSERVATION', 'network-observation.json', 'ACTION'],
    ['CONSOLE_ERRORS', 'console-errors.json', 'ACTION'],
    ['TRANSACTION_OBSERVATION', 'transaction-observation.json', 'ACTION'],
    ['REOPEN_OBSERVATION', 'reopen-observation.json', 'REOPEN'],
    ['API_EXCHANGE_INDEX', 'api-exchanges/index.json', 'ACTION']
  ].map(([kind, file, capture_phase]) => ({ kind, path: `${base}/${file}`, media_type: 'application/json', capture_phase, required: true }));
}
