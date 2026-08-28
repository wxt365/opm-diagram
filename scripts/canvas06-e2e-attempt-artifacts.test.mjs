import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { attemptRelativeRoot, createFaultPlan, TokenDigestError, tokenDigestCanonicalBytes, tokenDigestPreimage, tokenDigestSha256, writeArtifactIndex, writeAttemptArtifact, writeFaultPlan } from './canvas06-e2e-attempt-artifacts.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const CASE_ID = 'E2E-CANVAS-007.ASSET_MISSING';

test('uses one percent-encoded path mapping for Runner and Attempt artifacts', () => {
  assert.equal(attemptRelativeRoot('E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 1), 'attempts/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES/1');
  assert.equal(attemptRelativeRoot('E2E-CANVAS-007.TEXT_BLOCKED/REOPEN', 2), 'attempts/E2E-CANVAS-007.TEXT_BLOCKED%2FREOPEN/2');
  assert.throws(() => attemptRelativeRoot(CASE_ID, 3), error => error.code === 'E2E_INPUT_INVALID');
});

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
    schema_version: '0.2',
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
    if (entry.kind === 'PROFILE_ASSET_TREE') await mkdir(file, { recursive: true });
    else { await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, `${entry.kind}\n`); }
  }
  const ref = await writeArtifactIndex({ reportRoot: root, caseId: CASE_ID, attemptOrdinal: 1, entries });
  const index = JSON.parse(await readFile(resolve(root, ref.path), 'utf8'));
  assert.equal(index.refs.length, 16);
  assert.equal(index.tree_sha256, sha256Jcs(index.refs));

  const rootWithExtra = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-index-extra-'));
  const extraEntries = coreEntries(CASE_ID);
  for (const entry of extraEntries) {
    const file = resolve(rootWithExtra, entry.path);
    if (entry.kind === 'PROFILE_ASSET_TREE') await mkdir(file, { recursive: true });
    else { await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, `${entry.kind}\n`); }
  }
  const extraAttempt = resolve(rootWithExtra, 'attempts', CASE_ID, '1');
  await writeFile(resolve(extraAttempt, 'unindexed.log'), 'extra\n');
  await assert.rejects(() => writeArtifactIndex({ reportRoot: rootWithExtra, caseId: CASE_ID, attemptOrdinal: 1, entries: extraEntries }), error => error.code === 'E2E_INPUT_INVALID');
});

test('matches every frozen Token Digest parity vector', async () => {
  const catalog = JSON.parse(await readFile(new URL('../tests/e2e/release/dev-canvas-06/fixtures/token-digest-v01-parity-vectors.json', import.meta.url), 'utf8'));
  for (const vector of catalog.positive_vectors) {
    assert.deepEqual(tokenDigestPreimage(vector.input_revision_id, vector.input_tokens), vector.expected_preimage, vector.vector_id);
    assert.equal(tokenDigestCanonicalBytes(vector.input_revision_id, vector.input_tokens).toString('hex'), vector.expected_canonical_utf8_hex, vector.vector_id);
    assert.equal(tokenDigestSha256(vector.input_revision_id, vector.input_tokens), vector.expected_token_sha256, vector.vector_id);
  }
  for (const vector of catalog.negative_vectors) {
    const base = catalog.positive_vectors.find(item => item.vector_id === vector.base_positive_vector_id);
    const tokens = structuredClone(base.input_tokens);
    applyTokenMutation(tokens, vector.mutation);
    assert.throws(() => tokenDigestPreimage(base.input_revision_id, tokens), error => error instanceof TokenDigestError
      && error.code === vector.expected_error_code && error.jsonPointer === vector.expected_error_pointer, vector.vector_id);
  }
});

function applyTokenMutation(tokens, mutation) {
  const segments = mutation.json_pointer.substring(1).split('/');
  let parent = { tokens };
  for (let index = 0; index < segments.length - 1; index += 1) parent = parent[segments[index]];
  const field = segments.at(-1);
  parent[field] = switchTokenMutation(mutation.value_token);
}

function switchTokenMutation(value) {
  if (value === 'NON_NFC_E\u0301') return 'E\u0301';
  if (value === 'END_BEFORE_START') return 0;
  if (value === 'NUMBER:9007199254740992') return 9007199254740992;
  if (value === 'UNKNOWN_KIND') return 'UNKNOWN_KIND';
  throw new Error(`未知 Token mutation value: ${value}`);
}

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
  ].map(([kind, file, capture_phase]) => ({ kind, path: `${base}/${file}`, media_type: 'application/json', capture_phase, required: true }))
    .concat({ kind: 'PROFILE_ASSET_TREE', path: `${base}/profile/assets`, media_type: 'application/vnd.opm.profile-asset-tree+json', capture_phase: 'MATERIALIZE', required: true })
    .concat([
      ['GRAMMAR_ASSET', 'grammar/representative-opl-grammar.json'],
      ['NORMALIZATION_DATA', 'normalization/representative-normalization.json'],
      ['PROFILE_PACKAGE', 'profile.json'],
      ['RULE_SET', 'rules/representative-rule-set.json'],
      ['SYMBOL_ASSET', 'symbols/representative-symbol-catalog.json']
    ].map(([asset_kind, file]) => ({ kind: 'PROFILE_ASSET', asset_kind, path: `${base}/profile/assets/${file}`, media_type: 'application/json', capture_phase: 'MATERIALIZE', required: true })));
}
