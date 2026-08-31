import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { e2eCases } from '../tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import {
  buildCommonSetupPlan,
  COMMON_DRIVER_SOURCE_PATH,
  rebaseCommonSetupPlanRefs,
  verifyCommonSetupPlan
} from './canvas06-e2e-common-setup-plan.mjs';

const root = resolve(import.meta.dirname, '..');
const handoffPath = resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json');
const builderPath = resolve(root, 'scripts/build-canvas06-common-visual-fixtures.mjs');
const driverPath = resolve(root, COMMON_DRIVER_SOURCE_PATH);

test('builds and verifies the frozen sixteen-case Common Setup Plan', async () => {
  const input = await planInput();
  const plan = buildCommonSetupPlan(input);
  const verified = verifyCommonSetupPlan({ plan, ...input });

  assert.equal(verified.cases.length, 16);
  assert.deepEqual(verified.cases.map(item => item.case_id), e2eCases);
  assert.equal(new Set(verified.cases.map(item => item.initial_state)).size, 8);
  assert.match(verified.plan_payload_sha256, /^[a-f0-9]{64}$/);
  for (const item of verified.cases) {
    for (const step of item.setup_steps.filter(value => value.payload_template)) {
      assert.equal(step.payload_sha256, digestJcs(step.payload_template));
    }
  }
});

test('uses JCS-identical setup steps for cases with the same initial state', async () => {
  const plan = buildCommonSetupPlan(await planInput());
  const groups = Map.groupBy(plan.cases, item => item.initial_state);
  for (const cases of groups.values()) {
    const expected = canonicalizeJcs(cases[0].setup_steps);
    assert.ok(cases.every(item => canonicalizeJcs(item.setup_steps) === expected));
  }
});

test('rejects payload digest, selector, order, and raw-ref drift', async () => {
  const input = await planInput();
  const plan = buildCommonSetupPlan(input);

  const wrongDigest = structuredClone(plan);
  wrongDigest.plan_payload_sha256 = '0'.repeat(64);
  assert.throws(() => verifyCommonSetupPlan({ plan: wrongDigest, ...input }), error => error.code === 'E2E_COMMON_SETUP_PLAN_INVALID' && error.exitCode === 2);

  const wrongSelector = structuredClone(plan);
  wrongSelector.cases[0].setup_steps[1].option_selector.capability_id = 'CAP-STATE-999';
  refreshDigest(wrongSelector);
  assert.throws(() => verifyCommonSetupPlan({ plan: wrongSelector, ...input }), error => error.code === 'E2E_COMMON_SETUP_PLAN_INVALID');

  const wrongOrder = { ...input, catalogCases: [...input.catalogCases].reverse() };
  assert.throws(() => buildCommonSetupPlan(wrongOrder), error => error.code === 'E2E_COMMON_SETUP_PLAN_REF_MISMATCH' && error.exitCode === 3);

  const wrongRef = structuredClone(plan);
  wrongRef.common_driver_ref.sha256 = '1'.repeat(64);
  refreshDigest(wrongRef);
  assert.throws(() => verifyCommonSetupPlan({ plan: wrongRef, ...input }), error => error.code === 'E2E_COMMON_SETUP_PLAN_REF_MISMATCH' && error.exitCode === 3);
});

test('accepts only the frozen Catalog and Common Driver path rebasing', async () => {
  const plan = buildCommonSetupPlan(await planInput());
  assert.equal(rebaseCommonSetupPlanRefs({
    plan,
    manifestCatalogRef: { ...plan.common_fixture_catalog_ref, path: 'inputs/common/dev-canvas-06-common-fixture-catalog.json' },
    manifestCommonDriverRef: { ...plan.common_driver_ref, path: 'inputs/drivers/common-driver.mjs' }
  }), true);

  assert.throws(() => rebaseCommonSetupPlanRefs({
    plan,
    manifestCatalogRef: { ...plan.common_fixture_catalog_ref, path: 'inputs/common/dev-canvas-06-common-fixture-catalog.json' },
    manifestCommonDriverRef: { ...plan.common_driver_ref, path: 'inputs/drivers/common-driver.mjs', sha256: 'f'.repeat(64) }
  }), error => error.code === 'E2E_COMMON_SETUP_PLAN_REF_MISMATCH');
});

async function planInput() {
  const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  return {
    generatedAt: '2026-07-01T00:00:00.000Z',
    sourceBinding: handoff.active_binding,
    generatorRef: await ref(builderPath, 'GENERATOR_SOURCE', 'sources/scripts/build-canvas06-common-visual-fixtures.mjs'),
    commonFixtureCatalogRef: { kind: 'COMMON_FIXTURE_CATALOG', path: 'dev-canvas-06-common-fixture-catalog.json', byte_length: 123, sha256: 'a'.repeat(64) },
    commonDriverRef: await ref(driverPath, 'E2E_DRIVER_SOURCE', COMMON_DRIVER_SOURCE_PATH),
    catalogCases: e2eCases.map(case_id => ({ case_id }))
  };
}

async function ref(path, kind, logicalPath) {
  const bytes = await readFile(path);
  return { kind, path: logicalPath, byte_length: bytes.length, sha256: sha256(bytes) };
}

function refreshDigest(plan) {
  const { plan_payload_sha256: ignored, ...payload } = plan;
  plan.plan_payload_sha256 = digestJcs(payload);
}

function digestJcs(value) {
  return sha256(Buffer.from(canonicalizeJcs(value), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
