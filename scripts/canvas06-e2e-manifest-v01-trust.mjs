import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';
import { verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';

const schemas = await Promise.all(['opm-dev-canvas-06-intake-report.schema.json', 'opm-dev-canvas-05-handoff.schema.json'].map(async name => JSON.parse(await readFile(new URL(`../docs/contracts/schemas/${name}`, import.meta.url), 'utf8'))));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const [validateIntake, validateHandoff] = schemas.map(schema => ajv.compile(schema));

export async function loadReadyTrustChain({ root, intakePath, handoffPath }) {
  const base = resolve(root);
  const intake = await readJsonRef(base, intakePath, 'INTAKE_REPORT');
  const handoff = await readJsonRef(base, handoffPath, 'HANDOFF');
  if (!validateIntake(intake.value) || intake.value.intake_status !== 'READY_FOR_RELEASE_VALIDATION') fail('E2E_MANIFEST_INTAKE_INVALID', 'READY Intake Report is required.');
  if (!validateHandoff(handoff.value) || handoff.value.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoff.value.blockers.length !== 0) fail('E2E_MANIFEST_INTAKE_INVALID', 'READY Handoff is required.');
  if (!sameRef(intake.value.handoff_ref, handoff.ref)) fail('E2E_MANIFEST_HANDOFF_MISMATCH', 'Intake handoff ref differs from supplied Handoff bytes.');
  return { intake, handoff };
}

export async function loadControlledReadyTrustChain({ bundleRoot }) {
  let bundle;
  try {
    bundle = await verifyControlledInputBundle({ bundleRoot, consumer: 'E2E' });
  } catch (error) {
    fail('E2E_MANIFEST_CONTROLLED_BUNDLE_INVALID', error.message);
  }
  const intakePath = bundle.descriptor.intake_report_ref.path;
  const handoffPath = bundle.descriptor.handoff_ref.path;
  return { bundle, ...(await loadReadyTrustChain({ root: bundle.root, intakePath, handoffPath })) };
}

export async function readJsonRef(root, path, kind) {
  const file = resolveInside(root, path);
  await assertRegularFile(file);
  const bytes = await readFile(file);
  let value;
  try { value = JSON.parse(bytes); } catch { fail('E2E_MANIFEST_INPUT_REF_MISMATCH', `${kind} is not valid JSON.`); }
  return { value, ref: { kind, path: relative(resolve(root), file), byte_length: bytes.length, sha256: sha(bytes) } };
}

function sameRef(left, right) { return left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function resolveInside(root, path) { const output = resolve(root, path); const rel = relative(root, output); if (!path || path.startsWith('/') || path.includes('\\') || !rel || rel === '..' || rel.startsWith(`..${sep}`)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Input ref escapes root.'); return output; }
async function assertRegularFile(path) { try { const info = await lstat(path); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error(); } catch { fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Input ref must be a non-linked regular file.'); } }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { throw new E2eManifestInputError(code, message); }
