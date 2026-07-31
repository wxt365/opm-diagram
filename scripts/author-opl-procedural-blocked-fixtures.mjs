import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const manifestPath = resolve(profileRoot, 'golden/opm-opl-golden-manifest.json');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const basePath = resolve(profileRoot, 'golden/fixtures/base-golden.proc.001.json');
const write = process.argv.includes('--write');

const manifest = await readJson(manifestPath);
const catalog = await readJson(catalogPath);
const base = await readJson(basePath);
const fixtureDefinitions = blockedFixtureDefinitions();
const requirements = catalog.requirements.filter((requirement) => requirement.family === 'PROC' && requirement.expectation === 'BLOCKED');
const definitionByCaseId = new Map(fixtureDefinitions.map((definition) => [definition.caseId, definition]));

if (requirements.length !== 17 || definitionByCaseId.size !== requirements.length
  || requirements.some((requirement) => !definitionByCaseId.has(requirement.case_id))) {
  throw new Error('Procedural BLOCKED fixture definitions do not exactly match the coverage catalog');
}

const references = manifest.cases[0];
const generatedCases = requirements.map((requirement) => manifestCase(requirement, definitionByCaseId.get(requirement.case_id), references));
const retainedCases = manifest.cases.filter((goldenCase) => !(/^G-OPL-PROC-/.test(goldenCase.case_id) && goldenCase.expectation === 'BLOCKED'));
const expectedManifest = { ...manifest, cases: [...retainedCases, ...generatedCases] };

for (const requirement of requirements) {
  const definition = definitionByCaseId.get(requirement.case_id);
  const fixturePath = resolve(profileRoot, fixtureRelativePath(definition));
  const expectedFixture = candidateFixture(base, definition);
  await syncJson(fixturePath, expectedFixture, write);
}
await syncJson(manifestPath, expectedManifest, write);

function blockedFixtureDefinitions() {
  return [
    endpointMismatch('G-OPL-PROC-001.ENDPOINTS_REVERSED.BLOCKED', 'CAP-ISO-PROC-001', 'ENDPOINTS_REVERSED', 'proc.001.endpoints.reversed', 'TRANSFORMATION', [
      endpoint('consumed', 'CONSUMED_OBJECT', 'element.processing', 0), endpoint('process', 'CONSUMING_PROCESS', 'element.raw.material', 1)]),
    endpointMismatch('G-OPL-PROC-002.ENDPOINTS_REVERSED.BLOCKED', 'CAP-ISO-PROC-002', 'ENDPOINTS_REVERSED', 'proc.002.endpoints.reversed', 'TRANSFORMATION', [
      endpoint('process', 'RESULT_PROCESS', 'element.raw.material', 0), endpoint('result', 'RESULT_OBJECT', 'element.processing', 1)]),
    endpointMismatch('G-OPL-PROC-003.ENDPOINTS_REVERSED.BLOCKED', 'CAP-ISO-PROC-003', 'ENDPOINTS_REVERSED', 'proc.003.endpoints.reversed', 'TRANSFORMATION', [
      endpoint('affectee', 'AFFECTEE', 'element.processing', 0), endpoint('process', 'AFFECTING_PROCESS', 'element.raw.material', 1), endpoint('affected', 'AFFECTED', 'element.raw.material', 2)]),
    endpointMismatch('G-OPL-PROC-004.ENDPOINTS_REVERSED.BLOCKED', 'CAP-ISO-PROC-004', 'ENDPOINTS_REVERSED', 'proc.004.endpoints.reversed', 'ENABLING', [
      endpoint('agent', 'AGENT_OBJECT', 'element.processing', 0), endpoint('process', 'ENABLED_PROCESS', 'element.raw.material', 1)]),
    endpointMismatch('G-OPL-PROC-005.ENDPOINTS_REVERSED.BLOCKED', 'CAP-ISO-PROC-005', 'ENDPOINTS_REVERSED', 'proc.005.endpoints.reversed', 'ENABLING', [
      endpoint('instrument', 'INSTRUMENT_OBJECT', 'element.processing', 0), endpoint('process', 'ENABLED_PROCESS', 'element.raw.material', 1)]),
    stateOwnerMismatch('G-OPL-PROC-006.STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-006', 'STATE_OWNER_MISMATCH', 'proc.006.state.owner.mismatch', 'TRANSFORMATION', [
      stateEndpoint('consumed', 'CONSUMED_STATE', 'state.raw.available', 0), endpoint('process', 'CONSUMING_PROCESS', 'element.processing', 1)]),
    stateOwnerMismatch('G-OPL-PROC-007.STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-007', 'STATE_OWNER_MISMATCH', 'proc.007.state.owner.mismatch', 'TRANSFORMATION', [
      endpoint('process', 'RESULT_PROCESS', 'element.processing', 0), stateEndpoint('result', 'RESULT_STATE', 'state.raw.available', 1)]),
    stateOwnerMismatch('G-OPL-PROC-008.INPUT_STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-008', 'INPUT_STATE_OWNER_MISMATCH', 'proc.008.input.state.owner.mismatch', 'TRANSFORMATION', [
      stateEndpoint('input', 'AFFECTEE_INPUT_STATE', 'state.raw.available', 0), endpoint('process', 'AFFECTING_PROCESS', 'element.processing', 1), stateEndpoint('output', 'AFFECTED_OUTPUT_STATE', 'state.raw.output', 2)], 'INPUT'),
    stateOwnerMismatch('G-OPL-PROC-008.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-008', 'OUTPUT_STATE_OWNER_MISMATCH', 'proc.008.output.state.owner.mismatch', 'TRANSFORMATION', [
      stateEndpoint('input', 'AFFECTEE_INPUT_STATE', 'state.raw.available', 0), endpoint('process', 'AFFECTING_PROCESS', 'element.processing', 1), stateEndpoint('output', 'AFFECTED_OUTPUT_STATE', 'state.raw.output', 2)], 'OUTPUT'),
    stateOwnerMismatch('G-OPL-PROC-009.INPUT_STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-009', 'INPUT_STATE_OWNER_MISMATCH', 'proc.009.input.state.owner.mismatch', 'TRANSFORMATION', [
      stateEndpoint('input', 'AFFECTEE_INPUT_STATE', 'state.raw.available', 0), endpoint('process', 'AFFECTING_PROCESS', 'element.processing', 1), endpoint('affected', 'AFFECTED_OBJECT', 'element.raw.material', 2)]),
    stateOwnerMismatch('G-OPL-PROC-010.OUTPUT_STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-010', 'OUTPUT_STATE_OWNER_MISMATCH', 'proc.010.output.state.owner.mismatch', 'TRANSFORMATION', [
      endpoint('affectee', 'AFFECTEE_OBJECT', 'element.raw.material', 0), endpoint('process', 'AFFECTING_PROCESS', 'element.processing', 1), stateEndpoint('output', 'AFFECTED_OUTPUT_STATE', 'state.raw.available', 2)]),
    stateOwnerMismatch('G-OPL-PROC-011.STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-011', 'STATE_OWNER_MISMATCH', 'proc.011.state.owner.mismatch', 'ENABLING', [
      stateEndpoint('agent', 'AGENT_STATE', 'state.raw.available', 0), endpoint('process', 'ENABLED_PROCESS', 'element.processing', 1)]),
    stateOwnerMismatch('G-OPL-PROC-012.STATE_OWNER_MISMATCH.BLOCKED', 'CAP-ISO-PROC-012', 'STATE_OWNER_MISMATCH', 'proc.012.state.owner.mismatch', 'ENABLING', [
      stateEndpoint('instrument', 'INSTRUMENT_STATE', 'state.raw.available', 0), endpoint('process', 'ENABLED_PROCESS', 'element.processing', 1)]),
    endpointMismatch('G-OPL-PROC-013.TARGET_KIND_INVALID.BLOCKED', 'CAP-ISO-PROC-013', 'TARGET_KIND_INVALID', 'proc.013.target.kind.invalid', 'PROFILE_FACT', [
      endpoint('invoking', 'INVOKING_PROCESS', 'element.processing', 0), endpoint('invoked', 'INVOKED_PROCESS', 'element.raw.material', 1)]),
    selfIdentityMismatch(),
    missingDuration('G-OPL-PROC-015.DURATION_MISSING.BLOCKED', 'CAP-ISO-PROC-015', 'proc.015.duration.missing', 'g-opl-proc-015-duration-missing-blocked', 'Overtime'),
    missingDuration('G-OPL-PROC-016.DURATION_MISSING.BLOCKED', 'CAP-ISO-PROC-016', 'proc.016.duration.missing', 'g-opl-proc-016-duration-missing-blocked', 'Undertime')
  ];
}

function endpointMismatch(caseId, capabilityId, variantKey, slug, family, endpoints) {
  return { caseId, capabilityId, variantKey, expectedErrorCode: 'ENDPOINT_KIND_MISMATCH', slug, family, endpoints };
}

function stateOwnerMismatch(caseId, capabilityId, variantKey, slug, family, endpoints, mismatch = 'DEFAULT') {
  return { caseId, capabilityId, variantKey, expectedErrorCode: 'STATE_OWNER_MISMATCH', slug, family, endpoints, stateOwnerMismatch: mismatch };
}

function selfIdentityMismatch() {
  return {
    caseId: 'G-OPL-PROC-014.SELF_IDENTITY_MISMATCH.BLOCKED', capabilityId: 'CAP-ISO-PROC-014', variantKey: 'SELF_IDENTITY_MISMATCH',
    expectedErrorCode: 'ENDPOINT_KIND_MISMATCH', slug: 'proc.014.self.identity.mismatch', family: 'PROFILE_FACT', addHandlingProcess: true,
    endpoints: [endpoint('invoking', 'INVOKING_PROCESS', 'element.processing', 0), endpoint('invoked', 'INVOKED_PROCESS', 'element.handling', 1)]
  };
}

function missingDuration(caseId, capabilityId, slug, fixtureStem, sourceEntityId) {
  return {
    caseId, capabilityId, variantKey: 'DURATION_MISSING', expectedErrorCode: 'INVALID_ARGUMENT', slug, fixtureStem,
    family: 'PROFILE_FACT', sourceEntityId: `profile.fact.exception.${sourceEntityId.toLowerCase()}`,
    endpoints: [endpoint('monitored', 'MONITORED_PROCESS', 'element.processing', 0), endpoint('handling', 'HANDLING_PROCESS', 'element.processing', 1)]
  };
}

function endpoint(name, role, targetId, ordinal) {
  return { endpoint_id: `endpoint.${name}`, role, target_kind: 'ELEMENT', target_id: targetId, ordinal };
}

function stateEndpoint(name, role, targetId, ordinal) {
  return { endpoint_id: `endpoint.${name}`, role, target_kind: 'STATE', target_id: targetId, ordinal };
}

function candidateFixture(baseRevision, definition) {
  const candidate = structuredClone(baseRevision);
  delete candidate.text_artifact;
  delete candidate.text_traces;
  delete candidate.validation_summary;
  delete candidate.revision_digest;
  candidate.revision_id = `revision.golden.${definition.slug}`;
  candidate.revision_sequence = baseRevision.revision_sequence + 1;
  candidate.parent_revision_id = baseRevision.revision_id;
  candidate.facts = [{
    fact_id: `fact.golden.${definition.slug}`,
    fact_family: definition.family,
    capability_ref: {
      capability_id: definition.capabilityId,
      profile_id: baseRevision.profile_binding.profile.id,
      profile_version: baseRevision.profile_binding.profile.version
    },
    endpoints: definition.endpoints,
    direction: 'DIRECTED',
    source: {
      source_profile_id: baseRevision.profile_binding.profile.id,
      source_profile_version: baseRevision.profile_binding.profile.version,
      source_kind: 'GoldenFixture',
      source_entity_id: definition.sourceEntityId ?? `profile.fact.${definition.slug}`
    },
    normalization: { level: 'CORE' }
  }];
  candidate.occurrences = candidate.occurrences.map((occurrence) => occurrence.occurrence_id === 'occurrence.fact'
    ? { ...occurrence, target_id: candidate.facts[0].fact_id, construct_role: 'PROCEDURAL_LINK' } : occurrence);

  if (definition.addHandlingProcess) {
    const process = candidate.elements.find((element) => element.element_id === 'element.processing');
    candidate.elements.push({ ...process, element_id: 'element.handling', name: { ...process.name, local_name: 'Handling' }, state_ids: [] });
  }
  if (definition.stateOwnerMismatch) applyStateOwnerMismatch(candidate, definition.stateOwnerMismatch);
  return candidate;
}

function applyStateOwnerMismatch(candidate, mismatch) {
  if (mismatch === 'INPUT') {
    candidate.states.find((state) => state.state_id === 'state.raw.available').owner_element_id = 'element.processing';
    addState(candidate, 'state.raw.output', 'element.raw.material', 'output');
    return;
  }
  if (mismatch === 'OUTPUT') {
    addState(candidate, 'state.raw.output', 'element.processing', 'output');
    return;
  }
  candidate.states.find((state) => state.state_id === 'state.raw.available').owner_element_id = 'element.processing';
}

function addState(candidate, stateId, ownerId, localName) {
  const source = candidate.states.find((state) => state.state_id === 'state.raw.available');
  candidate.states.push({ ...source, state_id: stateId, owner_element_id: ownerId, name: { ...source.name, local_name: localName } });
  const rawMaterial = candidate.elements.find((element) => element.element_id === 'element.raw.material');
  rawMaterial.state_ids = [...rawMaterial.state_ids, stateId];
}

function manifestCase(requirement, definition, references) {
  return {
    case_id: requirement.case_id,
    capability_id: requirement.capability_id,
    variant_key: requirement.variant_key,
    expectation: 'BLOCKED',
    base_revision_fixture: 'golden/fixtures/base-golden.proc.001.json',
    input_revision_fixture: fixtureRelativePath(definition),
    profile_ref: references.profile_ref,
    rule_set_ref: references.rule_set_ref,
    grammar_ref: references.grammar_ref,
    symbol_catalog_ref: references.symbol_catalog_ref,
    normalization_adapter_ref: references.normalization_adapter_ref,
    binding_digest: references.binding_digest,
    expected_error_code: requirement.expected_error_code,
    expected_transaction: zeroTransaction()
  };
}

function fixtureRelativePath(definition) {
  return `golden/fixtures/${definition.fixtureStem ?? `g-opl-${definition.slug.replaceAll('.', '-')}-blocked`}.json`;
}

function zeroTransaction() {
  return {
    revision_delta: 0,
    revision_parent_delta: 0,
    text_artifact_delta: 0,
    text_trace_delta: 0,
    finding_delta: 0,
    operation_delta: 0,
    receipt_delta: 0,
    draft_head_changed: false
  };
}

async function syncJson(path, expected, writeOutput) {
  const bytes = `${JSON.stringify(expected, null, 2)}\n`;
  try {
    const actual = await readFile(path, 'utf8');
    if (actual === bytes) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!writeOutput) throw new Error(`Generated Golden asset is out of date: ${path}`);
  await writeFile(path, bytes);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
