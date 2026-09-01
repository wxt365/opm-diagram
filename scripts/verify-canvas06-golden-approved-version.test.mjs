import assert from 'node:assert/strict';
import test from 'node:test';

import { GoldenPublishError } from './release-canvas06-golden-publish.mjs';
import { parseGoldenVerifierOptions } from './verify-canvas06-golden-approved-version.mjs';

test('04 Golden Verifier CLI 只接受冻结的 approved root 和 require-approved 标志', () => {
  assert.deepEqual(parseGoldenVerifierOptions(['--approved-version-root', '/approved/versions/1.0.0', '--require-approved']), {
    approvedVersionRoot: '/approved/versions/1.0.0',
    requireApproved: true
  });
  for (const args of [
    ['--approved-version-root', '/approved/versions/1.0.0'],
    ['--approved-version-root', '/approved/versions/1.0.0', '--require-approved', 'true'],
    ['--approved-version-root', '../approved', '--require-approved'],
    ['--approved-version-root', '/approved/versions/1.0.0', '--require-approved', '--require-approved']
  ]) {
    assert.throws(() => parseGoldenVerifierOptions(args), error => error instanceof GoldenPublishError && error.code === 'GOLDEN_PUBLISH_INPUT_INVALID');
  }
});
