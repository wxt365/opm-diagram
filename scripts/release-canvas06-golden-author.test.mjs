import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { GoldenAuthorError, assertCleanSource, collectVerifiedFamilyMaterialization, loadAuthoringLineage, loadFontManifest, parseAuthorOptions, runCandidateTransaction, validateAdapterRequestJoin, writeCandidateAuthoringReport, writeCandidateGoldenEnvironment } from './release-canvas06-golden-author.mjs';
import { collectFamilyFixtures } from './release-canvas06-golden-materialize.mjs';

test('03B CLI只接受十个显式参数', () => {
  const options = authorOptions();
  assert.equal(options.sourceDateEpoch, 1782864000);
  assert.throws(() => parseAuthorOptions(['--plan', '/plan']), error => sameInput(error));
  assert.throws(() => parseAuthorOptions([...authorArgs(), '--force', 'true']), error => sameInput(error));
});

test('03B Adapter Request在Plan/JAR/epoch或work root越界时零候选输出拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-author-'));
  const plan = join(root, 'plan.json');
  const jar = join(root, 'runtime.jar');
  const source = join(root, 'source');
  const materialization = join(root, 'materialization');
  const candidate = join(root, 'candidate');
  const work = join(root, 'work');
  await mkdir(source); await mkdir(materialization); await writeFile(plan, '{}'); await writeFile(jar, 'jar');
  const planRef = ref('CAPTURE_PLAN', plan, '{}');
  const jarRef = ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar', 'jar');
  const jarFile = { byte_length: jarRef.byte_length, sha256: jarRef.sha256 };
  const request = { plan_path: plan, plan_ref: { ...planRef }, runtime_jar_path: jar, runtime_jar_ref: { ...jarRef }, source_date_epoch: 1782864000, work_root: work };
  request.plan_ref.sha256 = 'b'.repeat(64);
  await assert.rejects(() => validateAdapterRequestJoin({ request, planPath: plan, planRef, planRuntimeJarRef: jarRef, runtimeJarPath: jar, runtimeJarFile: jarFile, sourceDateEpoch: 1782864000, candidateRoot: candidate, sourceRoot: source, materializationRoot: materialization }), error => sameInput(error));
  await assert.rejects(() => import('node:fs/promises').then(({ lstat }) => lstat(candidate)), { code: 'ENOENT' });
  request.plan_ref = planRef;
  request.work_root = join(candidate, 'work');
  await assert.rejects(() => validateAdapterRequestJoin({ request, planPath: plan, planRef, planRuntimeJarRef: jarRef, runtimeJarPath: jar, runtimeJarFile: jarFile, sourceDateEpoch: 1782864000, candidateRoot: candidate, sourceRoot: source, materializationRoot: materialization }), error => sameInput(error));
});

test('03B接受逻辑Runtime ref与physical staged JAR的同bytes闭合', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-author-'));
  const plan = join(root, 'plan.json');
  const jar = join(root, 'runtime.jar');
  const source = join(root, 'source');
  const materialization = join(root, 'materialization');
  const candidate = join(root, 'candidate');
  const work = join(root, 'work');
  await mkdir(source); await mkdir(materialization); await writeFile(plan, '{}'); await writeFile(jar, 'jar');
  const planRef = ref('CAPTURE_PLAN', 'inputs/golden/capture-plan.json', '{}');
  const logicalJarRef = ref('LOCAL_RUNTIME_JAR', 'releases/clean-000000000000/local-runtime.jar', 'jar');
  await validateAdapterRequestJoin({ request: { plan_path: await realpath(plan), plan_ref: planRef, runtime_jar_path: await realpath(jar), runtime_jar_ref: logicalJarRef, source_date_epoch: 1782864000, work_root: work }, planPath: plan, planRef, planRuntimeJarRef: logicalJarRef, runtimeJarPath: jar, runtimeJarFile: { byte_length: 3, sha256: logicalJarRef.sha256 }, sourceDateEpoch: 1782864000, candidateRoot: candidate, sourceRoot: source, materializationRoot: materialization });
});

test('03B在dirty source或与Plan不同的commit时预检阻断', async () => {
  const source = await mkdtemp(join(tmpdir(), 'canvas06-author-source-'));
  execFileSync('git', ['init', '-q'], { cwd: source });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: source });
  execFileSync('git', ['config', 'user.name', 'Canvas Test'], { cwd: source });
  await writeFile(join(source, 'tracked.txt'), 'clean');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: source });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: source });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  assert.equal(assertCleanSource(source, commit), commit);
  assert.throws(() => assertCleanSource(source, 'a'.repeat(40)), error => error instanceof GoldenAuthorError && error.code === 'GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH' && error.exitCode === 3);
  await writeFile(join(source, 'tracked.txt'), 'dirty');
  assert.throws(() => assertCleanSource(source, commit), error => error instanceof GoldenAuthorError && error.code === 'GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH' && error.exitCode === 3);
});

test('03B Font Manifest拒绝source_path与raw ref不一致', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-author-'));
  const paths = [join(root, 'ui.font'), join(root, 'cjk.font'), join(root, 'mono.font')];
  await Promise.all(paths.map((path, index) => writeFile(path, `font-${index}`)));
  const manifest = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-FONT-INPUT-001', schema_version: '0.1', manifest_version: '0.1.0', font_input_id: 'dev-canvas-06.golden-authoring-font-input.test', fonts: ['UI_SANS', 'CJK_FALLBACK', 'MONOSPACE'].map((logical_role, index) => ({ logical_role, postscript_name: `Font${index}`, font_version: '1.0', source_path: paths[index], source_ref: ref('FONT_FILE', paths[index], `font-${index}`) })) };
  const schema = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile('docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-font-input.schema.json', 'utf8')));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  manifest.fonts[0].source_ref.path = join(root, 'other.font');
  await assert.rejects(() => loadFontManifest(awaitJson(root, manifest), validate), error => sameInput(error));
});

test('03B Lineage必须与Plan change精确绑定且不读取approved root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-author-lineage-'));
  const schema = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile('docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-lineage-input.schema.json', 'utf8')));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const lineage = { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-LINEAGE-INPUT-001', schema_version: '0.1', lineage_version: '0.1.0', lineage_id: 'dev-canvas-06.golden-authoring-lineage.GOLDEN-CANVAS06-20260901-001', mode: 'INITIAL', golden_set_version: '1.0.0', old_golden_set_version: null, old_golden_set_sha256: null };
  const path = await realpath(await awaitJson(root, lineage));
  assert.equal((await loadAuthoringLineage(path, validate, 'GOLDEN-CANVAS06-20260901-001')).golden_set_version, '1.0.0');
  await assert.rejects(() => loadAuthoringLineage(path, validate, 'GOLDEN-CANVAS06-20260901-002'), error => sameInput(error));
});

test('03B只从已验证的130项固定Materialization路径收集Report和SQLite证据', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'canvas06-author-materialization-')));
  const planPath = join(root, 'plan.json');
  const plan = familyMaterializationPlan();
  await writeFile(planPath, JSON.stringify(plan));
  for (const fixture of collectFamilyFixtures(plan)) {
    const databasePath = `fixtures/${fixture.key}/storage/projects/project.golden.fixture.${fixture.ref.sha256}/project.db`;
    const reportPath = join(root, 'reports', `${fixture.key}.json`);
    const database = join(root, databasePath);
    await mkdir(resolve(reportPath, '..'), { recursive: true });
    await mkdir(resolve(database, '..'), { recursive: true });
    await writeFile(database, `database-${fixture.key}`);
    const databaseBytes = await import('node:fs/promises').then(({ readFile }) => readFile(database));
    await writeFile(reportPath, JSON.stringify({
      report_status: 'MATERIALIZED', fixture_ref_key: fixture.key,
      target_storage: {
        database_ref: ref('DATABASE', databasePath, databaseBytes),
        semantic_state_sha256: sha(`semantic-${fixture.key}`)
      }
    }));
  }
  const materialization = await collectVerifiedFamilyMaterialization({
    planPath,
    materializationRoot: root,
    plan,
    verify: async argv => { assert.deepEqual(argv, ['--plan', planPath, '--materialization-root', root, '--require-materialized']); }
  });
  assert.equal(materialization.report_refs.length, 130);
  assert.equal(materialization.database_refs.length, 130);
  assert.equal(materialization.report_refs[0].fixture_ref_key < materialization.report_refs[1].fixture_ref_key, true);
  assert.match(materialization.report_refs[0].report_ref.path, /^materialization\/reports\//);
  assert.match(materialization.database_refs[0].database_ref.path, /^materialization\/fixtures\//);
  await writeFile(join(root, materialization.database_refs[0].database_ref.path.replace(/^materialization\//, '')), 'drift');
  await assert.rejects(() => collectVerifiedFamilyMaterialization({ planPath, materializationRoot: root, plan, verify: async () => {} }), error => error instanceof GoldenAuthorError && error.code === 'GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH');
});

test('03B候选Environment只接受1242+9 canonical attempt-1 PNG并原子写入临时根', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-author-environment-'));
  let candidate = join(root, 'candidate.tmp');
  await mkdir(candidate);
  candidate = await realpath(candidate);
  const plan = candidatePlan();
  const captures = await createPngAssets(candidate, plan.captures, 'capture_id');
  const blanks = await createPngAssets(candidate, plan.blank_baselines, 'baseline_id');
  const fonts = await createFonts(root);
  const environment = await writeCandidateGoldenEnvironment({ candidateTemporaryRoot: candidate, plan, browser: { realpath: '/controlled/chromium', byte_length: 1, sha256: 'a'.repeat(64) }, fonts, captureAssets: captures, blankAssets: blanks, runtime: { os_name: 'darwin', os_build: 'macOS-26.0', arch: 'arm64', playwright_version: '1.57.0', chromium_version: '143.0.7499.4' } });
  assert.equal(environment.value.png_refs.length, 1242);
  assert.equal(environment.value.blank_baseline_refs.length, 9);
  assert.equal(environment.value.font_refs.length, 3);
  assert.equal((await lstat(join(candidate, 'golden-environment.json'))).isFile(), true);
  assert.equal(environment.value.png_refs[0].ref.path, `${plan.captures[0].capture_id}.png`);
  assert.equal(environment.value.blank_baseline_refs[0].ref.path, `blank/${plan.blank_baselines[0].baseline_id}.png`);
  enrichPlanForReport(plan);
  const report = await writeCandidateAuthoringReport({ candidateTemporaryRoot: candidate, plan, capturePlanRef: ref('CAPTURE_PLAN', 'capture-plan.json', 'plan'), lineage: initialLineage(), authoredEnvironment: environment, materialization: materializationEvidence(), captureAttemptResults: captureAttempts(environment.value), blankAttemptResults: blankAttempts(environment.value), generatorIdentity: identity('npm run release:canvas06:golden:author'), materializationVerifierIdentity: identity('npm run release:canvas06:golden:materialize:verify') });
  assert.equal(report.value.report_status, 'READY_FOR_APPROVAL');
  assert.equal(report.value.fixture_materialization_report_refs.length, 130);
  assert.equal(report.value.capture_attempt_results.length, 2484);
  assert.equal(report.value.blank_attempt_results.length, 18);
  assert.equal((await lstat(join(candidate, 'candidate-authoring-report.json'))).isFile(), true);
  await assert.rejects(() => writeCandidateGoldenEnvironment({ candidateTemporaryRoot: candidate, plan, browser: { realpath: '/controlled/chromium', byte_length: 1, sha256: 'a'.repeat(64) }, fonts, captureAssets: captures.slice(1), blankAssets: blanks, runtime: { os_name: 'darwin', os_build: 'macOS-26.0', arch: 'arm64', playwright_version: '1.57.0', chromium_version: '143.0.7499.4' } }), error => error instanceof GoldenAuthorError && error.code === 'GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH');
});

test('03B candidate transaction只在成功时原子切换最终根', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'canvas06-author-transaction-')));
  const candidate = join(parent, 'candidate');
  await assert.rejects(() => runCandidateTransaction(candidate, async temporary => {
    await writeFile(join(temporary, 'partial.txt'), 'partial');
    throw new GoldenAuthorError('GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH', 3, 'blocked');
  }), error => error.code === 'GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH');
  await assert.rejects(() => lstat(candidate), { code: 'ENOENT' });
  const result = await runCandidateTransaction(candidate, async temporary => {
    await writeFile(join(temporary, 'ready.txt'), 'ready');
    return 'READY';
  });
  assert.equal(result, 'READY');
  assert.equal((await lstat(join(candidate, 'ready.txt'))).isFile(), true);
});

function authorOptions() { return parseAuthorOptions(authorArgs()); }
function authorArgs() { return ['--plan', '/plan', '--source-root', '/source', '--runtime-jar', '/jar', '--materialization-root', '/materialization', '--candidate-root', '/candidate', '--source-date-epoch', '1782864000', '--common-adapter-request', '/request.json', '--browser-executable', '/browser', '--font-manifest', '/fonts.json', '--authoring-lineage', '/lineage.json']; }
function ref(kind, path, bytes) { return { kind, path, byte_length: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }; }
async function awaitJson(root, value) { const path = join(root, 'fonts.json'); await writeFile(path, JSON.stringify(value)); return path; }
function sameInput(error) { return error instanceof GoldenAuthorError && error.code === 'GOLDEN_AUTHOR_INPUT_INVALID' && error.exitCode === 2; }

function candidatePlan() {
  const captures = Array.from({ length: 1242 }, (_, index) => ({ capture_id: `CAPTURE-${index}` }));
  const blank_baselines = ['VP-1440X900.Z-025', 'VP-1440X900.Z-100', 'VP-1440X900.Z-400', 'VP-1280X800.Z-025', 'VP-1280X800.Z-100', 'VP-1280X800.Z-400', 'VP-390X844.Z-025', 'VP-390X844.Z-100', 'VP-390X844.Z-400'].map(baseline_id => ({ baseline_id }));
  return { source_date_epoch: 1785628800, captures, blank_baselines, environment_policy: { launch_args: ['--force-color-profile=srgb'], color_profile: 'srgb', locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1, screenshot_options: { animations: 'disabled', caret: 'hide', scale: 'css' } } };
}

function enrichPlanForReport(plan) {
  Object.assign(plan, {
    change_id: 'GOLDEN-CANVAS06-20260901-001',
    capture_set_sha256: 'a'.repeat(64),
    handoff_ref: ref('HANDOFF', 'handoff.json', 'handoff'),
    intake_report_ref: ref('INTAKE_REPORT', 'intake.json', 'intake'),
    runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'runtime.jar', 'jar'),
    web_dist_tree_sha256: 'b'.repeat(64),
    common_fixture_catalog_ref: ref('COMMON_FIXTURE_CATALOG', 'catalog.json', 'catalog'),
    input_materialization: { bundle_ref: ref('EVIDENCE_BUNDLE', 'bundle.zip', 'bundle'), java_version: '21.0.7', entry_allowlist: ['fixtures/family.json'], materialized_count: 130, aggregate_sha256: 'c'.repeat(64), temporary_directory_cleaned: true },
    source_build: { source_commit: 'd'.repeat(40), dirty_before_build: false, node_full_version: 'v22.22.0', node_executable_sha256: 'e'.repeat(64), npm_version: '10.9.4', lockfile_sha256: 'f'.repeat(64), build_command: 'npm ci --ignore-scripts && npm run build', web_dist_tree_sha256: 'b'.repeat(64), runtime_jar_sha256: ref('LOCAL_RUNTIME_JAR', 'runtime.jar', 'jar').sha256 }
  });
}

function materializationEvidence() {
  const report_refs = Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), report_ref: ref('MATERIALIZATION_REPORT', `materialization/reports/${key(index)}.json`, `report-${index}`) }));
  const database_refs = Array.from({ length: 130 }, (_, index) => ({ fixture_ref_key: key(index), database_ref: ref('DATABASE', `materialization/fixtures/${key(index)}/project.db`, `database-${index}`), semantic_state_sha256: sha(`semantic-${index}`) }));
  return { report_refs, database_refs };
}

function familyMaterializationPlan() {
  const fixtures = Array.from({ length: 130 }, (_, index) => ({
    path: `fixtures/family-${index}.json`, byte_length: index + 1, sha256: sha(`fixture-${index}`),
    bundle_sha256: 'a'.repeat(64), archive_entry_path: `fixtures/family-${index}.json`
  }));
  return {
    plan_status: 'READY_FOR_AUTHORING',
    input_materialization: { bundle_ref: { kind: 'EVIDENCE_BUNDLE', path: 'bundle.zip', byte_length: 1, sha256: 'a'.repeat(64) } },
    captures: fixtures.flatMap((fixture, index) => Array.from({ length: 9 }, (_, occurrence) => ({ capture_kind: 'FAMILY', capture_id: `family-${index}-${occurrence}`, fixture_ref: fixture })))
  };
}

function captureAttempts(environment) { return environment.png_refs.flatMap(value => [1, 2].map(attempt_ordinal => ({ capture_id: value.capture_id, attempt_ordinal, png_byte_length: value.ref.byte_length, png_sha256: value.ref.sha256, width: 1, height: 1, cell_geometry_sha256: '1'.repeat(64), projection_sha256: '2'.repeat(64) }))); }
function blankAttempts(environment) { return environment.blank_baseline_refs.flatMap(value => [1, 2].map(attempt_ordinal => ({ baseline_id: value.baseline_id, attempt_ordinal, png_byte_length: value.ref.byte_length, png_sha256: value.ref.sha256, width: 1, height: 1 }))); }
function initialLineage() { return { mode: 'INITIAL', golden_set_version: '1.0.0', old_golden_set_version: null, old_golden_set_sha256: null }; }
function identity(command) { return { runner_version: '0.2.0', source_commit: 'd'.repeat(40), node_version: 'v22.22.0', command, runner_source_sha256: 'e'.repeat(64) }; }
function key(index) { return index.toString(16).padStart(64, '0'); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }

async function createPngAssets(root, entries, idKey) {
  const assets = [];
  for (const entry of entries) {
    const path = join(root, 'captures', 'attempt-1', `${entry[idKey]}.png`);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, Buffer.from('png'));
    assets.push({ [idKey]: entry[idKey], path: `captures/attempt-1/${entry[idKey]}.png` });
  }
  return assets;
}

async function createFonts(root) {
  return await Promise.all(['UI_SANS', 'CJK_FALLBACK', 'MONOSPACE'].map(async (logical_role, index) => {
    const source_path = join(root, `${logical_role}.font`);
    const bytes = Buffer.from(`font-${index}`);
    await writeFile(source_path, bytes);
    return { logical_role, postscript_name: `Font${index}`, font_version: '1.0', source_path, source_ref: ref('FONT_FILE', source_path, bytes) };
  }));
}
