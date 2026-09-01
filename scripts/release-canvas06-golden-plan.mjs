import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalizeColorProfile } from './canvas06-common-visual-color-profile.mjs';
import { projectCatalogCriticalRegions } from './canvas06-common-critical-regions.mjs';
import { canonicalizeJcs as jcs } from './canvas06-rfc8785.mjs';

const root = resolve('.');

try { await main(); } catch (error) {
  console.error(error.code ?? 'GOLDEN_INTERNAL_ERROR');
  if (error.message) console.error(error.message);
  process.exitCode = error.exitCode ?? 4;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const handoffRoot = resolveRequired(options, 'handoff-root');
  const sourceRoot = resolveRequired(options, 'source-root');
  const workRoot = resolveRequired(options, 'work-root');
  const changeId = required(options, 'change-id');
  const epoch = integer(required(options, 'source-date-epoch'), 'GOLDEN_INPUT_MATERIALIZATION_FAILED');
  const out = resolveInside(workRoot, required(options, 'out'));
  if (!/^GOLDEN-CANVAS06-[0-9]{8}-[0-9]{3}$/.test(changeId)) block('GOLDEN_INPUT_MATERIALIZATION_FAILED', 'change-id is invalid.');
  if (await exists(out)) block('GOLDEN_CANDIDATE_OUTPUT_EXISTS', 'Capture Plan output already exists.');
  const archiveTool = java21Jar();

  const intake = await loadJsonRef(handoffRoot, required(options, 'intake-report'), 'INTAKE_REPORT');
  const [handoffSchema, intakeSchema, catalogSchema, planSchema] = await Promise.all([
    schema('opm-dev-canvas-05-handoff.schema.json'), schema('opm-dev-canvas-06-intake-report.schema.json'), schema('opm-dev-canvas-06-common-fixture-catalog.schema.json'), schema('opm-dev-canvas-06-golden-capture-plan.schema.json')
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
  const validateIntake = ajv.compile(intakeSchema);
  if (!validateIntake(intake.value) || intake.value.intake_status !== 'READY_FOR_RELEASE_VALIDATION') input('READY Intake Report is required.');
  const handoff = await loadReferencedJson(handoffRoot, intake.value.handoff_ref, 'HANDOFF');
  const validateHandoff = ajv.compile(handoffSchema);
  if (!validateHandoff(handoff.value) || handoff.value.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoff.value.blockers.length) block('GOLDEN_HANDOFF_NOT_READY', 'READY Handoff is required.');
  if (!same(intake.value.handoff_ref, handoff.ref)) block('GOLDEN_INTAKE_MISMATCH', 'Intake Handoff reference differs from supplied bytes.');

  const catalogName = required(options, 'common-fixture-catalog');
  const commonRoot = options.has('common-fixture-root') ? await externalCommonRoot(required(options, 'common-fixture-root'), catalogName) : sourceRoot;
  const catalogPath = resolveInside(commonRoot, catalogName);
  const catalog = await loadJsonRef(commonRoot, catalogName, 'COMMON_FIXTURE_CATALOG');
  const validateCatalog = ajv.compile(catalogSchema);
  if (!validateCatalog(catalog.value) || !same(catalog.value.source_binding, handoff.value.active_binding)) block('GOLDEN_COMMON_FIXTURE_MISMATCH', 'Common Fixture Catalog does not match the active binding.');
  await verifyCommonFixtureRoot(resolveInside(handoffRoot, intake.value.handoff_ref.path), dirname(catalogPath));

  const runtime = await loadReferencedFile(handoffRoot, required(options, 'runtime-jar'), 'LOCAL_RUNTIME_JAR');
  const expectedRuntime = handoff.value.build_artifacts.find(item => item.kind === 'LOCAL_RUNTIME_JAR');
  if (!expectedRuntime || !same(expectedRuntime, runtime.ref)) block('GOLDEN_RUNTIME_JAR_MISMATCH', 'Runtime JAR differs from the READY Handoff artifact.');
  const sourceBuild = await inspectSourceBuild(sourceRoot, handoff.value.source_build, runtime.ref.sha256);
  const evidence = await materialize(handoffRoot, handoff.value, workRoot, archiveTool);
  try {
    const { coverage, manifest, replay, symbol, refs, fixtureRefs } = await upstreamInputs(evidence, handoff.value);
    const variants = joinFamily(coverage.value, manifest.value, replay.value, handoff.value.active_binding);
    const captures = [];
    for (const variant of variants) {
      const fixture = await fixtureData(evidence.root, fixtureRefs.get(variant.manifest.input_revision_fixture), variant.manifest);
      for (const viewport of viewports()) for (const zoom of zooms()) captures.push(familyCapture(variant, fixture, refs, viewport, zoom));
    }
    for (const subject of catalog.value.visual_subjects) {
      const fixture = JSON.parse(await readFile(resolveInside(dirname(catalogPath), subject.fixture_ref.path), 'utf8'));
      for (const viewport of viewports()) for (const zoom of zooms()) captures.push(commonCapture(subject, fixture, catalog.ref, viewport, zoom));
    }
    const plan = {
      schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001', schema_version: '0.1', plan_id: `dev-canvas-06.golden-capture-plan.${changeId}`, plan_version: '0.1.0', plan_status: 'READY_FOR_AUTHORING', change_id: changeId,
      generated_at: new Date(epoch * 1000).toISOString(), source_date_epoch: epoch,
      planner_identity: { runner_version: '0.1.0', source_commit: git(root, ['rev-parse', 'HEAD']), node_version: process.version, command: 'npm run release:canvas06:golden:plan -- --handoff-root <readonly-root> --intake-report <relative-path> --source-root <clean-checkout> --common-fixture-catalog <path> --runtime-jar <relative-path> --work-root <work-root> --change-id <change-id> --source-date-epoch <integer> --out <relative-path>', runner_source_sha256: await shaFile(resolve('scripts/release-canvas06-golden-plan.mjs')) },
      handoff_ref: handoff.ref, intake_report_ref: intake.ref, active_binding: handoff.value.active_binding,
      upstream_input_refs: [inputRef('COVERAGE_CATALOG', refs.coverage), inputRef('GOLDEN_MANIFEST', refs.manifest), inputRef('GOLDEN_REPLAY_REPORT', refs.replay), inputRef('SYMBOL_CATALOG', refs.symbol), inputRef('HANDOFF_EVIDENCE_BUNDLE', evidence.bundleRef)],
      input_materialization: evidence.materialization, common_fixture_catalog_ref: catalog.ref, source_build: sourceBuild, source_build_digest: shaText(jcs(sourceBuild)), runtime_jar_ref: runtime.ref, web_dist_tree_sha256: sourceBuild.web_dist_tree_sha256,
      environment_policy: environmentPolicy(), capture_set_sha256: shaText(jcs(captures)), captures, blank_baselines: baselines(), summary: { family_variant_count: 130, family_capture_count: 1170, common_subject_count: 8, common_capture_count: 72, capture_count: 1242, blank_baseline_count: 9 }
    };
    if (captures.length !== 1242 || new Set(captures.map(item => item.capture_id)).size !== 1242) block('GOLDEN_CAPTURE_COUNT_MISMATCH', 'Capture matrix is not exactly 1242 unique entries.');
    const validatePlan = ajv.compile(planSchema);
    if (!validatePlan(plan)) input(`Generated Capture Plan does not satisfy its Schema: ${JSON.stringify(validatePlan.errors)}`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
    console.log(`Golden Capture Plan READY_FOR_AUTHORING: ${relative(root, out)} sha256=${await shaFile(out)}`);
  } finally { await evidence.cleanup(); }
}

async function materialize(handoffRoot, handoff, workRoot, archiveTool) {
  const bundleRef = handoff.build_artifacts.find(item => item.kind === 'EVIDENCE_BUNDLE');
  if (!bundleRef) block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Handoff has no Evidence Bundle.');
  const bundle = await loadReferencedFile(handoffRoot, bundleRef.path, 'EVIDENCE_BUNDLE');
  if (!same(bundle.ref, bundleRef)) block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Evidence Bundle ref mismatch.');
  const entries = jarEntries(resolveInside(handoffRoot, bundleRef.path), archiveTool.executable);
  const profile = handoff.active_binding.profile;
  const prefix = `packages/profiles/${profile.id}/${profile.version}`;
  const required = [
    `${prefix}/golden/opm-opl-coverage-catalog.json`, `${prefix}/golden/opm-opl-golden-manifest.json`,
    findEntry(entries, /(?:^|\/)handoff\/reports\/golden-replay\.json$|^reports\/golden-replay\.json$/, 'GOLDEN_REPLAY_REPORT'),
    `${prefix}/symbols/representative-symbol-catalog.json`
  ];
  const staging = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-golden-plan-'));
  extract(resolveInside(handoffRoot, bundleRef.path), staging, required, archiveTool.executable);
  const refs = new Map();
  for (const entry of required) refs.set(entry, await archiveRef(staging, entry, bundle.ref.sha256));
  return {
    root: staging, bundlePath: resolveInside(handoffRoot, bundleRef.path), bundleRef: bundle.ref,
    materialization: { bundle_ref: bundle.ref, java_version: archiveTool.version, entry_allowlist: required, materialized_count: required.length, aggregate_sha256: shaText(jcs([...refs.values()])), temporary_directory_cleaned: true },
    refs, entries, archiveTool, async cleanup() { await rm(staging, { recursive: true, force: true }); }
  };
}

async function upstreamInputs(evidence, handoff) {
  const find = suffix => [...evidence.refs].find(([entry]) => entry.endsWith(suffix))?.[1];
  const coverageRef = find('/golden/opm-opl-coverage-catalog.json'); const manifestRef = find('/golden/opm-opl-golden-manifest.json');
  const replayRef = [...evidence.refs].find(([entry]) => entry.endsWith('golden-replay.json'))?.[1]; const symbolRef = [...evidence.refs].find(([entry]) => entry.endsWith('representative-symbol-catalog.json'))?.[1];
  const [coverage, manifest, replay, symbol] = await Promise.all([readArchive(evidence.root, coverageRef), readArchive(evidence.root, manifestRef), readArchive(evidence.root, replayRef), readArchive(evidence.root, symbolRef)]);
  if (shaText(JSON.stringify(symbol.value)) === '') block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Unreachable symbol guard.');
  if (symbol.ref.sha256 !== handoff.active_binding.symbol_catalog.sha256 || replay.value.profile_binding?.binding_digest !== handoff.active_binding.binding_digest || manifest.value.cases.some(item => item.binding_digest !== handoff.active_binding.binding_digest)) block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Upstream binding mismatch.');
  if (manifest.value.coverage_catalog_ref?.sha256 !== coverage.ref.sha256 || replay.value.manifest?.sha256 !== manifest.ref.sha256) block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Coverage or Replay reference mismatch.');
  const fixturePaths = [...new Set(manifest.value.cases.map(item => item.input_revision_fixture))];
  const prefix = [...evidence.refs.keys()].find(key => key.endsWith('/golden/opm-opl-golden-manifest.json')).replace(/\/golden\/opm-opl-golden-manifest\.json$/, '');
  const fixtureRefs = new Map();
  for (const fixturePath of fixturePaths) {
    const entry = `${prefix}/${fixturePath}`;
    if (!evidence.entries.includes(entry)) block('GOLDEN_UPSTREAM_REF_MISMATCH', `Bundle misses fixture ${fixturePath}.`);
    extract(evidence.bundlePath, evidence.root, [entry], evidence.archiveTool.executable);
    fixtureRefs.set(fixturePath, await archiveRef(evidence.root, entry, evidence.bundleRef.sha256));
  }
  evidence.materialization.entry_allowlist.push(...fixtureRefs.values().map(item => item.archive_entry_path));
  evidence.materialization.materialized_count += fixtureRefs.size;
  evidence.materialization.aggregate_sha256 = shaText(jcs([...evidence.refs.values(), ...fixtureRefs.values()]));
  return { coverage, manifest, replay, symbol, refs: { coverage: coverage.ref, manifest: manifest.ref, replay: replay.ref, symbol: symbol.ref }, fixtureRefs };
}

function joinFamily(coverage, manifest, replay, binding) {
  const key = item => `${item.capability_id}|${item.case_id}|${item.variant_key}|${item.expectation}`;
  const manifestByKey = indexed(manifest.cases, key); const replayById = indexed(replay.cases, item => item.case_id);
  if (coverage.requirements.length !== 178 || manifest.cases.length !== 178 || replay.cases.length !== 178) block('GOLDEN_EXACT_JOIN_MISMATCH', 'Upstream cardinality must be 178.');
  const variants = coverage.requirements.map(item => {
    const candidate = manifestByKey.get(key(item)); const replayCase = replayById.get(item.case_id);
    if (!candidate || !replayCase || candidate.expectation !== item.expectation || replayCase.expectation !== item.expectation || candidate.capability_id !== item.capability_id || candidate.variant_key !== item.variant_key) block('GOLDEN_EXACT_JOIN_MISMATCH', `Missing join for ${item.case_id}.`);
    const attempts = replayCase.attempts?.slice().sort((a, b) => a.attempt - b.attempt);
    const expected = item.expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
    if (attempts?.length !== 2 || attempts[0].attempt !== 1 || attempts[1].attempt !== 2 || attempts.some(a => a.observed_status !== expected) || !same(attempts[0].transaction, attempts[1].transaction) || (candidate.expected_transaction && !same(attempts[0].transaction, candidate.expected_transaction))) block('GOLDEN_EXACT_JOIN_MISMATCH', `Replay mismatch for ${item.case_id}.`);
    return { coverage: item, manifest: candidate, replay: replayCase };
  });
  if (new Set(variants.map(item => key(item.coverage))).size !== 178 || variants.filter(item => item.coverage.expectation === 'PASS').length !== 130 || variants.filter(item => item.coverage.expectation === 'BLOCKED').length !== 48) block('GOLDEN_EXACT_JOIN_MISMATCH', 'PASS/BLOCKED exact join mismatch.');
  return variants.filter(item => item.coverage.expectation === 'PASS').sort((a, b) => familyOrder(a.coverage.capability_id) - familyOrder(b.coverage.capability_id) || a.coverage.coverage_key.localeCompare(b.coverage.coverage_key));
}

async function fixtureData(staging, fixtureRef, manifest) {
  const value = JSON.parse(await readFile(resolveInside(staging, fixtureRef.archive_entry_path), 'utf8'));
  const factId = manifest.expected_normalized_fact?.fact_id; const occurrence = value.occurrences?.filter(item => item.target_kind === 'FACT' && item.target_id === factId) ?? [];
  if (occurrence.length !== 1) block('GOLDEN_EXACT_JOIN_MISMATCH', `Fixture focus occurrence mismatch for ${manifest.case_id}.`);
  const context = value.contexts?.find(item => item.context_id === occurrence[0].context_id);
  if (!context?.occurrence_ids?.length) block('GOLDEN_EXACT_JOIN_MISMATCH', `Fixture context mismatch for ${manifest.case_id}.`);
  return { ref: fixtureRef, revision: value.revision_id, focus: occurrence[0].occurrence_id, cells: context.occurrence_ids.length };
}

function familyCapture(variant, fixture, refs, viewport, zoom) {
  const projection = variant.manifest.expected_projection; const caseId = `VIS-CANVAS.${variant.coverage.capability_id}.${viewport.viewport_id}.${zoom.zoom_id}`;
  return { capture_id: `${caseId}.${shaText(variant.coverage.coverage_key).slice(0, 12)}`, case_id: caseId, capture_kind: 'FAMILY', capability_id: variant.coverage.capability_id, visual_variant_key: variant.coverage.coverage_key, viewport_id: viewport.viewport_id, zoom_id: zoom.zoom_id, fixture_ref: fixture.ref, expected_revision: fixture.revision, expected_projection_sha256: shaText(jcs(projection)), focus_target_id: fixture.focus, focus_anchor: anchor(projection), expected_cells: fixture.cells, critical_regions: regions(projection), coverage_ref: refs.coverage, golden_manifest_ref: refs.manifest, golden_replay_ref: refs.replay, symbol_ref: refs.symbol };
}
function commonCapture(subject, fixture, catalogRef, viewport, zoom) { const caseId = `VIS-CANVAS.COMMON.${subject.subject_id}.${viewport.viewport_id}.${zoom.zoom_id}`; const projection = fixture.expected_projection; const expectedCells = projection.committed_cells.length + projection.transient_cells.length; if (subject.expected_revision !== fixture.revision_document.revision_id || subject.focus_target_id !== fixture.capture_setup.expected_focus_target_id || subject.focus_anchor !== fixture.capture_setup.expected_focus_anchor || subject.expected_cells !== expectedCells) block('GOLDEN_COMMON_FIXTURE_MISMATCH', `Common fixture semantic join differs: ${subject.subject_id}`); let criticalRegions; try { criticalRegions = projectCatalogCriticalRegions(subject.critical_regions); } catch (error) { block(error.code ?? 'GOLDEN_COMMON_FIXTURE_MISMATCH', error.message); } return { capture_id: `${caseId}.${shaText(subject.subject_id).slice(0, 12)}`, case_id: caseId, capture_kind: 'COMMON', subject_id: subject.subject_id, visual_variant_key: subject.subject_id, viewport_id: viewport.viewport_id, zoom_id: zoom.zoom_id, fixture_ref: subject.fixture_ref, expected_revision: fixture.revision_document.revision_id, expected_projection_sha256: shaText(jcs(projection)), focus_target_id: fixture.capture_setup.expected_focus_target_id, focus_anchor: fixture.capture_setup.expected_focus_anchor, expected_cells: expectedCells, critical_regions: criticalRegions, common_fixture_catalog_ref: catalogRef }; }
function anchor(value) { return value.junction_marker ? 'JUNCTION' : value.annotation !== 'none' || value.completeness_annotation || value.label_slots?.length ? 'LABEL' : value.target_marker !== 'none' ? 'TARGET' : value.source_marker !== 'none' ? 'SOURCE' : 'CENTER'; }
function regions(value) { return [{ region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' }, ...(value.source_marker !== 'none' ? [{ region_id: 'SOURCE_MARKER', kind: 'SOURCE_MARKER' }] : []), ...(value.target_marker !== 'none' ? [{ region_id: 'TARGET_MARKER', kind: 'TARGET_MARKER' }] : []), ...(value.junction_marker ? [{ region_id: 'JUNCTION_MARKER', kind: 'JUNCTION_MARKER' }] : []), ...(value.annotation !== 'none' ? [{ region_id: 'ANNOTATION', kind: 'ANNOTATION' }] : []), ...(value.completeness_annotation ? [{ region_id: 'COMPLETENESS', kind: 'COMPLETENESS' }] : []), ...(value.label_slots ?? []).map(slot => ({ region_id: `LABEL_SLOT:${slot}`, kind: 'LABEL_SLOT' }))]; }
function inputRef(input_kind, ref) { return { input_kind, ref }; }
function viewports() { return [{ viewport_id: 'VP-1440X900', width: 1440, height: 900 }, { viewport_id: 'VP-1280X800', width: 1280, height: 800 }, { viewport_id: 'VP-390X844', width: 390, height: 844 }]; }
function zooms() { return [{ zoom_id: 'Z-025', scale: 0.25 }, { zoom_id: 'Z-100', scale: 1 }, { zoom_id: 'Z-400', scale: 4 }]; }
function baselines() { return viewports().flatMap(v => zooms().map(z => ({ baseline_id: `${v.viewport_id}.${z.zoom_id}`, viewport_id: v.viewport_id, zoom_id: z.zoom_id }))); }
function environmentPolicy() {
  const launchArgs = ['--force-color-profile=srgb'];
  canonicalizeColorProfile('srgb', launchArgs);
  return { playwright_version: '1.57.0', chromium_version: '143.0.7499.4', launch_args: launchArgs, color_profile: 'srgb', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css' } };
}
async function inspectSourceBuild(source, upstream, runtimeSha) { if (git(source, ['status', '--porcelain=v1', '--untracked-files=all'])) block('GOLDEN_SOURCE_BUILD_DIRTY', 'Source checkout is dirty.'); const commit = git(source, ['rev-parse', 'HEAD']); if (commit !== upstream.source_commit) block('GOLDEN_SOURCE_BUILD_DIRTY', 'Source commit differs from Handoff.'); const lockfile = resolve(source, 'package-lock.json'); const dist = resolve(source, 'apps/web/dist'); if (!await exists(lockfile) || !await exists(dist)) block('GOLDEN_WEB_DIST_MISMATCH', 'package-lock or production dist is missing.'); const nodeMajor = Number(process.versions.node.split('.')[0]); if (nodeMajor !== 22 || execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== '10.9.4') block('GOLDEN_WEB_DIST_MISMATCH', 'Node 22 and npm 10.9.4 are required.'); const web = await treeDigest(dist); return { source_commit: commit, dirty_before_build: false, node_full_version: process.version, node_executable_sha256: await shaFile(process.execPath), npm_version: '10.9.4', lockfile_sha256: await shaFile(lockfile), build_command: 'npm ci --ignore-scripts && npm run build', web_dist_tree_sha256: web, runtime_jar_sha256: runtimeSha }; }
async function verifyCommonFixtureRoot(handoffPath, fixtureRoot) { const result = spawnSync(process.execPath, [resolve('scripts/verify-canvas06-common-visual-fixtures.mjs'), '--handoff', handoffPath, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json'], { cwd: root, encoding: 'utf8' }); if (result.status !== 0) block('GOLDEN_COMMON_FIXTURE_MISMATCH', result.stderr || 'Common fixture semantic verification failed.'); }
function jarEntries(path, executable) { const entries = execFileSync(executable, ['tf', path], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); if (entries.some(entry => !safe(entry)) || new Set(entries).size !== entries.length) block('GOLDEN_INPUT_MATERIALIZATION_FAILED', 'Evidence Bundle has unsafe or duplicate entries.'); return entries; }
function extract(bundle, staging, entries, executable) { if (!entries.length) return; const result = spawnSync(executable, ['xf', bundle, ...entries], { cwd: staging, encoding: 'utf8' }); if (result.status !== 0) block('GOLDEN_INPUT_MATERIALIZATION_FAILED', result.stderr || 'Bundle extraction failed.'); }
async function readArchive(staging, ref) { if (!ref) block('GOLDEN_UPSTREAM_REF_MISMATCH', 'Required archive entry is missing.'); return { value: JSON.parse(await readFile(resolveInside(staging, ref.archive_entry_path), 'utf8')), ref }; }
async function archiveRef(staging, entry, bundleSha) { const path = resolveInside(staging, entry); const info = await stat(path); return { path: entry, byte_length: info.size, sha256: await shaFile(path), bundle_sha256: bundleSha, archive_entry_path: entry }; }
async function loadJsonRef(base, path, kind) { const resolved = resolveInside(base, path); return { value: JSON.parse(await readFile(resolved, 'utf8')), ref: await ref(resolved, base, kind) }; }
async function loadReferencedJson(base, reference, kind) { const loaded = await loadReferencedFile(base, reference.path, kind); if (!same(loaded.ref, reference)) block('GOLDEN_UPSTREAM_REF_MISMATCH', `Reference mismatch: ${reference.path}`); return { value: JSON.parse(await readFile(resolveInside(base, reference.path), 'utf8')), ref: loaded.ref }; }
async function loadReferencedFile(base, path, kind) { const resolved = resolveInside(base, path); return { ref: await ref(resolved, base, kind) }; }
async function ref(path, base, kind) { const info = await stat(path); return { kind, path: relative(base, path), byte_length: info.size, sha256: await shaFile(path) }; }
async function treeDigest(directory) { const files = []; async function walk(path) { for (const entry of await (await import('node:fs/promises')).readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) await walk(child); else if (entry.isFile()) { const info = await stat(child); files.push({ path: relative(directory, child), byte_length: info.size, sha256: await shaFile(child) }); } else block('GOLDEN_WEB_DIST_MISMATCH', 'Web dist contains a non-regular entry.'); } } await walk(directory); if (!files.length) block('GOLDEN_WEB_DIST_MISMATCH', 'Web dist is empty.'); return shaText(jcs(files.sort((a, b) => a.path.localeCompare(b.path)))); }
function findEntry(entries, pattern, kind) { const matched = entries.filter(item => pattern.test(item)); if (matched.length !== 1) block('GOLDEN_UPSTREAM_REF_MISMATCH', `${kind} entry must occur exactly once.`); return matched[0]; }
function indexed(items, key) { const result = new Map(); for (const item of items) { const value = key(item); if (result.has(value)) block('GOLDEN_EXACT_JOIN_MISMATCH', `Duplicate key: ${value}`); result.set(value, item); } return result; }
function familyOrder(id) { return id.startsWith('CAP-ISO-PROC-') ? Number(id.slice(-3)) : id.startsWith('CAP-ISO-CTRL-') ? 100 + Number(id.slice(-3)) : 200 + Number(id.slice(-3)); }
function safe(path) { return path && !path.startsWith('/') && !path.split('/').includes('..') && !path.includes('\\'); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function externalCommonRoot(value, catalogName) { if (catalogName !== 'dev-canvas-06-common-fixture-catalog.json' || !value.startsWith('/')) input('External Common root requires the fixed Catalog name.'); const path = resolve(value); const details = await stat(path); if (!details.isDirectory()) input('External Common root must be a directory.'); return path; }
function parseOptions(values) { const allowed = new Set(['handoff-root', 'intake-report', 'source-root', 'common-fixture-catalog', 'common-fixture-root', 'runtime-jar', 'work-root', 'change-id', 'source-date-epoch', 'out']); const result = new Map(); for (let index = 0; index < values.length; index += 2) { const flag = values[index]; const value = values[index + 1]; if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || value === undefined || result.has(flag.slice(2))) input('Invalid planner options.'); result.set(flag.slice(2), value); } return result; }
function required(values, key) { const value = values.get(key); if (!value) input(`Missing --${key}.`); return value; }
function resolveRequired(values, key) { return resolve(required(values, key)); }
function resolveInside(base, path) { if (!safe(path)) input(`Path must remain inside root: ${path}`); const resolved = resolve(base, path); if (!resolved.startsWith(`${resolve(base)}/`)) input(`Path escapes root: ${path}`); return resolved; }
function integer(value, code) { const number = Number(value); if (!Number.isInteger(number) || number < 0) block(code, 'SOURCE_DATE_EPOCH is invalid.'); return number; }
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function java21Jar() { const javaHome = process.env.JAVA_HOME; if (!javaHome) block('GOLDEN_INPUT_MATERIALIZATION_FAILED', 'JAVA_HOME must identify the controlled JDK 21.'); const executable = resolve(javaHome, 'bin/jar'); const result = spawnSync(executable, ['--version'], { encoding: 'utf8' }); const version = (result.stdout || result.stderr || '').trim(); if (result.status !== 0 || !/^jar 21(?:\.|$)/.test(version)) block('GOLDEN_INPUT_MATERIALIZATION_FAILED', 'JAVA_HOME/bin/jar must be version 21.'); return { executable, version }; }
async function matches(path, reference) { try { const info = await stat(path); return info.size === reference.byte_length && await shaFile(path) === reference.sha256; } catch { return false; } }
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function schema(name) { return JSON.parse(await readFile(resolve('docs/contracts/schemas', name), 'utf8')); }
async function shaFile(path) { return sha(await readFile(path)); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function shaText(value) { return sha(Buffer.from(value, 'utf8')); }
function input(message) { const error = new Error(message); error.code = 'GOLDEN_INPUT_MATERIALIZATION_FAILED'; error.exitCode = 2; throw error; }
function block(code, message) { const error = new Error(message); error.code = code; error.exitCode = 3; throw error; }
