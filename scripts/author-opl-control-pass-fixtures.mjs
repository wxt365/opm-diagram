import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const definitionsPath = resolve(profileRoot, 'golden/opm-opl-control-pass-definitions.json');
const write = process.argv.includes('--write');

const [catalog, definitions] = await Promise.all([readJson(catalogPath), readJson(definitionsPath)]);
const requirements = catalog.requirements.filter((item) => item.family === 'CTRL' && item.expectation === 'PASS');
const definitionByCaseId = new Map(definitions.map((definition) => [definition.case_id, definition]));
if (requirements.length !== 20 || definitionByCaseId.size !== requirements.length
  || requirements.some((requirement) => {
    const definition = definitionByCaseId.get(requirement.case_id);
    return definition?.capability_id !== requirement.capability_id
      || definition?.base_fact_capability_id !== requirement.base_fact_capability_id
      || definition?.variant_key !== requirement.variant_key;
  })) {
  throw new Error('Control PASS fixture definitions do not exactly match the coverage catalog');
}

for (const definition of definitions) {
  const source = await readJson(resolve(profileRoot, definition.source_fixture_path));
  if (source.facts.length !== 1 || source.facts[0].capability_ref.capability_id !== definition.base_fact_capability_id) {
    throw new Error(`Control base fixture does not match definition: ${definition.case_id}`);
  }
  const candidate = structuredClone(source);
  candidate.revision_id = `revision.${slug(definition.case_id)}`;
  candidate.facts[0].modifiers = [
    { modifier_id: 'control.capability', value: definition.capability_id },
    { modifier_id: 'control.segment', value: 'PROCESS_INPUT' }
  ];
  await syncJson(resolve(profileRoot, fixturePath(definition)), candidate, write);
}

function fixturePath(definition) { return `golden/fixtures/${slug(definition.case_id)}.json`; }
function slug(caseId) { return caseId.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
async function syncJson(path, expected, writeOutput) {
  const bytes = `${JSON.stringify(expected, null, 2)}\n`;
  try { if (await readFile(path, 'utf8') === bytes) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!writeOutput) throw new Error(`Generated Golden asset is out of date: ${path}`);
  await writeFile(path, bytes);
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
