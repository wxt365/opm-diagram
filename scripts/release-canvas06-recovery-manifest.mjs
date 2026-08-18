import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { composeRecoveryManifestAndGateFixture, RecoveryManifestComposeError } from './canvas06-recovery-manifest-compose.mjs';
import { canonicalizeJcs as jcs } from './canvas06-rfc8785.mjs';

const execFile = promisify(execFileCallback);
const REQUIRED_OPTIONS = Object.freeze([
  'handoff-root', 'evidence-root', 'intake-report', 'source-root', 'source-date-epoch', 'web-dist',
  'runtime-jar', 'factory-helper-jar', 'factory-root', 'model-template', 'gate-template',
  'manifest-out', 'gate-fixture-out'
]);
const RECOVERY_ROOT = 'dev-canvas-06/recovery';
const MODEL_TEMPLATE = 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json';
const GATE_TEMPLATE = 'tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json';
const REOPEN_CATALOG = 'tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json';
const RECOVERY_MANIFEST = `${RECOVERY_ROOT}/dev-canvas-06-recovery-manifest.json`;
const GATE_FIXTURE = `${RECOVERY_ROOT}/dev-canvas-06-recovery-gate-fixture.json`;
const HELPER_DESTINATION = `${RECOVERY_ROOT}/build/recovery-test-tools.jar`;
const WEB_DESTINATION = `${RECOVERY_ROOT}/build/web-dist`;
const TEMPLATE_DESTINATIONS = Object.freeze({
  model: `${RECOVERY_ROOT}/fixtures/templates/0.1.0/recovery-model-template.json`,
  gate: `${RECOVERY_ROOT}/fixtures/templates/0.1.0/recovery-gate-template.json`,
  catalog: `${RECOVERY_ROOT}/fixtures/catalogs/0.1.0/recovery-reopen-expectation-catalog.json`
});
const PROFILE_ROLES = Object.freeze([
  ['RULE_SET', 'rule_set', 'rules'],
  ['SYMBOL_ASSET', 'symbol_catalog', 'symbols'],
  ['GRAMMAR_ASSET', 'text_grammar', 'grammar'],
  ['NORMALIZATION_DATA', 'normalization_adapter', 'normalization']
]);

const manifestSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest-v02.schema.json', import.meta.url)));
const gateFixtureSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-gate-fixture.schema.json', import.meta.url)));
const intakeSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-intake-report.schema.json', import.meta.url)));
const reopenCatalogSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(reopenCatalogSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateGateFixture = ajv.compile(gateFixtureSchema);
const validateIntake = ajv.compile(intakeSchema);

export class RecoveryManifestBuilderError extends Error {
  constructor(message, code = 'RECOVERY_INPUT_INVALID', exitCode = 2) {
    super(message);
    this.name = 'RecoveryManifestBuilderError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** 构造 Manifest、Gate Fixture 与其不可变 source mirror，并一次性发布 evidence root。 */
export async function main(argv = process.argv.slice(2), runtime = {}) {
  const options = parseOptions(argv);
  const paths = await preflight(options, runtime);
  const staging = resolve(dirname(paths.evidenceRoot), `.${basename(paths.evidenceRoot)}.recovery-manifest.${randomUUID()}`);
  try {
    await mkdir(staging, { recursive: false });
    const input = await stageInputs({ paths, staging, options, runtime });
    const result = composeRecoveryManifestAndGateFixture(input);
    if (!validateManifest(result.manifest)) fail('Recovery Manifest 0.2 Schema validation failed.');
    if (!validateGateFixture(result.gateFixture)) fail('Recovery Gate Fixture Schema validation failed.');
    await writeJson(staging, RECOVERY_MANIFEST, result.manifest);
    await writeJson(staging, GATE_FIXTURE, result.gateFixture);
    await verifyStagedOutput(staging, result);
    await fsyncTree(staging);
    await rename(staging, paths.evidenceRoot);
    await fsyncDirectory(dirname(paths.evidenceRoot));
    return { manifest: RECOVERY_MANIFEST, gateFixture: GATE_FIXTURE };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof RecoveryManifestBuilderError || error instanceof RecoveryManifestComposeError) throw error;
    throw new RecoveryManifestBuilderError('Recovery Manifest atomic commit failed.', 'RECOVERY_UNEXPECTED_RUNTIME_ERROR', 4);
  }
}

async function preflight(options, runtime) {
  const handoffRoot = await directory(options.get('handoff-root'), 'Handoff root');
  const sourceRoot = await directory(options.get('source-root'), 'Source root');
  const evidenceRoot = resolve(options.get('evidence-root'));
  if (await exists(evidenceRoot)) fail('Evidence root must not already exist.');
  if (await exists(`${evidenceRoot}.recovery-manifest`)) fail('Evidence root has a Recovery staging residual.');
  const sourceDateEpoch = decimalEpoch(options.get('source-date-epoch'));
  const sourceCommit = await cleanSourceCommit(sourceRoot, runtime);
  const intakeRelative = safeRelative(options.get('intake-report'), 'Intake report');
  const intake = await readJsonFile(handoffRoot, intakeRelative, 'Intake report');
  const intakeRef = await rawRef(handoffRoot, intakeRelative, 'INTAKE_REPORT', 'Intake report');
  if (!validateIntake(intake.value) || intake.value.intake_status !== 'READY_FOR_RELEASE_VALIDATION') {
    fail('Recovery Manifest requires a Schema-valid READY Intake report.');
  }
  const handoffRelative = safeRelative(intake.value.handoff_ref?.path, 'Intake Handoff ref');
  const handoff = await rawRef(handoffRoot, handoffRelative, 'HANDOFF', 'Handoff');
  if (!sameRef(handoff, intake.value.handoff_ref)) fail('READY Intake Handoff ref does not match Handoff bytes.');
  const handoffValue = await readJsonFile(handoffRoot, handoffRelative, 'Handoff');
  if (handoffValue.value.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoffValue.value.production_gate?.state !== 'DISABLED'
      || handoffValue.value.production_gate?.enabled_capability_ids?.length !== 0) {
    fail('Handoff is not a READY disabled production-gate input.');
  }

  const modelPath = sourcePath(sourceRoot, options.get('model-template'), 'Model Template');
  const gatePath = sourcePath(sourceRoot, options.get('gate-template'), 'Gate Template');
  const factoryRoot = sourcePath(sourceRoot, options.get('factory-root'), 'Recovery Factory root');
  await assertDirectory(factoryRoot, 'Recovery Factory root');
  if (relative(sourceRoot, modelPath) !== MODEL_TEMPLATE || relative(sourceRoot, gatePath) !== GATE_TEMPLATE) {
    fail('Recovery Template paths must use the frozen 0.1.0 source locations.');
  }
  const model = await jsonFromPath(modelPath, 'Recovery Model Template');
  const gate = await jsonFromPath(gatePath, 'Recovery Gate Template');
  if (model.source_date_epoch !== sourceDateEpoch || gate.source_date_epoch !== sourceDateEpoch) {
    fail('Recovery Template source_date_epoch does not match --source-date-epoch.');
  }
  if (model.source_build_binding?.source_commit !== sourceCommit || gate.handoff_identity?.source_commit !== sourceCommit) {
    fail('Recovery Template source commit does not match the clean source checkout.');
  }
  const runtimePath = sourcePath(sourceRoot, options.get('runtime-jar'), 'Runtime JAR');
  const helperPath = sourcePath(sourceRoot, options.get('factory-helper-jar'), 'Recovery Factory helper JAR');
  const webDist = sourcePath(sourceRoot, options.get('web-dist'), 'Web dist');
  await assertDirectory(webDist, 'Web dist');
  await verifyJava21(runtime);
  await verifyHelperJar(helperPath, sourceCommit, runtime);
  const runtimeBytes = await regularBytes(runtimePath, 'Runtime JAR');
  const runtimeRef = {
    kind: 'LOCAL_RUNTIME_JAR', path: model.source_build_binding?.runtime_jar_ref?.path,
    byte_length: runtimeBytes.length, sha256: sha256(runtimeBytes)
  };
  if (!sameRef(runtimeRef, model.source_build_binding?.runtime_jar_ref)) fail('Runtime JAR differs from the frozen Model Template binding.');
  validateReadyHandoff({ handoff: handoffValue.value, handoffRef: handoff, intake: intake.value, intakeRef, model, gate, sourceCommit, runtimeRef });
  if (options.get('manifest-out') !== RECOVERY_MANIFEST || options.get('gate-fixture-out') !== GATE_FIXTURE) {
    fail('Recovery Manifest and Gate Fixture output paths must use the frozen locations.');
  }
  return { handoffRoot, sourceRoot, evidenceRoot, sourceDateEpoch, sourceCommit, intakeRelative, intake, handoffRelative, handoff, handoffValue, modelPath, gatePath, model, gate, runtimePath, helperPath, webDist };
}

async function stageInputs({ paths, staging }) {
  const mirror = async (source, destination, kind, label) => copyRegular(source, staging, destination, kind, label);
  const handoffRef = await mirror(inside(paths.sourceRoot, paths.model.source_build_binding.handoff_ref.path, 'Model Template Handoff'), paths.model.source_build_binding.handoff_ref.path, 'HANDOFF', 'Handoff');
  const intakeRef = await mirror(inside(paths.sourceRoot, paths.model.source_build_binding.intake_report_ref.path, 'Model Template Intake'), paths.model.source_build_binding.intake_report_ref.path, 'INTAKE_REPORT', 'Intake report');
  if (!sameRef(handoffRef, paths.model.source_build_binding.handoff_ref) || !sameRef(intakeRef, paths.model.source_build_binding.intake_report_ref)) {
    fail('Clean source Handoff or Intake bytes differ from frozen Template binding.');
  }
  if (!(await readFile(inside(paths.sourceRoot, handoffRef.path))).equals((await readFile(inside(paths.handoffRoot, paths.handoffRelative))))) {
    fail('Clean source Handoff bytes differ from the supplied Handoff root.');
  }
  if (!(await readFile(inside(paths.sourceRoot, intakeRef.path))).equals((await readFile(inside(paths.handoffRoot, paths.intakeRelative))))) {
    fail('Clean source Intake bytes differ from the supplied Handoff root.');
  }
  const runtimeRef = await mirror(paths.runtimePath, paths.model.source_build_binding.runtime_jar_ref.path, 'LOCAL_RUNTIME_JAR', 'Runtime JAR');
  const helperRef = await mirror(paths.helperPath, HELPER_DESTINATION, 'RECOVERY_TEST_TOOLS_JAR', 'Recovery Factory helper JAR');
  const modelTemplateRef = await mirror(paths.modelPath, TEMPLATE_DESTINATIONS.model, 'RECOVERY_TEMPLATE', 'Recovery Model Template');
  const gateTemplateRef = await mirror(paths.gatePath, TEMPLATE_DESTINATIONS.gate, 'RECOVERY_TEMPLATE', 'Recovery Gate Template');
  const catalogPath = inside(paths.sourceRoot, REOPEN_CATALOG, 'Recovery Reopen Catalog');
  const reopenCatalogRef = await mirror(catalogPath, TEMPLATE_DESTINATIONS.catalog, 'RECOVERY_REOPEN_EXPECTATION_CATALOG', 'Recovery Reopen Catalog');
  const reopenCatalog = await jsonFromPath(catalogPath, 'Recovery Reopen Catalog');
  if (reopenCatalogRef.sha256 !== '9c5d95c454aa680b12a8d3b3bfb958c4f4ec8b8f971bc21e7bb464f6ef32622e') fail('Recovery Reopen Catalog is not the frozen 0.1.0 bytes.');
  await mirrorBaseRevisions(paths, staging, mirror);
  await mirrorProfile(paths, staging, mirror);
  const webDistRef = await copyTree(paths.webDist, staging, WEB_DESTINATION);
  const lockfile = await rawAtPath(inside(paths.sourceRoot, 'package-lock.json', 'package-lock.json'), 'NPM_LOCKFILE', 'package-lock.json');
  const runnerPath = inside(paths.sourceRoot, 'scripts/release-canvas06-recovery-manifest.mjs', 'Recovery Manifest builder source');
  const runnerSource = await rawAtPath(runnerPath, 'RUNNER_SOURCE', 'Recovery Manifest builder source');
  return {
    sourceDateEpoch: paths.sourceDateEpoch,
    generatorIdentity: {
      runner_version: '0.1.0', source_commit: paths.sourceCommit, node_version: process.version,
      os: `${process.platform}-${process.arch}`, command: 'npm run release:canvas06:recovery:manifest', runner_source_sha256: runnerSource.sha256
    },
    handoffRef, intakeReportRef: intakeRef, upstreamSourceBuild: structuredClone(paths.handoffValue.value.source_build),
    sourceBuild: {
      source_commit: paths.sourceCommit, dirty_before_build: false, build_command: 'npm ci --ignore-scripts && npm run build',
      node_version: process.version, lockfile_sha256: lockfile.sha256, web_dist: webDistRef, local_runtime_jar: runtimeRef
    },
    modelTemplate: paths.model, gateTemplate: paths.gate, modelTemplateRef, gateTemplateRef, reopenCatalog, reopenCatalogRef,
    factoryHelperJarRef: helperRef
  };
}

function validateReadyHandoff({ handoff, handoffRef, intake, intakeRef, model, gate, sourceCommit, runtimeRef }) {
  if (!sameIdentityRef(model.source_build_binding?.handoff_ref, handoffRef)
      || !sameIdentityRef(model.source_build_binding?.intake_report_ref, intakeRef)) {
    fail('Recovery Model Template does not close the supplied READY Intake/Handoff identity.');
  }
  const runtimeArtifact = handoff.build_artifacts?.filter(value => value?.kind === 'LOCAL_RUNTIME_JAR') ?? [];
  if (runtimeArtifact.length !== 1 || !sameIdentityRef(runtimeArtifact[0], runtimeRef)
      || gate.handoff_identity?.handoff_id !== handoff.handoff_id
      || gate.handoff_identity?.handoff_status !== handoff.handoff_status
      || gate.handoff_identity?.source_commit !== sourceCommit
      || gate.handoff_identity?.binding_digest !== handoff.active_binding?.binding_digest
      || gate.intake_identity?.report_id !== intake.report_id
      || gate.intake_identity?.intake_status !== intake.intake_status
      || !sameIdentityRef(gate.handoff_identity?.handoff_ref, handoffRef)
      || !sameIdentityRef(gate.intake_identity?.intake_report_ref, intakeRef)) {
    fail('Recovery Gate Template does not close the supplied READY Handoff/Intake identity.');
  }
  const capabilityIds = handoff.capability_evidence?.map(value => value?.capability_id);
  if (!Array.isArray(capabilityIds) || capabilityIds.length !== 34 || !sameJson(capabilityIds, gate.capability_order)
      || !sameJson(capabilityIds, gate.eligible_capability_ids)) {
    fail('Recovery Gate Template capability order does not match the READY Handoff.');
  }
}

async function mirrorBaseRevisions(paths, staging, mirror) {
  const scenarios = paths.model.command_scenarios;
  if (!Array.isArray(scenarios) || scenarios.length !== 4) fail('Recovery Model Template scenarios are invalid.');
  const seen = new Set();
  for (const scenario of scenarios) {
    const reference = scenario?.base_revision_ref;
    if (!reference || reference.kind !== 'MS_REV_001_V02' || seen.has(reference.path)) fail('Recovery Model Template base Revision refs are invalid.');
    seen.add(reference.path);
    const copied = await mirror(inside(paths.sourceRoot, reference.path, 'Recovery base Revision'), reference.path, 'MS_REV_001_V02', 'Recovery base Revision');
    if (!sameRef(copied, reference)) fail('Recovery base Revision differs from frozen Template ref.');
  }
}

async function mirrorProfile(paths, staging, mirror) {
  const binding = paths.handoffValue.value.active_binding;
  const profileId = binding?.profile?.id;
  const profileVersion = binding?.profile?.version;
  if (typeof profileId !== 'string' || typeof profileVersion !== 'string') fail('Handoff active Profile binding is invalid.');
  const base = `packages/profiles/${profileId}/${profileVersion}`;
  const profilePath = inside(paths.sourceRoot, `${base}/profile.json`, 'Profile package');
  const profile = await jsonFromPath(profilePath, 'Profile package');
  const entries = profile.manifest?.entries;
  if (!Array.isArray(entries) || entries.length !== 4 || profile.manifest?.package_digest?.digest !== binding.profile?.sha256) {
    fail('Profile package manifest does not close the active binding.');
  }
  await mirror(profilePath, `${base}/profile.json`, 'PROFILE_PACKAGE', 'Profile package');
  const seen = new Set();
  for (const [role, bindingKey] of PROFILE_ROLES) {
    const entry = entries.find(value => value?.role === role && value.required === true);
    if (!entry || seen.has(role) || typeof entry.logical_path !== 'string') fail('Profile required role set is invalid.');
    seen.add(role);
    const source = inside(paths.sourceRoot, `${base}/${entry.logical_path}`, `Profile ${role}`);
    const copied = await mirror(source, `${base}/${entry.logical_path}`, role, `Profile ${role}`);
    if (copied.sha256 !== entry.digest?.digest || copied.byte_length !== entry.byte_length || copied.sha256 !== paths.handoffValue.value.active_binding[bindingKey]?.sha256) {
      fail(`Profile ${role} differs from active binding.`);
    }
  }
  if (seen.size !== PROFILE_ROLES.length) fail('Profile required role set is incomplete.');
}

async function verifyHelperJar(path, sourceCommit, runtime) {
  await regularBytes(path, 'Recovery Factory helper JAR');
  const jar = runtime.jar ?? javaJarPath();
  const extraction = await mkdtemp(resolve(tmpdir(), 'opm-recovery-helper-jar-'));
  let listing;
  let manifestText;
  try {
    listing = (await execFile(jar, ['tf', path], { encoding: 'utf8' })).stdout.split(/\r?\n/).filter(Boolean);
    await execFile(jar, ['xf', path, 'META-INF/MANIFEST.MF'], { cwd: extraction, encoding: 'utf8' });
    manifestText = await readFile(resolve(extraction, 'META-INF/MANIFEST.MF'), 'utf8');
  } catch { fail('Recovery Factory helper JAR cannot be read with the JDK jar tool.', 'RECOVERY_BUILD_MISMATCH');
  } finally { await rm(extraction, { recursive: true, force: true }); }
  const directoryEntries = new Set(['META-INF/', 'org/', 'org/opm/', 'org/opm/localruntime/', 'org/opm/localruntime/recovery/']);
  if (!listing || !listing.includes('META-INF/MANIFEST.MF') || listing.some(entry => !directoryEntries.has(entry) && entry !== 'META-INF/MANIFEST.MF' && !entry.startsWith('org/opm/localruntime/recovery/'))) {
    fail('Recovery Factory helper JAR has an invalid package surface.', 'RECOVERY_BUILD_MISMATCH');
  }
  const entries = new Map();
  for (const line of manifestText.replace(/\r\n/g, '\n').split('\n')) {
    const separator = line.indexOf(': ');
    if (separator > 0) {
      const key = line.slice(0, separator);
      if (entries.has(key)) fail('Recovery Factory helper JAR Manifest has duplicate entries.', 'RECOVERY_BUILD_MISMATCH');
      entries.set(key, line.slice(separator + 2));
    }
  }
  const expected = new Map([
    ['Implementation-Title', 'OPM Recovery Test Tools'], ['Implementation-Version', '0.1.0-SNAPSHOT'],
    ['OPM-Recovery-Contract-Version', '0.1.0'], ['OPM-Source-Commit', sourceCommit]
  ]);
  for (const [key, value] of expected) if (entries.get(key) !== value) fail('Recovery Factory helper JAR Manifest identity is invalid.', 'RECOVERY_BUILD_MISMATCH');
}

function javaJarPath() {
  const javaHome = process.env.JAVA_HOME;
  if (typeof javaHome !== 'string' || javaHome.length === 0) fail('JAVA_HOME is required to locate the JDK 21 jar tool.', 'RECOVERY_BUILD_MISMATCH');
  return resolve(javaHome, 'bin/jar');
}

async function verifyJava21(runtime) {
  const version = runtime.javaVersion ?? await javaVersion(runtime);
  if (typeof version !== 'string' || !/(?:version\s+"?21\.|openjdk\s+21\.)/.test(version)) {
    fail('Recovery Manifest requires JDK 21.', 'RECOVERY_BUILD_MISMATCH');
  }
}

async function javaVersion(runtime) {
  const java = runtime.java ?? javaPath();
  try {
    const result = await execFile(java, ['-version'], { encoding: 'utf8' });
    return `${result.stdout}\n${result.stderr}`;
  } catch { fail('JDK Java version cannot be read.', 'RECOVERY_BUILD_MISMATCH'); }
}

function javaPath() {
  const javaHome = process.env.JAVA_HOME;
  if (typeof javaHome !== 'string' || javaHome.length === 0) fail('JAVA_HOME is required to locate JDK 21.', 'RECOVERY_BUILD_MISMATCH');
  return resolve(javaHome, 'bin/java');
}

async function verifyStagedOutput(staging, result) {
  const manifest = await jsonFromPath(resolve(staging, RECOVERY_MANIFEST), 'Staged Recovery Manifest');
  const gate = await jsonFromPath(resolve(staging, GATE_FIXTURE), 'Staged Recovery Gate Fixture');
  if (!validateManifest(manifest) || !validateGateFixture(gate) || jcs(manifest) !== jcs(result.manifest) || jcs(gate) !== jcs(result.gateFixture)) {
    fail('Staged Recovery Manifest output is not semantically closed.');
  }
}

function parseOptions(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED_OPTIONS.length * 2) fail('Recovery Manifest arguments are incomplete.');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== 'string' || !flag.startsWith('--') || flag.includes('=') || !REQUIRED_OPTIONS.includes(flag.slice(2))
        || typeof value !== 'string' || value.length === 0 || values.has(flag.slice(2))) fail('Recovery Manifest arguments are invalid.');
    values.set(flag.slice(2), value);
  }
  if (values.size !== REQUIRED_OPTIONS.length) fail('Recovery Manifest arguments are incomplete.');
  return values;
}

async function cleanSourceCommit(root, runtime) {
  if (runtime.sourceCommit) return runtime.sourceCommit(root);
  try {
    const status = (await execFile('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })).stdout;
    const commit = (await execFile('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
    if (status.length !== 0 || !/^[a-f0-9]{40}$/.test(commit)) fail('Source root must be a clean Git commit.');
    return commit;
  } catch (error) {
    if (error instanceof RecoveryManifestBuilderError) throw error;
    fail('Source root must be a clean Git commit.');
  }
}

function sourcePath(root, value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} path is invalid.`);
  const candidate = value.startsWith('/') ? resolve(value) : resolve(root, value);
  const relation = relative(root, candidate);
  return inside(root, relation, label);
}

function inside(root, path, label) {
  const relation = safeRelative(path, label);
  const candidate = resolve(root, relation);
  if (candidate === resolve(root) || !candidate.startsWith(`${resolve(root)}${sep}`)) fail(`${label} escapes its root.`);
  return candidate;
}

function safeRelative(path, label) {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.split(/[\\/]/).some(part => part === '..' || part.length === 0)) fail(`${label} path is invalid.`);
  return path.replaceAll('\\', '/');
}

function decimalEpoch(value) {
  if (!/^(0|[1-9]\d*)$/.test(value ?? '')) fail('Recovery source date epoch is invalid.');
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) fail('Recovery source date epoch is invalid.');
  return epoch;
}

async function directory(value, label) {
  const path = resolve(value);
  await assertDirectory(path, label);
  return path;
}

async function assertDirectory(path, label) {
  let info;
  try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-symlink directory.`);
}

async function regularBytes(path, label) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail(`${label} must be a non-symlink, non-hard-linked regular file.`);
  return readFile(path);
}

async function rawAtPath(path, kind, label) {
  const bytes = await regularBytes(path, label);
  return { kind, path: null, byte_length: bytes.length, sha256: sha256(bytes) };
}

async function rawRef(root, path, kind, label) {
  const absolute = inside(root, path, label);
  const bytes = await regularBytes(absolute, label);
  return { kind, path, byte_length: bytes.length, sha256: sha256(bytes) };
}

async function copyRegular(source, staging, destination, kind, label) {
  const bytes = await regularBytes(source, label);
  const target = inside(staging, destination, label);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  const copied = await regularBytes(target, label);
  if (!copied.equals(bytes)) fail(`${label} source mirror bytes differ after copy.`);
  return { kind, path: destination, byte_length: copied.length, sha256: sha256(copied) };
}

async function copyTree(source, staging, destination) {
  const entries = [];
  await visit(source, '');
  return { kind: 'WEB_DIST_TREE', path: destination, byte_length: entries.reduce((total, item) => total + item.byte_length, 0), sha256: sha256(Buffer.from(jcs(entries), 'utf8')) };
  async function visit(directory, prefix) {
    await assertDirectory(directory, 'Web dist directory');
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const absolute = resolve(directory, child.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory()) fail('Web dist contains an unsafe entry.');
      if (info.isDirectory()) await visit(absolute, relativePath);
      else {
        const ref = await copyRegular(absolute, staging, `${destination}/${relativePath}`, 'WEB_DIST_FILE', 'Web dist file');
        entries.push({ path: relativePath, byte_length: ref.byte_length, sha256: ref.sha256 });
      }
    }
  }
}

async function readJsonFile(root, path, label) {
  const absolute = inside(root, path, label);
  const bytes = await regularBytes(absolute, label);
  try { return { value: JSON.parse(bytes.toString('utf8')), bytes }; } catch { fail(`${label} is not valid JSON.`); }
}

async function jsonFromPath(path, label) {
  const bytes = await regularBytes(path, label);
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(`${label} is not valid JSON.`); }
}

async function writeJson(root, path, value) {
  const target = inside(root, path, 'Recovery output');
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(temporary, 'wx');
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, target);
}

async function fsyncTree(root) {
  const children = await readdir(root, { withFileTypes: true });
  for (const child of children) {
    const path = resolve(root, child.name);
    if (child.isDirectory()) await fsyncTree(path);
    else if (child.isFile()) await fsyncDirectory(path);
  }
  await fsyncDirectory(root);
}

async function fsyncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function exists(path) {
  try { await lstat(path); return true; } catch { return false; }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}
function sameIdentityRef(left, right) {
  return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}
function sameJson(left, right) { return left !== undefined && right !== undefined && jcs(left) === jcs(right); }
function fail(message, code = 'RECOVERY_INPUT_INVALID', exitCode = 2) { throw new RecoveryManifestBuilderError(message, code, exitCode); }

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(result => console.log(`Recovery Manifest/Gate Fixture materialized: ${result.manifest}`)).catch(error => {
    console.error(`${error.code ?? 'RECOVERY_UNEXPECTED_RUNTIME_ERROR'}: ${error.message}`);
    process.exitCode = error.exitCode ?? 4;
  });
}
