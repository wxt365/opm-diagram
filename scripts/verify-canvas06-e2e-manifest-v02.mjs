import { lstat, readFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { collectFixtureRefs, deriveCommonCases, deriveFamilyCases, verifyFamilyFixtureIdentityCatalog } from './canvas06-e2e-manifest-v01-input.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { archiveEntryPath, fileRef, listTree, readJson, resolveInside, sha256, treeRef, verifyFileRef } from './canvas06-e2e-manifest-v01-support.mjs';
import { assertCaseDriverClosure, assertDriverCatalog, fail, parseVerifierOptions, PROFILE_SOURCE_ASSETS } from './canvas06-e2e-manifest-v02-input.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';

const schema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json', import.meta.url), 'utf8'));
const commonSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const familySchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateManifest = ajv.compile(schema);
const validateCommon = ajv.compile(commonSchema);
const validateFamily = ajv.compile(familySchema);
const DRIVER_FILES = Object.freeze([
  ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'],
  ['DRIVER-STRUCTURAL', 'structural-driver.mjs'], ['DRIVER-COMMON', 'common-driver.mjs']
]);

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseVerifierOptions(argv);
  if (options['input-mode'] === 'PRODUCTION_HANDOFF') await assertQuarantine(options['handoff-root']);
  const root = resolve(options['manifest-root']);
  await directory(root, 'ROOT_TYPE');
  const before = await digest(root);
  const expectedProfileRoot = resolve(root, 'inputs/upstream/profile-assets');
  if (resolve(options['profile-asset-root']) !== expectedProfileRoot) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'ARGS', 'profile-asset-root must be the exact final Profile root.');
  const manifestPath = resolveInside(root, options.manifest, 'E2E_MANIFEST_ARGUMENT_INVALID');
  const manifest = await readJson(manifestPath, 'E2E_MANIFEST_SCHEMA_INVALID');
  if (!validateManifest(manifest)) fail('E2E_MANIFEST_SCHEMA_INVALID', 'SCHEMA_0.2', JSON.stringify(validateManifest.errors));
  const trust = await loadTrust(options);
  await verifyRoot({ root, manifest, trust, sourceRoot: resolve(options['source-root']), dependencies });
  const after = await digest(root);
  if (before !== after) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'TREE_DIGEST_AFTER', 'Verifier must not mutate the final Manifest root.');
  return { path: manifestPath, sha256: sha256(await readFile(manifestPath)) };
}

export async function verifyStagingRoot(argv, dependencies = {}) { return main(argv, dependencies); }

async function verifyRoot({ root, manifest, trust, sourceRoot }) {
  const expectedId = `dev-canvas-06.e2e.${manifest.source_build.source_commit.slice(0, 12)}.${manifest.intake_report_ref.sha256.slice(0, 12)}`;
  if (manifest.manifest_id !== expectedId || manifest.generator_identity.runner_version !== '0.2.0') fail('E2E_MANIFEST_JOIN_MISMATCH', 'ID_PATH', 'Manifest identity is invalid.');
  await rawTrustCopies({ root, manifest, trust });
  await verifySourceBuild({ root, manifest, sourceRoot });
  await verifyDrivers({ root, manifest, sourceRoot });
  const profile = await verifyProfile({ root, manifest, sourceRoot, binding: trust.handoff.value.active_binding });
  const expected = await deriveExpected({ root, manifest, binding: trust.handoff.value.active_binding });
  assertDriverCatalog(manifest.driver_catalog);
  assertCaseDriverClosure(manifest.cases);
  if (!isDeepStrictEqual(manifest.cases, expected.cases) || !isDeepStrictEqual(manifest.fixture_refs, collectFixtureRefs(expected.cases, [expected.familyCatalogRef]))) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'CASE_ORDER', 'Manifest case derivation is not reproducible.');
  }
  if (manifest.coverage_summary.family_case_count !== 178 || manifest.coverage_summary.pass_expectation_count !== 130 || manifest.coverage_summary.blocked_expectation_count !== 48 || manifest.coverage_summary.common_case_count !== 16) {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXPECTATION', 'Coverage summary is invalid.');
  }
  await exactTree({ root, manifest, expected, profile });
}

async function rawTrustCopies({ root, manifest, trust }) {
  for (const [external, final] of [[trust.raw.intake, manifest.intake_report_ref], [trust.raw.handoff, manifest.handoff_ref]]) {
    const source = await verifyFileRef({ root: trust.root, reference: external, code: 'E2E_MANIFEST_INTAKE_INVALID' });
    const target = await verifyFileRef({ root, reference: final, code: 'E2E_MANIFEST_INTAKE_INVALID' });
    if (!source.bytes.equals(target.bytes)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'RAW_COPIES', 'Trust input raw bytes differ from final copies.');
  }
  if (!isDeepStrictEqual(manifest.upstream_source_build, trust.handoff.value.source_build)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXTERNAL_TRUST', 'Handoff source build differs.');
  const bundle = manifest.input_materialization.bundle_ref;
  const source = await verifyFileRef({ root: trust.root, reference: trust.raw.archive, code: 'E2E_MANIFEST_INTAKE_INVALID' });
  const target = await verifyFileRef({ root, reference: bundle, code: 'E2E_MANIFEST_INTAKE_INVALID' });
  if (!source.bytes.equals(target.bytes) || !isDeepStrictEqual(manifest.upstream_input_refs[4]?.ref, bundle)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'RAW_COPIES', 'Evidence Bundle copy differs.');
}

async function verifySourceBuild({ root, manifest, sourceRoot }) {
  await directory(sourceRoot, 'SOURCE_BUILD');
  const runtime = resolve(sourceRoot, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar');
  const web = resolve(sourceRoot, 'apps/web/dist');
  const lock = resolve(sourceRoot, 'package-lock.json');
  for (const path of [runtime, lock]) await regular(path, 'SOURCE_BUILD');
  await directory(web, 'SOURCE_BUILD');
  const [sourceRuntime, finalRuntime] = await Promise.all([readFile(runtime), verifyFileRef({ root, reference: manifest.source_build.local_runtime_jar, code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' })]);
  if (!sourceRuntime.equals(finalRuntime.bytes)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'SOURCE_BUILD', 'Runtime JAR differs from source-root.');
  const [sourceWeb, finalWeb] = await Promise.all([treeRef(sourceRoot, 'apps/web/dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), treeRef(root, 'inputs/build/web-dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID')]);
  if (sourceWeb.byte_length !== finalWeb.byte_length || sourceWeb.sha256 !== finalWeb.sha256 || !isDeepStrictEqual(finalWeb, manifest.source_build.web_dist)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'SOURCE_BUILD', 'Web dist differs from source-root.');
  const lockBytes = await readFile(lock);
  if (sha256(lockBytes) !== manifest.source_build.lockfile_sha256 || manifest.source_build.source_commit.length !== 40 || manifest.source_build.dirty_before_build !== false) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Source build identity is invalid.');
}

async function verifyDrivers({ root, manifest, sourceRoot }) {
  const expected = [];
  for (const [driverId, file] of DRIVER_FILES) {
    const source = resolve(sourceRoot, `tests/e2e/release/dev-canvas-06/drivers/${file}`);
    await regular(source, 'FOUR_DRIVER_REFS');
    const target = await fileRef(resolve(root, `inputs/drivers/${file}`), root, 'E2E_DRIVER_SOURCE', 'E2E_MANIFEST_DRIVER_INVALID');
    if (!Buffer.from(await readFile(source)).equals(Buffer.from(await readFile(resolve(root, target.path))))) fail('E2E_MANIFEST_JOIN_MISMATCH', 'FOUR_DRIVER_REFS', 'Driver source differs from source-root.');
    expected.push({ driver_id: driverId, source_ref: target });
  }
  if (!isDeepStrictEqual(manifest.driver_catalog, expected)) fail('E2E_MANIFEST_DRIVER_INVALID', 'FOUR_DRIVER_REFS', 'Driver catalog is not exact.');
}

async function verifyProfile({ root, manifest, sourceRoot, binding }) {
  const final = await loadProfileAssetClosure({ assetRoot: resolve(root, 'inputs/upstream/profile-assets'), activeBinding: binding });
  if (!isDeepStrictEqual(final.profile_asset_refs, manifest.profile_asset_refs) || !isDeepStrictEqual(final.profile_asset_tree_ref, manifest.profile_asset_tree_ref)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'FINAL_PROFILE_5', 'Final Profile closure differs from Manifest.');
  for (const [sourcePath, logical] of PROFILE_SOURCE_ASSETS) {
    const [left, right] = await Promise.all([readFile(resolve(sourceRoot, sourcePath)), readFile(resolve(root, 'inputs/upstream/profile-assets', logical))]);
    if (!left.equals(right)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'SOURCE_FINAL_PROFILE_RAW_AND_TREE_JOIN', 'Source and final Profile bytes differ.');
  }
  return final;
}

async function deriveExpected({ root, manifest, binding }) {
  const familyRoot = resolve(root, 'inputs/upstream/family');
  const coverage = await readJson(resolve(familyRoot, 'opm-opl-coverage-catalog.json'), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID');
  const goldenManifest = await readJson(resolve(familyRoot, 'opm-opl-golden-manifest.json'), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID');
  const replay = await readJson(resolve(familyRoot, 'golden-replay.json'), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID');
  const catalog = await readJson(resolve(familyRoot, 'opm-e2e-family-fixture-identity-catalog.json'), 'E2E_MANIFEST_FAMILY_IDENTITY_INVALID');
  if (!validateFamily(catalog) || catalog.catalog_version !== '0.1.0') fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FAMILY_IDENTITY', 'Family catalog is invalid.');
  const entries = new Map();
  const bytes = new Map();
  for (const item of goldenManifest.cases) for (const fixture of [item.base_revision_fixture, item.input_revision_fixture]) {
    const path = archiveEntryPath(`packages/profiles/${binding.profile.id}/${binding.profile.version}/${fixture}`);
    const ref = manifest.fixture_refs.find(value => value.path === path);
    if (!ref) fail('E2E_MANIFEST_FAMILY_IDENTITY_INVALID', 'FIXTURE_REFS', 'Family fixture ref is missing.');
    entries.set(fixture, ref);
    if (fixture === item.base_revision_fixture) bytes.set(fixture, await readFile(resolve(root, path)));
  }
  verifyFamilyFixtureIdentityCatalog({ catalog, goldenManifest, goldenManifestBytes: await readFile(resolve(familyRoot, 'opm-opl-golden-manifest.json')), fixtureBytesByEntry: bytes });
  const familyCases = deriveFamilyCases({ coverage, goldenManifest, replay, materializedEntries: entries });
  const familyCatalogRef = await fileRef(resolve(familyRoot, 'opm-e2e-family-fixture-identity-catalog.json'), root, 'FAMILY_FIXTURE_IDENTITY_CATALOG');
  const commonRoot = resolve(root, 'inputs/common');
  const commonCatalogRef = await fileRef(resolve(commonRoot, 'dev-canvas-06-common-fixture-catalog.json'), root, 'COMMON_FIXTURE_CATALOG');
  if (!isDeepStrictEqual(manifest.common_fixture_catalog_ref, commonCatalogRef)) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common Catalog ref differs.');
  const common = await readJson(resolve(commonRoot, 'dev-canvas-06-common-fixture-catalog.json'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommon(common) || common.catalog_version !== '0.2.0' || !isDeepStrictEqual(common.source_binding, binding)) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common Catalog is invalid.');
  const commonRefs = new Map();
  for (const item of common.e2e_cases) for (const ref of [item.base_fixture_ref, item.input_ref]) commonRefs.set(ref.path, await fileRef(resolve(commonRoot, ref.path), root, ref.kind));
  return { cases: [...familyCases, ...deriveCommonCases({ catalog: common, materializedRefs: commonRefs })], familyCatalogRef, commonRoot };
}

async function exactTree({ root, manifest, expected, profile }) {
  const files = new Set(['dev-canvas-06-e2e-manifest.json']);
  for (const ref of [manifest.intake_report_ref, manifest.handoff_ref, manifest.input_materialization.bundle_ref, manifest.source_build.local_runtime_jar, ...manifest.fixture_refs, ...manifest.profile_asset_refs, ...manifest.driver_catalog.map(item => item.source_ref)]) files.add(ref.path);
  files.add('inputs/build/package-lock.json');
  for (const entry of await listTree(resolve(root, 'inputs/build/web-dist'))) files.add(`inputs/build/web-dist/${entry.path}`);
  for (const entry of await listTree(expected.commonRoot)) files.add(`inputs/common/${entry.path}`);
  for (const ref of manifest.upstream_input_refs.slice(0, 3).map(item => item.ref)) files.add(ref.path);
  const actual = await listTree(root);
  if (actual.length !== files.size || actual.some(entry => !files.has(entry.path))) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXACT_TREE', 'Final Manifest root has an extra or missing file.');
  void profile;
}

async function loadTrust(options) { if (options['input-mode'] === 'CONTROLLED_TEST') { const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] }); return { root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.bundle.references.intake_report_ref, handoff: chain.bundle.references.handoff_ref, archive: chain.bundle.references.evidence_bundle_ref } }; } const root = resolve(options['handoff-root']); const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT'); const chain = await loadReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path }); const items = chain.handoff.value.build_artifacts?.filter(item => item.kind === 'EVIDENCE_BUNDLE') ?? []; if (items.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', 'EXTERNAL_TRUST', 'Handoff Evidence Bundle is invalid.'); return { root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive: items[0] } }; }
async function assertQuarantine(handoffRoot) { const root = resolve(handoffRoot); const match = /^clean-([a-f0-9]{12})$/.exec(basename(root)); if (!match) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'handoff-root must be clean-<source12>.'); for (const path of [resolve(dirname(root), 'quarantine', `clean-${match[1]}.json`), resolve(dirname(root), 'quarantine', `.clean-${match[1]}.json.tmp`)]) { try { await lstat(path); fail('E2E_MANIFEST_INPUT_QUARANTINED', 'EXACT_QUARANTINE_SIDECAR_GUARD', 'Version input is quarantined.'); } catch (error) { if (error?.code !== 'ENOENT' && error?.code) throw error; } } }
async function directory(path, stage) { try { const info = await lstat(path); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(); } catch { fail('E2E_MANIFEST_ARGUMENT_INVALID', stage, 'Expected a non-symlink directory.'); } }
async function regular(path, stage) { try { const info = await lstat(path); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error(); } catch { fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', stage, 'Expected a single-link regular file.'); } }
async function digest(root) { return sha256(Buffer.from(JSON.stringify(await listTree(root)), 'utf8')); }

if (import.meta.url === new URL(process.argv[1], 'file:').href) main().then(result => process.stdout.write(`${result.path}\t${result.sha256}\n`)).catch(error => { process.stderr.write(`${error.code ?? 'E2E_MANIFEST_IO_FAILED'}\t${error.stage ?? 'INTERNAL'}\n`); process.exitCode = error.exitCode ?? 4; });
