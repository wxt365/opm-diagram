import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVerifierOptions } from './release-canvas06-e2e-fault-launcher-preflight-input.mjs';

test('verifier requires each absolute input exactly once', () => {
  const valid = ['--source-root', '/source', '--controlled-bundle-root', '/bundle', '--fixed-handoff', '/handoff.json', '--production-activation-root', '/activation'];
  assert.deepEqual(parseVerifierOptions(valid), { 'source-root': '/source', 'controlled-bundle-root': '/bundle', 'fixed-handoff': '/handoff.json', 'production-activation-root': '/activation' });
  assert.throws(() => parseVerifierOptions([...valid, '--source-root', '/again']), error => error.code === 'PRELIGHT_INPUT_ARGUMENT_INVALID');
  assert.throws(() => parseVerifierOptions(['--source-root=/source', '/bundle']), error => error.code === 'PRELIGHT_INPUT_ARGUMENT_INVALID');
});
