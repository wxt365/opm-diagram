import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { assembleVisualManifest, loadVisualManifestInputs, parseVisualManifestOptions, VisualManifestError } from './canvas06-visual-manifest-v02-input.mjs';
import { verifyApprovedVersion } from './release-canvas06-golden-publish.mjs';

const schema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-visual-manifest-v02.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export async function verifyVisualManifest(options) {
  const info = await lstat(options.outputRoot).catch(() => { throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Visual Manifest output root is missing.'); });
  if (!info.isDirectory() || info.isSymbolicLink()) throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', 'Visual Manifest output root is invalid.');
  const actual = JSON.parse(await readFile(options.outPath, 'utf8'));
  if (!validate(actual)) throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', `Visual Manifest Schema is invalid: ${JSON.stringify(validate.errors)}`);
  if (options.requireProduction && options.inputMode !== 'PRODUCTION_HANDOFF') throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', 'Production verification requires production input mode.');
  const inputs = await loadVisualManifestInputs(options, { verifyApprovedVersion });
  await verifyRunnerIdentity(actual.generator_identity, options.sourceRoot);
  const expected = assembleVisualManifest({ inputs, runnerIdentity: actual.generator_identity });
  if (canonicalizeJcs(actual) !== canonicalizeJcs(expected)) throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Visual Manifest does not exactly match approved inputs.');
  return Object.freeze({ path: options.outPath, sha256: createHash('sha256').update(await readFile(options.outPath)).digest('hex') });
}

async function verifyRunnerIdentity(identity, sourceRoot) {
  if (identity?.runner_version !== '0.2.0') throw new VisualManifestError('VISUAL_MANIFEST_INPUT_INVALID', 'Visual Manifest runner version is invalid.');
  const source = await readFile(new URL('./release-canvas06-visual-manifest-v02.mjs', import.meta.url));
  const sha = createHash('sha256').update(source).digest('hex');
  if (identity.runner_source_sha256 !== sha) throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Visual Manifest runner source differs.');
  const { execFileSync } = await import('node:child_process');
  let commit;
  try { commit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Source root is not a Git checkout.'); }
  if (identity.source_commit !== commit || identity.node_version !== process.version || identity.os !== `${process.platform}-${process.arch}`) throw new VisualManifestError('VISUAL_GOLDEN_AUTHORING_MISSING', 'Visual Manifest runner identity differs.');
}

async function cli() { await verifyVisualManifest(parseVisualManifestOptions(process.argv.slice(2), { verifier: true })); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().then(value => process.stdout.write(`${value.path}\t${value.sha256}\n`)).catch(error => { const value = error instanceof VisualManifestError ? error : new VisualManifestError('VISUAL_MANIFEST_IO_FAILED', error.message); process.stderr.write(`${value.code}\n${value.message}\n`); process.exitCode = value.exitCode; });
}
