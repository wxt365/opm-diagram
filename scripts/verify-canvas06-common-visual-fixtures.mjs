import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const root = resolve('.');

try {
  const options = parseOptions(process.argv.slice(2));
  const handoff = await json(resolveRequired(options, 'handoff'));
  const fixtureRoot = resolveRequired(options, 'fixture-root');
  const catalogName = required(options, 'catalog');
  if (catalogName !== 'dev-canvas-06-common-fixture-catalog.json') fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'Catalog name is fixed.');
  if (handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || !handoff.active_binding) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'READY Handoff is required.');
  const before = await treeDigest(fixtureRoot);
  await verify(fixtureRoot, handoff.active_binding);
  const after = await treeDigest(fixtureRoot);
  if (before !== after) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, 'Verifier changed the fixture tree.');
} catch (error) {
  process.stderr.write(`${error.code ?? 'GOLDEN_COMMON_INTERNAL_ERROR'}: ${error.message}\n`);
  process.exitCode = error.exitCode ?? 4;
}

async function verify(fixtureRoot, binding) {
  const inventory = await files(fixtureRoot);
  const expected = expectedPaths();
  if (inventory.length !== 43 || JSON.stringify(inventory.map(item => item.path)) !== JSON.stringify(expected)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, 'Fixture root inventory is not the frozen 43-file layout.');
  const catalog = await json(resolveInside(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json'));
  const catalogSchema = await json(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json'));
  const revisionSchema = await json(resolve(root, 'docs/contracts/schemas/opm-revision-v0.2.schema.json'));
  const fixtureSchema = await json(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  ajv.addSchema(revisionSchema);
  const validateCatalog = ajv.compile(catalogSchema);
  const validateFixture = ajv.compile(fixtureSchema);
  if (!validateCatalog(catalog) || catalog.catalog_version !== '0.2.0') fail('GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID', 2, JSON.stringify(validateCatalog.errors));
  if (!same(catalog.source_binding, binding)) fail('GOLDEN_COMMON_BINDING_MISMATCH', 3, 'Catalog binding does not match Handoff.');
  await verifyRef(fixtureRoot, catalog.generator_ref, 'GENERATOR_SOURCE', 'sources/scripts/build-canvas06-common-visual-fixtures.mjs');
  if (catalog.visual_subjects.length !== 8 || catalog.e2e_cases.length !== 16) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, 'Catalog subject count differs.');
  const factoryRef = catalog.visual_subjects[0]?.factory_source_ref;
  await verifyRef(fixtureRoot, factoryRef, 'FACTORY_SOURCE', 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
  for (const [index, subjectId] of subjects().entries()) {
    const item = catalog.visual_subjects[index];
    if (item.subject_id !== subjectId || !same(item.factory_source_ref, factoryRef)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Visual Catalog entry differs: ${subjectId}`);
    await verifyRef(fixtureRoot, item.fixture_ref, 'FIXTURE', `visual/${subjectId}.json`);
    const fixture = await json(resolveInside(fixtureRoot, item.fixture_ref.path));
    if (!validateFixture(fixture)) fail('GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID', 2, `${subjectId}: ${JSON.stringify(validateFixture.errors)}`);
    verifyVisual(fixture, item, binding);
  }
  for (const [index, caseId] of cases().entries()) {
    const item = catalog.e2e_cases[index];
    if (item.case_id !== caseId || !same(item.factory_source_ref, factoryRef)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `E2E Catalog entry differs: ${caseId}`);
    await verifyRef(fixtureRoot, item.base_fixture_ref, 'FIXTURE', `e2e/${caseId}.base.json`);
    await verifyRef(fixtureRoot, item.input_ref, 'INPUT', `e2e/${caseId}.input.json`);
    const base = await json(resolveInside(fixtureRoot, item.base_fixture_ref.path));
    const input = await json(resolveInside(fixtureRoot, item.input_ref.path));
    const expected = expectedE2e(caseId);
    if (!same(base, { ...expected, fixture_kind: 'BASE' }) || !same(input, { ...expected, fixture_kind: 'INPUT' }) || !same(item.actions, [expected.action])) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `E2E fixture differs: ${caseId}`);
  }
}

function verifyVisual(fixture, catalogItem, binding) {
  const { fixture_payload_sha256, ...payload } = fixture;
  if (fixture_payload_sha256 !== sha256Jcs(payload)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Fixture payload digest differs: ${fixture.subject_id}`);
  if (!same(fixture.source_binding, binding)) fail('GOLDEN_COMMON_BINDING_MISMATCH', 3, `Fixture binding differs: ${fixture.subject_id}`);
  const revision = fixture.revision_document;
  if (catalogItem.expected_revision !== revision.revision_id || catalogItem.focus_target_id !== fixture.capture_setup.expected_focus_target_id || catalogItem.focus_anchor !== fixture.capture_setup.expected_focus_anchor) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Catalog join differs: ${fixture.subject_id}`);
  const expectedCells = fixture.expected_projection.committed_cells.length + fixture.expected_projection.transient_cells.length;
  if (catalogItem.expected_cells !== expectedCells || fixture.capture_setup.expected_rendered_cell_count !== expectedCells || fixture.expected_projection.read_revision !== revision.revision_id || fixture.expected_projection.context_id !== revision.model_header.root_context_id || fixture.expected_projection.focus_target_id !== fixture.capture_setup.expected_focus_target_id) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Projection join differs: ${fixture.subject_id}`);
  const artifact = revision.text_artifact;
  const artifactPreimage = { schema_id: 'OPM-DEV-CANVAS-06-EMPTY-TEXT-ARTIFACT-PREIMAGE-001', schema_version: '0.1', revision_id: revision.revision_id, text_artifact: { artifact_id: artifact.artifact_id, modality: artifact.modality, context_id: artifact.context_id, grammar_ref: artifact.grammar_ref, sentences: artifact.sentences }, text_traces: [] };
  if (!same(revision.text_traces, []) || !same(artifact.sentences, []) || artifact.artifact_digest.digest !== sha256Jcs(artifactPreimage)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Empty text artifact differs: ${fixture.subject_id}`);
  const { revision_digest, ...revisionPayload } = revision;
  if (revision_digest.digest !== sha256Jcs(revisionPayload)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Revision digest differs: ${fixture.subject_id}`);
  const index = fixture.index_seed;
  const expectedIndex = indexFor(revision, fixture.project, fixture.generated_at, fixture.subject_id);
  if (!same(index, expectedIndex)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Index projection differs: ${fixture.subject_id}`);
  const expectedCommitted = revision.occurrences.map(item => { const layout = revision.layouts.find(value => value.layout_id === item.layout_id); return { cell_id: item.occurrence_id, layer: 'COMMITTED', target_kind: item.target_kind, target_id: item.target_id, construct_role: item.construct_role, geometry: { x: layout.x, y: layout.y, width: layout.width, height: layout.height, z_order: layout.z_order }, state_roles: item.target_kind === 'STATE' ? revision.states.find(state => state.state_id === item.target_id).state_roles : [], capability_id: item.target_kind === 'FACT' ? revision.facts[0].capability_ref.capability_id : item.target_kind === 'STATE' ? 'CAP-STATE-001' : revision.elements.find(element => element.element_id === item.target_id).capability_ref.capability_id }; }).sort((left, right) => left.cell_id.localeCompare(right.cell_id));
  if (!same(fixture.expected_projection.committed_cells, expectedCommitted)) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Committed projection differs: ${fixture.subject_id}`);
}

function indexFor(revision, project, generatedAt, subjectId) {
  const element_index = revision.elements.map(element => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, element_id: element.element_id, core_kind: element.core_kind, capability_id: element.capability_ref.capability_id, normalized_name: element.name.local_name.toLowerCase() })).sort((left, right) => left.element_id.localeCompare(right.element_id));
  const fact_endpoint_index = revision.facts.flatMap(fact => fact.endpoints.map(endpoint => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, fact_id: fact.fact_id, endpoint_id: endpoint.endpoint_id, endpoint_role: endpoint.role, target_entity_id: endpoint.target_id, ordinal: endpoint.ordinal }))).sort((left, right) => left.fact_id.localeCompare(right.fact_id) || left.ordinal - right.ordinal || left.endpoint_id.localeCompare(right.endpoint_id));
  const occurrence_index = revision.occurrences.map(item => ({ source_revision_id: revision.revision_id, model_id: revision.model_id, context_id: item.context_id, occurrence_id: item.occurrence_id, target_entity_id: item.target_id, ownership: item.ownership })).sort((left, right) => left.context_id.localeCompare(right.context_id) || left.occurrence_id.localeCompare(right.occurrence_id));
  const finding_index = subjectId === 'FINDING_FOCUS' ? [{ source_revision_id: revision.revision_id, model_id: revision.model_id, finding_id: 'finding.visual.finding-focus.001', rule_id: 'RULE-VISUAL-COMMON-001', severity: 'WARNING', category: 'MODEL_QUALITY', context_id: revision.model_header.root_context_id, entity_id: 'fact.visual.finding-focus' }] : [];
  const operation_record = subjectId === 'BLOCKED_FEEDBACK' ? ['validation-blocked', 'revision-conflict', 'readonly'].map((suffix, index) => ({ operation_record_id: `operation-record.visual.blocked-feedback.${suffix}`, project_id: project.project_id, model_id: revision.model_id, operation_id: 'operation.visual.blocked-feedback.seed', aggregate_id: revision.model_id, command_id: `command.visual.blocked-feedback.${suffix}`, input_revision_id: revision.revision_id, result_revision_id: null, result_status: 'BLOCKED', diagnostic_id: `diagnostic.visual.blocked-feedback.${suffix}`, occurred_at: new Date(Date.parse(generatedAt) + index * 1000).toISOString() })) : [];
  return { element_index, fact_endpoint_index, occurrence_index, finding_index, operation_record };
}

async function verifyRef(base, ref, kind, path) {
  if (!ref || ref.kind !== kind || ref.path !== path) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Reference path differs: ${path}`);
  const target = resolveInside(base, path); const info = await regularFile(target);
  if (info.size !== ref.byte_length || sha(await readFile(target)) !== ref.sha256) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Reference bytes differ: ${path}`);
}

function expectedE2e(caseId) {
  const blocked = /AMBIGUOUS|STALE|MISMATCHED|ASSET_MISSING|TEXT_BLOCKED|CONFLICT|PERSISTENCE_FAILED|READONLY/.test(caseId);
  const delta = blocked ? 0 : 1;
  return { fixture_id: `fixture.e2e.${caseId.toLowerCase()}`, case_id: caseId, project_name: `Release E2E ${caseId}`, model_name: `Release E2E ${caseId}`, initial_revision: `revision.e2e.${caseId.toLowerCase()}`, action: { action_id: 'action.001', expected_status: blocked ? 'BLOCKED_MATCHED' : 'PASS_MATCHED', ...(blocked ? { expected_error_code: 'DOMAIN_REJECTED' } : {}), expected_transaction: { revision_delta: delta, revision_parent_delta: delta, text_artifact_delta: delta, text_trace_delta: delta, finding_delta: 0, operation_delta: delta, receipt_delta: delta, draft_head_changed: !blocked }, reopen_checkpoint: { expected_head_changed: !blocked, projection_matches: true, text_trace_matches: true } } };
}

async function files(base) { const result = []; async function walk(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) await walk(child); else { const info = await regularFile(child); result.push({ path: child.slice(`${resolve(base)}/`.length), byte_length: info.size, sha256: sha(await readFile(child)) }); } } } await walk(base); return result.sort((left, right) => left.path.localeCompare(right.path)); }
async function regularFile(path) { const first = await lstat(path); if (!first.isFile() || first.isSymbolicLink() || first.nlink !== 1) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Non-regular file: ${path}`); const second = await lstat(await realpath(path)); if (!second.isFile() || second.isSymbolicLink() || second.nlink !== 1) fail('GOLDEN_COMMON_FIXTURE_REF_MISMATCH', 2, `Non-regular file: ${path}`); return stat(path); }
async function treeDigest(base) { return sha256Jcs(await files(base)); }
function expectedPaths() { return ['dev-canvas-06-common-fixture-catalog.json', ...subjects().map(id => `visual/${id}.json`), ...cases().flatMap(id => [`e2e/${id}.base.json`, `e2e/${id}.input.json`]), 'sources/scripts/build-canvas06-common-visual-fixtures.mjs', 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs'].sort((left, right) => left.localeCompare(right)); }
function subjects() { return ['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK']; }
function cases() { return ['E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES', 'E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION', 'E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN', 'E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP', 'E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED', 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED', 'E2E-CANVAS-005.STALE_OPTION_BLOCKED', 'E2E-CANVAS-006.STATE_IMPACT_CONFIRMED', 'E2E-CANVAS-006.FACT_IMPACT_CONFIRMED', 'E2E-CANVAS-006.STALE_TOKEN_BLOCKED', 'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED', 'E2E-CANVAS-007.ASSET_MISSING', 'E2E-CANVAS-007.TEXT_BLOCKED', 'E2E-CANVAS-007.REVISION_CONFLICT', 'E2E-CANVAS-007.PERSISTENCE_FAILED', 'E2E-CANVAS-007.READONLY']; }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function parseOptions(values) { const allowed = new Set(['handoff', 'fixture-root', 'catalog']); const result = new Map(); for (let index = 0; index < values.length; index += 2) { const flag = values[index]; const value = values[index + 1]; if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || value === undefined || result.has(flag.slice(2))) fail('GOLDEN_COMMON_INPUT_INVALID', 2, 'Invalid verifier options.'); result.set(flag.slice(2), value); } return result; }
function required(values, key) { const value = values.get(key); if (!value) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Missing --${key}.`); return value; }
function resolveRequired(values, key) { return resolve(required(values, key)); }
function resolveInside(base, path) { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Unsafe path: ${path}`); const target = resolve(base, path); if (!target.startsWith(`${resolve(base)}/`)) fail('GOLDEN_COMMON_INPUT_INVALID', 2, `Escaped path: ${path}`); return target; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code, exitCode, message) { const error = new Error(message); error.code = code; error.exitCode = exitCode; throw error; }
