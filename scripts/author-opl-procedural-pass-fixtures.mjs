import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const definitionsPath = resolve(profileRoot, 'golden/opm-opl-procedural-pass-definitions.json');
const basePath = resolve(profileRoot, 'golden/fixtures/base-golden.proc.001.json');
const write = process.argv.includes('--write');

const [catalog, definitions, base] = await Promise.all([readJson(catalogPath), readJson(definitionsPath), readJson(basePath)]);
const requirements = catalog.requirements.filter((item) => item.family === 'PROC' && item.expectation === 'PASS');
const definitionByCaseId = new Map(definitions.map((definition) => [definition.case_id, definition]));
if (requirements.length !== 16 || definitionByCaseId.size !== requirements.length
  || requirements.some((requirement) => definitionByCaseId.get(requirement.case_id)?.capability_id !== requirement.capability_id
    || definitionByCaseId.get(requirement.case_id)?.variant_key !== requirement.variant_key)) {
  throw new Error('Procedural PASS fixture definitions do not exactly match the coverage catalog');
}

for (const definition of definitions) {
  await syncJson(resolve(profileRoot, fixturePath(definition)), candidateFixture(base, definition), write);
}

function candidateFixture(baseRevision, definition) {
  const candidate = structuredClone(baseRevision);
  delete candidate.text_artifact;
  delete candidate.text_traces;
  delete candidate.validation_summary;
  delete candidate.revision_digest;
  const slug = definition.case_id.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  candidate.revision_id = `revision.${slug}`;
  candidate.revision_sequence = baseRevision.revision_sequence + 1;
  candidate.parent_revision_id = baseRevision.revision_id;
  candidate.facts = [{
    fact_id: `fact.${slug}`,
    fact_family: definition.fact_family,
    capability_ref: { capability_id: definition.capability_id, profile_id: baseRevision.profile_binding.profile.id, profile_version: baseRevision.profile_binding.profile.version },
    endpoints: definition.endpoints.map(([name, role, targetKind, targetId], ordinal) => ({ endpoint_id: `endpoint.${name}`, role, target_kind: targetKind, target_id: targetId, ordinal })),
    direction: 'DIRECTED',
    ...(definition.modifiers ? { modifiers: definition.modifiers.map(([modifier_id, value]) => ({ modifier_id, value })) } : {}),
    source: { source_profile_id: baseRevision.profile_binding.profile.id, source_profile_version: baseRevision.profile_binding.profile.version, source_kind: 'GoldenFixture', source_entity_id: `profile.fact.${slug}` },
    normalization: { level: 'CORE' }
  }];
  candidate.occurrences = candidate.occurrences.map((occurrence) => occurrence.occurrence_id === 'occurrence.fact'
    ? { ...occurrence, target_id: candidate.facts[0].fact_id, construct_role: 'PROCEDURAL_LINK' } : occurrence);
  if (definition.output_state) addOutputState(candidate);
  if (definition.handling_process) addHandlingProcess(candidate);
  return candidate;
}

function addOutputState(candidate) {
  const source = candidate.states.find((state) => state.state_id === 'state.raw.available');
  candidate.states.push({ ...source, state_id: 'state.raw.processed', name: { ...source.name, local_name: 'processed' } });
  const raw = candidate.elements.find((element) => element.element_id === 'element.raw.material');
  raw.state_ids = [...raw.state_ids, 'state.raw.processed'];
  addOccurrence(candidate, 'occurrence.state.processed', 'STATE', 'state.raw.processed', 'STATE_NODE', 'layout.state');
}

function addHandlingProcess(candidate) {
  const source = candidate.elements.find((element) => element.element_id === 'element.processing');
  candidate.elements.push({ ...source, element_id: 'element.handling', name: { ...source.name, local_name: 'Handling' }, state_ids: [] });
  addOccurrence(candidate, 'occurrence.handling', 'ELEMENT', 'element.handling', 'PROCESS_NODE', 'layout.process');
}

function addOccurrence(candidate, occurrenceId, targetKind, targetId, constructRole, layoutId) {
  candidate.occurrences.push({ occurrence_id: occurrenceId, context_id: 'context.sd.root', target_kind: targetKind, target_id: targetId, ownership: 'OWNED', construct_role: constructRole, layout_id: layoutId });
  const context = candidate.contexts.find((item) => item.context_id === 'context.sd.root');
  context.occurrence_ids = [...context.occurrence_ids, occurrenceId];
}

function fixturePath(definition) {
  return `golden/fixtures/${definition.case_id.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;
}

async function syncJson(path, expected, writeOutput) {
  const bytes = `${JSON.stringify(expected, null, 2)}\n`;
  try { if (await readFile(path, 'utf8') === bytes) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!writeOutput) throw new Error(`Generated Golden asset is out of date: ${path}`);
  await writeFile(path, bytes);
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
