import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const schemaPath = resolve('docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json');
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);
const fontRoles = ['CJK_FALLBACK', 'MONOSPACE', 'UI_SANS'];
const blankIds = ['VP-1440X900.Z-025', 'VP-1440X900.Z-100', 'VP-1440X900.Z-400', 'VP-1280X800.Z-025', 'VP-1280X800.Z-100', 'VP-1280X800.Z-400', 'VP-390X844.Z-025', 'VP-390X844.Z-100', 'VP-390X844.Z-400'];

if (resolve(process.argv[1] ?? '') === new URL(import.meta.url).pathname) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const environment = await readEnvironment(required(options, 'environment'));
    verifyGoldenEnvironmentV02(environment, { sourceDateEpoch: integer(required(options, 'source-date-epoch')) });
  } catch (error) {
    console.error(error.code ?? 'GOLDEN_ENVIRONMENT_INTERNAL_ERROR');
    if (error.message && error.message !== error.code) console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  }
}

export function verifyGoldenEnvironmentV02(environment, { sourceDateEpoch } = {}) {
  if (!Number.isSafeInteger(sourceDateEpoch) || sourceDateEpoch < 0) fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2);
  if (!validate(environment)) fail('GOLDEN_ENVIRONMENT_SCHEMA_INVALID', 2);
  verifyBrowserRealpath(environment.browser_executable.realpath);
  verifyGeneratedAt(environment.generated_at, sourceDateEpoch);
  verifyFonts(environment.font_refs);
  verifyLaunchArgs(environment.launch_args);
  verifyPngRefs(environment.png_refs);
  verifyBlanks(environment.blank_baseline_refs);
  const expectedFingerprint = sha(jcs(fingerprintInput(environment)));
  if (environment.environment_fingerprint !== expectedFingerprint) fail('GOLDEN_ENVIRONMENT_FINGERPRINT_MISMATCH', 3);
  const expectedId = `dev-canvas-06.golden-environment.${expectedFingerprint.slice(0, 12)}`;
  if (environment.environment_id !== expectedId) fail('GOLDEN_ENVIRONMENT_IDENTITY_MISMATCH', 3);
}

function verifyBrowserRealpath(value) {
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value);
  if ((!isAbsolute(value) && !windowsAbsolute) || /(?:^|[\\/])\.?(?:\.(?:[\\/]|$))/.test(value)) fail('GOLDEN_ENVIRONMENT_BROWSER_PATH_INVALID', 2);
}

function verifyGeneratedAt(value, epoch) {
  if (value !== new Date(epoch * 1000).toISOString()) fail('GOLDEN_ENVIRONMENT_EPOCH_MISMATCH', 3);
}

function verifyFonts(refs) {
  const roles = refs.map(value => value.logical_role);
  if (JSON.stringify(roles) !== JSON.stringify(fontRoles)) fail('GOLDEN_ENVIRONMENT_FONT_SET_INVALID', 3);
  const sorted = [...refs].sort(compareFont);
  if (!same(sorted, refs) || new Set(refs.map(value => `${value.postscript_name}\u0000${value.path}`)).size !== refs.length) fail('GOLDEN_ENVIRONMENT_FONT_SET_INVALID', 3);
}

function verifyLaunchArgs(args) {
  if (args.filter(value => value === '--force-color-profile=srgb').length !== 1 || new Set(args).size !== args.length) fail('GOLDEN_ENVIRONMENT_LAUNCH_ARGS_INVALID', 3);
}

function verifyPngRefs(refs) {
  if (new Set(refs.map(value => value.capture_id)).size !== refs.length || new Set(refs.map(value => value.ref.path)).size !== refs.length) fail('GOLDEN_ENVIRONMENT_CAPTURE_SET_INVALID', 3);
}

function verifyBlanks(refs) {
  if (JSON.stringify(refs.map(value => value.baseline_id)) !== JSON.stringify(blankIds) || new Set(refs.map(value => value.ref.path)).size !== refs.length) fail('GOLDEN_ENVIRONMENT_BLANK_SET_INVALID', 3);
}

function fingerprintInput(value) {
  return {
    os_name: value.os_name,
    os_build: value.os_build,
    arch: value.arch,
    playwright_version: value.playwright_version,
    chromium_version: value.chromium_version,
    browser_executable_sha256: value.browser_executable.sha256,
    launch_args: value.launch_args,
    color_profile: value.color_profile,
    font_refs: value.font_refs,
    locale: value.locale,
    timezone: value.timezone,
    color_scheme: value.color_scheme,
    reduced_motion: value.reduced_motion,
    device_scale_factor: value.device_scale_factor,
    screenshot_options: value.screenshot_options
  };
}

async function readEnvironment(path) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT') fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2);
    fail('GOLDEN_ENVIRONMENT_IO_ERROR', 4);
  }
}

function parseOptions(values) {
  const allowed = new Set(['environment', 'source-date-epoch']);
  if (values.length !== 4) fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2);
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || !value || result.has(flag.slice(2))) fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2);
    result.set(flag.slice(2), value);
  }
  return result;
}

function required(values, key) { const value = values.get(key); if (!value) fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2); return value; }
function integer(value) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) fail('GOLDEN_ENVIRONMENT_INPUT_INVALID', 2); return parsed; }
function compareFont(left, right) { for (const key of ['logical_role', 'postscript_name', 'path']) { if (left[key] < right[key]) return -1; if (left[key] > right[key]) return 1; } return 0; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
function fail(code, exitCode) { const error = new Error(code); error.code = code; error.exitCode = exitCode; throw error; }
