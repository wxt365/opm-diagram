import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { fsyncPath } from './canvas06-e2e-manifest-v01-support.mjs';
import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

const ARTIFACT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateArtifact = ajv.compile(ARTIFACT_SCHEMA);

const FILES = Object.freeze({
  'fault-plan.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001', kind: 'FAULT_PLAN' }),
  'fixture-materialization.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001', kind: 'FIXTURE_MATERIALIZATION' }),
  'attempt-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001', kind: 'ATTEMPT_OBSERVATION' }),
  'runtime-process.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001', kind: 'RUNTIME_PROCESS' }),
  'browser-environment.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-001', kind: 'BROWSER_ENVIRONMENT' }),
  'network-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-NETWORK-OBSERVATION-001', kind: 'NETWORK_OBSERVATION' }),
  'console-errors.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-CONSOLE-ERRORS-001', kind: 'CONSOLE_ERRORS' }),
  'transaction-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-TRANSACTION-OBSERVATION-001', kind: 'TRANSACTION_OBSERVATION' }),
  'reopen-observation.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-REOPEN-OBSERVATION-001', kind: 'REOPEN_OBSERVATION' }),
  'api-exchanges/index.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001', kind: 'API_EXCHANGE_INDEX' }),
  'artifact-index.json': Object.freeze({ schemaId: 'OPM-DEV-CANVAS-06-E2E-ARTIFACT-INDEX-001', kind: 'ARTIFACT_INDEX' })
});

const CORE_KINDS = Object.freeze(Object.values(FILES).filter(item => item.kind !== 'ARTIFACT_INDEX').map(item => item.kind));

export function createFaultPlan({ caseId, attemptOrdinal, nonce = randomBytes(32).toString('hex') }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!/^[a-f0-9]{64}$/.test(nonce)) fail('E2E_INPUT_INVALID', 'Fault Plan nonce must be a 256-bit lowercase hexadecimal value.');
  const [fault_kind, target, trigger_count] = faultMapping(caseId);
  const plan = {
    schema_id: FILES['fault-plan.json'].schemaId,
    schema_version: '0.1',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    fault_kind,
    target,
    trigger_count,
    nonce
  };
  plan.plan_sha256 = sha256Jcs({ case_id: caseId, attempt_ordinal: attemptOrdinal, fault_kind, target, trigger_count, nonce });
  return withPayloadDigest(plan);
}

export async function writeFaultPlan({ reportRoot, caseId, attemptOrdinal, nonce }) {
  return writeAttemptArtifact({
    reportRoot,
    caseId,
    attemptOrdinal,
    filename: 'fault-plan.json',
    artifact: createFaultPlan({ caseId, attemptOrdinal, nonce })
  });
}

export async function writeAttemptArtifact({ reportRoot, caseId, attemptOrdinal, filename, artifact }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const specification = FILES[filename];
  if (!specification) fail('E2E_INPUT_INVALID', 'Attempt artifact filename is not frozen.');
  if (!artifact || artifact.schema_id !== specification.schemaId || artifact.schema_version !== '0.1'
      || artifact.case_id !== caseId || artifact.attempt_ordinal !== attemptOrdinal) {
    fail('E2E_INPUT_INVALID', 'Attempt artifact identity differs from its fixed filename or scheduler identity.');
  }
  const output = withPayloadDigest(artifact);
  if (!validateArtifact(output)) fail('E2E_INPUT_INVALID', `Attempt artifact does not satisfy the frozen Schema: ${JSON.stringify(validateArtifact.errors)}.`);

  const root = await assertDirectory(reportRoot);
  const attemptDirectory = await ensureAttemptDirectory(root, caseId, attemptOrdinal);
  await ensureArtifactParent(attemptDirectory, filename);
  const outputPath = resolve(attemptDirectory, filename);
  await assertFresh(outputPath);
  await atomicWrite(outputPath, `${canonicalizeJcs(output)}\n`);
  return rawRef(root, outputPath, specification.kind);
}

export async function writeArtifactIndex({ reportRoot, caseId, attemptOrdinal, entries }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!Array.isArray(entries)) fail('E2E_INPUT_INVALID', 'Artifact Index entries must be an array.');
  const root = await assertDirectory(reportRoot);
  const attemptRoot = await ensureAttemptDirectory(root, caseId, attemptOrdinal);
  const expectedPrefix = `${attemptRelativeRoot(caseId, attemptOrdinal)}/`;
  const references = [];
  const paths = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry.kind !== 'string' || typeof entry.media_type !== 'string'
        || typeof entry.capture_phase !== 'string' || typeof entry.required !== 'boolean'
        || !safeRelativePath(entry.path) || !entry.path.startsWith(expectedPrefix)
        || entry.path === `${expectedPrefix}artifact-index.json` || paths.has(entry.path)) {
      fail('E2E_INPUT_INVALID', 'Artifact Index entry is not bound to the current attempt.');
    }
    paths.add(entry.path);
    const path = resolveInside(root, entry.path);
    const details = await assertRegularFile(path);
    references.push({
      kind: entry.kind,
      path: entry.path,
      media_type: entry.media_type,
      byte_length: details.size,
      sha256: sha256(await readFile(path)),
      capture_phase: entry.capture_phase,
      required: entry.required
    });
  }

  const actualPaths = await listFiles(attemptRoot, '');
  const indexedPaths = new Set(references.map(entry => entry.path.slice(expectedPrefix.length)));
  if (actualPaths.some(path => path !== 'artifact-index.json' && !indexedPaths.has(path))) {
    fail('E2E_INPUT_INVALID', 'Attempt contains an artifact absent from Artifact Index.');
  }
  if (actualPaths.includes('artifact-index.json')) fail('E2E_INPUT_INVALID', 'Artifact Index cannot be overwritten.');

  const kinds = references.map(entry => entry.kind);
  if (new Set(kinds).size !== kinds.length || !CORE_KINDS.every(kind => kinds.filter(value => value === kind).length === 1)) {
    fail('E2E_INPUT_INVALID', 'Artifact Index must contain each frozen core kind exactly once.');
  }
  references.sort(compareUtf8Path);
  const index = withPayloadDigest({
    schema_id: FILES['artifact-index.json'].schemaId,
    schema_version: '0.1',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    refs: references,
    tree_sha256: sha256Jcs(references)
  });
  return writeAttemptArtifact({ reportRoot: root, caseId, attemptOrdinal, filename: 'artifact-index.json', artifact: index });
}

function withPayloadDigest(artifact) {
  const payload = { ...artifact };
  delete payload.artifact_payload_sha256;
  return Object.freeze({ ...payload, artifact_payload_sha256: sha256Jcs(payload) });
}

function faultMapping(caseId) {
  if (caseId === 'E2E-CANVAS-007.ASSET_MISSING') return ['ASSET_MISSING', 'SYMBOL_CATALOG_ASSET', 1];
  if (caseId === 'E2E-CANVAS-007.PERSISTENCE_FAILED') return ['PERSISTENCE_FAILED', 'SQLITE_BEFORE_REVISION_INSERT', 1];
  if (caseId === 'E2E-CANVAS-007.READONLY') return ['READONLY', 'PROJECT_STORAGE_READ_ONLY', 1];
  return ['NONE', 'NONE', 0];
}

function assertAttemptIdentity(caseId, attemptOrdinal) {
  if (typeof caseId !== 'string' || !/^E2E-CANVAS-00[1-7]\..+$/.test(caseId) || ![1, 2].includes(attemptOrdinal)) {
    fail('E2E_INPUT_INVALID', 'Attempt case_id or attempt_ordinal is invalid.');
  }
}

function attemptRelativeRoot(caseId, attemptOrdinal) {
  return `attempts/${encodeCaseId(caseId)}/${attemptOrdinal}`;
}

async function ensureAttemptDirectory(root, caseId, attemptOrdinal) {
  const segments = attemptRelativeRoot(caseId, attemptOrdinal).split('/');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Attempt path contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false });
    }
  }
  return current;
}

async function ensureArtifactParent(attemptDirectory, filename) {
  let current = attemptDirectory;
  for (const segment of filename.split('/').slice(0, -1)) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Artifact parent contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false });
    }
  }
}

async function atomicWrite(path, text) {
  const temporary = `${path}.tmp-${randomBytes(16).toString('hex')}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await fsyncPath(resolve(path, '..'));
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throwWrite(error);
  }
}

function throwWrite(error) {
  if (error instanceof E2eRunInputError) throw error;
  throw new E2eRunInputError('E2E_UNEXPECTED_RUNTIME_ERROR', error?.message ?? 'Cannot atomically write attempt artifact.', 4);
}

async function assertDirectory(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Report staging root is missing.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_INPUT_INVALID', 'Report staging root must be a non-symlink directory.');
  return resolve(path);
}

async function assertFresh(path) {
  try {
    await lstat(path);
    fail('E2E_INPUT_INVALID', 'Attempt artifact path already exists.');
  } catch (error) {
    if (error instanceof E2eRunInputError) throw error;
  }
}

async function assertRegularFile(path) {
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Artifact Index references a missing file.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail('E2E_INPUT_INVALID', 'Artifact Index requires a single-link regular file.');
  return details;
}

async function listFiles(directory, prefix) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink() || !details.isFile() && !details.isDirectory() || details.isFile() && details.nlink !== 1) {
      fail('E2E_INPUT_INVALID', 'Attempt artifact tree contains an unsafe entry.');
    }
    if (details.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else files.push(relativePath);
  }
  return files.sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')));
}

function rawRef(root, path, kind) {
  return readFile(path).then(bytes => Object.freeze({
    kind,
    path: relative(root, path).split(sep).join('/'),
    byte_length: bytes.length,
    sha256: sha256(bytes)
  }));
}

function resolveInside(root, value) {
  const path = resolve(root, value);
  const relation = relative(root, path);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    fail('E2E_INPUT_INVALID', 'Artifact path escapes report root.');
  }
  return path;
}

function compareUtf8Path(left, right) {
  return Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'));
}

function encodeCaseId(value) {
  return Array.from(Buffer.from(value, 'utf8')).map(byte => /[A-Za-z0-9._-]/.test(String.fromCharCode(byte))
    ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}
