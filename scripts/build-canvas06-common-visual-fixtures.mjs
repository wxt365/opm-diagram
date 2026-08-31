import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCommonVisualFixture, e2eCases, e2eFixture, visualSubjects } from '../tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs';
import { buildCommonSetupPlan, COMMON_DRIVER_SOURCE_PATH, COMMON_SETUP_PLAN_PATH } from './canvas06-e2e-common-setup-plan.mjs';

const root = resolve('.');
const generatorPath = fileURLToPath(import.meta.url);
const factoryPath = fileURLToPath(new URL('../tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs', import.meta.url));
const commonDriverPath = fileURLToPath(new URL('../tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs', import.meta.url));

if (resolve(process.argv[1] ?? '') === generatorPath) await main();

async function main() {
  try {
  const options = parseOptions(process.argv.slice(2));
  const handoffPath = resolveRequired(options, 'handoff');
  const target = resolveRequired(options, 'fixture-root');
  const epoch = integer(required(options, 'source-date-epoch'));
    await buildCommonVisualFixtures({ handoffPath, target, epoch });
  } catch (error) {
    const code = error.code ?? 'GOLDEN_COMMON_INTERNAL_ERROR';
    const exitCode = error.exitCode ?? 4;
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = exitCode;
  }
}

export async function buildCommonVisualFixtures({ handoffPath, target, epoch }, overrides = {}) {
  const runtime = {
    fsyncTree,
    verifyStaging,
    rename,
    fsyncParent: fsyncDirectory,
    quarantine: quarantineFinal,
    ...overrides
  };
  await requireFreshTarget(target);
  await requireNoResidual(target);
  await assertSourceOwner(generatorPath, 'scripts/build-canvas06-common-visual-fixtures.mjs');
  await assertSourceOwner(factoryPath, 'tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
  await assertSourceOwner(commonDriverPath, COMMON_DRIVER_SOURCE_PATH);
  const handoff = await json(handoffPath);
  if (handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || !handoff.active_binding) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'READY Handoff is required.');
  const staging = `${target}.staging-${process.pid}`;
  await requireFreshTarget(staging);
  let renamed = false;
  try {
    await mkdir(staging, { recursive: true });
    const fixtures = cacheE2eFixtures();
    await writeFixtures(staging, handoff.active_binding, epoch, fixtures);
    await mirror(staging, generatorPath, 'sources/scripts/build-canvas06-common-visual-fixtures.mjs');
    await mirror(staging, factoryPath, 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
    const catalog = await catalogFor(staging, handoff.active_binding, epoch, fixtures);
    await writeJson(resolve(staging, 'dev-canvas-06-common-fixture-catalog.json'), catalog);
    const plan = buildCommonSetupPlan({
      generatedAt: new Date(epoch * 1000).toISOString(),
      sourceBinding: handoff.active_binding,
      generatorRef: catalog.generator_ref,
      commonFixtureCatalogRef: await fileRef(staging, 'dev-canvas-06-common-fixture-catalog.json', 'COMMON_FIXTURE_CATALOG'),
      commonDriverRef: await externalFileRef(commonDriverPath, COMMON_DRIVER_SOURCE_PATH, 'E2E_DRIVER_SOURCE'),
      catalogCases: catalog.e2e_cases
    });
    await writeJson(resolve(staging, COMMON_SETUP_PLAN_PATH), plan);
    await runtime.fsyncTree(staging);
    await runtime.verifyStaging({ handoffPath, staging });
    await runtime.rename(staging, target);
    renamed = true;
    try {
      await runtime.fsyncParent(dirname(target));
    } catch (error) {
      const quarantine = await runtime.quarantine(target);
      fail('GOLDEN_COMMON_INTERNAL_ERROR', 4, `Parent fsync failed; output isolated at: ${quarantine}`);
    }
  } catch (error) {
    if (!renamed) await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function verifyStaging({ handoffPath, staging }) {
  const verify = spawnSync(process.execPath, [resolve(root, 'scripts/verify-canvas06-common-visual-fixtures.mjs'), '--handoff', handoffPath, '--fixture-root', staging, '--catalog', 'dev-canvas-06-common-fixture-catalog.json'], { cwd: root, encoding: 'utf8' });
  if (verify.status !== 0) fail('GOLDEN_COMMON_INTERNAL_ERROR', 4, verify.stderr || 'Staging verifier failed.');
}

async function writeFixtures(staging, binding, epoch, fixtures) {
  for (const subjectId of visualSubjects) await writeJson(resolve(staging, 'visual', `${subjectId}.json`), buildCommonVisualFixture(subjectId, binding, epoch));
  for (const caseId of e2eCases) {
    const fixture = fixtures.get(caseId);
    await writeJson(resolve(staging, 'e2e', `${caseId}.base.json`), { ...fixture, fixture_kind: 'BASE' });
    await writeJson(resolve(staging, 'e2e', `${caseId}.input.json`), { ...fixture, fixture_kind: 'INPUT' });
  }
}

async function catalogFor(staging, binding, epoch, fixtures) {
  const factoryRef = await fileRef(staging, 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs', 'FACTORY_SOURCE');
  const visual = await Promise.all(visualSubjects.map(async subjectId => {
    const fixture = await json(resolve(staging, 'visual', `${subjectId}.json`));
    return { subject_id: subjectId, factory_id: fixture.factory_id, factory_source_ref: factoryRef, fixture_ref: await fileRef(staging, `visual/${subjectId}.json`, 'FIXTURE'), expected_revision: fixture.revision_document.revision_id, focus_target_id: fixture.capture_setup.expected_focus_target_id, focus_anchor: fixture.capture_setup.expected_focus_anchor, expected_cells: fixture.capture_setup.expected_rendered_cell_count, critical_regions: criticalRegions(fixture) };
  }));
  const e2e = await Promise.all(e2eCases.map(async caseId => {
    const fixture = fixtures.get(caseId);
    return { case_id: caseId, factory_id: `factory.e2e.${caseId.toLowerCase()}`, factory_source_ref: factoryRef, base_fixture_ref: await fileRef(staging, `e2e/${caseId}.base.json`, 'FIXTURE'), input_ref: await fileRef(staging, `e2e/${caseId}.input.json`, 'INPUT'), actions: [fixture.action], assertion_ids: ['REVISION_OR_BLOCKED_MATCHED', 'REOPEN_MATCHED'] };
  }));
  const value = { schema_id: 'OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001', schema_version: '0.1', catalog_id: `dev-canvas-06.common-fixtures.${binding.binding_digest.slice(0, 12)}`, catalog_version: '0.2.0', generated_at: new Date(epoch * 1000).toISOString(), generator_ref: await fileRef(staging, 'sources/scripts/build-canvas06-common-visual-fixtures.mjs', 'GENERATOR_SOURCE'), source_binding: binding, visual_subjects: visual, e2e_cases: e2e, summary: { visual_subject_count: 8, e2e_case_count: 16 } };
  const schema = await json(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json'));
  const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  if (!validate(value)) fail('GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID', 2, JSON.stringify(validate.errors));
  return value;
}

function criticalRegions(fixture) {
  const value = fixture.expected_projection;
  const regions = [{ region_id: 'FOCUS_BBOX', kind: 'CANVAS' }];
  if (fixture.subject_id === 'LONG_LABELS') regions.push({ region_id: 'LABEL_SLOT:label.primary', kind: 'LABEL' });
  if (fixture.subject_id === 'FUNDAMENTAL_FAN') regions.push({ region_id: 'JUNCTION_MARKER', kind: 'JUNCTION' }, { region_id: 'COMPLETENESS', kind: 'LABEL' });
  if (value.catalog.open) regions.push({ region_id: 'CATALOG', kind: 'TOOLBAR' });
  return regions;
}

async function mirror(staging, source, destination) {
  const destinationPath = resolve(staging, destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(source, destinationPath);
  const [left, right] = await Promise.all([readFile(source), readFile(destinationPath)]);
  if (!left.equals(right)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Mirror differs: ${destination}`);
}

function cacheE2eFixtures() {
  if (e2eCases.length !== 16 || new Set(e2eCases).size !== 16) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'Factory case set is invalid.');
  const cache = new Map();
  for (const caseId of e2eCases) cache.set(caseId, e2eFixture(caseId));
  return cache;
}

async function fileRef(base, path, kind) { const target = resolveInside(base, path); const info = await stat(target); return { kind, path, byte_length: info.size, sha256: sha(await readFile(target)) }; }
async function externalFileRef(target, path, kind) { const info = await stat(target); return { kind, path, byte_length: info.size, sha256: sha(await readFile(target)) }; }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function requireFreshTarget(path) { try { await lstat(path); fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Output already exists: ${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
async function requireNoResidual(target) { const prefix = `${basename(target)}.`; let names; try { names = await readdir(dirname(target)); } catch (error) { if (error.code === 'ENOENT') return; throw error; } if (names.some(name => name.startsWith(prefix) && (name.startsWith(`${prefix}staging-`) || name.startsWith(`${prefix}quarantine-`)))) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Output residual exists for: ${target}`); }
async function quarantineFinal(target) { const quarantine = `${target}.quarantine-${process.pid}`; await requireFreshTarget(quarantine); await rename(target, quarantine); return quarantine; }
async function assertSourceOwner(path, logical) { const first = await lstat(path); if (!first.isFile() || first.isSymbolicLink() || first.nlink !== 1 || basename(path) !== basename(logical)) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Invalid source owner: ${logical}`); const actual = await realpath(path); const second = await lstat(actual); if (actual !== path || !second.isFile() || second.isSymbolicLink() || second.nlink !== 1) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Invalid source owner: ${logical}`); }
async function fsyncTree(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) await fsyncTree(child); else await fsyncFile(child); } await fsyncDirectory(path); }
async function fsyncFile(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
function parseOptions(values) { const allowed = new Set(['handoff', 'fixture-root', 'source-date-epoch']); const result = new Map(); for (let index = 0; index < values.length; index += 2) { const flag = values[index]; const value = values[index + 1]; if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || value === undefined || result.has(flag.slice(2))) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'Invalid builder options.'); result.set(flag.slice(2), value); } return result; }
function required(values, key) { const value = values.get(key); if (!value) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Missing --${key}.`); return value; }
function resolveRequired(values, key) { return resolve(required(values, key)); }
function resolveInside(base, path) { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Unsafe path: ${path}`); const target = resolve(base, path); if (!target.startsWith(`${resolve(base)}/`)) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Escaped path: ${path}`); return target; }
function integer(value) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 0) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'Invalid SOURCE_DATE_EPOCH.'); return parsed; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code, exitCode, message) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
