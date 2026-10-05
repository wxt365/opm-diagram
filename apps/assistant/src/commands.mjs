import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { check } from './store.mjs';

const schema = JSON.parse(await readFile(new URL('../../../docs/contracts/schemas/opm-draft-workspace-v02.schema.json', import.meta.url), 'utf8'));
export const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv); ajv.addSchema(schema);
export const validateCommand = ajv.compile({ $ref: schema.$id + '#/$defs/DraftCommand' });
export const validateRequest = ajv.compile({ $ref: schema.$id + '#/$defs/DraftEditRequest' });
export const validateStep = ajv.compile({ $ref: schema.$id + '#/$defs/ModelPlanStep' });
export const allowed = ['CREATE_ELEMENT', 'CREATE_STATE', 'CREATE_FACT', 'UPDATE_PROPERTY', 'UPDATE_STATE', 'UPDATE_LAYOUT'];
const payloadDefs = { CREATE_ELEMENT: 'CreateElementPayload', CREATE_STATE: 'CreateStatePayload', CREATE_FACT: 'CreateFactPayload',
  UPDATE_PROPERTY: 'UpdatePropertyPayload', UPDATE_STATE: 'UpdateStatePayload', UPDATE_LAYOUT: 'UpdateLayoutPayload', PLAN_STEP: 'ModelPlanStep' };
// 与工作台 candidateRules 的当前 ISO 关系适配一致；最终合法性仍由 Runtime 决定。
export function factFamily(capabilityId) {
  if (capabilityId.startsWith('CAP-ISO-STRUCT-')) return 'STRUCTURAL';
  if (['CAP-ISO-PROC-001', 'CAP-ISO-PROC-002', 'CAP-ISO-PROC-003', 'CAP-ISO-PROC-006', 'CAP-ISO-PROC-007', 'CAP-ISO-PROC-008', 'CAP-ISO-PROC-009', 'CAP-ISO-PROC-010'].includes(capabilityId)) return 'TRANSFORMATION';
  if (['CAP-ISO-PROC-004', 'CAP-ISO-PROC-005', 'CAP-ISO-PROC-011', 'CAP-ISO-PROC-012'].includes(capabilityId)) return 'ENABLING';
  if (['CAP-ISO-PROC-013', 'CAP-ISO-PROC-014', 'CAP-ISO-PROC-015', 'CAP-ISO-PROC-016'].includes(capabilityId)) return 'PROFILE_FACT';
  return null;
}
/** 在展示预览前确认目标和候选绑定，Runtime 仍负责最终语义校验。 */
export function validateBoundCommand(snapshot, contextId, command, option, queryScope) {
  const p = command.payload, kind = command.command_type;
  const graph = snapshot.projections.find(x => x.context_id === contextId);
  check(graph, 'SCOPE_MISMATCH', '当前 OPD 不存在。');
  if (p.context_id) check(p.context_id === contextId, 'SCOPE_MISMATCH', '不能修改其他 OPD。');
  const selected = graph.constructs.find(x => x.occurrence_id === queryScope.selection_id);
  if (kind === 'CREATE_ELEMENT') check(option.capability_ref.capability_id === `CAP-${p.kind}-001`, 'CAPABILITY_INVALID', '创建类型与候选不一致。');
  if (kind === 'CREATE_FACT') {
    check(factFamily(option.capability_ref.capability_id) && p.fact_family === factFamily(option.capability_ref.capability_id), 'INPUT_INVALID', `该候选 fact_family 必须为 ${factFamily(option.capability_ref.capability_id) ?? '当前助手未支持的类型'}。`);
    check(isDeepStrictEqual(p.capability_ref, option.capability_ref) && isDeepStrictEqual(p.normalized_endpoints, option.normalized_endpoints), 'CAPABILITY_INVALID', '关系身份或端点与候选不一致。');
    check(p.normalized_endpoints.every(e => graph.constructs.some(x => x.target_id === e.target_ref.target_id && x.target_kind === e.target_ref.target_kind)), 'SCOPE_MISMATCH', '关系端点必须在当前 OPD 中。');
    check(p.occurrence.ownership === 'OWNED' && p.occurrence.construct_role === (option.capability_ref.capability_id.startsWith('CAP-ISO-STRUCT-') ? 'STRUCTURAL_LINK' : 'PROCEDURAL_LINK'), 'INPUT_INVALID', '关系 occurrence 必须为 OWNED，结构关系角色 STRUCTURAL_LINK，过程关系角色 PROCEDURAL_LINK。');
  }
  if (kind === 'CREATE_STATE') check(selected && selected.target_id === p.owner_ref.target_id && selected.target_kind === p.owner_ref.target_kind
    && isDeepStrictEqual(p.capability_ref, option.capability_ref), 'CAPABILITY_INVALID', '状态所有者或能力与候选不一致。');
  if (kind === 'CREATE_STATE') check(p.occurrence.ownership === 'OWNED' && p.occurrence.construct_role === (p.owner_ref.target_kind === 'FEATURE' ? 'FEATURE_STATE_NODE' : 'STATE_NODE'), 'INPUT_INVALID', '状态 occurrence 必须为 OWNED，对象状态角色 STATE_NODE，特征状态角色 FEATURE_STATE_NODE。');
  if (kind === 'UPDATE_PROPERTY') check(selected && selected.target_id === p.target_ref.target_id && selected.target_kind === p.target_ref.target_kind, 'SCOPE_MISMATCH', '名称目标与选中项不一致。');
  if (kind === 'UPDATE_STATE') check(selected?.target_id === p.state_id && selected?.owner_id === p.expected_owner_ref.target_id, 'SCOPE_MISMATCH', '状态目标与选中项不一致。');
  if (kind === 'UPDATE_LAYOUT') check(selected?.occurrence_id === p.occurrence_id, 'SCOPE_MISMATCH', '布局目标与当前图选中项不一致。');
}

export function payloadSchema(type) {
  const definitions = {}, visit = name => {
    if (definitions[name]) return;
    definitions[name] = schema.$defs[name];
    const refs = JSON.stringify(definitions[name]).matchAll(/#\/\$defs\/([^" ]+)/g);
    for (const match of refs) visit(match[1]);
  };
  visit(payloadDefs[type]); return { ...schema.$defs[payloadDefs[type]], $defs: definitions };
}
