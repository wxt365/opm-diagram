export const driver = Object.freeze({
  driver_id: 'DRIVER-PROCEDURAL',
  driver_version: '0.1.0',
  family: 'PROC',
  suite_id: 'E2E-CANVAS-002',
  capability_prefix: 'CAP-ISO-PROC-',
  expected_case_count: 33
});

export const case_ids = Object.freeze(`G-OPL-PROC-001.CONSUMPTION_OBJECT.PASS
G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED
G-OPL-PROC-002.RESULT_OBJECT.PASS
G-OPL-PROC-002.ENDPOINTS_REVERSED.BLOCKED
G-OPL-PROC-003.EFFECT_OBJECT.PASS
G-OPL-PROC-003.ENDPOINTS_REVERSED.BLOCKED
G-OPL-PROC-004.AGENT_OBJECT.PASS
G-OPL-PROC-004.ENDPOINTS_REVERSED.BLOCKED
G-OPL-PROC-005.INSTRUMENT_OBJECT.PASS
G-OPL-PROC-005.ENDPOINTS_REVERSED.BLOCKED
G-OPL-PROC-006.CONSUMPTION_STATE.PASS
G-OPL-PROC-006.STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-007.RESULT_STATE.PASS
G-OPL-PROC-007.STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-008.EFFECT_INPUT_OUTPUT_STATE.PASS
G-OPL-PROC-008.INPUT_STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-008.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-009.EFFECT_INPUT_STATE.PASS
G-OPL-PROC-009.INPUT_STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-010.EFFECT_OUTPUT_STATE.PASS
G-OPL-PROC-010.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-011.AGENT_STATE.PASS
G-OPL-PROC-011.STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-012.INSTRUMENT_STATE.PASS
G-OPL-PROC-012.STATE_OWNER_MISMATCH.BLOCKED
G-OPL-PROC-013.INVOCATION_PROCESS.PASS
G-OPL-PROC-013.TARGET_KIND_INVALID.BLOCKED
G-OPL-PROC-014.SELF_INVOCATION_SAME_PROCESS.PASS
G-OPL-PROC-014.SELF_IDENTITY_MISMATCH.BLOCKED
G-OPL-PROC-015.OVERTIME_DURATION.PASS
G-OPL-PROC-015.DURATION_MISSING.BLOCKED
G-OPL-PROC-016.UNDERTIME_DURATION.PASS
G-OPL-PROC-016.DURATION_MISSING.BLOCKED`.split('\n'));

export async function executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) {
  const manifestCase = validateInvocation({ page, case_entry, attempt_identity, observation_sink, precondition_client });
  const pass = manifestCase.expectation === 'PASS';
  const candidateFact = pass ? case_entry.input_fixture.facts[0] : case_entry.companion_pass_input_fixture.facts[0];
  const candidate = await createCandidate({ page, fact: candidateFact, capabilityId: case_entry.companion_pass_requirement.capability_id, observation_sink });
  if (pass) {
    const duration = case_entry.input_fixture.facts[0].modifiers?.find(item => item.modifier_id === 'duration');
    if (duration) {
      const input = testId(page, 'p03-relation-duration');
      await uniqueVisible(input);
      await input.fill(String(duration.value));
    }
    await click(testId(page, `p03-relation-option-${manifestCase.capability_id}`));
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
  if (!page || !deepFrozen(case_entry) || !deepFrozen(attempt_identity) || !manifestCase
      || manifestCase.driver_id !== driver.driver_id || !case_ids.includes(manifestCase.case_id)
      || attempt_identity.case_id !== manifestCase.case_id || ![1, 2].includes(attempt_identity.attempt_ordinal)
      || attempt_identity.setup_fact_id !== null || attempt_identity.setup_create_fact_exchange_ref !== null
      || attempt_identity.subject_baseline_revision !== attempt_identity.materialized_base_revision
      || precondition_client !== observation_sink?.precondition_client
      || typeof precondition_client?.execute !== 'function' || typeof observation_sink?.waitForApi !== 'function'
      || typeof observation_sink?.waitForProjectionRefresh !== 'function' || typeof observation_sink?.recordPrecondition !== 'function') {
    fail('Procedural Driver invocation is invalid.');
  }
  return manifestCase;
}

async function createCandidate({ page, fact, capabilityId, observation_sink }) {
  const endpoints = exactEndpoints(fact);
  await click(cell(page, endpoints[0].target_id));
  await click(testId(page, 'p03-tool-procedural-relation'));
  for (const endpoint of endpoints.slice(1)) await click(cell(page, endpoint.target_id));
  await click(testId(page, 'p03-relation-resolve'));
  const receipt = await observation_sink.waitForApi({ operation_id: 'API-EDT-001', method: 'GET', ordinal: 1, expected_http_status: 200, expected_error_code: null });
  const data = receipt?.response?.body?.data;
  const options = data?.options?.filter(option => option?.capability_ref?.capability_id === capabilityId) ?? [];
  if (!receipt?.raw_request || !receipt?.actual_request || receipt?.response?.status !== 200 || !receipt?.exchange_ref
      || typeof data?.capability_query_id !== 'string' || !data.capability_query_id || options.length !== 1
      || typeof options[0].option_id !== 'string' || !options[0].option_id) fail('Procedural candidate receipt is invalid.');
  return Object.freeze({ capability_query_id: data.capability_query_id, selected_option_id: options[0].option_id, exchange_ref: receipt.exchange_ref });
}

function negativeCreateRequest({ case_entry, attempt_identity, candidate }) {
  return deepFreeze({
    case_id: case_entry.manifest_case.case_id,
    operation_id: 'API-EDT-002', method: 'POST', path: commandPath(attempt_identity),
    body: {
      request_id: `e2e.subject.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      command_id: `e2e.command.${case_entry.manifest_case.case_id}.${attempt_identity.attempt_ordinal}`,
      base_revision: attempt_identity.subject_baseline_revision,
      binding: bindingGuard(case_entry.input_fixture.profile_binding),
      command_type: 'CREATE_FACT',
      payload: createFactPayload(case_entry.input_fixture.facts[0], attempt_identity.context_id, candidate)
    },
    candidate_exchange_ref: candidate.exchange_ref,
    expected_http_status: case_entry.expected_api.expected_http_status,
    expected_error_code: case_entry.expected_error.top_error_code
  });
}

function createFactPayload(fact, contextId, candidate) {
  return {
    context_id: contextId, capability_ref: capabilityRef(fact.capability_ref), fact_family: fact.fact_family,
    normalized_endpoints: exactEndpoints(fact).map(endpoint => ({
      role: endpoint.role, target_ref: { target_kind: endpoint.target_kind, target_id: endpoint.target_id }, ordinal: endpoint.ordinal,
      ...(endpoint.state_qualification ? { state_qualification: endpoint.state_qualification } : {})
    })),
    direction: fact.direction, labels: fact.labels ?? [], modifiers: fact.modifiers ?? [],
    ...(fact.condition ? { condition: fact.condition } : {}), logical_groups: fact.logical_groups ?? [],
    ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {}),
    occurrence: { ownership: 'OWNED', construct_role: 'PROCEDURAL_LINK' }, layout: {},
    capability_query_id: candidate.capability_query_id, selected_option_id: candidate.selected_option_id
  };
}

function bindingGuard(binding) {
  if (!binding?.profile?.id || !binding.profile.version || !binding?.rule_set?.id || !binding.rule_set.version) fail('Procedural Profile binding is invalid.');
  return { profile_id: binding.profile.id, profile_version: binding.profile.version, rule_set_id: binding.rule_set.id, rule_version: binding.rule_set.version };
}
function capabilityRef(reference) { if (!reference?.capability_id) fail('Procedural capability reference is invalid.'); return { capability_id: reference.capability_id, ...(reference.version ? { version: reference.version } : {}) }; }

function exactEndpoints(fact) {
  if (!fact || !Array.isArray(fact.endpoints) || fact.endpoints.length < 2) fail('Procedural Fact endpoints are invalid.');
  const values = [...fact.endpoints].sort((left, right) => left.ordinal - right.ordinal);
  if (values.some((value, index) => value.ordinal !== index || typeof value.target_id !== 'string')) fail('Procedural Fact endpoint ordinals are invalid.');
  return values;
}
function commandPath(identity) { return `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/commands`; }
function testId(page, value) { return page.getByTestId(value); }
function cell(page, value) { if (typeof value !== 'string' || /["\\\0]/u.test(value)) fail('Procedural target_id is unsafe.'); return page.locator(`[data-cell-id="${value}"]`); }
async function click(locator) { await uniqueVisible(locator); await locator.click(); }
async function uniqueVisible(locator) { if (!locator || typeof locator.count !== 'function' || typeof locator.isVisible !== 'function' || await locator.count() !== 1 || !await locator.isVisible()) fail('Procedural selector is not uniquely visible.'); }
function deepFrozen(value) { return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function fail(message) { const error = new Error(message); error.code = 'E2E_ORCHESTRATION_INPUT_INVALID'; throw error; }
