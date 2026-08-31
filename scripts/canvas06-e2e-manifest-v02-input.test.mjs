import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCaseDriverClosure, assertDriverCatalog, formatSourceDateEpoch, parseProducerOptions, parseVerifierOptions } from './canvas06-e2e-manifest-v02-input.mjs';

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
