import assert from 'node:assert/strict';
import test from 'node:test';

import { ColorProfileError, canonicalizeColorProfile } from './canvas06-common-visual-color-profile.mjs';

test('canonicalizes only the frozen plan and launch argument pair', () => {
  assert.equal(canonicalizeColorProfile('srgb', ['--disable-background-networking', '--force-color-profile=srgb']), 'sRGB IEC61966-2.1');
});

test('rejects color aliases, malformed plan values, and non-unique launch arguments', () => {
  const invalid = [
    ['sRGB', ['--force-color-profile=srgb']],
    ['srgb ', ['--force-color-profile=srgb']],
    ['srgb', []],
    ['srgb', ['--force-color-profile=srgb', '--force-color-profile=srgb']],
    ['srgb', ['--force-color-profile=display-p3']],
    ['srgb', ['--force-color-profile=srgb', '--force-color-profile=display-p3']],
    ['srgb', ['--force-color-profile=srgb', 1]]
  ];
  for (const [planValue, launchArgs] of invalid) {
    assert.throws(() => canonicalizeColorProfile(planValue, launchArgs), error => error instanceof ColorProfileError && error.code === 'GOLDEN_COLOR_PROFILE_MISMATCH' && error.exitCode === 3);
  }
});
