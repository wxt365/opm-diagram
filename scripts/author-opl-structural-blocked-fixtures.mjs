import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const manifestPath = resolve(profileRoot, 'golden/opm-opl-golden-manifest.json');
const baseRevisionFixture = 'golden/fixtures/base-golden.struct.003.json';
const write = process.argv.includes('--write');
const [catalog, manifest] = await Promise.all([readJson(catalogPath), readJson(manifestPath)]);
const requirements = catalog.requirements.filter((item) => item.family === 'STRUCT' && item.expectation === 'BLOCKED');

if (requirements.length !== 16 || new Set(requirements.map((item) => item.case_id)).size !== requirements.length) {
  throw new Error('Structural BLOCKED coverage catalog must stay frozen at 16 unique requirements');
}

const references = manifest.cases[0];
const generatedCases = requirements.map((requirement) => ({
  case_id: requirement.case_id,
  capability_id: requirement.capability_id,
  variant_key: requirement.variant_key,
  expectation: 'BLOCKED',
  base_revision_fixture: baseRevisionFixture,
  input_revision_fixture: fixturePath(requirement),
  profile_ref: references.profile_ref,
  rule_set_ref: references.rule_set_ref,
  grammar_ref: references.grammar_ref,
  symbol_catalog_ref: references.symbol_catalog_ref,
  normalization_adapter_ref: references.normalization_adapter_ref,
  binding_digest: references.binding_digest,
  expected_error_code: requirement.expected_error_code,
  expected_transaction: zeroTransaction()
}));
const expected = {
  ...manifest,
  cases: [...manifest.cases.filter((item) => !item.case_id.startsWith('G-OPL-STRUCT-') || item.expectation === 'PASS'), ...generatedCases]
};

if (write) await syncJson(manifestPath, expected, true);
else {
  const actual = manifest.cases.filter((item) => item.case_id.startsWith('G-OPL-STRUCT-') && item.expectation === 'BLOCKED');
  if (JSON.stringify(actual) !== JSON.stringify(generatedCases)) throw new Error('Structural BLOCKED Golden manifest cases are out of date');
}

function fixturePath(requirement) { return `golden/fixtures/${requirement.case_id.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')}.json`; }
function zeroTransaction() { return { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false }; }
async function syncJson(path, value, writeOutput) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  try { if (await readFile(path, 'utf8') === bytes) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!writeOutput) throw new Error(`Generated Structural BLOCKED Golden manifest is out of date: ${path}`);
  await writeFile(path, bytes);
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
