import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { PreflightInputError, main } from './release-canvas06-e2e-fault-launcher-preflight-input.mjs';

const gateObservationSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json', import.meta.url), 'utf8'));
const validateGateObservation = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(gateObservationSchema);

test('producer atomically creates a v0.2 fault-launcher bundle with a closed descriptor', async t => {
  const fixture = await createFixture(t);
  const result = await main(producerArgs(fixture), {
    now: () => new Date('2026-08-26T00:00:00.000Z'),
    run: async tokens => {
      if (tokens.at(-1) === '-version') return { stderr: 'openjdk version "21.0.7"' };
      await mkdir(resolve(fixture.source, 'services/local-runtime/target/surefire-reports'), { recursive: true });
      await writeFile(resolve(fixture.source, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar'), 'runtime-jar');
      await writeFile(resolve(fixture.source, 'services/local-runtime/target/surefire-reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml'), surefireXml());
      return { stdout: '' };
    },
    allocatePorts: async () => Array.from({ length: 12 }, (_, index) => 41000 + index)
  });

  const descriptor = JSON.parse(await readFile(resolve(result.bundle_root, 'fault-launcher/preflight-descriptor.json'), 'utf8'));
  assert.equal(descriptor.generated_at, '2026-08-26T00:00:00Z');
  assert.equal(descriptor.fault_attempt_schedule.length, 6);
  assert.equal(new Set(descriptor.port_allocations.flatMap(item => [item.runtime_port, item.web_port])).size, 12);
  assert.ok(result.bundle_id.startsWith('canvas06-controlled-'));
});

test('producer rejects a noncanonical JarIT result before publishing a bundle root', async t => {
  const fixture = await createFixture(t);
  await assert.rejects(
    () => main(producerArgs(fixture), {
      now: () => new Date('2026-08-26T00:00:00.000Z'),
      run: async tokens => {
        if (tokens.at(-1) === '-version') return { stderr: 'openjdk version "21.0.7"' };
        await mkdir(resolve(fixture.source, 'services/local-runtime/target/surefire-reports'), { recursive: true });
        await writeFile(resolve(fixture.source, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar'), 'runtime-jar');
        await writeFile(resolve(fixture.source, 'services/local-runtime/target/surefire-reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml'), '<testsuite tests="5" failures="0" errors="0" skipped="0"></testsuite>');
      },
      allocatePorts: async () => Array.from({ length: 12 }, (_, index) => 42000 + index)
    }),
    error => error instanceof PreflightInputError && error.code === 'PRELIGHT_INPUT_INVALID'
  );
  assert.deepEqual(await (await import('node:fs/promises')).readdir(fixture.output), []);
});

test('Gate Observation Schema 接受封闭 phase 快照并拒绝未知字段', () => {
  const value = gateObservation();
  assert.equal(validateGateObservation(value), true, JSON.stringify(validateGateObservation.errors));
  value.before.unexpected = true;
  assert.equal(validateGateObservation(value), false);
});

async function createFixture(t) {
  const work = await mkdtemp(resolve(tmpdir(), 'canvas06-preflight-producer-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = resolve(work, 'source');
  const controlled = resolve(work, 'controlled');
  const output = resolve(work, 'output');
  const activation = resolve(work, 'activation');
  const javaHome = resolve(work, 'java');
  await mkdir(resolve(source, 'services/local-runtime'), { recursive: true });
  await writeFile(resolve(source, '.gitignore'), 'services/local-runtime/target/\n');
  await git(source, ['init']);
  await git(source, ['config', 'user.email', 'tests@example.invalid']);
  await git(source, ['config', 'user.name', 'Tests']);
  await git(source, ['add', '.gitignore']);
  await git(source, ['commit', '-m', 'fixture']);
  await mkdir(output);
  await mkdir(activation);
  await mkdir(resolve(javaHome, 'bin'), { recursive: true });
  const java = resolve(javaHome, 'bin/java');
  await writeFile(java, '#!/bin/sh\n');
  await chmod(java, 0o755);
  const browser = process.execPath;
  const handoff = resolve(work, 'fixed-handoff.json');
  await writeFile(handoff, JSON.stringify({ production_gate: { state: 'DISABLED', enabled_capability_ids: [] } }));
  const controlledBundle = await createLegacyBundle({ root: controlled, handoff });
  const environment = resolve(work, 'golden-environment.json');
  await writeFile(environment, JSON.stringify(goldenEnvironment(browser)));
  return { source, controlled: controlledBundle, output, activation, javaHome, browser, handoff, environment };
}

function producerArgs(value) {
  return ['--source-root', value.source, '--controlled-input-root', value.controlled, '--output-parent', value.output, '--maven-executable', process.execPath, '--java-home', value.javaHome, '--golden-environment', value.environment, '--browser-executable', value.browser, '--fixed-handoff', value.handoff, '--production-activation-root', value.activation];
}

async function createLegacyBundle({ root, handoff }) {
  const handoffBytes = await readFile(handoff);
  const refs = {
    handoff_ref: ref('HANDOFF', 'handoff/fixed-handoff.json', handoffBytes),
    intake_report_ref: ref('INTAKE_REPORT', 'intake/report.json', Buffer.from('intake')),
    evidence_bundle_ref: ref('EVIDENCE_BUNDLE', 'evidence/evidence.zip', Buffer.from('evidence'))
  };
  const identity = sha(jcs({ bundle_class: 'CONTROLLED_TEST', ...refs, approved_version_ref: null }));
  const bundleRoot = resolve(root, `canvas06-controlled-${identity}`);
  await mkdir(bundleRoot, { recursive: true });
  await writeRef(bundleRoot, refs.handoff_ref, handoffBytes);
  await writeRef(bundleRoot, refs.intake_report_ref, Buffer.from('intake'));
  await writeRef(bundleRoot, refs.evidence_bundle_ref, Buffer.from('evidence'));
  await writeFile(resolve(bundleRoot, 'controlled-bundle.json'), JSON.stringify({ schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: '0.1', bundle_class: 'CONTROLLED_TEST', bundle_id: basename(bundleRoot), bundle_identity_sha256: identity, ...refs, approved_version_ref: null }));
  return bundleRoot;
}

async function writeRef(root, value, bytes) { const target = resolve(root, value.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
function ref(kind, path, bytes) { return { kind, path, byte_length: bytes.length, sha256: sha(bytes) }; }
function surefireXml() { const methods = ['detectsPlanDriftDuringChildShutdown', 'rejectsAJarWhoseEmbeddedSchemaDiffersFromTheFrozenRawBytes', 'rejectsAPartialTupleBeforeSpringBootStarts', 'rejectsAnInvalidChallengeFromTheExactJar', 'rejectsShutdownWhenThePlannedSingleTriggerDidNotOccur', 'startsOnlyTheExactJarWithACompleteTupleAndEmitsReady']; return `<testsuite tests="6" failures="0" errors="0" skipped="0">${methods.map(name => `<testcase name="${name}"/>`).join('')}</testsuite>`; }
function goldenEnvironment(browser) {
  const browserBytes = readFileSync(browser);
  const executable = { realpath: browser, byte_length: browserBytes.length, sha256: sha(browserBytes) };
  const font_refs = ['CJK_FALLBACK', 'MONOSPACE', 'UI_SANS'].map(logical_role => ({ logical_role, postscript_name: logical_role, font_version: '1', path: `environment/fonts/${logical_role}.otf`, byte_length: 1, sha256: sha('x') }));
  const png_refs = Array.from({ length: 1242 }, (_, index) => ({ capture_id: `capture-${index}`, ref: ref('PNG', `png/${index}.png`, Buffer.from('x')) }));
  const blank = ['VP-1440X900.Z-025', 'VP-1440X900.Z-100', 'VP-1440X900.Z-400', 'VP-1280X800.Z-025', 'VP-1280X800.Z-100', 'VP-1280X800.Z-400', 'VP-390X844.Z-025', 'VP-390X844.Z-100', 'VP-390X844.Z-400'];
  const value = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001', schema_version: '0.2', generated_at: '2026-08-26T00:00:00.000Z', os_name: process.platform, os_build: 'test', arch: process.arch, playwright_version: '1.57.0', chromium_version: '143.0.7499.4', browser_executable: executable, launch_args: ['--force-color-profile=srgb'], color_profile: 'sRGB IEC61966-2.1', font_refs, locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css', mask_count: 0 }, png_refs, blank_baseline_refs: blank.map((baseline_id, index) => ({ baseline_id, ref: ref('BLANK_PNG', `blank/${index}.png`, Buffer.from('x')) })) };
  value.environment_fingerprint = sha(jcs({ os_name: value.os_name, os_build: value.os_build, arch: value.arch, playwright_version: value.playwright_version, chromium_version: value.chromium_version, browser_executable_sha256: executable.sha256, launch_args: value.launch_args, color_profile: value.color_profile, font_refs: value.font_refs, locale: value.locale, timezone: value.timezone, color_scheme: value.color_scheme, reduced_motion: value.reduced_motion, device_scale_factor: value.device_scale_factor, screenshot_options: value.screenshot_options }));
  value.environment_id = `dev-canvas-06.golden-environment.${value.environment_fingerprint.slice(0, 12)}`;
  return value;
}

function gateObservation() {
  const digest64 = 'a'.repeat(64);
  const fileRef = { kind: 'HANDOFF', path: 'handoff/fixed-handoff.json', byte_length: 1, sha256: digest64 };
  const snapshot = phase => ({ observed_at: '2026-08-26T00:00:00Z', state: 'DISABLED', enabled_capability_ids: [], candidate_loader_status: 'NOT_ACTIVE', fixed_handoff_ref: fileRef, fixed_handoff_realpath: '/fixed-handoff.json', activation_input_root_realpath: '/activation', activation_input_refs: [], activation_input_set_sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', snapshot_payload_sha256: digest64, ...phase });
  return { schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-GATE-OBSERVATION-001', schema_version: '0.1', observation_id: `dev-canvas-06.fault-launcher-gate.${digest64.slice(0, 12)}.${digest64.slice(0, 12)}`, generated_at: '2026-08-26T00:00:00Z', preflight_descriptor_ref: { bundle_id: `canvas06-controlled-${digest64}`, bundle_identity_sha256: digest64, path: 'fault-launcher/preflight-descriptor.json', byte_length: 1, sha256: digest64 }, preflight_report_ref: { kind: 'FAULT_LAUNCHER_PREFLIGHT_REPORT', path: 'fault-launcher/preflight-report.json', byte_length: 1, sha256: digest64 }, before: snapshot({ phase: 'BEFORE' }), during: Array.from({ length: 12 }, (_, index) => snapshot({ phase: 'DURING', schedule_id: `FL-SCH-${String(Math.floor(index / 2) + 1).padStart(2, '0')}`, process_cycle: index % 2 === 0 ? 'INITIAL' : 'REOPEN', ordinal: index + 1 })), after: snapshot({ phase: 'AFTER' }), production_gate_mutation_count: 0, observation_status: 'PASS_MATCHED', failures: [], observation_payload_sha256: digest64 };
}

async function git(cwd, args) { execFileSync('git', ['-C', cwd, ...args]); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; }
