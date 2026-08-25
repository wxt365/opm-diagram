export const COMMON_DRIVER_ID = 'DRIVER-COMMON';
export const COMMON_DRIVER_VERSION = '0.2.0';

const PRECONDITION_SOURCE = 'setup-baseline-api';
const CASE_IDS = [
  'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES',
  'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION',
  'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN',
  'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP',
  'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED',
  'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED',
  'E2E-CANVAS-005.STALE_OPTION_BLOCKED',
  'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED',
  'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED',
  'E2E-CANVAS-006.STALE_TOKEN_BLOCKED',
  'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED',
  'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.TEXT_BLOCKED',
  'E2E-CANVAS-007.REVISION_CONFLICT',
  'E2E-CANVAS-007.PERSISTENCE_FAILED',
  'E2E-CANVAS-007.READONLY'
];

const api = (operation_id, method, expected_http_status, expected_error_code = null, ordinal = 1) => ({ operation_id, method, ordinal, expected_http_status, expected_error_code });
const cell = target_id => ({ type: 'CLICK_CELL', target_id });
const testId = test_id => ({ type: 'CLICK_TEST_ID', test_id });
const fill = (test_id, value) => ({ type: 'FILL_TEST_ID', test_id, value });
const role = (roleName, checked) => ({ type: 'SET_ROLE', role: roleName, checked });
const button = name => ({ type: 'CLICK_ROLE', role: 'button', name });
const wait = (operation_id, method, ordinal = 1) => ({ type: 'WAIT_API', operation_id, method, ordinal });
const precondition = kind => ({ type: 'PRECONDITION_API', kind, source_observation_ref: PRECONDITION_SOURCE });
const definition = (initial_state, subject_steps, expected_apis, expected_transaction, reopen_assertion) => ({
  case_id: null,
  initial_state,
  setup_steps: [],
  subject_steps,
  expected_apis,
  expected_transaction,
  reopen_assertion
});

const commonCases = {
  'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES': definition('M_STATE', [
    cell('state.common.subject'), fill('p03-state-inspector-name', 'ready'), role('INITIAL', false), role('DEFAULT', true), role('FINAL', true), button('保存 State'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION': definition('M_STATE_SUPPRESSED', [
    cell('state.common.subject'), button('显式'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN': definition('M_OBJECT', [
    cell('object.common.owner'), testId('p03-tool-state'), cell('object.common.owner'), fill('p03-state-name', 'mobile-ready'), role('INITIAL', true), button('创建'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP': definition('M_STATE_OBJECT_PROCESS', [
    cell('state.common.subject'), testId('p03-tool-consumption'), wait('API-EDT-002', 'POST'), testId('p03-tab-text'), testId('p03-opl-sentence')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED': definition('M_OBJECT_PROCESS', [
    cell('process.common.action'), testId('p03-tool-procedural-relation'), cell('object.common.input'), testId('p03-relation-resolve'), wait('API-EDT-001', 'GET'), testId('p03-relation-option-CAP-ISO-PROC-002'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-001', 'GET', 200), api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED': definition('M_OBJECT_PROCESS', [
    cell('object.common.input'), testId('p03-tool-procedural-relation'), cell('process.common.action'), testId('p03-relation-resolve'), wait('API-EDT-001', 'GET')
  ], [api('API-EDT-001', 'GET', 200)], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-005.STALE_OPTION_BLOCKED': definition('M_OBJECT_PROCESS', [
    cell('object.common.input'), testId('p03-tool-procedural-relation'), cell('process.common.action'), testId('p03-relation-resolve'), precondition('REPLACE_OPTION_ID'), testId('p03-relation-option-CAP-ISO-PROC-001'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 422, 'DOMAIN_REJECTED')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED': definition('M_DELETABLE_STATE', [
    cell('state.common.subject'), testId('p03-state-delete-impact'), button('删除 State'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED': definition('M_FACT', [
    cell('fact.common.subject'), testId('p03-fact-delete-impact'), button('删除关系'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 200)], 'TX_COMMIT_1', 'REOPEN_COMMITTED'),
  'E2E-CANVAS-006.STALE_TOKEN_BLOCKED': definition('M_DELETABLE_STATE', [
    cell('state.common.subject'), testId('p03-state-delete-impact'), precondition('ADVANCE_HEAD'), button('删除 State'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 409, 'REVISION_CONFLICT')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED': definition('M_DELETABLE_STATE', [
    cell('state.common.subject'), testId('p03-state-delete-impact'), precondition('REPLACE_IMPACT_TOKEN'), button('删除 State'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 422, 'DOMAIN_REJECTED')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-007.ASSET_MISSING': definition('M_OBJECT_PROCESS', [
    cell('object.common.input'), testId('p03-tool-consumption'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 422, 'TEXT_GENERATION_BLOCKED')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-007.TEXT_BLOCKED': definition('M_OBJECT_PROCESS', [
    precondition('SUBMIT_TEXT_BLOCKED_COMMAND'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 422, 'DOMAIN_REJECTED')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-007.REVISION_CONFLICT': definition('M_OBJECT_PROCESS', [
    precondition('ADVANCE_HEAD'), cell('object.common.input'), testId('p03-tool-consumption'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 409, 'REVISION_CONFLICT')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-007.PERSISTENCE_FAILED': definition('M_OBJECT_PROCESS', [
    cell('object.common.input'), testId('p03-tool-consumption'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 500, 'PERSISTENCE_FAILED')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED'),
  'E2E-CANVAS-007.READONLY': definition('M_READONLY_TARGET', [
    precondition('SUBMIT_READONLY_COMMAND'), wait('API-EDT-002', 'POST')
  ], [api('API-EDT-002', 'POST', 409, 'READ_ONLY_REVISION')], 'TX_NO_COMMIT', 'REOPEN_UNCHANGED')
};

for (const [caseId, commonCase] of Object.entries(commonCases)) commonCase.case_id = caseId;
export const COMMON_CASES = deepFreeze(commonCases);

validateDefinitions(COMMON_CASES);

export async function executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const caseId = case_entry?.case_id;
  const commonCase = COMMON_CASES[caseId];
  if (!commonCase) fail('Unknown Common case.');
  validateCaseEntry(case_entry, commonCase);
  if (!page || !attempt_identity || !observation_sink?.waitForApi || !observation_sink?.waitForProjectionRefresh || !precondition_client?.execute) {
    fail('Common Driver execution dependencies are incomplete.');
  }

  const usedPreconditions = new Set();
  for (const step of commonCase.subject_steps) {
    if (step.type === 'CLICK_TEST_ID') await click(locatorByTestId(page, step.test_id));
    else if (step.type === 'CLICK_CELL') await click(locatorByCell(page, step.target_id));
    else if (step.type === 'FILL_TEST_ID') await fillLocator(locatorByTestId(page, step.test_id), step.value);
    else if (step.type === 'SET_ROLE') await setRole(page, caseId, step);
    else if (step.type === 'SUBMIT_TEST_ID') await submit(locatorByTestId(page, step.test_id));
    else if (step.type === 'CLICK_ROLE') await click(locatorByRole(page, step.role, step.name));
    else if (step.type === 'WAIT_API') await waitForApi(observation_sink, step, commonCase.expected_apis);
    else if (step.type === 'PRECONDITION_API') await executePrecondition({ step, caseId, attempt_identity, precondition_client, observation_sink, usedPreconditions, expected_apis: commonCase.expected_apis });
    else fail('Common Driver step is invalid.');
  }
}

async function executePrecondition({ step, caseId, attempt_identity, precondition_client, observation_sink, usedPreconditions, expected_apis }) {
  if (usedPreconditions.has(step.kind)) fail('A Common Driver precondition may run only once per case.');
  usedPreconditions.add(step.kind);
  const receipt = await precondition_client.execute({ case_id: caseId, attempt_identity, ...step, expected_apis });
  if (!receipt?.raw_request || !receipt?.actual_request || !receipt?.response) fail('Precondition evidence is incomplete.');
  if (typeof observation_sink.recordPrecondition === 'function') await observation_sink.recordPrecondition(receipt);
}

async function waitForApi(observation_sink, step, expectedApis) {
  const expected = expectedApis.find(value => value.operation_id === step.operation_id && value.method === step.method && value.ordinal === step.ordinal);
  if (!expected) fail('WAIT_API differs from the frozen API expectation.');
  await observation_sink.waitForApi(expected);
  await observation_sink.waitForProjectionRefresh();
}

function locatorByTestId(page, testId) {
  if (typeof page.getByTestId !== 'function') fail('Playwright test-id locator is unavailable.');
  return page.getByTestId(testId);
}

function locatorByCell(page, targetId) {
  if (typeof page.locator !== 'function') fail('Playwright cell locator is unavailable.');
  return page.locator(`[data-cell-id="${cssEscape(targetId)}"]`);
}

function locatorByRole(page, roleName, name) {
  if (typeof page.getByRole !== 'function') fail('Playwright role locator is unavailable.');
  return page.getByRole(roleName, { name, exact: true });
}

async function setRole(page, caseId, step) {
  const rootId = caseId === 'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN' ? 'p03-state-candidate' : 'p03-state-inspector';
  const root = locatorByTestId(page, rootId);
  await assertUniqueVisible(root);
  if (typeof root.getByRole !== 'function') fail('Playwright nested role locator is unavailable.');
  const checkbox = root.getByRole('checkbox', { name: step.role, exact: true });
  await assertUniqueVisible(checkbox);
  if (typeof checkbox.setChecked !== 'function') fail('Playwright checkbox setter is unavailable.');
  await checkbox.setChecked(step.checked);
}

async function click(locator) {
  await assertUniqueVisible(locator);
  if (typeof locator.click !== 'function') fail('Playwright click is unavailable.');
  await locator.click();
}

async function fillLocator(locator, value) {
  await assertUniqueVisible(locator);
  if (typeof locator.fill !== 'function') fail('Playwright fill is unavailable.');
  await locator.fill(value);
}

async function submit(locator) {
  await assertUniqueVisible(locator);
  if (typeof locator.press !== 'function') fail('Playwright submit is unavailable.');
  await locator.press('Enter');
}

async function assertUniqueVisible(locator) {
  if (typeof locator.count !== 'function' || typeof locator.isVisible !== 'function') fail('Playwright locator lacks uniqueness methods.');
  if (await locator.count() !== 1 || !await locator.isVisible()) fail('Common Driver selector is not uniquely visible.');
}

function validateDefinitions(cases) {
  if (Object.keys(cases).length !== CASE_IDS.length || Object.keys(cases).some((value, index) => value !== CASE_IDS[index])) fail('Common case order differs from the frozen mapping.');
  let pass = 0;
  let blocked = 0;
  for (const [caseId, commonCase] of Object.entries(cases)) {
    assertCaseShape(caseId, commonCase);
    if (commonCase.expected_transaction === 'TX_COMMIT_1') pass += 1;
    else blocked += 1;
  }
  if (pass !== 7 || blocked !== 9) fail('Common case transaction split must be 7 PASS and 9 BLOCKED.');
}

function assertCaseShape(caseId, commonCase) {
  const keys = ['case_id', 'initial_state', 'setup_steps', 'subject_steps', 'expected_apis', 'expected_transaction', 'reopen_assertion'];
  if (!plainObject(commonCase) || !sameKeys(commonCase, keys) || !Object.isFrozen(commonCase)
      || commonCase.case_id !== caseId
      || !Array.isArray(commonCase.setup_steps) || commonCase.setup_steps.length !== 0 || !Array.isArray(commonCase.subject_steps)
      || !Array.isArray(commonCase.expected_apis) || !['TX_COMMIT_1', 'TX_NO_COMMIT'].includes(commonCase.expected_transaction)
      || !['REOPEN_COMMITTED', 'REOPEN_UNCHANGED'].includes(commonCase.reopen_assertion)) fail(`Common case ${caseId} has an invalid shape.`);
  if (commonCase.expected_apis.length < 1 || commonCase.expected_apis.length > 2) fail(`Common case ${caseId} has an invalid API count.`);
  const waits = commonCase.subject_steps.filter(step => step.type === 'WAIT_API');
  if (waits.length !== commonCase.expected_apis.length) fail(`Common case ${caseId} API waits differ from expectations.`);
  for (const [index, step] of commonCase.subject_steps.entries()) {
    if (!plainObject(step) || !Object.isFrozen(step)) fail(`Common case ${caseId} step ${index} is mutable.`);
    validateStep(caseId, step);
  }
  for (const [index, expectation] of commonCase.expected_apis.entries()) {
    if (!plainObject(expectation) || !Object.isFrozen(expectation) || !sameKeys(expectation, ['operation_id', 'method', 'ordinal', 'expected_http_status', 'expected_error_code'])
        || !sameApi(waits[index], expectation)) fail(`Common case ${caseId} API expectation ${index} is invalid.`);
  }
}

function validateStep(caseId, step) {
  const shapes = {
    CLICK_TEST_ID: ['type', 'test_id'], CLICK_CELL: ['type', 'target_id'], FILL_TEST_ID: ['type', 'test_id', 'value'],
    SET_ROLE: ['type', 'role', 'checked'], SUBMIT_TEST_ID: ['type', 'test_id'], CLICK_ROLE: ['type', 'role', 'name'],
    WAIT_API: ['type', 'operation_id', 'method', 'ordinal'], PRECONDITION_API: ['type', 'kind', 'source_observation_ref']
  };
  if (!Object.hasOwn(shapes, step.type) || !sameKeys(step, shapes[step.type])) fail(`Common case ${caseId} contains an invalid step.`);
  if (step.type === 'SET_ROLE' && (!['INITIAL', 'DEFAULT', 'FINAL'].includes(step.role) || typeof step.checked !== 'boolean')) fail(`Common case ${caseId} has an invalid role step.`);
  if (step.type === 'CLICK_ROLE' && (!['button', 'checkbox', 'tab'].includes(step.role) || !nonEmptyString(step.name))) fail(`Common case ${caseId} has an invalid role selector.`);
  if (step.type === 'WAIT_API' && (!['API-EDT-001', 'API-EDT-002'].includes(step.operation_id) || !['GET', 'POST'].includes(step.method) || step.ordinal !== 1)) fail(`Common case ${caseId} has an invalid API wait.`);
  if (step.type === 'PRECONDITION_API' && (!['ADVANCE_HEAD', 'REPLACE_OPTION_ID', 'REPLACE_IMPACT_TOKEN', 'SUBMIT_TEXT_BLOCKED_COMMAND', 'SUBMIT_READONLY_COMMAND'].includes(step.kind) || step.source_observation_ref !== PRECONDITION_SOURCE)) fail(`Common case ${caseId} has an invalid precondition.`);
  if (['CLICK_TEST_ID', 'SUBMIT_TEST_ID'].includes(step.type) && !nonEmptyString(step.test_id)) fail(`Common case ${caseId} has an empty test id.`);
  if (step.type === 'CLICK_CELL' && !nonEmptyString(step.target_id)) fail(`Common case ${caseId} has an empty cell id.`);
  if (step.type === 'FILL_TEST_ID' && (!nonEmptyString(step.test_id) || typeof step.value !== 'string')) fail(`Common case ${caseId} has an invalid fill step.`);
}

function validateCaseEntry(entry, commonCase) {
  if (!plainObject(entry) || !nonEmptyString(entry.case_id)) fail('Common case entry is invalid.');
  if (entry.case_id !== commonCase.case_id) fail('Common case entry differs from the frozen mapping.');
  if (entry.expected_transaction && entry.expected_transaction !== commonCase.expected_transaction) fail('Manifest transaction differs from the frozen mapping.');
  if (Array.isArray(entry.expected_apis) && JSON.stringify(entry.expected_apis) !== JSON.stringify(commonCase.expected_apis)) fail('Manifest API expectation differs from the frozen mapping.');
  const action = entry.action;
  if (action !== undefined) {
    if (!plainObject(action)) fail('Common case action is invalid.');
    const expectedStatus = commonCase.expected_transaction === 'TX_COMMIT_1' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    const expectedError = commonCase.expected_apis.at(-1).expected_error_code;
    if (action.expected_status !== expectedStatus || action.expected_transaction !== commonCase.expected_transaction) fail('Manifest action differs from the frozen mapping.');
    if (expectedError === null ? Object.hasOwn(action, 'expected_error_code') : action.expected_error_code !== expectedError) fail('Manifest error code differs from the frozen mapping.');
  }
}

function sameApi(waitStep, expectation) {
  return waitStep.operation_id === expectation.operation_id && waitStep.method === expectation.method && waitStep.ordinal === expectation.ordinal
    && ['API-EDT-001', 'API-EDT-002'].includes(expectation.operation_id) && ['GET', 'POST'].includes(expectation.method)
    && [200, 409, 422, 500].includes(expectation.expected_http_status)
    && [null, 'DOMAIN_REJECTED', 'REVISION_CONFLICT', 'TEXT_GENERATION_BLOCKED', 'PERSISTENCE_FAILED', 'READ_ONLY_REVISION'].includes(expectation.expected_error_code);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sameKeys(value, keys) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function nonEmptyString(value) { return typeof value === 'string' && value.length > 0; }
function cssEscape(value) { return value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character.codePointAt(0).toString(16)} `); }
function fail(message) { const error = new Error(message); error.code = 'E2E_DRIVER_MAPPING_INVALID'; error.exitCode = 3; throw error; }
