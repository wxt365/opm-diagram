import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { E2eRunInputError } from './canvas06-e2e-run-input.mjs';
import { assertDirectory, fileRef, resolveInside, sha256 } from './canvas06-e2e-manifest-v01-support.mjs';
import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

const RUNNER_SOURCE_SET_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json', import.meta.url), 'utf8'));
const sourceSetAjv = new Ajv2020({ allErrors: true, strict: false });
const validateRunnerSourceSet = sourceSetAjv.compile(RUNNER_SOURCE_SET_SCHEMA);
const runnerSourcePaths = Object.freeze(RUNNER_SOURCE_SET_SCHEMA.properties.entries.prefixItems.map(item => item.allOf?.[1]?.properties?.path?.const));
const excludedClasses = Object.freeze(RUNNER_SOURCE_SET_SCHEMA.properties.excluded_classes.prefixItems.map(item => item.const));

if (runnerSourcePaths.length !== 24 || runnerSourcePaths.some(path => typeof path !== 'string') || excludedClasses.length !== 11 || excludedClasses.some(value => typeof value !== 'string')) {
  throw new Error('E2E Runner Source Set Schema does not contain its frozen allowlist.');
}

export async function stageManifestInputs({ manifestRoot, stagingRoot, manifestName = 'dev-canvas-06-e2e-manifest.json' }) {
  const sourceRoot = resolve(manifestRoot);
  const destinationRoot = resolve(stagingRoot);
  await assertDirectory(sourceRoot, 'E2E_RUN_MANIFEST_INVALID');
  await assertDirectory(destinationRoot, 'E2E_RUN_OUTPUT_INVALID');
  const manifestSource = resolveInside(sourceRoot, manifestName, 'E2E_RUN_MANIFEST_INVALID');
  await assertRegularFile(manifestSource, 'E2E_RUN_MANIFEST_INVALID');
  const inputsSource = resolveInside(sourceRoot, 'inputs', 'E2E_RUN_MANIFEST_INVALID');
  await assertDirectory(inputsSource, 'E2E_RUN_MANIFEST_INVALID');
  const entries = await listSafeFiles(inputsSource);
  const manifestDestination = 'inputs/manifest/dev-canvas-06-e2e-manifest.json';
  await copyFile(manifestSource, destinationRoot, manifestDestination);
  for (const entry of entries) {
    const source = resolveInside(inputsSource, entry, 'E2E_RUN_MANIFEST_INVALID');
    await copyFile(source, destinationRoot, `inputs/${entry}`);
  }
  const manifestRef = await fileRef(resolveInside(destinationRoot, manifestDestination, 'E2E_RUN_OUTPUT_INVALID'), destinationRoot, 'E2E_MANIFEST', 'E2E_RUN_OUTPUT_INVALID');
  return Object.freeze({ manifestRef, copiedInputPaths: Object.freeze(entries) });
}

export async function stageRunnerSourceSet({ sourceRoot, stagingRoot }) {
  const source = resolve(sourceRoot);
  const destination = resolve(stagingRoot);
  await assertDirectory(source, 'E2E_RUN_SOURCE_INVALID');
  await assertDirectory(destination, 'E2E_RUN_OUTPUT_INVALID');

  const captured = [];
  for (const path of runnerSourcePaths) {
    const sourcePath = resolveInside(source, path, 'E2E_RUN_SOURCE_INVALID');
    await assertRegularFile(sourcePath, 'E2E_RUN_SOURCE_INVALID');
    const bytes = await readFile(sourcePath);
    captured.push(Object.freeze({ path, bytes, byte_length: bytes.length, sha256: sha256(bytes) }));
  }

  const entries = captured.map(({ path, byte_length, sha256 }) => ({ path, byte_length, sha256 }));
  const payload = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001',
    schema_version: '0.2',
    source_set_version: '0.2.0',
    selection_policy: 'EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED',
    entries,
    excluded_classes: [...excludedClasses]
  };
  const sourceSet = { ...payload, source_set_sha256: sha256Jcs(payload) };
  if (!validateRunnerSourceSet(sourceSet)) fail('E2E_RUN_SOURCE_INVALID', 'Runner Source Set does not satisfy the frozen Schema.');

  for (const item of captured) {
    await writeExactBytes({ destinationRoot: destination, destination: `inputs/runner/${item.path}`, bytes: item.bytes, code: 'E2E_RUN_OUTPUT_INVALID' });
  }
  await writeExactBytes({
    destinationRoot: destination,
    destination: 'inputs/runner/runner-source-set.json',
    bytes: Buffer.from(`${canonicalizeJcs(sourceSet)}\n`, 'utf8'),
    code: 'E2E_RUN_OUTPUT_INVALID'
  });
  return verifyStagedRunnerSourceSet({ sourceRoot: source, stagingRoot: destination });
}

export async function verifyStagedRunnerSourceSet({ sourceRoot, stagingRoot }) {
  const source = resolve(sourceRoot);
  const destination = resolve(stagingRoot);
  await assertDirectory(source, 'E2E_RUN_SOURCE_INVALID');
  await assertDirectory(destination, 'E2E_RUN_OUTPUT_INVALID');
  const descriptorPath = resolveInside(destination, 'inputs/runner/runner-source-set.json', 'E2E_RUN_OUTPUT_INVALID');
  await assertRegularFile(descriptorPath, 'E2E_RUN_OUTPUT_INVALID');
  let descriptor;
  try { descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')); } catch { fail('E2E_RUN_OUTPUT_INVALID', 'Runner Source Set must be valid JSON.'); }
  if (!validateRunnerSourceSet(descriptor)) fail('E2E_RUN_OUTPUT_INVALID', 'Runner Source Set does not satisfy the frozen Schema.');
  const { source_set_sha256, ...payload } = descriptor;
  if (source_set_sha256 !== sha256Jcs(payload)
      || descriptor.entries.length !== runnerSourcePaths.length
      || descriptor.entries.some((entry, index) => entry.path !== runnerSourcePaths[index])
      || descriptor.excluded_classes.length !== excludedClasses.length
      || descriptor.excluded_classes.some((value, index) => value !== excludedClasses[index])) {
    fail('E2E_RUN_OUTPUT_INVALID', 'Runner Source Set identity or ordering is invalid.');
  }

  for (const entry of descriptor.entries) {
    const sourcePath = resolveInside(source, entry.path, 'E2E_RUN_SOURCE_INVALID');
    const mirrorPath = resolveInside(destination, `inputs/runner/${entry.path}`, 'E2E_RUN_OUTPUT_INVALID');
    await assertRegularFile(sourcePath, 'E2E_RUN_SOURCE_INVALID');
    await assertRegularFile(mirrorPath, 'E2E_RUN_OUTPUT_INVALID');
    const [sourceBytes, mirrorBytes] = await Promise.all([readFile(sourcePath), readFile(mirrorPath)]);
    if (!sourceBytes.equals(mirrorBytes) || sourceBytes.length !== entry.byte_length || sha256(sourceBytes) !== entry.sha256) {
      fail('E2E_RUN_SOURCE_INVALID', 'Runner Source Set source or mirror bytes differ from the frozen entry.');
    }
  }
  return Object.freeze({
    sourceSet: Object.freeze(descriptor),
    sourceSetRef: await fileRef(descriptorPath, destination, 'RUNNER_SOURCE_SET', 'E2E_RUN_OUTPUT_INVALID')
  });
}

async function listSafeFiles(root) {
  const result = [];
  await visit(root, '');
  return result.sort((left, right) => left.localeCompare(right, 'en'));

  async function visit(directory, prefix) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = resolve(directory, child.name);
      const details = await lstat(absolutePath);
      if (details.isSymbolicLink() || !details.isDirectory() && !details.isFile()) {
        fail('E2E_RUN_MANIFEST_INVALID', 'Manifest inputs contain an unsafe filesystem entry.');
      }
      if (details.isDirectory()) await visit(absolutePath, path);
      else {
        if (details.nlink !== 1) fail('E2E_RUN_MANIFEST_INVALID', 'Manifest inputs contain a hard-linked file.');
        result.push(path);
      }
    }
  }
}

async function copyFile(source, destinationRoot, destination) {
  await assertRegularFile(source, 'E2E_RUN_MANIFEST_INVALID');
  const output = resolveInside(destinationRoot, destination, 'E2E_RUN_OUTPUT_INVALID');
  await mkdir(resolve(output, '..'), { recursive: true });
  const bytes = await readFile(source);
  await writeFile(output, bytes, { flag: 'wx' });
}

async function writeExactBytes({ destinationRoot, destination, bytes, code }) {
  const output = resolveInside(destinationRoot, destination, code);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, bytes, { flag: 'wx' });
}

async function assertRegularFile(path, code) {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a regular input file.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(code, 'Expected a non-linked regular input file.');
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 3);
}
