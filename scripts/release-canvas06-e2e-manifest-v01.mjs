import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { materializeArchiveEntries, listSafeArchiveEntries } from './canvas06-e2e-manifest-v01-archive.mjs';
import { sha256Jcs } from './canvas06-rfc8785.mjs';
import { composeE2eManifest, manifestBytes } from './canvas06-e2e-manifest-v01-compose.mjs';
import { collectFixtureRefs, deriveCommonCases, deriveFamilyCases, resolveSymbolLogicalPath, verifyFamilyFixtureIdentityCatalog } from './canvas06-e2e-manifest-v01-input.mjs';
import { assertCommonRootIndependent, commitFinalRoot, ensureFinalParent, parseBuildOptions, validateBuilderPaths } from './canvas06-e2e-manifest-v01-transaction.mjs';
import { loadControlledReadyTrustChain, loadReadyTrustChain, readJsonRef } from './canvas06-e2e-manifest-v01-trust.mjs';
import { verifyStagingRoot } from './verify-canvas06-e2e-manifest-v01.mjs';
import {
  archiveEntryPath, archiveRef, assertDirectory, copyRegularFile, copyTree, fail, fileRef, fsyncTree, jcs, listTree, readJson,
  resolveInside, sha256, verifyFileRef, writeBytes
} from './canvas06-e2e-manifest-v01-support.mjs';

const execFile = promisify(execFileCallback);
const COMMON_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json', import.meta.url), 'utf8'));
const FAMILY_IDENTITY_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json', import.meta.url), 'utf8'));
const commonAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(commonAjv);
const validateCommonCatalog = commonAjv.compile(COMMON_SCHEMA);
const validateFamilyIdentityCatalog = commonAjv.compile(FAMILY_IDENTITY_SCHEMA);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commonVerifier = resolve(workspaceRoot, 'scripts/verify-canvas06-common-visual-fixtures.mjs');
const commonCatalogName = 'dev-canvas-06-common-fixture-catalog.json';

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseBuildOptions(argv);
  const paths = await validateBuilderPaths(options);
  const source = await inspectSourceBuild(paths, dependencies);
  const trust = await loadTrust(options);
  assertCommonRootIndependent(paths.commonRoot, [trust.root]);
  const expectedManifestId = `dev-canvas-06.e2e.${source.source_commit.slice(0, 12)}.${trust.intake.ref.sha256.slice(0, 12)}`;
  const expectedOut = `dev-canvas-06/e2e/manifests/${expectedManifestId}/dev-canvas-06-e2e-manifest.json`;
  if (options.out !== expectedOut || paths.finalRoot !== resolve(paths.outputRoot, dirname(expectedOut))) {
    fail('E2E_MANIFEST_ARGUMENT_INVALID', 'out must be the fixed path derived from the source commit and Intake ref.');
  }
  const runtime = await resolveJavaRuntime(dependencies.runtime);
  const archive = await loadArchiveInput(trust, runtime.jarPath);
  await verifySourceBuild({ source, paths, trust });

  const archiveTemp = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-e2e-archive-'));
  try {
    const materialized = await materializeUpstream({ archive, archiveTemp, runtime, trust });
    await rm(archiveTemp, { recursive: true, force: true });
    const common = await loadCommonInput({
      commonRoot: paths.commonRoot,
      catalogPath: paths.catalog,
      handoffPath: resolveInside(trust.root, trust.raw.handoff.path, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'),
      activeBinding: trust.handoff.value.active_binding
    });
    await ensureFinalParent({ outputRoot: paths.outputRoot, finalRoot: paths.finalRoot });
    await rejectAbandonedStaging(paths.finalRoot, expectedManifestId);
    await commitFinalRoot({
      finalRoot: paths.finalRoot,
      outputRoot: paths.outputRoot,
      checkpoint: dependencies.checkpoint,
      write: async staging => {
        const staged = await stageInputs({ staging, source, paths, trust, archive, materialized, common });
        await checkpoint(dependencies, 'INPUTS_STAGED');
        const familyCases = deriveFamilyCases({
          coverage: materialized.coverage,
          goldenManifest: materialized.goldenManifest,
          replay: materialized.replay,
          materializedEntries: staged.familyEntries
        });
        verifyFamilyFixtureIdentityCatalog({
          catalog: materialized.familyIdentityCatalog,
          goldenManifest: materialized.goldenManifest,
          goldenManifestBytes: materialized.bytes.get(materialized.manifestEntry),
          fixtureBytesByEntry: materialized.familyFixtureBytes
        });
        const commonCases = deriveCommonCases({ catalog: common.catalog, materializedRefs: staged.commonEntries });
        const cases = [...familyCases, ...commonCases];
        await checkpoint(dependencies, 'CASES_DERIVED');
        const manifest = composeE2eManifest({
          source_date_epoch: options['source-date-epoch'],
          node_version: process.version,
          playwright_version: source.playwright_version,
          chromium_version: source.chromium_version,
          os: `${process.platform}-${process.arch}`,
          command: normalizedCommand(options),
          runner_source_sha256: source.runner_source_sha256,
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
            java_version: runtime.javaVersion,
            entry_allowlist: materialized.allowlist,
            materialized_count: materialized.allowlist.length,
            aggregate_sha256: sha256(Buffer.from(jcs(staged.archiveRefs
              .slice()
              .sort((left, right) => left.archive_entry_path.localeCompare(right.archive_entry_path, 'en'))
              .map(item => ({ archive_entry_path: item.archive_entry_path, path: item.path, byte_length: item.byte_length, sha256: item.sha256 }))), 'utf8')),
            temporary_directory_cleaned: true
          },
          common_fixture_catalog_ref: staged.commonCatalogRef,
          fixture_refs: collectFixtureRefs(cases, [staged.familyIdentityCatalogRef]),
          driver_catalog: staged.drivers,
          cases
        });
        await writeBytes({ bytes: Buffer.from(manifestBytes(manifest), 'utf8'), destinationRoot: staging, destination: 'dev-canvas-06-e2e-manifest.json', kind: 'E2E_MANIFEST' });
        await checkpoint(dependencies, 'MANIFEST_WRITTEN');
        await verifyStaging({ staging, manifest, expectedManifestId });
        await checkpoint(dependencies, 'STAGING_VALIDATED');
        await verifyStagingRoot(stagingVerificationArgs({ options, staging }), { runtime });
        await checkpoint(dependencies, 'SEMANTIC_VERIFIED');
        await fsyncTree(staging);
        await checkpoint(dependencies, 'STAGING_FSYNCED');
      }
    });
  } finally {
    await rm(archiveTemp, { recursive: true, force: true });
  }
  return options.out;
}

async function checkpoint(dependencies, name) {
  await dependencies.checkpoint?.(name);
}

async function loadTrust(options) {
  if (options['input-mode'] === 'CONTROLLED_TEST') {
    const chain = await loadControlledReadyTrustChain({ bundleRoot: options['controlled-bundle-root'] });
    return {
      mode: 'CONTROLLED_TEST', root: chain.bundle.root, intake: chain.intake, handoff: chain.handoff,
      raw: {
        intake: chain.bundle.references.intake_report_ref,
        handoff: chain.bundle.references.handoff_ref,
        archive: chain.bundle.references.evidence_bundle_ref
      }
    };
  }
  const root = resolve(options['handoff-root']);
  await assertDirectory(root, 'E2E_MANIFEST_INTAKE_INVALID');
  const intake = await readJsonRef(root, options['intake-report'], 'INTAKE_REPORT');
  const chain = await loadReadyTrustChain({ root, intakePath: options['intake-report'], handoffPath: intake.value.handoff_ref?.path });
  const artifact = releaseArtifact(chain.handoff.value, 'EVIDENCE_BUNDLE');
  return { mode: 'PRODUCTION_HANDOFF', root, intake: chain.intake, handoff: chain.handoff, raw: { intake: chain.intake.ref, handoff: chain.handoff.ref, archive: artifact } };
}

async function inspectSourceBuild(paths, dependencies) {
  const git = dependencies.git ?? defaultGit;
  const sourceCommit = await git(paths.sourceRoot, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'source-root must resolve to a full clean commit SHA.');
  if ((await git(paths.sourceRoot, ['status', '--porcelain'])).trim()) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'source-root must be clean.');
  const lockfile = resolveInside(paths.sourceRoot, 'package-lock.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const runnerSource = resolveInside(paths.sourceRoot, 'scripts/release-canvas06-e2e-manifest-v01.mjs', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const [lockfileRef, runnerBytes, packageJson] = await Promise.all([
    fileRef(lockfile, paths.sourceRoot, 'NPM_LOCKFILE', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'),
    readFile(runnerSource),
    readJson(resolveInside(paths.sourceRoot, 'node_modules/@playwright/test/package.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID')
  ]);
  const browsers = await readJson(resolveInside(paths.sourceRoot, 'node_modules/playwright-core/browsers.json', 'E2E_MANIFEST_SOURCE_BUILD_INVALID'), 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  const chromium = browsers.browsers?.find(item => item.name === 'chromium');
  if (!packageJson.version || !chromium?.revision) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Playwright and Chromium metadata are required in the clean source build.');
  return {
    source_commit: sourceCommit,
    lockfile, lockfileRef,
    runner_source_sha256: sha256(runnerBytes),
    playwright_version: packageJson.version,
    chromium_version: String(chromium.revision)
  };
}

async function loadArchiveInput(trust, jarPath) {
  const expected = releaseArtifact(trust.handoff.value, 'EVIDENCE_BUNDLE');
  const external = await verifyFileRef({ root: trust.root, reference: trust.raw.archive, code: 'E2E_MANIFEST_INPUT_REF_MISMATCH' });
  if (external.bytes.length !== expected.byte_length || sha256(external.bytes) !== expected.sha256) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Evidence Bundle differs from the exact Handoff artifact.');
  const entries = await listSafeArchiveEntries({ jarPath, archivePath: external.path });
  return { path: external.path, bytes: external.bytes, ref: trust.raw.archive, entries };
}

async function materializeUpstream({ archive, archiveTemp, runtime, trust }) {
  const active = trust.handoff.value.active_binding;
  const prefix = `packages/profiles/${active.profile.id}/${active.profile.version}`;
  const profileEntry = `${prefix}/profile.json`;
  const coverageEntry = `${prefix}/golden/opm-opl-coverage-catalog.json`;
  const manifestEntry = `${prefix}/golden/opm-opl-golden-manifest.json`;
  const familyIdentityCatalogEntry = `${prefix}/golden/opm-e2e-family-fixture-identity-catalog.json`;
  const replayEntry = `${prefix}/handoff/reports/golden-replay.json`;
  const initial = [profileEntry, coverageEntry, manifestEntry, familyIdentityCatalogEntry, replayEntry];
  requireArchiveEntries(archive.entries, initial);
  const initialBytes = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: archive.path, entries: initial, destination: archiveTemp, allowExisting: true });
  const profile = parseJson(initialBytes.get(profileEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const symbolLogicalPath = resolveSymbolLogicalPath({ profile, activeBinding: active });
  const symbolEntry = `${prefix}/${symbolLogicalPath}`;
  const goldenManifest = parseJson(initialBytes.get(manifestEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  const familyIdentityCatalog = parseJson(initialBytes.get(familyIdentityCatalogEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH');
  if (!validateFamilyIdentityCatalog(familyIdentityCatalog) || familyIdentityCatalog.catalog_version !== '0.1.0') {
    fail('E2E_MANIFEST_JOIN_MISMATCH', 'Family Fixture Identity Catalog schema or version is invalid.');
  }
  const fixtureEntries = [...new Set(goldenManifest.cases.flatMap(item => [item.base_revision_fixture, item.input_revision_fixture]).map(item => `${prefix}/${item}`))].sort((left, right) => left.localeCompare(right, 'en'));
  const remaining = [symbolEntry, ...fixtureEntries];
  requireArchiveEntries(archive.entries, remaining);
  const remainingBytes = await materializeArchiveEntries({ jarPath: runtime.jarPath, archivePath: archive.path, entries: remaining, destination: archiveTemp, allowExisting: true });
  const bytes = new Map([...initialBytes, ...remainingBytes]);
  const allowlist = [...initial, ...remaining].sort((left, right) => left.localeCompare(right, 'en'));
  return {
    prefix, profileEntry, coverageEntry, manifestEntry, familyIdentityCatalogEntry, replayEntry, symbolEntry, fixtureEntries, allowlist, bytes,
    profile, goldenManifest, familyIdentityCatalog,
    coverage: parseJson(bytes.get(coverageEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH'),
    replay: parseJson(bytes.get(replayEntry), 'E2E_MANIFEST_INPUT_REF_MISMATCH'),
    familyFixtureBytes: new Map(fixtureEntries
      .filter(entry => goldenManifest.cases.some(item => `${prefix}/${item.base_revision_fixture}` === entry))
      .map(entry => [entry.slice(`${prefix}/`.length), bytes.get(entry)]))
  };
}

async function loadCommonInput({ commonRoot, catalogPath, handoffPath, activeBinding }) {
  if (catalogPath !== resolveInside(commonRoot, commonCatalogName, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID')) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture Catalog must use the frozen path.');
  }
  await verifyCommonFixtureRoot({ fixtureRoot: commonRoot, handoffPath });
  const catalog = await readJson(catalogPath, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (!validateCommonCatalog(catalog) || catalog.catalog_version !== '0.2.0' || JSON.stringify(catalog.source_binding) !== JSON.stringify(activeBinding)) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture Catalog schema or source binding is invalid.');
  }
  return { catalog, treeDigest: await commonTreeDigest(commonRoot) };
}

async function stageInputs({ staging, source, paths, trust, archive, materialized, common }) {
  const bundleRef = await writeBytes({ bytes: archive.bytes, destinationRoot: staging, destination: 'inputs/raw/release/dev-canvas-05-evidence-bundle.jar', kind: 'EVIDENCE_BUNDLE' });
  const intakeBytes = (await verifyFileRef({ root: trust.root, reference: trust.raw.intake })).bytes;
  const handoffBytes = (await verifyFileRef({ root: trust.root, reference: trust.raw.handoff })).bytes;
  const intakeRef = await writeBytes({ bytes: intakeBytes, destinationRoot: staging, destination: 'inputs/raw/intake/dev-canvas-06-intake-report.json', kind: 'INTAKE_REPORT' });
  const handoffRef = await writeBytes({ bytes: handoffBytes, destinationRoot: staging, destination: 'inputs/raw/handoff/dev-canvas-05-handoff.json', kind: 'HANDOFF' });
  const lockfileRef = await copyRegularFile({ source: source.lockfile, destinationRoot: staging, destination: 'inputs/build/package-lock.json', kind: 'NPM_LOCKFILE' });
  const jarRef = await copyRegularFile({ source: paths.runtimeJar, destinationRoot: staging, destination: 'inputs/build/local-runtime.jar', kind: 'LOCAL_RUNTIME_JAR' });
  const webDistRef = await copyTree({ sourceRoot: paths.webDist, destinationRoot: staging });

  const copyArchive = async (entry, destination) => {
    const bytes = materialized.bytes.get(entry);
    if (!bytes) fail('E2E_MANIFEST_INPUT_REF_MISMATCH', 'Archive entry was not materialized.');
    await writeBytes({ bytes, destinationRoot: staging, destination, kind: 'ARCHIVE_INPUT' });
    return archiveRef({ destination, bytes, bundleSha256: bundleRef.sha256, archiveEntry: entry });
  };
  const coverageRef = await copyArchive(materialized.coverageEntry, 'inputs/upstream/catalogs/coverage-catalog.json');
  const goldenManifestRef = await copyArchive(materialized.manifestEntry, 'inputs/upstream/catalogs/golden-manifest.json');
  const familyIdentityCatalogArchiveRef = await copyArchive(materialized.familyIdentityCatalogEntry, 'inputs/upstream/catalogs/family-fixture-identity-catalog.json');
  const familyIdentityCatalogRef = await fileRef(
    resolveInside(staging, 'inputs/upstream/catalogs/family-fixture-identity-catalog.json', 'E2E_MANIFEST_INPUT_REF_MISMATCH'),
    staging,
    'FAMILY_FIXTURE_IDENTITY_CATALOG',
    'E2E_MANIFEST_INPUT_REF_MISMATCH'
  );
  const replayRef = await copyArchive(materialized.replayEntry, 'inputs/upstream/reports/golden-replay-report.json');
  const profileRef = await copyArchive(materialized.profileEntry, 'inputs/upstream/profile/profile.json');
  const symbolRef = await copyArchive(materialized.symbolEntry, 'inputs/upstream/profile/symbol-catalog.json');
  const familyEntries = new Map();
  const archiveRefs = [coverageRef, goldenManifestRef, familyIdentityCatalogArchiveRef, replayRef, profileRef, symbolRef];
  for (const entry of materialized.fixtureEntries) {
    const ref = await copyArchive(entry, archiveEntryPath(entry));
    archiveRefs.push(ref);
    familyEntries.set(entry.slice(`${materialized.prefix}/`.length), ref);
  }

  await copyTree({
    sourceRoot: paths.commonRoot,
    destinationRoot: staging,
    destination: 'inputs/common',
    code: 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'
  });
  const sourceCommonTree = await commonTreeDigest(paths.commonRoot);
  const targetCommonTree = await commonTreeDigest(resolveInside(staging, 'inputs/common', 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'));
  if (sourceCommonTree !== common.treeDigest || targetCommonTree !== common.treeDigest) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture tree changed during materialization.');
  }
  const commonCatalogRef = await fileRef(
    resolveInside(staging, `inputs/common/${commonCatalogName}`, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'),
    staging,
    'COMMON_FIXTURE_CATALOG',
    'E2E_MANIFEST_COMMON_FIXTURE_INVALID'
  );
  const commonEntries = new Map();
  for (const item of common.catalog.e2e_cases) {
    commonEntries.set(item.base_fixture_ref.path, await finalCommonRef({ staging, reference: item.base_fixture_ref }));
    commonEntries.set(item.input_ref.path, await finalCommonRef({ staging, reference: item.input_ref }));
  }

  const drivers = [];
  for (const [id, file] of [['DRIVER-PROCEDURAL', 'procedural-driver.mjs'], ['DRIVER-CONTROL', 'control-driver.mjs'], ['DRIVER-STRUCTURAL', 'structural-driver.mjs']]) {
    drivers.push({ driver_id: id, source_ref: await copyRegularFile({ source: resolve(paths.driverRoot, file), destinationRoot: staging, destination: `inputs/drivers/${file}`, kind: 'DRIVER_SOURCE', code: 'E2E_MANIFEST_DRIVER_INVALID' }) });
  }
  return {
    bundleRef, intakeRef, handoffRef, coverageRef, goldenManifestRef, familyIdentityCatalogRef, replayRef, symbolRef, archiveRefs, familyEntries, commonCatalogRef, commonEntries, drivers,
    sourceBuild: { source_commit: source.source_commit, dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build', node_version: process.version, lockfile_sha256: lockfileRef.sha256, web_dist: webDistRef, local_runtime_jar: jarRef }
  };
}

async function verifyStaging({ staging, manifest, expectedManifestId }) {
  if (manifest.manifest_id !== expectedManifestId || manifest.cases.length !== 194 || manifest.fixture_refs.length === 0) fail('E2E_MANIFEST_CASE_SET_INVALID', 'Staged Manifest is incomplete.');
  for (const reference of [manifest.intake_report_ref, manifest.handoff_ref, manifest.common_fixture_catalog_ref, ...manifest.fixture_refs, ...manifest.driver_catalog.map(item => item.source_ref)]) {
    if (!reference.archive_entry_path) await verifyFileRef({ root: staging, reference, code: 'E2E_MANIFEST_INPUT_REF_MISMATCH' });
    else await verifyFileRef({ root: staging, reference, code: 'E2E_MANIFEST_INPUT_REF_MISMATCH' });
  }
  await verifyFileRef({ root: staging, reference: manifest.source_build.local_runtime_jar });
}

async function verifySourceBuild({ source, paths, trust }) {
  const jar = releaseArtifact(trust.handoff.value, 'LOCAL_RUNTIME_JAR');
  const local = await fileRef(paths.runtimeJar, paths.sourceRoot, 'LOCAL_RUNTIME_JAR', 'E2E_MANIFEST_SOURCE_BUILD_INVALID');
  if (local.byte_length !== jar.byte_length || local.sha256 !== jar.sha256) {
    fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'runtime-jar differs from the exact Handoff artifact.');
  }
}

async function finalCommonRef({ staging, reference }) {
  const path = `inputs/common/${reference.path}`;
  const actual = await fileRef(resolveInside(staging, path, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'), staging, reference.kind, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID');
  if (actual.byte_length !== reference.byte_length || actual.sha256 !== reference.sha256) {
    fail('E2E_MANIFEST_COMMON_FIXTURE_INVALID', 'Common Fixture ref differs from raw bytes.');
  }
  return actual;
}

async function commonTreeDigest(root) {
  return sha256Jcs(await listTree(root, 'E2E_MANIFEST_COMMON_FIXTURE_INVALID'));
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

function releaseArtifact(handoff, kind) {
  const artifact = handoff.build_artifacts?.filter(item => item.kind === kind) ?? [];
  if (artifact.length !== 1) fail('E2E_MANIFEST_INTAKE_INVALID', `Handoff must contain one ${kind} artifact.`);
  return artifact[0];
}

function requireArchiveEntries(entries, required) {
  const present = new Set(entries);
  for (const item of required) if (!present.has(item)) fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Evidence Bundle is missing a required entry.');
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(code, 'Archive entry is not valid JSON.'); }
}

async function resolveJavaRuntime(override) {
  if (override) return override;
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'JAVA_HOME is required for Java 21 archive handling.');
  const javaPath = resolve(javaHome, 'bin/java');
  const jarPath = resolve(javaHome, 'bin/jar');
  let output;
  try {
    const result = await execFile(javaPath, ['-version'], { encoding: 'utf8' });
    output = `${result.stdout}\n${result.stderr}`.trim().replace(/\s+/g, ' ');
  } catch (error) {
    output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().replace(/\s+/g, ' ');
  }
  if (!/(?:java|openjdk) version \"?21(?:\.|\")/.test(output)) fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'Java 21 is required.');
  return { jarPath, javaVersion: output };
}

async function rejectAbandonedStaging(finalRoot, manifestId) {
  const parent = dirname(finalRoot);
  const prefix = `.${manifestId}.tmp-`;
  const { readdir } = await import('node:fs/promises');
  try {
    const names = await readdir(parent);
    if (names.some(name => name.startsWith(prefix))) fail('E2E_MANIFEST_OUTPUT_NOT_FRESH', 'An abandoned staging root must be manually isolated first.');
  } catch (error) {
    if (error?.code === 'ENOENT') fail('E2E_MANIFEST_OUTPUT_NOT_FRESH', 'Final root parent is missing.');
    throw error;
  }
}

function normalizedCommand(options) {
  const values = [
    ['input-mode', options['input-mode']],
    ...(options['input-mode'] === 'PRODUCTION_HANDOFF'
      ? [['handoff-root', '<handoff-root>'], ['intake-report', options['intake-report']]]
      : [['controlled-bundle-root', '<controlled-bundle-root>']]),
    ['source-root', '<source-root>'],
    ['source-date-epoch', options['source-date-epoch']],
    ['web-dist', options['web-dist']],
    ['runtime-jar', options['runtime-jar']],
    ['common-fixture-root', options['common-fixture-root']],
    ['common-fixture-catalog', options['common-fixture-catalog']],
    ['driver-root', options['driver-root']],
    ['output-root', '<output-root>'],
    ['out', options.out]
  ];
  return values.map(([flag, value]) => `--${flag} ${value}`).join(' ');
}

function stagingVerificationArgs({ options, staging }) {
  const common = ['--input-mode', options['input-mode'], '--manifest-root', staging, '--manifest', 'dev-canvas-06-e2e-manifest.json'];
  return options['input-mode'] === 'PRODUCTION_HANDOFF'
    ? ['--handoff-root', options['handoff-root'], '--intake-report', options['intake-report'], ...common, '--require-production']
    : ['--controlled-bundle-root', options['controlled-bundle-root'], ...common];
}

async function defaultGit(root, args) {
  try { return (await execFile('git', ['-C', root, ...args], { encoding: 'utf8' })).stdout.trim(); }
  catch { fail('E2E_MANIFEST_SOURCE_BUILD_INVALID', 'source-root must be a readable Git checkout.'); }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(output => process.stdout.write(`${output}\n`)).catch(error => {
    process.stderr.write(`${error.code ?? 'E2E_MANIFEST_INTERNAL_ERROR'}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}
