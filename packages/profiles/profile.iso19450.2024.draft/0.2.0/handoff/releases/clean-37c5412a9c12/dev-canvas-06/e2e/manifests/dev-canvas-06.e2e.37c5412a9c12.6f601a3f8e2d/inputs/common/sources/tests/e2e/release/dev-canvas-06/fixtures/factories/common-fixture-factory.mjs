import { sha256Jcs } from '../../../../../../scripts/canvas06-rfc8785.mjs';

export const visualSubjects = [
  'STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER',
  'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK'
];

export const e2eCases = [
  'E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION',
  'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP',
  'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED',
  'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED',
  'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED',
  'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT',
  'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY'
];

export function visualFixture(subjectId) {
  return {
    fixture_id: `fixture.visual.${subjectId.toLowerCase()}`,
    subject_id: subjectId,
    project_name: `Release visual ${subjectId}`,
    model_name: `Release visual ${subjectId}`,
    expected_revision: `revision.visual.${subjectId.toLowerCase()}`,
    focus_target_id: `fact.visual.${subjectId.toLowerCase()}`,
    focus_anchor: 'CENTER',
    expected_cells: 3,
    critical_regions: ['FOCUS_BBOX', 'CANVAS'],
    seed: { object_id: `object.visual.${subjectId.toLowerCase()}`, process_id: `process.visual.${subjectId.toLowerCase()}` }
  };
}

export function buildCommonVisualFixture(subjectId, sourceBinding, sourceDateEpoch) {
  if (!visualSubjects.includes(subjectId)) throw new TypeError(`Unknown visual subject: ${subjectId}`);
  const epoch = Number(sourceDateEpoch);
  if (!Number.isInteger(epoch) || epoch < 0) throw new TypeError('SOURCE_DATE_EPOCH must be a non-negative integer.');
  const slug = subjectId.toLowerCase().replaceAll('_', '-');
  const generatedAt = new Date(epoch * 1000).toISOString();
  const binding = revisionBinding(sourceBinding);
  const shared = subjectDefinition(subjectId, slug);
  const project = projectFor(subjectId, slug);
  const model = { model_id: `model.visual.${slug}`, project_id: project.project_id, name: project.name, normalized_name: project.normalized_name, description: project.description, status: 'ACTIVE' };
  const revision = revisionFor(subjectId, slug, model, binding, shared);
  const indexSeed = indexFor(revision, project, generatedAt, subjectId);
  const captureSetup = captureSetupFor(subjectId, slug, revision, shared);
  const expectedProjection = projectionFor(subjectId, slug, revision, shared, captureSetup);
  const fixture = {
    schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001', schema_version: '0.1', fixture_version: '0.1.0',
    fixture_id: `fixture.visual.${slug}`, subject_id: subjectId, factory_id: `factory.visual.${slug}`, generated_at: generatedAt,
    source_binding: sourceBinding, project, model, revision_document: revision, index_seed: indexSeed,
    capture_setup: captureSetup, expected_projection: expectedProjection
  };
  return { ...fixture, fixture_payload_sha256: sha256Jcs(fixture) };
}

function subjectDefinition(subjectId, slug) {
  const common = { input: { name: 'Input', x: 120, y: 220, width: 220, height: 96 }, process: { name: 'Processing', x: 600, y: 216, width: 240, height: 104 }, fact: { x: 340, y: 266, width: 260, height: 2 } };
  if (subjectId === 'STATE_ROLES') return { states: [{ name: 'new', role: 'INITIAL', x: 220, y: 190, width: 140, height: 30 }, { name: 'processing', role: 'DEFAULT', x: 220, y: 250, width: 140, height: 30 }, { name: 'completed', role: 'FINAL', x: 220, y: 310, width: 140, height: 30 }], elements: [{ role: 'order', kind: 'OBJECT', name: 'Order', x: 180, y: 120, width: 360, height: 280 }], fact: null };
  if (subjectId === 'LONG_LABELS') return { elements: [{ role: 'request', kind: 'OBJECT', name: 'Enterprise Customer Order Fulfillment Request', x: 100, y: 200, width: 360, height: 112 }, { role: 'process', kind: 'PROCESS', name: 'Coordinating Cross-Regional Fulfillment and Exception Resolution', x: 620, y: 194, width: 380, height: 124 }], fact: { ...common.fact, label: 'consumes validated enterprise customer fulfillment request' } };
  if (subjectId === 'FUNDAMENTAL_FAN') return { elements: [{ role: 'assembly', kind: 'OBJECT', name: 'Assembly', x: 120, y: 220, width: 220, height: 96 }, { role: 'part-1', kind: 'OBJECT', name: 'Part One', x: 620, y: 80, width: 200, height: 88 }, { role: 'part-2', kind: 'OBJECT', name: 'Part Two', x: 620, y: 220, width: 200, height: 88 }, { role: 'part-3', kind: 'OBJECT', name: 'Part Three', x: 620, y: 360, width: 200, height: 88 }], fact: { x: 460, y: 266, width: 8, height: 8, fan: true } };
  return { elements: [{ role: 'input', kind: 'OBJECT', ...common.input }, { role: 'process', kind: 'PROCESS', ...common.process }], fact: subjectId === 'CANDIDATE_LAYER' ? null : common.fact };
}

function projectFor(subjectId, slug) {
  const name = `Release Visual ${subjectId}`;
  return { project_id: `project.visual.${slug}`, name, normalized_name: name.toLowerCase(), description: 'DEV-CANVAS-06 release visual common fixture.', status: 'ACTIVE' };
}

function revisionBinding(binding) {
  const asset = value => ({ id: value.id, version: value.version, digest: { algorithm: 'sha256', digest: value.sha256 } });
  return { profile: asset(binding.profile), rule_set: asset(binding.rule_set), text_grammar: asset(binding.text_grammar), symbol_catalog: asset(binding.symbol_catalog), normalization_adapter: asset(binding.normalization_adapter), binding_digest: { algorithm: 'sha256', digest: binding.binding_digest } };
}

function revisionFor(subjectId, slug, model, binding, shared) {
  const profile = binding.profile;
  const source = { source_profile_id: profile.id, source_profile_version: profile.version, source_kind: 'ReleaseVisualFixture', source_entity_id: `fixture.${slug}` };
  const capability = capabilityId => ({ capability_id: capabilityId, profile_id: profile.id, profile_version: profile.version });
  const elements = shared.elements.map(item => ({ element_id: `element.visual.${slug}.${item.role}`, core_kind: item.kind, capability_ref: capability(item.kind === 'OBJECT' ? 'CAP-OBJECT-001' : 'CAP-PROCESS-001'), name: { namespace: 'urn:opm:release:visual', local_name: item.name }, feature_ids: [], state_ids: subjectId === 'STATE_ROLES' ? shared.states.map(state => `state.visual.${slug}.${state.name}`) : [], source, normalization: { level: 'CORE' } }));
  const states = (shared.states ?? []).map(state => ({ state_id: `state.visual.${slug}.${state.name}`, owner_element_id: `element.visual.${slug}.order`, capability_ref: capability('CAP-STATE-001'), name: { namespace: 'urn:opm:release:visual', local_name: state.name }, state_roles: [state.role], source, normalization: { level: 'CORE' } }));
  const fact = shared.fact && factFor(subjectId, slug, shared, capability, source);
  const contextId = `context.visual.${slug}.sd`;
  const occurrences = [...elements.map(element => occurrenceFor(contextId, element.element_id, 'ELEMENT', element.element_id.split('.').at(-1), shared.elements.find(item => `element.visual.${slug}.${item.role}` === element.element_id))), ...states.map(state => occurrenceFor(contextId, state.state_id, 'STATE', state.state_id.split('.').at(-1), shared.states.find(item => `state.visual.${slug}.${item.name}` === state.state_id))), ...(fact ? [occurrenceFor(contextId, fact.fact_id, 'FACT', 'fact', shared.fact)] : [])].sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
  const layouts = occurrences.map(item => item.layout).sort((left, right) => left.layout_id.localeCompare(right.layout_id));
  const revision = {
    schema_id: 'MS-REV-001', schema_version: '0.2', revision_id: `revision.visual.${slug}`, model_id: model.model_id, revision_sequence: 1,
    schema_set_ref: { core_metamodel_version: '0.2', profile_schema_version: '0.2', rule_schema_version: '0.1', storage_schema_version: '1.0' }, profile_binding: binding,
    model_header: { model_id: model.model_id, identity_namespace: { namespace: 'urn:opm:release:visual', local_name: slug }, name: model.name, description: model.description, root_context_id: contextId },
    elements, features: [], states, facts: fact ? [fact] : [], contexts: [{ context_id: contextId, context_kind: 'SYSTEM_DIAGRAM', capability_ref: capability('CAP-CONTEXT-001'), name: { namespace: 'urn:opm:release:visual', local_name: 'SD' }, occurrence_ids: occurrences.map(item => item.occurrence_id), source }],
    occurrences: occurrences.map(({ layout, ...item }) => item), layouts, state_presentations: [], text_artifact: emptyArtifact(slug, contextId, binding.text_grammar), text_traces: [],
    validation_summary: validationSummary()
  };
  return { ...revision, revision_digest: { algorithm: 'sha256', digest: sha256Jcs(revision) } };
}

function factFor(subjectId, slug, shared, capability, source) {
  const fan = shared.fact.fan === true;
  const targets = fan ? ['assembly', 'part-1', 'part-2', 'part-3'] : ['input', 'process'];
  const roles = fan ? ['WHOLE_THING', 'PART_THING', 'PART_THING', 'PART_THING'] : ['CONSUMED_OBJECT', 'CONSUMING_PROCESS'];
  return { fact_id: `fact.visual.${slug}`, fact_family: fan ? 'STRUCTURAL' : 'TRANSFORMATION', capability_ref: capability(fan ? 'CAP-ISO-STRUCT-005' : 'CAP-ISO-PROC-001'), endpoints: targets.map((role, ordinal) => ({ endpoint_id: `endpoint.visual.${slug}.${ordinal}`, role: roles[ordinal], target_kind: 'ELEMENT', target_id: `element.visual.${slug}.${role}`, ordinal })), direction: fan ? 'UNDIRECTED' : 'DIRECTED', ...(shared.fact.label ? { labels: [{ slot_id: 'label.primary', text: shared.fact.label }] } : {}), ...(fan ? { collection_completeness: 'INCOMPLETE' } : {}), source, normalization: { level: 'CORE' } };
}

function occurrenceFor(contextId, targetId, targetKind, role, geometry) {
  return { occurrence_id: `occurrence.${targetId.slice('element.'.length)}`, context_id: contextId, target_kind: targetKind, target_id: targetId, ownership: 'OWNED', construct_role: targetKind === 'FACT' ? 'FACT_EDGE' : targetKind === 'STATE' ? 'STATE_LABEL' : 'ELEMENT_NODE', layout_id: `layout.${targetId.slice('element.'.length)}`, layout: { layout_id: `layout.${targetId.slice('element.'.length)}`, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, z_order: targetKind === 'FACT' ? 1 : targetKind === 'STATE' ? 3 : 2 } };
}

function emptyArtifact(slug, contextId, grammarRef) {
  const value = { artifact_id: `artifact.visual.${slug}.empty`, modality: 'OPL', context_id: contextId, grammar_ref: grammarRef, sentences: [] };
  const preimage = { schema_id: 'OPM-DEV-CANVAS-06-EMPTY-TEXT-ARTIFACT-PREIMAGE-001', schema_version: '0.1', revision_id: `revision.visual.${slug}`, text_artifact: value, text_traces: [] };
  return { ...value, artifact_digest: { algorithm: 'sha256', digest: sha256Jcs(preimage) } };
}

function validationSummary() { const value = { scope: 'POST_COMMIT', blocking: 0, warning: 0, suggestion: 0, coverage_state: 'INCOMPLETE' }; return { ...value, report_digest: { algorithm: 'sha256', digest: sha256Jcs(value) } }; }

function indexFor(revision, project, generatedAt, subjectId) {
  const elements = revision.elements.map(element => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, element_id: element.element_id, core_kind: element.core_kind, capability_id: element.capability_ref.capability_id, normalized_name: element.name.local_name.toLowerCase() })).sort(by('element_id'));
  const endpoints = revision.facts.flatMap(fact => fact.endpoints.map(endpoint => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, fact_id: fact.fact_id, endpoint_id: endpoint.endpoint_id, endpoint_role: endpoint.role, target_entity_id: endpoint.target_id, ordinal: endpoint.ordinal }))).sort((left, right) => left.fact_id.localeCompare(right.fact_id) || left.ordinal - right.ordinal || left.endpoint_id.localeCompare(right.endpoint_id));
  const occurrences = revision.occurrences.map(item => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, context_id: item.context_id, occurrence_id: item.occurrence_id, target_entity_id: item.target_id, ownership: item.ownership })).sort((left, right) => left.context_id.localeCompare(right.context_id) || left.occurrence_id.localeCompare(right.occurrence_id));
  const finding = subjectId === 'FINDING_FOCUS' ? [{ source_revision_id: revision.revision_id, model_id: revision.model_id, finding_id: 'finding.visual.finding-focus.001', rule_id: 'RULE-VISUAL-COMMON-001', severity: 'WARNING', category: 'MODEL_QUALITY', context_id: revision.model_header.root_context_id, entity_id: `fact.visual.finding-focus` }] : [];
  const operations = subjectId === 'BLOCKED_FEEDBACK' ? ['validation-blocked', 'revision-conflict', 'readonly'].map((suffix, index) => ({ operation_record_id: `operation-record.visual.blocked-feedback.${suffix}`, project_id: project.project_id, model_id: revision.model_id, operation_id: 'operation.visual.blocked-feedback.seed', aggregate_id: revision.model_id, command_id: `command.visual.blocked-feedback.${suffix}`, input_revision_id: revision.revision_id, result_revision_id: null, result_status: 'BLOCKED', diagnostic_id: `diagnostic.visual.blocked-feedback.${suffix}`, occurred_at: new Date(Date.parse(generatedAt) + index * 1000).toISOString() })) : [];
  return { element_index: elements, fact_endpoint_index: endpoints, occurrence_index: occurrences, finding_index: finding, operation_record: operations };
}

function captureSetupFor(subjectId, slug, revision, shared) {
  const factId = `fact.visual.${slug}`;
  const mapping = {
    STATE_ROLES: [{ step_type: 'SELECT_OCCURRENCE', occurrence_id: `occurrence.visual.${slug}.order` }],
    LONG_LABELS: [{ step_type: 'SELECT_OCCURRENCE', occurrence_id: `occurrence.visual.${slug}.fact` }],
    FUNDAMENTAL_FAN: [{ step_type: 'SELECT_OCCURRENCE', occurrence_id: `occurrence.visual.${slug}.fact` }],
    CANDIDATE_LAYER: [{ step_type: 'SELECT_RELATION_TOOL', capability_id: 'CAP-ISO-PROC-001' }, { step_type: 'SELECT_ENDPOINT', endpoint_role: 'SOURCE', target_kind: 'ELEMENT', target_id: `element.visual.${slug}.input` }, { step_type: 'SELECT_ENDPOINT', endpoint_role: 'TARGET', target_kind: 'ELEMENT', target_id: `element.visual.${slug}.process` }, { step_type: 'WAIT_CAPABILITY_OPTIONS' }, { step_type: 'SELECT_EXACT_OPTION', capability_id: 'CAP-ISO-PROC-001' }],
    INSPECTOR: [{ step_type: 'SELECT_OCCURRENCE', occurrence_id: `occurrence.visual.${slug}.fact` }, { step_type: 'OPEN_RIGHT_PANEL' }],
    TOOLCHAIN_CATALOG: [{ step_type: 'OPEN_RELATION_CATALOG' }, { step_type: 'CLEAR_RELATION_SEARCH' }, { step_type: 'EXPAND_GROUP', group_id: 'PROCEDURAL' }, { step_type: 'EXPAND_GROUP', group_id: 'CONTROL' }, { step_type: 'EXPAND_GROUP', group_id: 'STRUCTURAL' }],
    FINDING_FOCUS: [{ step_type: 'OPEN_BOTTOM_PANEL', panel_mode: 'FINDINGS' }, { step_type: 'SELECT_FINDING', finding_id: 'finding.visual.finding-focus.001' }, { step_type: 'LOCATE_FINDING' }],
    BLOCKED_FEEDBACK: [{ step_type: 'OPEN_BOTTOM_PANEL', panel_mode: 'HISTORY' }, { step_type: 'SUBMIT_ONE_SHOT_FAULT_COMMAND', command_id: 'command.visual.blocked-feedback.persistence-failed' }]
  };
  const focus = subjectId === 'STATE_ROLES' ? `occurrence.visual.${slug}.order` : subjectId === 'CANDIDATE_LAYER' ? 'candidate.visual.candidate-layer' : subjectId === 'TOOLCHAIN_CATALOG' ? 'P03-tool-relation-menu' : subjectId === 'BLOCKED_FEEDBACK' ? 'P03-command-feedback' : factId;
  const anchor = subjectId === 'LONG_LABELS' ? 'LABEL' : subjectId === 'FUNDAMENTAL_FAN' ? 'JUNCTION' : 'CENTER';
  return { setup_version: '0.1.0', steps: mapping[subjectId], expected_read_revision: revision.revision_id, expected_context_id: revision.model_header.root_context_id, expected_focus_target_id: focus, expected_focus_anchor: anchor, expected_rendered_cell_count: revision.occurrences.length + (subjectId === 'CANDIDATE_LAYER' ? 1 : 0), ...(subjectId === 'BLOCKED_FEEDBACK' ? { one_shot_fault: { hook_id: 'sqlite.revision-commit.before-insert', command_id: 'command.visual.blocked-feedback.persistence-failed', error_code: 'PERSISTENCE_FAILED', max_invocations: 1 } } : {}) };
}

function projectionFor(subjectId, slug, revision, shared, setup) {
  const committed = revision.occurrences.map(item => { const layout = revision.layouts.find(value => value.layout_id === item.layout_id); return { cell_id: item.occurrence_id, layer: 'COMMITTED', target_kind: item.target_kind, target_id: item.target_id, construct_role: item.construct_role, geometry: { x: layout.x, y: layout.y, width: layout.width, height: layout.height, z_order: layout.z_order }, state_roles: item.target_kind === 'STATE' ? revision.states.find(state => state.state_id === item.target_id).state_roles : [], capability_id: item.target_kind === 'FACT' ? revision.facts[0].capability_ref.capability_id : item.target_kind === 'STATE' ? 'CAP-STATE-001' : revision.elements.find(element => element.element_id === item.target_id).capability_ref.capability_id }; }).sort(by('cell_id'));
  const candidate = subjectId === 'CANDIDATE_LAYER' ? [{ cell_id: 'candidate.visual.candidate-layer', layer: 'CANDIDATE', target_kind: 'FACT', capability_id: 'CAP-ISO-PROC-001', source_target_id: `element.visual.${slug}.input`, target_target_id: `element.visual.${slug}.process`, state: 'preview' }] : [];
  return { projection_version: '0.1.0', subject_id: subjectId, read_revision: revision.revision_id, context_id: revision.model_header.root_context_id, committed_cells: committed, transient_cells: candidate, selection: subjectId === 'INSPECTOR' ? { kind: 'relation', target_id: `fact.visual.${slug}` } : subjectId === 'STATE_ROLES' ? { kind: 'single-element', target_id: `element.visual.${slug}.order` } : { kind: 'none', target_id: null }, panels: { right_open: subjectId === 'INSPECTOR', right_mode: subjectId === 'INSPECTOR' ? 'inspector-relation-fields' : null, bottom_open: subjectId === 'FINDING_FOCUS' || subjectId === 'BLOCKED_FEEDBACK', bottom_mode: subjectId === 'FINDING_FOCUS' ? 'FINDINGS' : subjectId === 'BLOCKED_FEEDBACK' ? 'HISTORY' : null }, relation_candidate: { state: candidate.length ? 'preview' : 'none', capability_id: candidate.length ? 'CAP-ISO-PROC-001' : null, candidate_id: candidate.length ? 'candidate.visual.candidate-layer' : null }, catalog: { open: subjectId === 'TOOLCHAIN_CATALOG', search: '', procedural_count: subjectId === 'TOOLCHAIN_CATALOG' ? 16 : 0, control_count: subjectId === 'TOOLCHAIN_CATALOG' ? 8 : 0, structural_count: subjectId === 'TOOLCHAIN_CATALOG' ? 10 : 0 }, finding: { selected_finding_id: subjectId === 'FINDING_FOCUS' ? 'finding.visual.finding-focus.001' : null, highlighted_target_id: subjectId === 'FINDING_FOCUS' ? `fact.visual.${slug}` : null }, feedback: { current_code: subjectId === 'BLOCKED_FEEDBACK' ? 'PERSISTENCE_FAILED' : null, history_codes: subjectId === 'BLOCKED_FEEDBACK' ? ['VALIDATION_BLOCKED', 'REVISION_CONFLICT', 'READONLY'] : [] }, focus_target_id: setup.expected_focus_target_id };
}

function by(key) { return (left, right) => left[key].localeCompare(right[key]); }

export function e2eFixture(caseId) {
  const blocked = /AMBIGUOUS|STALE|MISMATCHED|ASSET_MISSING|TEXT_BLOCKED|CONFLICT|PERSISTENCE_FAILED|READONLY/.test(caseId);
  return {
    fixture_id: `fixture.e2e.${caseId.toLowerCase()}`,
    case_id: caseId,
    project_name: `Release E2E ${caseId}`,
    model_name: `Release E2E ${caseId}`,
    initial_revision: `revision.e2e.${caseId.toLowerCase()}`,
    action: {
      action_id: 'action.001',
      expected_status: blocked ? 'BLOCKED_MATCHED' : 'PASS_MATCHED',
      ...(blocked ? { expected_error_code: 'DOMAIN_REJECTED' } : {}),
      expected_transaction: transaction(blocked),
      reopen_checkpoint: { expected_head_changed: !blocked, projection_matches: true, text_trace_matches: true }
    }
  };
}

function transaction(blocked) {
  const delta = blocked ? 0 : 1;
  return { revision_delta: delta, revision_parent_delta: delta, text_artifact_delta: delta, text_trace_delta: delta, finding_delta: 0, operation_delta: delta, receipt_delta: delta, draft_head_changed: !blocked };
}
