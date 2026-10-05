import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';

const schema = JSON.parse(readFileSync(new URL('../docs/contracts/schemas/opm-save-content-v1.schema.json', import.meta.url)));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const validateDocument = ajv.getSchema(`${schema.$id}#/$defs/Document`);
const validatePreimage = ajv.getSchema(`${schema.$id}#/$defs/Preimage`);
const contentKeys = new Set(Object.keys(schema.$defs.Content.properties));
const geometry = /^\/layouts\/[0-9]+\/(?:x|y|width|height|route_points\/[0-9]+\/(?:x|y))$/;
const ptr = (base, key) => `${base}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

export class SaveContentV1Error extends Error {
  constructor(code, jsonPointer) { super(`${code}: ${jsonPointer}`); this.code = code; this.jsonPointer = jsonPointer; }
}
function fail(code, pointer) { throw new SaveContentV1Error(`SAVE_CONTENT_${code}`, pointer); }

function scan(value, pointer = '', ancestors = new Set()) {
  if (typeof value === 'string') {
    if (!value.isWellFormed()) fail('UNICODE_INVALID', pointer);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NON_FINITE_FLOAT', pointer);
    if (!geometry.test(pointer) && !Number.isSafeInteger(value)) fail('NUMBER_DOMAIN_INVALID', pointer);
  } else if (value !== null && typeof value === 'object') {
    if (ancestors.has(value)) fail('INPUT_INVALID', pointer);
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INPUT_INVALID', pointer);
    ancestors.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) scan(value[index], ptr(pointer, index), ancestors);
    } else for (const key of Object.keys(value).sort()) {
      if (!key.isWellFormed()) fail('UNICODE_INVALID', ptr(pointer, key));
      scan(value[key], ptr(pointer, key), ancestors);
    }
    ancestors.delete(value);
  } else if (value !== null && typeof value !== 'boolean') fail('INPUT_INVALID', pointer);
}

// AJV 负责 Schema 语义；错误定位使用契约规定的结构顺序，避免依赖 AJV 的错误排列。
function firstSchemaError(value, rule, pointer = '') {
  if (rule.$ref) return firstSchemaError(value, schema.$defs[rule.$ref.split('/').at(-1)], pointer);
  if (rule.const !== undefined && value !== rule.const) return pointer;
  if (rule.enum && !rule.enum.includes(value)) return pointer;
  const type = rule.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return pointer;
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) return ptr(pointer, key);
    for (const key of Object.keys(value).sort()) {
      if (!Object.hasOwn(rule.properties, key)) return ptr(pointer, key);
      const error = firstSchemaError(value[key], rule.properties[key], ptr(pointer, key));
      if (error !== null) return error;
    }
  } else if (type === 'array') {
    if (!Array.isArray(value) || value.length < (rule.minItems ?? 0)) return pointer;
    for (let index = 0; index < value.length; index++) {
      const error = firstSchemaError(value[index], rule.items, ptr(pointer, index));
      if (error !== null) return error;
    }
    if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return pointer;
  } else if (type === 'string') {
    if (typeof value !== 'string' || [...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? Infinity)
      || (rule.pattern && !new RegExp(rule.pattern, 'u').test(value))) return pointer;
  } else if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || (type === 'integer' && !Number.isSafeInteger(value))
      || value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity)
      || (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum)) return pointer;
  }
  return null;
}

function validate(document) {
  scan(document);
  if (!validateDocument(document)) fail('INPUT_INVALID', firstSchemaError(document, schema.$defs.Document) ?? '');
  if (document.model_id !== document.model_header.model_id) fail('INPUT_INVALID', '/model_header/model_id');
}

export function splitRevisionV1(document) {
  validate(document);
  const content = {}, metadata = {};
  for (const key of Object.keys(document)) (contentKeys.has(key) ? content : metadata)[key] = structuredClone(document[key]);
  return { content, metadata };
}

export function joinRevisionV1(parts) {
  if (!parts || Object.keys(parts).sort().join(',') !== 'content,metadata') fail('INPUT_INVALID', '');
  for (const name of ['content', 'metadata']) {
    const value = parts[name];
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INPUT_INVALID', `/${name}`);
    for (const key of Object.keys(value)) if (contentKeys.has(key) !== (name === 'content')) fail('INPUT_INVALID', ptr(`/${name}`, key));
  }
  const document = { ...parts.content, ...parts.metadata };
  validate(document);
  return structuredClone(document);
}

export function buildSaveContentPreimageV1(document) {
  const { content } = splitRevisionV1(document);
  for (const layout of content.layouts) {
    for (const key of ['x', 'y', 'width', 'height']) layout[key] = { $binary64: binary64Hex(layout[key]) };
    for (const point of layout.route_points ?? []) for (const key of ['x', 'y']) point[key] = { $binary64: binary64Hex(point[key]) };
  }
  const result = { schema_id: 'OPM-SAVE-CONTENT-DIGEST', schema_version: '1', float_encoding: 'IEEE754_BINARY64_BE_HEX', content };
  if (!validatePreimage(result)) fail('CANONICALIZATION_FAILED', '');
  return result;
}

export function canonicalBytesSaveContentV1(document) {
  const preimage = buildSaveContentPreimageV1(document);
  try { return Buffer.from(canonicalizeJcs(preimage), 'utf8'); }
  catch { fail('CANONICALIZATION_FAILED', ''); }
}
export function sha256SaveContentV1(document) {
  return createHash('sha256').update(canonicalBytesSaveContentV1(document)).digest('hex');
}
