import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';

// 本文件固定草稿 wire；只复用选定的 v1 字段，不继承旧 Revision 授权包装。
const root = fileURLToPath(new URL('../', import.meta.url));
const source = (await SwaggerParser.parse(path.join(root, 'docs/contracts/openapi/opm-local-api-v1.yaml'))).components.schemas;
const save = JSON.parse(await readFile(path.join(root, 'docs/contracts/schemas/opm-draft-save-v02.schema.json'), 'utf8'));
const defs = {};
const ref = name => ({ $ref: `#/$defs/${name}` });
const arr = items => ({ type: 'array', items });
const str = { type: 'string' };
const enumeration = (...values) => ({ type: 'string', enum: values });
const nil = value => ({ anyOf: [value, { type: 'null' }] });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });

function importRule(rule, sourceDefs, prefix) {
  if (rule.$ref) {
    if (!rule.$ref.startsWith(prefix)) throw new Error(`非本地 ref：${rule.$ref}`);
    const name = rule.$ref.slice(prefix.length);
    if (!defs[name]) { defs[name] = {}; defs[name] = importRule(sourceDefs[name], sourceDefs, prefix); }
    return ref(name);
  }
  const copy = structuredClone(rule);
  delete copy.description;
  for (const key of Object.keys(copy)) if (key.startsWith('x-')) delete copy[key];
  if (copy.type === 'object') {
    if (!copy.properties) throw new Error('不能导入开放对象');
    copy.additionalProperties = false;
    copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([key, value]) => [key, importRule(value, sourceDefs, prefix)]));
  }
  if (copy.items) copy.items = importRule(copy.items, sourceDefs, prefix);
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (copy[key]) copy[key] = copy[key].map(value => importRule(value, sourceDefs, prefix));
  for (const key of ['if', 'then', 'else', 'not']) if (copy[key]) copy[key] = importRule(copy[key], sourceDefs, prefix);
  if (copy.type === 'integer') {
    copy.minimum = Math.max(copy.minimum ?? -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER);
    copy.maximum = Math.min(copy.maximum ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  }
  return copy;
}
const v1 = name => importRule({ $ref: `#/components/schemas/${name}` }, source, '#/components/schemas/');
for (const name of ['DraftToken', 'SaveState', 'SaveResult', 'PinResult']) importRule(ref(name), save.$defs, '#/$defs/');
const id = v1('StableId'), token = ref('DraftToken');
const commands = {
  APPLY_MODEL_PLAN: 'ModelPlanPayload',
  CREATE_ARCHITECTURE_LINK: 'CreateArchitectureLinkPayload', DELETE_ARCHITECTURE_LINK: 'DeleteArchitectureLinkPayload', UPDATE_ARCHITECTURE_CLASSIFICATION: 'ArchitectureClassificationPayload', CREATE_ELEMENT: 'CreateElementPayload', CREATE_CONTEXT: 'CreateContextPayload', DELETE_CONTEXT: 'DeleteContextPayload', CREATE_FEATURE: 'CreateFeaturePayload', CREATE_FACT: 'CreateFactPayload',
  CREATE_STATE: 'CreateStatePayload', UPDATE_STATE: 'UpdateStatePayload', UPDATE_FACT: 'UpdateFactPayload',
  UPDATE_PROPERTY: 'UpdatePropertyPayload', UPDATE_LAYOUT: 'UpdateLayoutPayload', UPDATE_LAYOUT_BATCH: 'UpdateLayoutBatchPayload', DELETE_CONSTRUCT: 'DeleteConstructPayload',
  STATE_EXPLICIT: 'StatePresentationPayload', STATE_SUPPRESS: 'StatePresentationPayload', UNFOLD: 'StatePresentationPayload', FOLD: 'StatePresentationPayload',
};
for (const name of new Set(Object.values(commands))) {
  if (['ModelPlanPayload', 'CreateArchitectureLinkPayload', 'DeleteArchitectureLinkPayload', 'ArchitectureClassificationPayload', 'CreateContextPayload', 'DeleteContextPayload', 'UpdateLayoutBatchPayload'].includes(name)) continue;
  v1(name);
  for (const key of ['capability_query_id', 'selected_option_id']) {
    delete defs[name].properties[key]; defs[name].required = defs[name].required.filter(item => item !== key);
  }
}
defs.LayoutGeometry = obj({ x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } });
defs.UpdateLayoutBatchPayload = obj({ layouts: { ...arr(obj({ occurrence_id: id, layout: ref('LayoutGeometry') })), minItems: 1, maxItems: 1000 } });
defs.CreateContextPayload = obj({ context_id: id, refinee_element_id: id, name: { type: 'string', minLength: 1, maxLength: 256 } });
defs.DeleteContextPayload = obj({ context_id: id, impact_token: str });
defs.ArchitectureLinkKind = enumeration('INPUT', 'GENERATES', 'TRACE');
defs.CreateArchitectureLinkPayload = obj({ context_id: id, target_context_id: id, kind: ref('ArchitectureLinkKind') });
defs.DeleteArchitectureLinkPayload = obj({ context_id: id, link_id: id });
defs.ArchitectureLink = obj({ link_id: id, source_context_id: id, target_context_id: id, kind: ref('ArchitectureLinkKind') });
defs.ArchitectureLevel = enumeration('MISSION', 'FUNCTION', 'PRODUCT');
defs.ArchitectureClassificationPayload = obj({ context_id: id, architecture_level: nil(ref('ArchitectureLevel')) });
defs.CreateElementPayload.properties.context_id = id;
defs.CreateFactPayload.properties.fact_family.enum = defs.CreateFactPayload.properties.fact_family.enum.filter(value => value !== 'CONTROL');
// State 的持久化正文只有 name/roles，无 ordinal；不能接受后再静默丢弃。
defs.CreateStatePayload.properties.name_or_value.maxLength = 256;
defs.UpdateStatePayload.properties.changes.properties.name_or_value.maxLength = 256;
delete defs.UpdateStatePayload.properties.changes.properties.ordinal;
const planName = { type: 'string', minLength: 1, maxLength: 256 };
const planCommon = { local_id: id };
defs.ModelPlanStep = { oneOf: [
  obj({ ...planCommon, command_type: { const: 'CREATE_ELEMENT' }, kind: enumeration('OBJECT', 'PROCESS'), name: planName, layout: ref('NodeLayoutInput') }),
  obj({ ...planCommon, command_type: { const: 'CREATE_STATE' }, target: id, name: planName, state_roles: ref('StateRoles'), layout: ref('NodeLayoutInput') }, ['local_id', 'command_type', 'target', 'name']),
  obj({ ...planCommon, command_type: { const: 'CREATE_FACT' }, endpoints: { ...arr(id), minItems: 2, maxItems: 3 }, capability_id: id }),
  obj({ ...planCommon, command_type: { const: 'UPDATE_PROPERTY' }, target: id, name: planName }),
  obj({ ...planCommon, command_type: { const: 'UPDATE_STATE' }, target: id, name: planName, state_roles: ref('StateRoles') }, ['local_id', 'command_type', 'target', 'name']),
  obj({ ...planCommon, command_type: { const: 'UPDATE_LAYOUT' }, target: id, layout: ref('NodeLayoutInput') }),
] };
defs.ModelPlanPayload = obj({ context_id: id, steps: { ...arr(ref('ModelPlanStep')), minItems: 1, maxItems: 100 } });
defs.MindmapNode = obj({ id, parent_id: nil(id), order: { type: 'integer', minimum: 0, maximum: 300 }, label: planName,
  note: { type: 'string', maxLength: 4000 }, kind: enumeration('TOPIC', 'OBJECT', 'PROCESS', 'STATE', 'ATTRIBUTE', 'CONSTRAINT', 'UNCLASSIFIED'),
  owner_id: nil(id), entity_ref: nil(id), target_id: nil(id), collapsed: { type: 'boolean' } });
defs.MindmapRelation = obj({ id, label: planName, capability_id: nil(id), endpoints: { ...arr(id), minItems: 2, maxItems: 3 } });
defs.MindmapDocument = obj({ format_version: { type: 'integer', minimum: 1, maximum: 1 }, id, revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  root_id: id, nodes: { ...arr(ref('MindmapNode')), minItems: 1, maxItems: 300 }, relations: { ...arr(ref('MindmapRelation')), maxItems: 100 } });
defs.AnalysisSource = obj({ mindmap_id: id, revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, digest: str,
  bindings: { ...arr(obj({ source_id: id, target_ref: id })), minItems: 1, maxItems: 400 }, excluded_ids: { ...arr(id), maxItems: 400 } });
defs.MindmapMapping = obj({ source_id: id, target_id: id, source_json: str, target_name: str, target_kind: str });
defs.MindmapConversion = obj({ command_id: id, context_id: id, revision: { type: 'integer' }, mappings: arr(ref('MindmapMapping')), excluded_ids: { ...arr(id), maxItems: 400 } });
defs.MindmapRequest = obj({ request_id: id, action: enumeration('OPEN', 'SAVE'), draft_token: token,
  document: ref('MindmapDocument'), expected_revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }, ['request_id', 'action', 'draft_token']);
defs.MindmapResult = obj({ request_id: id, document: ref('MindmapDocument'), digest: str, conversions: arr(ref('MindmapConversion')) });
defs.DraftCommandType = enumeration(...Object.keys(commands));
defs.DraftCommand = { oneOf: Object.entries(commands).map(([command, payload]) => obj({ command_type: { const: command }, payload: ref(payload) })) };
defs.DraftScope = obj({ context_id: id, selection_id: nil(id), intent: ref('DraftCommandType'), endpoints: arr(id) });
defs.DraftAuthorization = obj({ capability_query_id: id, selected_option_id: id });
defs.DraftEditRequest = obj({ request_id: id, command_id: id, expected_draft_token: token,
  scope: ref('DraftScope'), authorization: ref('DraftAuthorization'), command: ref('DraftCommand'), analysis_source: ref('AnalysisSource') },
  ['request_id', 'command_id', 'expected_draft_token', 'scope', 'authorization', 'command']);
defs.DraftQueryRequest = obj({ request_id: id, draft_token: token, context_id: id });
defs.MethodSource = { oneOf: [obj({ draft_token: token }), obj({ revision_id: id })] };
defs.MethodSummaryRequest = obj({ request_id: id, context_id: id, source: ref('MethodSource') });
defs.MethodEvidence = obj({ fact_id: id, capability_id: str, description: str, context_ids: arr(id), target_ids: arr(id) });
defs.MethodRole = obj({ role: enumeration('SUBJECT', 'OBJECT', 'INSTRUMENT', 'RESOURCE', 'ENVIRONMENT', 'INFORMATION'),
  status: enumeration('EVIDENCE', 'NO_EVIDENCE', 'MANUAL'), guidance: str, evidence: arr(ref('MethodEvidence')) });
defs.MethodProcess = obj({ process_id: id, name: str, context_ids: arr(id), roles: { ...arr(ref('MethodRole')), minItems: 6, maxItems: 6 } });
defs.MethodSummaryResult = obj({ meta: obj({ request_id: id, context_id: id, source: ref('MethodSource') }),
  data: obj({ coverage: { const: 'RELATION_EVIDENCE_ONLY' }, processes: arr(ref('MethodProcess')),
    contexts: arr(obj({ context_id: id, name: str, architecture_level: nil(ref('ArchitectureLevel')) })),
    architecture_links: arr(ref('ArchitectureLink')), refinements: arr(obj({ refinement_id: id, parent_context_id: id, child_context_id: id, refinee_element_id: id, refinee_name: str, refinement_kind: enumeration('PROCESS', 'OBJECT') })) }) });
defs.OperationHistoryRequest = obj({ request_id: id, revision: id, before: nil({ type: 'string', minLength: 1, maxLength: 2048 }) });
defs.OperationHistoryItem = obj({ record_id: id, occurred_at: { type: 'string', format: 'date-time' }, operation: str,
  title: { type: 'string', minLength: 1 }, context_id: nil(id), context_name: nil(str), status: str, revision_id: nil(id), detail_available: { type: 'boolean' } });
defs.OperationHistoryResult = obj({ meta: obj({ request_id: id, project_id: id, model_id: id, revision: id }),
  data: obj({ items: { ...arr(ref('OperationHistoryItem')), maxItems: 100 }, next_before: nil({ type: 'string', minLength: 1, maxLength: 2048 }) }) });
defs.DraftRelationCatalogRequest = obj({ request_id: id, draft_token: token, context_id: id, selection_id: nil(id) });
defs.DraftCapabilitiesRequest = obj({ request_id: id, draft_token: token, scope: ref('DraftScope') });
defs.OpenDraftRequest = obj({ request_id: id, context_id: nil(id) });
defs.DraftQueryMeta = obj({ request_id: id, draft_token: token, context_id: id });
defs.OpenDraftResult = obj({ request_id: id, project_id: id, model_id: id, root_context_id: id, context_id: id,
  mode: enumeration('JOURNALED_DRAFT_V2'), draft_token: token, save_state: ref('SaveState') });
defs.DraftEditResult = obj({ request_id: id, command_id: id, status: enumeration('DURABLE', 'UNCHANGED'),
  base_token: token, result_token: token, content_digest: ref('Digest'), affected_ids: arr(id), text_trace_ids: arr(id), validation_summary: v1('ValidationSummary') });

// 候选和删除影响均替换身份字段，不保留 revision-only fallback。
v1('CommandCapabilityOption');
delete defs.CommandCapabilityOption.allOf;
defs.CommandCapabilityOption.properties.command_type = ref('DraftCommandType');
defs.CommandCapabilityOption.required = defs.CommandCapabilityOption.required.map(key => key === 'expires_with_revision' ? 'expires_with_token' : key);
delete defs.CommandCapabilityOption.properties.expires_with_revision;
defs.CommandCapabilityOption.properties.expires_with_token = token;
defs.ImpactSummary.required = defs.ImpactSummary.required.map(key => key === 'input_revision' ? 'input_token' : key);
delete defs.ImpactSummary.properties.input_revision;
defs.ImpactSummary.properties.input_token = token;
defs.CapabilityReasonCode.enum = defs.CapabilityReasonCode.enum.filter(code => code !== 'REVISION_STALE');
defs.CapabilityReasonCode.enum.push('DRAFT_CONFLICT', 'DELETE_DEPENDENCY_EXISTS', 'COMMAND_NOT_IMPLEMENTED', 'IMPACT_TOKEN_STALE');
const option = structuredClone(defs.CommandCapabilityOption);
const deletion = ['impact_summary', 'impact_token', 'delete_mode', 'delete_target'];
const ordinary = structuredClone(option);
for (const key of deletion) delete ordinary.properties[key];
ordinary.properties.command_type = enumeration(...Object.keys(commands).filter(command => !['DELETE_CONSTRUCT', 'DELETE_CONTEXT', 'CREATE_ARCHITECTURE_LINK', 'DELETE_ARCHITECTURE_LINK', 'UPDATE_ARCHITECTURE_CLASSIFICATION'].includes(command)));
option.required.push(...deletion);
option.properties.command_type = { const: 'DELETE_CONSTRUCT' };
defs.ContextDeleteImpact = obj({ input_token: token, context_id: id, parent_context_id: id, context_ids: arr(id),
  counts: ref('DeleteImpactCounts'), blockers: arr(obj({ kind: enumeration('ELEMENT', 'FEATURE', 'STATE', 'FACT', 'OCCURRENCE', 'CONTEXT'), id, context_id: id }, ['kind', 'id'])) });
const contextDeletion = structuredClone(ordinary);
contextDeletion.properties.command_type = { const: 'DELETE_CONTEXT' };
contextDeletion.properties.context_impact = ref('ContextDeleteImpact');
contextDeletion.properties.impact_token = str;
contextDeletion.required.push('context_impact', 'impact_token');
// 方法元数据授权不使用语言 Profile 的 symbol/template/capability。
const metadataOption = obj({ capability_query_id: id, option_id: id,
  command_type: enumeration('UPDATE_ARCHITECTURE_CLASSIFICATION', 'CREATE_ARCHITECTURE_LINK', 'DELETE_ARCHITECTURE_LINK'), option_kind: { const: 'METHOD_METADATA' },
  target_context_id: id, display_name: str, required_fields: structuredClone(ordinary.properties.required_fields),
  enabled: { type: 'boolean' }, reason_codes: arr(ref('CapabilityReasonCode')), expires_with_token: token });
defs.CommandCapabilityOption = { oneOf: [ordinary, option, contextDeletion, metadataOption] };
defs.DraftCapabilitiesData = obj({ scope: ref('DraftScope'), allowed: arr(ref('DraftCommandType')),
  forbidden: arr(obj({ command_type: ref('DraftCommandType'), reason_code: ref('CapabilityReasonCode') })),
  capability_query_id: id, options: arr(ref('CommandCapabilityOption')) });

// 封闭当前投影所有已知字段；边几何补齐为可选字段，防止有损回读。
defs.ProjectionLayout = obj({ ...structuredClone(defs.NodeLayoutInput.properties), z_order: { type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
  route_points: arr(v1('Point')), label_positions: arr(ref('Point')), junction_position: ref('Point') }, ['x', 'y', 'width', 'height', 'z_order']);
defs.ProjectionEndpoint = obj({ role: str, target_kind: enumeration('ELEMENT', 'FEATURE', 'STATE', 'FACT', 'CONTEXT'),
  target_id: id, ordinal: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, state_qualification: id }, ['role', 'target_kind', 'target_id', 'ordinal']);
const construct = structuredClone(source.ContextProjectionResult.properties.data.properties.constructs.items);
Object.assign(construct.properties, {
  owner_target_kind: enumeration('ELEMENT', 'FEATURE'),
  endpoints: arr(ref('ProjectionEndpoint')), modifiers: arr(ref('ModifierInput')), labels: arr(ref('LabelInput')), layout: ref('ProjectionLayout'),
});
for (const key of ['source_id', 'process_id', 'source_occurrence_id', 'target_occurrence_id', 'symbol_ref', 'layout_ref']) construct.properties[key] = id;
// 此处已混合本地 ref 和 v1 ref，先只转换原 v1 ref。
function projectionRefs(value) {
  if (value.$ref) return value.$ref.startsWith('#/components/') ? v1(value.$ref.split('/').at(-1)) : value;
  if (Array.isArray(value)) return value.map(projectionRefs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, projectionRefs(child)]));
  return value;
}
defs.ProjectionConstruct = projectionRefs(construct);
defs.ProjectionConstruct.additionalProperties = false;
defs.DraftProjectionData = obj({ context_id: id, constructs: arr(ref('ProjectionConstruct')), suppressed_states: arr(v1('SuppressedState')) });
defs.DraftModelPlanPreviewRequest = obj({ request_id: id, draft_token: token, context_id: id, plan_id: id,
  steps: { ...arr(ref('ModelPlanStep')), maxItems: 100 }, next_scope: nil(ref('DraftScope')), finalize: { type: 'boolean' }, analysis_source: ref('AnalysisSource') },
  ['request_id', 'draft_token', 'context_id', 'plan_id', 'steps', 'next_scope']);
defs.DraftModelPlanPreviewResult = obj({ meta: ref('DraftQueryMeta'), data: ref('DraftProjectionData'), capabilities: nil(ref('DraftCapabilitiesData')), findings: nil(ref('DraftFindingsData')) });
for (const [name, sourceName] of [['DraftTextData', 'TextProjectionResult'], ['DraftNavigationData', 'ContextNavigationResult'],
  ['DraftRelationCatalogData', 'RelationCatalogResult']]) {
  defs[name] = importRule(source[sourceName].properties.data, source, '#/components/schemas/');
}
defs.NavigationNode.properties.parent_context_id = id;
defs.NavigationNode.properties.refinee_element_id = id;
defs.DraftFinding = obj({ finding_id: id, rule_id: id, severity: { const: 'BLOCKING' },
  category: enumeration('DUPLICATE_ID', 'MISSING_REFERENCE', 'CAPABILITY_BINDING_MISMATCH', 'INVALID_ENDPOINT', 'STATE_OWNER_MISMATCH',
    'INVALID_STATE_PRESENTATION', 'CONTEXT_CLOSURE_VIOLATION', 'INVALID_LAYOUT', 'INVALID_OWNERSHIP', 'INVALID_REFINEMENT'),
  context_id: { type: 'null' }, entity_id: id, message: { type: 'string', minLength: 1 } });
defs.DraftFindingsData = obj({ items: arr(ref('DraftFinding')), validation_scope: { const: 'MODEL' },
  validation_summary: obj({ blocking: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, warning: { type: 'integer', minimum: 0, maximum: 0 },
    suggestion: { type: 'integer', minimum: 0, maximum: 0 }, coverage_state: { const: 'INCOMPLETE' } }) });
for (const name of ['Projection', 'Text', 'Navigation', 'Findings', 'RelationCatalog', 'Capabilities']) {
  defs[`Draft${name}Result`] = obj({ meta: ref('DraftQueryMeta'), data: ref(`Draft${name}Data`) });
}
defs.DraftReceiptRequest = obj({ request_id: id, operation: enumeration('EDIT', 'SAVE', 'PIN'), idempotency_id: id });
defs.DraftReceiptResult = { oneOf: [obj({ request_id: id, operation: enumeration('EDIT', 'SAVE', 'PIN'), idempotency_id: id,
  status: enumeration('NOT_FOUND'), request_digest: { type: 'null' }, result: { type: 'null' } }),
...Object.entries({ EDIT: 'DraftEditResult', SAVE: 'SaveResult', PIN: 'PinResult' }).map(([operation, result]) => obj({
  request_id: id, operation: { const: operation }, idempotency_id: id, status: enumeration('FOUND'), request_digest: ref('Digest'), result: ref(result),
}))] };
defs.DraftError = obj({ code: enumeration('INPUT_INVALID', 'DRAFT_CONFLICT', 'READ_ONLY_REVISION', 'RULE_VERSION_CONFLICT',
  'IDEMPOTENCY_MISMATCH', 'PERSISTENCE_FAILED', 'DRAFT_RECOVERY_REQUIRED', 'NOT_FOUND', 'DRAFT_MODE_REQUIRED', 'DRAFT_EDIT_REJECTED', 'LOCAL_SESSION_INVALID'),
  message: { type: 'string', minLength: 1 }, retryable: { type: 'boolean' }, reason_code: nil(ref('CapabilityReasonCode')) });

// 拒绝未实现关键词；防止 Schema 演进后两端只校验已知的一半。
const keywords = new Set(['$ref', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'uniqueItems',
  'minItems', 'maxItems', 'minProperties', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'oneOf', 'anyOf']);
function audit(rule) {
  for (const key of Object.keys(rule)) if (!keywords.has(key)) throw new Error(`未支持关键词 ${key}`);
  if (rule.type === 'object' && rule.additionalProperties !== false) throw new Error('未封闭 object');
  for (const child of Object.values(rule.properties ?? {})) audit(child);
  if (rule.items) audit(rule.items);
  for (const child of [...(rule.oneOf ?? []), ...(rule.anyOf ?? [])]) audit(child);
}
for (const rule of Object.values(defs)) audit(rule);
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://opm.local/schemas/draft-workspace/0.2',
  title: '草稿编辑与查询协议 0.2；由 generate-draft-workspace-contract.mjs 生成', $defs: defs };
function tsType(rule) {
  if (rule.$ref) return rule.$ref.split('/').at(-1);
  if (rule.const !== undefined) return JSON.stringify(rule.const);
  if (rule.enum) return rule.enum.map(JSON.stringify).join(' | ');
  if (rule.oneOf || rule.anyOf) return (rule.oneOf ?? rule.anyOf).map(tsType).join(' | ');
  if (Array.isArray(rule.type)) return rule.type.map(type => tsType({ type })).join(' | ');
  if (rule.type === 'object') return `{ ${Object.entries(rule.properties).map(([key, value]) => `${key}${rule.required?.includes(key) ? '' : '?'}: ${tsType(value)};`).join(' ')} }`;
  if (rule.type === 'array') return `Array<${tsType(rule.items)}>`;
  return { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', null: 'null' }[rule.type] ?? (() => { throw new Error('无法生成 TS 类型'); })();
}
const ts = '// 由 scripts/generate-draft-workspace-contract.mjs 生成，请勿手改。\n\n' + Object.entries(defs).map(([name, rule]) => `export type ${name} = ${tsType(rule)};`).join('\n\n') + '\n';
const operations = {
  mindmap: ['ManageMindmap', 'MindmapRequest', 'MindmapResult'],
  'plan-preview': ['PreviewModelPlan', 'DraftModelPlanPreviewRequest', 'DraftModelPlanPreviewResult'],
  open: ['OpenDraft', 'OpenDraftRequest', 'OpenDraftResult'], projection: ['QueryDraftProjection', 'DraftQueryRequest', 'DraftProjectionResult'],
  text: ['QueryDraftText', 'DraftQueryRequest', 'DraftTextResult'], navigation: ['QueryDraftNavigation', 'DraftQueryRequest', 'DraftNavigationResult'],
  findings: ['QueryDraftFindings', 'DraftQueryRequest', 'DraftFindingsResult'], 'relation-catalog': ['QueryDraftRelationCatalog', 'DraftRelationCatalogRequest', 'DraftRelationCatalogResult'],
  capabilities: ['QueryDraftCapabilities', 'DraftCapabilitiesRequest', 'DraftCapabilitiesResult'], commands: ['ExecuteDraftEdit', 'DraftEditRequest', 'DraftEditResult'],
  receipts: ['GetDraftReceipt', 'DraftReceiptRequest', 'DraftReceiptResult'],
  'operation-history': ['QueryOperationHistory', 'OperationHistoryRequest', 'OperationHistoryResult'],
  'method-summary': ['GetMethodSummary', 'MethodSummaryRequest', 'MethodSummaryResult'],
};
const apiRef = name => ({ $ref: `../schemas/opm-draft-workspace-v02.schema.json#/$defs/${name}` });
const media = name => ({ 'application/json': { schema: apiRef(name) } });
const api = { openapi: '3.1.0', info: { title: 'OPM 草稿编辑、查询与模型操作历史 API（参数与查询边界见实施 Checklist）', version: '0.2.0-draft' },
  servers: [{ url: 'http://127.0.0.1:17850/api/v2' }], security: [{ localSession: [] }],
  paths: Object.fromEntries(Object.entries(operations).map(([suffix, [operationId, request, result]]) => [`/projects/{project_id}/models/{model_id}/draft/${suffix}`, {
    parameters: ['project_id', 'model_id'].map(name => ({ name, in: 'path', required: true, schema: apiRef('StableId') })),
    post: { operationId, requestBody: { required: true, content: media(request) }, responses: { '200': { description: '成功', content: media(result) },
      ...Object.fromEntries(['400', '403', '404', '409', '422', '503'].map(status => [status, { description: '草稿协议错误，映射见 HS-01D', content: media('DraftError') }])) } },
  }])), components: { securitySchemes: { localSession: { type: 'apiKey', in: 'header', name: 'X-OPM-Session' } } } };
const rootTypes = [...new Set(Object.values(operations).flatMap(([, request, result]) => [request, result])), 'DraftError'];
const java = `package org.opm.localruntime.api.generated;

// 由 scripts/generate-draft-workspace-contract.mjs 生成，请勿手改。
public final class DraftWorkspaceContract {
    private DraftWorkspaceContract() { }
    public enum Type { ${rootTypes.join(', ')} }

    /** 只允许从严格解码入口构造，输出副本不能修改已验证的请求。 */
    public static final class Document {
        private final Type type;
        private final com.fasterxml.jackson.databind.JsonNode value;
        private Document(Type type, com.fasterxml.jackson.databind.JsonNode value) { this.type = type; this.value = value.deepCopy(); }
        public Type type() { return type; }
        public com.fasterxml.jackson.databind.JsonNode value() { return value.deepCopy(); }
    }

    public static Document read(String raw, Type type) {
        java.util.Objects.requireNonNull(type, "草稿协议类型必填");
        return new Document(type, org.opm.localruntime.api.DraftWorkspaceSchema.read(raw, type.name()));
    }
}
`;
for (const [file, content] of [
  ['docs/contracts/schemas/opm-draft-workspace-v02.schema.json', JSON.stringify(schema, null, 2) + '\n'],
  ['services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json', JSON.stringify(schema, null, 2) + '\n'],
  ['docs/contracts/openapi/opm-draft-workspace-v02.json', JSON.stringify(api, null, 2) + '\n'],
  ['apps/web/src/shared/api/generated/draftWorkspaceContract.ts', ts],
  ['services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java', java],
]) {
  if (process.argv.includes('--check')) {
    if (await readFile(path.join(root, file), 'utf8') !== content) throw new Error(`生成文件过期：${file}`);
  } else await writeFile(path.join(root, file), content);
}
console.log('草稿编辑与查询协议生成检查通过');
