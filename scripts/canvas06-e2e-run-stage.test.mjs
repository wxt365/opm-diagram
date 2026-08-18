import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { stageManifestInputs, stageRunnerSourceSet, verifyStagedRunnerSourceSet } from './canvas06-e2e-run-stage.mjs';

test('copies only exact Manifest bytes and verified input tree into report staging', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-stage-'));
  const manifestRoot = resolve(root, 'manifest');
  const stagingRoot = resolve(root, 'staging');
  await mkdir(resolve(manifestRoot, 'inputs/build'), { recursive: true });
  await mkdir(stagingRoot);
  await writeFile(resolve(manifestRoot, 'dev-canvas-06-e2e-manifest.json'), '{"manifest":true}\n');
  await writeFile(resolve(manifestRoot, 'inputs/build/runtime.jar'), 'jar');
  const staged = await stageManifestInputs({ manifestRoot, stagingRoot });
  assert.equal(staged.manifestRef.path, 'inputs/manifest/dev-canvas-06-e2e-manifest.json');
  assert.deepEqual(staged.copiedInputPaths, ['build/runtime.jar']);
  assert.equal(await readFile(resolve(stagingRoot, 'inputs/build/runtime.jar'), 'utf8'), 'jar');
});

test('rejects a symlinked input before writing a report input copy', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-stage-unsafe-'));
  const manifestRoot = resolve(root, 'manifest');
  const stagingRoot = resolve(root, 'staging');
  await mkdir(resolve(manifestRoot, 'inputs/build'), { recursive: true });
  await mkdir(stagingRoot);
  await writeFile(resolve(manifestRoot, 'dev-canvas-06-e2e-manifest.json'), '{}\n');
  await writeFile(resolve(manifestRoot, 'inputs/build/runtime.jar'), 'jar');
  await symlink(resolve(manifestRoot, 'inputs/build/runtime.jar'), resolve(manifestRoot, 'inputs/build/unsafe.jar'));
  await assert.rejects(() => stageManifestInputs({ manifestRoot, stagingRoot }), error => error.code === 'E2E_RUN_MANIFEST_INVALID');
});

test('materializes the exact ordered 23-file Runner Source Set and verifies source mirrors', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-source-set-'));
  const sourceRoot = resolve(root, 'source');
  const stagingRoot = resolve(root, 'staging');
  await mkdir(stagingRoot, { recursive: true });
  const paths = await createRunnerSourceTree(sourceRoot);
  await writeFile(resolve(sourceRoot, 'untracked-extra.mjs'), 'not part of the frozen source set\n');

  const staged = await stageRunnerSourceSet({ sourceRoot, stagingRoot });
  assert.equal(staged.sourceSet.entries.length, 23);
  assert.deepEqual(staged.sourceSet.entries.map(entry => entry.path), paths);
  assert.equal(staged.sourceSetRef.path, 'inputs/runner/runner-source-set.json');
  assert.match(staged.sourceSet.source_set_sha256, /^[a-f0-9]{64}$/);
  for (const path of paths) {
    assert.deepEqual(
      await readFile(resolve(sourceRoot, path)),
      await readFile(resolve(stagingRoot, 'inputs/runner', path))
    );
  }
  const verified = await verifyStagedRunnerSourceSet({ sourceRoot, stagingRoot });
  assert.deepEqual(verified.sourceSet, staged.sourceSet);
});

test('rejects a missing source-set entry before writing any mirror and detects post-stage source drift', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-e2e-source-set-invalid-'));
  const sourceRoot = resolve(root, 'source');
  const stagingRoot = resolve(root, 'staging');
  await mkdir(stagingRoot, { recursive: true });
  const paths = await createRunnerSourceTree(sourceRoot);
  await rm(resolve(sourceRoot, paths[7]));
  await assert.rejects(
    () => stageRunnerSourceSet({ sourceRoot, stagingRoot }),
    error => error.code === 'E2E_RUN_SOURCE_INVALID'
  );
  await assert.rejects(() => readFile(resolve(stagingRoot, 'inputs/runner/runner-source-set.json')), /ENOENT/);

  await writeFile(resolve(sourceRoot, paths[7]), 'restored source\n');
  await stageRunnerSourceSet({ sourceRoot, stagingRoot });
  await writeFile(resolve(sourceRoot, paths[0]), 'changed after staging\n');
  await assert.rejects(
    () => verifyStagedRunnerSourceSet({ sourceRoot, stagingRoot }),
    error => error.code === 'E2E_RUN_SOURCE_INVALID'
  );
});

async function createRunnerSourceTree(sourceRoot) {
  const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json'), 'utf8'));
  const paths = schema.properties.entries.prefixItems.map(item => item.allOf[1].properties.path.const);
  for (const [index, path] of paths.entries()) {
    await mkdir(dirname(resolve(sourceRoot, path)), { recursive: true });
    await writeFile(resolve(sourceRoot, path), `source entry ${index}\n`);
  }
  return paths;
}
