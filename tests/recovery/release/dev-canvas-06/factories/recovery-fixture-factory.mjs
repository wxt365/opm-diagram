import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, lstat, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalizeJcs as jcs } from '../../../../../scripts/canvas06-rfc8785.mjs';
import { RecoveryTemplateError, loadRecoveryTemplate as loadFrozenTemplate } from './recovery-template-verifier.mjs';

const MANIFEST_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest-v02.schema.json', import.meta.url), 'utf8'));
const REOPEN_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json', import.meta.url), 'utf8'));
const REPORT_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-report.schema.json', import.meta.url), 'utf8'));
const MATERIALIZATION_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-attempt-materialization.schema.json', import.meta.url), 'utf8'));
const TREE_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-tree-descriptor.schema.json', import.meta.url), 'utf8'));
const GATE_FIXTURE_SCHEMA = JSON.parse(await readFile(new URL('../../../../../docs/contracts/schemas/opm-dev-canvas-06-recovery-gate-fixture.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(REOPEN_SCHEMA);
ajv.addSchema(REPORT_SCHEMA);
const validateManifestSchema = ajv.compile(MANIFEST_SCHEMA);
const validateMaterializationSchema = ajv.compile(MATERIALIZATION_SCHEMA);
const validateTreeSchema = ajv.compile(TREE_SCHEMA);
const validateGateFixtureSchema = ajv.compile(GATE_FIXTURE_SCHEMA);

const PROFILE_ROLES = [
  ['profile_ref', 'PROFILE_PACKAGE', 'profile', 'profile.json'],
  ['rule_set_ref', 'RULE_SET', 'rule_set', 'RULE_SET'],
  ['symbol_catalog_ref', 'SYMBOL_ASSET', 'symbol_catalog', 'SYMBOL_ASSET'],
  ['text_grammar_ref', 'GRAMMAR_ASSET', 'text_grammar', 'GRAMMAR_ASSET'],
  ['normalization_adapter_ref', 'NORMALIZATION_DATA', 'normalization_adapter', 'NORMALIZATION_DATA']
];

export class RecoveryFixtureFactoryError extends Error {
  constructor(message, code = 'RECOVERY_FIXTURE_MISMATCH', exitCode = 2) {
    super(message);
    this.name = 'RecoveryFixtureFactoryError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** 按活动 Recovery Manifest 0.2 读取一份不可变 Template，不写入任何证据。 */
export async function loadRecoveryTemplate(input) {
  assertExactKeys(input, ['evidenceRoot', 'manifestRef', 'templateSourceRef', 'expectedFixtureId'], 'Recovery Factory input');
  const root = resolve(input.evidenceRoot);
  await assertDirectory(root, 'Evidence root');

  const manifest = await readJsonReference(root, input.manifestRef, 'RECOVERY_MANIFEST', 'Recovery Manifest');
  if (!validateManifestSchema(manifest.value)) fail('Recovery Manifest 0.2 Schema is invalid.');
  const fixture = fixtureFor(manifest.value, input.expectedFixtureId);
  if (!sameRef(fixture.source_ref, input.templateSourceRef)) fail('Requested Template differs from the Recovery Manifest fixture catalog.');

  const frozen = await loadImmutableTemplate(root, input.templateSourceRef, input.expectedFixtureId);
  if (fixture.fixture_digest !== frozen.fixture_digest || jcs(fixture.expected_result_digests) !== jcs(frozen.template.expected_result_digests)) {
    fail('Recovery Manifest fixture identity differs from immutable Template bytes.');
  }

  const handoff = await readJsonReference(root, manifest.value.handoff_ref, 'HANDOFF', 'Handoff');
  const intake = await readJsonReference(root, manifest.value.intake_report_ref, 'INTAKE_REPORT', 'Intake Report');
  const runtimeRef = manifest.value.source_build.local_runtime_jar;
  await readRawReference(root, runtimeRef, 'LOCAL_RUNTIME_JAR', 'Runtime JAR');
  validateReadyTrust({ manifest: manifest.value, handoff: handoff.value, intake: intake.value, frozen });

  const modelFixture = fixtureFor(manifest.value, 'RECOVERY-FIXTURE-MODEL');
  const model = input.expectedFixtureId === 'RECOVERY-FIXTURE-MODEL'
    ? frozen
    : await loadImmutableTemplate(root, modelFixture.source_ref, 'RECOVERY-FIXTURE-MODEL');
  const modelBaseInputs = await loadModelBaseInputs(root, model.template);
  const profileSourceRefs = await loadProfileSourceRefs(root, handoff.value.active_binding);
  validateTemplateBinding({ template: frozen.template, manifest: manifest.value, handoff: handoff.value, intake: intake.value });
  if (model.template.source_date_epoch !== frozen.template.source_date_epoch) fail('Recovery Templates use different source_date_epoch values.');

  return deepFreeze({
    fixture_id: frozen.fixture_id,
    template_source_ref: frozen.template_source_ref,
    template_payload_sha256: frozen.template_payload_sha256,
    fixture_digest: frozen.fixture_digest,
    manifest_ref: manifest.reference,
    handoff_ref: manifest.value.handoff_ref,
    intake_report_ref: manifest.value.intake_report_ref,
    source_build: manifest.value.source_build,
    runtime_jar_ref: runtimeRef,
    active_binding: handoff.value.active_binding,
    model_base_inputs: modelBaseInputs,
    profile_source_refs: profileSourceRefs,
    template: frozen.template
  });
}

/**
 * 物化一个 fault 前的 Recovery attempt。Node 只拥有 staging/final root，
 * SQLite、descriptor 与 materialization.json 由独立 Java helper 写入。
 */
export async function materializeRecoveryAttempt(input) {
  assertExactKeys(input, [
    'evidenceRoot', 'modelTemplate', 'gateTemplate', 'gateFixtureRef', 'factoryHelperJarRef',
    'caseDefinition', 'attemptOrdinal', 'attemptRoot', 'sourceDateEpoch'
  ], 'Recovery materialization input');
  const evidenceRoot = resolve(input.evidenceRoot);
  await assertDirectory(evidenceRoot, 'Evidence root');
  assertFrozenTemplate(input.modelTemplate, 'RECOVERY-FIXTURE-MODEL');
  assertFrozenTemplate(input.gateTemplate, 'RECOVERY-FIXTURE-GATE');
  if (input.modelTemplate.manifest_ref.path !== input.gateTemplate.manifest_ref.path
      || input.modelTemplate.manifest_ref.sha256 !== input.gateTemplate.manifest_ref.sha256) {
    fail('Recovery Templates do not share the same Manifest.');
  }
  if (!Number.isInteger(input.attemptOrdinal) || ![1, 2].includes(input.attemptOrdinal)
      || !Number.isSafeInteger(input.sourceDateEpoch) || input.sourceDateEpoch < 0) {
    fail('Recovery attempt ordinal or source date epoch is invalid.');
  }

  const manifest = await readJsonReference(evidenceRoot, input.modelTemplate.manifest_ref, 'RECOVERY_MANIFEST', 'Recovery Manifest');
  if (!validateManifestSchema(manifest.value)) fail('Recovery Manifest 0.2 Schema is invalid.');
  const caseDefinition = exactCaseDefinition(manifest.value, input.caseDefinition);
  const category = categoryForCase(caseDefinition.case_id);
  const baseScenarioId = baseScenarioForCase(caseDefinition.case_id);
  if (caseDefinition.category !== category) fail('Recovery case category is not frozen.');
  const expectedAttemptRoot = resolve(evidenceRoot, 'dev-canvas-06/recovery/attempts', caseDefinition.case_id, String(input.attemptOrdinal));
  if (resolve(input.attemptRoot) !== expectedAttemptRoot) fail('Recovery attempt root is not the frozen final path.');
  await assertAttemptParent(evidenceRoot, expectedAttemptRoot);

  const gateFixture = await validateGateFixture(evidenceRoot, input.gateFixtureRef, category);
  const helper = await readRawReference(evidenceRoot, input.factoryHelperJarRef, 'RECOVERY_TEST_TOOLS_JAR', 'Recovery Factory helper JAR');
  if (input.factoryHelperJarRef.path !== 'dev-canvas-06/recovery/build/recovery-test-tools.jar') {
    fail('Recovery Factory helper JAR path is not frozen.');
  }
  const runtime = await readRawReference(evidenceRoot, input.modelTemplate.runtime_jar_ref, 'LOCAL_RUNTIME_JAR', 'Recovery Runtime JAR');
  await validateRuntimeJarSurface(resolve(evidenceRoot, input.modelTemplate.runtime_jar_ref.path));
  if (input.modelTemplate.sourceDateEpoch !== undefined || input.gateTemplate.sourceDateEpoch !== undefined) {
    fail('Recovery Template wrapper has an unsupported source date field.');
  }
  if (input.modelTemplate.template.source_date_epoch !== input.sourceDateEpoch
      || input.gateTemplate.template.source_date_epoch !== input.sourceDateEpoch
      || Date.parse(manifest.value.generated_at) / 1000 !== input.sourceDateEpoch) {
    fail('Recovery source date epoch is not closed by Templates and Manifest.');
  }

  const parent = resolve(expectedAttemptRoot, '..');
  const staging = resolve(parent, `.recovery-materialize.${digest(jcs(caseDefinition)).slice(0, 12)}.${input.attemptOrdinal}.${randomUUID()}`);
  try {
    await mkdir(staging, { recursive: false });
    await mkdir(resolve(staging, 'fixture'), { recursive: false });
    await materializeFrozenInputs({ evidenceRoot, staging, modelTemplate: input.modelTemplate, gateTemplate: input.gateTemplate, baseScenarioId, gateFixture });
    await fsyncTree(staging);
    await runRecoveryHelper({ evidenceRoot, staging, modelTemplate: input.modelTemplate, gateTemplate: input.gateTemplate,
      factoryHelperJarRef: input.factoryHelperJarRef, helperPath: resolve(evidenceRoot, input.factoryHelperJarRef.path),
      runtimePath: resolve(evidenceRoot, input.modelTemplate.runtime_jar_ref.path), caseDefinition, baseScenarioId,
      attemptOrdinal: input.attemptOrdinal, sourceDateEpoch: input.sourceDateEpoch, gateFixture });
    const stagedMaterialization = await readMaterialization(staging);
    await verifyMaterialization({ evidenceRoot, attemptRoot: staging, finalAttemptRoot: expectedAttemptRoot,
      materialization: stagedMaterialization.value, materializationBytes: stagedMaterialization.bytes,
      modelTemplate: input.modelTemplate, gateTemplate: input.gateTemplate, caseDefinition, baseScenarioId,
      attemptOrdinal: input.attemptOrdinal, sourceDateEpoch: input.sourceDateEpoch, factoryHelperJarRef: input.factoryHelperJarRef,
      helperBytes: helper, runtimeBytes: runtime, gateFixture });
    await fsyncTree(staging);
    await rename(staging, expectedAttemptRoot);
    await fsyncDirectory(parent);
    const materializationRef = await referenceAt(evidenceRoot, relative(evidenceRoot, resolve(expectedAttemptRoot, 'fixture/materialization.json')),
      'RECOVERY_ATTEMPT_MATERIALIZATION', 'Recovery materialization');
    await verifyAttemptMaterialization({ evidenceRoot, materializationRef, attemptRoot: expectedAttemptRoot });
    return deepFreeze(stagedMaterialization.value);
  } catch (error) {
    await removeStaging(staging, error);
    if (error instanceof RecoveryFixtureFactoryError) throw error;
    throw new RecoveryFixtureFactoryError('Recovery Factory encountered an unexpected runtime error.', 'RECOVERY_UNEXPECTED_RUNTIME_ERROR', 4);
  }
}

/** 只读复算已提交的 Recovery attempt；成功时不返回可消费结论。 */
export async function verifyAttemptMaterialization(input) {
  assertExactKeys(input, ['evidenceRoot', 'materializationRef', 'attemptRoot'], 'Recovery materialization verification input');
  const evidenceRoot = resolve(input.evidenceRoot);
  const attemptRoot = resolve(input.attemptRoot);
  await assertDirectory(evidenceRoot, 'Evidence root');
  await assertFinalAttemptRoot(evidenceRoot, attemptRoot);
  const expectedPath = relative(evidenceRoot, resolve(attemptRoot, 'fixture/materialization.json'));
  if (input.materializationRef?.kind !== 'RECOVERY_ATTEMPT_MATERIALIZATION' || input.materializationRef.path !== expectedPath) {
    fail('Recovery materialization reference is not the final attempt file.');
  }
  const rootBefore = await treeDigest(attemptRoot);
  const materialization = await readJsonReference(evidenceRoot, input.materializationRef,
    'RECOVERY_ATTEMPT_MATERIALIZATION', 'Recovery materialization');
  if (!validateMaterializationSchema(materialization.value)) fail('Recovery Attempt Materialization Schema is invalid.');
  const manifest = await readJsonReference(evidenceRoot, materialization.value.source_refs.manifest_ref,
    'RECOVERY_MANIFEST', 'Recovery Manifest');
  if (!validateManifestSchema(manifest.value)) fail('Recovery Manifest 0.2 Schema is invalid.');
  const caseDefinition = exactCaseDefinition(manifest.value,
    manifest.value.case_catalog.find(value => value.case_id === materialization.value.case_id));
  const baseScenarioId = baseScenarioForCase(caseDefinition.case_id);
  const modelTemplate = await loadRecoveryTemplate({ evidenceRoot, manifestRef: materialization.value.source_refs.manifest_ref,
    templateSourceRef: materialization.value.source_refs.model_template_ref, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' });
  const gateTemplate = await loadRecoveryTemplate({ evidenceRoot, manifestRef: materialization.value.source_refs.manifest_ref,
    templateSourceRef: materialization.value.source_refs.gate_template_ref, expectedFixtureId: 'RECOVERY-FIXTURE-GATE' });
  const helper = await readRawReference(evidenceRoot, materialization.value.source_refs.factory_helper_jar_ref,
    'RECOVERY_TEST_TOOLS_JAR', 'Recovery Factory helper JAR');
  const runtime = await readRawReference(evidenceRoot, materialization.value.source_refs.runtime_jar_ref,
    'LOCAL_RUNTIME_JAR', 'Recovery Runtime JAR');
  const gateFixture = materialization.value.category === 'ROLLBACK'
    ? await validateGateFixture(evidenceRoot, materialization.value.source_refs.gate_fixture_ref, 'ROLLBACK')
    : null;
  await verifyMaterialization({ evidenceRoot, attemptRoot, finalAttemptRoot: attemptRoot, materialization: materialization.value,
    materializationBytes: materialization.bytes, modelTemplate, gateTemplate, caseDefinition, baseScenarioId,
    attemptOrdinal: materialization.value.attempt_ordinal, sourceDateEpoch: materialization.value.source_date_epoch,
    factoryHelperJarRef: materialization.value.source_refs.factory_helper_jar_ref, helperBytes: helper, runtimeBytes: runtime, gateFixture });
  if (rootBefore !== await treeDigest(attemptRoot)) {
    throw new RecoveryFixtureFactoryError('Recovery verifier changed the attempt root.', 'RECOVERY_READONLY_MISMATCH');
  }
}

function assertFrozenTemplate(value, fixtureId) {
  if (!value || typeof value !== 'object' || value.fixture_id !== fixtureId || !Object.isFrozen(value)
      || !value.template_source_ref || !value.manifest_ref || !value.runtime_jar_ref || !value.template) {
    fail('Recovery Template input is not a frozen trusted object.');
  }
}

function exactCaseDefinition(manifest, candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !Array.isArray(manifest.case_catalog)) {
    fail('Recovery case definition is invalid.');
  }
  const matches = manifest.case_catalog.filter(value => value?.case_id === candidate.case_id);
  if (matches.length !== 1 || jcs(matches[0]) !== jcs(candidate)) fail('Recovery case definition differs from the Manifest.');
  return matches[0];
}

function categoryForCase(caseId) {
  const sequence = Number.parseInt(caseId?.match(/^RCV-CANVAS-(\d{3})\./)?.[1] ?? '', 10);
  if (sequence >= 1 && sequence <= 8) return 'PRE_COMMIT';
  if (sequence >= 9 && sequence <= 15) return 'SQLITE';
  if (sequence >= 16 && sequence <= 19) return 'FORCED_RESTART';
  if (sequence >= 20 && sequence <= 22) return 'SERVICE_RECOVERY';
  if (sequence >= 23 && sequence <= 28) return 'ROLLBACK';
  fail('Recovery case ID is not frozen.');
}

function baseScenarioForCase(caseId) {
  const number = Number.parseInt(caseId?.match(/^RCV-CANVAS-(\d{3})\./)?.[1] ?? '', 10);
  if ([5, 9, 13, 17, 20, 22, 26].includes(number)) return 'RECOVERY-COMMAND-STATE-001';
  if ([1, 2, 3, 4, 8, 10, 14, 18, 25, 27].includes(number)) return 'RECOVERY-COMMAND-PROCEDURAL-001';
  if ([7, 11, 15, 19, 24, 28].includes(number)) return 'RECOVERY-COMMAND-CONTROL-001';
  if ([6, 12, 16, 21, 23].includes(number)) return 'RECOVERY-COMMAND-STRUCTURAL-FAN-001';
  fail('Recovery base scenario mapping is incomplete.');
}

async function validateGateFixture(root, reference, category) {
  if (category !== 'ROLLBACK') {
    if (reference !== null) fail('Recovery non-rollback case must not receive a Gate Fixture.');
    return null;
  }
  const fixture = await readJsonReference(root, reference, 'RECOVERY_GATE_FIXTURE', 'Recovery Gate Fixture');
  if (!validateGateFixtureSchema(fixture.value)) fail('Recovery Gate Fixture Schema is invalid.');
  return fixture;
}

async function assertAttemptParent(evidenceRoot, attemptRoot) {
  const parent = resolve(attemptRoot, '..');
  await assertDirectory(evidenceRoot, 'Evidence root');
  await assertDirectory(parent, 'Recovery attempt parent');
  if (await exists(attemptRoot)) fail('Recovery final attempt root already exists.');
  for (const name of await readdir(parent)) {
    if (name.startsWith('.recovery-materialize.')) fail('Recovery materialization residual exists.');
  }
}

async function assertFinalAttemptRoot(evidenceRoot, attemptRoot) {
  const relativeAttempt = relative(evidenceRoot, attemptRoot);
  if (!safePath(relativeAttempt) || !relativeAttempt.startsWith('dev-canvas-06/recovery/attempts/')) {
    fail('Recovery attempt root escapes its evidence root.');
  }
  await assertDirectory(attemptRoot, 'Recovery final attempt root');
  const parent = resolve(attemptRoot, '..');
  for (const name of await readdir(parent)) {
    if (name.startsWith('.recovery-materialize.')) fail('Recovery materialization residual exists.');
  }
}

async function materializeFrozenInputs({ evidenceRoot, staging, modelTemplate, gateTemplate, baseScenarioId, gateFixture }) {
  const fixture = resolve(staging, 'fixture');
  await copyReference(evidenceRoot, modelTemplate.template_source_ref, resolve(fixture, 'model-template.json'), 'RECOVERY_TEMPLATE');
  await copyReference(evidenceRoot, gateTemplate.template_source_ref, resolve(fixture, 'gate-template.json'), 'RECOVERY_TEMPLATE');
  const base = modelTemplate.model_base_inputs.find(value => value.scenario_id === baseScenarioId);
  if (!base) fail('Recovery base scenario is absent from the frozen Model Template.');
  await copyReference(evidenceRoot, base.source_ref, resolve(fixture, 'base-revision.json'), 'MS_REV_001_V02');
  for (const [field, kind] of PROFILE_ROLES) {
    const source = modelTemplate.profile_source_refs[field];
    if (!source || source.kind !== kind) fail('Recovery Profile source references are incomplete.');
    const target = resolve(fixture, 'assets', source.path);
    await copyReference(evidenceRoot, source, target, kind);
  }
  if (gateFixture) {
    await copyReference(evidenceRoot, gateFixture.reference, resolve(fixture, 'gate/gate-fixture-work.json'), 'RECOVERY_GATE_FIXTURE');
  }
}

async function copyReference(root, reference, target, kind) {
  const bytes = await readRawReference(root, reference, kind, 'Recovery source input');
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  await fsyncFile(target);
  const copied = await readFile(target);
  if (copied.length !== reference.byte_length || digest(copied) !== reference.sha256) {
    fail('Recovery copied input differs from its source reference.');
  }
}

async function runRecoveryHelper({ evidenceRoot, staging, modelTemplate, gateTemplate, factoryHelperJarRef, helperPath, runtimePath,
  caseDefinition, baseScenarioId, attemptOrdinal, sourceDateEpoch, gateFixture }) {
  const java = await java21Path();
  const args = [
    `-Dloader.path=${helperPath}`,
    '-Dloader.main=org.opm.localruntime.recovery.RecoveryFactoryMaterializerMain',
    '-cp', runtimePath,
    'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--evidence-root', evidenceRoot,
    '--attempt-staging-root', staging,
    '--manifest', modelTemplate.manifest_ref.path,
    '--model-template', modelTemplate.template_source_ref.path,
    '--gate-template', gateTemplate.template_source_ref.path,
    '--factory-helper-jar', helperPath,
    '--case-id', caseDefinition.case_id,
    '--case-definition-sha256', digest(jcs(caseDefinition)),
    '--base-scenario-id', baseScenarioId,
    '--attempt-ordinal', String(attemptOrdinal),
    '--source-date-epoch', String(sourceDateEpoch)
  ];
  if (gateFixture) args.push('--gate-fixture', gateFixture.reference.path);
  await runProcess(java, args, 'Recovery Factory helper');
  if (factoryHelperJarRef.path !== 'dev-canvas-06/recovery/build/recovery-test-tools.jar') fail('Recovery Factory helper JAR path is not frozen.');
}

async function java21Path() {
  const home = process.env.JAVA_HOME;
  if (!home) throw new RecoveryFixtureFactoryError('JAVA_HOME is required for the Recovery Factory helper.', 'RECOVERY_BUILD_MISMATCH');
  const java = resolve(home, 'bin/java');
  await assertRegularFile(resolve(home, '..'), java, 'Java 21 executable');
  const result = await runProcess(java, ['-version'], 'Java 21 preflight', true);
  if (!/version "21(?:\.|\")/.test(result.stderr)) {
    throw new RecoveryFixtureFactoryError('Recovery Factory requires Java 21.', 'RECOVERY_BUILD_MISMATCH');
  }
  return java;
}

async function validateRuntimeJarSurface(runtimePath) {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new RecoveryFixtureFactoryError('JAVA_HOME is required for the Recovery Runtime preflight.', 'RECOVERY_BUILD_MISMATCH');
  const jar = resolve(javaHome, 'bin/jar');
  await assertRegularFile(resolve(javaHome, '..'), jar, 'Java JAR tool');
  const listing = await runProcess(jar, ['--list', '--file', runtimePath], 'Recovery Runtime JAR preflight');
  const entries = new Set(listing.stdout.split(/\r?\n/));
  for (const name of [
    'BOOT-INF/classes/org/opm/localruntime/releaseauthoring/Rfc8785JsonCanonicalizer.class',
    'BOOT-INF/classes/org/opm/localruntime/releaseauthoring/ProjectionDigestV01.class',
    'BOOT-INF/classes/org/opm/localruntime/application/LocalApiService.class',
    'BOOT-INF/classes/org/opm/localruntime/storage/ProjectDatabaseFactory.class'
  ]) {
    if (!entries.has(name)) {
      throw new RecoveryFixtureFactoryError('Recovery Runtime JAR does not provide the frozen Helper surface.', 'RECOVERY_BUILD_MISMATCH');
    }
  }
}

async function runProcess(command, args, label, allowFailure = false) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => rejectPromise(new RecoveryFixtureFactoryError(`${label} could not start: ${error.message}`, 'RECOVERY_UNEXPECTED_RUNTIME_ERROR', 4)));
    child.on('close', code => {
      if (code === 0 || allowFailure) resolvePromise({ code, stdout, stderr });
      else rejectPromise(new RecoveryFixtureFactoryError(`${label} failed with exit ${code}: ${stderr.slice(0, 1024).trim()}`, 'RECOVERY_FIXTURE_MISMATCH'));
    });
  });
}

async function readMaterialization(attemptRoot) {
  const path = resolve(attemptRoot, 'fixture/materialization.json');
  await assertRegularFile(attemptRoot, path, 'Recovery materialization');
  const bytes = await readFile(path);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail('Recovery materialization is not valid UTF-8 JSON.');
  }
}

async function verifyMaterialization({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, materializationBytes,
  modelTemplate, gateTemplate, caseDefinition, baseScenarioId, attemptOrdinal, sourceDateEpoch, factoryHelperJarRef,
  helperBytes, runtimeBytes, gateFixture }) {
  if (!validateMaterializationSchema(materialization)) fail('Recovery Attempt Materialization Schema is invalid.');
  const payload = { ...materialization };
  delete payload.materialization_payload_sha256;
  if (digest(jcs(payload)) !== materialization.materialization_payload_sha256) fail('Recovery materialization payload digest is invalid.');
  if (materialization.case_id !== caseDefinition.case_id || materialization.category !== categoryForCase(caseDefinition.case_id)
      || materialization.base_scenario_id !== baseScenarioId || materialization.attempt_ordinal !== attemptOrdinal
      || materialization.source_date_epoch !== sourceDateEpoch || materialization.case_definition_sha256 !== digest(jcs(caseDefinition))) {
    fail('Recovery materialization identity differs from the frozen case.');
  }
  const key = {
    manifest_sha256: modelTemplate.manifest_ref.sha256,
    model_template_sha256: modelTemplate.template_source_ref.sha256,
    gate_template_sha256: gateTemplate.template_source_ref.sha256,
    base_revision_sha256: modelTemplate.model_base_inputs.find(value => value.scenario_id === baseScenarioId).source_ref.sha256,
    runtime_jar_sha256: modelTemplate.runtime_jar_ref.sha256,
    factory_helper_jar_sha256: factoryHelperJarRef.sha256,
    case_id: caseDefinition.case_id,
    base_scenario_id: baseScenarioId,
    attempt_ordinal: attemptOrdinal,
    source_date_epoch: sourceDateEpoch
  };
  const expectedId = `dev-canvas-06.recovery-materialization.${caseDefinition.case_id}.${attemptOrdinal}.${digest(jcs(key)).slice(0, 12)}`;
  if (materialization.materialization_id !== expectedId) fail('Recovery materialization ID is invalid.');
  if (jcs(materialization.source_build) !== jcs(modelTemplate.source_build)
      || jcs(materialization.active_binding) !== jcs(modelTemplate.active_binding)) fail('Recovery source build or binding is invalid.');

  const expectedSourceRefs = {
    manifest_ref: modelTemplate.manifest_ref,
    handoff_ref: modelTemplate.handoff_ref,
    intake_report_ref: modelTemplate.intake_report_ref,
    runtime_jar_ref: modelTemplate.runtime_jar_ref,
    factory_helper_jar_ref: factoryHelperJarRef,
    model_template_ref: modelTemplate.template_source_ref,
    gate_template_ref: gateTemplate.template_source_ref,
    base_revision_ref: modelTemplate.model_base_inputs.find(value => value.scenario_id === baseScenarioId).source_ref,
    profile_source_refs: modelTemplate.profile_source_refs,
    ...(gateFixture ? { gate_fixture_ref: gateFixture.reference } : {})
  };
  if (jcs(materialization.source_refs) !== jcs(expectedSourceRefs)) fail('Recovery source references are invalid.');
  if (helperBytes.length !== factoryHelperJarRef.byte_length || digest(helperBytes) !== factoryHelperJarRef.sha256
      || runtimeBytes.length !== modelTemplate.runtime_jar_ref.byte_length || digest(runtimeBytes) !== modelTemplate.runtime_jar_ref.sha256) {
    fail('Recovery helper or Runtime JAR reference is invalid.');
  }

  const expectedBase = modelTemplate.model_base_inputs.find(value => value.scenario_id === baseScenarioId).base_revision_identity;
  if (jcs(materialization.base_revision_identity) !== jcs(expectedBase)) fail('Recovery base Revision identity is invalid.');
  await verifyProfileCopies({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, modelTemplate });
  await verifyDescriptors({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, gateFixture });
  await verifyMaterializedFiles({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization });
  if (gateFixture) await verifyGateCopy({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, gateFixture });
  else if (Object.hasOwn(materialization.source_refs, 'gate_fixture_ref') || Object.hasOwn(materialization.storage, 'gate_work_copy_ref')) fail('Recovery non-rollback materialization contains Gate data.');
  if (materializationBytes.length === 0) fail('Recovery materialization raw bytes are empty.');
}

async function verifyProfileCopies({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, modelTemplate }) {
  const expected = expectedCopiedProfileRefs(evidenceRoot, attemptRoot, finalAttemptRoot, modelTemplate.profile_source_refs);
  if (materialization.profile_assets.asset_root !== 'fixture/assets/packages/profiles'
      || materialization.profile_assets.package_digest !== modelTemplate.active_binding.profile.sha256
      || jcs(materialization.profile_assets.copied_refs) !== jcs(expected)) {
    fail('Recovery copied Profile assets are invalid.');
  }
  for (const [field] of PROFILE_ROLES) {
    const copied = await readFinalMappedReference(evidenceRoot, attemptRoot, finalAttemptRoot,
      materialization.profile_assets.copied_refs[field], 'Recovery copied Profile asset');
    const source = await readRawReference(evidenceRoot, modelTemplate.profile_source_refs[field],
      modelTemplate.profile_source_refs[field].kind, 'Recovery Profile source asset');
    if (!copied.equals(source)) fail('Recovery copied Profile asset bytes differ from source.');
  }
}

function expectedCopiedProfileRefs(evidenceRoot, attemptRoot, finalAttemptRoot, sourceRefs) {
  const result = {};
  for (const [field, kind] of PROFILE_ROLES) {
    const source = sourceRefs[field];
    const staged = resolve(attemptRoot, 'fixture/assets', source.path);
    const finalPath = relative(evidenceRoot, resolve(finalAttemptRoot, 'fixture/assets', source.path));
    result[field] = { kind, path: finalPath, byte_length: source.byte_length, sha256: source.sha256, _staged: staged };
    delete result[field]._staged;
  }
  return result;
}

async function verifyDescriptors({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, gateFixture }) {
  for (const [name, expectedKind] of [['asset_tree_ref', 'RECOVERY_ASSET_TREE_DESCRIPTOR'], ['input_tree_ref', 'RECOVERY_INPUT_TREE_DESCRIPTOR']]) {
    const reference = materialization.descriptors[name];
    if (reference.kind !== expectedKind) fail('Recovery descriptor reference kind is invalid.');
    const bytes = await readFinalMappedReference(evidenceRoot, attemptRoot, finalAttemptRoot, reference, 'Recovery descriptor');
    let descriptor;
    try { descriptor = JSON.parse(bytes.toString('utf8')); } catch { fail('Recovery descriptor is not valid JSON.'); }
    if (!validateTreeSchema(descriptor)) fail('Recovery Tree Descriptor Schema is invalid.');
    const preimage = { ...descriptor };
    delete preimage.descriptor_payload_sha256;
    if (digest(jcs(preimage)) !== descriptor.descriptor_payload_sha256 || digest(jcs(descriptor.entries)) !== descriptor.tree_sha256) {
      fail('Recovery Tree Descriptor digest is invalid.');
    }
    const expectedCount = name === 'asset_tree_ref' ? 5 : gateFixture ? 11 : 10;
    if (descriptor.entries.length !== expectedCount) fail('Recovery Tree Descriptor entry count is invalid.');
  }
  if (materialization.descriptors.input_tree_sha256 !== materialization.descriptors.input_tree_ref.sha256) {
    fail('Recovery input Tree Descriptor SHA is invalid.');
  }
}

async function verifyMaterializedFiles({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization }) {
  await readFinalMappedReference(evidenceRoot, attemptRoot, finalAttemptRoot, materialization.storage.project_db_ref, 'Recovery project database');
  const finalRelative = relative(evidenceRoot, finalAttemptRoot);
  const database = resolve(attemptRoot, materialization.storage.project_db_ref.path.slice(finalRelative.length + 1));
  for (const suffix of ['project.db-wal', 'project.db-shm', 'project.db-journal']) {
    if (await exists(resolve(database, '..', suffix))) fail('Recovery SQLite sidecar exists.');
  }
}

async function verifyGateCopy({ evidenceRoot, attemptRoot, finalAttemptRoot, materialization, gateFixture }) {
  if (jcs(materialization.source_refs.gate_fixture_ref) !== jcs(gateFixture.reference)) fail('Recovery Gate Fixture source ref is invalid.');
  const copied = await readFinalMappedReference(evidenceRoot, attemptRoot, finalAttemptRoot,
    materialization.storage.gate_work_copy_ref, 'Recovery Gate work copy');
  if (!copied.equals(gateFixture.bytes)) fail('Recovery Gate work copy differs from frozen input bytes.');
}

async function readFinalMappedReference(evidenceRoot, attemptRoot, finalAttemptRoot, reference, label) {
  requireReferenceShape(reference, label);
  const finalRelative = relative(evidenceRoot, finalAttemptRoot);
  if (!reference.path.startsWith(`${finalRelative}/`)) fail(`${label} reference does not target the final attempt root.`);
  const staged = resolve(attemptRoot, reference.path.slice(finalRelative.length + 1));
  await assertRegularFile(attemptRoot, staged, label);
  const bytes = await readFile(staged);
  if (bytes.length !== reference.byte_length || digest(bytes) !== reference.sha256) fail(`${label} raw reference differs from file bytes.`);
  return bytes;
}

function requireReferenceShape(reference, label) {
  if (!reference || typeof reference !== 'object' || !safePath(reference.path)
      || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 0 || !isDigest(reference.sha256)) {
    fail(`${label} reference is invalid.`);
  }
}

async function referenceAt(root, path, kind, label) {
  const absolute = resolveInside(root, path);
  await assertRegularFile(root, absolute, label);
  const bytes = await readFile(absolute);
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

async function fsyncFile(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function fsyncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function fsyncTree(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      await fsyncTree(path);
      await fsyncDirectory(path);
    } else if (entry.isFile()) {
      await fsyncFile(path);
    } else {
      fail('Recovery staging tree contains an unsupported entry.');
    }
  }
  await fsyncDirectory(root);
}

async function treeDigest(root) {
  const values = [];
  async function visit(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = resolve(current, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !(entry.isFile() || entry.isDirectory())) fail('Recovery attempt tree contains an unsafe entry.');
      if (entry.isDirectory()) await visit(path, relativePath);
      else {
        const bytes = await readFile(path);
        values.push({ path: relativePath, byte_length: bytes.length, sha256: digest(bytes) });
      }
    }
  }
  await visit(root, '');
  values.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  return digest(jcs(values));
}

async function removeStaging(staging, originalError) {
  if (!await exists(staging)) return;
  try {
    await rm(staging, { recursive: true, force: false });
  } catch {
    if (originalError instanceof RecoveryFixtureFactoryError) {
      throw new RecoveryFixtureFactoryError('Recovery staging cleanup failed.', 'RECOVERY_UNEXPECTED_RUNTIME_ERROR', 4);
    }
    throw originalError;
  }
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function fixtureFor(manifest, fixtureId) {
  const fixture = manifest.fixture_catalog.find(item => item.fixture_id === fixtureId);
  if (!fixture) fail('Recovery Manifest fixture catalog is incomplete.');
  return fixture;
}

async function loadImmutableTemplate(root, templateSourceRef, expectedFixtureId) {
  try {
    return await loadFrozenTemplate({ evidenceRoot: root, templateSourceRef, expectedFixtureId });
  } catch (error) {
    if (error instanceof RecoveryTemplateError) fail(error.message);
    throw error;
  }
}

function validateReadyTrust({ manifest, handoff, intake, frozen }) {
  if (handoff?.schema_id !== 'OPM-DEV-CANVAS-05-HANDOFF-001' || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06'
      || !handoff.active_binding || handoff.source_build?.source_commit !== manifest.source_build.source_commit) {
    fail('Recovery Handoff is not the required READY source.');
  }
  if (intake?.intake_status !== 'READY_FOR_RELEASE_VALIDATION' || !sameRawRef(intake.handoff_ref, manifest.handoff_ref)) {
    fail('Recovery Intake does not close the exact READY Handoff.');
  }
  if (frozen.fixture_id === 'RECOVERY-FIXTURE-GATE') return;
  const source = frozen.template.source_build_binding;
  if (!source || source.source_commit !== manifest.source_build.source_commit
      || !sameRef(source.handoff_ref, manifest.handoff_ref)
      || !sameRef(source.intake_report_ref, manifest.intake_report_ref)
      || !sameRef(source.runtime_jar_ref, manifest.source_build.local_runtime_jar)) {
    fail('Recovery Template source build binding differs from the Manifest trust chain.');
  }
}

function validateTemplateBinding({ template, manifest, handoff, intake }) {
  const binding = handoff.active_binding;
  const expected = {
    profile_id: binding.profile?.id,
    profile_version: binding.profile?.version,
    rule_set_id: binding.rule_set?.id,
    rule_version: binding.rule_set?.version,
    text_grammar_id: binding.text_grammar?.id,
    text_grammar_version: binding.text_grammar?.version,
    symbol_catalog_id: binding.symbol_catalog?.id,
    symbol_catalog_version: binding.symbol_catalog?.version,
    normalization_adapter_id: binding.normalization_adapter?.id,
    normalization_adapter_version: binding.normalization_adapter?.version,
    binding_digest: binding.binding_digest
  };
  if (template.fixture_id === 'RECOVERY-FIXTURE-MODEL') {
    if (jcs(template.profile_binding) !== jcs(expected) || template.source_date_epoch !== Date.parse(manifest.generated_at) / 1000) {
      fail('Recovery Model Template binding differs from the active Handoff.');
    }
    return;
  }
  if (template.handoff_identity?.handoff_id !== handoff.handoff_id || template.handoff_identity?.handoff_status !== handoff.handoff_status
      || template.handoff_identity?.source_commit !== manifest.source_build.source_commit
      || template.handoff_identity?.binding_digest !== binding.binding_digest
      || !sameRef(template.handoff_identity?.handoff_ref, manifest.handoff_ref)
      || template.intake_identity?.report_id !== intake.report_id || template.intake_identity?.intake_status !== intake.intake_status
      || !sameRef(template.intake_identity?.intake_report_ref, manifest.intake_report_ref)
      || template.source_date_epoch !== Date.parse(manifest.generated_at) / 1000) {
    fail('Recovery Gate Template binding differs from the active Handoff/Intake.');
  }
}

async function loadModelBaseInputs(root, template) {
  if (!Array.isArray(template.command_scenarios) || template.command_scenarios.length !== 4) {
    fail('Recovery Model Template does not contain four base scenarios.');
  }
  const inputs = [];
  for (const scenario of template.command_scenarios) {
    const revision = await readJsonReference(root, scenario.base_revision_ref, 'MS_REV_001_V02', 'Base Revision');
    const value = revision.value;
    const identity = {
      schema_id: value.schema_id,
      schema_version: value.schema_version,
      project_id: scenario.project_id,
      model_id: value.model_id,
      revision_id: value.revision_id,
      revision_sequence: value.revision_sequence,
      parent_revision_id: value.parent_revision_id,
      context_id: scenario.context_id,
      history_mode: 'SINGLE_REVISION_SNAPSHOT'
    };
    if (value.schema_id !== 'MS-REV-001' || value.schema_version !== '0.2'
        || value.model_id !== scenario.base_revision_identity?.model_id
        || value.revision_id !== scenario.base_revision_identity?.revision_id
        || value.revision_sequence !== scenario.base_revision_identity?.revision_sequence
        || scenario.context_id !== scenario.base_revision_identity?.context_id) {
      fail('Recovery base Revision identity differs from its Template scenario.');
    }
    inputs.push({ scenario_id: scenario.scenario_id, source_ref: scenario.base_revision_ref, base_revision_identity: identity });
  }
  return inputs;
}

async function loadProfileSourceRefs(root, binding) {
  const profileId = binding?.profile?.id;
  const version = binding?.profile?.version;
  if (!nonBlank(profileId) || !nonBlank(version)) fail('Recovery active Profile identity is invalid.');
  const profilePath = `packages/profiles/${profileId}/${version}/profile.json`;
  const profile = await readJsonAt(root, profilePath, 'Recovery Profile package');
  if (profile.value?.manifest?.package_digest?.algorithm !== 'sha256' || profile.value.manifest.package_digest.digest !== binding.profile.sha256) {
    fail('Recovery Profile package digest differs from the active Handoff binding.');
  }
  const entries = profile.value.manifest.entries;
  if (!Array.isArray(entries)) fail('Recovery Profile manifest is invalid.');
  const required = entries.filter(entry => entry?.required === true);
  if (required.length !== 4 || new Set(required.map(entry => entry.role)).size !== 4) fail('Recovery Profile manifest required role set is invalid.');

  const refs = { profile_ref: rawReference(profilePath, 'PROFILE_PACKAGE', profile.bytes) };
  for (const [field, kind, bindingField, role] of PROFILE_ROLES.slice(1)) {
    const entry = required.find(item => item.role === role);
    if (!entry || !safePath(entry.logical_path) || entry.digest?.algorithm !== 'sha256' || entry.digest.digest !== binding[bindingField]?.sha256) {
      fail('Recovery Profile manifest asset binding differs from the active Handoff.');
    }
    const path = `packages/profiles/${profileId}/${version}/${entry.logical_path}`;
    const asset = await readRawAt(root, path, `Recovery Profile ${bindingField}`);
    if (asset.bytes.length !== entry.byte_length || digest(asset.bytes) !== entry.digest.digest) fail('Recovery Profile asset raw bytes differ from its manifest entry.');
    refs[field] = rawReference(path, kind, asset.bytes);
  }
  const packagePreimage = [...required]
    .sort((left, right) => Buffer.compare(Buffer.from(left.logical_path, 'utf8'), Buffer.from(right.logical_path, 'utf8')))
    .map(entry => `${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`).join('');
  if (digest(Buffer.from(packagePreimage, 'utf8')) !== binding.profile.sha256) fail('Recovery Profile package digest is not reproducible.');
  return refs;
}

async function readJsonReference(root, reference, kind, label) {
  const bytes = await readRawReference(root, reference, kind, label);
  try {
    return { reference: { ...reference }, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(`${label} is not valid UTF-8 JSON.`);
  }
}

async function readJsonAt(root, path, label) {
  const result = await readRawAt(root, path, label);
  try {
    return { ...result, value: JSON.parse(result.bytes.toString('utf8')) };
  } catch {
    fail(`${label} is not valid UTF-8 JSON.`);
  }
}

async function readRawReference(root, reference, kind, label) {
  requireReference(reference, kind, label);
  const result = await readRawAt(root, reference.path, label);
  if (result.bytes.length !== reference.byte_length || digest(result.bytes) !== reference.sha256) fail(`${label} raw reference differs from evidence bytes.`);
  return result.bytes;
}

async function readRawAt(root, path, label) {
  const absolute = resolveInside(root, path);
  await assertRegularFile(root, absolute, label);
  return { path, bytes: await readFile(absolute) };
}

function rawReference(path, kind, bytes) {
  return { kind, path, byte_length: bytes.length, sha256: digest(bytes) };
}

function requireReference(reference, kind, label) {
  if (!reference || typeof reference !== 'object' || reference.kind !== kind || !safePath(reference.path)
      || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 0 || !isDigest(reference.sha256)) {
    fail(`${label} reference is invalid.`);
  }
}

async function assertDirectory(path, label) {
  let info;
  try { info = await lstat(path); } catch { fail(`${label} is missing.`); }
  if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} must be a non-symlink directory.`);
}

async function assertRegularFile(root, path, label) {
  const segments = relative(root, path).split('/');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    let info;
    try { info = await lstat(current); } catch { fail(`${label} is missing.`); }
    if (info.isSymbolicLink()) fail(`${label} must not traverse a symlink.`);
  }
  const info = await lstat(path);
  if (!info.isFile()) fail(`${label} must be a regular file.`);
}

function resolveInside(root, path) {
  if (!safePath(path)) fail('Recovery evidence path is unsafe.');
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}/`)) fail('Recovery evidence path escapes its root.');
  return absolute;
}

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..');
}

function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path
    && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function sameRawRef(left, right) {
  return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} field set is invalid.`);
  }
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function nonBlank(value) {
  return typeof value === 'string' && value.length > 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function fail(message) {
  throw new RecoveryFixtureFactoryError(message);
}
