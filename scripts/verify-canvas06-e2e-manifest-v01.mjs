import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { materializeArchiveEntries } from './canvas06-e2e-manifest-v01-archive.mjs';
import { collectFixtureRefs, deriveCommonCases, deriveFamilyCases, resolveSymbolLogicalPath, verifyFamilyFixtureIdentityCatalog } from './canvas06-e2e-manifest-v01-input.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import {
  archiveEntryPath, archiveRef, assertDirectory, fail, fileRef, jcs, listTree, readJson, resolveInside, sha256,
  sameRawRef, treeRef, verifyFileRef
} from './canvas06-e2e-manifest-v01-support.mjs';

const execFile = promisify(execFileCallback);
const manifestSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest.schema.json', import.meta.url), 'utf8'));
const commonSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const familyIdentitySchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateManifest = ajv.compile(manifestSchema);
const validateCommonCatalog = ajv.compile(commonSchema);
const validateFamilyIdentityCatalog = ajv.compile(familyIdentitySchema);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commonVerifier = resolve(workspaceRoot, 'scripts/verify-canvas06-common-visual-fixtures.mjs');
const commonCatalogName = 'dev-canvas-06-common-fixture-catalog.json';

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseOptions(argv);
  return verifyOptions(options, dependencies);
}

export async function verifyStagingRoot(argv, dependencies = {}) {
  const options = parseOptions(argv);
  return verifyOptions(options, dependencies, { allowStaging: true });
}

async function verifyOptions(options, dependencies, { allowStaging = false } = {}) {
  const root = resolve(options['manifest-root']);
  await assertDirectory(root, 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  if (!allowStaging && basename(root).startsWith('.')) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Verifier rejects a staging root.');
  if (options.manifest !== 'dev-canvas-06-e2e-manifest.json') fail('E2E_MANIFEST_ARGUMENT_INVALID', 'manifest must use the frozen filename.');
  const manifestPath = resolveInside(root, options.manifest, 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const manifest = await readJson(manifestPath, 'E2E_MANIFEST_SCHEMA_INVALID');
  if (!validateManifest(manifest)) fail('E2E_MANIFEST_SCHEMA_INVALID', `Manifest schema validation failed: ${JSON.stringify(validateManifest.errors)}`);
  const expectedRoot = allowStaging
    ? `.${manifest.manifest_id}.tmp-`
    : manifest.manifest_id;
  if (allowStaging ? !basename(root).startsWith(expectedRoot) : basename(root) !== expectedRoot) {
    fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Manifest root does not match the frozen transaction identity.');
  }

  const trust = await loadTrust(options);
  const runtime = await resolveJavaRuntime(dependencies.runtime);
  await verifyExternalRawCopies({ root, manifest, trust });
  const materialized = await verifyArchiveMaterialization({ root, manifest, trust, runtime });
  const expected = await deriveExpected({ root, manifest, trust, materialized });
  await verifyBuildInput({ root, manifest, trust });
  await verifyManifestFields({ root, manifest, trust, materialized, expected });
  await verifyExactTree({ root, manifest, expected });
  return options.manifest;
}

async function loadTrust(options) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    return {
      root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff,
      raw: { intake: chain.bundle.references.intake_report_ref, handoff: chain.bundle.references.handoff_ref, archive: chain.bundle.references.evidence_bundle_ref }
    };
  }
  const root = resolve(options['handoff-root']);
  await assertDirectory(root, 'E2E_MANIFEST_INTAKE_INVALID');
  const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  return { root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive: releaseArtifact(chain.handoff.value, 'EVIDENCE_BUNDLE') } };
}

async function verifyExternalRawCopies({ root, manifest, trust }) {
  await sameRawRef({ externalRoot: trust.root, externalRef: trust.raw.intake, finalRoot: root, finalRef: manifest.intake_report_ref });
  await sameRawRef({ externalRoot: trust.root, externalRef: trust.raw.handoff, finalRoot: root, finalRef: manifest.handoff_ref });
  const bundle = manifest.upstream_input_refs[4]?.ref;
  if (!isDeepStrictEqual(bundle, manifest.input_materialization.bundle_ref)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Bundle refs must be deep-equal.');
  await sameRawRef({ externalRoot: trust.root, externalRef: trust.raw.archive, finalRoot: root, finalRef: bundle });
  if (!isDeepStrictEqual(manifest.upstream_source_build, trust.handoff.value.source_build)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'upstream_source_build must exactly match Handoff.');
}

async function verifyArchiveMaterialization({ root, manifest, trust, runtime }) {
  const bundle = manifest.input_materialization.bundle_ref;
  const archivePath = (await verifyFileRef({ root, reference: bundle })).path;
  const active = trust.handoff.value.active_binding;
  const prefix = `packages/profiles/${active.profile.id}/${active.profile.version}`;
  const profileEntry = `${prefix}/profile.json`;
  const profile = await readJson(resolveInside(root, 'inputs/upstream/profile/profile.json'), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const symbolEntry = `${prefix}/${resolveSymbolLogicalPath({ profile, activeBinding: active })}`;
  const coverageEntry = `${prefix}/golden/opm-opl-coverage-catalog.json`;
  const manifestEntry = `${prefix}/golden/opm-opl-golden-manifest.json`;
  const familyIdentityCatalogEntry = `${prefix}/golden/opm-e2e-family-fixture-identity-catalog.json`;
  const replayEntry = `${prefix}/handoff/reports/golden-replay.json`;
  const goldenManifest = await readJson(resolveInside(root, archiveReference(manifest, manifestEntry).path), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const fixtureEntries = [...new Set(goldenManifest.cases.flatMap(item => [item.base_revision_fixture, item.input_revision_fixture]).map(item => `${prefix}/${item}`))].sort((left, right) => left.localeCompare(right, 'en'));
  const expectedAllowlist = [profileEntry, coverageEntry, manifestEntry, familyIdentityCatalogEntry, replayEntry, symbolEntry, ...fixtureEntries].sort((left, right) => left.localeCompare(right, 'en'));
  if (!isDeepStrictEqual(manifest.input_materialization.entry_allowlist, expectedAllowlist) || manifest.input_materialization.materialized_count !== expectedAllowlist.length) {
    fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Archive allowlist is not the exact closed input set.');
  }

  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-e2e-verify-'));
  try {
    const bytes = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath, entries: expectedAllowlist, destination: temporary, allowExisting: true });
    const refs = new Map();
    for (const entry of expectedAllowlist) {
      const reference = await archiveReferenceFor({ root, manifest, bundle, archiveEntry: entry, profileEntry, familyIdentityCatalogEntry });
      const actual = bytes.get(entry);
      if (!actual || actual.length !== reference.byte_length || sha256(actual) !== reference.sha256 || reference.bundle_sha256 !== bundle.sha256) {
        fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Archive materialization differs from final input bytes.');
      }
      const final = await verifyFileRef({ root, reference });
      if (!final.bytes.equals(actual)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Final archive entry bytes differ from the Evidence Bundle.');
      refs.set(entry, reference);
    }
    const aggregate = Array.from(refs.values());
    const digest = sha256(Buffer.from(jcs(aggregate.sort((left, right) => left.archive_entry_path.localeCompare(right.archive_entry_path, 'en')).map(item => ({ archive_entry_path: item.archive_entry_path, path: item.path, byte_length: item.byte_length, sha256: item.sha256 }))), 'utf8'));
    if (digest !== manifest.input_materialization.aggregate_sha256 || manifest.input_materialization.temporary_directory_cleaned !== true) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Archive aggregate is invalid.');
    const familyIdentityCatalog = parseJson(bytes.get(familyIdentityCatalogEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
    if (!validateFamilyIdentityCatalog(familyIdentityCatalog) || familyIdentityCatalog.catalog_version !== '0.1.0') {
      fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Fixture Identity Catalog schema or version is invalid.');
    }
    return { prefix, profileEntry, coverageEntry, manifestEntry, familyIdentityCatalogEntry, replayEntry, symbolEntry, fixtureEntries, refs, profile, goldenManifest, familyIdentityCatalog, bytes };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function deriveExpected({ root, manifest, trust, materialized }) {
  const coverage = await readJson(resolveInside(root, materialized.refs.get(materialized.coverageEntry).path), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const replay = await readJson(resolveInside(root, materialized.refs.get(materialized.replayEntry).path), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const familyRefs = new Map();
  for (const entry of materialized.fixtureEntries) familyRefs.set(entry.slice(`${materialized.prefix}/`.length), materialized.refs.get(entry));
  const familyCases = deriveFamilyCases({ coverage, goldenManifest: materialized.goldenManifest, replay, materializedEntries: familyRefs });
  const familyFixtureBytes = new Map(materialized.fixtureEntries
    .filter(entry => materialized.goldenManifest.cases.some(item => `${materialized.prefix}/${item.base_revision_fixture}` === entry))
    .map(entry => [entry.slice(`${materialized.prefix}/`.length), materialized.bytes.get(entry)]));
  verifyFamilyFixtureIdentityCatalog({
    catalog: materialized.familyIdentityCatalog,
    goldenManifest: materialized.goldenManifest,
    goldenManifestBytes: materialized.bytes.get(materialized.manifestEntry),
    fixtureBytesByEntry: familyFixtureBytes
  });
  const familyIdentityCatalogRef = await fileRef(
    resolveInside(root, 'inputs/upstream/catalogs/family-fixture-identity-catalog.json', 'E2E_MANIFEST_INPUT_REF_MISMATCH'),
    root,
    'FAMILY_FIXTURE_IDENTITY_CATALOG',
    'E2E_MANIFEST_INPUT_REF_MISMATCH'
  );

  const commonRoot = resolveInside(root, 'inputs/common', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  const catalogRef = await fileRef(
    resolveInside(root, `inputs/common/${commonCatalogName}`, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'),
    root,
    'COMMON_FIXTURE_CATALOG',
    'E2E_MANIFEST_COMMON_FIXTURE_INVALID'
  );
  if (!isDeepStrictEqual(manifest.common_fixture_catalog_ref, catalogRef)) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture Catalog ref must point to the frozen final path.');
  }
  await verifyCommonFixtureRoot({
    fixtureRoot: commonRoot,
    handoffPath: resolveInside(root, manifest.handoff_ref.path, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID')
  });
  const catalog = await readJson(resolveInside(root, catalogRef.path), 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommonCatalog(catalog) || catalog.catalog_version !== '0.2.0' || !isDeepStrictEqual(catalog.source_binding, trust.handoff.value.active_binding)) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture Catalog is invalid or has a different binding.');
  }
  const commonRefs = new Map();
  const expectedFiles = new Set(['dev-canvas-06-e2e-manifest.json']);
  for (const entry of await listTree(commonRoot, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID')) {
    expectedFiles.add(`inputs/common/${entry.path}`);
  }
  for (const item of catalog.e2e_cases) {
    for (const reference of [item.factory_source_ref, item.base_fixture_ref, item.input_ref]) {
      const path = `inputs/common/${reference.path}`;
      const final = await fileRef(resolveInside(root, path), root, reference.kind, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
      if (final.byte_length !== reference.byte_length || final.sha256 !== reference.sha256) fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common input differs from Catalog raw ref.');
      if (reference !== item.factory_source_ref) commonRefs.set(reference.path, final);
    }
  }
  const commonCases = deriveCommonCases({ catalog, materializedRefs: commonRefs });
  return { familyCases, commonCases, catalog, familyIdentityCatalogRef, expectedFiles };
}

async function verifyBuildInput({ root, manifest, trust }) {
  const lock = await verifyFileRef({ root, reference: { kind: 'NPM_LOCKFILE', path: 'inputs/build/package-lock.json', byte_length: manifest.source_build.lockfile_sha256 ? (await readFile(resolveInside(root, 'inputs/build/package-lock.json'))).length : -1, sha256: manifest.source_build.lockfile_sha256 } });
  void lock;
  const jar = await verifyFileRef({ root, reference: manifest.source_build.local_runtime_jar });
  const expectedJar = releaseArtifact(trust.handoff.value, 'LOCAL_RUNTIME_JAR');
  if (jar.bytes.length !== expectedJar.byte_length || sha256(jar.bytes) !== expectedJar.sha256) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Target Runtime JAR differs from exact Intake artifact.');
  const actualTree = await treeRef(root, 'inputs/build/web-dist', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  if (!isDeepStrictEqual(actualTree, manifest.source_build.web_dist)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Web dist tree ref is invalid.');
  if (manifest.source_build.dirty_before_build !== false || manifest.source_build.build_command !== 'npm ci --ignore-scripts && npm run build' || manifest.source_build.node_version !== process.version) {
    fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Target source build identity is invalid.');
  }
}

async function verifyManifestFields({ root, manifest, trust, materialized, expected }) {
  const expectedId = `dev-canvas-06.e2e.${manifest.source_build.source_commit.slice(0, 12)}.${manifest.intake_report_ref.sha256.slice(0, 12)}`;
  if (manifest.manifest_id !== expectedId || manifest.generated_at !== new Date(Number(manifest.generated_at ? Date.parse(manifest.generated_at) : NaN)).toISOString()) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Manifest identity or timestamp is invalid.');
  const actualCases = [...expected.familyCases, ...expected.commonCases];
  if (!isDeepStrictEqual(manifest.cases, actualCases) || !isDeepStrictEqual(manifest.fixture_refs, collectFixtureRefs(actualCases, [expected.familyIdentityCatalogRef]))) fail('E2E_MANIFEST_CASE_SET_INVALID', 'Manifest cases or fixture union are not reproducible.');
  const expectedDrivers = [
    ['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'], ['DRIVER-STRUCTURAL', 'structural-driver.mjs']
  ];
  const drivers = [];
  for (const [driver_id, file] of expectedDrivers) drivers.push({ driver_id, source_ref: await fileRef(resolveInside(root, `inputs/drivers/${file}`), root, 'DRIVER_SOURCE', 'E2E_MANIFEST_DRIVER_INVALID') });
  if (!isDeepStrictEqual(manifest.driver_catalog, drivers)) fail('E2E_MANIFEST_DRIVER_INVALID', 'Driver catalog is invalid.');
  const upstream = [materialized.coverageEntry, materialized.manifestEntry, materialized.replayEntry, materialized.symbolEntry].map((entry, index) => ({ input_kind: ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT', 'SYMBOL_CATALOG'][index], ref: materialized.refs.get(entry) }));
  upstream.push({ input_kind: 'HANDOFF_EVIDENCE_BUNDLE', ref: manifest.input_materialization.bundle_ref });
  if (!isDeepStrictEqual(manifest.upstream_input_refs, upstream)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Upstream input refs are invalid.');
  if (manifest.coverage_summary.family_case_count !== 178 || manifest.coverage_summary.pass_expectation_count !== 130 || manifest.coverage_summary.blocked_expectation_count !== 48 || manifest.coverage_summary.common_case_count !== 16 || manifest.summary.attempt_count !== 388) {
    fail('E2E_MANIFEST_CASE_SET_INVALID', 'Frozen case counts are invalid.');
  }
  if (manifest.generator_identity.runner_version !== '0.1.0' || manifest.generator_identity.source_commit !== manifest.source_build.source_commit || manifest.generator_identity.node_version !== process.version || !manifest.generator_identity.command) {
    fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Generator identity is invalid.');
  }
  void trust;
}

async function verifyExactTree({ root, manifest, expected }) {
  const expectedFiles = expected.expectedFiles;
  for (const reference of [manifest.intake_report_ref, manifest.handoff_ref, manifest.input_materialization.bundle_ref, manifest.source_build.local_runtime_jar]) expectedFiles.add(reference.path);
  for (const entry of manifest.input_materialization.entry_allowlist) {
    const path = entry.endsWith('/profile.json') ? 'inputs/upstream/profile/profile.json'
      : entry.endsWith('/golden/opm-opl-coverage-catalog.json') ? 'inputs/upstream/catalogs/coverage-catalog.json'
          : entry.endsWith('/golden/opm-opl-golden-manifest.json') ? 'inputs/upstream/catalogs/golden-manifest.json'
          : entry.endsWith('/golden/opm-e2e-family-fixture-identity-catalog.json') ? 'inputs/upstream/catalogs/family-fixture-identity-catalog.json'
          : entry.endsWith('/handoff/reports/golden-replay.json') ? 'inputs/upstream/reports/golden-replay-report.json'
            : entry.includes('/symbols/') ? 'inputs/upstream/profile/symbol-catalog.json'
              : archiveEntryPath(entry);
    expectedFiles.add(path);
  }
  expectedFiles.add('inputs/build/package-lock.json');
  for (const entry of await listTree(resolveInside(root, 'inputs/build/web-dist'))) expectedFiles.add(`inputs/build/web-dist/${entry.path}`);
  for (const reference of manifest.fixture_refs) expectedFiles.add(reference.path);
  for (const driver of manifest.driver_catalog) expectedFiles.add(driver.source_ref.path);
  for (const actual of await listTree(root)) {
    if (!expectedFiles.has(actual.path)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Final root contains an extra or unsafe file.');
  }
  if ((await listTree(root)).length !== expectedFiles.size) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Final root is missing a required file.');
}

function archiveReference(manifest, archiveEntry) {
  const references = [
    ...manifest.upstream_input_refs.map(item => item.ref),
    ...manifest.fixture_refs
  ].filter(item => item?.archive_entry_path === archiveEntry);
  if (references.length !== 1) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Archive entry reference must occur exactly once.');
  const reference = references[0];
  if (archiveEntry.includes('/golden/fixtures/') && reference.path !== archiveEntryPath(archiveEntry)) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Fixture archive path encoding is invalid.');
  return reference;
}

async function archiveReferenceFor({ root, manifest, bundle, archiveEntry, profileEntry, familyIdentityCatalogEntry }) {
  if (archiveEntry !== profileEntry && archiveEntry !== familyIdentityCatalogEntry) return archiveReference(manifest, archiveEntry);
  const path = archiveEntry === profileEntry
    ? 'inputs/upstream/profile/profile.json'
    : 'inputs/upstream/catalogs/family-fixture-identity-catalog.json';
  const bytes = await readFile(resolveInside(root, path));
  const file = await verifyFileRef({ root, reference: {
    kind: archiveEntry === profileEntry ? 'PROFILE' : 'FAMILY_FIXTURE_IDENTITY_CATALOG',
    path,
    byte_length: bytes.length,
    sha256: sha256(bytes)
  } });
  return archiveRef({ destination: path, bytes: file.bytes, bundleSha256: bundle.sha256, archiveEntry });
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(code, 'Archive entry is not valid JSON.'); }
}

function releaseArtifact(handoff, kind) {
  const items = handoff.build_artifacts?.filter(item => item.kind === kind) ?? [];
  if (items.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', `Handoff must contain one ${kind} artifact.`);
  return items[0];
}

async function resolveJavaRuntime(override) {
  if (override) return override;
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'JAVA_HOME is required for Java 21 archive handling.');
  const javaPath = resolve(javaHome, 'bin/java');
  const jarPath = resolve(javaHome, 'bin/jar');
  let output;
  try { const result = await execFile(javaPath, ['-version'], { encoding: 'utf8' }); output = `${result.stdout}\n${result.stderr}`; }
  catch (error) { output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`; }
  if (!/(?:java|openjdk) version \"?21(?:\.|\")/.test(output)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Java 21 is required.');
  return { jarPath };
}

async function verifyCommonFixtureRoot({ fixtureRoot, handoffPath }) {
  try {
    await execFile(process.execPath, [
      commonVerifier,
      '--handoff', handoffPath,
      '--fixture-root', fixtureRoot,
      '--catalog', commonCatalogName
    ], { cwd: workspaceRoot, maxBuffer: 1024 * 1024 });
  } catch {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture root did not pass the active 02B verifier.');
  }
}

function parseOptions(argv) {
  const values = new Map();
  const common = ['input-mode', 'manifest-root', 'manifest'];
  const production = ['handoff-root', 'intake-report', 'require-production'];
  const controlled = ['controlled-bundle-root'];
  const allowed = new Set([...common, ...production, ...controlled]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || flag.includes('=') || !allowed.has(flag.slice(2)) || values.has(flag.slice(2))) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Verifier arguments are invalid.');
    const name = flag.slice(2);
    if (name === 'require-production') values.set(name, true);
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) fail('E2E_MANIFEST_ARGUMENT_INVALID', 'Verifier argument value is invalid.');
      values.set(name, value);
    }
  }
  const mode = values.get('input-mode');
  if (!['PRODUCTION_HANDOFF', 'CONTROLLED_TEST'].includes(mode)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', 'input-mode is invalid.');
  for (const name of common) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `Missing --${name}.`);
  const active = mode === 'PRODUCTION_HANDOFF' ? production : controlled;
  const inactive = mode === 'PRODUCTION_HANDOFF' ? controlled : production;
  for (const name of active) if (!values.has(name)) fail('E2E_MANIFEST_ARGUMENT_INVALID', `Missing --${name}.`);
  for (const name of inactive) if (values.has(name)) fail('E2E_MANIFEST_INPUT_CLASS_INVALID', `--${name} is invalid for ${mode}.`);
  return Object.fromEntries(values);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(output => process.stdout.write(`${output}\n`)).catch(error => {
    process.stderr.write(`${error.code ?? 'E2E_MANIFEST_INTERNAL_ERROR'}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}
