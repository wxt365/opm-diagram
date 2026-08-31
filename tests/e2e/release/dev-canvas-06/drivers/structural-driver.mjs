export const driver = Object.freeze({
  driver_id: 'DRIVER-STRUCTURAL', driver_version: '0.1.0', family: 'STRUCT', suite_id: 'E2E-CANVAS-004',
  capability_prefix: 'CAP-ISO-STRUCT-', expected_case_count: 110
});

const group = (capability, variants) => variants.map(variant => `G-OPL-STRUCT-${capability}.${variant}`);
export const case_ids = Object.freeze([
  ...group('001', ['UNIDIRECTIONAL_OBJECT_TAGGED.PASS', 'UNIDIRECTIONAL_PROCESS_TAGGED.PASS']),
  ...group('002', ['UNIDIRECTIONAL_OBJECT_NULL_TAG.PASS', 'UNIDIRECTIONAL_PROCESS_NULL_TAG.PASS']),
  ...group('003', ['BIDIRECTIONAL_OBJECT_TAGGED.PASS', 'BIDIRECTIONAL_PROCESS_TAGGED.PASS']),
  ...group('004', ['RECIPROCAL_OBJECT_TAGGED.PASS', 'RECIPROCAL_OBJECT_NULL_TAG.PASS', 'RECIPROCAL_PROCESS_TAGGED.PASS', 'RECIPROCAL_PROCESS_NULL_TAG.PASS']),
  ...group('005', ['AGGREGATION_OBJECT_FAN_1_COMPLETE.PASS', 'AGGREGATION_OBJECT_FAN_1_INCOMPLETE.PASS', 'AGGREGATION_OBJECT_FAN_2_COMPLETE.PASS', 'AGGREGATION_OBJECT_FAN_2_INCOMPLETE.PASS', 'AGGREGATION_OBJECT_FAN_3_COMPLETE.PASS', 'AGGREGATION_OBJECT_FAN_3_INCOMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_1_COMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_1_INCOMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_2_COMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_2_INCOMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_3_COMPLETE.PASS', 'AGGREGATION_PROCESS_FAN_3_INCOMPLETE.PASS']),
  ...group('006', ['CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_1_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_1_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_2_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_2_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_3_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_ATTRIBUTE_FAN_3_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_1_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_1_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_2_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_2_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_3_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_OPERATOR_FAN_3_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_1_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_1_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_2_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_2_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_3_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_ATTRIBUTE_FAN_3_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_1_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_1_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_2_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_2_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_3_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_OPERATOR_FAN_3_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A1_O1_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A1_O1_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A1_O2_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A1_O2_INCOMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A2_O1_COMPLETE.PASS', 'CHARACTERIZATION_OBJECT_MIXED_A2_O1_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A1_O1_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A1_O1_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A1_O2_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A1_O2_INCOMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A2_O1_COMPLETE.PASS', 'CHARACTERIZATION_PROCESS_MIXED_A2_O1_INCOMPLETE.PASS', 'EXHIBITION_OBJECT_ATTRIBUTE_IMPORT.PASS', 'EXHIBITION_PROCESS_OPERATOR_IMPORT.PASS']),
  ...group('007', ['GENERALIZATION_OBJECT_FAN_1_COMPLETE.PASS', 'GENERALIZATION_OBJECT_FAN_1_INCOMPLETE.PASS', 'GENERALIZATION_OBJECT_FAN_2_COMPLETE.PASS', 'GENERALIZATION_OBJECT_FAN_2_INCOMPLETE.PASS', 'GENERALIZATION_OBJECT_FAN_3_COMPLETE.PASS', 'GENERALIZATION_OBJECT_FAN_3_INCOMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_1_COMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_1_INCOMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_2_COMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_2_INCOMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_3_COMPLETE.PASS', 'GENERALIZATION_PROCESS_FAN_3_INCOMPLETE.PASS']),
  ...group('008', ['CLASSIFICATION_OBJECT_FAN_1.PASS', 'CLASSIFICATION_OBJECT_FAN_2.PASS', 'CLASSIFICATION_OBJECT_FAN_3.PASS', 'CLASSIFICATION_PROCESS_FAN_1.PASS', 'CLASSIFICATION_PROCESS_FAN_2.PASS', 'CLASSIFICATION_PROCESS_FAN_3.PASS']),
  ...group('009', ['CHARACTERIZATION_OBJECT_VALUE_STATE.PASS']),
  ...group('010', ['UNIDIRECTIONAL_SOURCE_STATE_TAGGED.PASS', 'UNIDIRECTIONAL_SOURCE_STATE_NULL_TAG.PASS', 'UNIDIRECTIONAL_DESTINATION_STATE_TAGGED.PASS', 'UNIDIRECTIONAL_DESTINATION_STATE_NULL_TAG.PASS', 'UNIDIRECTIONAL_BOTH_STATE_TAGGED.PASS', 'UNIDIRECTIONAL_BOTH_STATE_NULL_TAG.PASS', 'BIDIRECTIONAL_SOURCE_STATE_TAGGED.PASS', 'BIDIRECTIONAL_DESTINATION_STATE_TAGGED.PASS', 'BIDIRECTIONAL_BOTH_STATE_TAGGED.PASS', 'RECIPROCAL_SOURCE_STATE_TAGGED.PASS', 'RECIPROCAL_SOURCE_STATE_NULL_TAG.PASS', 'RECIPROCAL_DESTINATION_STATE_TAGGED.PASS', 'RECIPROCAL_DESTINATION_STATE_NULL_TAG.PASS', 'RECIPROCAL_BOTH_STATE_TAGGED.PASS', 'RECIPROCAL_BOTH_STATE_NULL_TAG.PASS']),
  ...group('001', ['CROSS_KIND_TAGGED.BLOCKED', 'FORWARD_TAG_MISSING.BLOCKED']),
  ...group('003', ['REVERSE_TAG_MISSING.BLOCKED']),
  ...group('005', ['FAN_EMPTY.BLOCKED', 'FAN_ORDINAL_DUPLICATE.BLOCKED']),
  ...group('006', ['FAN_ORDINAL_GAP.BLOCKED']),
  ...group('007', ['MULTIPLE_REFINEABLE.BLOCKED']),
  ...group('004', ['CROSS_KIND_RECIPROCAL.BLOCKED']),
  ...group('005', ['FAN_CROSS_KIND.BLOCKED']),
  ...group('006', ['FEATURE_KIND_INVALID.BLOCKED']),
  ...group('008', ['COMPLETENESS_INVALID.BLOCKED']),
  ...group('009', ['SOURCE_STATE_INVALID.BLOCKED', 'SOURCE_FEATURE_STATE_INVALID.BLOCKED', 'STATE_OWNER_MISMATCH.BLOCKED']),
  ...group('010', ['PROCESS_ENDPOINT_INVALID.BLOCKED', 'BIDIRECTIONAL_NULL_TAG.BLOCKED'])
]);

export async function executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const manifestCase = validateInvocation({ page, case_entry, attempt_identity, observation_sink, precondition_client });
  const fact = manifestCase.expectation === 'PASS' ? case_entry.input_fixture.facts[0] : case_entry.companion_pass_input_fixture.facts[0];
  const candidate = await createCandidate({ page, fact, capabilityId: case_entry.companion_pass_requirement.capability_id, observation_sink });
  if (manifestCase.expectation === 'PASS') {
    await click(page.getByTestId(`p03-relation-option-${manifestCase.capability_id}`));
    await fillStructuralForm({ page, fact: case_entry.input_fixture.facts[0] });
    await observation_sink.waitForApi(case_entry.expected_api);
    await observation_sink.waitForProjectionRefresh();
    return undefined;
  }
  const receipt = await precondition_client.execute(negativeCreateRequest({ case_entry, attempt_identity, candidate }));
  await observation_sink.recordPrecondition(receipt);
  return undefined;
}

function validateInvocation({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const manifestCase = case_entry?.manifest_case;
  if (!page || !deepFrozen(case_entry) || !deepFrozen(attempt_identity) || !case_ids.includes(manifestCase?.case_id)
      || manifestCase.driver_id !== driver.driver_id || attempt_identity.case_id !== manifestCase.case_id
      || ![1, 2].includes(attempt_identity.attempt_ordinal) || attempt_identity.setup_fact_id !== null || attempt_identity.setup_create_fact_exchange_ref !== null
      || attempt_identity.subject_baseline_revision !== attempt_identity.materialized_base_revision
      || precondition_client !== observation_sink?.precondition_client || typeof precondition_client?.execute !== 'function'
      || typeof observation_sink?.waitForApi !== 'function' || typeof observation_sink?.waitForProjectionRefresh !== 'function'
      || typeof observation_sink?.recordPrecondition !== 'function') fail('Structural Driver invocation is invalid.');
  return manifestCase;
}

async function createCandidate({ page, fact, capabilityId, observation_sink }) {
  const endpoints = exactEndpoints(fact);
  await click(cell(page, endpoints[0].target_id));
  await click(page.getByTestId('p03-tool-structural-relation'));
  for (const endpoint of endpoints.slice(1)) await click(cell(page, endpoint.target_id));
  await click(page.getByTestId('p03-relation-resolve'));
  const receipt = await observation_sink.waitForApi({ operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  const data = receipt?.response?.body?.data;
  const options = data?.options?.filter(option => option?.capability_ref?.capability_id === capabilityId) ?? [];
  if (!receipt?.raw_request || !receipt?.actual_request || receipt?.response?.status !== 200 || !receipt?.exchange_ref
      || typeof data?.capability_query_id !== 'string' || !data.capability_query_id || options.length !== 1
      || typeof options[0].option_id !== 'string' || !options[0].option_id) fail('Structural candidate receipt is invalid.');
  return Object.freeze({ capability_query_id: data.capability_query_id, selected_option_id: options[0].option_id, exchange_ref: receipt.exchange_ref });
}

async function fillStructuralForm({ page, fact }) {
  const form = page.getByTestId('p03-structural-candidate');
  await uniqueVisible(form);
  for (const label of fact.labels ?? []) {
    const input = page.getByTestId(`p03-structural-label-${label.slot_id}`);
    await uniqueVisible(input);
    await input.fill(label.text);
  }
  const direction = form.getByRole('combobox', { name: 'direction', exact: true });
  if (fact.direction !== 'DIRECTED') {
    await uniqueVisible(direction);
    if (await direction.inputValue() !== fact.direction) await direction.selectOption(fact.direction);
  }
  if (fact.collection_completeness && fact.collection_completeness !== 'NOT_APPLICABLE') {
    const completeness = page.getByTestId('p03-structural-completeness');
    await uniqueVisible(completeness);
    await completeness.selectOption(fact.collection_completeness);
  }
  await click(form.getByRole('button', { name: '创建', exact: true }));
}

function negativeCreateRequest({ case_entry, attempt_identity, candidate }) {
  const fact = case_entry.input_fixture.facts[0];
  return deepFreeze({
    case_id: case_entry.manifest_case.case_id,
    operation_id: 'API-EDT-002', method: 'POST', path: commandPath(attempt_identity),
    body: {
      request_id: `e2e.subject.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      command_id: `e2e.command.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      base_revision: attempt_identity.subject_baseline_revision,
      binding: bindingGuard(case_entry.input_fixture.profile_binding), command_type: 'CREATE_FACT',
      payload: {
        context_id: attempt_identity.context_id, capability_ref: capabilityRef(fact.capability_ref), fact_family: fact.fact_family,
        normalized_endpoints: subjectEndpoints(fact),
        direction: fact.direction, labels: fact.labels ?? [], modifiers: fact.modifiers ?? [],
        ...(fact.condition ? { condition: fact.condition } : {}), logical_groups: fact.logical_groups ?? [],
        ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {}),
        occurrence: { ownership: 'OWNED', construct_role: 'STRUCTURAL_LINK' }, layout: {},
        capability_query_id: candidate.capability_query_id, selected_option_id: candidate.selected_option_id
      }
    },
    candidate_exchange_ref: candidate.exchange_ref,
    expected_http_status: case_entry.expected_api.expected_http_status,
    expected_error_code: case_entry.expected_error.top_error_code
  });
}

function exactEndpoints(fact) {
  if (!Array.isArray(fact?.endpoints) || fact.endpoints.length < 2) fail('Structural Fact endpoints are invalid.');
  const values = [...fact.endpoints].sort((left, right) => left.ordinal - right.ordinal);
  if (values.some((value, index) => value.ordinal !== index || typeof value.target_id !== 'string')) fail('Structural Fact endpoint ordinals are invalid.');
  return values;
}

function subjectEndpoints(fact) {
  if (!Array.isArray(fact?.endpoints) || fact.endpoints.length < 2 || fact.endpoints.some(endpoint => typeof endpoint?.target_id !== 'string' || !Number.isSafeInteger(endpoint.ordinal))) {
    fail('Structural subject endpoints are invalid.');
  }
  return fact.endpoints.map(endpoint => ({ role: endpoint.role, target_ref: { target_kind: endpoint.target_kind, target_id: endpoint.target_id }, ordinal: endpoint.ordinal,
    ...(endpoint.state_qualification ? { state_qualification: endpoint.state_qualification } : {}) }));
}

function bindingGuard(binding) {
  if (!binding?.profile?.id || !binding.profile.version || !binding?.rule_set?.id || !binding.rule_set.version) fail('Structural Profile binding is invalid.');
  return { profile_id: binding.profile.id, profile_version: binding.profile.version, rule_set_id: binding.rule_set.id, rule_version: binding.rule_set.version };
}
function capabilityRef(reference) { if (!reference?.capability_id) fail('Structural capability reference is invalid.'); return { capability_id: reference.capability_id, ...(reference.version ? { version: reference.version } : {}) }; }
function commandPath(identity) { return `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/commands`; }

function cell(page, value) { if (typeof value !== 'string' || /["\\\0]/u.test(value)) fail('Structural target_id is unsafe.'); return page.locator(`[data-cell-id="${value}"]`); }
async function click(locator) { await uniqueVisible(locator); await locator.click(); }
async function uniqueVisible(locator) { if (!locator || typeof locator.count !== 'function' || typeof locator.isVisible !== 'function' || await locator.count() !== 1 || !await locator.isVisible()) fail('Structural selector is not uniquely visible.'); }
function deepFrozen(value) { return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function fail(message) { const error = new Error(message); error.code = 'E2E_ORCHESTRATION_INPUT_INVALID'; throw error; }
