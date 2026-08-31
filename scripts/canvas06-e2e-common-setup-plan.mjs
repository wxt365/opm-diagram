import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalizeJcs } from './canvas06-rfc8785.mjs';

const SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-common-setup-plan.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(SCHEMA);

export const COMMON_SETUP_PLAN_PATH = 'dev-canvas-06-common-setup-plan.json';
export const COMMON_DRIVER_SOURCE_PATH = 'tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs';

const CASE_STATES = Object.freeze([
  ['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'M_STATE'],
  ['E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION', 'M_STATE_SUPPRESSED'],
  ['E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'M_OBJECT'],
  ['E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP', 'M_STATE_OBJECT_PROCESS'],
  ['E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-006.STATE_IMPACT_CONFIRMED', 'M_DELETABLE_STATE'],
  ['E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'M_FACT'],
  ['E2E-CANVAS-006.STALE_TOKEN_BLOCKED', 'M_DELETABLE_STATE'],
  ['E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'M_DELETABLE_STATE'],
  ['E2E-CANVAS-007.ASSET_MISSING', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-007.TEXT_BLOCKED', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-007.REVISION_CONFLICT', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-007.PERSISTENCE_FAILED', 'M_OBJECT_PROCESS'],
  ['E2E-CANVAS-007.READONLY', 'M_READONLY_TARGET']
]);

export class CommonSetupPlanError extends Error {
  constructor(code, message, exitCode) {
    super(message);
    this.name = 'CommonSetupPlanError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function buildCommonSetupPlan({
  generatedAt,
  sourceBinding,
  generatorRef,
  commonFixtureCatalogRef,
  commonDriverRef,
  catalogCases
}) {
  assertRef(generatorRef, 'GENERATOR_SOURCE', 'sources/scripts/build-canvas06-common-visual-fixtures.mjs');
  assertRef(commonFixtureCatalogRef, 'COMMON_FIXTURE_CATALOG', 'dev-canvas-06-common-fixture-catalog.json');
  assertRef(commonDriverRef, 'E2E_DRIVER_SOURCE', COMMON_DRIVER_SOURCE_PATH);
  assertBinding(sourceBinding);
  assertCatalogOrder(catalogCases);
  assertGeneratedAt(generatedAt);

  const payload = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-COMMON-SETUP-PLAN-001',
    schema_version: '0.1',
    plan_id: `dev-canvas-06.common-setup.${sourceBinding.binding_digest.slice(0, 12)}`,
    plan_version: '0.1.0',
    generated_at: generatedAt,
    generator_ref: structuredClone(generatorRef),
    source_binding: structuredClone(sourceBinding),
    common_fixture_catalog_ref: structuredClone(commonFixtureCatalogRef),
    common_driver_ref: structuredClone(commonDriverRef),
    cases: CASE_STATES.map(([caseId, initialState]) => planCase(caseId, initialState)),
    summary: { case_count: 16, initial_state_count: 8 }
  };
  const plan = { ...payload, plan_payload_sha256: sha256Jcs(payload) };
  if (!validateSchema(plan)) invalid(`Plan does not satisfy Schema 0.1: ${JSON.stringify(validateSchema.errors)}`);
  return deepFreeze(plan);
}

export function verifyCommonSetupPlan({
  plan,
  sourceBinding,
  generatorRef,
  commonFixtureCatalogRef,
  commonDriverRef,
  catalogCases
}) {
  if (!validateSchema(plan)) invalid(`Plan does not satisfy Schema 0.1: ${JSON.stringify(validateSchema.errors)}`);
  const { plan_payload_sha256: digest, ...payload } = plan;
  if (digest !== sha256Jcs(payload)) invalid('Plan payload digest differs.');
  if (!isDeepStrictEqual(plan.source_binding, sourceBinding)) mismatch('Plan binding differs from the active binding.');
  for (const [name, actual, expected] of [
    ['generator', plan.generator_ref, generatorRef],
    ['Catalog', plan.common_fixture_catalog_ref, commonFixtureCatalogRef],
    ['Common Driver', plan.common_driver_ref, commonDriverRef]
  ]) {
    if (!isDeepStrictEqual(actual, expected)) mismatch(`Plan ${name} reference differs.`);
  }
  const expected = buildCommonSetupPlan({
    generatedAt: plan.generated_at,
    sourceBinding,
    generatorRef,
    commonFixtureCatalogRef,
    commonDriverRef,
    catalogCases
  });
  if (!isDeepStrictEqual(plan, expected)) invalid('Plan semantic matrix differs from the frozen sixteen-case definition.');
  return expected;
}

export function rebaseCommonSetupPlanRefs({ plan, manifestCatalogRef, manifestCommonDriverRef }) {
  assertRef(manifestCatalogRef, 'COMMON_FIXTURE_CATALOG', 'inputs/common/dev-canvas-06-common-fixture-catalog.json');
  assertRef(manifestCommonDriverRef, 'E2E_DRIVER_SOURCE', 'inputs/drivers/common-driver.mjs');
  assertRebasedRef(plan?.common_fixture_catalog_ref, manifestCatalogRef, 'Catalog');
  assertRebasedRef(plan?.common_driver_ref, manifestCommonDriverRef, 'Common Driver');
  return true;
}

function planCase(caseId, initialState) {
  const definition = initialStateDefinition(initialState);
  return {
    case_id: caseId,
    initial_state: initialState,
    setup_steps: structuredClone(definition.setup_steps),
    expected_baseline: structuredClone(definition.expected_baseline)
  };
}

function initialStateDefinition(initialState) {
  const owner = staticCommand('setup.create.object.owner', 'CREATE_ELEMENT', element('OBJECT', 'object.common.owner', 'Owner', 80, 120));
  const input = staticCommand('setup.create.object.input', 'CREATE_ELEMENT', element('OBJECT', 'object.common.input', 'Input', 80, 120));
  const process = staticCommand('setup.create.process.action', 'CREATE_ELEMENT', element('PROCESS', 'process.common.action', 'Processing', 420, 120));
  const ownerState = stateCommand('setup.create.state.subject', 'object.common.owner');
  const inputState = stateCommand('setup.create.state.subject', 'object.common.input');
  const suppress = staticCommand('setup.suppress.state.subject', 'STATE_SUPPRESS', { context_id: '$CONTEXT_ID', state_id: 'state.common.subject' });
  const fact = factCommand();
  const deleteAssertion = {
    step_id: 'setup.assert.delete.state.subject',
    step_kind: 'CAPABILITY_ASSERTION',
    candidate_request: { intent: 'DELETE_CONSTRUCT', selection_id: 'state.common.subject', endpoints: [] },
    option_selector: {
      command_type: 'DELETE_CONSTRUCT', capability_id: 'CAP-STATE-001', target_ids: ['state.common.subject'],
      enabled: true, requires_impact_token: true
    },
    assertion: { impact_token_min_length: 16 }
  };
  const definitions = {
    M0: baseline([], [], [], 3, 'MATERIALIZED_BASE_REVISION'),
    M_OBJECT: baseline([owner], ['object.common.owner'], [], 4),
    M_STATE: baseline([owner, ownerState], ['object.common.owner', 'state.common.subject'], [], 6),
    M_STATE_SUPPRESSED: baseline([owner, ownerState, suppress], ['object.common.owner', 'state.common.subject'], [], 7),
    M_OBJECT_PROCESS: baseline([input, process], ['object.common.input', 'process.common.action'], [], 5),
    M_STATE_OBJECT_PROCESS: baseline([input, process, inputState], ['object.common.input', 'process.common.action', 'state.common.subject'], [], 7),
    M_FACT: baseline([input, process, fact], ['object.common.input', 'process.common.action', 'fact.common.subject'], ['fact.common.subject'], 7),
    M_DELETABLE_STATE: baseline([owner, ownerState, deleteAssertion], ['object.common.owner', 'state.common.subject'], [], 7),
    M_READONLY_TARGET: baseline([input, process], ['object.common.input', 'process.common.action'], [], 5)
  };
  const value = definitions[initialState];
  if (!value) invalid(`Unknown Common initial state: ${initialState}`);
  return value;
}

function baseline(setupSteps, constructIds, factIds, minimumApiExchangeCount, subjectBaselineSource = 'LAST_COMMITTED_REVISION') {
  return {
    setup_steps: setupSteps,
    expected_baseline: {
      construct_ids: constructIds,
      fact_ids: factIds,
      minimum_api_exchange_count: minimumApiExchangeCount,
      subject_baseline_source: subjectBaselineSource
    }
  };
}

function element(kind, elementId, name, x, y) {
  return { kind, element_id: elementId, name, layout: { x, y } };
}

function staticCommand(stepId, commandType, payloadTemplate) {
  return {
    step_id: stepId,
    step_kind: 'STATIC_COMMAND',
    command_type: commandType,
    payload_template: payloadTemplate,
    payload_sha256: sha256Jcs(payloadTemplate)
  };
}

function stateCommand(stepId, ownerId) {
  const payloadTemplate = {
    context_id: '$CONTEXT_ID',
    state_id: 'state.common.subject',
    owner_ref: { target_kind: 'ELEMENT', target_id: ownerId },
    capability_ref: { capability_id: 'CAP-STATE-001' },
    name_or_value: 'Ready',
    state_roles: ['INITIAL'],
    occurrence: { ownership: 'OWNED', construct_role: 'STATE_NODE' },
    layout: { x: 80, y: 220 }
  };
  return {
    step_id: stepId,
    step_kind: 'CANDIDATE_COMMAND',
    candidate_request: { intent: 'CREATE_STATE', selection_id: ownerId, endpoints: [] },
    option_selector: {
      command_type: 'CREATE_STATE', capability_id: 'CAP-STATE-001', target_ids: [ownerId],
      enabled: true, owner_target_kind: 'ELEMENT'
    },
    command_type: 'CREATE_STATE',
    payload_template: payloadTemplate,
    payload_sha256: sha256Jcs(payloadTemplate)
  };
}

function factCommand() {
  const payloadTemplate = {
    context_id: '$CONTEXT_ID',
    fact_id: 'fact.common.subject',
    capability_ref: { capability_id: 'CAP-ISO-PROC-001' },
    fact_family: 'TRANSFORMATION',
    normalized_endpoints: [
      { role: 'CONSUMED_OBJECT', target_ref: { target_kind: 'ELEMENT', target_id: 'object.common.input' }, ordinal: 0 },
      { role: 'CONSUMING_PROCESS', target_ref: { target_kind: 'ELEMENT', target_id: 'process.common.action' }, ordinal: 1 }
    ],
    direction: 'DIRECTED',
    labels: [],
    modifiers: [],
    logical_groups: [],
    occurrence: { ownership: 'OWNED', construct_role: 'PROCEDURAL_LINK' },
    layout: { x: 260, y: 168 }
  };
  return {
    step_id: 'setup.create.fact.subject',
    step_kind: 'CANDIDATE_COMMAND',
    candidate_request: { intent: 'CREATE_FACT', selection_id: null, endpoints: ['object.common.input', 'process.common.action'] },
    option_selector: {
      command_type: 'CREATE_FACT', capability_id: 'CAP-ISO-PROC-001',
      target_ids: ['object.common.input', 'process.common.action'], enabled: true, fact_family: 'TRANSFORMATION'
    },
    command_type: 'CREATE_FACT',
    payload_template: payloadTemplate,
    payload_sha256: sha256Jcs(payloadTemplate)
  };
}

function assertCatalogOrder(catalogCases) {
  const actual = catalogCases?.map(item => item?.case_id);
  const expected = CASE_STATES.map(([caseId]) => caseId);
  if (!isDeepStrictEqual(actual, expected)) mismatch('Common Fixture Catalog case order differs from the frozen Plan order.');
}

function assertGeneratedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(value)
      || Number.isNaN(Date.parse(value))) invalid('Plan generated_at must be a UTC whole-second timestamp.');
}

function assertBinding(value) {
  const keys = ['profile', 'rule_set', 'text_grammar', 'symbol_catalog', 'normalization_adapter', 'binding_digest'];
  if (!plainObject(value) || !isDeepStrictEqual(Object.keys(value), keys)
      || !/^[a-f0-9]{64}$/.test(value.binding_digest)
      || keys.slice(0, -1).some(key => !plainObject(value[key]) || typeof value[key].id !== 'string'
        || typeof value[key].version !== 'string' || !/^[a-f0-9]{64}$/.test(value[key].sha256))) {
    invalid('Plan source binding is invalid.');
  }
}

function assertRef(value, kind, path) {
  if (!plainObject(value) || !isDeepStrictEqual(Object.keys(value), ['kind', 'path', 'byte_length', 'sha256'])
      || value.kind !== kind || value.path !== path || !Number.isSafeInteger(value.byte_length) || value.byte_length < 0
      || !/^[a-f0-9]{64}$/.test(value.sha256)) mismatch(`Invalid ${kind} reference.`);
}

function assertRebasedRef(source, target, name) {
  if (!source || source.kind !== target.kind || source.byte_length !== target.byte_length || source.sha256 !== target.sha256) {
    mismatch(`${name} raw identity differs after path rebasing.`);
  }
}

function sha256Jcs(value) {
  return createHash('sha256').update(Buffer.from(canonicalizeJcs(value), 'utf8')).digest('hex');
}

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function invalid(message) {
  throw new CommonSetupPlanError('E2E_COMMON_SETUP_PLAN_INVALID', message, 2);
}

function mismatch(message) {
  throw new CommonSetupPlanError('E2E_COMMON_SETUP_PLAN_REF_MISMATCH', message, 3);
}
