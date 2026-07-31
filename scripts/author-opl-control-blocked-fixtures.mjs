import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const manifestPath = resolve(profileRoot, 'golden/opm-opl-golden-manifest.json');
const baseRevisionFixture = 'golden/fixtures/base-golden.proc.001.json';
const write = process.argv.includes('--write');

const [catalog, manifest] = await Promise.all([readJson(catalogPath), readJson(manifestPath)]);
const requirements = catalog.requirements.filter((item) => item.family === 'CTRL' && item.expectation === 'BLOCKED');
const definitions = blockedDefinitions();
const definitionByCaseId = new Map(definitions.map((definition) => [definition.caseId, definition]));
if (requirements.length !== 15 || definitionByCaseId.size !== requirements.length || requirements.some((item) => !definitionByCaseId.has(item.case_id))) {
  throw new Error('Control BLOCKED fixture definitions do not exactly match the coverage catalog');
}

for (const definition of definitions) {
  const source = await readJson(resolve(profileRoot, definition.sourceFixturePath));
  if (source.facts.length !== 1) throw new Error(`Control source fixture must contain one fact: ${definition.caseId}`);
  const candidate = structuredClone(source);
  candidate.revision_id = `revision.${slug(definition.caseId)}`;
  candidate.facts[0].capability_ref.capability_id = definition.baseCapabilityId ?? candidate.facts[0].capability_ref.capability_id;
  candidate.facts[0].fact_family = definition.factFamily ?? candidate.facts[0].fact_family;
  candidate.facts[0].modifiers = definition.modifiers;
  await syncJson(resolve(profileRoot, fixturePath(definition)), candidate, write);
}

const references = manifest.cases[0];
const generatedCases = requirements.map((requirement) => {
  const definition = definitionByCaseId.get(requirement.case_id);
  return {
    case_id: requirement.case_id,
    capability_id: requirement.capability_id,
    ...(requirement.base_fact_capability_id ? { base_fact_capability_id: requirement.base_fact_capability_id } : {}),
    variant_key: requirement.variant_key,
    expectation: 'BLOCKED',
    base_revision_fixture: baseRevisionFixture,
    input_revision_fixture: fixturePath(definition),
    profile_ref: references.profile_ref,
    rule_set_ref: references.rule_set_ref,
    grammar_ref: references.grammar_ref,
    symbol_catalog_ref: references.symbol_catalog_ref,
    normalization_adapter_ref: references.normalization_adapter_ref,
    binding_digest: references.binding_digest,
    expected_error_code: requirement.expected_error_code,
    expected_transaction: zeroTransaction()
  };
});
const expectedManifest = {
  ...manifest,
  cases: [
    ...manifest.cases.filter((item) => !item.case_id.startsWith('G-OPL-CTRL-')),
    ...generatedCases,
    ...manifest.cases.filter((item) => item.case_id.startsWith('G-OPL-CTRL-') && item.expectation === 'PASS')
  ]
};
if (write) {
  await syncJson(manifestPath, expectedManifest, true);
} else {
  const expectedBlocked = expectedManifest.cases.filter((item) => item.case_id.startsWith('G-OPL-CTRL-') && item.expectation === 'BLOCKED');
  const actualBlocked = manifest.cases.filter((item) => item.case_id.startsWith('G-OPL-CTRL-') && item.expectation === 'BLOCKED');
  if (JSON.stringify(actualBlocked) !== JSON.stringify(expectedBlocked)) {
    throw new Error('Control BLOCKED Golden manifest cases are out of date');
  }
}

function blockedDefinitions() {
  const pair = (capability, segment = 'PROCESS_INPUT') => [
    { modifier_id: 'control.capability', value: capability }, { modifier_id: 'control.segment', value: segment }
  ];
  const consumption = 'golden/fixtures/g-opl-proc-001-consumption-object-pass.json';
  return [
    definition('G-OPL-CTRL-001.RESULT.BLOCKED', 'golden/fixtures/g-opl-proc-002-result-object-pass.json', pair('CAP-ISO-CTRL-001')),
    definition('G-OPL-CTRL-001.STATE_RESULT.BLOCKED', 'golden/fixtures/g-opl-proc-007-result-state-pass.json', pair('CAP-ISO-CTRL-001')),
    definition('G-OPL-CTRL-001.EFFECT_OUTPUT_SEGMENT.BLOCKED', 'golden/fixtures/g-opl-proc-003-effect-object-pass.json', pair('CAP-ISO-CTRL-001', 'PROCESS_OUTPUT')),
    definition('G-OPL-CTRL-001.NON_INPUT_SEGMENT.BLOCKED', consumption, pair('CAP-ISO-CTRL-001', 'PROCESS_OUTPUT')),
    definition('G-OPL-CTRL-001.BASE_CAPABILITY_MISMATCH.BLOCKED', consumption, pair('CAP-ISO-CTRL-002')),
    definition('G-OPL-CTRL-001.MISSING_CONTROL_CAPABILITY.BLOCKED', consumption, [{ modifier_id: 'control.segment', value: 'PROCESS_INPUT' }]),
    definition('G-OPL-CTRL-001.MISSING_CONTROL_SEGMENT.BLOCKED', consumption, [{ modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-001' }]),
    definition('G-OPL-CTRL-001.DUPLICATE_CONTROL_CAPABILITY.BLOCKED', consumption, [
      { modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-001' }, { modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-005' }, { modifier_id: 'control.segment', value: 'PROCESS_INPUT' }]),
    definition('G-OPL-CTRL-001.DUPLICATE_CONTROL_SEGMENT.BLOCKED', consumption, [
      { modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-001' }, { modifier_id: 'control.segment', value: 'PROCESS_INPUT' }, { modifier_id: 'control.segment', value: 'PROCESS_OUTPUT' }]),
    definition('G-OPL-CTRL-001.EVENT_CONDITION_COMBINATION.BLOCKED', consumption, [
      { modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-001' }, { modifier_id: 'control.capability', value: 'CAP-ISO-CTRL-005' }, { modifier_id: 'control.segment', value: 'PROCESS_INPUT' }]),
    definition('G-OPL-CTRL-001.UNKNOWN_CONTROL_CAPABILITY.BLOCKED', consumption, pair('CAP-ISO-CTRL-999')),
    definition('G-OPL-CTRL-001.MODIFIER_CAPABILITY_REF_MISMATCH.BLOCKED', consumption, [
      { modifier_id: 'control.capability_ref', value: 'CAP-ISO-CTRL-001' }, { modifier_id: 'control.segment', value: 'PROCESS_INPUT' }]),
    definition('G-OPL-CTRL-001.MODIFIER_VALUE_REF_MISMATCH.BLOCKED', consumption, pair('CAP-ISO-CTRL-001@0.2.0')),
    definition('G-OPL-CTRL-001.OPTION_PAYLOAD_MISMATCH.BLOCKED', consumption, [...pair('CAP-ISO-CTRL-001'), { modifier_id: 'control.option_id', value: 'CAP-ISO-CTRL-001' }]),
    definition('G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED', consumption, [], 'CAP-ISO-CTRL-001', 'CONTROL')
  ];
}

function definition(caseId, sourceFixturePath, modifiers, baseCapabilityId, factFamily) {
  return { caseId, sourceFixturePath, modifiers, baseCapabilityId, factFamily };
}
function fixturePath(definition) { return `golden/fixtures/${slug(definition.caseId)}.json`; }
function slug(caseId) { return caseId.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function zeroTransaction() {
  return { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false };
}
async function syncJson(path, expected, writeOutput) {
  const bytes = `${JSON.stringify(expected, null, 2)}\n`;
  try { if (await readFile(path, 'utf8') === bytes) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!writeOutput) throw new Error(`Generated Golden asset is out of date: ${path}`);
  await writeFile(path, bytes);
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
