import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVerifierOptions } from './canvas06-e2e-manifest-v02-input.mjs';

test('v0.2 verifier requires an explicit source root and exact final Profile root input', () => {
  const args = ['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', 'bundle', '--source-root', 'source', '--manifest-root', 'manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', 'manifest/inputs/upstream/profile-assets'];
  assert.equal(parseVerifierOptions(args)['source-root'], 'source');
  assert.throws(() => parseVerifierOptions(args.filter(value => value !== 'source')), error => error.code === 'E2E_MANIFEST_ARGUMENT_INVALID');
});
