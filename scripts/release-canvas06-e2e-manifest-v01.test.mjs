import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { main } from './release-canvas06-e2e-manifest-v01.mjs';
import { main as verify } from './verify-canvas06-e2e-manifest-v01.mjs';
import { jcs, listTree, sha256 } from './canvas06-e2e-manifest-v01-support.mjs';

const repositoryRoot = resolve('.');
const handoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const cleanReleaseRoot = resolve(handoffRoot, 'releases/clean-b940ac9bb734');
const intakeRelativePath = 'releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json';
const java21Home = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' }).trim();
const testRuntime = { jarPath: resolve(java21Home, 'bin/jar'), javaVersion: 'java version "21.0.7" test runtime' };

test('builder rejects the legacy production bundle and deterministically writes a Schema-valid controlled manifest', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-manifest-v01-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createCleanSource(work);
  const commonFixtureRoot = await createCommonFixtureRoot(work, 'common-fixtures');
  const sourceCommit = git(source, ['rev-parse', 'HEAD']);
  const productionManifestId = `dev-canvas-06.e2e.${sourceCommit.slice(0, 12)}.54d56bab7792`;
  const productionOut = `dev-canvas-06/e2e/manifests/${productionManifestId}/dev-canvas-06-e2e-manifest.json`;

  const productionOutput = resolve(work, 'production-output');
  await mkdir(productionOutput);
  await assert.rejects(
    () => main(args({ source, commonFixtureRoot, output: productionOutput, out: productionOut, mode: 'PRODUCTION_HANDOFF' }), { runtime: testRuntime }),
    error => error.code === 'E2E_MANIFEST_ARCHIVE_INVALID'
  );

  const bundle = await createControlledBundle(work);
  const manifestId = `dev-canvas-06.e2e.${sourceCommit.slice(0, 12)}.${bundle.intakeRef.sha256.slice(0, 12)}`;
  const out = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  const controlledOutput = resolve(work, 'controlled-output');
  await mkdir(controlledOutput);
  await main(args({ source, commonFixtureRoot, output: controlledOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime });
  const controlledManifest = await readManifest(controlledOutput, out);
  assert.equal(controlledManifest.cases.length, 194);
  assert.equal(controlledManifest.fixture_refs.filter(item => item.kind === 'FAMILY_FIXTURE_IDENTITY_CATALOG').length, 1);
  assert.equal(await readFile(resolve(controlledOutput, dirname(out), 'inputs/raw/release/dev-canvas-05-evidence-bundle.jar')).then(bytes => sha256(bytes)), controlledManifest.input_materialization.bundle_ref.sha256);
  assert.deepEqual(
    await listTree(commonFixtureRoot),
    await listTree(resolve(controlledOutput, dirname(out), 'inputs/common'))
  );
  const controlledTreeBeforeVerify = await treeDigest(resolve(controlledOutput, dirname(out)));
  await verify(verifyArgs({ output: controlledOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime });
  assert.equal(await treeDigest(resolve(controlledOutput, dirname(out))), controlledTreeBeforeVerify);

  await writeFile(resolve(controlledOutput, dirname(out), 'unexpected.tmp'), 'extra');
  await assert.rejects(() => verify(verifyArgs({ output: controlledOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime }), error => error.code === 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  await rm(resolve(controlledOutput, dirname(out), 'unexpected.tmp'));
  await assert.rejects(() => verify([...verifyArgs({ output: controlledOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), '--require-production'], { runtime: testRuntime }), error => error.code === 'E2E_MANIFEST_INPUT_CLASS_INVALID');

  const stagingRoot = resolve(work, `.${manifestId}.tmp-test`);
  await cp(resolve(controlledOutput, dirname(out)), stagingRoot, { recursive: true });
  await assert.rejects(() => verify(['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', bundle.root, '--manifest-root', stagingRoot, '--manifest', 'dev-canvas-06-e2e-manifest.json'], { runtime: testRuntime }), error => error.code === 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  await rm(stagingRoot, { recursive: true, force: true });

  const repeatOutput = resolve(work, 'controlled-repeat-output');
  await mkdir(repeatOutput);
  await main(args({ source, commonFixtureRoot, output: repeatOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime });
  assert.equal(await treeDigest(resolve(controlledOutput, dirname(out))), await treeDigest(resolve(repeatOutput, dirname(out))));

  const rawArchive = resolve(controlledOutput, dirname(out), 'inputs/raw/release/dev-canvas-05-evidence-bundle.jar');
  const originalArchive = await readFile(rawArchive);
  await writeFile(rawArchive, Buffer.concat([originalArchive, Buffer.from('tamper')]));
  await assert.rejects(() => verify(verifyArgs({ output: controlledOutput, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime }), error => error.code === 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  await writeFile(rawArchive, originalArchive);
});

test('builder rejects a final path that is not derived from the clean source and Intake identities', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-manifest-v01-invalid-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createCleanSource(work);
  const commonFixtureRoot = await createCommonFixtureRoot(work, 'common-fixtures');
  const output = resolve(work, 'output');
  await mkdir(output);
  await assert.rejects(() => main(args({ source, commonFixtureRoot, output, out: 'dev-canvas-06/e2e/manifests/not-derived/dev-canvas-06-e2e-manifest.json', mode: 'PRODUCTION_HANDOFF' })), error => error.code === 'E2E_MANIFEST_ARGUMENT_INVALID');
});

test('builder rejects a controlled descriptor with a non-null approved version before creating the final root', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-manifest-v01-controlled-invalid-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createCleanSource(work);
  const commonFixtureRoot = await createCommonFixtureRoot(work, 'common-fixtures');
  const bundle = await createControlledBundle(work);
  const descriptorPath = resolve(bundle.root, 'controlled-bundle.json');
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
  descriptor.approved_version_ref = { kind: 'APPROVED_VERSION', path: 'approved/versions/1.0.0', byte_length: 1, sha256: '0'.repeat(64) };
  await writeFile(descriptorPath, JSON.stringify(descriptor));
  const sourceCommit = git(source, ['rev-parse', 'HEAD']);
  const manifestId = `dev-canvas-06.e2e.${sourceCommit.slice(0, 12)}.${bundle.intakeRef.sha256.slice(0, 12)}`;
  const out = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  const output = resolve(work, 'output');
  await mkdir(output);

  await assert.rejects(
    () => main(args({ source, commonFixtureRoot, output, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime }),
    error => error.code === 'E2E_MANIFEST_CONTROLLED_BUNDLE_INVALID'
  );
  await assert.rejects(() => readFile(resolve(output, out)), /ENOENT/);
});

test('builder rejects Common roots that are old, incomplete, extra, or tampered before final output', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-manifest-v01-common-invalid-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createCleanSource(work);
  const bundle = await createControlledBundle(work);
  const sourceCommit = git(source, ['rev-parse', 'HEAD']);
  const manifestId = `dev-canvas-06.e2e.${sourceCommit.slice(0, 12)}.${bundle.intakeRef.sha256.slice(0, 12)}`;
  const out = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  const variants = [
    ['old-catalog', async root => {
      const path = resolve(root, 'dev-canvas-06-common-fixture-catalog.json');
      const catalog = JSON.parse(await readFile(path, 'utf8'));
      catalog.catalog_version = '0.1.0';
      await writeFile(path, JSON.stringify(catalog));
    }],
    ['missing-visual', root => rm(resolve(root, 'visual/STATE_ROLES.json'))],
    ['extra-file', root => writeFile(resolve(root, 'unexpected.json'), '{}')],
    ['tampered-e2e', root => writeFile(resolve(root, 'e2e/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES.input.json'), 'tampered fixture bytes')]
  ];

  for (const [name, mutate] of variants) {
    const commonFixtureRoot = await createCommonFixtureRoot(work, `common-fixtures-${name}`);
    await mutate(commonFixtureRoot);
    const output = resolve(work, `output-${name}`);
    await mkdir(output);
    await assert.rejects(
      () => main(args({ source, commonFixtureRoot, output, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), { runtime: testRuntime }),
      error => error.code === 'E2E_MANIFEST_COMMON_FIXTURE_INVALID',
      name
    );
    await assert.rejects(() => readFile(resolve(output, out)), /ENOENT/);
  }
});

test('every pre-rename staging checkpoint leaves no final E2E Manifest root', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-manifest-v01-staging-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await createCleanSource(work);
  const commonFixtureRoot = await createCommonFixtureRoot(work, 'common-fixtures');
  const bundle = await createControlledBundle(work);
  const sourceCommit = git(source, ['rev-parse', 'HEAD']);
  const manifestId = `dev-canvas-06.e2e.${sourceCommit.slice(0, 12)}.${bundle.intakeRef.sha256.slice(0, 12)}`;
  const out = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  const checkpoints = [
    'STAGING_CREATED', 'INPUTS_STAGED', 'CASES_DERIVED', 'MANIFEST_WRITTEN',
    'STAGING_VALIDATED', 'SEMANTIC_VERIFIED', 'STAGING_FSYNCED', 'STAGING_WRITTEN', 'BEFORE_RENAME'
  ];

  for (const injectedAt of checkpoints) {
    const output = resolve(work, `output-${injectedAt}`);
    await mkdir(output);
    await assert.rejects(
      () => main(args({ source, commonFixtureRoot, output, out, mode: 'CONTROLLED_TEST', bundleRoot: bundle.root }), {
        runtime: testRuntime,
        checkpoint: async name => {
          if (name === injectedAt) throw new Error(`injected at ${name}`);
        }
      }),
      error => error.code === 'E2E_MANIFEST_ATOMIC_COMMIT_FAILED'
    );
    const finalRoot = resolve(output, dirname(out));
    await assert.rejects(() => readFile(resolve(finalRoot, 'dev-canvas-06-e2e-manifest.json')), /ENOENT/);
    const manifestsRoot = dirname(finalRoot);
    const entries = await readdir(manifestsRoot);
    assert.equal(entries.some(entry => entry.startsWith(`.${manifestId}.tmp-`)), false, injectedAt);
  }
});

function args({ source, commonFixtureRoot, output, out, mode, bundleRoot }) {
  const common = [
    '--input-mode', mode,
    '--source-root', source,
    '--source-date-epoch', '1782864000',
    '--web-dist', 'dist',
    '--runtime-jar', 'runtime/local-runtime-0.1.0-SNAPSHOT.jar',
    '--common-fixture-root', commonFixtureRoot,
    '--common-fixture-catalog', 'dev-canvas-06-common-fixture-catalog.json',
    '--driver-root', 'tests/e2e/release/dev-canvas-06/drivers',
    '--output-root', output,
    '--out', out
  ];
  return mode === 'CONTROLLED_TEST'
    ? ['--controlled-bundle-root', bundleRoot, ...common]
    : ['--handoff-root', handoffRoot, '--intake-report', intakeRelativePath, ...common];
}

function verifyArgs({ output, out, mode, bundleRoot }) {
  const common = ['--input-mode', mode, '--manifest-root', resolve(output, dirname(out)), '--manifest', 'dev-canvas-06-e2e-manifest.json'];
  return mode === 'CONTROLLED_TEST'
    ? ['--controlled-bundle-root', bundleRoot, ...common]
    : ['--handoff-root', handoffRoot, '--intake-report', intakeRelativePath, ...common, '--require-production'];
}

async function createCleanSource(work) {
  const source = resolve(work, `source-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(resolve(source, 'dist'), { recursive: true });
  await writeFile(resolve(source, 'dist/index.html'), '<!doctype html><title>release</title>');
  await mkdir(resolve(source, 'runtime'), { recursive: true });
  await cp(resolve(cleanReleaseRoot, 'local-runtime-0.1.0-SNAPSHOT.jar'), resolve(source, 'runtime/local-runtime-0.1.0-SNAPSHOT.jar'));
  await cp(resolve(repositoryRoot, 'tests/e2e/release/dev-canvas-06/drivers'), resolve(source, 'tests/e2e/release/dev-canvas-06/drivers'), { recursive: true });
  await mkdir(resolve(source, 'scripts'), { recursive: true });
  await cp(resolve(repositoryRoot, 'scripts/release-canvas06-e2e-manifest-v01.mjs'), resolve(source, 'scripts/release-canvas06-e2e-manifest-v01.mjs'));
  await mkdir(resolve(source, 'node_modules/@playwright/test'), { recursive: true });
  await mkdir(resolve(source, 'node_modules/playwright-core'), { recursive: true });
  await writeFile(resolve(source, 'node_modules/@playwright/test/package.json'), JSON.stringify({ version: '1.57.0' }));
  await writeFile(resolve(source, 'node_modules/playwright-core/browsers.json'), JSON.stringify({ browsers: [{ name: 'chromium', revision: '1200' }] }));
  await writeFile(resolve(source, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  git(source, ['init']);
  git(source, ['config', 'user.email', 'canvas06@example.invalid']);
  git(source, ['config', 'user.name', 'Canvas06 Test']);
  git(source, ['add', '.']);
  git(source, ['commit', '-m', 'clean source']);
  return source;
}

async function createCommonFixtureRoot(work, name) {
  const fixtureRoot = resolve(work, name);
  execFileSync(process.execPath, [
    resolve(repositoryRoot, 'scripts/build-canvas06-common-visual-fixtures.mjs'),
    '--handoff', resolve(handoffRoot, 'dev-canvas-05-handoff.json'),
    '--fixture-root', fixtureRoot,
    '--source-date-epoch', '1782864000'
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  return fixtureRoot;
}

async function createControlledBundle(work) {
  const root = resolve(work, 'bundle-source');
  await mkdir(root);
  const archiveRelativePath = 'releases/clean-b940ac9bb734/dev-canvas-05-evidence-bundle.jar';
  const archivePath = resolve(root, archiveRelativePath);
  await mkdir(dirname(archivePath), { recursive: true });
  await cp(resolve(handoffRoot, archiveRelativePath), archivePath);
  const catalogSource = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-e2e-family-fixture-identity-catalog.json');
  const catalogEntry = 'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-e2e-family-fixture-identity-catalog.json';
  const archiveStaging = resolve(work, 'bundle-archive-staging');
  await mkdir(dirname(resolve(archiveStaging, catalogEntry)), { recursive: true });
  await cp(catalogSource, resolve(archiveStaging, catalogEntry));
  execFileSync(resolve(java21Home, 'bin/jar'), ['uf', archivePath, '-C', archiveStaging, catalogEntry]);

  const handoff = JSON.parse(await readFile(resolve(handoffRoot, 'dev-canvas-05-handoff.json'), 'utf8'));
  const archiveInfo = await stat(archivePath);
  const archiveSha = sha256(await readFile(archivePath));
  handoff.build_artifacts = handoff.build_artifacts.map(item => item.kind === 'EVIDENCE_BUNDLE'
    ? { ...item, byte_length: archiveInfo.size, sha256: archiveSha }
    : item);
  const handoffRelativePath = 'dev-canvas-05-handoff.json';
  await writeFile(resolve(root, handoffRelativePath), JSON.stringify(handoff));
  const handoffRef = await localRef(root, handoffRelativePath, 'HANDOFF');

  const intake = JSON.parse(await readFile(resolve(handoffRoot, intakeRelativePath), 'utf8'));
  intake.handoff_ref = handoffRef;
  await mkdir(dirname(resolve(root, intakeRelativePath)), { recursive: true });
  await writeFile(resolve(root, intakeRelativePath), JSON.stringify(intake));
  const intakeRef = await localRef(root, intakeRelativePath, 'INTAKE_REPORT');
  const refs = {
    handoff_ref: handoffRef,
    intake_report_ref: intakeRef,
    evidence_bundle_ref: await localRef(root, archiveRelativePath, 'EVIDENCE_BUNDLE')
  };
  const approved_version_ref = null;
  const identity = sha256(Buffer.from(jcs({ bundle_class: 'CONTROLLED_TEST', ...refs, approved_version_ref }), 'utf8'));
  const bundle = resolve(work, `canvas06-controlled-${identity}`);
  await cp(root, bundle, { recursive: true });
  await writeFile(resolve(bundle, 'controlled-bundle.json'), JSON.stringify({
    schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: '0.1', bundle_class: 'CONTROLLED_TEST',
    bundle_id: `canvas06-controlled-${identity}`, bundle_identity_sha256: identity, ...refs, approved_version_ref
  }));
  return { root: bundle, intakeRef };
}

async function localRef(root, path, kind) {
  const bytes = await readFile(resolve(root, path));
  return { kind, path, byte_length: bytes.length, sha256: sha256(bytes) };
}

async function copyRef(sourceRoot, destinationRoot, path, kind) {
  const source = resolve(sourceRoot, path);
  const destination = resolve(destinationRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  const bytes = await readFile(source);
  await writeFile(destination, bytes);
  return { kind, path, byte_length: bytes.length, sha256: sha256(bytes) };
}

async function readManifest(output, out) {
  return JSON.parse(await readFile(resolve(output, out), 'utf8'));
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

async function treeDigest(root) {
  return sha256(Buffer.from(jcs(await listTree(root)), 'utf8'));
}
