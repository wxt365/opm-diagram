import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';
import { commitFinalRoot, ensureFinalParent, parseBuildOptions, validateBuilderPaths } from './canvas06-e2e-manifest-v01-transaction.mjs';

test('parses the complete controlled CLI and rejects cross-mode flags', () => {
  const options = parseBuildOptions(controlledArgs());
  assert.equal(options['input-mode'], 'CONTROLLED_TEST');
  assert.throws(() => parseBuildOptions([...controlledArgs(), '--handoff-root', 'handoff']), invalidClass);
  assert.throws(() => parseBuildOptions(controlledArgs().slice(0, -2)), invalidArgument);
  assert.throws(() => parseBuildOptions(controlledArgs().map((value, index) => index === 0 ? '--unknown' : value)), invalidArgument);
});

test('rejects duplicate, equals-style, positional and invalid-mode builder arguments', () => {
  assert.throws(() => parseBuildOptions([...controlledArgs(), '--out', 'another.json']), invalidArgument);
  assert.throws(() => parseBuildOptions(controlledArgs().map((value, index) => index === 0 ? '--input-mode=CONTROLLED_TEST' : value)), invalidArgument);
  assert.throws(() => parseBuildOptions([...controlledArgs(), 'position']), invalidArgument);
  const invalidMode = controlledArgs();
  invalidMode[1] = 'UNTRUSTED';
  assert.throws(() => parseBuildOptions(invalidMode), invalidClass);
});

test('validates source-contained paths, requires an independent Common root, and rejects linked drivers', async t => {
  const root = await fixtureRoot(t);
  const options = parseBuildOptions(controlledArgs({ sourceRoot: root.source, commonRoot: root.common, outputRoot: root.output }));
  const paths = await validateBuilderPaths(options);
  assert.equal(paths.drivers.length, 3);

  await assert.rejects(
    () => validateBuilderPaths(parseBuildOptions(controlledArgs({ sourceRoot: root.source, commonRoot: resolve(root.source, 'fixtures'), outputRoot: root.output }))),
    invalidCommon
  );

  await rm(resolve(root.source, 'drivers/control-driver.mjs'));
  await symlink(resolve(root.source, 'drivers/procedural-driver.mjs'), resolve(root.source, 'drivers/control-driver.mjs'));
  await assert.rejects(() => validateBuilderPaths(options), invalidSource);

  await rm(resolve(root.source, 'drivers/control-driver.mjs'));
  await link(resolve(root.source, 'drivers/procedural-driver.mjs'), resolve(root.source, 'drivers/control-driver.mjs'));
  await assert.rejects(() => validateBuilderPaths(options), invalidSource);
});

test('rejects a symlink in the final output parent chain', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-output-parent-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const output = resolve(work, 'output');
  const outside = resolve(work, 'outside');
  await mkdir(output);
  await mkdir(outside);
  await symlink(outside, resolve(output, 'dev-canvas'));

  await assert.rejects(
    () => ensureFinalParent({ outputRoot: output, finalRoot: resolve(output, 'dev-canvas/e2e/manifests/example') }),
    invalidArgument
  );
  await assert.rejects(() => readFile(resolve(outside, 'e2e/manifests/example/dev-canvas-06-e2e-manifest.json')), /ENOENT/);
});

test('atomic transaction removes a failed staging root and commits exactly once', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-transaction-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const finalRoot = resolve(work, 'dev-canvas-06/e2e/manifests/example');
  await mkdir(resolve(work, 'dev-canvas-06/e2e/manifests'), { recursive: true });

  await assert.rejects(() => commitFinalRoot({ finalRoot, write: async staging => {
    await writeFile(resolve(staging, 'partial'), 'partial');
    throw new Error('injected');
  } }), error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_ATOMIC_COMMIT_FAILED');
  await assert.rejects(() => readFile(resolve(finalRoot, 'partial')), /ENOENT/);

  await commitFinalRoot({ finalRoot, write: staging => writeFile(resolve(staging, 'manifest.json'), 'complete') });
  assert.equal(await readFile(resolve(finalRoot, 'manifest.json'), 'utf8'), 'complete');
  await assert.rejects(() => commitFinalRoot({ finalRoot, write: async () => {} }), error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_OUTPUT_NOT_FRESH');
});

function controlledArgs({ sourceRoot = 'source', commonRoot = 'common-fixtures', outputRoot = 'output' } = {}) {
  return [
    '--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', 'bundle',
    '--source-root', sourceRoot, '--source-date-epoch', '1782864000',
    '--web-dist', 'dist', '--runtime-jar', 'runtime.jar',
    '--common-fixture-root', commonRoot, '--common-fixture-catalog', 'catalog.json',
    '--driver-root', 'drivers', '--output-root', outputRoot,
    '--out', 'dev-canvas-06/e2e/manifests/example/dev-canvas-06-e2e-manifest.json'
  ];
}

async function fixtureRoot(t) {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-paths-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = resolve(work, 'source');
  const common = resolve(work, 'common-fixtures');
  const output = resolve(work, 'output');
  await mkdir(resolve(source, 'dist'), { recursive: true });
  await mkdir(resolve(source, 'fixtures'), { recursive: true });
  await mkdir(common, { recursive: true });
  await mkdir(resolve(source, 'drivers'), { recursive: true });
  await writeFile(resolve(source, 'dist/index.html'), '<html></html>');
  await writeFile(resolve(source, 'runtime.jar'), 'jar');
  await writeFile(resolve(common, 'catalog.json'), '{}');
  for (const name of ['procedural-driver.mjs', 'control-driver.mjs', 'structural-driver.mjs']) await writeFile(resolve(source, 'drivers', name), 'export {};');
  return { source, common, output };
}

function invalidClass(error) {
  return error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_INPUT_CLASS_INVALID';
}


function invalidSource(error) {
  return error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_SOURCE_BUILD_INVALID';
}

function invalidCommon(error) {
  return error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_COMMON_FIXTURE_INVALID';
}

function invalidArgument(error) {
  return error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_ARGUMENT_INVALID';
}
