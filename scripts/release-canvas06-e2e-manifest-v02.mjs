import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { listSafeArchiveEntries, materializeArchiveEntries } from './canvas06-e2e-manifest-v01-archive.mjs';
import { collectFixtureRefs, deriveCommonCases, deriveFamilyCases, verifyFamilyFixtureIdentityCatalog } from './canvas06-e2e-manifest-v01-input.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { archiveEntryPath, archiveRef, copyRegularFile, copyTree, fileRef, fsyncPath, fsyncTree, jcs, readJson, resolveInside, sha256, treeRef, verifyFileRef, writeBytes } from './canvas06-e2e-manifest-v01-support.mjs';
import { composeE2eManifestV02, manifestBytes } from './canvas06-e2e-manifest-v02-compose.mjs';
import { fail, formatSourceDateEpoch, materializeProfileAssetStaging, parseProducerOptions, removeProfileAssetStaging } from './canvas06-e2e-manifest-v02-input.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';
import { verifyStagingRoot } from './verify-canvas06-e2e-manifest-v02.mjs';

const execFile = promisify(execFileCallback);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const FAMILY_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateCommon = ajv.compile(COMMON_SCHEMA);
const validateFamily = ajv.compile(FAMILY_SCHEMA);
const DRIVER_FILES = Object.freeze([
  ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'],
  ['DRIVER-CONTROL', 'control-driver.mjs'],
  ['DRIVER-STRUCTURAL', 'structural-driver.mjs'],
  ['DRIVER-COMMON', 'common-driver.mjs']
]);

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProducerOptions(argv);
  if (options['input-mode'] === 'PRODUCTION_HANDOFF') await assertQuarantine(options['handoff-root']);
  const trust = await loadTrust(options);
  const source = await inspectSource(options['source-root'], dependencies);
  const manifestId = `dev-canvas-06.e2e.${source.commit.slice(0, 12)}.${trust.intake.ref.sha256.slice(0, 12)}`;
  const expectedOut = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  if (options.out !== expectedOut) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'out must be derived from the source commit and Intake raw ref.');
  const outputRoot = resolve(options['output-root']);
  await ensureDirectory(outputRoot, 'ARGS');
  const finalRoot = safeResolve(outputRoot, dirname(expectedOut));
  await assertOutputFresh(finalRoot);
  const profileStaging = resolve(options['profile-asset-root']);
  assertSeparate(profileStaging, [source.root, outputRoot, resolve(options['common-fixture-root']), trust.root]);
  const runtime = await javaRuntime(dependencies.runtime);
  const archive = await loadArchive({ trust, runtime });
  const common = await loadCommon({ root: resolve(options['common-fixture-root']), handoffPath: trust.handoffPath });
  const profileRoot = await materializeProfileAssetStaging({ sourceRoot: source.root, stagingRoot: profileStaging });
  try {
    const profile = await loadProfileAssetClosure({ assetRoot: profileRoot, activeBinding: trust.handoff.value.active_binding });
    const staging = await createStaging(finalRoot);
    try {
      const staged = await stage({ staging, source, trust, archive, runtime, common, profileRoot, profile });
      const cases = [...deriveFamilyCases(staged.family), ...deriveCommonCases({ catalog: common.catalog, materializedRefs: staged.commonRefs })];
      const manifest = composeE2eManifestV02({
        source_date_epoch: options['source-date-epoch'], node_version: process.version, playwright_version: source.playwrightVersion,
        chromium_version: source.chromiumVersion, os: `${process.platform}-${process.arch}`, command: normalizedCommand(options),
        runner_source_sha256: source.runnerSha, intake_report_ref: staged.intakeRef, handoff_ref: staged.handoffRef,
        upstream_source_build: trust.handoff.value.source_build, source_build: staged.sourceBuild, upstream_input_refs: staged.upstreamRefs,
        input_materialization: staged.materialization, common_fixture_catalog_ref: staged.commonCatalogRef,
        fixture_refs: collectFixtureRefs(cases, [staged.familyCatalogRef]), driver_catalog: staged.drivers, cases,
        profile_asset_tree_ref: profile.profile_asset_tree_ref, profile_asset_refs: profile.profile_asset_refs
      });
      await writeBytes({ bytes: Buffer.from(manifestBytes(manifest), 'utf8'), destinationRoot: staging, destination: 'dev-canvas-06-e2e-manifest.json', kind: 'E2E_MANIFEST', code: 'E2E_MANIFEST_IO_FAILED' });
      await removeProfileAssetStaging(profileRoot);
      await verifyStagingRoot(stagingArgs(options, staging), { runtime });
      await fsyncTree(staging);
      await rename(staging, finalRoot);
      try { await fsyncPath(dirname(finalRoot)); }
      catch { fail('E2E_MANIFEST_IO_FAILED', 'PARENT_FSYNC', 'Final root was renamed but its parent cannot be fsynced.'); }
      const manifestPath = resolve(finalRoot, 'dev-canvas-06-e2e-manifest.json');
      const bytes = await readFile(manifestPath);
      return { path: manifestPath, sha256: sha256(bytes) };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await removeIfPresent(profileRoot);
    await rm(archive.temp, { recursive: true, force: true });
  }
}

async function loadTrust(options) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    return { root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff, handoffPath: chain.bundle.references.handoff_ref.absolute_path,
      raw: { intake: chain.bundle.references.intake_report_ref, handoff: chain.bundle.references.handoff_ref, archive: chain.bundle.references.evidence_bundle_ref } };
  }
  const root = resolve(options['handoff-root']);
  const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  const archives = chain.handoff.value.build_artifacts?.filter(item => item.kind === 'EVIDENCE_BUNDLE') ?? [];
  if (archives.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', 'EXTERNAL_TRUST', 'Handoff must contain one Evidence Bundle.');
  return { root, intake: chain.intake, handoff: chain.handoff, handoffPath: resolveInside(root, chain.handoff.ref.path), raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive: archives[0] } };
}

async function inspectSource(rootValue, dependencies) {
  const root = resolve(rootValue);
  await ensureDirectory(root, 'SOURCE_CLEAN_HEAD');
  const git = dependencies.git ?? (async (cwd, args) => (await execFile('git', ['-C', cwd, ...args])).stdout.trim());
  const commit = await git(root, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(commit) || (await git(root, ['status', '--porcelain'])).trim()) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_CLEAN_HEAD', 'source-root must be a clean Git commit.');
  const runtimeJar = safeResolve(root, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar');
  const webDist = safeResolve(root, 'apps/web/dist');
  const lockfile = safeResolve(root, 'package-lock.json');
  const runner = safeResolve(root, 'scripts/release-canvas06-e2e-manifest-v02.mjs');
  for (const path of [runtimeJar, lockfile, runner]) await regular(path, 'SOURCE_ROOT_FIXED_PATHS');
  await ensureDirectory(webDist, 'SOURCE_ROOT_FIXED_PATHS');
  const packageJson = await readJson(safeResolve(root, 'node_modules/@playwright/test/package.json'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const browsers = await readJson(safeResolve(root, 'node_modules/playwright-core/browsers.json'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const chromium = browsers.browsers?.find(item => item.name === 'chromium');
  if (!packageJson.version || !chromium?.revision) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_ROOT_FIXED_PATHS', 'Playwright and Chromium metadata are required.');
  const drivers = DRIVER_FILES.map(([id, file]) => ({ id, file, source: safeResolve(root, `tests/e2e/release/dev-canvas-06/drivers/${file}`) }));
  for (const driver of drivers) await regular(driver.source, 'FOUR_DRIVERS');
  return { root, commit, runtimeJar, webDist, lockfile, runner, drivers, playwrightVersion: packageJson.version, chromiumVersion: String(chromium.revision), runnerSha: sha256(await readFile(runner)) };
}

async function loadArchive({ trust, runtime }) {
  const external = await verifyFileRef({ root: trust.root, reference: trust.raw.archive, code: 'E2E_MANIFEST_INTAKE_INVALID' });
  const temp = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-v02-archive-'));
  const active = trust.handoff.value.active_binding;
  const prefix = `packages/profiles/${active.profile.id}/${active.profile.version}`;
  const entries = await listSafeArchiveEntries({ jarPath: runtime.jarPath, archivePath: external.path });
  const required = [`${prefix}/golden/opm-opl-coverage-catalog.json`, `${prefix}/golden/opm-opl-golden-manifest.json`, `${prefix}/golden/opm-e2e-family-fixture-identity-catalog.json`, `${prefix}/handoff/reports/golden-replay.json`];
  for (const entry of required) if (!entries.includes(entry)) fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY', 'Evidence Bundle is missing a required family input.');
  const first = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: external.path, entries: required, destination: temp, allowExisting: true });
  const golden = JSON.parse(first.get(required[1]).toString('utf8'));
  const fixtureEntries = [...new Set(golden.cases.flatMap(item => [item.base_revision_fixture, item.input_revision_fixture]).map(path => `${prefix}/${path}`))].sort();
  for (const entry of fixtureEntries) if (!entries.includes(entry)) fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY', 'Evidence Bundle fixture closure is incomplete.');
  const rest = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: external.path, entries: fixtureEntries, destination: temp, allowExisting: true });
  return { temp, prefix, ref: trust.raw.archive, bytes: external.bytes, entries: required.concat(fixtureEntries).sort(), bytesByEntry: new Map([...first, ...rest]), golden, required, fixtureEntries };
}

async function loadCommon({ root, handoffPath }) {
  await ensureDirectory(root, 'COMMON_0.2.0_43_VERIFY');
  try { await execFile(process.execPath, [resolve(workspaceRoot, 'scripts/verify-canvas06-common-visual-fixtures.mjs'), '--handoff', handoffPath, '--fixture-root', root, '--catalog', 'dev-canvas-06-common-fixture-catalog.json'], { cwd: workspaceRoot }); }
  catch { fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_0.2.0_43_VERIFY', 'Common Fixture root did not pass the active verifier.'); }
  const catalog = await readJson(resolve(root, 'dev-canvas-06-common-fixture-catalog.json'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommon(catalog) || catalog.catalog_version !== '0.2.0') fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_0.2.0_43_VERIFY', 'Common Fixture Catalog is invalid.');
  return { root, catalog };
}

async function stage({ staging, source, trust, archive, runtime, common, profileRoot, profile }) {
  const intakeBytes = (await verifyFileRef({ root: trust.root, reference: trust.raw.intake })).bytes;
  const handoffBytes = (await verifyFileRef({ root: trust.root, reference: trust.raw.handoff })).bytes;
  const intakeRef = await writeBytes({ bytes: intakeBytes, destinationRoot: staging, destination: 'inputs/trust/intake-report.json', kind: 'INTAKE_REPORT' });
  const handoffRef = await writeBytes({ bytes: handoffBytes, destinationRoot: staging, destination: 'inputs/trust/handoff.json', kind: 'HANDOFF' });
  const bundleRef = await writeBytes({ bytes: archive.bytes, destinationRoot: staging, destination: 'inputs/trust/evidence-bundle.zip', kind: 'EVIDENCE_BUNDLE' });
  const familyEntries = new Map();
  const refs = new Map();
  for (const entry of archive.entries) {
    const destination = entry.includes('/golden/fixtures/') ? archiveEntryPath(entry) : `inputs/upstream/family/${basename(entry)}`;
    const bytes = archive.bytesByEntry.get(entry);
    const reference = await writeBytes({ bytes, destinationRoot: staging, destination, kind: 'ARCHIVE_INPUT' });
    const archiveReference = archiveRef({ destination, bytes, bundleSha256: bundleRef.sha256, archiveEntry: entry });
    refs.set(entry, archiveReference);
    if (entry.includes('/golden/fixtures/')) familyEntries.set(entry.slice(`${archive.prefix}/`.length), archiveReference);
    void reference;
  }
  const familyCatalogRef = await fileRef(resolve(staging, 'inputs/upstream/family/opm-e2e-family-fixture-identity-catalog.json'), staging, 'FAMILY_FIXTURE_IDENTITY_CATALOG');
  const catalog = JSON.parse(archive.bytesByEntry.get(`${archive.prefix}/golden/opm-e2e-family-fixture-identity-catalog.json`).toString('utf8'));
  if (!validateFamily(catalog) || catalog.catalog_version !== '0.1.0') fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY', 'Family identity catalog is invalid.');
  const baseBytes = new Map(archive.fixtureEntries.filter(entry => archive.golden.cases.some(item => `${archive.prefix}/${item.base_revision_fixture}` === entry)).map(entry => [entry.slice(`${archive.prefix}/`.length), archive.bytesByEntry.get(entry)]));
  verifyFamilyFixtureIdentityCatalog({ catalog, goldenManifest: archive.golden, goldenManifestBytes: archive.bytesByEntry.get(`${archive.prefix}/golden/opm-opl-golden-manifest.json`), fixtureBytesByEntry: baseBytes });
  const coverage = JSON.parse(archive.bytesByEntry.get(`${archive.prefix}/golden/opm-opl-coverage-catalog.json`).toString('utf8'));
  const replay = JSON.parse(archive.bytesByEntry.get(`${archive.prefix}/handoff/reports/golden-replay.json`).toString('utf8'));
  const commonTree = await copyTree({ sourceRoot: common.root, destinationRoot: staging, destination: 'inputs/common', code: 'E2E_MANIFEST_COMMON_FIXTURE_INVALID' });
  const commonCatalogRef = await fileRef(resolve(staging, 'inputs/common/dev-canvas-06-common-fixture-catalog.json'), staging, 'COMMON_FIXTURE_CATALOG');
  const commonRefs = new Map();
  for (const item of common.catalog.e2e_cases) for (const ref of [item.base_fixture_ref, item.input_ref]) commonRefs.set(ref.path, await fileRef(resolve(staging, `inputs/common/${ref.path}`), staging, ref.kind));
  const profileDestination = 'inputs/upstream/profile-assets';
  await copyTree({ sourceRoot: profileRoot, destinationRoot: staging, destination: profileDestination, code: 'E2E_MANIFEST_PROFILE_ASSET_INVALID' });
  const finalProfile = await loadProfileAssetClosure({ assetRoot: resolve(staging, profileDestination), activeBinding: profile.active_binding });
  if (JSON.stringify(finalProfile.profile_asset_refs) !== JSON.stringify(profile.profile_asset_refs) || JSON.stringify(finalProfile.profile_asset_tree_ref) !== JSON.stringify(profile.profile_asset_tree_ref)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_TREE', 'Staged Profile assets differ from the materialized root.');
  const localRuntimeJar = await copyRegularFile({ source: source.runtimeJar, destinationRoot: staging, destination: 'inputs/build/local-runtime.jar', kind: 'LOCAL_RUNTIME_JAR', code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const webDist = await copyTree({ sourceRoot: source.webDist, destinationRoot: staging, destination: 'inputs/build/web-dist', code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const lock = await copyRegularFile({ source: source.lockfile, destinationRoot: staging, destination: 'inputs/build/package-lock.json', kind: 'NPM_LOCKFILE' });
  const drivers = [];
  for (const driver of source.drivers) drivers.push({ driver_id: driver.id, source_ref: await copyRegularFile({ source: driver.source, destinationRoot: staging, destination: `inputs/drivers/${driver.file}`, kind: 'E2E_DRIVER_SOURCE', code: 'E2E_MANIFEST_DRIVER_INVALID' }) });
  const sourceBuild = { source_commit: source.commit, dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build', node_version: process.version, lockfile_sha256: lock.sha256, web_dist: webDist, local_runtime_jar: localRuntimeJar };
  return { intakeRef, handoffRef, sourceBuild, commonCatalogRef, familyCatalogRef, commonRefs, drivers, family: { coverage, goldenManifest: archive.golden, replay, materializedEntries: familyEntries },
    upstreamRefs: [
      { input_kind: 'COVERAGE_CATALOG', ref: refs.get(`${archive.prefix}/golden/opm-opl-coverage-catalog.json`) },
      { input_kind: 'GOLDEN_MANIFEST', ref: refs.get(`${archive.prefix}/golden/opm-opl-golden-manifest.json`) },
      { input_kind: 'GOLDEN_REPLAY_REPORT', ref: refs.get(`${archive.prefix}/handoff/reports/golden-replay.json`) },
      { input_kind: 'SYMBOL_CATALOG', ref: profile.profile_asset_refs.find(item => item.kind === 'SYMBOL_ASSET') },
      { input_kind: 'HANDOFF_EVIDENCE_BUNDLE', ref: bundleRef }
    ],
    materialization: { bundle_ref: bundleRef, java_version: runtime.javaVersion, entry_allowlist: archive.entries, materialized_count: archive.entries.length, aggregate_sha256: sha256(Buffer.from(jcs([...refs.values()].map(ref => ({ archive_entry_path: ref.archive_entry_path, path: ref.path, byte_length: ref.byte_length, sha256: ref.sha256 })).sort((a, b) => a.archive_entry_path.localeCompare(b.archive_entry_path))), 'utf8')), temporary_directory_cleaned: true }, commonTree };
}

function stagingArgs(options, staging) { return options['input-mode'] === 'CONTROLLED_TEST'
  ? ['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', options['controlled-bundle-root'], '--source-root', options['source-root'], '--manifest-root', staging, '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', resolve(staging, 'inputs/upstream/profile-assets')]
  : ['--input-mode', 'PRODUCTION_HANDOFF', '--handoff-root', options['handoff-root'], '--intake-report', options['intake-report'], '--require-production', '--source-root', options['source-root'], '--manifest-root', staging, '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', resolve(staging, 'inputs/upstream/profile-assets')]; }
function normalizedCommand(options) { return `node scripts/release-canvas06-e2e-manifest-v02.mjs --input-mode ${options['input-mode']}`; }
async function javaRuntime(override) { if (override) return override; const home = process.env.JAVA_HOME; if (!home) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME', 'JAVA_HOME is required.'); const javaPath = resolve(home, 'bin/java'); const jarPath = resolve(home, 'bin/jar'); try { const result = await execFile(javaPath, ['-version']); const output = `${result.stdout}\n${result.stderr}`; if (!/(?:java|openjdk) version "?21(?:\.|\")/.test(output)) throw new Error(); return { jarPath, javaVersion: output.trim() }; } catch { fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME', 'Java 21 is required.'); } }
async function assertQuarantine(handoffRoot) { const root = resolve(handoffRoot); const match = /^clean-([a-f0-9]{12})$/.exec(basename(root)); if (!match) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'handoff-root must be a clean-<source12> version root.'); for (const path of [resolve(dirname(root), 'quarantine', `clean-${match[1]}.json`), resolve(dirname(root), 'quarantine', `.clean-${match[1]}.json.tmp`)]) { try { await lstat(path); fail('E2E_MANIFEST_INPUT_QUARANTINED', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'Version input is quarantined.'); } catch (error) { if (error?.code !== 'ENOENT') { if (error?.code) throw error; } } } }
async function createStaging(finalRoot) { const parent = dirname(finalRoot); await mkdir(parent, { recursive: true }); const path = resolve(parent, `.${basename(finalRoot)}.tmp-${process.pid}`); try { await lstat(path); fail('E2E_MANIFEST_TRANSACTION_INVALID', 'CREATE_STAGING', 'Staging residual already exists.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } await mkdir(path); return path; }
async function assertOutputFresh(finalRoot) { try { await lstat(finalRoot); fail('E2E_MANIFEST_TRANSACTION_INVALID', 'OUTPUT_FRESH', 'Final root already exists.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
async function ensureDirectory(path, stage) { try { const info = await lstat(path); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(); } catch { fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', stage, 'Expected a non-symlink directory.'); } }
async function regular(path, stage) { try { const info = await lstat(path); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error(); } catch { fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', stage, 'Expected a single-link regular file.'); } }
function safeResolve(root, value) { const target = resolve(root, value); const relation = relative(resolve(root), target); if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'Path escapes its root.'); return target; }
function assertSeparate(value, roots) { for (const root of roots) { const left = resolve(value); const right = resolve(root); if (left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`)) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'PROFILE_STAGING', 'Profile staging root overlaps another input root.'); } }
async function removeIfPresent(path) { try { await lstat(path); await rm(path, { recursive: true, force: true }); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }

if (import.meta.url === new URL(process.argv[1], 'file:').href) main().then(result => process.stdout.write(`${result.path}\t${result.sha256}\n`)).catch(error => { process.stderr.write(`${error.code ?? 'E2E_MANIFEST_IO_FAILED'}\t${error.stage ?? 'INTERNAL'}\n`); process.exitCode = error.exitCode ?? 4; });
