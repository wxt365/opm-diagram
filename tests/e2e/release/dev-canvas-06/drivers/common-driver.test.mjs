import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMON_CASES, COMMON_DRIVER_ID, COMMON_DRIVER_VERSION, executeCase } from './common-driver.mjs';

const CASE_IDS = [
  'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION',
  'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP',
  'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED',
  'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED',
  'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED',
  'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT',
  'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY'
];

test('Common Driver 固定导出16项同序映射、版本与7/9事务闭包', () => {
  assert.equal(COMMON_DRIVER_ID, 'DRIVER-COMMON');
  assert.equal(COMMON_DRIVER_VERSION, '0.2.0');
  assert.deepEqual(Object.keys(COMMON_CASES), CASE_IDS);
  assert.equal(Object.values(COMMON_CASES).filter(value => value.expected_transaction === 'TX_COMMIT_1').length, 7);
  assert.equal(Object.values(COMMON_CASES).filter(value => value.expected_transaction === 'TX_NO_COMMIT').length, 9);
  assert.deepEqual(COMMON_CASES['E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED'].expected_apis, [
    { operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null },
    { operation_id: 'API-EDT-002', method: 'POST', ordinal: 1, expected_http_status: 200, expected_error_code: null }
  ]);
  assert.equal(Object.hasOwn(COMMON_CASES['E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED'].expected_apis[0], 'expected_error_code'), true);
  assert.equal(COMMON_CASES['E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED'].expected_apis[0].expected_error_code, null);
});

test('Common Driver 映射递归冻结且不能被改写', () => {
  assert.equal(Object.isFrozen(COMMON_CASES), true);
  assert.equal(Object.isFrozen(COMMON_CASES['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES']), true);
  assert.equal(Object.isFrozen(COMMON_CASES['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES'].subject_steps), true);
  assert.equal(Object.isFrozen(COMMON_CASES['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES'].subject_steps[0]), true);
  assert.throws(() => { COMMON_CASES['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES'].subject_steps[0].target_id = 'changed'; }, TypeError);
});

test('executeCase 仅使用稳定定位器、观测sink和封闭precondition client', async () => {
  const page = fakePage();
  const apiCalls = [];
  const preconditions = [];
  const evidence = [];
  await executeCase({
    page,
    case_entry: entry('E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED'),
    attempt_identity: { case_id: 'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', attempt_ordinal: 1 },
    observation_sink: {
      waitForApi: async expected => { apiCalls.push(expected); },
      waitForProjectionRefresh: async () => { apiCalls.push('projection'); },
      recordPrecondition: async receipt => { evidence.push(receipt); }
    },
    precondition_client: {
      execute: async value => {
        preconditions.push(value);
        return armedReceipt('REPLACE_IMPACT_TOKEN', '/payload/impact_token', 'impact.e2e.mismatched.token');
      }
    }
  });

  assert.deepEqual(page.events, [
    'locator:[data-cell-id="state\\2e common\\2e subject"]:click', 'test:p03-state-delete-impact:click', 'role:button:删除 State:click'
  ]);
  assert.equal(preconditions.length, 1);
  assert.equal(preconditions[0].kind, 'REPLACE_IMPACT_TOKEN');
  assert.deepEqual(apiCalls, [
    { operation_id: 'API-EDT-002', method: 'POST', ordinal: 1, expected_http_status: 422, expected_error_code: 'DOMAIN_REJECTED' }, 'projection'
  ]);
  assert.equal(evidence.length, 1);
});

test('executeCase 接纳DIRECT完整receipt且拒绝ARMED占位HTTP字段', async () => {
  const evidence = [];
  await executeCase({
    page: fakePage(),
    case_entry: entry('E2E-CANVAS-007.TEXT_BLOCKED'),
    attempt_identity: { case_id: 'E2E-CANVAS-007.TEXT_BLOCKED', attempt_ordinal: 1 },
    observation_sink: { waitForApi: async () => {}, waitForProjectionRefresh: async () => {}, recordPrecondition: async value => { evidence.push(value); } },
    precondition_client: { execute: async () => directReceipt('SUBMIT_TEXT_BLOCKED_COMMAND') }
  });
  assert.equal(evidence[0].mode, 'DIRECT_COMMAND');

  await assert.rejects(() => executeCase({
    page: fakePage(),
    case_entry: entry('E2E-CANVAS-005.STALE_OPTION_BLOCKED'),
    attempt_identity: { case_id: 'E2E-CANVAS-005.STALE_OPTION_BLOCKED', attempt_ordinal: 1 },
    observation_sink: { waitForApi: async () => {}, waitForProjectionRefresh: async () => {}, recordPrecondition: async () => {} },
    precondition_client: { execute: async () => Object.freeze({ ...armedReceipt('REPLACE_OPTION_ID', '/payload/selected_option_id', 'option.e2e.invalid.stale'), response: {} }) }
  }), error => error.code === 'E2E_DRIVER_MAPPING_INVALID');
});

test('executeCase 使用State inspector和candidate的精确角色定位', async () => {
  const statePage = fakePage();
  await executeCase({ page: statePage, case_entry: entry('E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES'), attempt_identity: { id: 'a' }, observation_sink: sink(), precondition_client: client() });
  assert.ok(statePage.events.includes('test:p03-state-inspector:role:checkbox:INITIAL:set:false'));
  assert.ok(statePage.events.includes('test:p03-state-inspector:role:checkbox:DEFAULT:set:true'));

  const candidatePage = fakePage();
  await executeCase({ page: candidatePage, case_entry: entry('E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN'), attempt_identity: { id: 'b' }, observation_sink: sink(), precondition_client: client() });
  assert.ok(candidatePage.events.includes('test:p03-state-candidate:role:checkbox:INITIAL:set:true'));
});

test('executeCase 拒绝错误Manifest事务、错误码和不完整precondition证据', async () => {
  const base = { page: fakePage(), attempt_identity: { id: 'a' }, observation_sink: sink(), precondition_client: client() };
  await assert.rejects(() => executeCase({ ...base, case_entry: { ...entry('E2E-CANVAS-007.READONLY'), action: { ...entry('E2E-CANVAS-007.READONLY').action, expected_error_code: 'DOMAIN_REJECTED' } } }), error => error.code === 'E2E_DRIVER_MAPPING_INVALID');
  await assert.rejects(() => executeCase({ ...base, case_entry: { case_id: 'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', expected_transaction: 'TX_NO_COMMIT' } }), error => error.code === 'E2E_DRIVER_MAPPING_INVALID');
  await assert.rejects(() => executeCase({
    ...base,
    case_entry: entry('E2E-CANVAS-007.TEXT_BLOCKED'),
    precondition_client: { execute: async () => ({ raw_request: {}, actual_request: {} }) }
  }), error => error.code === 'E2E_DRIVER_MAPPING_INVALID');
});

function entry(caseId) {
  const value = COMMON_CASES[caseId];
  const expectedError = value.expected_apis.at(-1).expected_error_code;
  return {
    case_id: caseId,
    action: {
      expected_status: value.expected_transaction === 'TX_COMMIT_1' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED',
      expected_transaction: value.expected_transaction,
      ...(expectedError === null ? {} : { expected_error_code: expectedError })
    }
  };
}

function sink() { return { waitForApi: async () => {}, waitForProjectionRefresh: async () => {} }; }
function client() { return { execute: async () => ({ raw_request: {}, actual_request: {}, response: {} }) }; }

function armedReceipt(kind, jsonPointer, replacement) {
  return deepFreeze({
    mode: 'REQUEST_MUTATION', kind, source_locator: 'setup-baseline-api',
    source_exchange_ref: ref('API_EXCHANGE', 'api-exchanges/source.json'),
    match: { operation_id: 'API-EDT-002', method: 'POST', normalized_url: '/api/v1/projects/project/models/model/contexts/context/commands', command_type: kind === 'REPLACE_OPTION_ID' ? 'CREATE_FACT' : 'DELETE_CONSTRUCT', base_revision: 'revision.base' },
    json_pointer: jsonPointer, replacement, state: 'ARMED'
  });
}

function directReceipt(kind) {
  return deepFreeze({
    mode: 'DIRECT_COMMAND', kind, source_locator: 'setup-baseline-api',
    resolved_source_refs: {
      setup_projection_exchange_ref: ref('API_EXCHANGE', 'api-exchanges/setup.json'),
      setup_projection_response_ref: ref('API_RESPONSE_BODY', 'api-exchanges/setup.response.json')
    },
    raw_request: { body: {} }, actual_request: { body: {} }, response: { status: 422 },
    exchange_ref: ref('API_EXCHANGE', 'api-exchanges/direct.json'), baseline_rebind: null
  });
}

function ref(kind, path) { return Object.freeze({ kind, path, byte_length: 2, sha256: 'a'.repeat(64) }); }

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fakePage() {
  const events = [];
  const locator = label => ({
    count: async () => 1,
    isVisible: async () => true,
    click: async () => { events.push(`${label}:click`); },
    fill: async value => { events.push(`${label}:fill:${value}`); },
    press: async value => { events.push(`${label}:press:${value}`); },
    setChecked: async value => { events.push(`${label}:set:${value}`); },
    getByRole: (role, options) => locator(`${label}:role:${role}:${options.name}`)
  });
  return {
    events,
    getByTestId: id => locator(`test:${id}`),
    locator: selector => locator(`locator:${selector}`),
    getByRole: (role, options) => locator(`role:${role}:${options.name}`)
  };
}
