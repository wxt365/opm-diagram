import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { listSafeArchiveEntries, materializeArchiveEntries } from './canvas06-e2e-manifest-v01-archive.mjs';
import { verifyCommonFixtureInput } from './canvas06-e2e-common-fixtures.mjs';
import { collectFixtureRefs, deriveCommonCases, deriveFamilyCases, resolveSymbolLogicalPath, verifyFamilyFixtureIdentityCatalog } from './canvas06-e2e-manifest-v01-input.mjs';
import { loadControlledReadyTrustChain, loadProductionReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { archiveEntryPath, archiveRef, assertDirectory, copyRegularFile, copyTree, fileRef, fsyncPath, fsyncTree, jcs, listTree, readJson, resolveInside, sha256, verifyFileRef, writeBytes } from './canvas06-e2e-manifest-v01-support.mjs';
import { composeE2eManifestV02, manifestBytes } from './canvas06-e2e-manifest-v02-compose.mjs';
import { assertProfileAssetSourceSetStable, assertProfileAssetThreeWayJoin, E2eManifestV02Error, fail, formatSourceDateEpoch, materializeProfileAssetStaging, parseProducerOptions, readProfileAssetSourceSet, removeProfileAssetStaging } from './canvas06-e2e-manifest-v02-input.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';

const workspaceRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const commonCatalogName = 'dev-canvas-06-common-fixture-catalog.json';
const commonCatalogSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const familyIdentitySchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateCommonCatalog = ajv.compile(commonCatalogSchema);
const validateFamilyIdentity = ajv.compile(familyIdentitySchema);

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProducerOptions(argv);
  const paths = await validatePaths(options);
  const trust = await loadTrust(options);
  const source = await inspectSource(paths.sourceRoot, trust.handoff.value, dependencies);
  const expectedId = `dev-canvas-06.e2e.${source.commit.slice(0, 12)}.${trust.intake.ref.sha256.slice(0, 12)}`;
  const expectedOut = `dev-canvas-06/e2e/manifests/${expectedId}/dev-canvas-06-e2e-manifest.json`;
  if (options.out !== expectedOut) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'out must be the exact path derived from source commit and Intake raw SHA.');
  const finalRoot = resolve(paths.outputRoot, dirname(options.out));
  if (!relative(paths.outputRoot, finalRoot) || relative(paths.outputRoot, finalRoot).startsWith('..')) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'out escapes output-root.');
  await assertFresh(finalRoot, expectedId);
  const runtime = await resolveJava(dependencies.runtime);
  const archive = await loadArchive(trust, runtime.jarPath);
  const materialized = await materializeFamily(archive, runtime, trust.handoff.value.active_binding);
  const common = await loadCommon(paths.commonRoot, trust.handoff.value.active_binding);
  const sourceProfile = await readProfileAssetSourceSet(paths.sourceRoot);
  let profileStagingRoot;
  let staging;
  try {
    profileStagingRoot = await materializeProfileAssetStaging({
      sourceSet: sourceProfile,
      profileAssetRoot: paths.profileStagingRoot,
      isolatedRoots: [paths.sourceRoot, paths.commonRoot, paths.outputRoot, trust.root]
    });
    await fsyncTree(profileStagingRoot);
    const profileStaging = await loadProfileAssetClosure({ assetRoot: profileStagingRoot, activeBinding: trust.handoff.value.active_binding });
    const recheckedSource = await readProfileAssetSourceSet(paths.sourceRoot);
    assertProfileAssetSourceSetStable(sourceProfile, recheckedSource);
    assertProfileAssetThreeWayJoin(recheckedSource, profileStaging, profileStaging);
    staging = await createStaging(finalRoot);
    const staged = await stageInputs({ staging, paths, trust, source, archive, materialized, common, sourceProfile: recheckedSource, profileStaging, profileStagingRoot });
    const familyCases = deriveFamilyCases({
      coverage: materialized.coverage,
      goldenManifest: materialized.goldenManifest,
      replay: materialized.replay,
      materializedEntries: staged.familyEntries
    });
    verifyFamilyFixtureIdentityCatalog({
      catalog: materialized.familyIdentity,
      goldenManifest: materialized.goldenManifest,
      goldenManifestBytes: materialized.bytes.get(materialized.goldenManifestEntry),
      fixtureBytesByEntry: materialized.familyFixtureBytes
    });
    const commonCases = deriveCommonCases({ catalog: common.catalog, materializedRefs: staged.commonEntries });
    const cases = [...familyCases, ...commonCases];
    const manifest = composeE2eManifestV02({
      source_date_epoch: options['source-date-epoch'],
      node_version: process.version,
      playwright_version: source.playwrightVersion,
      chromium_version: source.chromiumVersion,
      os: `${process.platform}-${process.arch}`,
      command: normalizedCommand(options),
      runner_source_sha256: source.runnerSha,
      intake_report_ref: staged.intakeRef,
      handoff_ref: staged.handoffRef,
      upstream_source_build: trust.handoff.value.source_build,
      source_build: staged.sourceBuild,
      upstream_input_refs: [
        { input_kind: 'COVERAGE_CATALOG', ref: staged.coverageRef },
        { input_kind: 'GOLDEN_MANIFEST', ref: staged.goldenManifestRef },
        { input_kind: 'GOLDEN_REPLAY_REPORT', ref: staged.replayRef },
        { input_kind: 'SYMBOL_CATALOG', ref: staged.symbolRef },
        { input_kind: 'HANDOFF_EVIDENCE_BUNDLE', ref: staged.bundleRef }
      ],
      input_materialization: {
        bundle_ref: staged.bundleRef,
        java_version: runtime.version,
        entry_allowlist: materialized.allowlist,
        materialized_count: materialized.allowlist.length,
        aggregate_sha256: sha256(Buffer.from(jcs(staged.archiveRefs.sort((a, b) => a.archive_entry_path.localeCompare(b.archive_entry_path, 'en')).map(item => ({ archive_entry_path: item.archive_entry_path, path: item.path, byte_length: item.byte_length, sha256: item.sha256 }))), 'utf8')),
        temporary_directory_cleaned: true
      },
      common_fixture_catalog_ref: staged.commonCatalogRef,
      fixture_refs: collectFixtureRefs(cases, [staged.familyIdentityRef]),
      driver_catalog: staged.drivers,
      cases,
      profile_asset_tree_ref: staged.profile.profile_asset_tree_ref,
      profile_asset_refs: staged.profile.profile_asset_refs
    });
    const manifestRef = await writeBytes({ bytes: Buffer.from(manifestBytes(manifest), 'utf8'), destinationRoot: staging, destination: 'dev-canvas-06-e2e-manifest.json', kind: 'E2E_MANIFEST', code: 'E2E_MANIFEST_IO_FAILED' });
    await verifyCopiedInputs({ staging, manifest, common, sourceProfile: recheckedSource, profileStaging });
    await removeProfileAssetStaging(profileStagingRoot, fsyncPath);
    profileStagingRoot = undefined;
    await fsyncTree(staging);
    await rename(staging, finalRoot);
    try { await fsyncPath(dirname(finalRoot)); }
    catch (error) { fail('E2E_MANIFEST_IO_FAILED', 'PARENT_FSYNC', error.message); }
    return { path: resolve(finalRoot, manifestRef.path), sha256: manifestRef.sha256 };
  } catch (error) {
    if (staging) await rm(staging, { recursive: true, force: true });
    if (profileStagingRoot) await rm(profileStagingRoot, { recursive: true, force: true });
    throw normalize(error);
  } finally {
    await rm(materialized.temporary, { recursive: true, force: true });
  }
}

async function validatePaths(options) {
  const sourceRoot = resolve(options['source-root']);
  const commonRoot = resolve(options['common-fixture-root']);
  const profileStagingRoot = resolve(options['profile-asset-root']);
  const outputRoot = resolve(options['output-root']);
  await assertDirectory(sourceRoot, 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  await assertDirectory(commonRoot, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  await mkdir(outputRoot, { recursive: true });
  await assertDirectory(outputRoot, 'E2E_MANIFEST_IO_FAILED');
  for (const [left, right] of [[sourceRoot, commonRoot], [sourceRoot, outputRoot], [commonRoot, outputRoot]]) {
    if (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'PATHS', 'Source, Common, and output roots must be independent.');
  }
  return { sourceRoot, commonRoot, profileStagingRoot, outputRoot };
}

async function loadTrust(options) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    return { root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff, handoffPath: resolve(chain.bundle.root, chain.bundle.descriptor.handoff_ref.path), raw: { intake: chain.bundle.references.intake_report_ref, handoff: chain.bundle.references.handoff_ref, archive: chain.bundle.references.evidence_bundle_ref } };
  }
  const root = resolve(options['handoff-root']);
  const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadProductionReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  const archive = oneArtifact(chain.handoff.value, 'EVIDENCE_BUNDLE');
  return { root, intake: chain.intake, handoff: chain.handoff, handoffPath: resolve(root, chain.handoff.ref.path), raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive } };
}

async function inspectSource(sourceRoot, handoff, dependencies) {
  const git = dependencies.git ?? ((root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim());
  const commit = await git(sourceRoot, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(commit) || commit !== handoff.source_build?.source_commit) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_CLEAN_HEAD', 'source-root HEAD must exactly match Handoff source build.');
  if ((await git(sourceRoot, ['status', '--porcelain'])).trim()) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_CLEAN_HEAD', 'source-root must be clean.');
  const lockfile = resolveInside(sourceRoot, 'package-lock.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const runner = resolveInside(sourceRoot, 'scripts/release-canvas06-e2e-manifest-v02.mjs', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const packageJson = await readJson(resolveInside(sourceRoot, 'node_modules/@playwright/test/package.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const browsers = await readJson(resolveInside(sourceRoot, 'node_modules/playwright-core/browsers.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const chromium = browsers.browsers?.find(item => item.name === 'chromium');
  if (!packageJson.version || !chromium?.revision) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'LOCKFILE', 'Playwright and Chromium metadata are required.');
  return { commit, lockfile, runnerSha: sha256(await readFile(runner)), playwrightVersion: packageJson.version, chromiumVersion: String(chromium.revision) };
}

async function loadArchive(trust, jarPath) {
  const expected = oneArtifact(trust.handoff.value, 'EVIDENCE_BUNDLE');
  const external = await verifyFileRef({ root: trust.root, reference: trust.raw.archive, code: 'E2E_MANIFEST_INTAKE_INVALID' });
  if (external.bytes.length !== expected.byte_length || sha256(external.bytes) !== expected.sha256) fail('E2E_MANIFEST_INTAKE_INVALID', 'EXTERNAL_TRUST', 'Evidence Bundle differs from Handoff artifact.');
  return { path: external.path, bytes: external.bytes, ref: trust.raw.archive, entries: await listSafeArchiveEntries({ jarPath, archivePath: external.path }) };
}

async function materializeFamily(archive, runtime, activeBinding) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-e2e-v02-'));
  const prefix = `packages/profiles/${activeBinding.profile.id}/${activeBinding.profile.version}`;
  const profileEntry = `${prefix}/profile.json`;
  const coverageEntry = `${prefix}/golden/opm-opl-coverage-catalog.json`;
  const goldenManifestEntry = `${prefix}/golden/opm-opl-golden-manifest.json`;
  const familyIdentityEntry = `${prefix}/golden/opm-e2e-family-fixture-identity-catalog.json`;
  const replayEntry = `${prefix}/handoff/reports/golden-replay.json`;
  const initial = [profileEntry, coverageEntry, goldenManifestEntry, familyIdentityEntry, replayEntry];
  requireEntries(archive.entries, initial);
  const initialBytes = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: archive.path, entries: initial, destination: temporary, allowExisting: true });
  const profile = json(initialBytes.get(profileEntry), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY');
  const symbolEntry = `${prefix}/${resolveSymbolLogicalPath({ profile, activeBinding })}`;
  const goldenManifest = json(initialBytes.get(goldenManifestEntry), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY');
  const familyIdentity = json(initialBytes.get(familyIdentityEntry), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY');
  if (!validateFamilyIdentity(familyIdentity) || familyIdentity.catalog_version !== '0.1.0') fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY', 'Family Identity Catalog is not active 0.1.0.');
  const fixtureEntries = [...new Set(goldenManifest.cases?.flatMap(item => [item.base_revision_fixture, item.input_revision_fixture]).map(item => `${prefix}/${item}`))].sort((a, b) => a.localeCompare(b, 'en'));
  const remaining = [symbolEntry, ...fixtureEntries];
  requireEntries(archive.entries, remaining);
  const remainingBytes = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: archive.path, entries: remaining, destination: temporary, allowExisting: true });
  const bytes = new Map([...initialBytes, ...remainingBytes]);
  return { temporary, prefix, profileEntry, coverageEntry, goldenManifestEntry, familyIdentityEntry, replayEntry, symbolEntry, fixtureEntries, allowlist: [...initial, ...remaining].sort((a, b) => a.localeCompare(b, 'en')), bytes, coverage: json(bytes.get(coverageEntry), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY'), goldenManifest, replay: json(bytes.get(replayEntry), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY'), familyIdentity, familyFixtureBytes: new Map(fixtureEntries.filter(item => goldenManifest.cases.some(value => `${prefix}/${value.base_revision_fixture}` === item)).map(item => [item.slice(`${prefix}/`.length), bytes.get(item)])) };
}

async function loadCommon(root, activeBinding) {
  try { await verifyCommonFixtureInput({ commonRoot: root, catalogPath: commonCatalogName, activeBinding }); }
  catch { fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_0.2.0_43_VERIFY', 'Common fixture root did not pass the active 43-file verifier.'); }
  const entries = await listTree(root, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (entries.length !== 43) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_0.2.0_43_VERIFY', 'Common fixture root must contain exactly 43 files.');
  const catalog = await readJson(resolveInside(root, commonCatalogName, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommonCatalog(catalog) || catalog.catalog_version !== '0.2.0') fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_0.2.0_43_VERIFY', 'Common Fixture Catalog is not active 0.2.0.');
  return { catalog, digest: sha256(Buffer.from(jcs(entries), 'utf8')) };
}

async function stageInputs({ staging, paths, trust, source, archive, materialized, common, sourceProfile, profileStaging, profileStagingRoot }) {
  const bundleRef = await writeBytes({ bytes: archive.bytes, destinationRoot: staging, destination: 'inputs/trust/evidence-bundle.zip', kind: 'EVIDENCE_BUNDLE', code: 'E2E_MANIFEST_IO_FAILED' });
  const intakeRef = await copyExternal(trust.root, trust.raw.intake, staging, 'inputs/trust/intake-report.json', 'INTAKE_REPORT');
  const handoffRef = await copyExternal(trust.root, trust.raw.handoff, staging, 'inputs/trust/handoff.json', 'HANDOFF');
  const lockfileRef = await copyRegularFile({ source: source.lockfile, destinationRoot: staging, destination: 'inputs/build/package-lock.json', kind: 'NPM_LOCKFILE', code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const jarRef = await copyRegularFile({ source: resolveInside(paths.sourceRoot, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), destinationRoot: staging, destination: 'inputs/build/local-runtime.jar', kind: 'LOCAL_RUNTIME_JAR', code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const expectedJar = oneArtifact(trust.handoff.value, 'LOCAL_RUNTIME_JAR');
  if (jarRef.byte_length !== expectedJar.byte_length || jarRef.sha256 !== expectedJar.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME_JAR', 'Runtime JAR differs from Handoff artifact.');
  const webRef = await copyTree({ sourceRoot: resolveInside(paths.sourceRoot, 'apps/web/dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), destinationRoot: staging, destination: 'inputs/build/web-dist', code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const expectedWeb = oneArtifact(trust.handoff.value, 'WEB_DIST_TREE');
  if (webRef.byte_length !== expectedWeb.byte_length || webRef.sha256 !== expectedWeb.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'WEB_DIST', 'Web dist differs from Handoff artifact.');
  const profile = await stageProfile(profileStagingRoot, staging, sourceProfile, profileStaging, trust.handoff.value.active_binding);
  const copyArchive = async (entry, destination) => {
    const bytes = materialized.bytes.get(entry);
    if (!bytes) fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY_DEEP_JOIN', 'Required Family archive entry is missing.');
    await writeBytes({ bytes, destinationRoot: staging, destination, kind: 'ARCHIVE_INPUT', code: 'E2E_MANIFEST_IO_FAILED' });
    return archiveRef({ destination, bytes, bundleSha256: bundleRef.sha256, archiveEntry: entry });
  };
  const coverageRef = await copyArchive(materialized.coverageEntry, 'inputs/upstream/family/coverage-catalog.json');
  const goldenManifestRef = await copyArchive(materialized.goldenManifestEntry, 'inputs/upstream/family/golden-manifest.json');
  await copyArchive(materialized.profileEntry, 'inputs/upstream/family/profile.json');
  const familyIdentityArchiveRef = await copyArchive(materialized.familyIdentityEntry, 'inputs/upstream/family-identity-catalog.json');
  const familyIdentityRef = await fileRef(resolveInside(staging, familyIdentityArchiveRef.path, 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID'), staging, 'FAMILY_FIXTURE_IDENTITY_CATALOG', 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID');
  const replayRef = await copyArchive(materialized.replayEntry, 'inputs/upstream/family/golden-replay.json');
  const symbolRef = await copyArchive(materialized.symbolEntry, 'inputs/upstream/family/symbol-catalog.json');
  const archiveRefs = [coverageRef, goldenManifestRef, familyIdentityArchiveRef, replayRef, symbolRef];
  const familyEntries = new Map();
  for (const entry of materialized.fixtureEntries) { const ref = await copyArchive(entry, archiveEntryPath(entry)); archiveRefs.push(ref); familyEntries.set(entry.slice(`${materialized.prefix}/`.length), ref); }
  await copyTree({ sourceRoot: paths.commonRoot, destinationRoot: staging, destination: 'inputs/common', code: 'E2E_MANIFEST_COMMON_FIXTURE_INVALID' });
  const copiedCommon = sha256(Buffer.from(jcs(await listTree(resolveInside(staging, 'inputs/common', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID')), 'utf8'));
  if (copiedCommon !== common.digest) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COPY_ALL_INPUTS', 'Common tree changed during copy.');
  const commonCatalogRef = await fileRef(resolveInside(staging, `inputs/common/${commonCatalogName}`, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), staging, 'COMMON_FIXTURE_CATALOG', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  const commonEntries = new Map();
  for (const item of common.catalog.e2e_cases) for (const ref of [item.base_fixture_ref, item.input_ref]) commonEntries.set(ref.path, await finalCommonRef(staging, ref));
  const drivers = [];
  for (const [driver_id, file] of [['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'], ['DRIVER-STRUCTURAL', 'structural-driver.mjs'], ['DRIVER-COMMON', 'common-driver.mjs']]) {
    drivers.push({ driver_id, source_ref: await copyRegularFile({ source: resolveInside(paths.sourceRoot, `tests/e2e/release/dev-canvas-06/drivers/${file}`, 'E2E_MANIFEST_DRIVER_INVALID'), destinationRoot: staging, destination: `inputs/drivers/${file}`, kind: 'E2E_DRIVER_SOURCE', code: 'E2E_MANIFEST_DRIVER_INVALID' }) });
  }
  return { intakeRef, handoffRef, bundleRef, coverageRef, goldenManifestRef, replayRef, symbolRef, familyIdentityRef, archiveRefs, familyEntries, commonCatalogRef, commonEntries, drivers, profile, sourceBuild: { source_commit: source.commit, dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build', node_version: process.version, lockfile_sha256: lockfileRef.sha256, web_dist: webRef, local_runtime_jar: jarRef } };
}

async function stageProfile(profileStagingRoot, staging, sourceSet, profileStaging, activeBinding) {
  for (const reference of sourceSet.profile_asset_refs) {
    const sourceRelative = reference.path.slice('inputs/upstream/profile-assets/'.length);
    await copyRegularFile({ source: resolveInside(profileStagingRoot, sourceRelative, 'E2E_MANIFEST_PROFILE_ASSET_INVALID'), destinationRoot: staging, destination: reference.path, kind: reference.kind, code: 'E2E_MANIFEST_PROFILE_ASSET_INVALID' });
  }
  const target = await loadProfileAssetClosure({ assetRoot: resolveInside(staging, 'inputs/upstream/profile-assets', 'E2E_MANIFEST_PROFILE_ASSET_INVALID'), activeBinding });
  assertProfileAssetThreeWayJoin(sourceSet, profileStaging, target);
  return target;
}

async function verifyCopiedInputs({ staging, manifest, common, sourceProfile, profileStaging }) {
  const finalProfile = await loadProfileAssetClosure({ assetRoot: resolveInside(staging, 'inputs/upstream/profile-assets', 'E2E_MANIFEST_PROFILE_ASSET_INVALID'), activeBinding: profileStaging.active_binding });
  assertProfileAssetThreeWayJoin(sourceProfile, profileStaging, finalProfile);
  if (manifest.profile_asset_tree_ref.path !== 'inputs/upstream/profile-assets' || JSON.stringify(manifest.profile_asset_refs) !== JSON.stringify(finalProfile.profile_asset_refs)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'INTERNAL_SEMANTIC_VERIFY', 'Profile refs are not closed.');
  const targetCommon = await listTree(resolveInside(staging, 'inputs/common', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (targetCommon.length !== 43 || sha256(Buffer.from(jcs(targetCommon), 'utf8')) !== common.digest) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'INTERNAL_SEMANTIC_VERIFY', 'Common root is not exact.');
  for (const ref of [...manifest.driver_catalog.map(item => item.source_ref), manifest.source_build.local_runtime_jar, manifest.common_fixture_catalog_ref, ...manifest.profile_asset_refs]) await verifyFileRef({ root: staging, reference: ref, code: 'E2E_MANIFEST_JOIN_MISMATCH' });
  if (manifest.cases.length !== 194 || manifest.cases.filter(item => item.capability_id).length !== 178 || manifest.cases.filter(item => !item.capability_id).length !== 16) fail('E2E_MANIFEST_JOIN_MISMATCH', 'INTERNAL_SEMANTIC_VERIFY', 'Case set is incomplete.');
}

async function copyExternal(root, reference, staging, destination, kind) {
  const source = await verifyFileRef({ root, reference, code: 'E2E_MANIFEST_INTAKE_INVALID' });
  return writeBytes({ bytes: source.bytes, destinationRoot: staging, destination, kind, code: 'E2E_MANIFEST_IO_FAILED' });
}

async function finalCommonRef(staging, reference) {
  const actual = await fileRef(resolveInside(staging, `inputs/common/${reference.path}`, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), staging, reference.kind, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (actual.byte_length !== reference.byte_length || actual.sha256 !== reference.sha256) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COPY_ALL_INPUTS', 'Common raw ref differs from Catalog.');
  return actual;
}

async function createStaging(finalRoot) {
  const parent = dirname(finalRoot);
  await mkdir(parent, { recursive: true });
  const staging = resolve(parent, `.${basename(finalRoot)}.tmp-${process.pid}-${Date.now()}`);
  try { await mkdir(staging, { recursive: false }); } catch (error) { fail('E2E_MANIFEST_IO_FAILED', 'CREATE_STAGING', error.message); }
  return staging;
}

async function assertFresh(finalRoot, id) {
  try { await readdir(finalRoot); fail('E2E_MANIFEST_TRANSACTION_INVALID', 'OUTPUT_FRESH', 'Final root already exists.'); } catch (error) { if (error instanceof E2eManifestV02Error) throw error; if (error?.code !== 'ENOENT') fail('E2E_MANIFEST_IO_FAILED', 'OUTPUT_FRESH', error.message); }
  const parent = dirname(finalRoot);
  try { if ((await readdir(parent)).some(name => name.startsWith(`.${id}.tmp-`))) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'OUTPUT_FRESH', 'Abandoned staging root must be isolated first.'); } catch (error) { if (error instanceof E2eManifestV02Error) throw error; if (error?.code !== 'ENOENT') fail('E2E_MANIFEST_IO_FAILED', 'OUTPUT_FRESH', error.message); }
}

async function resolveJava(override) {
  if (override) return override;
  const home = process.env.JAVA_HOME;
  if (!home) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME_JAR', 'JAVA_HOME is required for archive verification.');
  const javaPath = resolve(home, 'bin/java');
  const jarPath = resolve(home, 'bin/jar');
  const result = spawnSync(javaPath, ['-version'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME_JAR', 'Java version command failed.');
  if (!/(?:java|openjdk) version "?21(?:\.|\")/.test(output)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'RUNTIME_JAR', 'Java 21 is required.');
  return { jarPath, version: output.trim().replace(/\s+/g, ' ') };
}

function oneArtifact(handoff, kind) { const values = handoff.build_artifacts?.filter(item => item.kind === kind) ?? []; if (values.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', 'EXTERNAL_TRUST', `Handoff must contain one ${kind} artifact.`); return values[0]; }
function requireEntries(entries, expected) { const actual = new Set(entries); for (const entry of expected) if (!actual.has(entry)) fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY_DEEP_JOIN', 'Evidence Bundle is missing a required Family entry.'); }
function json(bytes, code, stage) { try { return JSON.parse(bytes.toString('utf8')); } catch { fail(code, stage, 'Input JSON is invalid.'); } }
function normalizedCommand(options) { const common = [['input-mode', options['input-mode']], ['source-root', '<source-root>'], ['source-date-epoch', options['source-date-epoch']], ['common-fixture-root', '<common-fixture-root>'], ['profile-asset-root', '<profile-asset-root>'], ['output-root', '<output-root>'], ['out', options.out]]; const trust = options['input-mode'] === 'PRODUCTION_HANDOFF' ? [['handoff-root', '<handoff-root>'], ['intake-report', options['intake-report']], ['require-production', null]] : [['controlled-bundle-root', '<controlled-bundle-root>']]; return [...common.slice(0, 1), ...trust, ...common.slice(1)].map(([key, value]) => value === null ? `--${key}` : `--${key} ${value}`).join(' '); }
function normalize(error) { if (error instanceof E2eManifestV02Error) return error; return new E2eManifestV02Error('E2E_MANIFEST_IO_FAILED', 'INTERNAL', error.message); }

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(result => process.stdout.write(`${result.path}\t${result.sha256}\n`)).catch(error => { const value = normalize(error); process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`); process.exitCode = value.exitCode; });
}
