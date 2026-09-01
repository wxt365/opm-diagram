import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, rename, rm, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { assembleVisualManifest, loadVisualManifestInputs, parseVisualManifestOptions, VisualManifestError } from './canvas06-visual-manifest-v02-input.mjs';
import { verifyApprovedVersion } from './release-canvas06-golden-publish.mjs';

const ROOT = resolve('.');
const schema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-visual-manifest-v02.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export async function buildVisualManifest(options) {
  await assertFreshDirectory(options.outputRoot);
  const inputs = await loadVisualManifestInputs(options, { verifyApprovedVersion });
  const identity = await runnerIdentity(options);
  const manifest = assembleVisualManifest({ inputs, runnerIdentity: identity });
  if (!validate(manifest)) throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', `Visual Manifest Schema is invalid: ${JSON.stringify(validate.errors)}`);
  await atomicDirectory(options.outputRoot, options.outPath, `${canonicalizeJcs(manifest)}\n`);
  return Object.freeze({ manifest, path: options.outPath });
}

async function runnerIdentity(options) {
  const source = await readFile(resolve(ROOT, 'scripts/release-canvas06-visual-manifest-v02.mjs'));
  const commit = inputsGit(options.sourceRoot, 'rev-parse', 'HEAD');
  return Object.freeze({ runner_version: '0.2.0', source_commit: commit, node_version: process.version, playwright_version: '1.57.0', chromium_version: '143.0.7499.4', os: `${process.platform}-${process.arch}`, command: '--input-mode <mode> --source-root <source-root> --runtime-jar <runtime-jar> --web-dist <web-dist> --approved-version-root <approved-version-root> --output-root <output-root> --out visual-manifest.json', runner_source_sha256: sha(source) });
}

function inputsGit(root, ...args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
  catch { throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Source root is not a readable Git checkout.'); }
}

async function assertFreshDirectory(path) {
  try { await lstat(path); }
  catch (error) { if (error?.code === 'ENOENT') return; throw new VisualManifestError('VISUAL_MANIFEST_IO_FAILED', error.message); }
  throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', 'Output root must be fresh.');
}

async function atomicDirectory(root, output, content) {
  const temporary = `${root}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(temporary, { recursive: false });
    const temporaryFile = resolve(temporary, 'visual-manifest.json');
    const handle = await open(temporaryFile, 'wx');
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    const directory = await open(temporary, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    await rename(temporary, root);
    const parent = await open(dirname(root), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (error instanceof VisualManifestError) throw error;
    throw new VisualManifestError('VISUAL_MANIFEST_IO_FAILED', error.message);
  }
  if (output !== resolve(root, 'visual-manifest.json')) throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', 'Output path differs from frozen layout.');
}

function sha(value) { return createHash('sha256').update(value).digest('hex'); }

async function cli() { await buildVisualManifest(parseVisualManifestOptions(process.argv.slice(2))); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => { const value = error instanceof VisualManifestError ? error : new VisualManifestError('VISUAL_MANIFEST_IO_FAILED', error.message); process.stderr.write(`${value.code}\n${value.message}\n`); process.exitCode = value.exitCode; });
}
