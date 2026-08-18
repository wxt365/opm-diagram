const PLAN_VALUE = 'srgb';
const REQUIRED_LAUNCH_ARG = '--force-color-profile=srgb';
const CANONICAL_VALUE = 'sRGB IEC61966-2.1';
const PREFIX = '--force-color-profile=';

export class ColorProfileError extends Error {
  constructor(message) {
    super(message);
    this.code = 'GOLDEN_COLOR_PROFILE_MISMATCH';
    this.exitCode = 3;
  }
}

export function canonicalizeColorProfile(planValue, launchArgs) {
  if (planValue !== PLAN_VALUE || !Array.isArray(launchArgs) || launchArgs.some(value => typeof value !== 'string')) {
    fail('Color profile input differs from the frozen raw form.');
  }
  const profileArgs = launchArgs.filter(value => value.startsWith(PREFIX));
  if (profileArgs.length !== 1 || profileArgs[0] !== REQUIRED_LAUNCH_ARG) {
    fail('Exactly one frozen color-profile launch argument is required.');
  }
  return CANONICAL_VALUE;
}

function fail(message) {
  throw new ColorProfileError(message);
}
