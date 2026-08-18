import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { collectFamilyFixtures, main as materialize } from './release-canvas06-golden-materialize.mjs';
import { main as verifyMaterialization } from './verify-canvas06-golden-materialization.mjs';

const workspace = resolve('.');
const factoryId = 'GFMV-CONTROLLED-FACTORY-001';
const factoryVersion = '1.0.0';
const changeId = 'GOLDEN-CANVAS06-20260801-901';
const epoch = 1785542400;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    console.error(error.code ?? 'GFMV_FACTORY_INTERNAL_ERROR');
    if (error.message) console.error(error.message);
    process.exitCode = error.exitCode ?? 4;
  }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseOptions(argv);
  const outputRoot = resolve(required(options, 'output-root'));
  const runtimeJar = resolve(required(options, 'runtime-jar'));
  const inputs = await createControlledInputs({ outputRoot, runtimeJar });
  if (options.has('inputs-only')) return inputs;
  await (dependencies.materializerMain ?? materialize)([
    '--plan', inputs.planPath,
    '--evidence-bundle', inputs.bundlePath,
    '--runtime-jar', inputs.runtimeJarPath,
    '--materialization-root', inputs.materializationRoot,
    '--source-date-epoch', String(epoch),
    '--concurrency', options.get('concurrency') ?? '1'
  ], dependencies.materializer ?? {});
  await (dependencies.verifier ?? verifyMaterialization)([
    '--plan', inputs.planPath,
    '--materialization-root', inputs.materializationRoot,
    '--require-materialized'
  ]);
  return inputs;
}

export async function createControlledInputs({ outputRoot, runtimeJar }) {
  if (await exists(outputRoot)) fail('GFMV_FACTORY_OUTPUT_EXISTS', 3, 'Controlled output root must not exist.');
  if (!await regularFile(runtimeJar)) fail('GFMV_FACTORY_RUNTIME_JAR_INVALID', 2, 'Runtime JAR is not a regular file.');

  const inputRoot = resolve(outputRoot, 'inputs');
  const fixtureRoot = resolve(inputRoot, 'fixtures');
  await mkdir(fixtureRoot, { recursive: true });
  const fixtures = await loadPassFixtures();
  const binding = canonicalBinding(fixtures[0].json.profile_binding);
  if (fixtures.some(fixture => jcs(canonicalBinding(fixture.json.profile_binding)) !== jcs(binding))) {
    fail('GFMV_FACTORY_FIXTURE_BINDING_MISMATCH', 2, 'Controlled PASS fixtures do not share one binding.');
  }

  const entries = [];
  for (const [index, fixture] of fixtures.entries()) {
    const entry = `fixtures/family-${index}.json`;
    await writeFile(resolve(inputRoot, entry), fixture.bytes, { flag: 'wx' });
    entries.push({ entry, bytes: fixture.bytes, sourcePath: fixture.path });
  }
  const bundlePath = resolve(inputRoot, 'evidence-bundle.zip');
  await writeZip(bundlePath, entries.map(entry => ({ name: entry.entry, bytes: entry.bytes })));
  const bundleRef = await fileRef('EVIDENCE_BUNDLE', inputRoot, bundlePath);
  const runtimeJarPath = resolve(inputRoot, 'runtime.jar');
  await copyFile(runtimeJar, runtimeJarPath, 0);
  const runtimeJarRef = await fileRef('LOCAL_RUNTIME_JAR', inputRoot, runtimeJarPath);
  const refs = entries.map(entry => ({
    path: entry.sourcePath,
    byte_length: entry.bytes.length,
    sha256: sha(entry.bytes),
    bundle_sha256: bundleRef.sha256,
    archive_entry_path: entry.entry
  }));
  const captures = [
    ...refs.flatMap((ref, index) => Array.from({ length: 9 }, (_, occurrence) => familyCapture(ref, index, occurrence))),
    ...Array.from({ length: 72 }, (_, index) => commonCapture(index))
  ];
  const plan = controlledPlan({ binding, bundleRef, runtimeJarRef, refs, captures });
  const planSchema = JSON.parse(await readFile(resolve(workspace, 'docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(planSchema);
  if (!validate(plan)) fail('GFMV_FACTORY_PLAN_SCHEMA_INVALID', 4, JSON.stringify(validate.errors));
  const planPath = resolve(inputRoot, 'capture-plan.json');
  await writeFile(planPath, `${JSON.stringify(plan)}\n`, { flag: 'wx' });
  const uniqueFixtures = collectFamilyFixtures(plan);
  const aliases = Object.fromEntries(uniqueFixtures.map((fixture, index) => [`K${String(index + 1).padStart(3, '0')}`, fixture.key]));
  const metadata = {
    factory_id: factoryId,
    factory_version: factoryVersion,
    change_id: changeId,
    source_date_epoch: epoch,
    generated_at: new Date(epoch * 1000).toISOString(),
    family_fixture_count: uniqueFixtures.length,
    capture_per_fixture: 9,
    family_capture_count: 1170,
    selected_fixture_alias: 'K001',
    plan_path: 'inputs/capture-plan.json',
    evidence_bundle_path: 'inputs/evidence-bundle.zip',
    runtime_jar_path: 'inputs/runtime.jar',
    aliases
  };
  await writeFile(resolve(outputRoot, 'controlled-inputs.json'), `${JSON.stringify(metadata)}\n`, { flag: 'wx' });
  return { outputRoot, planPath, bundlePath, runtimeJarPath, materializationRoot: resolve(outputRoot, 'materialization-root'), aliases, metadata };
}

async function loadPassFixtures() {
  const profileRoot = resolve(workspace, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
  const manifest = JSON.parse(await readFile(resolve(profileRoot, 'golden/opm-opl-golden-manifest.json'), 'utf8'));
  const paths = [...new Set(manifest.cases.filter(item => item.expectation === 'PASS').map(item => item.input_revision_fixture))].sort();
  if (paths.length !== 130) fail('GFMV_FACTORY_FIXTURE_SET_INVALID', 2, 'Controlled factory requires exactly 130 PASS fixtures.');
  return await Promise.all(paths.map(async path => {
    const bytes = await readFile(resolve(profileRoot, path));
    let json;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { fail('GFMV_FACTORY_FIXTURE_SET_INVALID', 2, 'Controlled fixture is not JSON.'); }
    if (json.schema_id !== 'MS-REV-001' || json.schema_version !== '0.2') {
      fail('GFMV_FACTORY_FIXTURE_SET_INVALID', 2, 'Controlled fixture schema is not MS-REV-001/0.2.');
    }
    return { path, bytes, json };
  }));
}

function controlledPlan({ binding, bundleRef, runtimeJarRef, refs, captures }) {
  const digest = sha(Buffer.from(factoryId, 'utf8'));
  const archive = path => ({ path, byte_length: 1, sha256: digest, bundle_sha256: bundleRef.sha256, archive_entry_path: `controlled/${path}` });
  const ref = (kind, path) => ({ kind, path, byte_length: 1, sha256: digest });
  const planner = { runner_version: '0.1.0', source_commit: '0'.repeat(40), node_version: process.version, command: 'controlled-verifier-factory', runner_source_sha256: digest };
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001', schema_version: '0.1',
    plan_id: `dev-canvas-06.golden-capture-plan.${changeId}`, plan_version: '0.1.0', plan_status: 'READY_FOR_AUTHORING', change_id: changeId,
    generated_at: new Date(epoch * 1000).toISOString(), source_date_epoch: epoch, planner_identity: planner,
    handoff_ref: ref('CONTROLLED_HANDOFF', 'controlled/handoff.json'), intake_report_ref: ref('CONTROLLED_INTAKE', 'controlled/intake.json'), active_binding: binding,
    upstream_input_refs: ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG', 'HANDOFF_EVIDENCE_BUNDLE'].map(input_kind => ({ input_kind, ref: archive(`${input_kind}.json`) })),
    input_materialization: { bundle_ref: bundleRef, java_version: '21', entry_allowlist: refs.map(item => item.archive_entry_path), materialized_count: refs.length, aggregate_sha256: sha(Buffer.from(jcs(refs), 'utf8')), temporary_directory_cleaned: true },
    common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'controlled/common-fixtures.json'),
    source_build: { source_commit: '0'.repeat(40), dirty_before_build: false, node_full_version: process.version, node_executable_sha256: digest, npm_version: '10.9.4', lockfile_sha256: digest, build_command: 'npm ci --ignore-scripts && npm run build', web_dist_tree_sha256: digest, runtime_jar_sha256: runtimeJarRef.sha256 },
    source_build_digest: digest, runtime_jar_ref: runtimeJarRef, web_dist_tree_sha256: digest,
    environment_policy: { playwright_version: '1.57.0', chromium_version: '143.0.7499.4', launch_args: ['--force-color-profile=srgb'], color_profile: 'srgb', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css' } },
    capture_set_sha256: sha(Buffer.from(jcs(captures), 'utf8')), captures,
    blank_baselines: ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport_id => ['Z-025', 'Z-100', 'Z-400'].map(zoom_id => ({ baseline_id: `${viewport_id}.${zoom_id}`, viewport_id, zoom_id }))),
    summary: { family_variant_count: 130, family_capture_count: 1170, common_subject_count: 8, common_capture_count: 72, capture_count: 1242, blank_baseline_count: 9 }
  };
}

function familyCapture(ref, index, occurrence) {
  return { capture_id: `controlled-family-${index}-${occurrence}`, case_id: `VIS-CANVAS.CAP-ISO-PROC-001.VP-1440X900.Z-025.${index}-${occurrence}`, capture_kind: 'FAMILY', capability_id: 'CAP-ISO-PROC-001', visual_variant_key: `controlled-${index}`, viewport_id: 'VP-1440X900', zoom_id: 'Z-025', fixture_ref: ref, expected_revision: `controlled-revision-${index}`, expected_projection_sha256: sha(Buffer.from(`projection-${index}`, 'utf8')), focus_target_id: 'controlled.focus', focus_anchor: 'CENTER', expected_cells: 1, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], coverage_ref: ref, golden_manifest_ref: ref, golden_replay_ref: ref, symbol_ref: ref };
}

function commonCapture(index) {
  const digest = sha(Buffer.from(`common-${index}`, 'utf8'));
  const ref = { kind: 'COMMON_FIXTURE', path: `controlled/common-${index}.json`, byte_length: 1, sha256: digest };
  return { capture_id: `controlled-common-${index}`, case_id: `VIS-CANVAS.COMMON.STATE_ROLES.VP-1440X900.Z-025.${index}`, capture_kind: 'COMMON', subject_id: 'STATE_ROLES', visual_variant_key: 'STATE_ROLES', viewport_id: 'VP-1440X900', zoom_id: 'Z-025', fixture_ref: ref, expected_revision: `controlled-common-${index}`, expected_projection_sha256: digest, focus_target_id: 'controlled.focus', focus_anchor: 'CENTER', expected_cells: 1, critical_regions: [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }], common_fixture_catalog_ref: { kind: 'COMMON_FIXTURE_CATALOG', path: 'controlled/common-fixtures.json', byte_length: 1, sha256: digest } };
}

function canonicalBinding(value) {
  try {
    const asset = name => ({ id: value[name].id, version: value[name].version, sha256: value[name].sha256 ?? value[name].digest.digest });
    return { profile: asset('profile'), rule_set: asset('rule_set'), text_grammar: asset('text_grammar'), symbol_catalog: asset('symbol_catalog'), normalization_adapter: asset('normalization_adapter'), binding_digest: value.binding_digest.digest ?? value.binding_digest };
  } catch {
    fail('GFMV_FACTORY_FIXTURE_BINDING_MISMATCH', 2, 'Controlled fixture binding cannot be normalized.');
  }
}

async function writeZip(path, entries) {
  const records = []; const chunks = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'); const crc = crc32(entry.bytes); const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0x5c21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(entry.bytes.length, 18); header.writeUInt32LE(entry.bytes.length, 22); header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    chunks.push(header, name, entry.bytes); records.push({ name, crc, size: entry.bytes.length, offset }); offset += header.length + name.length + entry.bytes.length;
  }
  const centralStart = offset;
  for (const record of records) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(0x0314, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x0800, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12); header.writeUInt16LE(0x5c21, 14);
    header.writeUInt32LE(record.crc, 16); header.writeUInt32LE(record.size, 20); header.writeUInt32LE(record.size, 24); header.writeUInt16LE(record.name.length, 28); header.writeUInt16LE(0, 30); header.writeUInt16LE(0, 32); header.writeUInt16LE(0, 34); header.writeUInt16LE(0, 36); header.writeUInt32LE(0, 38); header.writeUInt32LE(record.offset, 42);
    chunks.push(header, record.name); offset += header.length + record.name.length;
  }
  const footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50, 0); footer.writeUInt16LE(0, 4); footer.writeUInt16LE(0, 6); footer.writeUInt16LE(records.length, 8); footer.writeUInt16LE(records.length, 10); footer.writeUInt32LE(offset - centralStart, 12); footer.writeUInt32LE(centralStart, 16); footer.writeUInt16LE(0, 20);
  await writeFile(path, Buffer.concat([...chunks, footer]), { flag: 'wx' });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseOptions(argv) {
  const allowed = new Set(['output-root', 'runtime-jar', 'concurrency', 'inputs-only']); const options = new Map();
  for (let index = 0; index < argv.length;) {
    const flag = argv[index++]; const name = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(name) || options.has(name)) fail('GFMV_FACTORY_ARGUMENT_INVALID', 2, 'Invalid controlled factory option.');
    if (name === 'inputs-only') { options.set(name, true); continue; }
    const value = argv[index++]; if (!value) fail('GFMV_FACTORY_ARGUMENT_INVALID', 2, 'Controlled factory option value is required.'); options.set(name, value);
  }
  return options;
}

function required(options, name) { const value = options.get(name); if (typeof value !== 'string') fail('GFMV_FACTORY_ARGUMENT_INVALID', 2, `--${name} is required.`); return value; }
async function fileRef(kind, base, path) { const details = await stat(path); return { kind, path: relative(base, path), byte_length: details.size, sha256: sha(await readFile(path)) }; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function regularFile(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
function fail(code, exitCode, message) { const error = new Error(message ?? code); error.code = code; error.exitCode = exitCode; throw error; }
