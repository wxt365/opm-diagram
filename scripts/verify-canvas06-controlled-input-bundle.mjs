import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const schemaPath = new URL('../docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json', import.meta.url);
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

export class ControlledInputBundleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ControlledInputBundleError';
    this.code = 'CANVAS06_CONTROLLED_INPUT_INVALID';
    this.exitCode = 2;
  }
}

export async function verifyControlledInputBundle({ bundleRoot, consumer }) {
  if (!['VISUAL', 'E2E'].includes(consumer)) fail('Consumer must be VISUAL or E2E.');
  const root = resolve(bundleRoot);
  await assertDirectory(root, 'Controlled bundle root');
  const rootId = basename(root);
  if (!/^canvas06-controlled-[a-f0-9]{64}$/.test(rootId)) fail('Controlled bundle root has an invalid ID.');

  const descriptorPath = resolveInside(root, 'controlled-bundle.json');
  await assertRegularFile(descriptorPath, 'Controlled descriptor');
  const descriptor = await parseDescriptor(descriptorPath);
  if (!validate(descriptor)) fail(`Controlled descriptor schema validation failed: ${JSON.stringify(validate.errors)}`);

  const identity = shaText(jcs(identityPayload(descriptor)));
  if (descriptor.bundle_identity_sha256 !== identity || descriptor.bundle_id !== `canvas06-controlled-${identity}` || rootId !== descriptor.bundle_id) {
    fail('Controlled bundle basename, ID, and identity digest must be exact.');
  }

  const references = {
    handoff_ref: await verifyRawRef(root, descriptor.handoff_ref, 'Handoff'),
    intake_report_ref: await verifyRawRef(root, descriptor.intake_report_ref, 'Intake report'),
    evidence_bundle_ref: await verifyRawRef(root, descriptor.evidence_bundle_ref, 'Evidence bundle')
  };

  if (consumer === 'E2E') {
    if (descriptor.approved_version_ref !== null) fail('E2E controlled bundle requires approved_version_ref=null.');
    return { root, descriptor, references };
  }

  const approved = descriptor.approved_version_ref;
  if (approved === null) fail('Visual controlled bundle requires an approved_version_ref object.');
  const approvedRoot = resolveInside(root, approved.path);
  await assertDirectory(approvedRoot, 'Approved version root');
  if (basename(approvedRoot) !== approved.golden_set_version) fail('Approved version root basename must equal golden_set_version.');
  if (approved.authoring_report_ref.path !== `${approved.path}/authoring-report.json`) fail('Authoring Report path must be inside the exact approved version root.');

  return {
    root,
    descriptor,
    references,
    approved_version: {
      root: approvedRoot,
      ref: await verifyRawRef(root, approved.authoring_report_ref, 'Golden Authoring Report')
    }
  };
}

async function parseDescriptor(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail('Controlled descriptor must contain valid JSON.');
  }
}

async function verifyRawRef(root, reference, label) {
  const path = resolveInside(root, reference.path);
  await assertRegularFile(path, `${label} ref`);
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha(bytes) !== reference.sha256) fail(`${label} ref does not match raw bytes.`);
  return { ...reference, absolute_path: path };
}

async function assertDirectory(path, label) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    fail(`${label} is missing.`);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-symlink directory.`);
}

async function assertRegularFile(path, label) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    fail(`${label} is missing.`);
  }
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a non-symlink regular file.`);
}

function identityPayload(descriptor) {
  return {
    bundle_class: descriptor.bundle_class,
    handoff_ref: descriptor.handoff_ref,
    intake_report_ref: descriptor.intake_report_ref,
    evidence_bundle_ref: descriptor.evidence_bundle_ref,
    approved_version_ref: descriptor.approved_version_ref
  };
}

function resolveInside(root, path) {
  if (!isSafeRelativePath(path)) fail(`Path must remain inside the controlled bundle root: ${path}`);
  const resolved = resolve(root, path);
  if (!resolved.startsWith(`${root}/`)) fail(`Path escapes the controlled bundle root: ${path}`);
  return resolved;
}

function isSafeRelativePath(path) {
  return typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') && path.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('JCS number is invalid.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  fail('JCS value is invalid.');
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shaText(value) {
  return sha(Buffer.from(value, 'utf8'));
}

function fail(message) {
  throw new ControlledInputBundleError(message);
}
