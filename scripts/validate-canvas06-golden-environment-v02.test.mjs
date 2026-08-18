import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { verifyGoldenEnvironmentV02 } from './verify-canvas06-golden-environment-v02.mjs';

const root = resolve('.');
const schema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);
const epoch = 1785628800;

test('Schema accepts the complete Golden Environment 0.2 contract', () => {
  assert.equal(validate(environment()), true, JSON.stringify(validate.errors));
});

test('Schema rejects missing browser evidence, invalid screenshot options, duplicate font role, incomplete asset sets, unsafe paths, and unknown fields', () => {
  const missingBrowser = environment();
  delete missingBrowser.browser_executable;
  assert.equal(validate(missingBrowser), false);

  const screenshot = environment();
  screenshot.screenshot_options.mask_count = 1;
  assert.equal(validate(screenshot), false);

  const duplicateRole = environment();
  duplicateRole.font_refs[2].logical_role = 'CJK_FALLBACK';
  assert.equal(validate(duplicateRole), false);

  const incomplete = environment();
  incomplete.png_refs.pop();
  assert.equal(validate(incomplete), false);

  const unsafePath = environment();
  unsafePath.font_refs[0].path = 'environment/fonts/../escaped.ttf';
  assert.equal(validate(unsafePath), false);

  const unknown = environment();
  unknown.accept_new_golden = true;
  assert.equal(validate(unknown), false);
});

test('Verifier accepts a complete Environment and independently recomputes fingerprint, identity, and epoch', () => {
  assert.doesNotThrow(() => verifyGoldenEnvironmentV02(environment(), { sourceDateEpoch: epoch }));

  const fingerprint = environment();
  fingerprint.environment_fingerprint = digest('wrong');
  assert.throws(() => verifyGoldenEnvironmentV02(fingerprint, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_FINGERPRINT_MISMATCH' });

  const identity = environment();
  identity.environment_id = 'dev-canvas-06.golden-environment.000000000000';
  assert.throws(() => verifyGoldenEnvironmentV02(identity, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_IDENTITY_MISMATCH' });

  const generated = environment();
  generated.generated_at = '2026-08-02T00:00:01.000Z';
  assert.throws(() => verifyGoldenEnvironmentV02(generated, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_EPOCH_MISMATCH' });

  const browserPath = environment();
  browserPath.browser_executable.realpath = 'relative/chrome';
  assert.throws(() => verifyGoldenEnvironmentV02(browserPath, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_BROWSER_PATH_INVALID' });
});

test('Verifier rejects semantically invalid sort order and duplicate capture or blank evidence', () => {
  const unsortedFonts = environment();
  [unsortedFonts.font_refs[0], unsortedFonts.font_refs[1]] = [unsortedFonts.font_refs[1], unsortedFonts.font_refs[0]];
  assert.throws(() => verifyGoldenEnvironmentV02(unsortedFonts, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_FONT_SET_INVALID' });

  const duplicateCapture = environment();
  duplicateCapture.png_refs[1].capture_id = duplicateCapture.png_refs[0].capture_id;
  assert.throws(() => verifyGoldenEnvironmentV02(duplicateCapture, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_CAPTURE_SET_INVALID' });

  const reorderedBlank = environment();
  [reorderedBlank.blank_baseline_refs[0], reorderedBlank.blank_baseline_refs[1]] = [reorderedBlank.blank_baseline_refs[1], reorderedBlank.blank_baseline_refs[0]];
  assert.throws(() => verifyGoldenEnvironmentV02(reorderedBlank, { sourceDateEpoch: epoch }), { code: 'GOLDEN_ENVIRONMENT_BLANK_SET_INVALID' });
});

test('Verifier CLI rejects unknown options with no output files', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-environment-'));
  try {
    const input = resolve(directory, 'environment.json');
    await writeFile(input, JSON.stringify(environment()));
    const before = await readdir(directory);
    const valid = spawnSync(process.execPath, [resolve(root, 'scripts/verify-canvas06-golden-environment-v02.mjs'), '--environment', input, '--source-date-epoch', String(epoch)], { cwd: root, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, '');
    assert.deepEqual(await readdir(directory), before);
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/verify-canvas06-golden-environment-v02.mjs'), '--environment', input, '--source-date-epoch', String(epoch), '--accept-new-golden', 'true'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^GOLDEN_ENVIRONMENT_INPUT_INVALID/m);
    assert.deepEqual(await readdir(directory), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function environment() {
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001',
    schema_version: '0.2',
    environment_id: '',
    generated_at: new Date(epoch * 1000).toISOString(),
    os_name: 'darwin',
    os_build: 'macOS-26.0',
    arch: 'arm64',
    playwright_version: '1.57.0',
    chromium_version: '143.0.7499.4',
    browser_executable: { realpath: '/opt/chromium/chrome', byte_length: 1, sha256: digest('browser') },
    launch_args: ['--force-color-profile=srgb'],
    color_profile: 'sRGB IEC61966-2.1',
    font_refs: [
      font('CJK_FALLBACK', 'NotoSansCJKsc-Regular', 'environment/fonts/noto-cjk.otf'),
      font('MONOSPACE', 'NotoSansMono-Regular', 'environment/fonts/noto-mono.ttf'),
      font('UI_SANS', 'NotoSans-Regular', 'environment/fonts/noto-sans.ttf')
    ],
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    color_scheme: 'light',
    reduced_motion: 'reduce',
    device_scale_factor: 1,
    screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css', mask_count: 0 },
    environment_fingerprint: '',
    png_refs: Array.from({ length: 1242 }, (_, index) => ({ capture_id: `VIS-CANVAS.CAP-${String(index).padStart(4, '0')}`, ref: ref('PNG', `capture-${String(index).padStart(4, '0')}.png`) })),
    blank_baseline_refs: baselines()
  };
  value.environment_fingerprint = digest(jcs(fingerprintInput(value)));
  value.environment_id = `dev-canvas-06.golden-environment.${value.environment_fingerprint.slice(0, 12)}`;
  return value;
}

function fingerprintInput(value) {
  return { os_name: value.os_name, os_build: value.os_build, arch: value.arch, playwright_version: value.playwright_version, chromium_version: value.chromium_version, browser_executable_sha256: value.browser_executable.sha256, launch_args: value.launch_args, color_profile: value.color_profile, font_refs: value.font_refs, locale: value.locale, timezone: value.timezone, color_scheme: value.color_scheme, reduced_motion: value.reduced_motion, device_scale_factor: value.device_scale_factor, screenshot_options: value.screenshot_options };
}

function baselines() { return ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => ({ baseline_id: `${viewport}.${zoom}`, ref: ref('BLANK_PNG', `blank/${viewport}.${zoom}.png`) }))); }
function font(logical_role, postscript_name, path) { return { logical_role, postscript_name, font_version: '1.0', path, byte_length: 1, sha256: digest(`${logical_role}:${path}`) }; }
function ref(kind, path) { return { kind, path, byte_length: 1, sha256: digest(`${kind}:${path}`) }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; }
