import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { e2eCases, e2eFixture, visualFixture, visualSubjects } from '../tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs';

const args = parseArgs(process.argv.slice(2));
const write = args.write === true;
const handoffPath = resolve(args.handoff ?? 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json');
const fixtureRoot = resolve(args.fixtureRoot ?? 'tests/e2e/release/dev-canvas-06/fixtures');
const epoch = sourceDateEpoch(args.sourceDateEpoch);
const catalogPath = resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json');
const handoff = await readJson(handoffPath);

if (handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06') throw new Error('CANVAS06_HANDOFF_NOT_READY');
const generatedAt = new Date(epoch * 1000).toISOString();

if (write) {
  for (const subjectId of visualSubjects) await writeJson(resolve(fixtureRoot, 'visual', `${subjectId}.json`), visualFixture(subjectId));
  for (const caseId of e2eCases) {
    const fixture = e2eFixture(caseId);
    await writeJson(resolve(fixtureRoot, 'e2e', `${caseId}.base.json`), { ...fixture, fixture_kind: 'BASE' });
    await writeJson(resolve(fixtureRoot, 'e2e', `${caseId}.input.json`), { ...fixture, fixture_kind: 'INPUT' });
  }
}

const factoryRef = await fileRef(resolve(fixtureRoot, 'factories', 'common-fixture-factory.mjs'), fixtureRoot, 'FACTORY_SOURCE');
const catalog = {
  schema_id: 'OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001',
  schema_version: '0.1',
  catalog_id: `dev-canvas-06.common-fixtures.${handoff.active_binding.binding_digest.slice(0, 12)}`,
  catalog_version: '0.1.0',
  generated_at: generatedAt,
  generator_ref: await fileRef(resolve('scripts/author-canvas06-common-fixtures.mjs'), fixtureRoot, 'GENERATOR_SOURCE', 'scripts/author-canvas06-common-fixtures.mjs'),
  source_binding: handoff.active_binding,
  visual_subjects: await Promise.all(visualSubjects.map(async subjectId => ({
    subject_id: subjectId,
    factory_id: `factory.visual.${subjectId.toLowerCase()}`,
    factory_source_ref: factoryRef,
    fixture_ref: await fileRef(resolve(fixtureRoot, 'visual', `${subjectId}.json`), fixtureRoot, 'FIXTURE'),
    expected_revision: visualFixture(subjectId).expected_revision,
    focus_target_id: visualFixture(subjectId).focus_target_id,
    focus_anchor: 'CENTER',
    expected_cells: 3,
    critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'CANVAS' }]
  }))),
  e2e_cases: await Promise.all(e2eCases.map(async caseId => {
    const fixture = e2eFixture(caseId);
    return {
      case_id: caseId,
      factory_id: `factory.e2e.${caseId.toLowerCase()}`,
      factory_source_ref: factoryRef,
      base_fixture_ref: await fileRef(resolve(fixtureRoot, 'e2e', `${caseId}.base.json`), fixtureRoot, 'FIXTURE'),
      input_ref: await fileRef(resolve(fixtureRoot, 'e2e', `${caseId}.input.json`), fixtureRoot, 'INPUT'),
      actions: [fixture.action],
      assertion_ids: ['REVISION_OR_BLOCKED_MATCHED', 'REOPEN_MATCHED']
    };
  })),
  summary: { visual_subject_count: 8, e2e_case_count: 16 }
};

await validate(catalog);
if (write) await writeJson(catalogPath, catalog);
else {
  const committed = await readJson(catalogPath);
  if (JSON.stringify(committed) !== JSON.stringify(catalog)) throw new Error('CANVAS06_COMMON_FIXTURE_CATALOG_DRIFT');
}

async function validate(value) {
  const schema = await readJson(resolve('docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json'));
  const validateSchema = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);
  if (!validateSchema(value)) throw new Error(`CANVAS06_COMMON_FIXTURE_SCHEMA_INVALID ${JSON.stringify(validateSchema.errors)}`);
}

async function fileRef(path, root, kind, logicalPath) {
  const bytes = await readFile(path);
  return { kind, path: logicalPath ?? relative(root, path), byte_length: bytes.length, sha256: sha(bytes) };
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function sourceDateEpoch(value) { const epoch = Number(value ?? process.env.SOURCE_DATE_EPOCH); if (!Number.isInteger(epoch) || epoch < 0) throw new Error('CANVAS06_SOURCE_DATE_EPOCH_REQUIRED'); return epoch; }
function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value === '--write') result.write = true; else if (value === '--handoff') result.handoff = values[++index]; else if (value === '--fixture-root') result.fixtureRoot = values[++index]; else if (value === '--source-date-epoch') result.sourceDateEpoch = values[++index]; else throw new Error(`Unknown argument: ${value}`); } return result; }
