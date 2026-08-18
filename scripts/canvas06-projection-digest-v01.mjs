import { createHash } from 'node:crypto';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const SAFE_INTEGER_MIN = -9007199254740991;
const SAFE_INTEGER_MAX = 9007199254740991;
const LAYOUT_FLOAT_FIELDS = ['x', 'y', 'width', 'height'];
const CONSTRUCT_REQUIRED = ['occurrence_id', 'target_id', 'construct_role', 'label', 'layout'];
const CONSTRUCT_OPTIONAL = [
  'source_id', 'process_id', 'source_occurrence_id', 'target_occurrence_id', 'symbol_ref', 'layout_ref',
  'owner_id', 'owner_target_kind', 'state_roles', 'explicitness', 'fold_state', 'capability_id', 'direction',
  'endpoints', 'modifiers', 'labels', 'collection_completeness'
];

export class ProjectionDigestV01Error extends Error {
  constructor(code, jsonPointer, message) {
    super(message);
    this.name = 'ProjectionDigestV01Error';
    this.code = code;
    this.jsonPointer = jsonPointer;
  }
}

export function buildProjectionDigestPreimageV01(projectionData) {
  const violations = [];
  const data = normalizeProjectionData(projectionData, '/data', violations);
  throwFirst(violations);
  return {
    schema_id: 'OPM-DEV-CANVAS-06-PROJECTION-DIGEST-PREIMAGE-001',
    schema_version: '0.1',
    source_projection_contract: 'API-CTX-002/0.2.0-draft',
    float_encoding: 'IEEE754_BINARY64_BE_HEX',
    data
  };
}

export function sha256ProjectionV01(projectionData) {
  const preimage = buildProjectionDigestPreimageV01(projectionData);
  let canonical;
  try {
    canonical = canonicalizeJcs(preimage);
  } catch (error) {
    throw new ProjectionDigestV01Error('PROJECTION_DIGEST_CANONICALIZATION_FAILED', '/', 'Projection Digest preimage was rejected by the shared JCS owner.');
  }
  try {
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  } catch (error) {
    throw new ProjectionDigestV01Error('PROJECTION_DIGEST_HASH_FAILED', '/', 'Projection Digest SHA-256 is unavailable.');
  }
}

export function canonicalBytesProjectionV01(projectionData) {
  const preimage = buildProjectionDigestPreimageV01(projectionData);
  try {
    return Buffer.from(canonicalizeJcs(preimage), 'utf8');
  } catch (error) {
    throw new ProjectionDigestV01Error('PROJECTION_DIGEST_CANONICALIZATION_FAILED', '/', 'Projection Digest preimage was rejected by the shared JCS owner.');
  }
}

function normalizeProjectionData(value, pointer, violations) {
  const source = object(value, pointer, ['context_id', 'constructs'], ['context_id', 'constructs'], violations);
  if (!source) return {};
  const normalized = {};
  const contextId = string(source, 'context_id', pointer, true, violations);
  if (contextId !== undefined) normalized.context_id = contextId;
  const constructs = array(source, 'constructs', pointer, violations);
  if (constructs) normalized.constructs = constructs.map((item, index) => normalizeConstruct(item, `${pointer}/constructs/${index}`, violations));
  return normalized;
}

function normalizeConstruct(value, pointer, violations) {
  const source = object(value, pointer, [...CONSTRUCT_REQUIRED, ...CONSTRUCT_OPTIONAL], CONSTRUCT_REQUIRED, violations);
  if (!source) return {};
  const normalized = {};
  for (const key of ['occurrence_id', 'target_id', 'construct_role']) {
    const field = string(source, key, pointer, true, violations);
    if (field !== undefined) normalized[key] = field;
  }
  const label = string(source, 'label', pointer, false, violations);
  if (label !== undefined) normalized.label = label;
  const layout = normalizeLayout(source.layout, `${pointer}/layout`, violations);
  if (layout !== undefined) normalized.layout = layout;
  for (const key of ['source_id', 'process_id', 'source_occurrence_id', 'target_occurrence_id', 'symbol_ref', 'layout_ref', 'owner_id', 'capability_id']) {
    if (Object.hasOwn(source, key)) {
      const field = string(source, key, pointer, true, violations);
      if (field !== undefined) normalized[key] = field;
    }
  }
  for (const [key, allowed] of [
    ['owner_target_kind', ['ELEMENT', 'FEATURE']], ['explicitness', ['EXPLICIT', 'SUPPRESSED']],
    ['fold_state', ['UNFOLDED', 'FOLDED']], ['direction', ['DIRECTED', 'BIDIRECTIONAL', 'UNDIRECTED', 'PROFILE_DEFINED']],
    ['collection_completeness', ['COMPLETE', 'INCOMPLETE', 'NOT_APPLICABLE']]
  ]) {
    if (Object.hasOwn(source, key)) {
      const field = enumString(source, key, pointer, allowed, violations);
      if (field !== undefined) normalized[key] = field;
    }
  }
  if (Object.hasOwn(source, 'state_roles')) normalized.state_roles = normalizeStringArray(source.state_roles, `${pointer}/state_roles`, ['INITIAL', 'DEFAULT', 'FINAL'], violations);
  if (Object.hasOwn(source, 'endpoints')) normalized.endpoints = normalizeEndpoints(source.endpoints, `${pointer}/endpoints`, violations);
  if (Object.hasOwn(source, 'modifiers')) normalized.modifiers = normalizeStringPairs(source.modifiers, `${pointer}/modifiers`, 'modifier_id', 'value', false, violations);
  if (Object.hasOwn(source, 'labels')) normalized.labels = normalizeStringPairs(source.labels, `${pointer}/labels`, 'slot_id', 'text', false, violations);
  return normalized;
}

function normalizeLayout(value, pointer, violations) {
  const source = object(value, pointer, [...LAYOUT_FLOAT_FIELDS, 'z_order'], [...LAYOUT_FLOAT_FIELDS, 'z_order'], violations);
  if (!source) return undefined;
  const normalized = {};
  for (const key of LAYOUT_FLOAT_FIELDS) {
    if (!Object.hasOwn(source, key)) continue;
    const raw = source[key];
    if (typeof raw !== 'number') {
      issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, `${pointer}/${key}`, 'Layout geometry must be a number.');
    } else if (!Number.isFinite(raw)) {
      issue(violations, 'PROJECTION_DIGEST_NON_FINITE_FLOAT', 4, `${pointer}/${key}`, 'Layout geometry must be finite.');
    } else {
      try {
        normalized[key] = { $binary64: binary64Hex(raw) };
      } catch (error) {
        issue(violations, 'PROJECTION_DIGEST_FLOAT_ENCODING_FAILED', 6, `${pointer}/${key}`, 'Layout geometry cannot be encoded as binary64.');
      }
    }
  }
  if (Object.hasOwn(source, 'z_order')) normalized.z_order = safeInteger(source.z_order, `${pointer}/z_order`, violations);
  return normalized;
}

function normalizeEndpoints(value, pointer, violations) {
  if (!Array.isArray(value)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Endpoints must be an array.');
    return [];
  }
  return value.map((item, index) => {
    const itemPointer = `${pointer}/${index}`;
    const source = object(item, itemPointer, ['role', 'target_kind', 'target_id', 'ordinal'], ['role', 'target_kind', 'target_id', 'ordinal'], violations);
    if (!source) return {};
    const normalized = {};
    for (const key of ['role', 'target_id']) {
      const field = string(source, key, itemPointer, true, violations);
      if (field !== undefined) normalized[key] = field;
    }
    const targetKind = enumString(source, 'target_kind', itemPointer, ['ELEMENT', 'STATE', 'FEATURE', 'FACT'], violations);
    if (targetKind !== undefined) normalized.target_kind = targetKind;
    if (Object.hasOwn(source, 'ordinal')) normalized.ordinal = safeInteger(source.ordinal, `${itemPointer}/ordinal`, violations);
    return normalized;
  });
}

function normalizeStringPairs(value, pointer, firstKey, secondKey, secondNonEmpty, violations) {
  if (!Array.isArray(value)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection field must be an array.');
    return [];
  }
  return value.map((item, index) => {
    const itemPointer = `${pointer}/${index}`;
    const source = object(item, itemPointer, [firstKey, secondKey], [firstKey, secondKey], violations);
    if (!source) return {};
    const normalized = {};
    const first = string(source, firstKey, itemPointer, true, violations);
    const second = string(source, secondKey, itemPointer, secondNonEmpty, violations);
    if (first !== undefined) normalized[firstKey] = first;
    if (second !== undefined) normalized[secondKey] = second;
    return normalized;
  });
}

function normalizeStringArray(value, pointer, allowed, violations) {
  if (!Array.isArray(value)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection field must be an array.');
    return [];
  }
  return value.map((item, index) => {
    const itemPointer = `${pointer}/${index}`;
    if (typeof item !== 'string' || !allowed.includes(item)) {
      issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, itemPointer, 'Projection enum is invalid.');
      return undefined;
    }
    unicode(item, itemPointer, violations);
    return item;
  });
}

function object(value, pointer, allowed, required, violations) {
  if (!isPlainObject(value)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection object is invalid.');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    unicode(key, `${pointer}/${escapePointer(key)}`, violations);
    if (!allowed.includes(key)) issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, `${pointer}/${escapePointer(key)}`, 'Projection contains an unknown field.');
  }
  for (const key of required) if (!Object.hasOwn(value, key)) issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, `${pointer}/${key}`, 'Projection required field is missing.');
  return value;
}

function string(source, key, parentPointer, nonEmpty, violations) {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  const pointer = `${parentPointer}/${key}`;
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection string field is invalid.');
    return undefined;
  }
  unicode(value, pointer, violations);
  return value;
}

function array(source, key, parentPointer, violations) {
  if (!Object.hasOwn(source, key)) return undefined;
  const value = source[key];
  const pointer = `${parentPointer}/${key}`;
  if (!Array.isArray(value)) {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection array field is invalid.');
    return undefined;
  }
  return value;
}

function enumString(source, key, parentPointer, allowed, violations) {
  const value = string(source, key, parentPointer, true, violations);
  if (value !== undefined && !allowed.includes(value)) issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, `${parentPointer}/${key}`, 'Projection enum field is invalid.');
  return value;
}

function safeInteger(value, pointer, violations) {
  if (typeof value !== 'number') {
    issue(violations, 'PROJECTION_DIGEST_SCHEMA_MISMATCH', 2, pointer, 'Projection integer field must be a number.');
    return undefined;
  }
  if (!Number.isSafeInteger(value)) {
    issue(violations, 'PROJECTION_DIGEST_NUMBER_DOMAIN_INVALID', 5, pointer, 'Projection integer field must be a safe integer.');
    return undefined;
  }
  return value;
}

function unicode(value, pointer, violations) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        issue(violations, 'PROJECTION_DIGEST_UNICODE_INVALID', 3, pointer, 'Projection string contains a lone high surrogate.');
        return;
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      issue(violations, 'PROJECTION_DIGEST_UNICODE_INVALID', 3, pointer, 'Projection string contains a lone low surrogate.');
      return;
    }
  }
}

function binary64Hex(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (!/^[0-9a-f]{16}$/.test(hex)) throw new Error('Invalid binary64 encoding.');
  return hex;
}

function issue(violations, code, priority, pointer, message) {
  violations.push({ code, priority, pointer, message });
}

function throwFirst(violations) {
  if (!violations.length) return;
  violations.sort((left, right) => left.priority - right.priority || Buffer.compare(Buffer.from(left.pointer), Buffer.from(right.pointer)));
  const first = violations[0];
  throw new ProjectionDigestV01Error(first.code, first.pointer, first.message);
}

function escapePointer(value) { return value.replaceAll('~', '~0').replaceAll('/', '~1'); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
