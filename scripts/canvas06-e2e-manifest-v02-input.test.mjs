import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { assertCaseDriverClosure, assertDriverCatalog, assertFreshProfileAssetStaging, assertProfileAssetThreeWayJoin, formatSourceDateEpoch, materializeProfileAssetStaging, parseProducerOptions, parseVerifierOptions, PROFILE_ASSET_SOURCE_SET, readProfileAssetSourceSet, removeProfileAssetStaging } from './canvas06-e2e-manifest-v02-input.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';

test('producer and verifier reject mode mixing, duplicate flags, and noncanonical epochs', () => {
  const producer = ['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', 'controlled', '--source-root', 'source', '--source-date-epoch', '1782864000', '--common-fixture-root', 'common', '--profile-asset-root', 'profile', '--output-root', 'output', '--out', 'dev-canvas-06/e2e/manifests/x/dev-canvas-06-e2e-manifest.json'];
  assert.equal(parseProducerOptions(producer)['input-mode'], 'CONTROLLED_TEST');
  assert.throws(() => parseProducerOptions([...producer, '--source-root', 'other']), error => error.code === 'E2E_MANIFEST_ARGUMENT_INVALID');
  assert.throws(() => parseProducerOptions(producer.map(value => value === '1782864000' ? '01782864000' : value)), error => error.code === 'E2E_MANIFEST_ARGUMENT_INVALID');
  assert.throws(() => parseVerifierOptions(['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', 'controlled', '--source-root', 'source', '--manifest-root', 'manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', 'profile', '--require-production']), error => error.code === 'E2E_MANIFEST_INPUT_CLASS_INVALID');
});

test('source date epoch has one exact UTC-whole-second representation', () => {
  assert.equal(formatSourceDateEpoch('1782864000'), '2026-07-01T00:00:00Z');
});

test('four drivers and 130/48/7/9 case closure are exact', () => {
  const drivers = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'],
    ['DRIVER-STRUCTURAL', 'structural-driver.mjs'], ['DRIVER-COMMON', 'common-driver.mjs']
  ].map(([driver_id, file]) => ({ driver_id, source_ref: { kind: 'E2E_DRIVER_SOURCE', path: `inputs/drivers/${file}` } }));
  assert.doesNotThrow(() => assertDriverCatalog(drivers));
  const family = Array.from({ length: 178 }, (_, index) => ({ case_id: `F-${index}`, capability_id: 'CAP-ISO-PROC-001', driver_id: 'DRIVER-PROCEDURAL', expectation: index < 130 ? 'PASS' : 'BLOCKED' }));
  const common = Array.from({ length: 16 }, (_, index) => ({ case_id: `C-${index}`, driver_id: 'DRIVER-COMMON', expectation: index < 7 ? 'PASS' : 'BLOCKED' }));
  assert.doesNotThrow(() => assertCaseDriverClosure([...family, ...common]));
  common[0].driver_id = 'DRIVER-PROCEDURAL';
  assert.throws(() => assertCaseDriverClosure([...family, ...common]), error => error.code === 'E2E_MANIFEST_DRIVER_INVALID');
});

test('Profile source set only accepts the frozen five paths', async () => {
  const source = await readProfileAssetSourceSet(resolve('.'));
  assert.deepEqual(source.entries.map(item => [item.kind, item.source_path, item.logical_path]), PROFILE_ASSET_SOURCE_SET.map(item => [item.kind, item.source_path, item.logical_path]));
  assert.deepEqual(source.profile_asset_refs.map(item => item.path), [
    'inputs/upstream/profile-assets/grammar/representative-opl-grammar.json',
    'inputs/upstream/profile-assets/normalization/representative-normalization.json',
    'inputs/upstream/profile-assets/profile.json',
    'inputs/upstream/profile-assets/rules/representative-rule-set.json',
    'inputs/upstream/profile-assets/symbols/representative-symbol-catalog.json'
  ]);
});

test('Profile staging target must be fresh and isolated', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-profile-staging-'));
  try {
    const source = resolve(root, 'source');
    const common = resolve(root, 'common');
    const output = resolve(root, 'output');
    await Promise.all([mkdir(source), mkdir(common), mkdir(output)]);
    await assert.rejects(
      assertFreshProfileAssetStaging({ profileAssetRoot: resolve(source, 'profile-staging'), isolatedRoots: [source, common, output] }),
      error => error.code === 'E2E_MANIFEST_TRANSACTION_INVALID'
    );
    const stage = resolve(root, 'profile-staging');
    await mkdir(stage);
    await assert.rejects(
      assertFreshProfileAssetStaging({ profileAssetRoot: stage, isolatedRoots: [source, common, output] }),
      error => error.code === 'E2E_MANIFEST_TRANSACTION_INVALID'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Profile staging materializes only the fixed five assets and is removed before final rename', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-profile-materialize-'));
  try {
    const source = await readProfileAssetSourceSet(resolve('.'));
    const handoff = JSON.parse(await readFile(resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json'), 'utf8'));
    const stage = resolve(root, 'profile-stage');
    await materializeProfileAssetStaging({ sourceSet: source, profileAssetRoot: stage, isolatedRoots: [resolve('.')] });
    const closure = await loadProfileAssetClosure({ assetRoot: stage, activeBinding: handoff.active_binding });
    assert.doesNotThrow(() => assertProfileAssetThreeWayJoin(source, closure, closure));
    await removeProfileAssetStaging(stage, async path => { await stat(path); });
    await assert.rejects(stat(stage), error => error.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
