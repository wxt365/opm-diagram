import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { E2eRunInputError, safeRelativePath } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const CATALOG_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateCatalog = ajv.compile(CATALOG_SCHEMA);
const FACTORY_JCS_IMPORT = "import { sha256Jcs } from '../../../../../../scripts/canvas06-rfc8785.mjs';\n";

export async function verifyCommonFixtureInput({ commonRoot, catalogPath, activeBinding }) {
  const root = await assertDirectory(commonRoot);
  const catalogRelativePath = assertRelativePath(catalogPath, 'Common Fixture Catalog path');
  const catalogFile = await assertRegularFile(root, resolveInside(root, catalogRelativePath), 'Common Fixture Catalog');
  const catalog = await readJson(catalogFile.path, 'Common Fixture Catalog');
  if (!validateCatalog(catalog)) fail('Common Fixture Catalog does not satisfy Schema 0.1.');
  if (!isDeepStrictEqual(catalog.source_binding, activeBinding)) fail('Common Fixture Catalog binding differs from the active binding.');

  const cases = catalog.e2e_cases;
  if (catalog.summary.e2e_case_count !== 16 || cases.length !== 16 || new Set(cases.map(item => item.case_id)).size !== 16) {
    fail('Common Fixture Catalog must contain the frozen sixteen unique E2E cases.');
  }

  const factoryReference = cases[0]?.factory_source_ref;
  if (!factoryReference || cases.some(item => !isDeepStrictEqual(item.factory_source_ref, factoryReference))) {
    fail('Common Fixture Catalog must use one exact Factory source reference.');
  }
  const factoryFile = await verifyRawReference(root, factoryReference, 'FACTORY_SOURCE');
  const factory = await loadFactory(factoryFile.path);
  if (!Array.isArray(factory.e2eCases) || typeof factory.e2eFixture !== 'function') {
    fail('Common Fixture Factory must export e2eCases and e2eFixture(caseId).');
  }
  if (!isDeepStrictEqual(factory.e2eCases, cases.map(item => item.case_id))) {
    fail('Common Fixture Factory case order differs from the Catalog.');
  }

  const verifiedCases = [];
  for (const item of cases) {
    const baseFile = await verifyRawReference(root, item.base_fixture_ref, 'FIXTURE');
    const inputFile = await verifyRawReference(root, item.input_ref, 'INPUT');
    const output = factory.e2eFixture(item.case_id);
    if (!isPlainObject(output) || output.case_id !== item.case_id) fail('Common Fixture Factory output has an invalid case identity.');

    const base = await readJson(baseFile.path, `Common base fixture for ${item.case_id}`);
    const input = await readJson(inputFile.path, `Common input fixture for ${item.case_id}`);
    assertJcsEqual({ ...output, fixture_kind: 'BASE' }, base, `${item.case_id} BASE`);
    assertJcsEqual({ ...output, fixture_kind: 'INPUT' }, input, `${item.case_id} INPUT`);
    verifiedCases.push(Object.freeze({
      case_id: item.case_id,
      factory_id: item.factory_id,
      base_fixture_ref: item.base_fixture_ref,
      input_ref: item.input_ref,
      base,
      input
    }));
  }

  return Object.freeze({ catalog, cases: Object.freeze(verifiedCases) });
}

async function loadFactory(path) {
  try {
    const source = await readFile(path, 'utf8');
    if (!source.startsWith(FACTORY_JCS_IMPORT)) fail('Common Fixture Factory has an unsupported dependency declaration.');

    // E2E 导出不会调用仅用于 Visual 的 JCS helper；43 文件根不包含该 helper，
    // 因此只在已校验的镜像内闭合执行，禁止回读 checkout。
    const executable = `const sha256Jcs = () => { throw new TypeError('Visual-only helper must not run during E2E fixture verification.'); };\n${source.slice(FACTORY_JCS_IMPORT.length)}`;
    return await import(`data:text/javascript;base64,${Buffer.from(executable, 'utf8').toString('base64')}`);
  } catch (error) {
    if (error instanceof E2eRunInputError) throw error;
    throw new E2eRunInputError('E2E_INPUT_INVALID', `Cannot load Common Fixture Factory: ${error?.message ?? 'unknown error'}`, 2);
  }
}

async function verifyRawReference(root, reference, expectedKind) {
  if (!reference || reference.kind !== expectedKind || !safeRelativePath(reference.path)
      || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 0
      || !/^[a-f0-9]{64}$/.test(reference.sha256)) {
    fail(`Common Fixture ${expectedKind} reference is invalid.`);
  }
  const file = await assertRegularFile(root, resolveInside(root, reference.path), `Common Fixture ${expectedKind}`);
  const bytes = await readFile(file.path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
    fail(`Common Fixture ${expectedKind} raw reference does not match its file.`);
  }
  return file;
}

async function assertDirectory(path) {
  let details;
  try { details = await lstat(path); } catch { fail('Common Fixture root is missing.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('Common Fixture root must be a non-symlink directory.');
  return resolve(path);
}

async function assertRegularFile(root, path, name) {
  await assertSafePath(root, path, name);
  let details;
  try { details = await lstat(path); } catch { fail(`${name} is missing.`); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(`${name} must be a single-link regular file.`);
  return { path, size: details.size };
}

async function assertSafePath(root, path, name) {
  const relation = relative(root, path);
  let current = root;
  for (const segment of relation.split(sep)) {
    current = resolve(current, segment);
    let details;
    try { details = await lstat(current); } catch { fail(`${name} is missing.`); }
    if (details.isSymbolicLink()) fail(`${name} path contains a symbolic link.`);
  }
}

async function readJson(path, name) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail(`${name} must be valid JSON.`); }
}

function assertJcsEqual(actual, expected, name) {
  if (!isPlainObject(expected)) fail(`${name} fixture must be a JSON object.`);
  try {
    if (canonicalizeJcs(actual) !== canonicalizeJcs(expected)) fail(`${name} fixture differs from Factory output.`);
  } catch (error) {
    if (error instanceof E2eRunInputError) throw error;
    throw new E2eRunInputError('E2E_INPUT_INVALID', `${name} fixture cannot be JCS canonicalized.`, 2);
  }
}

function assertRelativePath(value, name) {
  if (!safeRelativePath(value)) fail(`${name} is invalid.`);
  return value;
}

function resolveInside(root, value) {
  const path = resolve(root, value);
  const relation = relative(root, path);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) fail('Common Fixture path escapes its root.');
  return path;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new E2eRunInputError('E2E_INPUT_INVALID', message, 2);
}
