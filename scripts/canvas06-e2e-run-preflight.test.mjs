import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eRunInputError } from './canvas06-e2e-run-input.mjs';
import { assertCapabilityClosure, inspectRuntime, inspectSource, manifestVerifierArgs, verifyManifestCommonFixtureInput } from './canvas06-e2e-run-preflight.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const commonFixtureBuilder = resolve(repositoryRoot, 'scripts/build-canvas06-common-visual-fixtures.mjs');
const handoff = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json');

test('derives the ordered 34-capability closure and rejects duplicates', () => {
  const closure = assertCapabilityClosure(capabilities());
  assert.equal(closure.length, 34);
  assert.equal(closure[0].family, 'PROCEDURAL');
  assert.equal(closure[16].family, 'CONTROL');
  assert.equal(closure[24].family, 'STRUCTURAL');
  assert.deepEqual(closure[0].covered_coverage_keys, ['coverage-PROC-1']);
  assert.equal(Object.hasOwn(closure[0], 'coverage_keys'), false);
  expectError(() => assertCapabilityClosure([...capabilities().slice(0, 33), capabilities()[0]]), 'E2E_RUN_CAPABILITY_CLOSURE_INVALID');
});

test('preflight only constructs the active Manifest v02 verifier command', () => {
  const args = manifestVerifierArgs({
    'input-mode': 'PRODUCTION_HANDOFF',
    'handoff-root': '/handoff',
    'intake-report': 'reports/intake.json',
    'source-root': '/source',
    'manifest-root': '/manifest',
    manifest: 'dev-canvas-06-e2e-manifest.json',
    'profile-asset-root': '/manifest/inputs/upstream/profile-assets'
  });
  assert.deepEqual(args, [
    '--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', '/handoff', '--intake-report', 'reports/intake.json',
    '--source-root', '/source', '--manifest-root', '/manifest', '--manifest', 'dev-canvas-06-e2e-manifest.json',
    '--profile-asset-root', '/manifest/inputs/upstream/profile-assets', '--require-production'
  ]);
});

test('requires clean exact source commit and frozen Java/Chromium versions', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-preflight-'));
  const javaHome = resolve(root, 'java');
  await mkdir(resolve(javaHome, 'bin'), { recursive: true });
  const java = resolve(javaHome, 'bin/java');
  const browser = resolve(root, 'chromium');
  await writeFile(java, 'java');
  await writeFile(browser, 'chromium');
  await chmod(java, 0o755);
  await chmod(browser, 0o755);
  const exec = async (file, args) => {
    if (file === 'git' && args.at(-1) === 'HEAD') return { stdout: `${'a'.repeat(40)}\n`, stderr: '' };
    if (file === 'git') return { stdout: '', stderr: '' };
    if (args[0] === '-version') return { stdout: '', stderr: 'openjdk version "21.0.7"' };
    return { stdout: 'Chromium 143.0.7499.4', stderr: '' };
  };
  assert.equal((await inspectSource({ sourceRoot: root, expectedCommit: 'a'.repeat(40), exec })).source_commit, 'a'.repeat(40));
  assert.match((await inspectRuntime({ javaHome, browserExecutable: browser, exec })).browser_sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(() => inspectSource({ sourceRoot: root, expectedCommit: 'b'.repeat(40), exec }), error => error.code === 'E2E_RUN_SOURCE_INVALID');
});

test('verifies the exact Common Fixture inputs from the Manifest staging root', async t => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-preflight-common-'));
  const commonRoot = resolve(root, 'inputs/common');
  t.after(() => rm(root, { recursive: true, force: true }));
  const built = spawnSync(process.execPath, [
    commonFixtureBuilder,
    '--handoff', handoff,
    '--fixture-root', commonRoot,
    '--source-date-epoch', '1782864000'
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const catalog = JSON.parse(await readFile(resolve(commonRoot, 'dev-canvas-06-common-fixture-catalog.json'), 'utf8'));
  const bytes = await readFile(resolve(commonRoot, 'dev-canvas-06-common-fixture-catalog.json'));
  const manifest = {
    common_fixture_catalog_ref: {
      kind: 'COMMON_FIXTURE_CATALOG',
      path: 'inputs/common/dev-canvas-06-common-fixture-catalog.json',
      byte_length: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
  };
  const verified = await verifyManifestCommonFixtureInput({ manifestRoot: root, manifest, activeBinding: catalog.source_binding });
  assert.equal(verified.cases.length, 16);

  await assert.rejects(() => verifyManifestCommonFixtureInput({
    manifestRoot: root,
    manifest: { common_fixture_catalog_ref: { ...manifest.common_fixture_catalog_ref, path: 'inputs/outside.json' } },
    activeBinding: catalog.source_binding
  }), error => error.code === 'E2E_RUN_MANIFEST_INVALID');
});

function capabilities() {
  return [
    ...Array.from({ length: 16 }, (_, index) => item('PROC', index + 1)),
    ...Array.from({ length: 8 }, (_, index) => item('CTRL', index + 1)),
    ...Array.from({ length: 10 }, (_, index) => item('STRUCT', index + 1))
  ];
}

function item(family, ordinal) {
  return { capability_id: `CAP-ISO-${family}-${String(ordinal).padStart(3, '0')}`, family, eligibility: 'ELIGIBLE_FOR_RELEASE_VALIDATION', coverage_keys: [`coverage-${family}-${ordinal}`] };
}

function expectError(operation, code) {
  assert.throws(operation, error => error instanceof E2eRunInputError && error.code === code);
}
