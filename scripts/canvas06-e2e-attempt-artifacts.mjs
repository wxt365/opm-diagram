import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { fsyncPath } from './canvas06-e2e-manifest-v01-support.mjs';
import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';

const ARTIFACT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json', import.meta.url), 'utf8'));
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
const PROFILE_ASSET_KINDS = Object.freeze(['GRAMMAR_ASSET', 'NORMALIZATION_DATA', 'PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET']);
const TOKEN_KINDS = new Set(['ENTITY', 'STATE', 'RELATION_VERB', 'CONTROL_KEYWORD', 'LIST_SEPARATOR', 'PUNCTUATION', 'WHITESPACE', 'KEYWORD', 'PROCESS', 'OBJECT']);
const SOURCE_KINDS = new Set(['FACT', 'CAPABILITY', 'ENDPOINT', 'ELEMENT', 'FEATURE', 'STATE', 'MODIFIER', 'OCCURRENCE', 'TEMPLATE', 'GRAMMAR', 'RULE', 'LEGACY']);
const TOKEN_FIELDS = new Set(['token_id', 'sentence_id', 'ordinal', 'text', 'kind', 'start_utf8_byte', 'end_utf8_byte', 'source_refs']);
const SOURCE_FIELDS = new Set(['source_kind', 'stable_id', 'field_path', 'endpoint_ordinal', 'sentence_slot']);
const MAX_SAFE_INTEGER = 9007199254740991;

export class TokenDigestError extends Error {
  constructor(code, jsonPointer, message) {
    super(message);
    this.code = code;
    this.jsonPointer = jsonPointer;
  }
}

export function tokenDigestPreimage(revisionId, tokens) {
  const preimage = {
    schema_id: 'OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001',
    schema_version: '0.1',
    revision_id: requiredNfc(revisionId, '/revision_id'),
    tokens: []
  };
  if (!Array.isArray(tokens)) tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', '/tokens', 'tokens 必须是数组。');
  preimage.tokens = tokens.map((token, index) => tokenPreimage(token, `/tokens/${index}`));
  return preimage;
}

export function tokenDigestCanonicalBytes(revisionId, tokens) {
  return Buffer.from(canonicalizeJcs(tokenDigestPreimage(revisionId, tokens)), 'utf8');
}

export function tokenDigestSha256(revisionId, tokens) {
  return sha256(tokenDigestCanonicalBytes(revisionId, tokens));
}

export function createFaultPlan({ caseId, attemptOrdinal, nonce = randomBytes(32).toString('hex') }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!/^[a-f0-9]{64}$/.test(nonce)) fail('E2E_INPUT_INVALID', 'Fault Plan nonce must be a 256-bit lowercase hexadecimal value.');
  const [fault_kind, target, trigger_count] = faultMapping(caseId);
  const plan = {
    schema_id: FILES['fault-plan.json'].schemaId,
    schema_version: '0.2',
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

export function verifyFaultPlan({ caseId, attemptOrdinal, faultPlan }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  if (!validateArtifact(faultPlan)
      || faultPlan?.schema_id !== FILES['fault-plan.json'].schemaId
      || faultPlan?.schema_version !== '0.2'
      || faultPlan.case_id !== caseId
      || faultPlan.attempt_ordinal !== attemptOrdinal) {
    fail('E2E_INPUT_INVALID', 'Fault Plan does not satisfy its fixed Schema or scheduling identity.');
  }

  const expected = createFaultPlan({ caseId, attemptOrdinal, nonce: faultPlan.nonce });
  if (canonicalizeJcs(faultPlan) !== canonicalizeJcs(expected)) {
    fail('E2E_INPUT_INVALID', 'Fault Plan mapping or payload digest is invalid.');
  }
  return Object.freeze(expected);
}

export async function writeAttemptArtifact({ reportRoot, caseId, attemptOrdinal, filename, artifact }) {
  assertAttemptIdentity(caseId, attemptOrdinal);
  const specification = FILES[filename];
  if (!specification) fail('E2E_INPUT_INVALID', 'Attempt artifact filename is not frozen.');
  if (!artifact || artifact.schema_id !== specification.schemaId || artifact.schema_version !== '0.2'
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
    if (entry.kind !== 'PROFILE_ASSET_TREE') {
      const path = resolveInside(root, entry.path);
      const details = await assertRegularFile(path);
      references.push({
        kind: entry.kind,
        path: entry.path,
        media_type: entry.media_type,
        byte_length: details.size,
        sha256: sha256(await readFile(path)),
        capture_phase: entry.capture_phase,
        required: entry.required,
        ...(entry.kind === 'PROFILE_ASSET' ? { asset_kind: entry.asset_kind } : {})
      });
    }
  }

  const actualPaths = await listFiles(attemptRoot, '');
  const indexedPaths = new Set(references.map(entry => entry.path.slice(expectedPrefix.length)));
  if (actualPaths.some(path => path !== 'artifact-index.json' && !indexedPaths.has(path))) {
    fail('E2E_INPUT_INVALID', 'Attempt contains an artifact absent from Artifact Index.');
  }
  if (actualPaths.includes('artifact-index.json')) fail('E2E_INPUT_INVALID', 'Artifact Index cannot be overwritten.');

  const profileTreeEntries = entries.filter(entry => entry.kind === 'PROFILE_ASSET_TREE');
  const profileAssets = references.filter(entry => entry.kind === 'PROFILE_ASSET');
  const kinds = references.map(entry => entry.kind);
  if (entries.length !== 16 || profileTreeEntries.length !== 1 || !CORE_KINDS.every(kind => kinds.filter(value => value === kind).length === 1)
      || profileAssets.length !== PROFILE_ASSET_KINDS.length || !sameOrderedValues(profileAssets.map(entry => entry.asset_kind), PROFILE_ASSET_KINDS)) {
    fail('E2E_INPUT_INVALID', 'Artifact Index must contain the frozen 10+1+5 artifact set.');
  }
  const treeEntry = profileTreeEntries[0];
  if (treeEntry.path !== `${expectedPrefix}profile/assets` || treeEntry.media_type !== 'application/vnd.opm.profile-asset-tree+json'
      || treeEntry.capture_phase !== 'MATERIALIZE' || treeEntry.required !== true) {
    fail('E2E_INPUT_INVALID', 'Profile asset tree entry is invalid.');
  }
  await assertDirectory(resolveInside(root, treeEntry.path));
  const treeRefs = profileAssets.map(entry => ({ kind: entry.asset_kind, path: entry.path, byte_length: entry.byte_length, sha256: entry.sha256 }));
  const tree = {
    kind: 'PROFILE_ASSET_TREE', path: treeEntry.path, media_type: treeEntry.media_type,
    byte_length: treeRefs.reduce((total, entry) => total + entry.byte_length, 0),
    sha256: sha256Jcs({ schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: 'profile/assets', entries: treeRefs }),
    capture_phase: treeEntry.capture_phase, required: treeEntry.required
  };
  references.push(tree);
  references.sort(compareUtf8Path);
  const index = withPayloadDigest({
    schema_id: FILES['artifact-index.json'].schemaId,
    schema_version: '0.2',
    case_id: caseId,
    attempt_ordinal: attemptOrdinal,
    refs: references,
    tree_sha256: sha256Jcs(references)
  });
  return writeAttemptArtifact({ reportRoot: root, caseId, attemptOrdinal, filename: 'artifact-index.json', artifact: index });
}

function sameOrderedValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
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

function tokenPreimage(token, pointer) {
  exactTokenFields(token, TOKEN_FIELDS, pointer, TOKEN_FIELDS);
  const text = requiredNfc(token.text, `${pointer}/text`);
  const kind = requiredNfc(token.kind, `${pointer}/kind`);
  if (!TOKEN_KINDS.has(kind)) tokenFail('TOKEN_DIGEST_ENUM_INVALID', `${pointer}/kind`, 'Token kind 不受支持。');
  const start = safeTokenInteger(token.start_utf8_byte, `${pointer}/start_utf8_byte`);
  const end = safeTokenInteger(token.end_utf8_byte, `${pointer}/end_utf8_byte`);
  if (end <= start || end - start !== Buffer.byteLength(text, 'utf8')) {
    tokenFail('TOKEN_DIGEST_RANGE_INVALID', `${pointer}/end_utf8_byte`, 'Token UTF-8 byte range 未闭合。');
  }
  if (!Array.isArray(token.source_refs) || token.source_refs.length === 0) {
    tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', `${pointer}/source_refs`, 'source_refs 必须是非空数组。');
  }
  return {
    token_id: requiredNfc(token.token_id, `${pointer}/token_id`),
    sentence_id: requiredNfc(token.sentence_id, `${pointer}/sentence_id`),
    ordinal: safeTokenInteger(token.ordinal, `${pointer}/ordinal`),
    text,
    kind,
    start_utf8_byte: start,
    end_utf8_byte: end,
    source_refs: token.source_refs.map((source, index) => sourcePreimage(source, `${pointer}/source_refs/${index}`))
  };
}

function sourcePreimage(source, pointer) {
  exactTokenFields(source, SOURCE_FIELDS, pointer, new Set(['source_kind', 'stable_id']));
  const kind = requiredNfc(source.source_kind, `${pointer}/source_kind`);
  if (!SOURCE_KINDS.has(kind)) tokenFail('TOKEN_DIGEST_ENUM_INVALID', `${pointer}/source_kind`, 'Source kind 不受支持。');
  const result = { source_kind: kind, stable_id: requiredNfc(source.stable_id, `${pointer}/stable_id`) };
  for (const field of ['field_path', 'sentence_slot']) {
    if (Object.hasOwn(source, field)) result[field] = requiredNfc(source[field], `${pointer}/${field}`);
  }
  if (Object.hasOwn(source, 'endpoint_ordinal')) result.endpoint_ordinal = safeTokenInteger(source.endpoint_ordinal, `${pointer}/endpoint_ordinal`);
  return result;
}

function exactTokenFields(value, allowed, pointer, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.has(key))
      || [...required].some(key => !Object.hasOwn(value, key))) {
    tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', pointer, 'Token preimage 字段不符合契约。');
  }
}

function requiredNfc(value, pointer) {
  if (typeof value !== 'string' || value.length === 0) tokenFail('TOKEN_DIGEST_ARGUMENT_INVALID', pointer, '字符串字段不能为空。');
  if (value.normalize('NFC') !== value) tokenFail('TOKEN_DIGEST_UNICODE_INVALID', pointer, '字符串必须为 NFC。');
  return value;
}

function safeTokenInteger(value, pointer) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_INTEGER) {
    tokenFail('TOKEN_DIGEST_NUMBER_DOMAIN_INVALID', pointer, '字段必须是非负安全整数。');
  }
  return value;
}

function tokenFail(code, pointer, message) {
  throw new TokenDigestError(code, pointer, message);
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}
