import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { binary64Hex } from './canvas06-projection-digest-v01.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const schema = JSON.parse(readFileSync(new URL('../docs/contracts/schemas/opm-draft-workspace-v02.schema.json', import.meta.url)));
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(schema);
const invalid = () => { throw Object.assign(new TypeError('草稿协议输入无效'), { code: 'INPUT_INVALID' }); };
const sameToken = (a, b) => a?.draft_id === b?.draft_id && a?.edit_seq === b?.edit_seq && a?.binding_digest === b?.binding_digest;

// JSON.parse 保留 -0；另行拒绝对象的重复键（包括转义后相同的键）。
function parse(raw) {
  if (typeof raw !== 'string') invalid();
  let value;
  try { value = JSON.parse(raw); } catch { invalid(); }
  const tokens = raw.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? [];
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (item === '{') stack.push(new Set());
    else if (item === '[') stack.push(null);
    else if (item === '}' || item === ']') stack.pop();
    else if (item.startsWith('"') && tokens[i + 1] === ':') {
      const key = JSON.parse(item), keys = stack.at(-1);
      if (!keys || keys.has(key)) invalid();
      keys.add(key);
    }
  }
  return value;
}

function encode(value) {
  if (typeof value === 'number') return { binary64: binary64Hex(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  return value;
}

export function validateDraftWorkspace(name, value) {
  const valid = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!valid || !valid(value)) invalid();
  // JCS 同时验证所有字符串的 Unicode scalar 与有限数值。
  try { canonicalizeJcs(encode(value)); } catch { invalid(); }
  if (name === 'DraftEditRequest') {
    const { scope, command } = value;
    if (scope.intent !== command.command_type) invalid();
    if (command.payload.context_id !== undefined && command.payload.context_id !== (command.command_type === 'DELETE_CONTEXT' ? scope.selection_id : scope.context_id)) invalid();
    if (command.command_type === 'DELETE_CONSTRUCT' && command.payload.selection_id !== scope.selection_id) invalid();
  }
  if (name === 'DraftEditResult') {
    const { base_token: base, result_token: result, status } = value;
    if (base.draft_id !== result.draft_id || base.binding_digest !== result.binding_digest) invalid();
    if (status === 'UNCHANGED' ? !sameToken(base, result) : base.edit_seq === Number.MAX_SAFE_INTEGER || result.edit_seq !== base.edit_seq + 1) invalid();
  }
  if (name === 'SaveState') {
    const { durable_token: head, checkpoint_token: checkpoint, pending_manual_target: pending, dirty_since: dirty, deadline } = value;
    for (const token of [checkpoint, pending]) if (token && (token.draft_id !== head.draft_id || token.binding_digest !== head.binding_digest || token.edit_seq > head.edit_seq)) invalid();
    if ((dirty === null) !== (deadline === null) || dirty !== null && Date.parse(deadline) - Date.parse(dirty) !== 10000) invalid();
  }
  if (name === 'OpenDraftResult') {
    if (!sameToken(value.draft_token, value.save_state.durable_token)) invalid();
    validateDraftWorkspace('SaveState', value.save_state);
  }
  if (name === 'DraftProjectionResult' && value.meta.context_id !== value.data.context_id) invalid();
  if (name === 'DraftFindingsResult') {
    const { items, validation_summary: summary } = value.data;
    if (items.length !== summary.blocking || new Set(items.map(item => item.finding_id)).size !== items.length) invalid();
  }
  if (name === 'DraftCapabilitiesResult') {
    const { meta, data } = value;
    if (data.scope.context_id !== meta.context_id) invalid();
    const ids = new Set();
    for (const option of data.options) {
      if (!sameToken(option.expires_with_token, meta.draft_token) || option.capability_query_id !== data.capability_query_id || ids.has(option.option_id)
        || option.command_type !== data.scope.intent) invalid();
      ids.add(option.option_id);
      if (option.command_type === 'DELETE_CONTEXT' && (!sameToken(option.context_impact.input_token, meta.draft_token) || option.context_impact.context_id !== data.scope.selection_id)) invalid();
      if (option.command_type === 'DELETE_CONSTRUCT') {
        const impact = option.impact_summary;
        if (!sameToken(impact.input_token, meta.draft_token) || impact.selected_occurrence_id !== data.scope.selection_id
          || impact.delete_mode !== option.delete_mode || impact.target.kind !== option.delete_target.kind || impact.target.id !== option.delete_target.id) invalid();
      }
    }
  }
  if (name === 'DraftReceiptResult' && value.status === 'FOUND') {
    const [kind, id] = { EDIT: ['DraftEditResult', 'command_id'], SAVE: ['SaveResult', 'save_id'], PIN: ['PinResult', 'pin_id'] }[value.operation];
    if (value.result[id] !== value.idempotency_id) invalid();
    validateDraftWorkspace(kind, value.result);
  }
  return value;
}

export function readDraftWorkspace(raw, name) { return validateDraftWorkspace(name, parse(raw)); }

export function draftEditRequestPreimage(projectId, modelId, raw) {
  validateDraftWorkspace('StableId', projectId); validateDraftWorkspace('StableId', modelId);
  const { request_id: ignored, ...request } = readDraftWorkspace(raw, 'DraftEditRequest');
  return encode({ identity_version: 'DraftEditRequest/1', project_id: projectId, model_id: modelId, ...request });
}

export function draftEditRequestCanonical(projectId, modelId, raw) { return canonicalizeJcs(draftEditRequestPreimage(projectId, modelId, raw)); }
export function draftEditRequestDigest(projectId, modelId, raw) { return createHash('sha256').update(draftEditRequestCanonical(projectId, modelId, raw), 'utf8').digest('hex'); }
