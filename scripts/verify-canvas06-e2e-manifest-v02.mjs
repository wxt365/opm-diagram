import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { assertCaseDriverClosure, assertDriverCatalog, assertProfileAssetThreeWayJoin, E2eManifestV02Error, fail, parseVerifierOptions, readProfileAssetSourceSet } from './canvas06-e2e-manifest-v02-input.mjs';
import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';
import { loadControlledReadyTrustChain, loadProductionReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { assertDirectory, fileRef, jcs, listTree, readJson, resolveInside, sha256, treeRef, verifyFileRef } from './canvas06-e2e-manifest-v01-support.mjs';

const schema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json', import.meta.url), 'utf8'));
const commonSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const validateCommon = ajv.compile(commonSchema);

export async function main(argv = process.argv.slice(2)) {
  const options = parseVerifierOptions(argv);
  const root = resolve(options['manifest-root']);
  await assertDirectory(root, 'E2E_MANIFEST_TRANSACTION_INVALID');
  const before = await digest(root);
  const manifestPath = resolveInside(root, options.manifest, 'E2E_MANIFEST_ARGUMENT_INVALID');
  const raw = await verifyFileRef({ root, reference: await rawRef(root, options.manifest, 'E2E_MANIFEST'), code: 'E2E_MANIFEST_SCHEMA_INVALID' });
  const manifest = parse(raw.bytes);
  if (!validate(manifest)) fail('E2E_MANIFEST_SCHEMA_INVALID', 'SCHEMA_0.2', JSON.stringify(validate.errors));
  const trust = await loadTrust(options);
  await verifyTrustCopies(root, manifest, trust);
  await verifyBuild(root, manifest, trust, options['source-root']);
  await verifyDrivers(root, manifest, options['source-root']);
  await verifyCommon(root, manifest, trust.handoff.value.active_binding);
  await verifyProfile(root, manifest, options, trust.handoff.value.active_binding);
  await verifyCases(root, manifest);
  await verifyExactTree(root, manifest, options.manifest);
  const after = await digest(root);
  if (before !== after) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'TREE_DIGEST_AFTER', 'Verifier must not observe a changed manifest tree.');
  return { path: manifestPath, sha256: raw.bytes.length === manifestPath.length ? sha256(raw.bytes) : sha256(raw.bytes) };
}

async function loadTrust(options) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    return { root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.bundle.references.intake_report_ref, handoff: chain.bundle.references.handoff_ref, archive: chain.bundle.references.evidence_bundle_ref } };
  }
  const root = resolve(options['handoff-root']);
  const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadProductionReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  const evidence = exactArtifact(chain.handoff.value, 'EVIDENCE_BUNDLE');
  return { root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive: evidence } };
}

async function verifyTrustCopies(root, manifest, trust) {
  await sameExternal(root, manifest.intake_report_ref, trust.root, trust.raw.intake, 'E2E_MANIFEST_INTAKE_INVALID');
  await sameExternal(root, manifest.handoff_ref, trust.root, trust.raw.handoff, 'E2E_MANIFEST_INTAKE_INVALID');
  const bundle = manifest.input_materialization.bundle_ref;
  if (!isDeepStrictEqual(bundle, manifest.upstream_input_refs[4]?.ref)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXTERNAL_TRUST', 'Evidence Bundle ref must occur once in upstream inputs.');
  await sameExternal(root, bundle, trust.root, trust.raw.archive, 'E2E_MANIFEST_INTAKE_INVALID');
  if (!isDeepStrictEqual(manifest.upstream_source_build, trust.handoff.value.source_build)) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXTERNAL_TRUST', 'upstream_source_build must equal Handoff source_build.');
}

async function verifyBuild(root, manifest, trust, sourceRootOption) {
  const sourceRoot = resolve(sourceRootOption);
  await assertDirectory(sourceRoot, 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const commit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit) || dirty || commit !== manifest.source_build.source_commit || commit !== trust.handoff.value.source_build.source_commit) {
    fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_CLEAN_HEAD', 'source-root must be the exact clean source build.');
  }
  const lock = await rawRef(root, 'inputs/build/package-lock.json', 'NPM_LOCKFILE');
  if (lock.sha256 !== manifest.source_build.lockfile_sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Lockfile digest differs from source_build.');
  const sourceLock = await rawRef(sourceRoot, 'package-lock.json', 'NPM_LOCKFILE');
  if (sourceLock.sha256 !== lock.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Source lockfile differs from staged bytes.');
  const jar = await verifyFileRef({ root, reference: manifest.source_build.local_runtime_jar, code: 'E2E_MANIFEST_SOURCE_BUILD_INVALID' });
  const expectedJar = exactArtifact(trust.handoff.value, 'LOCAL_RUNTIME_JAR');
  if (jar.bytes.length !== expectedJar.byte_length || sha256(jar.bytes) !== expectedJar.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Runtime JAR differs from Handoff.');
  const sourceJar = await fileRef(resolveInside(sourceRoot, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), sourceRoot, 'LOCAL_RUNTIME_JAR', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  if (sourceJar.byte_length !== jar.bytes.length || sourceJar.sha256 !== sha256(jar.bytes)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Source Runtime JAR differs from staged bytes.');
  const web = await treeRef(root, 'inputs/build/web-dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  if (!isDeepStrictEqual(web, manifest.source_build.web_dist)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Web tree ref differs from staged bytes.');
  const expectedWeb = exactArtifact(trust.handoff.value, 'WEB_DIST_TREE');
  if (web.byte_length !== expectedWeb.byte_length || web.sha256 !== expectedWeb.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Web tree differs from Handoff.');
  const sourceWeb = await treeRef(sourceRoot, 'apps/web/dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  if (sourceWeb.byte_length !== web.byte_length || sourceWeb.sha256 !== web.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Source Web tree differs from staged bytes.');
  if (manifest.source_build.source_commit !== trust.handoff.value.source_build.source_commit || manifest.source_build.dirty_before_build !== false || manifest.source_build.node_version !== process.version || manifest.source_build.build_command !== 'npm ci --ignore-scripts && npm run build') fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'SOURCE_BUILD', 'Source build identity is invalid.');
}

async function verifyDrivers(root, manifest, sourceRootOption) {
  const sourceRoot = resolve(sourceRootOption);
  assertDriverCatalog(manifest.driver_catalog);
  for (const driver of manifest.driver_catalog) {
    const staged = await verifyFileRef({ root, reference: driver.source_ref, code: 'E2E_MANIFEST_DRIVER_INVALID' });
    const filename = driver.source_ref.path.slice('inputs/drivers/'.length);
    const source = await fileRef(resolveInside(sourceRoot, `tests/e2e/release/dev-canvas-06/drivers/${filename}`, 'E2E_MANIFEST_DRIVER_INVALID'), sourceRoot, 'E2E_DRIVER_SOURCE', 'E2E_MANIFEST_DRIVER_INVALID');
    if (source.byte_length !== staged.bytes.length || source.sha256 !== sha256(staged.bytes)) fail('E2E_MANIFEST_DRIVER_INVALID', 'FOUR_DRIVERS', 'Source driver differs from staged bytes.');
  }
}

async function verifyCommon(root, manifest, activeBinding) {
  const commonRoot = resolveInside(root, 'inputs/common', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  const entries = await listTree(commonRoot, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (entries.length !== 43) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common root must contain exactly 43 files.');
  const catalogRef = await rawRef(root, `inputs/common/dev-canvas-06-common-fixture-catalog.json`, 'COMMON_FIXTURE_CATALOG');
  if (!isDeepStrictEqual(catalogRef, manifest.common_fixture_catalog_ref)) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common catalog ref is not the exact staged raw ref.');
  const catalog = await readJson(resolveInside(root, catalogRef.path, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommon(catalog) || catalog.catalog_version !== '0.2.0' || !isDeepStrictEqual(catalog.source_binding, activeBinding)) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common catalog is not active and bound to the Handoff.');
  for (const item of catalog.e2e_cases) for (const reference of [item.base_fixture_ref, item.input_ref]) {
    const staged = await rawRef(root, `inputs/common/${reference.path}`, reference.kind);
    if (staged.byte_length !== reference.byte_length || staged.sha256 !== reference.sha256) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'COMMON_43', 'Common fixture raw ref differs from Catalog.');
  }
}

async function verifyProfile(root, manifest, options, activeBinding) {
  if (options['profile-asset-root'] !== resolveInside(root, 'inputs/upstream/profile-assets', 'E2E_MANIFEST_PROFILE_ASSET_INVALID')) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5', 'profile-asset-root must be the final profile asset tree.');
  const closure = await loadProfileAssetClosure({ assetRoot: options['profile-asset-root'], activeBinding });
  if (!isDeepStrictEqual(closure.profile_asset_refs, manifest.profile_asset_refs) || !isDeepStrictEqual(closure.profile_asset_tree_ref, manifest.profile_asset_tree_ref)) fail('E2E_MANIFEST_PROFILE_ASSET_INVALID', 'PROFILE_5', 'Profile five-asset closure differs from Manifest.');
  const source = await readProfileAssetSourceSet(options['source-root']);
  assertProfileAssetThreeWayJoin(source, closure, closure);
}

async function verifyCases(root, manifest) {
  assertCaseDriverClosure(manifest.cases);
  const drivers = new Set(manifest.driver_catalog.map(item => item.driver_id));
  for (const item of manifest.cases) {
    if (!drivers.has(item.driver_id)) fail('E2E_MANIFEST_DRIVER_INVALID', 'CASE_DRIVER', 'Case references a missing driver.');
    for (const ref of [item.fixture_ref, item.input_ref]) await verifyFileRef({ root, reference: ref, code: 'E2E_MANIFEST_JOIN_MISMATCH' });
  }
  const common = manifest.cases.filter(item => !item.capability_id);
  if (common.length !== 16 || common.filter(item => item.expectation === 'PASS').length !== 7 || common.filter(item => item.expectation === 'BLOCKED').length !== 9) fail('E2E_MANIFEST_JOIN_MISMATCH', 'EXPECTATION', 'Common expectation matrix must be 7/9.');
}

async function verifyExactTree(root, manifest, manifestName) {
  const expected = new Set([manifestName, 'inputs/build/package-lock.json', 'inputs/upstream/family/profile.json']);
  for (const ref of [manifest.intake_report_ref, manifest.handoff_ref, manifest.input_materialization.bundle_ref, manifest.source_build.local_runtime_jar, manifest.common_fixture_catalog_ref, ...manifest.profile_asset_refs, ...manifest.fixture_refs, ...manifest.driver_catalog.map(item => item.source_ref)]) expected.add(ref.path);
  for (const item of manifest.upstream_input_refs) expected.add(item.ref.path);
  for (const item of await listTree(resolveInside(root, 'inputs/build/web-dist', 'E2E_MANIFEST_TRANSACTION_INVALID'), 'E2E_MANIFEST_TRANSACTION_INVALID')) expected.add(`inputs/build/web-dist/${item.path}`);
  for (const item of await listTree(resolveInside(root, 'inputs/common', 'E2E_MANIFEST_TRANSACTION_INVALID'), 'E2E_MANIFEST_TRANSACTION_INVALID')) expected.add(`inputs/common/${item.path}`);
  const actual = await listTree(root, 'E2E_MANIFEST_TRANSACTION_INVALID');
  if (actual.length !== expected.size || actual.some(item => !expected.has(item.path))) fail('E2E_MANIFEST_TRANSACTION_INVALID', 'EXACT_TREE', 'Manifest root contains missing or extra files.');
}

async function rawRef(root, path, kind) { const target = resolveInside(root, path, 'E2E_MANIFEST_SCHEMA_INVALID'); return fileRef(target, root, kind, 'E2E_MANIFEST_SCHEMA_INVALID'); }
async function sameExternal(root, localRef, externalRoot, externalRef, code) { const local = await verifyFileRef({ root, reference: localRef, code }); const external = await verifyFileRef({ root: externalRoot, reference: externalRef, code }); if (!local.bytes.equals(external.bytes)) fail(code, 'EXTERNAL_TRUST', 'Staged trust input differs from external raw bytes.'); }
async function digest(root) { return sha256(Buffer.from(jcs(await listTree(root, 'E2E_MANIFEST_TRANSACTION_INVALID')), 'utf8')); }
function exactArtifact(handoff, kind) { const values = handoff.build_artifacts?.filter(item => item.kind === kind) ?? []; if (values.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', 'EXTERNAL_TRUST', `Handoff must contain one ${kind} artifact.`); return values[0]; }
function parse(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { fail('E2E_MANIFEST_SCHEMA_INVALID', 'MANIFEST_RAW', 'Manifest must be JSON.'); } }
function normalize(error) { return error instanceof E2eManifestV02Error ? error : new E2eManifestV02Error('E2E_MANIFEST_IO_FAILED', 'INTERNAL', error.message); }

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(result => process.stdout.write(`${result.path}\t${result.sha256}\n`)).catch(error => { const value = normalize(error); process.stderr.write(`${value.code}\t${value.stage}\n${value.message}\n`); process.exitCode = value.exitCode; });
}
