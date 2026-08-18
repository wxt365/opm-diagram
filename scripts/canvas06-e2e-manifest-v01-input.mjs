import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { sha256Jcs } from './canvas06-rfc8785.mjs';

export class E2eManifestInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'E2eManifestInputError';
    this.code = code;
    this.exitCode = exitCodeFor(code);
  }
}

function exitCodeFor(code) {
  if (['E2E_MANIFEST_ATOMIC_COMMIT_FAILED', 'E2E_MANIFEST_IO_ERROR', 'E2E_MANIFEST_INTERNAL_ERROR'].includes(code)) return 4;
  if (['E2E_MANIFEST_INTAKE_INVALID', 'E2E_MANIFEST_HANDOFF_MISMATCH', 'E2E_MANIFEST_SOURCE_BUILD_INVALID', 'E2E_MANIFEST_JOIN_MISMATCH', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'E2E_MANIFEST_DRIVER_INVALID', 'E2E_MANIFEST_CASE_SET_INVALID'].includes(code)) return 3;
  return 2;
}

export function resolveSymbolLogicalPath({ profile, activeBinding }) {
  const entries = profile?.manifest?.entries;
  if (!Array.isArray(entries)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Profile required manifest is missing.');
  const symbols = entries.filter(entry => entry?.role === 'SYMBOL_ASSET' && entry.required === true);
  if (symbols.length !== 1 || !isSafeRelativePath(symbols[0].logical_path)) {
    fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Profile must contain exactly one required SYMBOL_ASSET logical path.');
  }
  const expected = activeBinding?.symbol_catalog;
  const profileRef = profile?.symbol_catalog_ref;
  if (!sameAsset(profileRef, expected) || symbols[0].digest?.digest !== expected?.sha256) {
    fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Profile symbol binding does not match the active binding.');
  }
  return symbols[0].logical_path;
}

export function deriveFamilyCases({ coverage, goldenManifest, replay, materializedEntries }) {
  const requirements = coverage?.requirements;
  const goldenCases = goldenManifest?.cases;
  const replayCases = replay?.cases;
  if (!Array.isArray(requirements) || requirements.length !== 178 || !Array.isArray(goldenCases) || goldenCases.length !== 178 || !Array.isArray(replayCases) || replayCases.length !== 178) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Coverage, Golden Manifest, and replay must each contain exactly 178 family cases.');
  }

  const goldenByJoin = uniqueMap(goldenCases, item => joinKey(item), 'Golden Manifest join key');
  const replayByCase = uniqueMap(replayCases, item => item?.case_id, 'Golden replay case ID');
  const coverageKeys = new Set();
  const coverageJoinKeys = new Set();
  const coverageCaseIds = new Set();
  const cases = [];

  for (const requirement of requirements) {
    const key = joinKey(requirement);
    if (!key || coverageKeys.has(requirement.coverage_key) || coverageJoinKeys.has(key) || coverageCaseIds.has(requirement.case_id)) {
      fail('E2E_MANIFEST_JOIN_MISMATCH', 'Coverage keys, joins, and case IDs must be unique and complete.');
    }
    coverageKeys.add(requirement.coverage_key);
    coverageJoinKeys.add(key);
    coverageCaseIds.add(requirement.case_id);

    const golden = goldenByJoin.get(key);
    const replayCase = replayByCase.get(requirement.case_id);
    if (!golden || !replayCase || golden.case_id !== requirement.case_id || golden.expectation !== requirement.expectation || replayCase.expectation !== requirement.expectation) {
      fail('E2E_MANIFEST_JOIN_MISMATCH', `Family join is not exact for ${requirement.case_id}.`);
    }

    const transaction = matchedReplayTransaction(replayCase, requirement.expectation);
    if (requirement.expectation === 'BLOCKED' && !isDeepStrictEqual(transaction, golden.expected_transaction)) {
      fail('E2E_MANIFEST_JOIN_MISMATCH', `Blocked transaction differs from Golden Manifest for ${requirement.case_id}.`);
    }

    const fixtureRef = materializedEntries.get(golden.base_revision_fixture);
    const inputRef = materializedEntries.get(golden.input_revision_fixture);
    if (!fixtureRef || !inputRef) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', `Materialized fixture is missing for ${requirement.case_id}.`);

    const driver = familyDriver(requirement.family);
    cases.push({
      case_id: requirement.case_id,
      suite_id: driver.suite_id,
      capability_id: requirement.capability_id,
      coverage_key: requirement.coverage_key,
      expectation: requirement.expectation,
      viewport_id: 'VP-1440X900',
      zoom_id: 'Z-100',
      fixture_ref: fixtureRef,
      input_ref: inputRef,
      driver_id: driver.driver_id,
      expected_transaction: transaction,
      assertion_ids: requirement.expectation === 'PASS'
        ? ['REVISION_COMMITTED', 'PROJECTION_MATCHED', 'TEXT_TRACE_MATCHED', 'TRANSACTION_MATCHED', 'REOPEN_MATCHED']
        : ['ERROR_CODE_MATCHED', 'TRANSACTION_ZERO', 'HEAD_UNCHANGED', 'PROJECTION_UNCHANGED', 'REOPEN_MATCHED']
    });
  }

  const passCount = cases.filter(item => item.expectation === 'PASS').length;
  const blockedCount = cases.filter(item => item.expectation === 'BLOCKED').length;
  if (passCount !== 130 || blockedCount !== 48) fail('E2E_MANIFEST_CASE_SET_INVALID', 'Family expectation matrix must be 130 PASS and 48 BLOCKED.');
  return cases;
}

export function deriveCommonCases({ catalog, materializedRefs }) {
  const commonCases = catalog?.e2e_cases;
  if (!Array.isArray(commonCases) || commonCases.length !== 16 || catalog?.summary?.e2e_case_count !== 16) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture Catalog must contain exactly 16 E2E cases.');
  }
  const ids = new Set();
  return commonCases.map(item => {
    if (!item?.case_id || ids.has(item.case_id) || !Array.isArray(item.actions) || item.actions.length !== 1 || !Array.isArray(item.assertion_ids) || item.assertion_ids.length === 0) {
      fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Each common case must have one unique case-level action and assertions.');
    }
    ids.add(item.case_id);
    const action = item.actions[0];
    if (!action.expected_transaction || !['PASS_MATCHED', 'BLOCKED_MATCHED'].includes(action.expected_status)) {
      fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', `Common case ${item.case_id} has no determinate expected transaction.`);
    }
    const fixtureRef = materializedRefs.get(item.base_fixture_ref.path);
    const inputRef = materializedRefs.get(item.input_ref.path);
    if (!fixtureRef || !inputRef) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', `Common case ${item.case_id} has an unresolved fixture ref.`);
    return {
      case_id: item.case_id,
      suite_id: item.case_id.slice(0, 14),
      expectation: action.expected_status === 'PASS_MATCHED' ? 'PASS' : 'BLOCKED',
      viewport_id: 'VP-1440X900',
      zoom_id: 'Z-100',
      fixture_ref: fixtureRef,
      input_ref: inputRef,
      driver_id: 'DRIVER-COMMON',
      expected_transaction: action.expected_transaction,
      assertion_ids: item.assertion_ids
    };
  });
}

export function collectFixtureRefs(cases, additionalRefs = []) {
  const refs = new Map();
  for (const item of cases) {
    for (const ref of [item.fixture_ref, item.input_ref]) {
      const key = `${ref.path}\u0000${ref.sha256}`;
      refs.set(key, ref);
    }
  }
  for (const ref of additionalRefs) {
    if (!ref?.kind || !ref.path || !ref.sha256) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Additional fixture ref is invalid.');
    refs.set(`${ref.path}\u0000${ref.sha256}`, ref);
  }
  return [...refs.values()].sort((left, right) => `${left.path}\u0000${left.sha256}`.localeCompare(`${right.path}\u0000${right.sha256}`, 'en'));
}

/** 验证 Family Project identity 只能由不可变 Catalog 提供。 */
export function verifyFamilyFixtureIdentityCatalog({ catalog, goldenManifest, goldenManifestBytes, fixtureBytesByEntry }) {
  if (!catalog || !goldenManifest || !Buffer.isBuffer(goldenManifestBytes) || !(fixtureBytesByEntry instanceof Map)) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog input is incomplete.');
  }
  const payload = { ...catalog };
  delete payload.catalog_payload_sha256;
  if (catalog.catalog_payload_sha256 !== sha256Jcs(payload)
      || catalog.source_golden_manifest_sha256 !== sha256(goldenManifestBytes)) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog payload or Golden Manifest binding differs.');
  }
  const familyBaseEntries = [...new Set((goldenManifest.cases ?? []).map(item => item?.base_revision_fixture))];
  if (familyBaseEntries.length !== 2 || familyBaseEntries.some(value => typeof value !== 'string')) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family base fixture set must contain exactly two entries.');
  }
  const entries = catalog.entries;
  if (!Array.isArray(entries) || entries.length !== familyBaseEntries.length || catalog.summary?.family_case_count !== 178
      || catalog.summary?.distinct_base_fixture_count !== familyBaseEntries.length) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog summary is not closed.');
  }
  const orderedSha = entries.map(item => item?.fixture_sha256);
  if (!isStrictUtf8Order(orderedSha) || new Set(orderedSha).size !== entries.length
      || new Set(entries.map(item => item?.project_id)).size !== entries.length
      || new Set(entries.map(item => `${item?.model_id}\u0000${item?.base_revision}`)).size !== entries.length) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog identity keys are not unique and ordered.');
  }
  const byFixtureSha = new Map(entries.map(item => [item.fixture_sha256, item]));
  for (const fixtureEntry of familyBaseEntries) {
    const bytes = fixtureBytesByEntry.get(fixtureEntry);
    if (!Buffer.isBuffer(bytes)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family base fixture bytes are missing.');
    let fixture;
    try { fixture = JSON.parse(bytes.toString('utf8')); } catch { fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family base fixture is not JSON.'); }
    const identity = byFixtureSha.get(sha256(bytes));
    if (!identity || fixture.schema_id !== 'MS-REV-001' || fixture.schema_version !== '0.2'
        || identity.model_id !== fixture.model_id || identity.model_id !== fixture.model_header?.model_id
        || identity.context_id !== fixture.model_header?.root_context_id || identity.base_revision !== fixture.revision_id
        || identity.revision_sequence !== fixture.revision_sequence
        || identity.parent_revision_id !== normalizedParentRevision(fixture)) {
      fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog entry differs from exact fixture bytes.');
    }
  }
  if (byFixtureSha.size !== familyBaseEntries.length) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Identity Catalog contains an unreferenced fixture identity.');
  }
}

function matchedReplayTransaction(replayCase, expectation) {
  if (replayCase.observed_status !== `${expectation}_MATCHED` || !Array.isArray(replayCase.attempts) || replayCase.attempts.length !== 2) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', `Replay status is not matched for ${replayCase.case_id}.`);
  }
  const [first, second] = replayCase.attempts;
  if (first?.attempt !== 1 || second?.attempt !== 2 || first.observed_status !== `${expectation}_MATCHED` || second.observed_status !== `${expectation}_MATCHED` || !isDeepStrictEqual(first.transaction, second.transaction)) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', `Replay attempts are not stable for ${replayCase.case_id}.`);
  }
  return first.transaction;
}

function familyDriver(family) {
  if (family === 'PROC') return { suite_id: 'E2E-CANVAS-002', driver_id: 'DRIVER-PROCEDURAL' };
  if (family === 'CTRL') return { suite_id: 'E2E-CANVAS-003', driver_id: 'DRIVER-CONTROL' };
  if (family === 'STRUCT') return { suite_id: 'E2E-CANVAS-004', driver_id: 'DRIVER-STRUCTURAL' };
  fail('E2E_MANIFEST_CASE_SET_INVALID', `Unsupported family: ${family}.`);
}

function uniqueMap(items, keyOf, label) {
  const result = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!key || result.has(key)) fail('E2E_MANIFEST_JOIN_MISMATCH', `${label} must be unique.`);
    result.set(key, item);
  }
  return result;
}

function joinKey(item) {
  const fields = [item?.capability_id, item?.case_id, item?.variant_key, item?.expectation];
  return fields.every(Boolean) ? fields.join('\u0000') : null;
}

function sameAsset(left, right) {
  return left?.id === right?.id && left?.version === right?.version && (left?.sha256 ?? left?.digest?.digest) === right?.sha256;
}

function normalizedParentRevision(fixture) {
  if (!Object.hasOwn(fixture, 'parent_revision_id')) return null;
  return typeof fixture.parent_revision_id === 'string' && fixture.parent_revision_id.length > 0
    ? fixture.parent_revision_id
    : Symbol('invalid-parent-revision');
}

function isStrictUtf8Order(values) {
  if (values.some(value => typeof value !== 'string')) return false;
  return values.every((value, index) => index === 0 || Buffer.compare(Buffer.from(values[index - 1], 'utf8'), Buffer.from(value, 'utf8')) < 0);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');
}

function fail(code, message) {
  throw new E2eManifestInputError(code, message);
}
