export const driver = Object.freeze({
  driver_id: 'DRIVER-CONTROL', driver_version: '0.1.0', family: 'CTRL', suite_id: 'E2E-CANVAS-003',
  capability_prefix: 'CAP-ISO-CTRL-', expected_case_count: 35
});

export const case_ids = Object.freeze(`G-OPL-CTRL-001.CONSUMPTION.PASS
G-OPL-CTRL-001.EFFECT.PASS
G-OPL-CTRL-002.AGENT.PASS
G-OPL-CTRL-002.INSTRUMENT.PASS
G-OPL-CTRL-003.CONSUMPTION_STATE.PASS
G-OPL-CTRL-003.EFFECT_INPUT_OUTPUT.PASS
G-OPL-CTRL-003.EFFECT_INPUT.PASS
G-OPL-CTRL-003.EFFECT_OUTPUT.PASS
G-OPL-CTRL-004.AGENT_STATE.PASS
G-OPL-CTRL-004.INSTRUMENT_STATE.PASS
G-OPL-CTRL-005.CONSUMPTION.PASS
G-OPL-CTRL-005.EFFECT.PASS
G-OPL-CTRL-006.AGENT.PASS
G-OPL-CTRL-006.INSTRUMENT.PASS
G-OPL-CTRL-007.CONSUMPTION_STATE.PASS
G-OPL-CTRL-007.EFFECT_INPUT_OUTPUT.PASS
G-OPL-CTRL-007.EFFECT_INPUT.PASS
G-OPL-CTRL-007.EFFECT_OUTPUT.PASS
G-OPL-CTRL-008.AGENT_STATE.PASS
G-OPL-CTRL-008.INSTRUMENT_STATE.PASS
G-OPL-CTRL-001.RESULT.BLOCKED
G-OPL-CTRL-001.STATE_RESULT.BLOCKED
G-OPL-CTRL-001.EFFECT_OUTPUT_SEGMENT.BLOCKED
G-OPL-CTRL-001.NON_INPUT_SEGMENT.BLOCKED
G-OPL-CTRL-001.BASE_CAPABILITY_MISMATCH.BLOCKED
G-OPL-CTRL-001.MISSING_CONTROL_CAPABILITY.BLOCKED
G-OPL-CTRL-001.MISSING_CONTROL_SEGMENT.BLOCKED
G-OPL-CTRL-001.DUPLICATE_CONTROL_CAPABILITY.BLOCKED
G-OPL-CTRL-001.DUPLICATE_CONTROL_SEGMENT.BLOCKED
G-OPL-CTRL-001.EVENT_CONDITION_COMBINATION.BLOCKED
G-OPL-CTRL-001.UNKNOWN_CONTROL_CAPABILITY.BLOCKED
G-OPL-CTRL-001.MODIFIER_CAPABILITY_REF_MISMATCH.BLOCKED
G-OPL-CTRL-001.MODIFIER_VALUE_REF_MISMATCH.BLOCKED
G-OPL-CTRL-001.OPTION_PAYLOAD_MISMATCH.BLOCKED
G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED`.split('\n'));

export async function executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const manifestCase = validateInvocation({ page, case_entry, attempt_identity, observation_sink, precondition_client });
  const candidate = await createCandidate({ page, capabilityId: case_entry.companion_pass_requirement.capability_id, setupFactId: attempt_identity.setup_fact_id, observation_sink });
  if (manifestCase.expectation === 'PASS') {
    await click(page.getByTestId(`p03-control-option-${manifestCase.capability_id}`));
    await observation_sink.waitForApi(case_entry.expected_api);
    await observation_sink.waitForProjectionRefresh();
    return undefined;
  }
  const receipt = await precondition_client.execute(negativeControlRequest({ case_entry, attempt_identity, candidate }));
  await observation_sink.recordPrecondition(receipt);
  return undefined;
}

function validateInvocation({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const manifestCase = case_entry?.manifest_case;
  if (!page || !deepFrozen(case_entry) || !deepFrozen(attempt_identity) || !case_ids.includes(manifestCase?.case_id)
      || manifestCase.driver_id !== driver.driver_id || attempt_identity.case_id !== manifestCase.case_id
      || ![1, 2].includes(attempt_identity.attempt_ordinal) || typeof attempt_identity.setup_fact_id !== 'string' || !attempt_identity.setup_fact_id
      || typeof attempt_identity.subject_baseline_revision !== 'string' || !attempt_identity.setup_create_fact_exchange_ref
      || precondition_client !== observation_sink?.precondition_client || typeof precondition_client?.execute !== 'function'
      || typeof observation_sink?.waitForApi !== 'function' || typeof observation_sink?.waitForProjectionRefresh !== 'function'
      || typeof observation_sink?.recordPrecondition !== 'function') fail('Control Driver invocation is invalid.');
  return manifestCase;
}

async function createCandidate({ page, capabilityId, setupFactId, observation_sink }) {
  await click(uniqueFactCell(page, setupFactId));
  await click(page.getByTestId('p03-control-open'));
  const receipt = await observation_sink.waitForApi({ operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  const data = receipt?.response?.body?.data;
  const options = data?.options?.filter(option => option?.capability_ref?.capability_id === capabilityId) ?? [];
  if (!receipt?.raw_request || !receipt?.actual_request || receipt?.response?.status !== 200 || !receipt?.exchange_ref
      || typeof data?.capability_query_id !== 'string' || !data.capability_query_id || options.length !== 1
      || typeof options[0].option_id !== 'string' || !options[0].option_id) fail('Control candidate receipt is invalid.');
  return Object.freeze({ capability_query_id: data.capability_query_id, selected_option_id: options[0].option_id, exchange_ref: receipt.exchange_ref });
}

function negativeControlRequest({ case_entry, attempt_identity, candidate }) {
  const fact = case_entry.input_fixture.facts[0];
  const create = case_entry.expected_api.command_type === 'CREATE_FACT';
  return deepFreeze({
    case_id: case_entry.manifest_case.case_id,
    operation_id: 'API-EDT-002', method: 'POST', path: commandPath(attempt_identity),
    body: {
      request_id: `e2e.subject.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      command_id: `e2e.command.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      base_revision: attempt_identity.subject_baseline_revision,
      binding: bindingGuard(case_entry.input_fixture.profile_binding),
      command_type: create ? 'CREATE_FACT' : 'UPDATE_FACT',
      payload: create ? createFactPayload(fact, attempt_identity.context_id, candidate) : updateFactPayload(fact, attempt_identity.setup_fact_id, candidate)
    },
    candidate_exchange_ref: candidate.exchange_ref,
    expected_http_status: case_entry.expected_api.expected_http_status,
    expected_error_code: case_entry.expected_error.top_error_code
  });
}

function createFactPayload(fact, contextId, candidate) {
  return {
    context_id: contextId, capability_ref: capabilityRef(fact.capability_ref), fact_family: fact.fact_family,
    normalized_endpoints: normalizedEndpoints(fact), direction: fact.direction, labels: fact.labels ?? [], modifiers: fact.modifiers ?? [],
    ...(fact.condition ? { condition: fact.condition } : {}), logical_groups: fact.logical_groups ?? [],
    ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {}),
    occurrence: { ownership: 'OWNED', construct_role: 'PROCEDURAL_LINK' }, layout: {},
    capability_query_id: candidate.capability_query_id, selected_option_id: candidate.selected_option_id
  };
}

function updateFactPayload(fact, factId, candidate) {
  return {
    fact_id: factId, expected_capability_ref: capabilityRef(fact.capability_ref),
    replacement: {
      normalized_endpoints: normalizedEndpoints(fact), direction: fact.direction, labels: fact.labels ?? [], modifiers: fact.modifiers ?? [],
      ...(fact.condition ? { condition: fact.condition } : {}), logical_groups: fact.logical_groups ?? [],
      ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {})
    },
    capability_query_id: candidate.capability_query_id, selected_option_id: candidate.selected_option_id
  };
}

function normalizedEndpoints(fact) {
  if (!Array.isArray(fact?.endpoints) || fact.endpoints.length < 2) fail('Control Fact endpoints are invalid.');
  const values = [...fact.endpoints].sort((left, right) => left.ordinal - right.ordinal);
  if (values.some((value, index) => value.ordinal !== index || typeof value.target_id !== 'string')) fail('Control Fact endpoint ordinals are invalid.');
  return values.map(endpoint => ({ role: endpoint.role, target_ref: { target_kind: endpoint.target_kind, target_id: endpoint.target_id }, ordinal: endpoint.ordinal,
    ...(endpoint.state_qualification ? { state_qualification: endpoint.state_qualification } : {}) }));
}

function bindingGuard(binding) {
  if (!binding?.profile?.id || !binding.profile.version || !binding?.rule_set?.id || !binding.rule_set.version) fail('Control Profile binding is invalid.');
  return { profile_id: binding.profile.id, profile_version: binding.profile.version, rule_set_id: binding.rule_set.id, rule_version: binding.rule_set.version };
}
function capabilityRef(reference) { if (!reference?.capability_id) fail('Control capability reference is invalid.'); return { capability_id: reference.capability_id, ...(reference.version ? { version: reference.version } : {}) }; }
function commandPath(identity) { return `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/commands`; }

function uniqueFactCell(page, factId) {
  if (/[^A-Za-z0-9._-]/u.test(factId)) fail('Control Fact selector is unsafe.');
  const selectors = [factId, `${factId}.input`, `${factId}.root`].map(value => page.locator(`[data-cell-id="${value}"]`));
  return {
    async count() { return (await Promise.all(selectors.map(locator => locator.count()))).reduce((sum, value) => sum + value, 0); },
    async isVisible() { const visible = await Promise.all(selectors.map(async locator => await locator.count() === 1 && await locator.isVisible())); return visible.filter(Boolean).length === 1; },
    async click() { const matches = []; for (const locator of selectors) if (await locator.count() === 1 && await locator.isVisible()) matches.push(locator); if (matches.length !== 1) fail('Control Fact selector is not unique.'); await matches[0].click(); }
  };
}
async function click(locator) { if (!locator || await locator.count() !== 1 || !await locator.isVisible()) fail('Control selector is not uniquely visible.'); await locator.click(); }
function deepFrozen(value) { return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function fail(message) { const error = new Error(message); error.code = 'E2E_ORCHESTRATION_INPUT_INVALID'; throw error; }
