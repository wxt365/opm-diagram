import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { main, RecoveryManifestBuilderError } from './release-canvas06-recovery-manifest.mjs';
import { main as verify } from './verify-canvas06-recovery-manifest.mjs';

const repositoryRoot = resolve('.');
const profileRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
const handoffRoot = resolve(profileRoot, 'handoff');
const frozenCommit = 'b940ac9bb73442c3a697cce8bfa7c9df52856b3a';
const epoch = '1785758631';

test('builds one atomic Recovery source mirror with the active Manifest and Gate Fixture', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-recovery-manifest-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createSource(work);
  const evidence = resolve(work, 'evidence');

  const result = await main(argumentsFor({ source, evidence }), runtime());
  assert.deepEqual(result, {
    manifest: 'dev-canvas-06/recovery/dev-canvas-06-recovery-manifest.json',
    gateFixture: 'dev-canvas-06/recovery/dev-canvas-06-recovery-gate-fixture.json'
  });
  const manifest = await json(resolve(evidence, result.manifest));
  const fixture = await json(resolve(evidence, result.gateFixture));
  assert.equal(manifest.schema_version, '0.2');
  assert.equal(manifest.manifest_version, '0.2.0');
  assert.equal(manifest.case_catalog.length, 28);
  assert.equal(manifest.summary.required_attempt_count, 56);
  assert.equal(manifest.source_build.source_commit, frozenCommit);
  assert.equal(fixture.test_only, true);
  assert.equal(fixture.enabled_capability_ids.length, 34);
  assert.deepEqual(await readFile(resolve(evidence, manifest.handoff_ref.path)), await readFile(resolve(source, manifest.handoff_ref.path)));
  assert.deepEqual(await readFile(resolve(evidence, manifest.source_build.local_runtime_jar.path)), await readFile(resolve(source, manifest.source_build.local_runtime_jar.path)));
  assert.deepEqual(await readFile(resolve(evidence, 'dev-canvas-06/recovery/build/recovery-test-tools.jar')), await readFile(resolve(source, 'services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar')));
  await verify(['--evidence-root', evidence, '--manifest', result.manifest, '--gate-fixture', result.gateFixture]);
  const webFile = resolve(evidence, manifest.source_build.web_dist.path, 'index.html');
  const originalWeb = await readFile(webFile);
  await writeFile(webFile, '<!doctype html><title>tampered</title>');
  await assert.rejects(
    () => verify(['--evidence-root', evidence, '--manifest', result.manifest, '--gate-fixture', result.gateFixture]),
    error => error?.code === 'RECOVERY_INPUT_INVALID'
  );
  assert.equal(await readFile(webFile, 'utf8'), '<!doctype html><title>tampered</title>');
  await writeFile(webFile, originalWeb);
});

test('rejects a non-frozen output path before any evidence root exists', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-recovery-manifest-invalid-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createSource(work);
  const evidence = resolve(work, 'evidence');
  const values = argumentsFor({ source, evidence });
  values[values.indexOf('--manifest-out') + 1] = 'other.json';

  await assert.rejects(() => main(values, runtime()), RecoveryManifestBuilderError);
  await assert.rejects(() => readFile(resolve(evidence, 'dev-canvas-06/recovery/dev-canvas-06-recovery-manifest.json')), /ENOENT/);
});

test('does not publish a partial evidence root when a late source mirror input is absent', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-recovery-manifest-atomic-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createSource(work);
  const evidence = resolve(work, 'evidence');
  await rm(resolve(source, 'scripts/release-canvas06-recovery-manifest.mjs'));

  await assert.rejects(() => main(argumentsFor({ source, evidence }), runtime()), RecoveryManifestBuilderError);
  await assert.rejects(() => readFile(resolve(evidence, 'dev-canvas-06/recovery/dev-canvas-06-recovery-manifest.json')), /ENOENT/);
});

test('rejects an existing evidence root without overwriting it', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-recovery-manifest-existing-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createSource(work);
  const evidence = resolve(work, 'evidence');
  await mkdir(evidence);
  await writeFile(resolve(evidence, 'keep.txt'), 'user evidence');

  await assert.rejects(() => main(argumentsFor({ source, evidence }), runtime()), RecoveryManifestBuilderError);
  assert.equal(await readFile(resolve(evidence, 'keep.txt'), 'utf8'), 'user evidence');
});

function argumentsFor({ source, evidence }) {
  return [
    '--handoff-root', handoffRoot,
    '--evidence-root', evidence,
    '--intake-report', 'releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json',
    '--source-root', source,
    '--source-date-epoch', epoch,
    '--web-dist', 'dist',
    '--runtime-jar', 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar',
    '--factory-helper-jar', 'services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar',
    '--factory-root', 'tests/recovery/release/dev-canvas-06/factories',
    '--model-template', 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json',
    '--gate-template', 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json',
    '--manifest-out', 'dev-canvas-06/recovery/dev-canvas-06-recovery-manifest.json',
    '--gate-fixture-out', 'dev-canvas-06/recovery/dev-canvas-06-recovery-gate-fixture.json'
  ];
}

function runtime() {
  return { sourceCommit: async () => frozenCommit, jar: 'jar', javaVersion: 'java version "21.0.7"' };
}

async function createSource(work) {
  const source = resolve(work, 'source');
  await mkdir(source);
  await cp(profileRoot, resolve(source, 'packages/profiles/profile.iso19450.2024.draft/0.2.0'), { recursive: true });
  for (const path of [
    'tests/recovery/release/dev-canvas-06/templates/0.1.0',
    'tests/recovery/release/dev-canvas-06/catalogs/0.1.0',
    'tests/recovery/release/dev-canvas-06/factories'
  ]) await cp(resolve(repositoryRoot, path), resolve(source, path), { recursive: true });
  await mkdir(resolve(source, 'services/recovery-test-tools/target'), { recursive: true });
  await cp(resolve(repositoryRoot, 'services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar'), resolve(source, 'services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar'));
  await mkdir(resolve(source, 'scripts'), { recursive: true });
  await cp(resolve(repositoryRoot, 'scripts/release-canvas06-recovery-manifest.mjs'), resolve(source, 'scripts/release-canvas06-recovery-manifest.mjs'));
  await mkdir(resolve(source, 'dist'), { recursive: true });
  await writeFile(resolve(source, 'dist/index.html'), '<!doctype html><title>recovery</title>');
  await writeFile(resolve(source, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  return source;
}

async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
