import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import Ajv2020 from 'ajv/dist/2020.js';

import { E2eRunInputError, loadActiveAttemptManifest, parseRunOptions, resolveReportRoot, safeRelativePath, selectAttemptInputs } from './canvas06-e2e-run-input.mjs';
import { canonicalizeJcs } from './canvas06-rfc8785.mjs';
import {
  attemptRelativeRoot,
  createAttemptObservation,
  createBrowserEnvironment,
  createConsoleErrors,
  createNetworkObservation,
  createReopenObservation,
  createRuntimeProcess,
  createTransactionObservation,
  RELEASE_BROWSER_LAUNCH_ARGS,
  verifyFaultPlan,
  writeArtifactIndex,
  writeAttemptArtifact,
  writeFaultPlan
} from './canvas06-e2e-attempt-artifacts.mjs';
import { assertDirectory, copyRegularFile, copyTree, resolveInside, treeRef, verifyFileRef } from './canvas06-e2e-manifest-v01-support.mjs';
import { verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';
import { COMMON_DRIVER_SOURCE_PATH, rebaseCommonSetupPlanRefs, verifyCommonSetupPlan } from './canvas06-e2e-common-setup-plan.mjs';
import { preflightE2eRun } from './canvas06-e2e-run-preflight.mjs';
import { stageManifestInputs, stageRunnerSourceSet } from './canvas06-e2e-run-stage.mjs';
import { commitReportRoot } from './canvas06-e2e-run-transaction.mjs';
import { composeE2eReport, readE2eAttemptObservations, reportId } from './canvas06-e2e-run-report.mjs';
import { verifyE2eReportRoot } from './verify-canvas06-e2e-report.mjs';

const ATTEMPT_ORDINALS = Object.freeze([1, 2]);
const FAULT_CASE_IDS = new Set([
  'E2E-CANVAS-007.ASSET_MISSING',
  'E2E-CANVAS-007.PERSISTENCE_FAILED',
  'E2E-CANVAS-007.READONLY'
]);
const RUNTIME_LOG_MAX_BYTES = 1024 * 1024;
const FAMILY_VIEWPORTS = Object.freeze({
  'VP-1440X900': Object.freeze({ viewport_id: 'VP-1440X900', width: 1440, height: 900, device_scale_factor: 1 }),
  'VP-1280X800': Object.freeze({ viewport_id: 'VP-1280X800', width: 1280, height: 800, device_scale_factor: 1 }),
  'VP-390X844': Object.freeze({ viewport_id: 'VP-390X844', width: 390, height: 844, device_scale_factor: 1 })
});
const FAULT_DOMAIN = Buffer.from('OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001\0', 'ascii');
const FAMILY_CONTEXT_ENV = 'OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF';
const FAMILY_CONTEXT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json', import.meta.url), 'utf8'));
const ATTEMPT_ARTIFACT_SCHEMA = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json', import.meta.url), 'utf8'));
const familyContextAjv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validateFamilyContextSchema = familyContextAjv.compile(FAMILY_CONTEXT_SCHEMA);
const validateAttemptArtifactSchema = familyContextAjv.compile(ATTEMPT_ARTIFACT_SCHEMA);
const validateStateDigests = familyContextAjv.compile({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $ref: '#/$defs/stateDigests',
  $defs: ATTEMPT_ARTIFACT_SCHEMA.$defs
});
const validateTransactionSnapshotPair = familyContextAjv.compile({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['before', 'after'],
  properties: {
    before: { $ref: '#/$defs/countSnapshot' },
    after: { $ref: '#/$defs/countSnapshot' }
  },
  $defs: ATTEMPT_ARTIFACT_SCHEMA.$defs
});
const verifiedFamilyInvocationContexts = new WeakSet();
const verifiedExecutionToolchains = new WeakMap();

/** 活动 Runner 的唯一命令行入口；完整 194/388 调度由受控 Playwright bridge 执行。 */
export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseRunOptions(argv);
  const processControlParent = await assertProcessControlParent({
    parent: options['process-control-parent'],
    isolatedFrom: [options['source-root'], options['manifest-root'], options['profile-asset-root'], options['output-root']]
  });
  const paths = resolveReportRoot({
    outputRoot: options['output-root'],
    out: options.out,
    reportId: reportIdFromOutput(options.out)
  });
  const preflight = await (dependencies.preflight ?? preflightE2eRun)(options, dependencies.preflightDependencies ?? {});
  const finalRoot = await (dependencies.commitReportRoot ?? commitReportRoot)({
    outputRoot: paths.outputRoot,
    reportRoot: paths.reportRoot,
    write: stagingRoot => executeCliRun({ options, preflight, processControlParent, stagingRoot, dependencies })
  });
  const reportPath = resolve(finalRoot, 'dev-canvas-06-e2e-report.json');
  const bytes = await readFile(reportPath);
  return Object.freeze({ reportPath, sha256: sha256(bytes) });
}

async function executeCliRun({ options, preflight, processControlParent, stagingRoot, dependencies }) {
  const stagedManifest = await stageManifestInputs({
    manifestRoot: options['manifest-root'], stagingRoot, manifestName: options.manifest
  });
  const stagedRunner = await stageRunnerSourceSet({ sourceRoot: options['source-root'], stagingRoot });
  const expectedReportId = reportId(stagedManifest.manifestRef.sha256, stagedRunner.sourceSet.source_set_sha256);
  if (reportIdFromOutput(options.out) !== expectedReportId) {
    throw new E2eRunInputError('E2E_RUN_ARGUMENT_INVALID', 'out does not match the staged Manifest and Runner Source Set identity.', 2);
  }
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot: stagingRoot,
    manifest: stagedManifest.manifestRef.path,
    profileAssetRoot: resolve(stagingRoot, 'inputs/upstream/profile-assets')
  });
  if (!sameRef(manifestInput.manifestRef, stagedManifest.manifestRef)) {
    throw new E2eRunInputError('E2E_RUN_MANIFEST_INVALID', 'Staged Manifest raw reference drifted.', 3);
  }
  const controlParent = await mkdtemp(resolve(processControlParent, '.canvas06-e2e-control-'));
  try {
    const contextResult = await writeFamilyControlledInvocationContext({
      input_mode: options['input-mode'],
      source_root_realpath: resolve(options['source-root']),
      input_trust: await cliInputTrust({ options, preflight }),
      manifest_input: manifestInput,
      report_staging_root_realpath: stagingRoot,
      attempt_parent_realpath: stagingRoot,
      process_control_parent_realpath: controlParent,
      java_executable_ref: await absoluteExecutableRef(preflight.runtime.java_path, 'JAVA_EXECUTABLE'),
      browser_executable_ref: await absoluteExecutableRef(preflight.runtime.browser_path, 'BROWSER_EXECUTABLE'),
      runner_source_set_ref: stagedRunner.sourceSetRef,
      runner_source_set: stagedRunner.sourceSet,
      runtime_port: Number(options['runtime-port']),
      web_port: Number(options['web-port'])
    });
    await (dependencies.runPlaywright ?? runReleasePlaywright)({
      sourceRoot: preflight.source.root,
      contextRef: contextResult.ref,
      outputDir: resolve(controlParent, 'playwright-output')
    });
    const observations = await readE2eAttemptObservations({ reportRoot: stagingRoot, manifest: manifestInput.manifest });
    const report = composeE2eReport({
      manifest: manifestInput.manifest,
      observations,
      capabilities: preflight.capabilities,
      base: await buildReportBase({ stagingRoot, manifestInput, preflight, runnerSourceSet: stagedRunner })
    });
    await writeSyncedFile(resolve(stagingRoot, 'dev-canvas-06-e2e-report.json'), Buffer.from(`${canonicalizeJcs(report)}\n`, 'utf8'));
    await verifyE2eReportRoot({ reportRoot: stagingRoot, reportPath: resolve(stagingRoot, 'dev-canvas-06-e2e-report.json') });
  } finally {
    await rm(controlParent, { recursive: true, force: true });
    await assertProcessControlParent({ parent: processControlParent, isolatedFrom: [options['source-root'], options['manifest-root'], options['profile-asset-root'], options['output-root']] });
  }
}

export async function assertProcessControlParent({ parent, isolatedFrom }) {
  const root = resolve(parent);
  const details = await lstat(root).catch(() => null);
  if (!isAbsolute(parent) || !details || !details.isDirectory() || details.isSymbolicLink()) {
    throw new E2eRunInputError('E2E_RUN_ARGUMENT_INVALID', 'process-control-parent must be an existing non-symlink directory.', 2);
  }
  if (!Array.isArray(isolatedFrom) || isolatedFrom.some(candidate => rootsOverlap(root, resolve(candidate)))) {
    throw new E2eRunInputError('E2E_RUN_ARGUMENT_INVALID', 'process-control-parent must be isolated from Runner inputs and output.', 2);
  }
  if ((await readdir(root)).length !== 0) {
    throw new E2eRunInputError('E2E_RUN_ARGUMENT_INVALID', 'process-control-parent must be empty.', 2);
  }
  return root;
}

function rootsOverlap(left, right) {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  return leftToRight === '' || rightToLeft === ''
    || !leftToRight.startsWith(`..${sep}`) && leftToRight !== '..'
    || !rightToLeft.startsWith(`..${sep}`) && rightToLeft !== '..';
}

async function cliInputTrust({ options, preflight }) {
  if (options['input-mode'] === 'PRODUCTION_HANDOFF') {
    return deepFreeze({
      mode: 'PRODUCTION_HANDOFF', root_realpath: resolve(options['handoff-root']), primary_ref: preflight.trust.intake.ref
    });
  }
  const descriptorPath = resolve(options['controlled-bundle-root'], 'controlled-bundle.json');
  return deepFreeze({
    mode: 'CONTROLLED_TEST', root_realpath: resolve(options['controlled-bundle-root']),
    primary_ref: await relativeFileRef(resolve(options['controlled-bundle-root']), descriptorPath, 'CONTROLLED_BUNDLE_DESCRIPTOR')
  });
}

async function buildReportBase({ stagingRoot, manifestInput, preflight, runnerSourceSet }) {
  const firstCase = manifestInput.manifest.cases[0];
  const browser = await readJson(resolve(stagingRoot, attemptRelativeRoot(firstCase.case_id, 1), 'browser-environment.json'));
  const javaRoot = `inputs/runner/toolchain/java/${sha256(await readFile(preflight.runtime.java_path))}`;
  const java = {
    evidence_version: '0.1.0', major_version: 21,
    executable_basename: process.platform === 'win32' ? 'java.exe' : 'java',
    mirror_ref: await relativeFileRef(stagingRoot, resolve(stagingRoot, javaRoot, process.platform === 'win32' ? 'java.exe' : 'java'), 'E2E_JAVA_EXECUTABLE_MIRROR'),
    version_output_ref: await relativeFileRef(stagingRoot, resolve(stagingRoot, javaRoot, 'java-version.txt'), 'E2E_JAVA_VERSION_OUTPUT'),
    release_metadata_ref: await relativeFileRef(stagingRoot, resolve(stagingRoot, javaRoot, 'release'), 'E2E_JAVA_RELEASE_METADATA'),
    os_arch: `${process.platform}/${process.arch}`
  };
  java.image_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(java), 'utf8'));
  return deepFreeze({
    generated_at: new Date().toISOString(),
    runner_identity: {
      runner_version: '0.2.0', source_commit: preflight.source.source_commit,
      node_version: process.version, playwright_version: '1.57.0', chromium_version: browser.chromium_version,
      os: `${process.platform}-${process.arch}`, command: 'npm run release:canvas06:e2e:run -- <frozen-cli>',
      runner_source_sha256: runnerSourceSet.sourceSet.source_set_sha256,
      runner_source_set_ref: runnerSourceSet.sourceSetRef, java_executable: java
    },
    manifest_ref: manifestInput.manifestRef,
    intake_report_ref: manifestInput.manifest.intake_report_ref,
    handoff_ref: manifestInput.manifest.handoff_ref,
    upstream_source_build: manifestInput.manifest.upstream_source_build,
    source_build: manifestInput.manifest.source_build,
    environment: {
      environment_fingerprint: browser.environment_fingerprint, locale: browser.locale, timezone: browser.timezone,
      color_scheme: browser.color_scheme, reduced_motion: browser.reduced_motion, device_scale_factor: browser.viewport.device_scale_factor
    }
  });
}

export async function runReleasePlaywright({ sourceRoot, contextRef, outputDir }) {
  const cli = resolve(sourceRoot, 'node_modules/@playwright/test/cli.js');
  const config = resolve(sourceRoot, 'tests/e2e/release/dev-canvas-06/playwright.release.config.ts');
  const controlledOutputDir = resolve(outputDir);
  await assertExecutableInput(cli, 'E2E_RUN_ENVIRONMENT_INVALID');
  await assertAbsent(controlledOutputDir);
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (key.startsWith('OPM_CANVAS06_E2E_')) delete environment[key];
  environment[FAMILY_CONTEXT_ENV] = canonicalizeJcs(contextRef);
  environment.OPM_CANVAS06_E2E_PLAYWRIGHT_OUTPUT_DIR = controlledOutputDir;
  const child = spawn(process.execPath, [cli, 'test', '--config', config, 'tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts'], {
    cwd: sourceRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'], shell: false
  });
  const stdout = captureChildText(child.stdout);
  const stderr = captureChildText(child.stderr);
  const outcome = await new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('close', (code, signal) => resolveChild({ code, signal }));
  });
  const diagnostic = `${await stdout}\n${await stderr}`.replaceAll('\0', '').slice(0, 16 * 1024);
  await rm(controlledOutputDir, { recursive: true, force: true });
  await assertAbsent(controlledOutputDir);
  if (outcome.code !== 0 || outcome.signal !== null) {
    throw new E2eRunInputError('E2E_UNEXPECTED_RUNTIME_ERROR', `Controlled Playwright session did not complete the full schedule.\n${diagnostic}`, 3);
  }
}

function captureChildText(stream) {
  return new Promise(resolveText => {
    const chunks = [];
    let length = 0;
    stream?.on('data', chunk => {
      if (length >= 16 * 1024) return;
      const bytes = Buffer.from(chunk).subarray(0, 16 * 1024 - length);
      chunks.push(bytes);
      length += bytes.length;
    });
    stream?.once('end', () => resolveText(Buffer.concat(chunks).toString('utf8')));
    stream?.once('error', () => resolveText(Buffer.concat(chunks).toString('utf8')));
    if (!stream) resolveText('');
  });
}

function reportIdFromOutput(out) {
  const match = /^dev-canvas-06\/e2e\/reports\/(dev-canvas-06\.e2e-report\.[a-f0-9]{12}\.[a-f0-9]{12})\/dev-canvas-06-e2e-report\.json$/.exec(out ?? '');
  if (!match) throw new E2eRunInputError('E2E_RUN_ARGUMENT_INVALID', 'out must use the frozen Report path.', 2);
  return match[1];
}

function pathsParent(path) { return resolve(path, '..'); }

async function absoluteExecutableRef(path, kind) {
  const bytes = await readSingleLinkFile(path, 'E2E_RUN_ENVIRONMENT_INVALID');
  return Object.freeze({ kind, path: resolve(path), byte_length: bytes.length, sha256: sha256(bytes) });
}

async function relativeFileRef(root, path, kind) {
  const bytes = await readSingleLinkFile(path, 'E2E_RUN_OUTPUT_INVALID');
  const relativePath = relative(resolve(root), resolve(path)).split(sep).join('/');
  if (!safeRelativePath(relativePath)) throw new E2eRunInputError('E2E_RUN_OUTPUT_INVALID', 'Report raw reference escapes staging root.', 4);
  return Object.freeze({ kind, path: relativePath, byte_length: bytes.length, sha256: sha256(bytes) });
}

async function readJson(path) {
  try { return JSON.parse((await readSingleLinkFile(path, 'E2E_RUN_OUTPUT_INVALID')).toString('utf8')); }
  catch (error) { if (error instanceof E2eRunInputError) throw error; throw new E2eRunInputError('E2E_RUN_OUTPUT_INVALID', 'Expected one valid JSON artifact.', 4); }
}

async function assertExecutableInput(path, code) {
  const details = await lstat(path).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    throw new E2eRunInputError(code, 'Required executable input is unsafe.', 3);
  }
}

export async function writeFamilyControlledInvocationContext({
  input_mode,
  source_root_realpath,
  input_trust,
  manifest_input,
  report_staging_root_realpath,
  attempt_parent_realpath,
  process_control_parent_realpath,
  java_executable_ref,
  browser_executable_ref,
  runner_source_set_ref,
  runner_source_set,
  runtime_port,
  web_port
}) {
  const manifest = manifest_input?.manifest;
  if (!manifest || !Array.isArray(manifest.cases) || manifest.cases.length !== 194 || !manifest_input?.manifestRef) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Invocation Context requires one verified active Manifest.');
  }
  const sourceRoot = exactAbsolute(source_root_realpath, 'source_root_realpath');
  const manifestRoot = exactAbsolute(manifest_input.manifestRoot, 'manifest_root_realpath');
  const profileRoot = exactAbsolute(manifest_input.profileRoot, 'profile_asset_root_realpath');
  const reportRoot = exactAbsolute(report_staging_root_realpath, 'report_staging_root_realpath');
  const attemptParent = exactAbsolute(attempt_parent_realpath, 'attempt_parent_realpath');
  const controlParent = exactAbsolute(process_control_parent_realpath, 'process_control_parent_realpath');
  if (runtime_port === web_port || !validPort(runtime_port) || !validPort(web_port)) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Invocation Context ports are invalid.');
  }
  if (attemptParent !== reportRoot) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Attempt parent must be the exact Report staging root.');
  }
  assertIsolatedRoot(controlParent, [sourceRoot, manifestRoot, profileRoot, reportRoot]);
  await assertDirectory(controlParent, 'E2E_INVOCATION_CONTEXT_INVALID');

  const schedule = manifest.cases.flatMap((caseEntry, caseIndex) => [1, 2].map(attemptOrdinal => Object.freeze({
    ordinal: caseIndex * 2 + attemptOrdinal,
    case_ordinal: caseIndex + 1,
    case_id: caseEntry.case_id,
    suite_id: caseEntry.suite_id,
    driver_id: caseEntry.driver_id,
    expectation: caseEntry.expectation,
    attempt_ordinal: attemptOrdinal,
    viewport_id: caseEntry.viewport_id,
    zoom_id: caseEntry.zoom_id,
    attempt_root_realpath: resolve(reportRoot, attemptRelativeRoot(caseEntry.case_id, attemptOrdinal)),
    runtime_port,
    web_port
  })));
  const contextId = `dev-canvas-06.e2e-controlled-invocation.${manifest_input.manifestRef.sha256.slice(0, 12)}.${runner_source_set_ref?.sha256?.slice(0, 12)}`;
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-CONTROLLED-INVOCATION-CONTEXT-001',
    schema_version: '0.1',
    context_id: contextId,
    input_mode,
    source_root_realpath: sourceRoot,
    input_trust,
    manifest_root_realpath: manifestRoot,
    manifest_ref: manifest_input.manifestRef,
    profile_asset_root_realpath: profileRoot,
    profile_asset_tree_ref: manifest_input.profileAssetTreeRef,
    profile_asset_refs: manifest_input.profileAssetRefs,
    report_staging_root_realpath: reportRoot,
    attempt_parent_realpath: attemptParent,
    process_control_parent_realpath: controlParent,
    java_executable_ref,
    browser_executable_ref,
    runtime_jar_ref: manifest.source_build.local_runtime_jar,
    web_dist_ref: manifest.source_build.web_dist,
    runner_source_set_ref,
    driver_catalog: manifest.driver_catalog,
    runtime_port,
    web_port,
    execution_schedule: schedule
  };
  value.context_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(value), 'utf8'));
  const context = verifyFamilyControlledInvocationContext({ context: value, manifest, runner_source_set });
  const finalPath = resolve(controlParent, `${contextId}.json`);
  const temporaryPath = resolve(controlParent, `.${contextId}.json.tmp`);
  await stageExecutionToolchainEvidence({
    report_root: reportRoot,
    java_executable_ref,
    browser_executable_ref
  });
  try {
    await publishFamilyContext({ context, finalPath, temporaryPath, controlParent });
  } catch (error) {
    await rm(resolve(reportRoot, 'inputs/runner/toolchain'), { recursive: true, force: true });
    throw error;
  }
  const bytes = await readFile(finalPath);
  return deepFreeze({
    context,
    path: finalPath,
    ref: { kind: 'E2E_CONTROLLED_INVOCATION_CONTEXT', path: finalPath, byte_length: bytes.length, sha256: sha256(bytes) }
  });
}

export function verifyFamilyControlledInvocationContext({ context, manifest, runner_source_set }) {
  if (!validateFamilyContextSchema(context)) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Invocation Context does not satisfy Schema 0.1.');
  }
  const payload = withoutKey(context, 'context_payload_sha256');
  if (context.context_payload_sha256 !== sha256(Buffer.from(canonicalizeJcs(payload), 'utf8'))
      || context.runtime_port === context.web_port || context.execution_schedule.length !== 388) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Invocation Context payload identity is invalid.');
  }
  if (!plainObject(manifest) || manifest.schema_version !== '0.2' || manifest.manifest_version !== '0.2.0'
      || !Array.isArray(manifest.cases) || manifest.cases.length !== 194
      || !plainObject(runner_source_set) || runner_source_set.schema_version !== '0.2'
      || runner_source_set.source_set_version !== '0.2.0' || runner_source_set.entries?.length !== 24
      || context.context_id !== `dev-canvas-06.e2e-controlled-invocation.${context.manifest_ref.sha256.slice(0, 12)}.${context.runner_source_set_ref.sha256.slice(0, 12)}`) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Context does not join the active Manifest and Runner Source Set.');
  }
  if (!sameRef(context.runtime_jar_ref, manifest.source_build?.local_runtime_jar)
      || !sameRef(context.web_dist_ref, manifest.source_build?.web_dist)
      || !sameRef(context.profile_asset_tree_ref, manifest.profile_asset_tree_ref)
      || !sameRefArray(context.profile_asset_refs, manifest.profile_asset_refs)
      || canonicalizeJcs(context.driver_catalog) !== canonicalizeJcs(manifest.driver_catalog)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Context Manifest references drifted.');
  }
  if (context.input_trust.mode !== context.input_mode || context.input_trust.root_realpath !== resolve(context.input_trust.root_realpath)
      || context.source_root_realpath !== resolve(context.source_root_realpath)
      || context.manifest_root_realpath !== resolve(context.manifest_root_realpath)
      || context.profile_asset_root_realpath !== resolve(context.profile_asset_root_realpath)
      || context.report_staging_root_realpath !== resolve(context.report_staging_root_realpath)
      || context.attempt_parent_realpath !== context.report_staging_root_realpath
      || context.process_control_parent_realpath !== resolve(context.process_control_parent_realpath)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Context root identity is invalid.');
  }
  assertIsolatedRoot(context.process_control_parent_realpath, [context.source_root_realpath, context.manifest_root_realpath, context.profile_asset_root_realpath, context.report_staging_root_realpath]);
  for (const [caseIndex, caseEntry] of manifest.cases.entries()) {
    for (const attemptOrdinal of ATTEMPT_ORDINALS) {
      const item = context.execution_schedule[caseIndex * 2 + attemptOrdinal - 1];
      const expectedRoot = resolve(context.report_staging_root_realpath, attemptRelativeRoot(caseEntry.case_id, attemptOrdinal));
      if (item.ordinal !== caseIndex * 2 + attemptOrdinal || item.case_ordinal !== caseIndex + 1
          || item.case_id !== caseEntry.case_id || item.suite_id !== caseEntry.suite_id
          || item.driver_id !== caseEntry.driver_id || item.expectation !== caseEntry.expectation
          || item.attempt_ordinal !== attemptOrdinal || item.viewport_id !== caseEntry.viewport_id
          || item.zoom_id !== caseEntry.zoom_id || item.attempt_root_realpath !== expectedRoot
          || item.runtime_port !== context.runtime_port || item.web_port !== context.web_port) {
        contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Context schedule differs from Manifest original order.');
      }
    }
  }
  return deepFreeze(structuredClone(context));
}

async function stageExecutionToolchainEvidence({ report_root, java_executable_ref, browser_executable_ref }) {
  const reportRoot = resolve(report_root);
  const javaSource = await observeExecutableSource(java_executable_ref, 'JAVA_EXECUTABLE');
  const browserSource = await observeExecutableSource(browser_executable_ref, 'BROWSER_EXECUTABLE');
  const javaVersion = await observeJavaVersion(javaSource.path);
  const javaHome = resolve(dirname(javaSource.path), '..');
  const releasePath = resolve(javaHome, 'release');
  const releaseBytes = await readSingleLinkFile(releasePath, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
  const runnerRoot = resolve(reportRoot, 'inputs/runner');
  const finalRoot = resolve(runnerRoot, 'toolchain');
  const temporaryRoot = resolve(runnerRoot, `.toolchain.tmp-${randomBytes(8).toString('hex')}`);
  let published = false;
  try {
    await mkdir(runnerRoot, { recursive: true });
    await assertAbsent(finalRoot);
    await assertAbsent(temporaryRoot);
    await mkdir(temporaryRoot, { mode: 0o700 });
    const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
    const browserName = process.platform === 'win32' ? 'chromium.exe' : 'chromium';
    await writeSyncedFile(resolve(temporaryRoot, 'java', javaSource.sha256, javaName), javaSource.bytes);
    await writeSyncedFile(resolve(temporaryRoot, 'java', javaSource.sha256, 'java-version.txt'), javaVersion.stderr);
    await writeSyncedFile(resolve(temporaryRoot, 'java', javaSource.sha256, 'release'), releaseBytes);
    await writeSyncedFile(resolve(temporaryRoot, 'chromium', browserSource.sha256, browserName), browserSource.bytes);
    await rename(temporaryRoot, finalRoot);
    published = true;
    await fsyncDirectory(runnerRoot);
    const stagedContext = {
      report_staging_root_realpath: reportRoot,
      java_executable_ref,
      browser_executable_ref
    };
    return await verifyExecutionToolchainEvidence({ context: stagedContext });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    if (published) await rm(finalRoot, { recursive: true, force: true });
    throw new E2eRunInputError('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', error?.message ?? 'Toolchain evidence transaction failed.', 4);
  }
}

async function verifyExecutionToolchainEvidence({ context }) {
  const reportRoot = resolve(context.report_staging_root_realpath);
  const javaSource = await observeExecutableSource(context.java_executable_ref, 'JAVA_EXECUTABLE');
  const browserSource = await observeExecutableSource(context.browser_executable_ref, 'BROWSER_EXECUTABLE');
  const javaVersion = await observeJavaVersion(javaSource.path);
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const browserName = process.platform === 'win32' ? 'chromium.exe' : 'chromium';
  const javaRoot = `inputs/runner/toolchain/java/${javaSource.sha256}`;
  const browserRoot = `inputs/runner/toolchain/chromium/${browserSource.sha256}`;
  const javaMirror = await exactReportRef(reportRoot, `${javaRoot}/${javaName}`, 'E2E_JAVA_EXECUTABLE_MIRROR');
  const versionOutput = await exactReportRef(reportRoot, `${javaRoot}/java-version.txt`, 'E2E_JAVA_VERSION_OUTPUT');
  const releaseMetadata = await exactReportRef(reportRoot, `${javaRoot}/release`, 'E2E_JAVA_RELEASE_METADATA');
  const browserMirror = await exactReportRef(reportRoot, `${browserRoot}/${browserName}`, 'E2E_BROWSER_EXECUTABLE_MIRROR');
  const releaseSource = await readSingleLinkFile(resolve(dirname(javaSource.path), '..', 'release'), 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
  if (javaMirror.byte_length !== javaSource.bytes.length || javaMirror.sha256 !== javaSource.sha256
      || versionOutput.byte_length !== javaVersion.stderr.length || versionOutput.sha256 !== sha256(javaVersion.stderr)
      || releaseMetadata.byte_length !== releaseSource.length || releaseMetadata.sha256 !== sha256(releaseSource)
      || browserMirror.byte_length !== browserSource.bytes.length || browserMirror.sha256 !== browserSource.sha256) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Execution source and Report toolchain mirror bytes differ.', 3);
  }
  const javaImage = {
    evidence_version: '0.1.0',
    major_version: 21,
    executable_basename: javaName,
    mirror_ref: javaMirror,
    version_output_ref: versionOutput,
    release_metadata_ref: releaseMetadata,
    os_arch: `${process.platform}/${process.arch}`
  };
  javaImage.image_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(javaImage), 'utf8'));
  return deepFreeze({ java: javaImage, browser: { mirror_ref: browserMirror } });
}

async function observeExecutableSource(reference, expectedKind) {
  if (!plainObject(reference) || reference.kind !== expectedKind || !isAbsolute(reference.path)
      || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 0 || !isDigest(reference.sha256)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', `${expectedKind} ref is invalid.`, 3);
  }
  const details = await lstat(reference.path).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1 || process.platform !== 'win32' && (details.mode & 0o111) === 0) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', `${expectedKind} source is not one executable single-link file.`, 3);
  }
  const bytes = await readFile(reference.path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', `${expectedKind} source raw ref drifted.`, 3);
  }
  return Object.freeze({ path: resolve(reference.path), bytes, sha256: reference.sha256 });
}

async function observeJavaVersion(javaPath) {
  const child = spawn(javaPath, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const stdout = [];
  const stderr = [];
  let size = 0;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
    size += bytes.length;
    if (size <= 65536) (stream === child.stdout ? stdout : stderr).push(Buffer.from(bytes));
    else child.kill('SIGKILL');
  });
  const outcome = await new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('close', (code, signal) => resolveChild({ code, signal }));
  }).catch(error => contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', error?.message ?? 'java -version failed.', 3));
  const stdoutBytes = Buffer.concat(stdout);
  const stderrBytes = Buffer.concat(stderr);
  if (size > 65536 || outcome.code !== 0 || outcome.signal !== null || stdoutBytes.length !== 0
      || !/(?:openjdk|java) version "21(?:[."-])/u.test(stderrBytes.toString('utf8'))) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'java -version does not prove the frozen Java 21 identity.', 3);
  }
  return Object.freeze({ stderr: stderrBytes });
}

async function exactReportRef(reportRoot, relativePath, kind) {
  const path = resolve(reportRoot, relativePath);
  if (!inside(reportRoot, path)) contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Toolchain mirror path escapes Report root.', 3);
  const bytes = await readSingleLinkFile(path, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
  return Object.freeze({ kind, path: relativePath, byte_length: bytes.length, sha256: sha256(bytes) });
}

async function writeSyncedFile(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function loadFamilyControlledInvocationContextFromEnvironment(environment = process.env) {
  const keys = Object.keys(environment).filter(key => key.startsWith('OPM_CANVAS06_E2E_'));
  if (keys.length !== 1 || keys[0] !== FAMILY_CONTEXT_ENV) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Playwright child environment must contain only the controlled Context ref.');
  }
  let reference;
  try { reference = JSON.parse(environment[FAMILY_CONTEXT_ENV]); }
  catch { contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Context environment ref is invalid JSON.'); }
  if (!plainObject(reference) || Object.keys(reference).length !== 4 || reference.kind !== 'E2E_CONTROLLED_INVOCATION_CONTEXT'
      || !isAbsolute(reference.path) || !Number.isSafeInteger(reference.byte_length) || !isDigest(reference.sha256)) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Context environment ref is invalid.');
  }
  const bytes = await readSingleLinkFile(reference.path, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256 || bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Controlled Context raw bytes differ from environment ref.');
  }
  let context;
  try { context = JSON.parse(bytes.toString('utf8')); }
  catch { contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Controlled Context raw bytes are not JSON.'); }
  if (!bytes.equals(Buffer.from(`${canonicalizeJcs(context)}\n`, 'utf8'))) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Controlled Context raw bytes are not canonical.');
  }
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot: context.manifest_root_realpath,
    manifest: context.manifest_ref.path,
    profileAssetRoot: context.profile_asset_root_realpath
  }).catch(error => { throw asContextRefError(error); });
  if (!sameRef(manifestInput.manifestRef, context.manifest_ref)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Controlled Context Manifest raw ref drifted.');
  }
  const manifest = manifestInput.manifest;
  const runnerSourceSet = await readReferencedJson(context.report_staging_root_realpath, context.runner_source_set_ref, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
  const verified = verifyFamilyControlledInvocationContext({ context, manifest, runner_source_set: runnerSourceSet });
  await verifyFamilyInvocationInputTrust({ context: verified, manifestInput });
  await verifyRunnerOwnerBootstrap({ context: verified, runnerSourceSet });
  verifiedExecutionToolchains.set(verified, await verifyExecutionToolchainEvidence({ context: verified }));
  verifiedFamilyInvocationContexts.add(verified);
  return verified;
}

async function verifyFamilyInvocationInputTrust({ context, manifestInput }) {
  const trust = context.input_trust;
  if (context.input_mode === 'CONTROLLED_TEST') {
    let controlledBundle;
    try {
      controlledBundle = await verifyControlledInputBundle({ bundleRoot: trust.root_realpath, consumer: 'E2E' });
    } catch (error) {
      throw asContextRefError(error);
    }
    const descriptorBytes = await readSingleLinkFile(resolve(trust.root_realpath, 'controlled-bundle.json'), 'E2E_INVOCATION_CONTEXT_REF_MISMATCH');
    const descriptorRef = { kind: 'CONTROLLED_BUNDLE_DESCRIPTOR', path: 'controlled-bundle.json', byte_length: descriptorBytes.length, sha256: sha256(descriptorBytes) };
    if (!sameRef(trust.primary_ref, descriptorRef)) {
      contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Controlled bundle descriptor ref differs from Context trust.');
    }
    await assertControlledManifestTrust({ manifestInput, controlledBundle });
    return;
  }
  if (context.input_mode !== 'PRODUCTION_HANDOFF' || trust.mode !== 'PRODUCTION_HANDOFF'
      || !sameRawIdentity(trust.primary_ref, manifestInput.manifest.intake_report_ref)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Production Intake ref differs from Context trust.');
  }
  const local = await verifyFileRef({ root: manifestInput.manifestRoot, reference: manifestInput.manifest.intake_report_ref, code: 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' });
  const external = await verifyFileRef({ root: trust.root_realpath, reference: trust.primary_ref, code: 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' });
  if (!local.bytes.equals(external.bytes)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Production Intake bytes differ between Handoff and Manifest roots.');
  }
}

function asContextRefError(error) {
  return error instanceof E2eRunInputError && error.code.startsWith('E2E_INVOCATION_CONTEXT_')
    ? error
    : new E2eRunInputError('E2E_INVOCATION_CONTEXT_REF_MISMATCH', error?.message ?? 'Invocation Context trust verification failed.', 3);
}

export function verifyControlledDriverModuleExports({ module, driver_id, manifest }) {
  const definitions = {
    'DRIVER-PROCEDURAL': { family: 'PROC', suite_id: 'E2E-CANVAS-002', capability_prefix: 'CAP-ISO-PROC-', expected_case_count: 33 },
    'DRIVER-CONTROL': { family: 'CTRL', suite_id: 'E2E-CANVAS-003', capability_prefix: 'CAP-ISO-CTRL-', expected_case_count: 35 },
    'DRIVER-STRUCTURAL': { family: 'STRUCT', suite_id: 'E2E-CANVAS-004', capability_prefix: 'CAP-ISO-STRUCT-', expected_case_count: 110 }
  };
  if (!plainObject(manifest) || !Array.isArray(manifest.cases) || !plainObject(module)) {
    driverContractFail('Driver module verification requires one active Manifest and module namespace.');
  }
  const manifestCaseIds = manifest.cases.filter(item => item?.driver_id === driver_id).map(item => item.case_id);
  let caseIds;
  let executeCase;
  if (driver_id === 'DRIVER-COMMON') {
    if (!sameStringSet(Object.keys(module), ['COMMON_CASES', 'COMMON_DRIVER_ID', 'COMMON_DRIVER_VERSION', 'executeCase'])
        || module.COMMON_DRIVER_ID !== driver_id || module.COMMON_DRIVER_VERSION !== '0.2.0'
        || !plainObject(module.COMMON_CASES) || !deepFrozen(module.COMMON_CASES) || typeof module.executeCase !== 'function') {
      driverContractFail('Common Driver exports do not match the frozen four-export contract.');
    }
    caseIds = Object.keys(module.COMMON_CASES);
    executeCase = module.executeCase;
  } else {
    const definition = definitions[driver_id];
    const metadata = module.driver;
    if (!definition || !sameStringSet(Object.keys(module), ['case_ids', 'driver', 'executeCase'])
        || !plainObject(metadata) || !Object.isFrozen(metadata)
        || !sameStringSet(Object.keys(metadata), ['driver_id', 'driver_version', 'family', 'suite_id', 'capability_prefix', 'expected_case_count'])
        || metadata.driver_id !== driver_id || metadata.driver_version !== '0.1.0'
        || metadata.family !== definition.family || metadata.suite_id !== definition.suite_id
        || metadata.capability_prefix !== definition.capability_prefix || metadata.expected_case_count !== definition.expected_case_count
        || !Array.isArray(module.case_ids) || !Object.isFrozen(module.case_ids) || typeof module.executeCase !== 'function') {
      driverContractFail('Family Driver exports or metadata do not match the frozen contract.');
    }
    caseIds = module.case_ids;
    executeCase = module.executeCase;
  }
  if (caseIds.length !== manifestCaseIds.length || new Set(caseIds).size !== caseIds.length
      || caseIds.some((caseId, index) => typeof caseId !== 'string' || caseId !== manifestCaseIds[index])) {
    driverContractFail('Driver case_ids differ from the Manifest original-order subsequence.');
  }
  return deepFreeze({
    driver_id,
    case_ids: [...caseIds],
    execute_case: executeCase,
    ...(driver_id === 'DRIVER-COMMON' ? { common_cases: module.COMMON_CASES } : {})
  });
}

export async function loadControlledCommonSetupPlan({ invocation_context, manifest }) {
  if (!plainObject(invocation_context) || !plainObject(manifest)
      || invocation_context.manifest_root_realpath !== resolve(invocation_context.manifest_root_realpath)) {
    contextFail('E2E_COMMON_SETUP_PLAN_INVALID', 'Common Setup Plan loader inputs are invalid.');
  }
  const planRef = manifest.common_setup_plan_ref;
  if (!plainObject(planRef) || planRef.kind !== 'COMMON_SETUP_PLAN'
      || planRef.path !== 'inputs/common/dev-canvas-06-common-setup-plan.json') {
    contextFail('E2E_ORCHESTRATION_COMMON_SETUP_PLAN_MISSING', 'Manifest does not contain the frozen Common Setup Plan.');
  }
  const commonDriverRef = manifest.driver_catalog?.filter(item => item?.driver_id === 'DRIVER-COMMON');
  if (commonDriverRef?.length !== 1 || !manifest.common_fixture_catalog_ref) {
    contextFail('E2E_COMMON_SETUP_PLAN_REF_MISMATCH', 'Common Setup Plan upstream references are incomplete.', 3);
  }
  const [plan, catalog] = await Promise.all([
    readReferencedJson(invocation_context.manifest_root_realpath, planRef, 'E2E_COMMON_SETUP_PLAN_REF_MISMATCH'),
    readReferencedJson(invocation_context.manifest_root_realpath, manifest.common_fixture_catalog_ref, 'E2E_COMMON_SETUP_PLAN_REF_MISMATCH')
  ]);
  const catalogSourceRef = {
    ...manifest.common_fixture_catalog_ref,
    path: 'dev-canvas-06-common-fixture-catalog.json'
  };
  const driverSourceRef = {
    ...commonDriverRef[0].source_ref,
    path: COMMON_DRIVER_SOURCE_PATH
  };
  try {
    verifyCommonSetupPlan({
      plan,
      sourceBinding: catalog.source_binding,
      generatorRef: catalog.generator_ref,
      commonFixtureCatalogRef: catalogSourceRef,
      commonDriverRef: driverSourceRef,
      catalogCases: catalog.e2e_cases
    });
    rebaseCommonSetupPlanRefs({
      plan,
      manifestCatalogRef: manifest.common_fixture_catalog_ref,
      manifestCommonDriverRef: commonDriverRef[0].source_ref
    });
  } catch (error) {
    contextFail(error.code ?? 'E2E_COMMON_SETUP_PLAN_INVALID', error.message, error.exitCode ?? 2);
  }
  const commonManifestIds = manifest.cases?.filter(item => item?.driver_id === 'DRIVER-COMMON').map(item => item.case_id);
  if (!isDeepStrictEqual(plan.cases.map(item => item.case_id), commonManifestIds)) {
    contextFail('E2E_COMMON_SETUP_PLAN_REF_MISMATCH', 'Common Setup Plan case order differs from Manifest.', 3);
  }
  return deepFreeze(structuredClone(plan));
}

export async function buildControlledCaseExecutionCatalog({ invocation_context, manifest, common_cases, common_setup_plan }) {
  if (!plainObject(invocation_context) || !plainObject(manifest) || !plainObject(common_cases) || !plainObject(common_setup_plan)
      || invocation_context.manifest_root_realpath !== resolve(invocation_context.manifest_root_realpath)
      || manifest.schema_version !== '0.2' || manifest.manifest_version !== '0.2.0' || manifest.cases?.length !== 194) {
    caseExecutionFail('Controlled CaseExecution inputs are invalid.');
  }
  const root = invocation_context.manifest_root_realpath;
  const upstream = new Map(manifest.upstream_input_refs?.map(item => [item?.input_kind, item?.ref]) ?? []);
  const familyCatalogRef = manifest.fixture_refs?.find(item => item?.kind === 'FAMILY_FIXTURE_IDENTITY_CATALOG');
  const required = ['COVERAGE_CATALOG', 'GOLDEN_MANIFEST', 'GOLDEN_REPLAY_REPORT'];
  if (required.some(kind => !upstream.has(kind)) || !familyCatalogRef || !manifest.common_fixture_catalog_ref) {
    caseExecutionFail('Controlled CaseExecution catalog references are incomplete.');
  }
  const [coverage, golden, replay, familyCatalog, commonCatalog] = await Promise.all([
    readReferencedJson(root, upstream.get('COVERAGE_CATALOG'), 'E2E_INPUT_INVALID'),
    readReferencedJson(root, upstream.get('GOLDEN_MANIFEST'), 'E2E_INPUT_INVALID'),
    readReferencedJson(root, upstream.get('GOLDEN_REPLAY_REPORT'), 'E2E_INPUT_INVALID'),
    readReferencedJson(root, familyCatalogRef, 'E2E_INPUT_INVALID'),
    readReferencedJson(root, manifest.common_fixture_catalog_ref, 'E2E_INPUT_INVALID')
  ]);
  if (!Array.isArray(coverage.requirements) || !Array.isArray(golden.cases) || !Array.isArray(replay.cases)
      || !Array.isArray(familyCatalog.entries) || !Array.isArray(commonCatalog.e2e_cases)) {
    caseExecutionFail('Controlled CaseExecution catalog shapes are invalid.');
  }
  const executions = new Map();
  const setupCases = new Map(common_setup_plan.cases?.map(item => [item?.case_id, item]) ?? []);
  if (setupCases.size !== 16) caseExecutionFail('Common Setup Plan case set is incomplete.');
  for (const manifestCase of manifest.cases) {
    const execution = manifestCase.driver_id === 'DRIVER-COMMON'
      ? await buildCommonCaseExecution({ root, manifestCase, commonCatalog, commonCases: common_cases, setupCase: setupCases.get(manifestCase.case_id) })
      : await buildFamilyCaseExecution({ root, manifest, manifestCase, coverage, golden, replay, familyCatalog });
    if (executions.has(manifestCase.case_id)) caseExecutionFail('Manifest case identity is duplicated.');
    executions.set(manifestCase.case_id, execution);
  }
  if (executions.size !== 194) caseExecutionFail('Controlled CaseExecution count is invalid.');
  return Object.freeze(executions);
}

export async function loadControlledDriverModule({ invocation_context, manifest, runner_source_set, driver_id, driver_root, session_cache = new Map() }) {
  const paths = {
    'DRIVER-PROCEDURAL': ['procedural-driver.mjs', 'tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs'],
    'DRIVER-CONTROL': ['control-driver.mjs', 'tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs'],
    'DRIVER-STRUCTURAL': ['structural-driver.mjs', 'tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs'],
    'DRIVER-COMMON': ['common-driver.mjs', 'tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs']
  };
  const mapping = paths[driver_id];
  const manifestEntries = manifest?.driver_catalog?.filter(item => item?.driver_id === driver_id) ?? [];
  const sourceEntries = runner_source_set?.entries?.filter(item => item?.path === mapping?.[1]) ?? [];
  if (!mapping || manifestEntries.length !== 1 || sourceEntries.length !== 1 || !(session_cache instanceof Map)
      || !isAbsolute(driver_root) || driver_root !== resolve(driver_root)) driverContractFail('Driver loader inputs are invalid.');
  const [filename, sourcePath] = mapping;
  const manifestRef = manifestEntries[0].source_ref;
  const sourceSetRef = sourceEntries[0];
  if (manifestRef?.kind !== 'E2E_DRIVER_SOURCE' || manifestRef.path !== `inputs/drivers/${filename}`
      || manifestRef.byte_length !== sourceSetRef.byte_length || manifestRef.sha256 !== sourceSetRef.sha256) {
    driverContractFail('Driver Manifest and Source Set references differ.');
  }
  const actualPath = resolve(driver_root, filename);
  const manifestPath = resolve(invocation_context.manifest_root_realpath, manifestRef.path);
  const sourceOwnerPath = resolve(invocation_context.source_root_realpath, sourcePath);
  const mirrorPath = resolve(invocation_context.report_staging_root_realpath, 'inputs/runner', sourcePath);
  const [actual, manifestBytes, sourceOwner, mirror] = await Promise.all([
    readSingleLinkFile(actualPath, 'E2E_DRIVER_CONTRACT_INVALID'),
    readSingleLinkFile(manifestPath, 'E2E_DRIVER_CONTRACT_INVALID'),
    readSingleLinkFile(sourceOwnerPath, 'E2E_DRIVER_CONTRACT_INVALID'),
    readSingleLinkFile(mirrorPath, 'E2E_DRIVER_CONTRACT_INVALID')
  ]);
  if (![manifestBytes, sourceOwner, mirror].every(bytes => bytes.equals(actual))
      || actual.length !== manifestRef.byte_length || sha256(actual) !== manifestRef.sha256) {
    driverContractFail('Driver actual, Manifest, source owner, and Report mirror bytes differ.');
  }
  if (session_cache.has(manifestRef.sha256)) {
    const cached = session_cache.get(manifestRef.sha256);
    if (cached.driver_id !== driver_id) driverContractFail('Driver session SHA cache collides across identities.');
    return cached;
  }
  let module;
  try { module = await import(pathToFileURL(actualPath).href); }
  catch { driverContractFail('Driver exact file URL import failed.'); }
  const verified = verifyControlledDriverModuleExports({ module, driver_id, manifest });
  session_cache.set(manifestRef.sha256, verified);
  return verified;
}

export function bindFamilySetupAttemptIdentity({
  case_execution,
  materialized_identity,
  setup_exchange = null,
  setup_exchange_entry = null,
  pre_setup_projection = null,
  post_setup_projection = null
}) {
  verifyMaterializedAttemptIdentity(case_execution, materialized_identity);
  const driverId = case_execution.manifest_case.driver_id;
  if (driverId !== 'DRIVER-CONTROL') {
    if (setup_exchange !== null || setup_exchange_entry !== null || pre_setup_projection !== null || post_setup_projection !== null) {
      setupIdentityFail('Non-Control setup inputs must be explicit null.');
    }
    return deepFreeze({
      ...materialized_identity,
      setup_fact_id: null,
      subject_baseline_revision: materialized_identity.materialized_base_revision,
      setup_create_fact_exchange_ref: null
    });
  }

  const responseBody = setup_exchange?.response?.body;
  const responseRef = setup_exchange?.response?.body_ref;
  const requestBody = setup_exchange?.raw_request?.body;
  const committedRevision = responseBody?.meta?.committed_revision;
  const affectedIds = responseBody?.data?.affected_ids;
  if (!deepFrozen(setup_exchange) || !plainObject(setup_exchange_entry) || !plainObject(responseBody)
      || setup_exchange.response.status !== 200 || responseBody.meta?.status !== 'COMMITTED'
      || typeof committedRevision !== 'string' || !committedRevision || Object.hasOwn(responseBody.meta, 'revision')
      || !Array.isArray(affectedIds) || !isRawRef(responseRef, 'API_RESPONSE_BODY')) {
    setupIdentityFail('Control SETUP response is invalid.');
  }
  const expectedUrl = `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/contexts/${encodeURIComponent(materialized_identity.context_id)}/commands`;
  if (setup_exchange_entry.operation_id !== 'API-EDT-002' || setup_exchange_entry.method !== 'POST'
      || setup_exchange_entry.normalized_url !== expectedUrl || setup_exchange_entry.status !== 200
      || setup_exchange_entry.revision !== committedRevision || !sameRef(setup_exchange_entry.response_ref, responseRef)
      || !sameRef(setup_exchange_entry.request_ref, setup_exchange.raw_request.body_ref)
      || requestBody?.command_type !== 'CREATE_FACT' || requestBody?.base_revision !== materialized_identity.materialized_base_revision
      || Object.hasOwn(requestBody?.payload ?? {}, 'fact_id')) {
    setupEvidenceFail('Control SETUP API Exchange does not bind the command response.');
  }

  const pre = projectionSnapshot(pre_setup_projection, materialized_identity.materialized_base_revision);
  const post = projectionSnapshot(post_setup_projection, committedRevision);
  const expectedPreIds = new Set(case_execution.base_fixture.facts.map(fact => fact.fact_id));
  if (!sameStringSet([...pre.fact_ids], [...expectedPreIds])) setupIdentityFail('Pre-SETUP Projection differs from the materialized base fixture.');
  const newFactIds = [...post.fact_ids].filter(value => !pre.fact_ids.has(value));
  const candidates = [...new Set(affectedIds)].filter(value => newFactIds.includes(value));
  if (newFactIds.length !== 1 || candidates.length !== 1) setupIdentityFail('Control SETUP did not create one uniquely affected Fact.');
  const setupFactId = candidates[0];
  const construct = post.constructs.filter(item => item?.target_id === setupFactId);
  if (construct.length !== 1 || !sameSetupFactSemantics(construct[0], controlSetupBaseFact(case_execution))) {
    setupIdentityFail('Control SETUP Projection Fact semantics differ from the frozen base Fact.');
  }
  return deepFreeze({
    ...materialized_identity,
    setup_fact_id: setupFactId,
    subject_baseline_revision: committedRevision,
    setup_create_fact_exchange_ref: structuredClone(responseRef)
  });
}

export async function runFamilySetupAndBindIdentity({ page, family_sink, case_execution, materialized_identity }) {
  verifyMaterializedAttemptIdentity(case_execution, materialized_identity);
  if (!page || typeof page.evaluate !== 'function' || !family_sink?.api || typeof family_sink.api.waitForApi !== 'function'
      || typeof family_sink.bindAttemptIdentity !== 'function') {
    setupEvidenceFail('RUN_SETUP requires one attached Page and Family observation sink.');
  }
  if (case_execution.manifest_case.driver_id !== 'DRIVER-CONTROL') {
    const identity = bindFamilySetupAttemptIdentity({ case_execution, materialized_identity });
    family_sink.bindAttemptIdentity(identity);
    return identity;
  }

  const origin = pageOrigin(page);
  const projectionPath = revision => `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/contexts/${encodeURIComponent(materialized_identity.context_id)}/projection?${new URLSearchParams({ request_id: `e2e.setup.projection.${materialized_identity.attempt_ordinal}`, revision })}`;
  const preProjection = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: projectionPath(materialized_identity.materialized_base_revision), method: 'GET', body: null,
    expected: { operation_id: 'API-CTX-002', method: 'GET', expected_http_status: 200 } });

  const setupFact = controlSetupBaseFact(case_execution);
  const candidatePath = `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/contexts/${encodeURIComponent(materialized_identity.context_id)}/command-capabilities?${new URLSearchParams({ request_id: `e2e.setup.candidate.${materialized_identity.attempt_ordinal}`, revision: materialized_identity.materialized_base_revision })}`;
  const candidate = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: candidatePath, method: 'GET', body: null,
    expected: { operation_id: 'API-EDT-001', method: 'GET', expected_http_status: 200 } });
  const options = candidate.response?.body?.data?.options?.filter(option => option?.capability_ref?.capability_id === setupFact.capability_ref.capability_id) ?? [];
  const queryId = candidate.response?.body?.data?.capability_query_id;
  if (typeof queryId !== 'string' || !queryId || options.length !== 1 || typeof options[0].option_id !== 'string' || !options[0].option_id) {
    setupIdentityFail('Control SETUP candidate is not unique.');
  }
  const commandPath = familyCommandPath(materialized_identity);
  const commandBody = controlSetupCommand({ caseExecution: case_execution, identity: materialized_identity, fact: setupFact,
    capabilityQueryId: queryId, selectedOptionId: options[0].option_id });
  const setupExchange = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: commandPath, method: 'POST', body: commandBody,
    expected: { operation_id: 'API-EDT-002', method: 'POST', expected_http_status: 200 } });
  const committedRevision = setupExchange.response?.body?.meta?.committed_revision;
  if (typeof committedRevision !== 'string' || !committedRevision) setupIdentityFail('Control SETUP did not return committed_revision.');
  const postProjection = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: projectionPath(committedRevision), method: 'GET', body: null,
    expected: { operation_id: 'API-CTX-002', method: 'GET', expected_http_status: 200 } });
  const identity = bindFamilySetupAttemptIdentity({
    case_execution,
    materialized_identity,
    setup_exchange: setupExchange,
    setup_exchange_entry: setupExchange.exchange_entry,
    pre_setup_projection: preProjection,
    post_setup_projection: postProjection
  });
  family_sink.bindAttemptIdentity(identity);
  return identity;
}

export async function runCommonSetupAndBindIdentity({ page, family_sink, case_execution, materialized_identity, active_binding }) {
  verifyCommonMaterializedIdentity(case_execution, materialized_identity);
  if (!page || typeof page.evaluate !== 'function' || !family_sink?.api || typeof family_sink.api.waitForApi !== 'function'
      || typeof family_sink.bindCommonSetupBaseline !== 'function'
      || typeof family_sink.bindAttemptIdentity !== 'function' || !plainObject(active_binding)) {
    setupEvidenceFail('Common SETUP requires one attached Page, observation sink, and active binding.');
  }
  const origin = pageOrigin(page);
  let revision = materialized_identity.materialized_base_revision;
  let committedCount = 0;
  for (const [index, step] of case_execution.setup_steps.entries()) {
    if (step.step_kind === 'CAPABILITY_ASSERTION') {
      const candidate = await commonSetupCandidate({ page, sink: family_sink.api, origin, identity: materialized_identity, revision, step, index });
      if (typeof candidate.option.impact_token !== 'string'
          || candidate.option.impact_token.length < step.assertion.impact_token_min_length) {
        setupIdentityFail('Common SETUP delete assertion has no valid impact token.');
      }
      continue;
    }
    let payload = replaceContextPlaceholder(step.payload_template, materialized_identity.context_id);
    if (step.step_kind === 'CANDIDATE_COMMAND') {
      const candidate = await commonSetupCandidate({ page, sink: family_sink.api, origin, identity: materialized_identity, revision, step, index });
      payload = { ...payload, capability_query_id: candidate.query_id, selected_option_id: candidate.option.option_id };
    } else if (step.step_kind !== 'STATIC_COMMAND') {
      setupIdentityFail('Common SETUP step kind is unsupported.');
    }
    const commandBody = commonSetupCommand({ identity: materialized_identity, activeBinding: active_binding, revision, step, payload, index });
    const receipt = await sameOriginFetchAndCapture({
      page, sink: family_sink.api, origin, path: familyCommandPath(materialized_identity), method: 'POST', body: commandBody,
      expected: { operation_id: 'API-EDT-002', method: 'POST', expected_http_status: 200 }
    });
    const committed = receipt.response?.body?.meta?.committed_revision;
    if (receipt.response?.body?.meta?.status !== 'COMMITTED' || typeof committed !== 'string' || !committed
        || Object.hasOwn(receipt.response.body.meta, 'revision')) {
      setupIdentityFail('Common SETUP command did not return one committed_revision.');
    }
    revision = committed;
    committedCount += 1;
  }
  const expectedSource = committedCount === 0 ? 'MATERIALIZED_BASE_REVISION' : 'LAST_COMMITTED_REVISION';
  if (committedCount === 0 && case_execution.setup_steps.length !== 0
      || case_execution.expected_baseline?.subject_baseline_source !== expectedSource) {
    setupIdentityFail('Common SETUP baseline source is invalid.');
  }

  const queryPrefix = `e2e.common.setup.${materialized_identity.attempt_ordinal}`;
  const projectionPath = `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/contexts/${encodeURIComponent(materialized_identity.context_id)}/projection?${new URLSearchParams({ request_id: `${queryPrefix}.projection`, revision })}`;
  const textPath = `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/contexts/${encodeURIComponent(materialized_identity.context_id)}/text-projection?${new URLSearchParams({ request_id: `${queryPrefix}.text`, revision })}`;
  const revisionsPath = `/api/v1/projects/${encodeURIComponent(materialized_identity.project_id)}/models/${encodeURIComponent(materialized_identity.model_id)}/revisions?${new URLSearchParams({ request_id: `${queryPrefix}.revisions` })}`;
  const projection = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: projectionPath, method: 'GET', body: null,
    expected: { operation_id: 'API-CTX-002', method: 'GET', expected_http_status: 200 } });
  const text = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: textPath, method: 'GET', body: null,
    expected: { operation_id: 'API-TXT-001', method: 'GET', expected_http_status: 200 } });
  const revisions = await sameOriginFetchAndCapture({ page, sink: family_sink.api, origin, path: revisionsPath, method: 'GET', body: null,
    expected: { operation_id: 'API-VER-001', method: 'GET', expected_http_status: 200 } });
  verifyCommonSetupObservations({ caseExecution: case_execution, revision, projection, text, revisions });
  if (family_sink.exchanges.length < case_execution.expected_baseline.minimum_api_exchange_count) {
    setupEvidenceFail('Common SETUP API exchange count is below the frozen minimum.');
  }
  const identity = deepFreeze({
    ...materialized_identity,
    setup_fact_id: null,
    subject_baseline_revision: revision,
    setup_create_fact_exchange_ref: null
  });
  const setupBaseline = deepFreeze({
    active_binding: reducedBinding(active_binding),
    subject_transaction_baseline_revision: revision
  });
  family_sink.bindCommonSetupBaseline(setupBaseline);
  family_sink.bindAttemptIdentity(identity);
  return deepFreeze({
    attempt_identity: identity,
    setup_baseline: setupBaseline,
    projection_exchange_ref: projection.exchange_ref,
    text_exchange_ref: text.exchange_ref,
    revision_list_exchange_ref: revisions.exchange_ref
  });
}

async function commonSetupCandidate({ page, sink, origin, identity, revision, step, index }) {
  const request = step.candidate_request;
  const parameters = new URLSearchParams({ request_id: `e2e.common.setup.candidate.${identity.attempt_ordinal}.${index + 1}`, revision, intent: request.intent });
  if (request.selection_id !== null) parameters.set('selection_id', request.selection_id);
  for (const endpoint of request.endpoints) parameters.append('endpoint', endpoint);
  const path = `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/command-capabilities?${parameters}`;
  const receipt = await sameOriginFetchAndCapture({ page, sink, origin, path, method: 'GET', body: null,
    expected: { operation_id: 'API-EDT-001', method: 'GET', expected_http_status: 200 } });
  const data = receipt.response?.body?.data;
  const matches = data?.options?.filter(option => commonOptionMatches({ option, data, step, revision })) ?? [];
  if (typeof data?.capability_query_id !== 'string' || !data.capability_query_id || matches.length !== 1) {
    setupIdentityFail('Common SETUP candidate option is not unique.');
  }
  return { query_id: data.capability_query_id, option: matches[0], receipt };
}

function commonOptionMatches({ option, data, step, revision }) {
  const selector = step.option_selector;
  if (!plainObject(option) || option.command_type !== selector.command_type
      || option.capability_ref?.capability_id !== selector.capability_id || option.enabled !== true
      || option.capability_query_id !== data.capability_query_id || option.expires_with_revision !== revision) return false;
  if (selector.command_type === 'CREATE_STATE') {
    return step.candidate_request.selection_id === selector.target_ids[0]
      && step.payload_template.owner_ref.target_kind === selector.owner_target_kind
      && step.payload_template.owner_ref.target_id === selector.target_ids[0];
  }
  if (selector.command_type === 'DELETE_CONSTRUCT') {
    return step.candidate_request.selection_id === selector.target_ids[0] && selector.requires_impact_token === true;
  }
  const actualTargets = option.normalized_endpoints?.map(endpoint => endpoint?.target_ref?.target_id);
  return selector.fact_family === step.payload_template.fact_family
    && isDeepStrictEqual(actualTargets, selector.target_ids)
    && canonicalizeJcs(option.normalized_endpoints) === canonicalizeJcs(step.payload_template.normalized_endpoints);
}

function commonSetupCommand({ identity, activeBinding, revision, step, payload, index }) {
  return {
    request_id: `e2e.common.setup.request.${identity.case_id}.${identity.attempt_ordinal}.${index + 1}`,
    command_id: `e2e.common.setup.command.${identity.case_id}.${identity.attempt_ordinal}.${index + 1}`,
    base_revision: revision,
    binding: reducedBinding(activeBinding),
    command_type: step.command_type,
    payload
  };
}

function verifyCommonSetupObservations({ caseExecution, revision, projection, text, revisions }) {
  const projectionBody = projection.response?.body;
  const textBody = text.response?.body;
  const revisionBody = revisions.response?.body;
  if (projectionBody?.meta?.read_revision !== revision || textBody?.meta?.read_revision !== revision
      || !Array.isArray(projectionBody?.data?.constructs) || !Array.isArray(projectionBody?.data?.suppressed_states)
      || !Array.isArray(textBody?.data?.sentences) || !Array.isArray(textBody?.data?.traces)
      || !Array.isArray(revisionBody?.data) || !revisionBody.data.some(item => item?.revision_id === revision)) {
    setupEvidenceFail('Common SETUP final Projection/Text/Revision observations are incomplete.');
  }
  const observedConstructs = new Set([
    ...projectionBody.data.constructs.map(item => item?.target_id),
    ...projectionBody.data.suppressed_states.map(item => item?.state_id)
  ]);
  if (observedConstructs.has(undefined)
      || !sameStringSet([...observedConstructs], caseExecution.expected_baseline.construct_ids)) {
    setupIdentityFail('Common SETUP final construct identity differs from the Plan.');
  }
  const observedFactIds = new Set(projectionBody.data.constructs
    .filter(item => ['PROCEDURAL_LINK', 'STRUCTURAL_LINK'].includes(item?.construct_role))
    .map(item => item.target_id));
  if (!sameStringSet([...observedFactIds], caseExecution.expected_baseline.fact_ids)) {
    setupIdentityFail('Common SETUP final Fact identity differs from the Plan.');
  }
  const tracedFactIds = new Set(textBody.data.traces.flatMap(item => item?.fact_ids ?? []));
  if (!sameStringSet([...tracedFactIds], caseExecution.expected_baseline.fact_ids)
      || caseExecution.expected_baseline.fact_ids.length === 0 && textBody.data.sentences.length !== 0
      || caseExecution.expected_baseline.fact_ids.length > 0 && textBody.data.sentences.length === 0) {
    setupEvidenceFail('Common SETUP final OPL/Trace semantics differ from the Plan.');
  }
}

function verifyCommonMaterializedIdentity(caseExecution, identity) {
  const keys = ['case_id', 'attempt_ordinal', 'project_id', 'model_id', 'context_id', 'materialized_base_revision'];
  if (!deepFrozen(caseExecution) || !deepFrozen(identity) || !sameStringSet(Object.keys(identity ?? {}), keys)
      || identity.case_id !== caseExecution.case_id || !ATTEMPT_ORDINALS.includes(identity.attempt_ordinal)
      || keys.slice(2).some(key => typeof identity[key] !== 'string' || !identity[key])) {
    setupIdentityFail('Materialized Common attempt identity is invalid.');
  }
}

function replaceContextPlaceholder(value, contextId) {
  if (value === '$CONTEXT_ID') return contextId;
  if (Array.isArray(value)) return value.map(item => replaceContextPlaceholder(item, contextId));
  if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceContextPlaceholder(child, contextId)]));
  return value;
}

function reducedBinding(binding) {
  return {
    profile_id: binding.profile.id,
    profile_version: binding.profile.version,
    rule_set_id: binding.rule_set.id,
    rule_version: binding.rule_set.version
  };
}

async function sameOriginFetchAndCapture({ page, sink, origin, path, method, body, expected }) {
  const bodyText = body === null ? null : canonicalizeJcs(body);
  let result;
  try {
    result = await page.evaluate(async input => {
      const response = await fetch(input.path, {
        method: input.method,
        headers: input.body === null ? undefined : { 'content-type': 'application/json' },
        body: input.body,
        redirect: 'manual'
      });
      await response.arrayBuffer();
      return { status: response.status, url: response.url, redirected: response.redirected };
    }, { path, method, body: bodyText });
  } catch (error) {
    setupEvidenceFail(error?.message ?? 'RUN_SETUP same-origin fetch failed.');
  }
  const receipt = await sink.waitForApi(expected);
  if (result?.redirected || result?.url !== `${origin}${path}` || result?.status !== expected.expected_http_status
      || receipt?.actual_request?.method !== method || receipt?.actual_request?.normalized_url !== path
      || receipt?.response?.status !== expected.expected_http_status || !receipt.exchange_ref || !receipt.exchange_entry) {
    setupEvidenceFail('RUN_SETUP fetch and API Exchange receipt differ.');
  }
  return receipt;
}

function controlSetupCommand({ caseExecution, identity, fact, capabilityQueryId, selectedOptionId }) {
  const binding = caseExecution.input_fixture.profile_binding;
  return {
    request_id: `e2e.setup.request.${identity.case_id}.${identity.attempt_ordinal}`,
    command_id: `e2e.setup.command.${identity.case_id}.${identity.attempt_ordinal}`,
    base_revision: identity.materialized_base_revision,
    binding: { profile_id: binding.profile.id, profile_version: binding.profile.version, rule_set_id: binding.rule_set.id, rule_version: binding.rule_set.version },
    command_type: 'CREATE_FACT',
    payload: {
      context_id: identity.context_id,
      capability_ref: { capability_id: fact.capability_ref.capability_id, ...(fact.capability_ref.version ? { version: fact.capability_ref.version } : {}) },
      fact_family: fact.fact_family,
      normalized_endpoints: [...fact.endpoints].sort((left, right) => left.ordinal - right.ordinal).map(endpoint => ({
        role: endpoint.role,
        target_ref: { target_kind: endpoint.target_kind, target_id: endpoint.target_id },
        ordinal: endpoint.ordinal,
        ...(endpoint.state_qualification ? { state_qualification: endpoint.state_qualification } : {})
      })),
      direction: fact.direction,
      labels: fact.labels ?? [],
      modifiers: fact.modifiers ?? [],
      ...(fact.condition ? { condition: fact.condition } : {}),
      logical_groups: fact.logical_groups ?? [],
      ...(fact.collection_completeness ? { collection_completeness: fact.collection_completeness } : {}),
      occurrence: { ownership: 'OWNED', construct_role: 'PROCEDURAL_LINK' },
      layout: {},
      capability_query_id: capabilityQueryId,
      selected_option_id: selectedOptionId
    }
  };
}

function pageOrigin(page) {
  try {
    const value = new URL(page.url());
    if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || !value.port) throw new Error();
    return value.origin;
  } catch {
    setupEvidenceFail('RUN_SETUP Page origin is invalid.');
  }
}

function verifyMaterializedAttemptIdentity(caseExecution, identity) {
  const keys = ['case_id', 'attempt_ordinal', 'project_id', 'model_id', 'context_id', 'materialized_base_revision'];
  if (!deepFrozen(caseExecution) || !deepFrozen(identity) || !sameStringSet(Object.keys(identity ?? {}), keys)
      || identity.case_id !== caseExecution?.manifest_case?.case_id || !ATTEMPT_ORDINALS.includes(identity.attempt_ordinal)
      || identity.project_id !== caseExecution.family_identity?.project_id || identity.model_id !== caseExecution.family_identity?.model_id
      || identity.context_id !== caseExecution.family_identity?.context_id || identity.materialized_base_revision !== caseExecution.family_identity?.base_revision) {
    setupIdentityFail('Materialized Family attempt identity is invalid.');
  }
}

function projectionSnapshot(value, revision) {
  const body = value?.response?.body ?? value;
  const readRevision = body?.meta?.read_revision;
  const constructs = body?.data?.constructs;
  if (!plainObject(body) || readRevision !== revision || !Array.isArray(constructs)) setupEvidenceFail('SETUP Projection response is invalid.');
  const factConstructs = constructs.filter(item => ['PROCEDURAL_LINK', 'STRUCTURAL_LINK'].includes(item?.construct_role));
  if (factConstructs.some(item => typeof item.target_id !== 'string') || new Set(factConstructs.map(item => item.target_id)).size !== factConstructs.length) {
    setupEvidenceFail('SETUP Projection Fact identity is duplicated or missing.');
  }
  return { constructs: factConstructs, fact_ids: new Set(factConstructs.map(item => item.target_id)) };
}

function controlSetupBaseFact(caseExecution) {
  const current = caseExecution.input_fixture.facts[0];
  const source = current.fact_family === 'CONTROL' ? caseExecution.companion_pass_input_fixture.facts[0] : current;
  return { ...source, modifiers: (source.modifiers ?? []).filter(item => !item.modifier_id.startsWith('control.')) };
}

function sameSetupFactSemantics(construct, fact) {
  const endpoints = (construct.endpoints ?? []).map(item => ({ role: item.role, target_kind: item.target_kind, target_id: item.target_id, ordinal: item.ordinal }));
  const expectedEndpoints = fact.endpoints.map(item => ({ role: item.role, target_kind: item.target_kind, target_id: item.target_id, ordinal: item.ordinal }));
  return construct.construct_role === 'PROCEDURAL_LINK'
    && construct.capability_id === fact.capability_ref.capability_id
    && construct.direction === fact.direction
    && canonicalizeJcs(endpoints) === canonicalizeJcs(expectedEndpoints)
    && canonicalizeJcs(construct.modifiers ?? []) === canonicalizeJcs(fact.modifiers ?? [])
    && canonicalizeJcs(construct.labels ?? []) === canonicalizeJcs(fact.labels ?? [])
    && (construct.collection_completeness ?? null) === (fact.collection_completeness ?? null);
}

function isRawRef(value, kind) {
  return plainObject(value) && Object.keys(value).length === 4 && value.kind === kind && safeRelativePath(value.path)
    && Number.isSafeInteger(value.byte_length) && isDigest(value.sha256);
}

function setupIdentityFail(message) { throw new E2eRunInputError('E2E_FAMILY_SETUP_IDENTITY_INVALID', message, 2); }
function setupEvidenceFail(message) { throw new E2eRunInputError('E2E_FAMILY_SETUP_EVIDENCE_INVALID', message, 4); }

async function buildFamilyCaseExecution({ root, manifest, manifestCase, coverage, golden, replay, familyCatalog }) {
  const mapping = {
    'DRIVER-PROCEDURAL': { family: 'PROC', suite: 'E2E-CANVAS-002', mode: expectation => expectation === 'PASS' ? 'UI_CREATE_FACT' : 'API_NEGATIVE_CREATE_FACT' },
    'DRIVER-CONTROL': { family: 'CTRL', suite: 'E2E-CANVAS-003', mode: (expectation, caseId) => expectation === 'PASS' ? 'UI_UPDATE_CONTROL' : caseId === 'G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED' ? 'API_NEGATIVE_CREATE_FACT' : 'API_NEGATIVE_UPDATE_FACT' },
    'DRIVER-STRUCTURAL': { family: 'STRUCT', suite: 'E2E-CANVAS-004', mode: expectation => expectation === 'PASS' ? 'UI_CREATE_FACT' : 'API_NEGATIVE_CREATE_FACT' }
  };
  const family = mapping[manifestCase.driver_id];
  const coverageRequirement = uniqueBy(coverage.requirements, 'case_id', manifestCase.case_id);
  const goldenCase = uniqueBy(golden.cases, 'case_id', manifestCase.case_id);
  const replayCase = uniqueBy(replay.cases, 'case_id', manifestCase.case_id);
  if (!family || manifestCase.suite_id !== family.suite || coverageRequirement.family !== family.family
      || coverageRequirement.capability_id !== manifestCase.capability_id || coverageRequirement.coverage_key !== manifestCase.coverage_key
      || coverageRequirement.expectation !== manifestCase.expectation || goldenCase.capability_id !== manifestCase.capability_id
      || goldenCase.expectation !== manifestCase.expectation || replayCase.expectation !== manifestCase.expectation) {
    caseExecutionFail(`Family case ${manifestCase.case_id} catalog join is invalid.`);
  }
  const baseFixture = await readReferencedJson(root, manifestCase.fixture_ref, 'E2E_INPUT_INVALID');
  const inputFixture = await readReferencedJson(root, manifestCase.input_ref, 'E2E_INPUT_INVALID');
  const identity = uniqueBy(familyCatalog.entries, 'fixture_sha256', manifestCase.fixture_ref.sha256);
  verifyFamilyFixturePair({ manifestCase, goldenCase, baseFixture, inputFixture, identity });
  verifyReplayCase({ manifestCase, replayCase });

  const companionRequirement = coverage.requirements.find(item => item?.family === family.family
    && item?.capability_id === manifestCase.capability_id && item?.expectation === 'PASS');
  if (!companionRequirement) caseExecutionFail(`Family case ${manifestCase.case_id} has no companion PASS requirement.`);
  const companionGoldenCase = uniqueBy(golden.cases, 'case_id', companionRequirement.case_id);
  const companionManifestCase = uniqueBy(manifest.cases, 'case_id', companionRequirement.case_id);
  const companionInputFixture = manifestCase.expectation === 'PASS'
    ? inputFixture
    : await readReferencedJson(root, companionManifestCase.input_ref, 'E2E_INPUT_INVALID');
  if (companionManifestCase.expectation !== 'PASS' || companionManifestCase.driver_id !== manifestCase.driver_id
      || companionManifestCase.capability_id !== manifestCase.capability_id || companionGoldenCase.case_id !== companionRequirement.case_id
      || companionGoldenCase.input_revision_fixture !== companionManifestCase.input_ref.archive_entry_path?.replace(/^.*\/golden\//u, 'golden/')
      || !Array.isArray(companionInputFixture.facts) || companionInputFixture.facts.length !== 1) {
    caseExecutionFail(`Family case ${manifestCase.case_id} companion PASS join is invalid.`);
  }
  const expectedError = expectedFamilyError(replayCase.attempts[0]?.error_code, manifestCase.expectation);
  const commandType = manifestCase.driver_id === 'DRIVER-CONTROL' && manifestCase.case_id !== 'G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED'
    ? 'UPDATE_FACT' : 'CREATE_FACT';
  return deepFreeze({
    manifest_case: structuredClone(manifestCase), coverage_requirement: structuredClone(coverageRequirement),
    golden_case: structuredClone(goldenCase), replay_case: structuredClone(replayCase), family_identity: structuredClone(identity),
    base_fixture: baseFixture, input_fixture: inputFixture, companion_pass_requirement: structuredClone(companionRequirement),
    companion_pass_golden_case: structuredClone(companionGoldenCase), companion_pass_input_fixture: companionInputFixture,
    execution_mode: family.mode(manifestCase.expectation, manifestCase.case_id),
    expected_api: { operation_id: 'API-EDT-002', method: 'POST', ordinal: 1, command_type: commandType,
      expected_http_status: expectedError?.http_status ?? 200, expected_error_code: expectedError?.top_error_code ?? null },
    expected_error: expectedError
  });
}

async function buildCommonCaseExecution({ root, manifestCase, commonCatalog, commonCases, setupCase }) {
  const catalogCase = uniqueBy(commonCatalog.e2e_cases, 'case_id', manifestCase.case_id);
  const driverCase = commonCases[manifestCase.case_id];
  if (!driverCase || !setupCase || setupCase.case_id !== manifestCase.case_id || setupCase.initial_state !== driverCase.initial_state
      || !Array.isArray(setupCase.setup_steps)
      || setupCase.initial_state === 'M0' && setupCase.setup_steps.length !== 0
      || setupCase.initial_state !== 'M0' && setupCase.setup_steps.length === 0
      || manifestCase.suite_id !== manifestCase.case_id.slice(0, 'E2E-CANVAS-000'.length)
      || catalogCase.base_fixture_ref.sha256 !== manifestCase.fixture_ref.sha256
      || catalogCase.base_fixture_ref.byte_length !== manifestCase.fixture_ref.byte_length
      || catalogCase.input_ref.sha256 !== manifestCase.input_ref.sha256
      || catalogCase.input_ref.byte_length !== manifestCase.input_ref.byte_length
      || canonicalizeJcs(catalogCase.actions?.[0]?.expected_transaction) !== canonicalizeJcs(manifestCase.expected_transaction)) {
    caseExecutionFail(`Common case ${manifestCase.case_id} join is invalid.`);
  }
  const [baseFixture, inputFixture] = await Promise.all([
    readReferencedJson(root, manifestCase.fixture_ref, 'E2E_INPUT_INVALID'),
    readReferencedJson(root, manifestCase.input_ref, 'E2E_INPUT_INVALID')
  ]);
  return deepFreeze({
    case_id: manifestCase.case_id,
    manifest_case: structuredClone(manifestCase), common_catalog_case: structuredClone(catalogCase),
    base_fixture: baseFixture, input_fixture: inputFixture,
    initial_state: setupCase.initial_state, setup_steps: structuredClone(setupCase.setup_steps),
    expected_baseline: structuredClone(setupCase.expected_baseline),
    subject_steps: structuredClone(driverCase.subject_steps), expected_apis: structuredClone(driverCase.expected_apis),
    expected_transaction: driverCase.expected_transaction, reopen_assertion: driverCase.reopen_assertion,
    expected_error: driverCase.expected_apis.at(-1).expected_error_code
  });
}

function verifyFamilyFixturePair({ manifestCase, goldenCase, baseFixture, inputFixture, identity }) {
  const expectedBaseEntry = goldenCase.base_revision_fixture;
  const expectedInputEntry = goldenCase.input_revision_fixture;
  if (manifestCase.fixture_ref.archive_entry_path?.replace(/^.*\/golden\//u, 'golden/') !== expectedBaseEntry
      || manifestCase.input_ref.archive_entry_path?.replace(/^.*\/golden\//u, 'golden/') !== expectedInputEntry
      || baseFixture.schema_id !== 'MS-REV-001' || baseFixture.schema_version !== '0.2'
      || inputFixture.schema_id !== 'MS-REV-001' || inputFixture.schema_version !== '0.2'
      || inputFixture.parent_revision_id !== baseFixture.revision_id || !Array.isArray(inputFixture.facts) || inputFixture.facts.length !== 1
      || identity.model_id !== baseFixture.model_id || identity.base_revision !== baseFixture.revision_id
      || !baseFixture.contexts?.some(context => context?.context_id === identity.context_id)
      || canonicalizeJcs(baseFixture.profile_binding) !== canonicalizeJcs(inputFixture.profile_binding)) {
    caseExecutionFail(`Family case ${manifestCase.case_id} fixture identity is invalid.`);
  }
}

function verifyReplayCase({ manifestCase, replayCase }) {
  const attempts = replayCase.attempts;
  const expectedStatus = manifestCase.expectation === 'PASS' ? 'PASS_MATCHED' : 'BLOCKED_MATCHED';
  if (!Array.isArray(attempts) || attempts.length !== 2 || attempts.some((attempt, index) => attempt.attempt !== index + 1 || attempt.observed_status !== expectedStatus)
      || canonicalizeJcs(attempts[0].transaction) !== canonicalizeJcs(manifestCase.expected_transaction)
      || canonicalizeJcs(attempts[0]) !== canonicalizeJcs({ ...attempts[1], attempt: 1 })) {
    caseExecutionFail(`Family case ${manifestCase.case_id} Replay attempts are invalid.`);
  }
}

function expectedFamilyError(replayError, expectation) {
  if (expectation === 'PASS') {
    if (replayError !== null) caseExecutionFail('PASS Replay error_code must be null.');
    return null;
  }
  const values = {
    ENDPOINT_KIND_MISMATCH: { http_status: 422, top_error_code: 'DOMAIN_REJECTED', detail_error_code: 'ENDPOINT_KIND_MISMATCH' },
    STATE_OWNER_MISMATCH: { http_status: 422, top_error_code: 'DOMAIN_REJECTED', detail_error_code: 'STATE_OWNER_MISMATCH' },
    INVALID_ARGUMENT: { http_status: 400, top_error_code: 'INVALID_ARGUMENT', detail_error_code: null },
    MODIFIER_COMBINATION_INVALID: { http_status: 422, top_error_code: 'MODIFIER_COMBINATION_INVALID', detail_error_code: null }
  };
  if (!values[replayError]) caseExecutionFail('BLOCKED Replay error_code is not in the frozen mapping.');
  return values[replayError];
}

function uniqueBy(values, key, expected) {
  const matches = values?.filter(item => item?.[key] === expected) ?? [];
  if (matches.length !== 1) caseExecutionFail(`Expected exactly one ${key}=${expected}.`);
  return matches[0];
}

/**
 * 创建一个仅供后续 INITIAL/REOPEN 编排消费的 fresh attempt 输入根。
 * 此函数不启动进程、不执行 case，也不生成任何 Report 或 placeholder。
 */
export async function prepareControlledAttempt({
  controlled_bundle_root,
  manifest_root,
  manifest_path,
  profile_asset_root,
  report_staging_root,
  case_entry,
  attempt_ordinal,
  java_executable,
  browser_executable,
  runtime_port,
  web_port,
  invocation_context = null
}) {
  assertControlledAttemptArguments({ manifest_path, case_entry, attempt_ordinal, java_executable, browser_executable, runtime_port, web_port });
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot: manifest_root,
    manifest: manifest_path,
    profileAssetRoot: profile_asset_root
  }).catch(error => { throw asOrchestrationError(error, 'E2E_ORCHESTRATION_INPUT_INVALID'); });
  if (resolve(manifestInput.profileRoot) !== resolve(manifestInput.manifestRoot, 'inputs/upstream/profile-assets')) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Profile assets must be read from the Manifest final root.');
  }
  if (invocation_context === null) {
    const controlledBundle = await verifyControlledInputBundle({ bundleRoot: controlled_bundle_root, consumer: 'E2E' }).catch(error => {
      throw asOrchestrationError(error, 'E2E_ORCHESTRATION_INPUT_INVALID');
    });
    await assertControlledManifestTrust({ manifestInput, controlledBundle });
  } else {
    if (!verifiedFamilyInvocationContexts.has(invocation_context)
        || invocation_context.manifest_root_realpath !== resolve(manifest_root)
        || invocation_context.profile_asset_root_realpath !== resolve(profile_asset_root)
        || invocation_context.input_trust.root_realpath !== resolve(controlled_bundle_root)) {
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Attempt trust does not match the loader-verified Invocation Context.');
    }
    await verifyFamilyInvocationInputTrust({ context: invocation_context, manifestInput });
  }
  const inputs = selectAttemptInputs({ manifestInput, caseEntry: case_entry });
  const source = await verifyAttemptSources({ manifestInput, inputs });

  const reportRoot = resolve(report_staging_root);
  await assertDirectory(reportRoot, 'E2E_ORCHESTRATION_INPUT_INVALID');
  const attemptRoot = await createFreshAttemptRoot({ reportRoot, caseId: inputs.caseEntry.case_id, attemptOrdinal: attempt_ordinal });
  try {
    await copyVerifiedAttemptSources({ attemptRoot, manifestInput, inputs, source });
  } catch (error) {
    throw asOrchestrationError(error, 'E2E_ORCHESTRATION_PROCESS_FAILED');
  }
  return freezePreparedAttempt({ attemptRoot, caseEntry: inputs.caseEntry, attemptOrdinal: attempt_ordinal, inputs });
}

export function buildE2eMaterializerCommand({ prepared_attempt, java_executable }) {
  const prepared = prepared_attempt;
  if (!plainObject(prepared) || !isAbsolute(java_executable) || !isAbsolute(prepared.attempt_root)
      || !inside(prepared.attempt_root, prepared.runtime_jar) || !inside(prepared.attempt_root, prepared.fixture)
      || !inside(prepared.attempt_root, prepared.input) || !inside(prepared.attempt_root, prepared.binding)
      || !inside(prepared.attempt_root, prepared.storage) || !safeRelativePath(prepared.manifest_path)
      || !['DRIVER-PROCEDURAL', 'DRIVER-CONTROL', 'DRIVER-STRUCTURAL', 'DRIVER-COMMON'].includes(prepared.case_entry?.driver_id)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Materializer command inputs are invalid.');
  }
  const fixtureKind = prepared.case_entry.driver_id === 'DRIVER-COMMON' ? 'COMMON' : 'FAMILY';
  if (fixtureKind === 'FAMILY' && (!isAbsolute(prepared.family_identity_catalog) || !inside(prepared.attempt_root, prepared.family_identity_catalog))
      || fixtureKind === 'COMMON' && prepared.family_identity_catalog !== null) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Materializer Family catalog input is invalid.');
  }
  const command = [
    java_executable,
    '-Dloader.main=org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli',
    '-cp', 'inputs/build/local-runtime.jar',
    'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--guard', 'RELEASE_E2E_ONLY',
    '--fixture-kind', fixtureKind,
    '--case-id', prepared.case_entry.case_id,
    '--fixture', prepared.fixture
  ];
  if (fixtureKind === 'FAMILY') command.push('--family-identity-catalog', prepared.family_identity_catalog);
  command.push(
    '--manifest-root', prepared.manifest_root,
    '--manifest', prepared.manifest_path,
    '--input', prepared.input,
    '--profile-asset-root', prepared.profile_assets,
    '--binding', prepared.binding,
    '--fault-plan', resolve(prepared.attempt_root, 'fault-plan.json'),
    '--storage', prepared.storage,
    '--out', resolve(prepared.attempt_root, 'fixture-materialization.json')
  );
  return deepFreeze({ command, cwd: prepared.attempt_root });
}

export async function runE2eFixtureMaterializer({ prepared_attempt, java_executable }) {
  const prepared = prepared_attempt;
  const outputPath = resolve(prepared?.attempt_root ?? '', 'fixture-materialization.json');
  if (!plainObject(prepared) || !isAbsolute(prepared.attempt_root) || !isAbsolute(java_executable)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Materializer invocation inputs are invalid.');
  }
  await assertFreshMaterializerTarget(prepared.storage);
  await assertFreshMaterializerTarget(outputPath);
  const launch = buildE2eMaterializerCommand({ prepared_attempt: prepared, java_executable });
  await runFiniteOwnedChild(launch.command, launch.cwd, 120000);
  const artifact = await readAndVerifyMaterializationArtifact({ prepared, outputPath });
  const materializedIdentity = deepFreeze({
    case_id: artifact.case_id,
    attempt_ordinal: artifact.attempt_ordinal,
    project_id: artifact.identity.project_id,
    model_id: artifact.identity.model_id,
    context_id: artifact.identity.context_id,
    materialized_base_revision: artifact.identity.base_revision
  });
  return deepFreeze({ artifact, materialized_identity: materializedIdentity });
}

export function buildE2eAttemptSnapshotCommand({
  prepared_attempt,
  java_executable,
  attempt_identity,
  revision_id,
  projection_response_ref
}) {
  const prepared = prepared_attempt;
  if (!plainObject(prepared) || !isAbsolute(java_executable) || !isAbsolute(prepared.attempt_root)
      || !inside(prepared.attempt_root, prepared.runtime_jar) || !inside(prepared.attempt_root, prepared.storage)
      || !inside(prepared.attempt_root, prepared.profile_assets)
      || !deepFrozen(attempt_identity) || attempt_identity.case_id !== prepared.case_entry?.case_id
      || attempt_identity.attempt_ordinal !== prepared.attempt_ordinal
      || typeof revision_id !== 'string' || !revision_id
      || !isRawRef(projection_response_ref, 'API_RESPONSE_BODY')
      || !projection_response_ref.path.startsWith('api-exchanges/')) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Snapshot command inputs are invalid.');
  }
  const projectionPath = resolve(prepared.attempt_root, projection_response_ref.path);
  if (!inside(prepared.attempt_root, projectionPath)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Snapshot Projection response escapes the attempt root.');
  }
  return deepFreeze({
    command: [
      java_executable,
      '-Dloader.main=org.opm.localruntime.releaseevidence.E2EAttemptSnapshotCli',
      '-cp', 'inputs/build/local-runtime.jar',
      'org.springframework.boot.loader.launch.PropertiesLauncher',
      '--guard', 'RELEASE_E2E_SNAPSHOT_ONLY',
      '--storage', prepared.storage,
      '--project-id', attempt_identity.project_id,
      '--model-id', attempt_identity.model_id,
      '--context-id', attempt_identity.context_id,
      '--revision-id', revision_id,
      '--profile-asset-root', prepared.profile_assets,
      '--fixture-materialization', resolve(prepared.attempt_root, 'fixture-materialization.json'),
      '--projection-response', projectionPath
    ],
    cwd: prepared.attempt_root
  });
}

export async function runE2eAttemptSnapshot(input) {
  const launch = buildE2eAttemptSnapshotCommand(input);
  const observedProjectionRef = await observedAttemptFileRef(input.prepared_attempt.attempt_root, input.projection_response_ref);
  if (!sameRef(observedProjectionRef, input.projection_response_ref)) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Snapshot Projection raw ref differs.', 3);
  }
  const output = await runSnapshotChild(launch.command, launch.cwd, 120000);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(output);
  } catch {
    throw evidenceTransaction('E2E Snapshot stdout is not strict UTF-8.');
  }
  let digests;
  try { digests = JSON.parse(text); }
  catch { throw evidenceTransaction('E2E Snapshot stdout is not JSON.'); }
  if (!validateStateDigests(digests) || !output.equals(Buffer.from(`${canonicalizeJcs(digests)}\n`, 'utf8'))) {
    throw evidenceTransaction('E2E Snapshot stdout is not canonical StateDigests JCS plus LF.');
  }
  return deepFreeze(digests);
}

export function buildE2eTransactionSnapshotCommand({
  prepared_attempt,
  java_executable,
  attempt_identity,
  before_revision_id,
  after_revision_id
}) {
  const prepared = prepared_attempt;
  if (!plainObject(prepared) || !isAbsolute(java_executable) || !isAbsolute(prepared.attempt_root)
      || !inside(prepared.attempt_root, prepared.runtime_jar) || !inside(prepared.attempt_root, prepared.storage)
      || !deepFrozen(attempt_identity) || attempt_identity.case_id !== prepared.case_entry?.case_id
      || attempt_identity.attempt_ordinal !== prepared.attempt_ordinal
      || typeof before_revision_id !== 'string' || !before_revision_id
      || typeof after_revision_id !== 'string' || !after_revision_id) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'E2E Transaction Snapshot command inputs are invalid.');
  }
  return deepFreeze({
    command: [
      java_executable,
      '-Dloader.main=org.opm.localruntime.releaseevidence.E2ETransactionSnapshotCli',
      '-cp', 'inputs/build/local-runtime.jar',
      'org.springframework.boot.loader.launch.PropertiesLauncher',
      '--guard', 'RELEASE_E2E_TRANSACTION_SNAPSHOT_ONLY',
      '--storage', prepared.storage,
      '--project-id', attempt_identity.project_id,
      '--model-id', attempt_identity.model_id,
      '--before-revision-id', before_revision_id,
      '--after-revision-id', after_revision_id,
      '--fixture-materialization', resolve(prepared.attempt_root, 'fixture-materialization.json')
    ],
    cwd: prepared.attempt_root
  });
}

export async function runE2eTransactionSnapshot(input) {
  const launch = buildE2eTransactionSnapshotCommand(input);
  const output = await runSnapshotChild(launch.command, launch.cwd, 120000);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(output);
  } catch {
    throw evidenceTransaction('E2E Transaction Snapshot stdout is not strict UTF-8.');
  }
  let snapshots;
  try { snapshots = JSON.parse(text); }
  catch { throw evidenceTransaction('E2E Transaction Snapshot stdout is not JSON.'); }
  if (!validateTransactionSnapshotPair(snapshots)
      || !output.equals(Buffer.from(`${canonicalizeJcs(snapshots)}\n`, 'utf8'))) {
    throw evidenceTransaction('E2E Transaction Snapshot stdout is not canonical transaction snapshots JCS plus LF.');
  }
  return deepFreeze(snapshots);
}

async function runSnapshotChild(command, cwd, timeoutMs) {
  const child = spawnOwned(command, cwd);
  const stdout = [];
  const stderr = [];
  let stdoutLength = 0;
  let stderrLength = 0;
  let exceeded = false;
  let timedOut = false;
  child.stdout.on('data', bytes => {
    stdoutLength += bytes.length;
    if (stdoutLength <= 4096) stdout.push(Buffer.from(bytes));
    else { exceeded = true; child.kill('SIGKILL'); }
  });
  child.stderr.on('data', bytes => {
    stderrLength += bytes.length;
    if (stderrLength <= 4096) stderr.push(Buffer.from(bytes));
    else { exceeded = true; child.kill('SIGKILL'); }
  });
  const outcome = await new Promise((resolveChild, rejectChild) => {
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); rejectChild(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolveChild({ code, signal }); });
  }).catch(error => {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', error?.message ?? 'E2E Snapshot process failed.', 3);
  });
  if (timedOut || exceeded || outcome.code !== 0 || outcome.signal !== null) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Snapshot process did not exit successfully.', 3);
  }
  if (stderrLength !== 0) throw evidenceTransaction('E2E Snapshot successful process wrote stderr.');
  return Buffer.concat(stdout, stdoutLength);
}

async function assertFreshMaterializerTarget(path) {
  const details = await lstat(path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (details) throw new E2eRunInputError('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'E2E Materializer target must be absent.', 3);
}

async function runFiniteOwnedChild(command, cwd, timeoutMs) {
  const child = spawnOwned(command, cwd);
  let stdoutLength = 0;
  let stderrLength = 0;
  const limit = 1024 * 1024;
  child.stdout.on('data', bytes => { stdoutLength += bytes.length; if (stdoutLength > limit) child.kill('SIGKILL'); });
  child.stderr.on('data', bytes => { stderrLength += bytes.length; if (stderrLength > limit) child.kill('SIGKILL'); });
  const outcome = await new Promise((resolveChild, rejectChild) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectChild(new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer timed out.', 3));
    }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); rejectChild(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolveChild({ code, signal }); });
  }).catch(error => { throw asMaterializerProcessError(error); });
  if (stdoutLength > limit || stderrLength > limit || outcome.code !== 0 || outcome.signal !== null) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer did not exit successfully.', 3);
  }
}

function asMaterializerProcessError(error) {
  return error instanceof E2eRunInputError
    ? error
    : new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', error?.message ?? 'E2E Materializer process failed.', 3);
}

async function readAndVerifyMaterializationArtifact({ prepared, outputPath }) {
  const details = await lstat(outputPath).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer artifact is missing or unsafe.', 3);
  }
  const bytes = await readFile(outputPath);
  let artifact;
  try { artifact = JSON.parse(bytes.toString('utf8')); }
  catch { throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer artifact is not JSON.', 3); }
  if (!bytes.equals(Buffer.from(`${canonicalizeJcs(artifact)}\n`, 'utf8')) || !validateAttemptArtifactSchema(artifact)
      || artifact.schema_id !== 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001' || artifact.schema_version !== '0.2') {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer artifact is not canonical Schema-valid v0.2.', 3);
  }
  const payload = structuredClone(artifact);
  delete payload.artifact_payload_sha256;
  if (artifact.artifact_payload_sha256 !== sha256(Buffer.from(canonicalizeJcs(payload), 'utf8'))) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'E2E Materializer artifact payload digest is invalid.', 3);
  }
  const materializationPayload = Object.fromEntries([
    'case_id', 'attempt_ordinal', 'fixture_kind', 'fixture_ref', 'input_ref', 'active_binding', 'identity', 'storage', 'materializer_identity', 'state_digests'
  ].map(key => [key, artifact[key]]));
  const expectedKind = prepared.case_entry.driver_id === 'DRIVER-COMMON' ? 'COMMON' : 'FAMILY';
  if (artifact.materialization_payload_sha256 !== sha256(Buffer.from(canonicalizeJcs(materializationPayload), 'utf8'))
      || artifact.case_id !== prepared.case_entry.case_id || artifact.attempt_ordinal !== prepared.attempt_ordinal
      || artifact.fixture_kind !== expectedKind
      || canonicalizeJcs(artifact.fixture_ref) !== canonicalizeJcs(prepared.case_entry.fixture_ref)
      || canonicalizeJcs(artifact.input_ref) !== canonicalizeJcs(prepared.case_entry.input_ref)
      || artifact.identity.head_revision !== artifact.identity.base_revision) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer artifact identity or input join differs.', 3);
  }
  const manifest = JSON.parse(await readFile(resolve(prepared.manifest_root, prepared.manifest_path), 'utf8'));
  const binding = JSON.parse(await readFile(prepared.binding, 'utf8'));
  const manifestCase = manifest.cases?.filter(item => item?.case_id === artifact.case_id) ?? [];
  if (manifestCase.length !== 1 || canonicalizeJcs(manifestCase[0]) !== canonicalizeJcs(prepared.case_entry)
      || canonicalizeJcs(binding) !== canonicalizeJcs(artifact.active_binding)
      || artifact.profile_package_digest !== binding.profile?.sha256) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer Manifest, binding, or Profile digest differs.', 3);
  }
  await verifyFileRef({ root: prepared.manifest_root, reference: artifact.fixture_ref, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  await verifyFileRef({ root: prepared.manifest_root, reference: artifact.input_ref, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  const runtimeRef = await observedAttemptFileRef(prepared.attempt_root, artifact.materializer_identity.runtime_jar_ref);
  if (!sameRef(runtimeRef, artifact.materializer_identity.runtime_jar_ref)
      || artifact.materializer_identity.source_sha256 !== runtimeRef.sha256) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer Runtime JAR identity differs.', 3);
  }
  const profileRefs = [];
  for (const reference of artifact.profile_asset_refs) profileRefs.push(await observedAttemptFileRef(prepared.attempt_root, reference));
  if (!sameRefArray(profileRefs, artifact.profile_asset_refs)) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer Profile asset refs differ.', 3);
  }
  const profileTreePreimage = {
    schema_id: 'OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001', schema_version: '0.1', root_path: 'profile/assets', entries: artifact.profile_asset_refs
  };
  const profileTree = {
    kind: 'PROFILE_ASSET_TREE', path: 'profile/assets',
    byte_length: artifact.profile_asset_refs.reduce((total, item) => total + item.byte_length, 0),
    sha256: sha256(Buffer.from(canonicalizeJcs(profileTreePreimage), 'utf8'))
  };
  const expectedBasePath = `storage/materialized-base/projects/${artifact.identity.project_id}/project.db`;
  const expectedWorkingPath = `storage/projects/${artifact.identity.project_id}/project.db`;
  const databaseRef = await observedAttemptFileRef(prepared.attempt_root, artifact.storage.project_db_ref);
  const workingRef = await observedAttemptFileRef(prepared.attempt_root, {
    kind: 'PROJECT_DB', path: artifact.storage.working_project_db_path,
    byte_length: artifact.storage.working_clone_byte_length, sha256: artifact.storage.working_clone_sha256
  });
  const basePath = resolve(prepared.attempt_root, expectedBasePath);
  const workingPath = resolve(prepared.attempt_root, expectedWorkingPath);
  const [baseDetails, workingDetails] = await Promise.all([lstat(basePath), lstat(workingPath)]);
  const sidecars = [`${basePath}-wal`, `${basePath}-shm`, `${basePath}-journal`, `${workingPath}-wal`, `${workingPath}-shm`, `${workingPath}-journal`];
  const sidecarExists = (await Promise.all(sidecars.map(path => lstat(path).then(() => true).catch(error => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  })))).some(Boolean);
  if (!sameRef(profileTree, artifact.profile_asset_tree_ref) || !sameRef(databaseRef, artifact.storage.project_db_ref)
      || artifact.storage.storage_root !== 'storage' || artifact.storage.materialized_base_root !== 'storage/materialized-base'
      || artifact.storage.project_db_ref.path !== expectedBasePath || artifact.storage.working_project_db_path !== expectedWorkingPath
      || artifact.storage.working_clone_byte_length !== databaseRef.byte_length
      || artifact.storage.working_clone_sha256 !== databaseRef.sha256
      || workingRef.byte_length !== databaseRef.byte_length || workingRef.sha256 !== databaseRef.sha256
      || baseDetails.dev !== workingDetails.dev || baseDetails.ino === workingDetails.ino || sidecarExists) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer Profile tree or storage reference differs.', 3);
  }
  return deepFreeze(artifact);
}

async function observedAttemptFileRef(root, reference) {
  if (!plainObject(reference) || !safeRelativePath(reference.path)) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer file reference is invalid.', 3);
  }
  const path = resolve(root, reference.path);
  if (!inside(root, path)) throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer file reference escapes the attempt.', 3);
  const details = await lstat(path).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    throw new E2eRunInputError('E2E_ORCHESTRATION_REF_MISMATCH', 'E2E Materializer referenced file is missing or unsafe.', 3);
  }
  const bytes = await readFile(path);
  return { kind: reference.kind, path: reference.path, byte_length: bytes.length, sha256: sha256(bytes) };
}

/**
 * 受控 Playwright 只能通过这个入口把已冻结的 Invocation Context 转换为 attempt 输入。
 * 这里不启动 Runtime/Web/Browser，避免为 2A 旁路最终 Runner 的生产编排职责。
 */
export function assertControlledInvocationContext(context, scheduleId) {
  if (!context || typeof context !== 'object' || Array.isArray(context)
      || typeof scheduleId !== 'string' || !Array.isArray(context.execution_schedule)
      || !absolutePath(context.controlled_bundle_root_realpath) || !absolutePath(context.manifest_root_realpath)
      || !absolutePath(context.profile_asset_root_realpath) || !context.manifest_ref
      || !context.java_executable_ref || !context.browser_executable_ref) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled Invocation Context is invalid.');
  }
  const entry = context.execution_schedule.find(item => item?.schedule_id === scheduleId);
  if (!entry || !FAULT_CASE_IDS.has(entry.case_id) || !ATTEMPT_ORDINALS.includes(entry.attempt_ordinal)
      || !['INITIAL', 'REOPEN'].includes(entry.process_cycle) || !validPort(entry.runtime_port)
      || !validPort(entry.web_port) || entry.runtime_port === entry.web_port) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled Invocation schedule is invalid.');
  }
  return Object.freeze({ ...entry, ...context });
}

/**
 * Release Playwright 的唯一 Family bridge。Context 必须由受控 loader 在同一进程完成登记，
 * 避免直接把环境变量或结构相同的对象当作可信执行输入。
 */
export async function runFamilyControlledInvocationSession({ invocation_context, cycle_handler }) {
  if (!verifiedFamilyInvocationContexts.has(invocation_context)
      || !verifiedExecutionToolchains.has(invocation_context)
      || !Object.isFrozen(invocation_context)
      || typeof cycle_handler !== 'function'
      || !Object.isFrozen(cycle_handler)) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', 'Family production bridge requires one loader-verified Context and one frozen cycle handler.');
  }
  const manifestInput = await loadActiveAttemptManifest({
    manifestRoot: invocation_context.manifest_root_realpath,
    manifest: invocation_context.manifest_ref.path,
    profileAssetRoot: invocation_context.profile_asset_root_realpath
  }).catch(error => { throw asContextRefError(error); });
  const toolchainEvidence = verifiedExecutionToolchains.get(invocation_context);
  if (!sameRef(manifestInput.manifestRef, invocation_context.manifest_ref)) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Family session Manifest raw ref drifted.', 3);
  }
  const manifest = manifestInput.manifest;
  const runnerSourceSet = await readReferencedJson(
    invocation_context.report_staging_root_realpath,
    invocation_context.runner_source_set_ref,
    'E2E_INVOCATION_CONTEXT_REF_MISMATCH'
  );
  const commonSetupPlan = await loadControlledCommonSetupPlan({ invocation_context, manifest });
  const driverCache = new Map();
  const manifestDriverRoot = resolve(invocation_context.manifest_root_realpath, 'inputs/drivers');
  const drivers = new Map();
  for (const driverId of ['DRIVER-PROCEDURAL', 'DRIVER-CONTROL', 'DRIVER-STRUCTURAL', 'DRIVER-COMMON']) {
    drivers.set(driverId, await loadControlledDriverModule({
      invocation_context,
      manifest,
      runner_source_set: runnerSourceSet,
      driver_id: driverId,
      driver_root: manifestDriverRoot,
      session_cache: driverCache
    }));
  }
  const caseExecutions = await buildControlledCaseExecutionCatalog({
    invocation_context,
    manifest,
    common_cases: drivers.get('DRIVER-COMMON').common_cases,
    common_setup_plan: commonSetupPlan
  });
  verifyFamilySessionSchedule(invocation_context.execution_schedule, manifest, caseExecutions);

  for (const schedule of invocation_context.execution_schedule) {
    const caseExecution = caseExecutions.get(schedule.case_id);
    const prepared = await prepareControlledAttempt({
      controlled_bundle_root: invocation_context.input_trust.root_realpath,
      manifest_root: invocation_context.manifest_root_realpath,
      manifest_path: invocation_context.manifest_ref.path,
      profile_asset_root: invocation_context.profile_asset_root_realpath,
      report_staging_root: invocation_context.attempt_parent_realpath,
      case_entry: caseExecution.manifest_case,
      attempt_ordinal: schedule.attempt_ordinal,
      java_executable: invocation_context.java_executable_ref.path,
      browser_executable: invocation_context.browser_executable_ref.path,
      runtime_port: schedule.runtime_port,
      web_port: schedule.web_port,
      invocation_context
    });
    if (prepared.attempt_root !== schedule.attempt_root_realpath) {
      contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Prepared attempt root differs from the frozen schedule.', 3);
    }

    let faultLaunch = null;
    try {
      if (FAULT_CASE_IDS.has(schedule.case_id)) {
        faultLaunch = await prepareLifecycleFaultLaunch({
          reportRoot: invocation_context.attempt_parent_realpath,
          manifest,
          caseId: schedule.case_id,
          attemptOrdinal: schedule.attempt_ordinal,
          processControlParent: invocation_context.process_control_parent_realpath
        });
      } else {
        const written = await writeFaultPlan({
          reportRoot: invocation_context.attempt_parent_realpath,
          caseId: schedule.case_id,
          attemptOrdinal: schedule.attempt_ordinal
        });
        await readBackFaultPlan({
          reportRoot: invocation_context.attempt_parent_realpath,
          caseId: schedule.case_id,
          attemptOrdinal: schedule.attempt_ordinal,
          reference: written
        });
      }

      const materialized = await runE2eFixtureMaterializer({
        prepared_attempt: prepared,
        java_executable: invocation_context.java_executable_ref.path
      });
      const attemptRelative = attemptRelativeRoot(schedule.case_id, schedule.attempt_ordinal);
      const materializationRef = await exactReportRef(
        invocation_context.attempt_parent_realpath,
        `${attemptRelative}/fixture-materialization.json`,
        'FIXTURE_MATERIALIZATION'
      );
      const driver = await loadControlledDriverModule({
        invocation_context,
        manifest,
        runner_source_set: runnerSourceSet,
        driver_id: schedule.driver_id,
        driver_root: prepared.driver_root,
        session_cache: driverCache
      });
      const initial = await runFamilyInvocationCycle({
        invocationContext: invocation_context,
        schedule,
        caseExecution,
        prepared,
        materializedIdentity: materialized.materialized_identity,
        activeBinding: manifestInput.activeBinding,
        driver,
        cycleHandler: cycle_handler,
        cycle: 'INITIAL',
        faultLaunch,
        toolchainEvidence
      });
      const transactionSnapshots = await runE2eTransactionSnapshot({
        prepared_attempt: prepared,
        java_executable: invocation_context.java_executable_ref.path,
        attempt_identity: initial.attempt_identity,
        before_revision_id: initial.subject_before_state.revision_id,
        after_revision_id: initial.reopen_expectation.revision_id
      });
      const transactionObservation = createTransactionObservation({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        before: transactionSnapshots.before,
        after: transactionSnapshots.after,
        expectedTransaction: caseExecution.manifest_case.expected_transaction
      });
      const transactionObservationRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'transaction-observation.json',
        artifact: transactionObservation
      });
      if (!transactionObservation.matches) {
        throw evidenceTransaction('E2E Transaction Snapshot differs from the Manifest transaction expectation.');
      }
      if (faultLaunch) {
        await removeFaultChallenge({ challengePath: faultLaunch.challenge_path, processControlRoot: faultLaunch.process_control_root });
      }
      const reopen = await runFamilyInvocationCycle({
        invocationContext: invocation_context,
        schedule,
        caseExecution,
        prepared,
        materializedIdentity: initial.attempt_identity,
        activeBinding: manifestInput.activeBinding,
        driver,
        cycleHandler: cycle_handler,
        cycle: 'REOPEN',
        faultLaunch: null,
        exchangeSequenceStart: initial.sink.exchanges.length,
        networkSequenceStart: initial.sink.network_requests.length,
        consoleSequenceStart: initial.sink.console_events.length,
        reopenExpectation: initial.reopen_expectation,
        toolchainEvidence
      });
      const runtimeProcess = createRuntimeProcess({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        cycles: [initial.process_cycle, reopen.process_cycle]
      });
      const runtimeProcessRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'runtime-process.json',
        artifact: runtimeProcess
      });
      if (faultLaunch && initial.process_cycle.parent_nonce !== faultLaunch.parent_nonce
          || !faultLaunch && initial.process_cycle.parent_nonce === JSON.parse(await readFile(resolve(prepared.attempt_root, 'fault-plan.json'), 'utf8')).nonce) {
        throw evidenceTransaction('Runtime INITIAL nonce does not satisfy the Fault conditional join.');
      }
      const reopenObservation = createReopenObservation({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        observation: {
          runtime_process_ref: runtimeProcessRef,
          initial_process_nonce: initial.process_cycle.parent_nonce,
          reopen_process_nonce: reopen.process_cycle.parent_nonce,
          initial_browser_context_id: initial.browser_context_id,
          reopen_browser_context_id: reopen.browser_context_id,
          project_id: initial.attempt_identity.project_id,
          model_id: initial.attempt_identity.model_id,
          context_id: initial.attempt_identity.context_id,
          head_revision: initial.reopen_expectation.revision_id,
          projection_before_sha256: initial.reopen_expectation.projection_sha256,
          projection_reopen_sha256: reopen.reopen_state.projection_sha256,
          opl_before_sha256: initial.reopen_expectation.opl_sha256,
          opl_reopen_sha256: reopen.reopen_state.opl_sha256,
          token_before_sha256: initial.reopen_expectation.token_sha256,
          token_reopen_sha256: reopen.reopen_state.token_sha256,
          trace_before_sha256: initial.reopen_expectation.trace_sha256,
          trace_reopen_sha256: reopen.reopen_state.trace_sha256
        }
      });
      const reopenObservationRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'reopen-observation.json',
        artifact: reopenObservation
      });
      if (!reopenObservation.reopen_matches) throw evidenceTransaction('REOPEN artifact does not match INITIAL state digests.');
      const browserEnvironment = await buildFamilyBrowserEnvironment({
        invocationContext: invocation_context,
        schedule,
        prepared,
        initial,
        reopen,
        runnerSourceSet,
        toolchainEvidence
      });
      const browserEnvironmentRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'browser-environment.json',
        artifact: browserEnvironment
      });
      const networkRequests = [...initial.sink.network_requests, ...reopen.sink.network_requests];
      const networkCounters = sumNetworkCounters(initial.sink.network_counters, reopen.sink.network_counters);
      const networkObservation = createNetworkObservation({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        requests: networkRequests,
        counters: networkCounters
      });
      const networkObservationRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'network-observation.json',
        artifact: networkObservation
      });
      const consoleErrors = createConsoleErrors({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        events: [...initial.sink.console_events, ...reopen.sink.console_events]
      });
      const consoleErrorsRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'console-errors.json',
        artifact: consoleErrors
      });
      if (networkCounters.external_request_count !== 0 || networkCounters.websocket_count !== 0
          || networkCounters.service_worker_count !== 0 || networkCounters.download_count !== 0
          || networkCounters.popup_count !== 0 || networkRequests.some(request => request.allow_decision !== 'ALLOWED')
          || consoleErrors.events.some(event => event.allow_decision !== 'ALLOWED')) {
        throw evidenceTransaction('Network or Console observation contains a rejected event.');
      }
      const apiEvidence = await writeFamilyApiExchangeIndex({
        attempt_root: prepared.attempt_root,
        case_id: schedule.case_id,
        attempt_ordinal: schedule.attempt_ordinal,
        exchanges: [...initial.sink.exchanges, ...reopen.sink.exchanges],
        precondition_receipts: [...initial.sink.precondition_receipts, ...reopen.sink.precondition_receipts]
      });
      const subjectReceipt = selectSubjectReceipt({
        caseExecution,
        exchanges: initial.sink.exchanges,
        preconditionReceipts: initial.sink.precondition_receipts,
        subjectExchangeStart: initial.subject_exchange_start
      });
      const beforeProjectionRef = toReportRelativeAttemptRef(
        invocation_context.attempt_parent_realpath,
        prepared.attempt_root,
        initial.subject_before_state.projection_response_ref
      );
      const afterProjectionRef = toReportRelativeAttemptRef(
        invocation_context.attempt_parent_realpath,
        prepared.attempt_root,
        initial.reopen_expectation.projection_response_ref
      );
      const subjectRequestRef = subjectReceipt === null ? null : toReportRelativeAttemptRef(
        invocation_context.attempt_parent_realpath,
        prepared.attempt_root,
        subjectReceipt.raw_request.body_ref
      );
      const subjectResponseRef = subjectReceipt === null ? null : toReportRelativeAttemptRef(
        invocation_context.attempt_parent_realpath,
        prepared.attempt_root,
        subjectReceipt.response.body_ref
      );
      const attemptObservation = createAttemptObservation({
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        manifestCase: caseExecution.manifest_case,
        attemptIdentity: initial.attempt_identity,
        subjectBaseRevision: initial.subject_before_state.revision_id,
        beforeState: initial.subject_before_state,
        afterState: initial.reopen_expectation,
        reopenState: reopen.reopen_state,
        transactionObservation,
        reopenObservation,
        subjectReceipt,
        expectedSubject: expectedSubjectForCase(caseExecution),
        evidence: {
          before_projection_response_ref: beforeProjectionRef,
          after_projection_response_ref: afterProjectionRef,
          subject_request_ref: subjectRequestRef,
          subject_response_ref: subjectResponseRef,
          transaction_observation_ref: transactionObservationRef,
          reopen_observation_ref: reopenObservationRef,
          runtime_process_ref: runtimeProcessRef,
          api_exchange_index_ref: apiEvidence.index_ref
        }
      });
      const attemptObservationRef = await writeAttemptArtifact({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        filename: 'attempt-observation.json',
        artifact: attemptObservation
      });
      const faultPlanRef = await exactReportRef(
        invocation_context.attempt_parent_realpath,
        `${attemptRelative}/fault-plan.json`,
        'FAULT_PLAN'
      );
      await writeArtifactIndex({
        reportRoot: invocation_context.attempt_parent_realpath,
        caseId: schedule.case_id,
        attemptOrdinal: schedule.attempt_ordinal,
        entries: buildAttemptIndexEntries({
          attemptRelative,
          coreRefs: {
            FAULT_PLAN: faultPlanRef,
            FIXTURE_MATERIALIZATION: materializationRef,
            ATTEMPT_OBSERVATION: attemptObservationRef,
            RUNTIME_PROCESS: runtimeProcessRef,
            BROWSER_ENVIRONMENT: browserEnvironmentRef,
            NETWORK_OBSERVATION: networkObservationRef,
            CONSOLE_ERRORS: consoleErrorsRef,
            TRANSACTION_OBSERVATION: transactionObservationRef,
            REOPEN_OBSERVATION: reopenObservationRef,
            API_EXCHANGE_INDEX: apiEvidence.index_ref
          },
          materialization: materialized.artifact,
          runtimeProcess,
          dynamicEntries: apiEvidence.dynamic_entries
        })
      });
    } finally {
      if (faultLaunch) {
        const challenge = await lstat(faultLaunch.challenge_path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (challenge) await removeFaultChallenge({ challengePath: faultLaunch.challenge_path, processControlRoot: faultLaunch.process_control_root });
        await rm(faultLaunch.process_control_root, { recursive: true, force: false });
      }
    }
  }
  return undefined;
}

export function selectSubjectReceipt({ caseExecution, exchanges, preconditionReceipts, subjectExchangeStart }) {
  if (!deepFrozen(caseExecution) || !Array.isArray(exchanges) || !Array.isArray(preconditionReceipts)
      || !Number.isSafeInteger(subjectExchangeStart) || subjectExchangeStart < 0 || subjectExchangeStart > exchanges.length) {
    throw evidenceTransaction('Subject command selection inputs are invalid.');
  }
  const advanceHeadRefs = preconditionReceipts
    .filter(receipt => receipt?.kind === 'ADVANCE_HEAD')
    .map(receipt => receipt.exchange_ref);
  if (advanceHeadRefs.some(reference => !isRawRef(reference, 'API_EXCHANGE'))) {
    throw evidenceTransaction('ADVANCE_HEAD precondition has no exact exchange reference.');
  }
  const candidates = exchanges.slice(subjectExchangeStart)
    .map(item => item?.receipt)
    .filter(receipt => receipt?.exchange_entry?.operation_id === 'API-EDT-002'
      && receipt?.actual_request?.method === 'POST'
      && !advanceHeadRefs.some(reference => sameRef(reference, receipt.exchange_ref)));
  const ambiguous = caseExecution.manifest_case.case_id === 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED';
  if (ambiguous) {
    if (candidates.length !== 0) throw evidenceTransaction('AMBIGUOUS case emitted an unauthorized subject command.');
    return null;
  }
  if (candidates.length !== 1 || !completeReceipt(candidates[0])
      || !isRawRef(candidates[0].raw_request?.body_ref, 'API_REQUEST_BODY')
      || !isRawRef(candidates[0].response?.body_ref, 'API_RESPONSE_BODY')) {
    throw evidenceTransaction('Attempt does not contain exactly one complete subject command.');
  }
  return candidates[0];
}

export function expectedSubjectForCase(caseExecution) {
  if (!deepFrozen(caseExecution)) throw evidenceTransaction('CaseExecution is not frozen for subject expectation selection.');
  if (caseExecution.manifest_case.case_id === 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED') return null;
  let expectation;
  if (caseExecution.manifest_case.driver_id === 'DRIVER-COMMON') {
    const matches = caseExecution.expected_apis?.filter(item => item?.operation_id === 'API-EDT-002' && item?.method === 'POST') ?? [];
    if (matches.length !== 1) throw evidenceTransaction('Common case does not freeze exactly one subject API expectation.');
    expectation = matches[0];
  } else {
    expectation = caseExecution.expected_api;
    if (expectation?.operation_id !== 'API-EDT-002' || expectation?.method !== 'POST') {
      throw evidenceTransaction('Family case subject API expectation is invalid.');
    }
  }
  if (!Number.isSafeInteger(expectation.expected_http_status)
      || !(expectation.expected_error_code === null || typeof expectation.expected_error_code === 'string')) {
    throw evidenceTransaction('Subject API response expectation is invalid.');
  }
  return deepFreeze({
    expected_http_status: expectation.expected_http_status,
    expected_error_code: expectation.expected_error_code
  });
}

export function buildAttemptIndexEntries({ attemptRelative, coreRefs, materialization, runtimeProcess, dynamicEntries }) {
  const core = {
    FAULT_PLAN: ['fault-plan.json', 'MATERIALIZE'],
    FIXTURE_MATERIALIZATION: ['fixture-materialization.json', 'MATERIALIZE'],
    ATTEMPT_OBSERVATION: ['attempt-observation.json', 'FINALIZE'],
    RUNTIME_PROCESS: ['runtime-process.json', 'RUNTIME'],
    BROWSER_ENVIRONMENT: ['browser-environment.json', 'RUNTIME'],
    NETWORK_OBSERVATION: ['network-observation.json', 'ACTION'],
    CONSOLE_ERRORS: ['console-errors.json', 'ACTION'],
    TRANSACTION_OBSERVATION: ['transaction-observation.json', 'ACTION'],
    REOPEN_OBSERVATION: ['reopen-observation.json', 'REOPEN'],
    API_EXCHANGE_INDEX: ['api-exchanges/index.json', 'ACTION']
  };
  if (!safeRelativePath(attemptRelative) || !plainObject(coreRefs) || !sameStringSet(Object.keys(coreRefs), Object.keys(core))
      || materialization?.schema_id !== 'OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001'
      || runtimeProcess?.schema_id !== 'OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001'
      || !Array.isArray(dynamicEntries)) {
    throw evidenceTransaction('Artifact Index builder inputs are invalid.');
  }
  const entries = Object.entries(core).map(([kind, [filename, capturePhase]]) => {
    const reference = coreRefs[kind];
    if (!isRawRef(reference, kind) || reference.path !== `${attemptRelative}/${filename}`) {
      throw evidenceTransaction(`Artifact Index core reference is invalid: ${kind}.`);
    }
    return { kind, path: reference.path, media_type: 'application/json', capture_phase: capturePhase, required: true };
  });
  const profileRefs = materialization.profile_asset_refs;
  if (!Array.isArray(profileRefs) || profileRefs.length !== 5
      || materialization.profile_asset_tree_ref?.kind !== 'PROFILE_ASSET_TREE'
      || materialization.profile_asset_tree_ref.path !== 'profile/assets') {
    throw evidenceTransaction('Materializer Profile evidence is incomplete.');
  }
  entries.push({
    kind: 'PROFILE_ASSET_TREE',
    path: `${attemptRelative}/${materialization.profile_asset_tree_ref.path}`,
    media_type: 'application/vnd.opm.profile-asset-tree+json',
    capture_phase: 'MATERIALIZE',
    required: true
  });
  for (const reference of profileRefs) {
    if (!isRawRef(reference, reference?.kind) || !['PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET', 'GRAMMAR_ASSET', 'NORMALIZATION_DATA'].includes(reference.kind)
        || !reference.path.startsWith('profile/assets/')) {
      throw evidenceTransaction('Materializer Profile asset reference is invalid.');
    }
    entries.push({
      kind: 'PROFILE_ASSET', asset_kind: reference.kind, path: `${attemptRelative}/${reference.path}`,
      media_type: 'application/json', capture_phase: 'MATERIALIZE', required: true
    });
  }
  if (!Array.isArray(runtimeProcess.cycles) || runtimeProcess.cycles.length !== 2
      || runtimeProcess.cycles[0]?.cycle !== 'INITIAL' || runtimeProcess.cycles[1]?.cycle !== 'REOPEN') {
    throw evidenceTransaction('Runtime Process does not contain the INITIAL/REOPEN cycle pair.');
  }
  for (const cycle of runtimeProcess.cycles) {
    const capturePhase = cycle.cycle === 'INITIAL' ? 'RUNTIME' : 'REOPEN';
    for (const [kind, reference] of [['STDOUT_LOG', cycle.stdout_ref], ['STDERR_LOG', cycle.stderr_ref]]) {
      if (!isRawRef(reference, kind) || !reference.path.startsWith(`${attemptRelative}/`)) {
        throw evidenceTransaction(`Runtime ${cycle.cycle} ${kind} reference is invalid.`);
      }
      entries.push({ kind, path: reference.path, media_type: 'text/plain', capture_phase: capturePhase, required: true });
    }
  }
  for (const entry of dynamicEntries) entries.push({ ...entry });
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  return deepFreeze(entries);
}

function verifyFamilySessionSchedule(schedule, manifest, caseExecutions) {
  if (!Array.isArray(schedule) || schedule.length !== 388 || !(caseExecutions instanceof Map) || caseExecutions.size !== 194) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Family session schedule or CaseExecution set is incomplete.', 3);
  }
  for (const [index, item] of schedule.entries()) {
    const manifestCase = manifest.cases[Math.floor(index / 2)];
    const expectedAttempt = index % 2 + 1;
    const execution = caseExecutions.get(item.case_id);
    if (!execution || item.ordinal !== index + 1 || item.case_ordinal !== Math.floor(index / 2) + 1
        || item.case_id !== manifestCase.case_id || item.driver_id !== manifestCase.driver_id
        || item.attempt_ordinal !== expectedAttempt || item.expectation !== manifestCase.expectation
        || item.viewport_id !== manifestCase.viewport_id || item.zoom_id !== manifestCase.zoom_id) {
      contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Family session schedule differs from the Manifest and CaseExecution order.', 3);
    }
  }
}

async function runFamilyInvocationCycle({
  invocationContext,
  schedule,
  caseExecution,
  prepared,
  materializedIdentity,
  activeBinding,
  driver,
  cycleHandler,
  cycle,
  faultLaunch,
  toolchainEvidence,
  exchangeSequenceStart = 0,
  networkSequenceStart = 0,
  consoleSequenceStart = 0,
  reopenExpectation = null
}) {
  let runtime = null;
  let web = null;
  let sink = null;
  let attemptIdentity = cycle === 'REOPEN' ? materializedIdentity : null;
  let resolverCallCount = 0;
  let driverCallCount = 0;
  let resolvedReopenExpectation = reopenExpectation;
  let subjectSequenceStart = null;
  let failure = null;
  let processCycle = null;
  let runtimeOutput = null;
  let runtimeCommand = null;
  let runtimeJarRef = null;
  let runtimeHealthSamples = null;
  let runtimeStartedAt = null;
  const parentNonce = faultLaunch?.parent_nonce ?? randomBytes(32).toString('hex');
  const snapshotReader = ({ revision_id, projection_response_ref }) => runE2eAttemptSnapshot({
    prepared_attempt: prepared,
    java_executable: invocationContext.java_executable_ref.path,
    attempt_identity: attemptIdentity,
    revision_id,
    projection_response_ref
  });
  try {
    await assertPortsFree([schedule.runtime_port, schedule.web_port]);
    if (!deepFrozen(toolchainEvidence) || !isRawRef(toolchainEvidence.java?.mirror_ref, 'E2E_JAVA_EXECUTABLE_MIRROR')) {
      throw new E2eRunInputError('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Runtime cycle Java evidence mirror is invalid.', 3);
    }
    runtimeJarRef = await exactReportRef(
      invocationContext.report_staging_root_realpath,
      relative(invocationContext.report_staging_root_realpath, prepared.runtime_jar).split(sep).join('/'),
      'LOCAL_RUNTIME_JAR'
    );
    runtimeCommand = buildRuntimeLaunchCommand({
      javaPath: invocationContext.java_executable_ref.path,
      attemptRoot: prepared.attempt_root,
      runtimePort: schedule.runtime_port,
      caseId: schedule.case_id,
      attemptOrdinal: schedule.attempt_ordinal,
      cycle,
      faultLaunch
    });
    runtimeStartedAt = new Date().toISOString();
    runtime = spawnOwned(runtimeCommand.command, prepared.attempt_root);
    runtimeOutput = observeOwnedChildOutput(runtime, RUNTIME_LOG_MAX_BYTES);
    runtimeHealthSamples = await waitRuntimeReady({ child: runtime, cycle: { ...schedule, process_cycle: cycle }, launch: faultLaunch });
    web = spawnOwned([
      process.execPath,
      resolve(invocationContext.source_root_realpath, 'scripts/canvas06-e2e-production-web.mjs'),
      '--root', prepared.web_dist,
      '--host', '127.0.0.1',
      '--port', String(schedule.web_port),
      '--runtime-origin', `http://127.0.0.1:${schedule.runtime_port}`
    ], prepared.attempt_root);
    web.stdout?.resume();
    web.stderr?.resume();
    const origin = `http://127.0.0.1:${schedule.web_port}`;
    await waitWebReady({ child: web, origin });
    sink = createFamilyObservationSink({
      web_origin: origin,
      attempt_root: prepared.attempt_root,
      case_execution: caseExecution,
      attempt_identity: cycle === 'REOPEN' ? attemptIdentity : null,
      setup_baseline: null,
      cycle,
      exchange_sequence_start: exchangeSequenceStart,
      network_sequence_start: networkSequenceStart,
      console_sequence_start: consoleSequenceStart,
      reopen_expectation: reopenExpectation,
      snapshot_reader: snapshotReader
    });
    const resolveInvocation = cycle === 'INITIAL' ? async page => {
      resolverCallCount += 1;
      if (resolverCallCount !== 1) fail('E2E_DRIVER_INVOCATION_INVALID', 'INITIAL invocation resolver may run exactly once.');
      if (caseExecution.manifest_case.driver_id === 'DRIVER-COMMON') {
        const setup = await runCommonSetupAndBindIdentity({
          page,
          family_sink: sink,
          case_execution: caseExecution,
          materialized_identity: materializedIdentity,
          active_binding: activeBinding
        });
        attemptIdentity = setup.attempt_identity;
	      } else {
	        attemptIdentity = await runFamilySetupAndBindIdentity({
          page,
          family_sink: sink,
          case_execution: caseExecution,
	          materialized_identity: materializedIdentity
	        });
	      }
	      const subjectBeforeState = await captureReopenState({
	        page,
	        sink: sink.api,
	        identity: attemptIdentity,
	        revisionId: attemptIdentity.subject_baseline_revision,
	        snapshotReader,
	        requestPrefix: `e2e.subject.before.${attemptIdentity.attempt_ordinal}`
	      });
	      sink.bindSubjectBeforeState(subjectBeforeState);
	      subjectSequenceStart = sink.exchanges.length;
      const callContext = Object.freeze({
        page,
        case_entry: caseExecution,
        attempt_identity: attemptIdentity,
        observation_sink: sink.api,
        precondition_client: sink.api.precondition_client
      });
      const executeCase = async actualContext => {
        driverCallCount += 1;
        if (driverCallCount !== 1 || actualContext !== callContext) {
          fail('E2E_DRIVER_INVOCATION_INVALID', 'Family Driver must receive the exact call context once.');
        }
        const value = await driver.execute_case(actualContext);
        if (value !== undefined) fail('E2E_DRIVER_INVOCATION_INVALID', 'Family Driver must return undefined.');
        resolvedReopenExpectation = await captureInitialReopenExpectation({
          page,
          familySink: sink,
          caseExecution,
	          attemptIdentity,
	          subjectSequenceStart,
	          snapshotReader,
	          requestPrefix: `e2e.subject.after.${attemptIdentity.attempt_ordinal}`
	        });
        return undefined;
      };
      return Object.freeze({ execute_case: executeCase, call_context: callContext });
    } : null;
    const result = await cycleHandler(Object.freeze({
      cycle,
      origin,
      browser_executable_ref: invocationContext.browser_executable_ref,
      case_entry: caseExecution,
      observation_sink: sink.api,
      resolve_invocation: resolveInvocation
    }));
    if (result !== undefined || cycle === 'INITIAL' && (resolverCallCount !== 1 || driverCallCount !== 1 || !deepFrozen(attemptIdentity))) {
      fail('E2E_DRIVER_INVOCATION_INVALID', 'Family cycle handler did not close the exact invocation contract.');
    }
  } catch (error) {
    failure = error;
  } finally {
    let runtimeTermination = null;
    const protect = async operation => {
      try { await operation(); }
      catch (error) { failure = failure && !isEvidenceFailure(error) ? failure : asEvidenceFailure(error); }
    };
    if (sink) await protect(() => sink.finalizeProof());
    if (web) await protect(() => stopOwnedChild(web));
    if (runtime) await protect(async () => { runtimeTermination = await stopOwnedChild(runtime); });
    await protect(() => assertPortsFree([schedule.runtime_port, schedule.web_port]));
    if (runtime && runtimeOutput && runtimeCommand && runtimeJarRef && runtimeHealthSamples && runtimeStartedAt && runtimeTermination) {
      await protect(async () => {
        const logs = runtimeOutput.finish();
        const stdoutRef = await writeFamilyRawFile({
          attemptRoot: prepared.attempt_root,
          relativePath: `stdout/${cycle.toLowerCase()}.log`,
          bytes: logs.stdout,
          kind: 'STDOUT_LOG'
        });
        const stderrRef = await writeFamilyRawFile({
          attemptRoot: prepared.attempt_root,
          relativePath: `stderr/${cycle.toLowerCase()}.log`,
          bytes: logs.stderr,
          kind: 'STDERR_LOG'
        });
        processCycle = deepFreeze({
          cycle,
          normalized_command: normalizeRuntimeCommand({
            command: runtimeCommand.command,
            javaRef: toolchainEvidence.java.mirror_ref,
            runtimeJarRef,
            reportRoot: invocationContext.report_staging_root_realpath,
            attemptRoot: prepared.attempt_root
          }),
          java_ref: toolchainEvidence.java.mirror_ref,
          runtime_jar_ref: runtimeJarRef,
          pid: runtime.pid,
          parent_nonce: parentNonce,
          host: '127.0.0.1',
          port: schedule.runtime_port,
          health_samples: runtimeHealthSamples,
          started_at: runtimeStartedAt,
          stopped_at: new Date().toISOString(),
          termination: runtimeTermination,
          stdout_ref: toReportRelativeAttemptRef(invocationContext.report_staging_root_realpath, prepared.attempt_root, stdoutRef),
          stderr_ref: toReportRelativeAttemptRef(invocationContext.report_staging_root_realpath, prepared.attempt_root, stderrRef),
          owned_child_count_after_stop: 0
        });
      });
    }
  }
  if (failure) throw failure;
	  if (!processCycle || !sink?.browser_context_id || sink.browser_version !== '143.0.7499.4'
	      || cycle === 'INITIAL' && (!sink.subject_before_state || !Number.isSafeInteger(subjectSequenceStart))
	      || cycle === 'REOPEN' && !sink.reopen_state) {
    throw evidenceTransaction('Family cycle evidence is incomplete after cleanup.');
  }
  return Object.freeze({
    attempt_identity: attemptIdentity,
    sink,
    reopen_expectation: resolvedReopenExpectation,
    process_cycle: processCycle,
	    browser_context_id: sink.browser_context_id,
	    browser_version: sink.browser_version,
	    reopen_state: sink.reopen_state,
	    subject_before_state: sink.subject_before_state,
	    subject_exchange_start: subjectSequenceStart
	  });
}

async function captureInitialReopenExpectation({ page, familySink, caseExecution, attemptIdentity, subjectSequenceStart, snapshotReader, requestPrefix }) {
  const transaction = caseExecution.manifest_case.expected_transaction;
  const expectedDelta = transaction?.revision_delta;
  if (![0, 1].includes(expectedDelta)) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family transaction revision delta is invalid.');
  const preconditionRefs = new Set(familySink.precondition_receipts.map(item => item?.exchange_ref?.sha256).filter(Boolean));
  if (!Number.isSafeInteger(subjectSequenceStart) || subjectSequenceStart < 0) {
    throw evidenceTransaction('Subject exchange boundary is invalid.');
  }
  const subjectCommits = familySink.exchanges.slice(subjectSequenceStart).map(item => item.receipt).filter(receipt =>
    receipt.exchange_entry.operation_id === 'API-EDT-002'
    && receipt.actual_request.method === 'POST'
    && receipt.response.status === 200
    && receipt.response.body?.meta?.status === 'COMMITTED'
    && !preconditionRefs.has(receipt.exchange_ref.sha256));
  if (subjectCommits.length !== expectedDelta) {
    throw evidenceTransaction('Subject commit count differs from the frozen transaction delta.');
  }
  const revisionId = expectedDelta === 1
    ? subjectCommits[0].response.body.meta.committed_revision
    : familySink.subject_transaction_baseline_revision();
  if (typeof revisionId !== 'string' || !revisionId) throw evidenceTransaction('Subject final revision is missing.');
	  return captureReopenState({ page, sink: familySink.api, identity: attemptIdentity, revisionId, snapshotReader, requestPrefix });
}

async function captureReopenState({ page, sink, identity, revisionId, snapshotReader, requestPrefix = `e2e.reopen.${identity.attempt_ordinal}` }) {
	  const origin = pageOrigin(page);
	  const prefix = `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}`;
	  if (typeof requestPrefix !== 'string' || !/^e2e\.(?:reopen|subject\.(?:before|after|rebind))\.[1-2]$/u.test(requestPrefix)) {
	    throw evidenceTransaction('State capture request prefix is invalid.');
	  }
  const projection = await sameOriginFetchAndCapture({
    page, sink, origin,
    path: `${prefix}/contexts/${encodeURIComponent(identity.context_id)}/projection?${new URLSearchParams({ request_id: `${requestPrefix}.projection`, revision: revisionId })}`,
    method: 'GET', body: null,
    expected: { operation_id: 'API-CTX-002', method: 'GET', expected_http_status: 200 }
  });
  const text = await sameOriginFetchAndCapture({
    page, sink, origin,
    path: `${prefix}/contexts/${encodeURIComponent(identity.context_id)}/text-projection?${new URLSearchParams({ request_id: `${requestPrefix}.text`, revision: revisionId })}`,
    method: 'GET', body: null,
    expected: { operation_id: 'API-TXT-001', method: 'GET', expected_http_status: 200 }
  });
  const revisions = await sameOriginFetchAndCapture({
    page, sink, origin,
    path: `${prefix}/revisions?${new URLSearchParams({ request_id: `${requestPrefix}.revisions` })}`,
    method: 'GET', body: null,
    expected: { operation_id: 'API-VER-001', method: 'GET', expected_http_status: 200 }
  });
  if (projection.response.body?.meta?.read_revision !== revisionId || text.response.body?.meta?.read_revision !== revisionId
      || !Array.isArray(revisions.response.body?.data) || !revisions.response.body.data.some(item => item?.revision_id === revisionId)) {
    throw evidenceTransaction('Reopen source observations do not bind the final revision.');
  }
  if (typeof snapshotReader !== 'function' || !isRawRef(projection.response.body_ref, 'API_RESPONSE_BODY')) {
    throw evidenceTransaction('Reopen Snapshot reader or Projection raw response ref is missing.');
  }
  const stateDigests = await snapshotReader({ revision_id: revisionId, projection_response_ref: projection.response.body_ref });
  return deepFreeze({
    revision_id: revisionId,
    ...stateDigests,
    projection_response_ref: projection.response.body_ref
  });
}

export async function runControlledLifecycleSession({ invocation_context, manifest, preflight_descriptor, cycle_handlers }) {
  const session = await verifyControlledLifecycleInputs({ invocation_context, manifest, preflight_descriptor, cycle_handlers });
  const cleanup = { runtime_started_count: 0, runtime_terminated_count: 0, web_started_count: 0, web_terminated_count: 0, released_port_count: 0, residual_process_count: 0, residual_listener_count: 0 };
  const releasedPorts = new Set();
  const completed = [];
  const during = [];
  const failures = [];
  let before;
  let after;
  let firstFailure = null;
  let evidenceFailure = null;
  let prepared = null;
  let faultLaunch = null;

  try {
    before = await readGateSnapshot(session);
    if (!sameGateSnapshot(before, session.expected_gate)) firstFailure = gateFailure('BEFORE', null, null);
    for (const cycle of session.schedule) {
      if (firstFailure || evidenceFailure) break;
      if (cycle.process_cycle === 'INITIAL') {
        prepared = await prepareControlledAttempt({
          controlled_bundle_root: session.context.controlled_bundle_root_realpath,
          manifest_root: session.context.manifest_root_realpath,
          manifest_path: session.context.manifest_ref.path,
          profile_asset_root: session.context.profile_asset_root_realpath,
          report_staging_root: session.context.attempt_parent_realpath,
          case_entry: session.case_entries.get(cycle.case_id),
          attempt_ordinal: cycle.attempt_ordinal,
          java_executable: session.context.java_executable_ref.path,
          browser_executable: session.context.browser_executable_ref.path,
          runtime_port: cycle.runtime_port,
          web_port: cycle.web_port
        });
        faultLaunch = await prepareLifecycleFaultLaunch({
          reportRoot: session.context.attempt_parent_realpath,
          manifest: session.manifest,
          caseId: cycle.case_id,
          attemptOrdinal: cycle.attempt_ordinal,
          processControlParent: session.context.process_control_parent_realpath
        });
      }
      const outcome = await runControlledCycle({ session, cycle, prepared, faultLaunch, cleanup, releasedPorts });
      if (outcome.evidence_error) {
        evidenceFailure = outcome.evidence_error;
        break;
      }
      if (outcome.failure) {
        firstFailure = outcome.failure;
        failures.push(outcome.failure);
        break;
      }
      const snapshot = await readGateSnapshot(session);
      if (!sameGateSnapshot(snapshot, session.expected_gate)) {
        firstFailure = gateFailure('DURING', cycle.schedule_id, cycle.process_cycle);
        failures.push(firstFailure);
        break;
      }
      during.push(Object.freeze({ ...snapshot, phase: 'DURING', schedule_id: cycle.schedule_id, process_cycle: cycle.process_cycle, ordinal: cycle.ordinal }));
      completed.push(cycle);
    }
  } catch (error) {
    if (isEvidenceFailure(error)) evidenceFailure = error;
    else if (!firstFailure) {
      firstFailure = executionFailure('DURING', completed.at(-1)?.schedule_id ?? null, completed.at(-1)?.process_cycle ?? null);
      failures.push(firstFailure);
    }
  } finally {
    try {
      after = await readGateSnapshot(session);
      if (!sameGateSnapshot(after, session.expected_gate)) {
        const failure = gateFailure('AFTER', null, null);
        if (!firstFailure || firstFailure.code !== failure.code) failures.push(failure);
        firstFailure = firstFailure?.code === 'PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN' ? firstFailure : failure;
      }
    } catch (error) {
      evidenceFailure = asEvidenceFailure(error);
    }
  }

  if (evidenceFailure) throw asEvidenceFailure(evidenceFailure);
  if (!before || !after) throw evidenceTransaction('Gate observations are incomplete.');
  const artifact = buildGateObservation({ session, before, during, after, failures, firstFailure });
  const reference = await writeGateObservation({ session, artifact });
  const completedScheduleIds = session.schedule.filter(item => completed.some(done => done.ordinal === item.ordinal))
    .reduce((ids, item) => item.process_cycle === 'REOPEN' ? [...ids, item.schedule_id] : ids, []);
  const status = artifact.observation_status;
  if (status === 'PASS_MATCHED' && (completed.length !== 12 || cleanup.runtime_started_count !== 12 || cleanup.runtime_terminated_count !== 12
      || cleanup.web_started_count !== 12 || cleanup.web_terminated_count !== 12 || cleanup.released_port_count !== 12)) {
    throw evidenceTransaction('PASS lifecycle counters are incomplete.');
  }
  return deepFreeze({ status, completed_schedule_ids: completedScheduleIds, completed_cycle_count: completed.length, gate_observation_ref: reference, cleanup });
}

async function verifyControlledLifecycleInputs({ invocation_context, manifest, preflight_descriptor, cycle_handlers }) {
  if (!plainObject(invocation_context) || !plainObject(manifest) || !plainObject(preflight_descriptor)) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled lifecycle inputs are invalid.');
  await verifyCanonicalRawRef(invocation_context.manifest_root_realpath, invocation_context.manifest_ref, manifest, 'E2E_ORCHESTRATION_REF_MISMATCH');
  await verifyCanonicalRawRef(invocation_context.controlled_bundle_root_realpath, invocation_context.preflight_descriptor_ref, preflight_descriptor, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const reportPath = resolve(invocation_context.evidence_staging_root_realpath, invocation_context.preflight_report_ref?.path ?? '');
  await verifyCanonicalAbsoluteRef(reportPath, invocation_context.preflight_report_ref, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const schedule = verifyLifecycleSchedule(invocation_context.execution_schedule, preflight_descriptor);
  const caseEntries = new Map();
  for (const [caseId] of [['E2E-CANVAS-007.ASSET_MISSING'], ['E2E-CANVAS-007.PERSISTENCE_FAILED'], ['E2E-CANVAS-007.READONLY']]) {
    const matches = manifest.cases?.filter(item => item?.case_id === caseId) ?? [];
    if (matches.length !== 1) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Fault case does not exactly join the Manifest.');
    caseEntries.set(caseId, matches[0]);
  }
  verifyHandlerMap(cycle_handlers, schedule);
  const expectedGate = preflight_descriptor.gate_preflight_snapshot;
  if (!plainObject(expectedGate) || expectedGate.state !== 'DISABLED' || !Array.isArray(expectedGate.enabled_capability_ids)
      || expectedGate.enabled_capability_ids.length !== 0 || expectedGate.candidate_loader_status !== 'NOT_ACTIVE') {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Descriptor Gate snapshot is invalid.');
  }
  return deepFreeze({ context: invocation_context, manifest, descriptor: preflight_descriptor, schedule, case_entries: caseEntries, handlers: cycle_handlers, expected_gate: expectedGate });
}

function verifyLifecycleSchedule(value, descriptor) {
  if (!Array.isArray(value) || value.length !== 12 || !Array.isArray(descriptor.fault_attempt_schedule) || !Array.isArray(descriptor.port_allocations)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled lifecycle schedule is invalid.');
  }
  const ports = new Map(descriptor.port_allocations.map(item => [item?.schedule_id, item]));
  const schedules = descriptor.fault_attempt_schedule;
  const output = [];
  for (const [index, item] of value.entries()) {
    const schedule = schedules[Math.floor(index / 2)];
    const allocation = ports.get(schedule?.schedule_id);
    const expectedCycle = index % 2 === 0 ? 'INITIAL' : 'REOPEN';
    if (!plainObject(item) || Object.keys(item).length !== 7 || item.ordinal !== index + 1 || item.schedule_id !== schedule?.schedule_id
        || item.case_id !== schedule?.case_id || item.attempt_ordinal !== schedule?.attempt_ordinal || item.process_cycle !== expectedCycle
        || item.runtime_port !== allocation?.runtime_port || item.web_port !== allocation?.web_port || !validPort(item.runtime_port) || !validPort(item.web_port)) {
      fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Invocation Context schedule differs from Descriptor bytes.');
    }
    output.push(deepFreeze({ ...item }));
  }
  if (new Set(output.flatMap(item => [item.runtime_port, item.web_port])).size !== 12) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Controlled ports are not globally unique by schedule.');
  return Object.freeze(output);
}

function verifyHandlerMap(handlers, schedule) {
  if (!plainObject(handlers) || Object.getPrototypeOf(handlers) !== Object.prototype || !Object.isFrozen(handlers)) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler map must be a frozen plain object.');
  }
  const ids = [...new Set(schedule.map(item => item.schedule_id))];
  if (Object.keys(handlers).length !== ids.length || ids.some(id => !Object.hasOwn(handlers, id))) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler keys are not closed.');
  for (const id of ids) {
    const value = handlers[id];
    if (!plainObject(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
        || Object.keys(value).length !== 2 || typeof value.INITIAL !== 'function' || typeof value.REOPEN !== 'function') {
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Cycle handler entry is invalid.');
    }
  }
}

async function runControlledCycle({ session, cycle, prepared, faultLaunch, cleanup, releasedPorts }) {
  let runtime = null;
  let web = null;
  let sink = null;
  let failure = null;
  let evidenceError = null;
  try {
    await assertPortsFree([cycle.runtime_port, cycle.web_port]);
    const launch = cycle.process_cycle === 'INITIAL' ? faultLaunch : null;
    const runtimeCommand = buildRuntimeLaunchCommand({ javaPath: session.context.java_executable_ref.path, attemptRoot: prepared.attempt_root, runtimePort: cycle.runtime_port, caseId: cycle.case_id, attemptOrdinal: cycle.attempt_ordinal, cycle: cycle.process_cycle, faultLaunch: launch });
    runtime = spawnOwned(runtimeCommand.command, prepared.attempt_root);
    cleanup.runtime_started_count += 1;
    await waitRuntimeReady({ child: runtime, cycle, launch });
    web = spawnOwned([process.execPath, resolve(session.context.source_root_realpath, 'scripts/canvas06-e2e-production-web.mjs'), '--root', prepared.web_dist, '--host', '127.0.0.1', '--port', String(cycle.web_port), '--runtime-origin', `http://127.0.0.1:${cycle.runtime_port}`], prepared.attempt_root);
    cleanup.web_started_count += 1;
    const origin = `http://127.0.0.1:${cycle.web_port}`;
    await waitWebReady({ child: web, origin });
    sink = createObservationSink({ web_origin: origin });
    const result = await session.handlers[cycle.schedule_id][cycle.process_cycle](Object.freeze({ origin, observation_sink: sink.api }));
    if (result !== undefined) throw new E2eRunInputError('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled handler must return undefined.', 2);
  } catch (error) {
    if (error?.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID') evidenceError = error;
    else failure = executionFailure('DURING', cycle.schedule_id, cycle.process_cycle);
  } finally {
    const protectCleanup = async operation => {
      try { await operation(); } catch (error) { evidenceError ??= asEvidenceFailure(error); }
    };
    if (sink) await protectCleanup(() => sink.finalizeProof());
    if (web) await protectCleanup(async () => { await stopOwnedChild(web); cleanup.web_terminated_count += 1; });
    if (runtime) await protectCleanup(async () => { await stopOwnedChild(runtime); cleanup.runtime_terminated_count += 1; });
    if (cycle.process_cycle === 'INITIAL') {
      await protectCleanup(() => removeFaultChallenge({ challengePath: faultLaunch.challenge_path, processControlRoot: faultLaunch.process_control_root }));
    }
    await protectCleanup(async () => {
      await assertPortsFree([cycle.runtime_port, cycle.web_port]);
      releasedPorts.add(cycle.runtime_port); releasedPorts.add(cycle.web_port);
      cleanup.released_port_count = releasedPorts.size;
    });
  }
  return Object.freeze({ failure, evidence_error: evidenceError });
}

function createObservationSink({ web_origin }) {
  let closed = false;
  let bound = null;
  let confirmed = false;
  const requests = new Map();
  const responses = [];
  const waiters = [];
  const samplingListeners = [];
  const sentinelListeners = [];
  const api = {
    attachBrowserPage(page) {
      assertSinkOpen();
      if (bound || !page || typeof page.context !== 'function' || typeof page.on !== 'function' || typeof page.url !== 'function' || page.url() !== 'about:blank') browserProofFailure('Page attach must precede navigation and may occur only once.');
      const context = page.context();
      const browser = context?.browser?.();
      if (!context || !browser || typeof context.on !== 'function' || typeof browser.on !== 'function' || page.isClosed?.()) browserProofFailure('Page does not form an active Browser tree.');
      const state = { page, context, browser, page_closed: false, context_closed: false, browser_disconnected: false, late_event_detected: false, sentinel_active: false };
      const onRequest = request => {
        requests.set(request, true);
      };
      const onResponse = response => {
        const request = response.request?.();
        if (request) requests.delete(request);
        const item = { method: request?.method?.(), url: response.url?.(), status: response.status?.() };
        responses.push(item);
        flushWaiters();
      };
      const onFailed = request => { requests.delete(request); flushWaiters(); };
      const onPageClose = () => { state.page_closed = true; };
      const onContextClose = () => { state.context_closed = true; };
      const onDisconnected = () => { state.browser_disconnected = true; };
      page.on('request', onRequest); page.on('response', onResponse); page.on('requestfailed', onFailed); page.on('close', onPageClose);
      context.on('close', onContextClose); browser.on('disconnected', onDisconnected);
      samplingListeners.push([page, 'request', onRequest], [page, 'response', onResponse], [page, 'requestfailed', onFailed], [page, 'close', onPageClose], [context, 'close', onContextClose], [browser, 'disconnected', onDisconnected]);
      bound = state;
    },
    async confirmBrowserClosed({ browser, context, page }) {
      assertSinkOpen();
      if (!bound || confirmed || browser !== bound.browser || context !== bound.context || page !== bound.page
          || !bound.page_closed || !bound.context_closed || !bound.browser_disconnected || requests.size !== 0) {
        browserProofFailure('Browser close proof is incomplete.');
      }
      installSentinel();
      detach(samplingListeners);
      confirmed = true;
    },
    async waitForApi(expected) {
      assertSinkOpen();
      if (!bound || confirmed || !plainObject(expected) || typeof expected.method !== 'string' || !Number.isInteger(expected.expected_http_status)) {
        browserProofFailure('API wait is not bound to an active Page.');
      }
      const found = responses.find(item => item.method === expected.method && item.status === expected.expected_http_status && isSameOriginApi(item.url, web_origin));
      if (found) return undefined;
      await new Promise((resolveWait, rejectWait) => waiters.push({ expected, resolve: resolveWait, reject: rejectWait }));
    },
    async waitForProjectionRefresh() {
      assertSinkOpen();
      if (!bound || confirmed || requests.size !== 0) browserProofFailure('Projection refresh has pending Page traffic.');
    },
    async recordPrecondition(receipt) {
      assertSinkOpen();
      if (!plainObject(receipt) || !receipt.raw_request || !receipt.actual_request || !receipt.response) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Precondition receipt is incomplete.');
    },
    precondition_client: null
  };
  api.precondition_client = Object.freeze({
    async execute() {
      assertSinkOpen();
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'This controlled Fault session does not authorize a precondition API.');
    }
  });
  Object.freeze(api);
  return Object.freeze({ api, close, finalizeProof });

  function assertSinkOpen() { if (closed) browserProofFailure('Observation sink is closed.'); }
  function flushWaiters() {
    for (const waiter of waiters.splice(0)) {
      const found = responses.find(item => item.method === waiter.expected.method && item.status === waiter.expected.expected_http_status && isSameOriginApi(item.url, web_origin));
      if (found) waiter.resolve();
      else waiters.push(waiter);
    }
  }
  function detach(listeners) { for (const [target, event, listener] of listeners.splice(0)) target.off?.(event, listener); }
  function installSentinel() {
    if (!bound || bound.sentinel_active) browserProofFailure('Browser sentinel state is invalid.');
    const markLate = () => { bound.late_event_detected = true; };
    const { page, context, browser } = bound;
    page.on('request', markLate); page.on('response', markLate); page.on('requestfailed', markLate); page.on('close', markLate);
    context.on('close', markLate); browser.on('disconnected', markLate);
    sentinelListeners.push([page, 'request', markLate], [page, 'response', markLate], [page, 'requestfailed', markLate], [page, 'close', markLate], [context, 'close', markLate], [browser, 'disconnected', markLate]);
    bound.sentinel_active = true;
  }
  function close() {
    if (closed) return;
    closed = true;
    detach(samplingListeners);
    detach(sentinelListeners);
    if (bound) bound.sentinel_active = false;
    for (const waiter of waiters.splice(0)) waiter.reject(new E2eRunInputError('E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', 'Observation sink closed with a pending API wait.', 4));
  }
  function finalizeProof() {
    if (!bound || !confirmed || !bound.sentinel_active || bound.late_event_detected || !bound.page_closed || !bound.context_closed
        || !bound.browser_disconnected || requests.size !== 0 || waiters.length !== 0) {
      close();
      browserProofFailure('Handler settled without a complete Browser close proof.');
    }
    close();
  }
}

export function createFamilyObservationSink({
  web_origin,
  attempt_root,
  case_execution,
  attempt_identity = null,
  setup_baseline = null,
  cycle = 'INITIAL',
  exchange_sequence_start = 0,
  network_sequence_start = 0,
  console_sequence_start = 0,
  reopen_expectation = null,
  snapshot_reader = null
}) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(web_origin) || !isAbsolute(attempt_root) || resolve(attempt_root) !== attempt_root
      || !deepFrozen(case_execution) || !['INITIAL', 'REOPEN'].includes(cycle)
      || !Number.isSafeInteger(exchange_sequence_start) || exchange_sequence_start < 0
      || !Number.isSafeInteger(network_sequence_start) || network_sequence_start < 0
      || !Number.isSafeInteger(console_sequence_start) || console_sequence_start < 0) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family observation sink inputs are invalid.');
  }
  const reopenMode = cycle === 'REOPEN';
  const commonMode = case_execution.manifest_case?.driver_id === 'DRIVER-COMMON';
  const browserContextId = `browser-context.${cycle.toLowerCase()}.${randomBytes(32).toString('hex')}`;
  if (reopenMode) {
    if (setup_baseline !== null || !deepFrozen(attempt_identity)
        || reopen_expectation !== null && (!deepFrozen(reopen_expectation) || typeof snapshot_reader !== 'function'
          || typeof reopen_expectation.revision_id !== 'string' || !isRawRef(reopen_expectation.projection_response_ref, 'API_RESPONSE_BODY')
          || ['revision_document_sha256', 'projection_sha256', 'opl_sha256', 'token_sha256', 'trace_sha256']
            .some(key => !isDigest(reopen_expectation[key])))) {
      fail('E2E_ORCHESTRATION_INPUT_INVALID', 'REOPEN sink requires one final frozen identity, optional verified expectation, and no setup baseline.');
    }
  } else {
    if (reopen_expectation !== null) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'INITIAL sink must not receive a reopen expectation.');
    verifyCommonSetupBaselineSeed({ commonMode, setupBaseline: setup_baseline, identity: attempt_identity });
  }
  let closed = false;
  let bound = null;
  let confirmed = false;
  let identity = attempt_identity;
  let sequence = exchange_sequence_start;
  let networkSequence = network_sequence_start;
  let consoleSequence = console_sequence_start;
  let preconditionState = 'READY';
  let recordedPrecondition = null;
  let armedPreconditionReceipt = null;
  let finalPreconditionReceipt = null;
  let setupBaseline = setup_baseline;
  let resolvedSetupBaseline = null;
  let subjectTransactionBaselineRevision = setupBaseline?.subject_transaction_baseline_revision ?? attempt_identity?.subject_baseline_revision ?? null;
  let subjectBeforeState = null;
  let mutation = null;
  let reopenVerificationState = reopen_expectation === null ? 'NOT_REQUIRED' : 'READY';
  let browserVersion = null;
  let observedReopenState = null;
  let finalizedNetworkRequests = null;
  let finalizedNetworkCounters = null;
  let finalizedConsoleEvents = null;
  let pendingCaptureError = null;
  const receipts = [];
  const preconditionReceipts = [];
  const pendingCaptures = new Set();
  const waiters = [];
  const requestBodies = new Map();
  const networkByRequest = new Map();
  const networkRequests = [];
  const consoleEvents = [];
  const networkCounters = {
    external_request_count: 0,
    websocket_count: 0,
    service_worker_count: 0,
    download_count: 0,
    popup_count: 0
  };
  const samplingListeners = [];
  const sentinelListeners = [];

  const api = {
    attachBrowserPage(page) {
      assertOpen();
      if (bound || !page || typeof page.context !== 'function' || typeof page.on !== 'function' || page.url() !== 'about:blank') browserProofFailure('Family Page attach is invalid.');
      const context = page.context();
      const browser = context?.browser?.();
      if (!context || !browser || typeof context.on !== 'function' || typeof browser.on !== 'function' || page.isClosed?.()) browserProofFailure('Family Page does not form an active Browser tree.');
      const observedVersion = typeof browser.version === 'function' ? browser.version() : null;
      if (observedVersion !== '143.0.7499.4') browserProofFailure('Family Browser version differs from the frozen Chromium patch.');
      browserVersion = observedVersion;
      const state = { page, context, browser, page_closed: false, context_closed: false, browser_disconnected: false, late_event_detected: false, sentinel_active: false };
      const onRequest = request => {
        try {
          const observed = observeFamilyNetworkRequest({ request, webOrigin: web_origin, sequence: ++networkSequence });
          networkByRequest.set(request, observed);
          networkRequests.push(observed);
          if (observed.allow_decision === 'REJECTED') networkCounters.external_request_count += 1;
          if (isSameOriginApi(request.url?.(), web_origin)) requestBodies.set(request, request.postDataBuffer?.() ?? null);
        } catch (error) {
          pendingCaptureError ??= asEvidenceFailure(error);
        }
      };
      const onResponse = response => {
        const request = response.request?.();
        const networkItem = networkByRequest.get(request);
        if (!networkItem) {
          pendingCaptureError ??= evidenceTransaction('Family response has no matching request observation.');
          return;
        }
        const responseStatus = response.status?.();
        if (!Number.isInteger(responseStatus) || responseStatus < 100 || responseStatus > 599) {
          pendingCaptureError ??= evidenceTransaction('Family response status is invalid.');
          return;
        }
        networkItem.status = responseStatus;
        if (!isSameOriginApi(response.url?.(), web_origin)) return;
        const capture = captureFamilyApiExchange({ response, attemptRoot: attempt_root, webOrigin: web_origin, sequence: ++sequence, requestBodies })
          .then(receipt => {
            networkItem.request_body_ref = receipt.exchange_entry.request_ref;
            networkItem.response_body_ref = receipt.exchange_entry.response_ref;
            networkItem.operation_id = receipt.exchange_entry.operation_id;
            networkItem.revision = receipt.exchange_entry.revision;
            bindCommonSetupProjection(receipt);
            receipts.push({ receipt, consumed: false });
            flushWaiters();
            return receipt;
          })
          .catch(error => {
            pendingCaptureError ??= asEvidenceFailure(error);
            for (const waiter of waiters.splice(0)) waiter.reject(pendingCaptureError);
            return undefined;
          })
          .finally(() => pendingCaptures.delete(capture));
        pendingCaptures.add(capture);
      };
      const onRequestFailed = request => {
        const networkItem = networkByRequest.get(request);
        if (!networkItem || networkItem.status !== null) {
          pendingCaptureError ??= evidenceTransaction('Family failed request observation is missing or already completed.');
          return;
        }
        networkItem.failure_code = 'NETWORK_REQUEST_FAILED';
      };
      const recordConsoleEvent = (eventKind, message) => {
        consoleEvents.push({
          sequence: ++consoleSequence,
          event_kind: eventKind,
          message_sha256: sha256(Buffer.from(String(message), 'utf8')),
          source_ref: null,
          allow_decision: 'REJECTED'
        });
      };
      const onWebSocket = socket => {
        networkCounters.websocket_count += 1;
        recordConsoleEvent('UNHANDLED_REJECTION', socket?.url?.() ?? 'websocket');
      };
      const onServiceWorker = worker => {
        networkCounters.service_worker_count += 1;
        recordConsoleEvent('UNHANDLED_REJECTION', worker?.url?.() ?? 'service-worker');
      };
      const onConsole = message => {
        const type = message?.type?.();
        if (type === 'error') recordConsoleEvent('CONSOLE_ERROR', message.text?.() ?? '');
        else if (type === 'warning') recordConsoleEvent('CONSOLE_WARNING', message.text?.() ?? '');
      };
      const onPageError = error => recordConsoleEvent('PAGE_ERROR', error?.message ?? String(error));
      const onDialog = dialog => {
        recordConsoleEvent('DIALOG', dialog?.message?.() ?? 'dialog');
        void dialog?.dismiss?.().catch(error => { pendingCaptureError ??= asEvidenceFailure(error); });
      };
      const onDownload = download => {
        networkCounters.download_count += 1;
        recordConsoleEvent('DOWNLOAD', download?.suggestedFilename?.() ?? 'download');
      };
      const onPopup = popup => {
        networkCounters.popup_count += 1;
        recordConsoleEvent('POPUP', popup?.url?.() ?? 'popup');
      };
      const onPageClose = () => { state.page_closed = true; };
      const onContextClose = () => { state.context_closed = true; };
      const onDisconnected = () => { state.browser_disconnected = true; };
      page.on('request', onRequest); page.on('response', onResponse); page.on('requestfailed', onRequestFailed);
      page.on('websocket', onWebSocket); page.on('console', onConsole); page.on('pageerror', onPageError);
      page.on('dialog', onDialog); page.on('download', onDownload); page.on('popup', onPopup); page.on('close', onPageClose);
      context.on('serviceworker', onServiceWorker); context.on('close', onContextClose); browser.on('disconnected', onDisconnected);
      samplingListeners.push(
        [page, 'request', onRequest], [page, 'response', onResponse], [page, 'requestfailed', onRequestFailed],
        [page, 'websocket', onWebSocket], [page, 'console', onConsole], [page, 'pageerror', onPageError],
        [page, 'dialog', onDialog], [page, 'download', onDownload], [page, 'popup', onPopup], [page, 'close', onPageClose],
        [context, 'serviceworker', onServiceWorker], [context, 'close', onContextClose], [browser, 'disconnected', onDisconnected]
      );
      bound = state;
    },
    async confirmBrowserClosed({ browser, context, page }) {
      assertOpen();
      await Promise.all([...pendingCaptures]);
      assertCaptureHealthy();
      if (!bound || confirmed || browser !== bound.browser || context !== bound.context || page !== bound.page
          || !bound.page_closed || !bound.context_closed || !bound.browser_disconnected) browserProofFailure('Family Browser close proof is incomplete.');
      installSentinel();
      detach(samplingListeners);
      confirmed = true;
    },
    async waitForApi(expected) {
      assertActive();
      assertCaptureHealthy();
      if (!plainObject(expected) || typeof expected.operation_id !== 'string' || typeof expected.method !== 'string'
          || !Number.isSafeInteger(expected.expected_http_status)) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family API wait contract is invalid.');
      const receipt = takeReceipt(expected) ?? await new Promise((resolveWait, rejectWait) => waiters.push({ expected, resolve: resolveWait, reject: rejectWait }));
      assertCaptureHealthy();
      if (mutation && expected.operation_id === 'API-EDT-002' && expected.method === 'POST') await completeCommonMutation(receipt, expected);
      return receipt;
    },
    async waitForProjectionRefresh() {
      assertActive();
      await Promise.all([...pendingCaptures]);
      assertCaptureHealthy();
    },
    async recordPrecondition(receipt) {
      assertActive();
      if (reopenMode) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'REOPEN does not authorize precondition evidence.');
      const direct = receipt?.mode === 'DIRECT_COMMAND' && receipt === lastPreconditionReceipt && completeCommonDirectReceipt(receipt);
      const armed = receipt?.mode === 'REQUEST_MUTATION' && receipt === armedPreconditionReceipt && completeCommonArmedReceipt(receipt);
      const family = !commonMode && receipt === lastPreconditionReceipt && completeReceipt(receipt);
      if (recordedPrecondition || !(direct || armed || family)) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family precondition receipt is not the single client result.');
      recordedPrecondition = receipt;
    },
    async verifyReopen() {
      assertActive();
      if (!reopenMode || reopen_expectation === null || reopenVerificationState !== 'READY') {
        fail('E2E_ORCHESTRATION_INPUT_INVALID', 'REOPEN verification is not available or was reused.');
      }
      reopenVerificationState = 'IN_FLIGHT';
      try {
        const observed = await captureReopenState({
          page: bound.page,
          sink: api,
          identity,
          revisionId: reopen_expectation.revision_id,
          snapshotReader: snapshot_reader
        });
        if (['revision_document_sha256', 'projection_sha256', 'opl_sha256', 'token_sha256', 'trace_sha256']
          .some(key => observed[key] !== reopen_expectation[key])) {
          throw evidenceTransaction('REOPEN StateDigests differ from INITIAL.');
        }
        observedReopenState = observed;
        reopenVerificationState = 'VERIFIED';
      } catch (error) {
        reopenVerificationState = 'FAILED';
        throw error;
      }
      return undefined;
    },
    precondition_client: null
  };
  let lastPreconditionReceipt = null;
  const client = Object.freeze({
    async execute(request) {
      assertActive();
      if (preconditionState !== 'READY') throw new E2eRunInputError('E2E_PRECONDITION_ALREADY_CONSUMED', 'Family precondition client is not reusable.', 2);
      if (commonMode) return executeCommonPrecondition(request);
      verifyFamilyPreconditionRequest({ request, caseExecution: case_execution, identity, receipts, webOrigin: web_origin });
      preconditionState = 'IN_FLIGHT';
      const declaredBytes = Buffer.from(canonicalizeJcs(request.body), 'utf8');
      const declaredRef = await writeFamilyRawFile({ attemptRoot: attempt_root, relativePath: 'api-exchanges/precondition-request.json', bytes: declaredBytes, kind: 'API_REQUEST_BODY' });
      const before = sequence;
      let result;
      try {
        result = await bound.page.evaluate(async ({ path, method, body }) => {
          const response = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body, redirect: 'manual' });
          await response.arrayBuffer();
          return { status: response.status, url: response.url, redirected: response.redirected };
        }, { path: request.path, method: request.method, body: declaredBytes.toString('utf8') });
      } catch (error) {
        preconditionState = 'CONSUMED';
        throw evidenceTransaction(error?.message ?? 'Family same-origin precondition fetch failed.');
      }
      await Promise.all([...pendingCaptures]);
      assertCaptureHealthy();
      const matches = receipts.filter(item => item.receipt.sequence > before && item.receipt.actual_request.method === request.method
        && item.receipt.actual_request.normalized_url === request.path && item.receipt.response.status === result.status);
      if (result.redirected || result.url !== `${web_origin}${request.path}` || matches.length !== 1) {
        preconditionState = 'CONSUMED';
        throw evidenceTransaction('Family precondition response is not the unique same-origin exchange.');
      }
      const observed = matches[0].receipt;
      if (observed.actual_request.body_sha256 !== sha256(declaredBytes)) {
        preconditionState = 'CONSUMED';
        throw evidenceTransaction('Family declared and actual request body bytes differ.');
      }
      matches[0].consumed = true;
      lastPreconditionReceipt = deepFreeze({ ...observed, raw_request: { body: request.body, body_ref: declaredRef, body_sha256: sha256(declaredBytes) } });
      preconditionState = 'CONSUMED';
      return lastPreconditionReceipt;
    }
  });
  api.precondition_client = reopenMode ? null : client;
  Object.freeze(api);
  if (identity !== null) bindAttemptIdentity(identity);
  const result = {
    api,
    bindCommonSetupBaseline,
    bindAttemptIdentity,
    bindSubjectBeforeState,
    subject_transaction_baseline_revision: () => subjectTransactionBaselineRevision,
    finalizeProof,
    close,
    exchanges: receipts,
    precondition_receipts: preconditionReceipts,
    get browser_context_id() { return browserContextId; },
    get browser_version() { return browserVersion; },
    get reopen_state() { return observedReopenState; },
    get subject_before_state() { return subjectBeforeState; },
    get network_requests() { return finalizedNetworkRequests; },
    get network_counters() { return finalizedNetworkCounters; },
    get console_events() { return finalizedConsoleEvents; }
  };
  return Object.freeze(result);

  function bindCommonSetupBaseline(value) {
    if (!commonMode || reopenMode || setupBaseline !== null) {
      fail('E2E_DRIVER_INVOCATION_INVALID', 'Common setup baseline binding is not available.');
    }
    verifyCommonSetupBaselineSeed({ commonMode: true, setupBaseline: value, identity: null });
    setupBaseline = value;
    subjectTransactionBaselineRevision = value.subject_transaction_baseline_revision;
    const candidates = receipts.filter(item => item.receipt.exchange_entry.operation_id === 'API-CTX-002'
      && item.receipt.actual_request.method === 'GET' && item.receipt.response.status === 200
      && (item.receipt.response.body?.meta?.read_revision ?? item.receipt.exchange_entry.revision) === subjectTransactionBaselineRevision);
    if (candidates.length !== 1 || !completeReceipt(candidates[0].receipt)) {
      throw evidenceTransaction('Common setup baseline does not bind one exact Projection exchange.');
    }
    resolvedSetupBaseline = deepFreeze({
      active_binding: value.active_binding,
      projection_receipt: candidates[0].receipt,
      subject_transaction_baseline_revision: value.subject_transaction_baseline_revision
    });
  }

  function bindAttemptIdentity(value) {
    if (identity !== null && identity !== value || !deepFrozen(value) || value.case_id !== case_execution.manifest_case.case_id) {
      fail('E2E_DRIVER_INVOCATION_INVALID', 'Family attempt identity binding is invalid.');
    }
    if (commonMode && !reopenMode && setupBaseline?.subject_transaction_baseline_revision !== value.subject_baseline_revision) {
      fail('E2E_DRIVER_INVOCATION_INVALID', 'Common setup baseline differs from the bound attempt identity.');
    }
    identity = value;
  }
  function bindSubjectBeforeState(value) {
    if (reopenMode || subjectBeforeState !== null || !identity || !deepFrozen(value)
        || value.revision_id !== subjectTransactionBaselineRevision || !isRawRef(value.projection_response_ref, 'API_RESPONSE_BODY')) {
      fail('E2E_DRIVER_INVOCATION_INVALID', 'Subject before state binding is invalid.');
    }
    subjectBeforeState = value;
  }
  function assertOpen() { if (closed) browserProofFailure('Family observation sink is closed.'); }
  function assertActive() { assertOpen(); if (!bound || confirmed) browserProofFailure('Family observation sink has no active Page.'); }
  function assertCaptureHealthy() { if (pendingCaptureError) throw pendingCaptureError; }
  function takeReceipt(expected) {
    const match = receipts.find(item => !item.consumed && receiptMatches(item.receipt, expected));
    if (!match) return null;
    match.consumed = true;
    return match.receipt;
  }
  function flushWaiters() {
    for (const waiter of waiters.splice(0)) {
      const receipt = takeReceipt(waiter.expected);
      if (receipt) waiter.resolve(receipt); else waiters.push(waiter);
    }
  }
  async function executeCommonPrecondition(request) {
    const definition = verifyCommonPreconditionRequest({ request, caseExecution: case_execution, identity });
    if (!resolvedSetupBaseline) throw new E2eRunInputError('E2E_PRECONDITION_BASELINE_INVALID', 'Common setup Projection is not bound.', 4);
    if (definition.mode === 'DIRECT_COMMAND') return executeCommonDirectCommand(request, definition);
    return armCommonRequestMutation(request, definition);
  }
  async function executeCommonDirectCommand(request, definition) {
    preconditionState = 'IN_FLIGHT';
    verifyCommonDirectProjection(definition, identity, resolvedSetupBaseline.projection_receipt.response.body);
    const body = commonDirectCommandBody({ definition, identity, binding: resolvedSetupBaseline.active_binding });
    const declaredBytes = Buffer.from(canonicalizeJcs(body), 'utf8');
    const declaredRef = await writeFamilyRawFile({ attemptRoot: attempt_root, relativePath: 'api-exchanges/precondition-request.json', bytes: declaredBytes, kind: 'API_REQUEST_BODY' });
    const before = sequence;
    let result;
    try {
      result = await bound.page.evaluate(async ({ path, method, body: serialized }) => {
        const response = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: serialized, redirect: 'manual' });
        await response.arrayBuffer();
        return { status: response.status, url: response.url, redirected: response.redirected };
      }, { path: definition.command_path, method: 'POST', body: declaredBytes.toString('utf8') });
    } catch (error) {
      preconditionState = 'CONSUMED';
      throw evidenceTransaction(error?.message ?? 'Common same-origin precondition fetch failed.');
    }
    await Promise.all([...pendingCaptures]);
    assertCaptureHealthy();
    const matches = receipts.filter(item => item.receipt.sequence > before && item.receipt.actual_request.method === 'POST'
      && item.receipt.actual_request.normalized_url === definition.command_path && item.receipt.response.status === result.status);
    if (result.redirected || result.url !== `${web_origin}${definition.command_path}` || matches.length !== 1) {
      preconditionState = 'CONSUMED';
      throw evidenceTransaction('Common DIRECT_COMMAND response is not the unique same-origin exchange.');
    }
    const observed = matches[0].receipt;
    if (observed.actual_request.body_sha256 !== sha256(declaredBytes) || !commonResponseMatches(observed, definition)) {
      preconditionState = 'CONSUMED';
      throw evidenceTransaction('Common DIRECT_COMMAND request or response differs from the frozen definition.');
    }
    const baselineRebind = definition.kind === 'ADVANCE_HEAD' ? commonBaselineRebind({ observed, definition, identity }) : null;
    if (baselineRebind) {
      if (!subjectBeforeState || subjectBeforeState.revision_id !== baselineRebind.from_revision || typeof snapshot_reader !== 'function') {
        throw new E2eRunInputError('E2E_PRECONDITION_BASELINE_INVALID', 'ADVANCE_HEAD cannot rebind an unverified subject baseline.', 4);
      }
      subjectTransactionBaselineRevision = baselineRebind.to_revision;
      subjectBeforeState = await captureReopenState({
        page: bound.page,
        sink: api,
        identity,
        revisionId: baselineRebind.to_revision,
        snapshotReader: snapshot_reader,
        requestPrefix: `e2e.subject.rebind.${identity.attempt_ordinal}`
      });
    }
    const receipt = deepFreeze({
      mode: definition.mode,
      kind: definition.kind,
      source_locator: request.source_observation_ref,
      resolved_source_refs: {
        setup_projection_exchange_ref: resolvedSetupBaseline.projection_receipt.exchange_ref,
        setup_projection_response_ref: resolvedSetupBaseline.projection_receipt.response.body_ref
      },
      raw_request: { body, body_ref: declaredRef, body_sha256: sha256(declaredBytes) },
      actual_request: observed.actual_request,
      response: observed.response,
      exchange_ref: observed.exchange_ref,
      baseline_rebind: baselineRebind
    });
    lastPreconditionReceipt = receipt;
    preconditionReceipts.push(receipt);
    preconditionState = 'CONSUMED';
    return receipt;
  }
  async function armCommonRequestMutation(request, definition) {
    const source = resolveCommonMutationSource({ definition, receipts, webOrigin: web_origin });
    source.item.consumed = true;
    const match = deepFreeze({
      operation_id: 'API-EDT-002', method: 'POST', normalized_url: definition.command_path,
      command_type: definition.command_type, base_revision: identity.subject_baseline_revision
    });
    const routeMatcher = `${web_origin}${definition.command_path}`;
    const routeHandler = async route => {
      try {
        if (mutation?.match_count) throw new E2eRunInputError('E2E_PRECONDITION_MULTIPLE_MATCH', 'Common mutation matched more than one request.', 4);
        const browserRequest = route?.request?.();
        const originalBytes = browserRequest?.postDataBuffer?.();
        if (!browserRequest || browserRequest.method?.() !== 'POST' || browserRequest.url?.() !== routeMatcher || !Buffer.isBuffer(originalBytes)) {
          throw evidenceTransaction('Common mutation route did not receive the exact request.');
        }
        const originalBody = parseRequestBody(originalBytes);
        const originalValue = verifyCommonMutationBody({ body: originalBody, definition, source, binding: resolvedSetupBaseline.active_binding });
        const mutatedBody = structuredClone(originalBody);
        if (definition.kind === 'REPLACE_OPTION_ID') mutatedBody.payload.selected_option_id = definition.replacement;
        else mutatedBody.payload.impact_token = definition.replacement;
        const actualBytes = Buffer.from(canonicalizeJcs(mutatedBody), 'utf8');
        const originalRef = await writeFamilyRawFile({ attemptRoot: attempt_root, relativePath: 'api-exchanges/precondition-original-request.json', bytes: originalBytes, kind: 'API_REQUEST_BODY' });
        mutation.match_count = 1;
        mutation.original_value = originalValue;
        mutation.original_request_ref = originalRef;
        mutation.actual_body_sha256 = sha256(actualBytes);
        mutation.state = 'MATCHED';
        preconditionState = 'MATCHED';
        if (typeof route.continue !== 'function') throw evidenceTransaction('Common mutation route continue is unavailable.');
        await route.continue({ postData: actualBytes.toString('utf8') });
      } catch (error) {
        pendingCaptureError ??= error instanceof E2eRunInputError ? error : asEvidenceFailure(error);
        throw pendingCaptureError;
      }
    };
    mutation = {
      definition, source, match, route_matcher: routeMatcher, route_handler: routeHandler,
      match_count: 0, original_value: null, original_request_ref: null, actual_body_sha256: null, state: 'ARMED'
    };
    if (typeof bound.page.route !== 'function') throw evidenceTransaction('Common mutation route API is unavailable.');
    await bound.page.route(routeMatcher, routeHandler);
    armedPreconditionReceipt = deepFreeze({
      mode: definition.mode,
      kind: definition.kind,
      source_locator: request.source_observation_ref,
      source_exchange_ref: source.receipt.exchange_ref,
      match,
      json_pointer: definition.json_pointer,
      replacement: definition.replacement,
      state: 'ARMED'
    });
    preconditionState = 'ARMED';
    return armedPreconditionReceipt;
  }
  async function completeCommonMutation(receipt, expected) {
    if (!mutation || mutation.state !== 'MATCHED' || mutation.match_count !== 1 || !mutation.original_request_ref
        || receipt.actual_request.body_sha256 !== mutation.actual_body_sha256 || !isRawRef(receipt.actual_request.body_ref, 'API_REQUEST_BODY')
        || !commonResponseMatches(receipt, mutation.definition)
        || receipt.response.status !== expected.expected_http_status || expected.expected_error_code !== mutation.definition.expected_error_code) {
      throw evidenceTransaction('Common mutation final exchange differs from the frozen match.');
    }
    await bound.page.unroute?.(mutation.route_matcher, mutation.route_handler);
    finalPreconditionReceipt = deepFreeze({
      mode: mutation.definition.mode,
      kind: mutation.definition.kind,
      source_locator: 'setup-baseline-api',
      source_exchange_ref: mutation.source.receipt.exchange_ref,
      match: mutation.match,
      json_pointer: mutation.definition.json_pointer,
      original_value: mutation.original_value,
      replacement: mutation.definition.replacement,
      original_request_ref: mutation.original_request_ref,
      actual_request_ref: receipt.actual_request.body_ref,
      response: receipt.response,
      exchange_ref: receipt.exchange_ref,
      state: 'CONSUMED'
    });
    mutation.state = 'CONSUMED';
    preconditionState = 'CONSUMED';
    preconditionReceipts.push(finalPreconditionReceipt);
  }
  function bindCommonSetupProjection(receipt) {
    if (reopenMode || !commonMode || resolvedSetupBaseline || setupBaseline === null || receipt.exchange_entry.operation_id !== 'API-CTX-002'
        || receipt.actual_request.method !== 'GET' || receipt.response.status !== 200) return;
    const revision = receipt.response.body?.meta?.read_revision ?? receipt.exchange_entry.revision;
    if (revision !== setupBaseline.subject_transaction_baseline_revision || !completeReceipt(receipt)) {
      pendingCaptureError ??= evidenceTransaction('Common setup Projection differs from the frozen baseline seed.');
      return;
    }
    resolvedSetupBaseline = deepFreeze({
      active_binding: setupBaseline.active_binding,
      projection_receipt: receipt,
      subject_transaction_baseline_revision: setupBaseline.subject_transaction_baseline_revision
    });
  }
  function installSentinel() {
    if (!bound || bound.sentinel_active) browserProofFailure('Family Browser sentinel state is invalid.');
    const markLate = () => { bound.late_event_detected = true; };
    for (const [target, event] of [
      [bound.page, 'request'], [bound.page, 'response'], [bound.page, 'requestfailed'], [bound.page, 'websocket'],
      [bound.page, 'console'], [bound.page, 'pageerror'], [bound.page, 'dialog'], [bound.page, 'download'],
      [bound.page, 'popup'], [bound.page, 'close'], [bound.context, 'serviceworker'], [bound.context, 'close'],
      [bound.browser, 'disconnected']
    ]) {
      target.on(event, markLate); sentinelListeners.push([target, event, markLate]);
    }
    bound.sentinel_active = true;
  }
  function detach(listeners) { for (const [target, event, listener] of listeners.splice(0)) target.off?.(event, listener); }
  function close() {
    if (closed) return;
    closed = true;
    if (preconditionState === 'READY') preconditionState = 'CLOSED';
    detach(samplingListeners); detach(sentinelListeners);
    if (bound) bound.sentinel_active = false;
    if (mutation?.route_handler && typeof bound?.page?.unroute === 'function') {
      void bound.page.unroute(mutation.route_matcher, mutation.route_handler).catch(() => undefined);
    }
    for (const waiter of waiters.splice(0)) waiter.reject(browserProofFailureValue('Family observation sink closed with a pending API wait.'));
  }
  async function finalizeProof() {
    await Promise.all([...pendingCaptures]);
    if (pendingCaptureError) {
      close();
      throw pendingCaptureError;
    }
    if (mutation?.state === 'ARMED') {
      close();
      throw new E2eRunInputError('E2E_PRECONDITION_MATCH_MISSING', 'Common mutation did not match a subject request.', 4);
    }
    const requiresPrecondition = !reopenMode && (case_execution.subject_steps?.some(step => step.type === 'PRECONDITION_API')
      ?? (!commonMode && case_execution.manifest_case.expectation === 'BLOCKED'));
    const commonMutationComplete = mutation && preconditionState === 'CONSUMED' && recordedPrecondition === armedPreconditionReceipt && finalPreconditionReceipt;
    const commonDirectComplete = commonMode && !mutation && preconditionState === 'CONSUMED' && recordedPrecondition === lastPreconditionReceipt;
    const familyComplete = !commonMode && preconditionState === 'CONSUMED' && recordedPrecondition === lastPreconditionReceipt;
    if (!bound || !confirmed || !bound.sentinel_active || bound.late_event_detected || waiters.length !== 0 || preconditionState === 'IN_FLIGHT'
        || networkRequests.some(item => item.status === null && item.failure_code === null)
        || !reopenMode && (!subjectBeforeState || subjectBeforeState.revision_id !== subjectTransactionBaselineRevision)
        || !reopenMode && commonMode && !resolvedSetupBaseline
        || reopenMode && reopen_expectation !== null && reopenVerificationState !== 'VERIFIED'
        || requiresPrecondition && !(commonMutationComplete || commonDirectComplete || familyComplete)
        || !requiresPrecondition && !reopenMode && preconditionState !== 'READY') {
      close();
      browserProofFailure('Family handler settled without complete Browser/API proof.');
    }
    finalizedNetworkRequests = deepFreeze(structuredClone(networkRequests));
    finalizedNetworkCounters = deepFreeze({ ...networkCounters });
    finalizedConsoleEvents = deepFreeze(structuredClone(consoleEvents));
    close();
  }
}

export async function writeFamilyApiExchangeIndex({ attempt_root, case_id, attempt_ordinal, exchanges, precondition_receipts }) {
  if (!isAbsolute(attempt_root) || !Array.isArray(exchanges) || !Array.isArray(precondition_receipts)
      || precondition_receipts.length > 1) {
    throw evidenceTransaction('Family API Exchange Index inputs are invalid.');
  }
  const attemptRelative = attemptRelativeRoot(case_id, attempt_ordinal);
  const attemptSegments = attemptRelative.split('/');
  let reportRoot = resolve(attempt_root);
  for (let index = 0; index < attemptSegments.length; index += 1) reportRoot = dirname(reportRoot);
  if (resolve(reportRoot, attemptRelative) !== resolve(attempt_root)) {
    throw evidenceTransaction('Family attempt root does not match the frozen case identity path.');
  }
  const receipts = exchanges.map(item => item?.receipt);
  if (receipts.some((receipt, index) => !completeReceipt(receipt) || receipt.exchange_entry?.sequence !== index + 1)) {
    throw evidenceTransaction('Family API exchanges are incomplete or not contiguous.');
  }
  const indexedExchanges = receipts.map(receipt => receipt.exchange_entry);
  const artifact = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001',
    schema_version: '0.2',
    case_id,
    attempt_ordinal,
    exchanges: indexedExchanges,
    exchange_set_sha256: sha256(Buffer.from(canonicalizeJcs(indexedExchanges), 'utf8'))
  };
  const indexRef = await writeAttemptArtifact({
    reportRoot,
    caseId: case_id,
    attemptOrdinal: attempt_ordinal,
    filename: 'api-exchanges/index.json',
    artifact
  });
  const refs = new Map();
  for (const receipt of receipts) {
    addDynamicRef(refs, receipt.exchange_ref);
    addDynamicRef(refs, receipt.exchange_entry.request_ref);
    addDynamicRef(refs, receipt.exchange_entry.response_ref);
  }
  for (const receipt of precondition_receipts) {
    if (!deepFrozen(receipt) || receipt.state === 'ARMED') throw evidenceTransaction('Family precondition receipt is not final.');
    addDynamicRef(refs, receipt.raw_request?.body_ref);
    addDynamicRef(refs, receipt.original_request_ref);
    addDynamicRef(refs, receipt.actual_request_ref);
    addDynamicRef(refs, receipt.exchange_ref);
  }
  const dynamicEntries = [...refs.values()].map(reference => ({
    kind: reference.kind,
    path: `${attemptRelative}/${reference.path}`,
    media_type: 'application/json',
    capture_phase: 'ACTION',
    required: true
  })).sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')));
  return deepFreeze({ index_ref: indexRef, dynamic_entries: dynamicEntries });
}

function addDynamicRef(refs, reference) {
  if (reference === null || reference === undefined) return;
  if (!isRawRef(reference, reference.kind) || !['API_EXCHANGE', 'API_REQUEST_BODY', 'API_RESPONSE_BODY'].includes(reference.kind)
      || !reference.path.startsWith('api-exchanges/')) {
    throw evidenceTransaction('Family dynamic API reference is invalid.');
  }
  const existing = refs.get(reference.path);
  if (existing && !sameRef(existing, reference)) throw evidenceTransaction('Family dynamic API reference path collides.');
  refs.set(reference.path, reference);
}

function observeFamilyNetworkRequest({ request, webOrigin, sequence }) {
  const method = request?.method?.();
  const rawUrl = request?.url?.();
  const resourceTypes = {
    document: 'DOCUMENT', stylesheet: 'STYLESHEET', image: 'IMAGE', media: 'MEDIA', font: 'FONT',
    script: 'SCRIPT', xhr: 'XHR', fetch: 'FETCH', eventsource: 'EVENTSOURCE', websocket: 'WEBSOCKET',
    manifest: 'MANIFEST', other: 'OTHER'
  };
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)
      || typeof rawUrl !== 'string' || !rawUrl) {
    throw evidenceTransaction('Family network request identity is invalid.');
  }
  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw evidenceTransaction('Family network request URL is invalid.'); }
  const sameOrigin = parsed.origin === webOrigin && ['http:', 'https:'].includes(parsed.protocol);
  parsed.hash = '';
  return {
    sequence,
    method,
    normalized_url: sameOrigin ? `${parsed.pathname}${parsed.search}` : parsed.href,
    resource_type: resourceTypes[request.resourceType?.()] ?? 'OTHER',
    status: null,
    failure_code: null,
    request_body_ref: null,
    response_body_ref: null,
    operation_id: null,
    revision: null,
    allow_decision: sameOrigin ? 'ALLOWED' : 'REJECTED'
  };
}

function sumNetworkCounters(left, right) {
  const keys = ['external_request_count', 'websocket_count', 'service_worker_count', 'download_count', 'popup_count'];
  if (![left, right].every(value => plainObject(value) && keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0))) {
    throw evidenceTransaction('Network observation counters are incomplete.');
  }
  return deepFreeze(Object.fromEntries(keys.map(key => [key, left[key] + right[key]])));
}

async function captureFamilyApiExchange({ response, attemptRoot, webOrigin, sequence, requestBodies }) {
  const request = response.request();
  const url = new URL(response.url());
  if (url.origin !== webOrigin) throw evidenceTransaction('Family API response origin drifted.');
  const normalizedUrl = `${url.pathname}${url.search}`;
  const operationId = familyOperationId(request.method(), url.pathname);
  const requestBytes = requestBodies.get(request) ?? request.postDataBuffer?.() ?? null;
  const responseBytes = Buffer.from(await response.body());
  const prefix = `api-exchanges/exchange-${String(sequence).padStart(6, '0')}`;
  const requestRef = requestBytes === null ? null : await writeFamilyRawFile({ attemptRoot, relativePath: `${prefix}.request.json`, bytes: Buffer.from(requestBytes), kind: 'API_REQUEST_BODY' });
  const responseRef = await writeFamilyRawFile({ attemptRoot, relativePath: `${prefix}.response.json`, bytes: responseBytes, kind: 'API_RESPONSE_BODY' });
  let responseBody;
  try { responseBody = JSON.parse(responseBytes.toString('utf8')); }
  catch { throw evidenceTransaction('Family API response body is not JSON.'); }
  const entry = {
    sequence, operation_id: operationId, method: request.method(), normalized_url: normalizedUrl,
    request_ref: requestRef, response_ref: responseRef, status: response.status(),
    revision: responseBody?.meta?.committed_revision ?? responseBody?.meta?.read_revision ?? null
  };
  const exchangeBytes = Buffer.from(`${canonicalizeJcs(entry)}\n`, 'utf8');
  const exchangeRef = await writeFamilyRawFile({ attemptRoot, relativePath: `${prefix}.json`, bytes: exchangeBytes, kind: 'API_EXCHANGE' });
  const indexedEntry = deepFreeze({ ...entry, exchange_ref: exchangeRef });
  return deepFreeze({
    sequence,
    raw_request: { body: requestBytes === null ? null : parseRequestBody(requestBytes), body_ref: requestRef, body_sha256: requestBytes === null ? null : sha256(requestBytes) },
    actual_request: { method: request.method(), normalized_url: normalizedUrl, body_ref: requestRef, body_sha256: requestBytes === null ? null : sha256(requestBytes) },
    response: { status: response.status(), body: responseBody, body_ref: responseRef },
    exchange_ref: exchangeRef,
    exchange_entry: indexedEntry
  });
}

function verifyFamilyPreconditionRequest({ request, caseExecution, identity, receipts, webOrigin }) {
  if (!deepFrozen(request) || !identity || request.case_id !== caseExecution.manifest_case.case_id || request.operation_id !== 'API-EDT-002'
      || request.method !== 'POST' || request.path !== familyCommandPath(identity) || !request.path.startsWith('/api/v1/')
      || request.body?.base_revision !== identity.subject_baseline_revision || request.body?.command_type !== caseExecution.expected_api.command_type
      || request.expected_http_status !== caseExecution.expected_api.expected_http_status || request.expected_error_code !== caseExecution.expected_error?.top_error_code
      || !isRawRef(request.candidate_exchange_ref, 'API_EXCHANGE')
      || !receipts.some(item => sameRef(item.receipt.exchange_ref, request.candidate_exchange_ref)) || new URL(request.path, webOrigin).origin !== webOrigin) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family precondition request differs from the frozen case definition.');
  }
}

function verifyCommonSetupBaselineSeed({ commonMode, setupBaseline, identity }) {
  if (!commonMode) {
    if (setupBaseline !== null) fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Family setup baseline must be null.');
    return;
  }
  if (setupBaseline === null && identity === null) return;
  const bindingKeys = ['profile_id', 'profile_version', 'rule_set_id', 'rule_version'];
  if (!deepFrozen(setupBaseline) || !sameStringSet(Object.keys(setupBaseline ?? {}), ['active_binding', 'subject_transaction_baseline_revision'])
      || !plainObject(setupBaseline.active_binding) || !sameStringSet(Object.keys(setupBaseline.active_binding), bindingKeys)
      || bindingKeys.some(key => typeof setupBaseline.active_binding[key] !== 'string' || !setupBaseline.active_binding[key])
      || typeof setupBaseline.subject_transaction_baseline_revision !== 'string' || !setupBaseline.subject_transaction_baseline_revision
      || identity && setupBaseline.subject_transaction_baseline_revision !== identity.subject_baseline_revision) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Common setup baseline seed is invalid.');
  }
}

function verifyCommonPreconditionRequest({ request, caseExecution, identity }) {
  const keys = ['case_id', 'attempt_identity', 'type', 'kind', 'source_observation_ref', 'expected_apis'];
  const definition = commonPreconditionDefinition(request?.case_id, request?.kind, identity);
  if (!deepFrozen(request) || !sameStringSet(Object.keys(request ?? {}), keys) || request.case_id !== caseExecution.case_id
      || request.attempt_identity !== identity || request.type !== 'PRECONDITION_API' || request.source_observation_ref !== 'setup-baseline-api'
      || canonicalizeJcs(request.expected_apis) !== canonicalizeJcs(caseExecution.expected_apis) || !definition) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Common precondition request differs from the frozen case definition.');
  }
  return definition;
}

function commonPreconditionDefinition(caseId, kind, identity) {
  if (!identity || identity.case_id !== caseId || ![1, 2].includes(identity.attempt_ordinal)) return null;
  const definitions = {
    'E2E-CANVAS-005.STALE_OPTION_BLOCKED': { kind: 'REPLACE_OPTION_ID', mode: 'REQUEST_MUTATION', command_type: 'CREATE_FACT', expected_http_status: 422, expected_error_code: 'DOMAIN_REJECTED', json_pointer: '/payload/selected_option_id', replacement: 'option.e2e.invalid.stale' },
    'E2E-CANVAS-006.STALE_TOKEN_BLOCKED': { kind: 'ADVANCE_HEAD', mode: 'DIRECT_COMMAND', command_type: 'CREATE_ELEMENT', expected_http_status: 200, expected_error_code: null },
    'E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED': { kind: 'REPLACE_IMPACT_TOKEN', mode: 'REQUEST_MUTATION', command_type: 'DELETE_CONSTRUCT', expected_http_status: 422, expected_error_code: 'DOMAIN_REJECTED', json_pointer: '/payload/impact_token', replacement: 'impact.e2e.mismatched.token' },
    'E2E-CANVAS-007.TEXT_BLOCKED': { kind: 'SUBMIT_TEXT_BLOCKED_COMMAND', mode: 'DIRECT_COMMAND', command_type: 'CREATE_FACT', expected_http_status: 422, expected_error_code: 'DOMAIN_REJECTED' },
    'E2E-CANVAS-007.REVISION_CONFLICT': { kind: 'ADVANCE_HEAD', mode: 'DIRECT_COMMAND', command_type: 'CREATE_ELEMENT', expected_http_status: 200, expected_error_code: null },
    'E2E-CANVAS-007.READONLY': { kind: 'SUBMIT_READONLY_COMMAND', mode: 'DIRECT_COMMAND', command_type: 'CREATE_FACT', expected_http_status: 409, expected_error_code: 'READ_ONLY_REVISION' }
  };
  const value = definitions[caseId];
  if (!value || value.kind !== kind) return null;
  return deepFreeze({ ...value, command_path: familyCommandPath(identity), base_revision: identity.subject_baseline_revision });
}

function commonDirectCommandBody({ definition, identity, binding }) {
  const kindSlug = definition.kind.toLowerCase().replaceAll('_', '-');
  let payload;
  if (definition.kind === 'ADVANCE_HEAD') {
    payload = {
      kind: 'OBJECT', element_id: `object.common.precondition.advance.${identity.attempt_ordinal}`,
      name: `E2E Precondition Advance ${identity.attempt_ordinal}`, layout: { x: 24, y: 24 }
    };
  } else if (definition.kind === 'SUBMIT_TEXT_BLOCKED_COMMAND') {
    payload = {
      kind: 'CONSUMPTION', object_id: 'object.common.input', state_id: 'state.common.text-blocked.missing',
      process_id: 'process.common.action', layout: { x: 250, y: 160 }
    };
  } else {
    payload = { kind: 'CONSUMPTION', object_id: 'object.common.input', process_id: 'process.common.action', layout: { x: 250, y: 160 } };
  }
  return {
    request_id: `e2e.precondition.${identity.attempt_ordinal}.${kindSlug}.request`,
    command_id: `e2e.precondition.${identity.attempt_ordinal}.${kindSlug}.command`,
    base_revision: identity.subject_baseline_revision,
    binding,
    command_type: definition.command_type,
    payload
  };
}

function verifyCommonDirectProjection(definition, identity, projectionBody) {
  const ids = new Set(projectionBody?.data?.constructs?.map(item => item?.target_id) ?? []);
  if (!ids.has('object.common.input') || !ids.has('process.common.action')
      || definition.kind === 'SUBMIT_TEXT_BLOCKED_COMMAND' && ids.has('state.common.text-blocked.missing')
      || definition.kind === 'ADVANCE_HEAD' && ids.has(`object.common.precondition.advance.${identity.attempt_ordinal}`)) {
    throw new E2eRunInputError('E2E_PRECONDITION_BASELINE_INVALID', 'Common setup Projection does not satisfy the direct command precondition.', 4);
  }
}

function commonResponseMatches(receipt, definition) {
  if (receipt.response.status !== definition.expected_http_status) return false;
  if (definition.expected_error_code !== null) {
    return receipt.response.body?.error?.code === definition.expected_error_code && receipt.response.body?.error?.retryable === false;
  }
  const committed = receipt.response.body?.meta?.committed_revision;
  return receipt.response.body?.meta?.status === 'COMMITTED' && typeof committed === 'string' && committed.length > 0
    && Array.isArray(receipt.response.body?.data?.affected_ids);
}

function commonBaselineRebind({ observed, identity }) {
  const committed = observed.response.body?.meta?.committed_revision;
  const elementId = `object.common.precondition.advance.${identity.attempt_ordinal}`;
  if (typeof committed !== 'string' || !committed || committed === identity.subject_baseline_revision
      || !observed.response.body?.data?.affected_ids?.includes(elementId)) {
    throw new E2eRunInputError('E2E_PRECONDITION_BASELINE_INVALID', 'ADVANCE_HEAD did not commit the exact baseline element.', 4);
  }
  return deepFreeze({ from_revision: identity.subject_baseline_revision, to_revision: committed, baseline_exchange_ref: observed.exchange_ref });
}

function resolveCommonMutationSource({ definition, receipts, webOrigin }) {
  const matches = receipts.filter(item => !item.consumed && item.receipt.exchange_entry.operation_id === 'API-EDT-001'
    && item.receipt.actual_request.method === 'GET' && item.receipt.response.status === 200)
    .filter(item => {
      const url = new URL(item.receipt.actual_request.normalized_url, webOrigin);
      if (definition.kind === 'REPLACE_OPTION_ID') {
        const endpoints = url.searchParams.getAll('endpoint');
        return url.searchParams.get('intent') === 'CREATE_FACT' && endpoints.length === 2
          && endpoints.includes('object.common.input') && endpoints.includes('process.common.action');
      }
      return url.searchParams.get('selection_id') === 'state.common.subject' && url.searchParams.get('intent') === 'DELETE_CONSTRUCT';
    });
  if (matches.length !== 1 || !completeReceipt(matches[0].receipt)) {
    throw new E2eRunInputError('E2E_PRECONDITION_SOURCE_INVALID', 'Common mutation source locator did not resolve exactly one exchange.', 4);
  }
  const data = matches[0].receipt.response.body?.data;
  if (typeof data?.capability_query_id !== 'string' || !data.capability_query_id || !Array.isArray(data.options)) {
    throw new E2eRunInputError('E2E_PRECONDITION_SOURCE_INVALID', 'Common mutation source payload is invalid.', 4);
  }
  if (definition.kind === 'REPLACE_OPTION_ID') {
    const optionIds = data.options.map(option => option?.option_id).filter(value => typeof value === 'string' && value);
    if (optionIds.length === 0 || optionIds.includes(definition.replacement)) throw new E2eRunInputError('E2E_PRECONDITION_SOURCE_INVALID', 'Common option source is invalid.', 4);
    return { item: matches[0], receipt: matches[0].receipt, capability_query_id: data.capability_query_id, option_ids: optionIds };
  }
  const enabled = data.options.filter(option => option?.enabled === true && option?.command_type === 'DELETE_CONSTRUCT' && typeof option?.impact_token === 'string' && option.impact_token);
  if (enabled.length !== 1 || enabled[0].impact_token === definition.replacement) throw new E2eRunInputError('E2E_PRECONDITION_SOURCE_INVALID', 'Common impact source is invalid.', 4);
  return { item: matches[0], receipt: matches[0].receipt, impact_token: enabled[0].impact_token };
}

function verifyCommonMutationBody({ body, definition, source, binding }) {
  if (!plainObject(body) || body.command_type !== definition.command_type || body.base_revision !== definition.base_revision
      || typeof body.request_id !== 'string' || !body.request_id || typeof body.command_id !== 'string' || !body.command_id
      || canonicalizeJcs(body.binding) !== canonicalizeJcs(binding) || !plainObject(body.payload)) {
    throw evidenceTransaction('Common mutation request body is invalid.');
  }
  if (definition.kind === 'REPLACE_OPTION_ID') {
    if (body.payload.capability_query_id !== source.capability_query_id || !source.option_ids.includes(body.payload.selected_option_id)) {
      throw evidenceTransaction('Common option mutation old value differs from the source exchange.');
    }
    return body.payload.selected_option_id;
  }
  if (body.payload.construct_kind !== 'STATE' || body.payload.construct_id !== 'state.common.subject' || body.payload.impact_token !== source.impact_token) {
    throw evidenceTransaction('Common impact mutation old value differs from the source exchange.');
  }
  return body.payload.impact_token;
}

function completeCommonDirectReceipt(value) {
  return deepFrozen(value) && sameStringSet(Object.keys(value), ['mode', 'kind', 'source_locator', 'resolved_source_refs', 'raw_request', 'actual_request', 'response', 'exchange_ref', 'baseline_rebind'])
    && value.source_locator === 'setup-baseline-api' && completeReceipt(value) && plainObject(value.resolved_source_refs)
    && sameStringSet(Object.keys(value.resolved_source_refs), ['setup_projection_exchange_ref', 'setup_projection_response_ref'])
    && isRawRef(value.resolved_source_refs.setup_projection_exchange_ref, 'API_EXCHANGE')
    && isRawRef(value.resolved_source_refs.setup_projection_response_ref, 'API_RESPONSE_BODY');
}

function completeCommonArmedReceipt(value) {
  return deepFrozen(value) && sameStringSet(Object.keys(value), ['mode', 'kind', 'source_locator', 'source_exchange_ref', 'match', 'json_pointer', 'replacement', 'state'])
    && value.source_locator === 'setup-baseline-api' && value.state === 'ARMED' && isRawRef(value.source_exchange_ref, 'API_EXCHANGE')
    && plainObject(value.match) && sameStringSet(Object.keys(value.match), ['operation_id', 'method', 'normalized_url', 'command_type', 'base_revision']);
}

function receiptMatches(receipt, expected) {
  return receipt.exchange_entry.operation_id === expected.operation_id && receipt.actual_request.method === expected.method
    && receipt.response.status === expected.expected_http_status;
}
function completeReceipt(value) { return deepFrozen(value) && value?.raw_request && value?.actual_request && value?.response && value?.exchange_ref; }
function familyOperationId(method, path) {
  if (method === 'GET' && path.endsWith('/command-capabilities')) return 'API-EDT-001';
  if (method === 'POST' && path.endsWith('/commands')) return 'API-EDT-002';
  if (method === 'GET' && path.endsWith('/projection')) return 'API-CTX-002';
  if (method === 'GET' && path.endsWith('/text-projection')) return 'API-TXT-001';
  if (method === 'GET' && path.endsWith('/navigation')) return 'API-CTX-001';
  if (method === 'GET' && path.endsWith('/revisions')) return 'API-VER-001';
  return 'API-UNKNOWN';
}
function parseRequestBody(bytes) { try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw evidenceTransaction('Family API request body is not JSON.'); } }
function familyCommandPath(identity) { return `/api/v1/projects/${encodeURIComponent(identity.project_id)}/models/${encodeURIComponent(identity.model_id)}/contexts/${encodeURIComponent(identity.context_id)}/commands`; }
function browserProofFailureValue(message) { return new E2eRunInputError('E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', message, 4); }

async function writeFamilyRawFile({ attemptRoot, relativePath, bytes, kind }) {
  if (!safeRelativePath(relativePath) || !inside(attemptRoot, resolve(attemptRoot, relativePath))) throw evidenceTransaction('Family raw evidence path is invalid.');
  const path = resolve(attemptRoot, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await assertAbsent(path);
  const temporary = `${path}.tmp-${randomBytes(8).toString('hex')}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, path); await fsyncDirectory(dirname(path));
    const reread = await readSingleLinkFile(path, 'EVIDENCE_TRANSACTION');
    if (!reread.equals(bytes)) throw evidenceTransaction('Family raw evidence readback drifted.');
    return deepFreeze({ kind, path: relative(attemptRoot, path).split(sep).join('/'), byte_length: bytes.length, sha256: sha256(bytes) });
  } catch (error) {
    await handle?.close().catch(() => undefined); await unlink(temporary).catch(() => undefined);
    throw asEvidenceFailure(error);
  }
}

function toReportRelativeAttemptRef(reportRoot, attemptRoot, reference) {
  const attemptPath = relative(resolve(reportRoot), resolve(attemptRoot)).split(sep).join('/');
  if (!safeRelativePath(attemptPath) || !inside(resolve(reportRoot), resolve(attemptRoot)) || !isRawRef(reference, reference?.kind)) {
    throw evidenceTransaction('Attempt raw reference cannot be rebased to the Report root.');
  }
  return deepFreeze({ ...reference, path: `${attemptPath}/${reference.path}` });
}

function observeOwnedChildOutput(child, maxBytes) {
  if (!child?.stdout || !child?.stderr || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw evidenceTransaction('Owned child output observer inputs are invalid.');
  }
  const state = {
    stdout: [], stderr: [], stdout_size: 0, stderr_size: 0,
    overflow: false, stream_error: null, finished: false
  };
  const onStdout = chunk => capture('stdout', chunk);
  const onStderr = chunk => capture('stderr', chunk);
  const onStdoutError = error => { state.stream_error ??= error; };
  const onStderrError = error => { state.stream_error ??= error; };
  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.stdout.on('error', onStdoutError);
  child.stderr.on('error', onStderrError);
  return Object.freeze({ finish });

  function capture(stream, chunk) {
    const bytes = Buffer.from(chunk);
    const sizeKey = `${stream}_size`;
    if (state[sizeKey] + bytes.length > maxBytes) {
      state.overflow = true;
      child.kill?.('SIGKILL');
      return;
    }
    state[sizeKey] += bytes.length;
    state[stream].push(bytes);
  }
  function finish() {
    if (state.finished) throw evidenceTransaction('Owned child output observer was finalized more than once.');
    state.finished = true;
    child.stdout.off('data', onStdout);
    child.stderr.off('data', onStderr);
    child.stdout.off('error', onStdoutError);
    child.stderr.off('error', onStderrError);
    if (state.overflow || state.stream_error) throw evidenceTransaction('Owned child output exceeded its limit or failed during capture.');
    return Object.freeze({ stdout: Buffer.concat(state.stdout), stderr: Buffer.concat(state.stderr) });
  }
}

function normalizeRuntimeCommand({ command, javaRef, runtimeJarRef, reportRoot, attemptRoot }) {
  if (!Array.isArray(command) || command.length < 3 || !isRawRef(javaRef, 'E2E_JAVA_EXECUTABLE_MIRROR')
      || !isRawRef(runtimeJarRef, 'LOCAL_RUNTIME_JAR')) {
    throw evidenceTransaction('Runtime command normalization inputs are invalid.');
  }
  const attemptRelative = relative(resolve(reportRoot), resolve(attemptRoot)).split(sep).join('/');
  if (!safeRelativePath(attemptRelative) || !inside(resolve(reportRoot), resolve(attemptRoot))) {
    throw evidenceTransaction('Runtime command attempt root is outside the Report.');
  }
  const normalized = command.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) throw evidenceTransaction('Runtime command contains an invalid argument.');
    if (index === 0) return javaRef.path;
    if (index === 2) return runtimeJarRef.path;
    if (value.startsWith('--opm.release.e2e.challenge=')) return '--opm.release.e2e.challenge=<PROCESS_CONTROL_CHALLENGE>';
    if (value.startsWith('--opm.release.e2e.challenge-response=')) return '--opm.release.e2e.challenge-response=<HMAC_SHA256>';
    const portableAttemptRoot = resolve(attemptRoot).split(sep).join('/');
    return value.split(sep).join('/').replaceAll(portableAttemptRoot, attemptRelative);
  });
  if (normalized.some(value => isAbsolute(value) || /=[/\\]/u.test(value))) {
    throw evidenceTransaction('Runtime normalized command retains an absolute path.');
  }
  return Object.freeze(normalized);
}

export async function buildFamilyBrowserEnvironment({ invocationContext, schedule, prepared, initial, reopen, runnerSourceSet, toolchainEvidence }) {
  const viewport = FAMILY_VIEWPORTS[schedule?.viewport_id];
  const sourceEntries = runnerSourceSet?.entries?.filter(entry => entry?.path === 'scripts/canvas06-e2e-production-web.mjs') ?? [];
  if (!viewport || schedule?.zoom_id !== 'Z-100' || initial?.browser_version !== '143.0.7499.4'
      || reopen?.browser_version !== initial.browser_version || sourceEntries.length !== 1
      || !isRawRef(toolchainEvidence?.browser?.mirror_ref, 'E2E_BROWSER_EXECUTABLE_MIRROR')) {
    throw evidenceTransaction('Browser Environment inputs do not close the frozen execution identity.');
  }
  const reportRoot = invocationContext.report_staging_root_realpath;
  const webServerSourceRef = await exactReportRef(
    reportRoot,
    `inputs/runner/${sourceEntries[0].path}`,
    'WEB_SERVER_SOURCE'
  );
  if (webServerSourceRef.byte_length !== sourceEntries[0].byte_length || webServerSourceRef.sha256 !== sourceEntries[0].sha256) {
    throw new E2eRunInputError('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Production Web source mirror differs from Runner Source Set.', 3);
  }
  const webDistPath = relative(reportRoot, prepared.web_dist).split(sep).join('/');
  const webDistRef = await treeRef(reportRoot, webDistPath, 'E2E_ORCHESTRATION_REF_MISMATCH');
  return createBrowserEnvironment({
    caseId: schedule.case_id,
    attemptOrdinal: schedule.attempt_ordinal,
    environment: {
      node_version: process.version.startsWith('v') ? process.version.slice(1) : process.version,
      playwright_version: '1.57.0',
      chromium_version: initial.browser_version,
      browser_executable_ref: toolchainEvidence.browser.mirror_ref,
      launch_args: [...RELEASE_BROWSER_LAUNCH_ARGS],
      viewport,
      zoom_id: 'Z-100',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      color_scheme: 'light',
      reduced_motion: 'reduce',
      web_server_source_ref: webServerSourceRef,
      web_dist_ref: webDistRef,
      web_origin: `http://127.0.0.1:${schedule.web_port}`,
      runtime_origin: `http://127.0.0.1:${schedule.runtime_port}`
    }
  });
}

async function waitRuntimeReady({ child, cycle, launch }) {
  if (launch) await waitForFaultLauncherReady({ child, faultLaunch: launch });
  const origin = `http://127.0.0.1:${cycle.runtime_port}`;
  let samples = [];
  await waitUntil(async () => {
    const response = await fetch(`${origin}/actuator/health`).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    if (payload?.status === 'UP') {
      samples.push(Object.freeze({ ordinal: samples.length + 1, status: 'UP', observed_at: new Date().toISOString() }));
    } else {
      samples = [];
    }
    return samples.length === 3;
  }, 120000, child);
  return Object.freeze(samples);
}

async function waitWebReady({ child, origin }) {
  await waitUntil(async () => {
    const index = await fetch(`${origin}/`).catch(() => null);
    if (!index?.ok) return false;
    const html = await index.text();
    const resources = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match => match[1]);
    if (resources.length === 0) return false;
    const bootstrap = await fetch(`${origin}/opm-bootstrap.js`).catch(() => null);
    if (!bootstrap?.ok) return false;
    for (const resource of resources) if (!(await fetch(new URL(resource, origin)).catch(() => null))?.ok) return false;
    return true;
  }, 60000, child);
}

async function waitUntil(check, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'Owned child exited before READY.', 3);
    if (await check()) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new E2eRunInputError('E2E_ORCHESTRATION_PROCESS_FAILED', 'Owned child did not reach exact READY.', 3);
}

function spawnOwned(command, cwd) {
  return spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
}

async function stopOwnedChild(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const exited = await waitChildExit(child, 10000);
    if (!exited) {
      child.kill('SIGKILL');
      if (!(await waitChildExit(child, 10000))) throw evidenceTransaction('Owned child did not exit.');
    }
  } else {
    await waitChildExit(child, 10000);
  }
  if (typeof child.signalCode === 'string' && child.signalCode) {
    return Object.freeze({ kind: 'SIGNAL', exit_code: null, signal: child.signalCode, owned_process_terminated: true });
  }
  if (child.exitCode === 0) {
    return Object.freeze({ kind: 'NORMAL', exit_code: 0, signal: null, owned_process_terminated: true });
  }
  if (Number.isInteger(child.exitCode) && child.exitCode !== 0) {
    return Object.freeze({ kind: 'EXIT_CODE', exit_code: child.exitCode, signal: null, owned_process_terminated: true });
  }
  throw evidenceTransaction('Owned child termination identity is unavailable.');
}

function waitChildExit(child, timeoutMs) {
  if ((child.exitCode !== null || child.signalCode !== null)
      && (!child.stdout || child.stdout.readableEnded || child.stdout.destroyed)
      && (!child.stderr || child.stderr.readableEnded || child.stderr.destroyed)) return Promise.resolve(true);
  return new Promise(resolveWait => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = value => { clearTimeout(timer); child.off('close', onExit); resolveWait(value); };
    const onExit = () => finish(true);
    child.once('close', onExit);
  });
}

async function assertPortsFree(ports) {
  for (const port of ports) await new Promise((resolveProbe, rejectProbe) => {
    const probe = createServer();
    probe.once('error', () => rejectProbe(new E2eRunInputError('E2E_ORCHESTRATION_PORT_NOT_RELEASED', 'Controlled port is occupied.', 4)));
    probe.listen({ host: '127.0.0.1', port }, () => probe.close(error => error ? rejectProbe(error) : resolveProbe()));
  });
}

async function readGateSnapshot(session) {
  const context = session.context;
  await verifyCanonicalAbsoluteRef(context.fixed_handoff_ref.path, context.fixed_handoff_ref, 'E2E_ORCHESTRATION_REF_MISMATCH');
  const entries = await readdir(context.activation_input_root_realpath, { withFileTypes: true });
  if (entries.length !== 0) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Activation input root is not empty.');
  return deepFreeze({ ...session.expected_gate });
}

function sameGateSnapshot(left, right) { return canonicalizeJcs(left) === canonicalizeJcs(right); }

function gateFailure(phase, schedule_id, process_cycle) { return Object.freeze({ code: 'PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN', phase, schedule_id, process_cycle, evidence_refs: [] }); }
function executionFailure(phase, schedule_id, process_cycle) { return Object.freeze({ code: 'CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED', phase, schedule_id, process_cycle, evidence_refs: [] }); }

function buildGateObservation({ session, before, during, after, failures, firstFailure }) {
  const mutationCount = [before, ...during, after].filter(snapshot => !sameGateSnapshot(stripPhase(snapshot), session.expected_gate)).length;
  const status = firstFailure ? 'FAILED' : 'PASS_MATCHED';
  const values = {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-GATE-OBSERVATION-001', schema_version: '0.1',
    observation_id: `dev-canvas-06.fault-launcher-gate.${session.context.preflight_descriptor_ref.sha256.slice(0, 12)}.${session.context.preflight_report_ref.sha256.slice(0, 12)}`,
    generated_at: session.expected_gate.observed_at,
    preflight_descriptor_ref: session.context.preflight_descriptor_ref,
    preflight_report_ref: session.context.preflight_report_ref,
    before: Object.freeze({ ...before, phase: 'BEFORE' }), during, after: Object.freeze({ ...after, phase: 'AFTER' }),
    production_gate_mutation_count: mutationCount, observation_status: status,
    failures: status === 'PASS_MATCHED' ? [] : failures,
    observation_payload_sha256: ''
  };
  values.observation_payload_sha256 = sha256(Buffer.from(canonicalizeJcs(withoutKey(values, 'observation_payload_sha256')), 'utf8'));
  if (status === 'PASS_MATCHED' && (during.length !== 12 || mutationCount !== 0 || failures.length !== 0)) throw evidenceTransaction('PASS Gate observation is incomplete.');
  if (status === 'FAILED' && failures.length === 0) throw evidenceTransaction('FAILED Gate observation has no failure.');
  return deepFreeze(values);
}

async function writeGateObservation({ session, artifact }) {
  const root = resolve(session.context.evidence_staging_root_realpath, 'fault-launcher');
  const finalPath = resolve(root, 'gate-observation.json');
  const temporaryPath = resolve(root, '.gate-observation.json.tmp');
  const bytes = Buffer.from(`${canonicalizeJcs(artifact)}\n`, 'utf8');
  await assertDirectory(session.context.evidence_staging_root_realpath, 'EVIDENCE_TRANSACTION');
  await mkdir(root, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await assertAbsent(finalPath); await assertAbsent(temporaryPath);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const reread = await readFile(temporaryPath);
  if (!reread.equals(bytes) || sha256(reread) !== sha256(bytes)) throw evidenceTransaction('Gate observation temporary bytes drifted.');
  await rename(temporaryPath, finalPath);
  await fsyncDirectory(root);
  await verifyCanonicalAbsoluteRef(finalPath, { kind: 'GATE_OBSERVATION', path: finalPath, byte_length: bytes.length, sha256: sha256(bytes) }, 'EVIDENCE_TRANSACTION');
  return deepFreeze({ kind: 'GATE_OBSERVATION', path: 'fault-launcher/gate-observation.json', byte_length: bytes.length, sha256: sha256(bytes) });
}

async function verifyCanonicalRawRef(root, reference, expected, code) {
  if (!reference?.path || !safeRelativePath(reference.path)) fail(code, 'Context reference path is invalid.');
  return verifyCanonicalAbsoluteRef(resolve(root, reference.path), reference, code, expected);
}

async function verifyCanonicalAbsoluteRef(path, reference, code, expected = undefined) {
  if (!reference || !isAbsolute(path) || !Number.isSafeInteger(reference.byte_length) || !isDigest(reference.sha256)) fail(code, 'Raw reference is invalid.');
  const info = await lstat(path).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail(code, 'Raw reference is not a single-link regular file.');
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256 || bytes.at(-1) !== 0x0a || bytes.includes(0x0d)) fail(code, 'Raw reference bytes drifted.');
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (`${canonicalizeJcs(parsed)}\n` !== bytes.toString('utf8') || expected && canonicalizeJcs(parsed) !== canonicalizeJcs(expected)) fail(code, 'Canonical JSON raw reference differs.');
  return parsed;
}

function stripPhase(snapshot) { const copy = { ...snapshot }; delete copy.phase; delete copy.schedule_id; delete copy.process_cycle; delete copy.ordinal; return copy; }
function isSameOriginApi(url, origin) { try { const value = new URL(url); return value.origin === origin && value.pathname.startsWith('/api/'); } catch { return false; } }
function withoutKey(value, key) { const copy = { ...value }; delete copy[key]; return copy; }
function sameRefArray(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameRef(item, right[index])); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function deepFrozen(value) { return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
function sameStringSet(left, right) { return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]); }
function driverContractFail(message) { throw new E2eRunInputError('E2E_DRIVER_CONTRACT_INVALID', message, 3); }
function caseExecutionFail(message) { throw new E2eRunInputError('E2E_INPUT_INVALID', message, 2); }
function browserProofFailure(message) { throw new E2eRunInputError('E2E_ORCHESTRATION_BROWSER_PROOF_INVALID', message, 4); }
function evidenceTransaction(message) { return new E2eRunInputError('EVIDENCE_TRANSACTION', message, 4); }
function asEvidenceFailure(error) {
  return isEvidenceFailure(error) && error.exitCode === 4
    ? error
    : evidenceTransaction(error?.message ?? 'Evidence transaction failed.');
}
function isEvidenceFailure(error) { return error?.code === 'E2E_ORCHESTRATION_BROWSER_PROOF_INVALID' || error?.code === 'E2E_ORCHESTRATION_PORT_NOT_RELEASED' || error?.code === 'EVIDENCE_TRANSACTION'; }
async function assertAbsent(path) { const info = await lstat(path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)); if (info) throw evidenceTransaction('Evidence destination already exists.'); }
async function fsyncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }

async function publishFamilyContext({ context, finalPath, temporaryPath, controlParent }) {
  const bytes = Buffer.from(`${canonicalizeJcs(context)}\n`, 'utf8');
  let linked = false;
  try {
    await assertContextAbsent(temporaryPath);
    await assertContextAbsent(finalPath);
    const handle = await open(temporaryPath, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    const reread = await readSingleLinkFile(temporaryPath, 'E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED');
    let parsed;
    try { parsed = JSON.parse(reread.toString('utf8')); }
    catch { contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', 'Controlled Context temporary bytes are not JSON.', 4); }
    if (!reread.equals(bytes) || !reread.equals(Buffer.from(`${canonicalizeJcs(parsed)}\n`, 'utf8'))) {
      contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', 'Controlled Context temporary bytes drifted.', 4);
    }
    await link(temporaryPath, finalPath);
    linked = true;
    const [temporaryInfo, finalInfo] = await Promise.all([lstat(temporaryPath), lstat(finalPath)]);
    if (temporaryInfo.dev !== finalInfo.dev || temporaryInfo.ino !== finalInfo.ino || temporaryInfo.nlink !== 2 || finalInfo.nlink !== 2) {
      contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', 'Controlled Context atomic publication identity is invalid.', 4);
    }
    await unlink(temporaryPath);
    const finalInfoAfter = await lstat(finalPath);
    if (finalInfoAfter.isSymbolicLink() || !finalInfoAfter.isFile() || finalInfoAfter.nlink !== 1 || (finalInfoAfter.mode & 0o777) !== 0o600) {
      contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', 'Controlled Context final file is not a private single-link regular file.', 4);
    }
    await fsyncDirectory(controlParent);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (error instanceof E2eRunInputError && error.code === 'E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED') throw error;
    contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', linked
      ? 'Controlled Context final publication is incomplete.'
      : 'Controlled Context could not be atomically published.', 4);
  }
}

async function assertContextAbsent(path) {
  const info = await lstat(path).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (info) contextFail('E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED', 'Controlled Context destination is not fresh.', 4);
}

async function readSingleLinkFile(path, code) {
  let info;
  try { info = await lstat(path); }
  catch { contextFail(code, 'Controlled Context reference is missing.', code.endsWith('TRANSACTION_FAILED') || code === 'EVIDENCE_TRANSACTION' ? 4 : 3); }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    contextFail(code, 'Controlled Context reference is not a single-link regular file.', code.endsWith('TRANSACTION_FAILED') || code === 'EVIDENCE_TRANSACTION' ? 4 : 3);
  }
  return readFile(path);
}

async function readReferencedJson(root, reference, code) {
  if (!plainObject(reference) || !safeRelativePath(reference.path) || !Number.isSafeInteger(reference.byte_length) || !isDigest(reference.sha256)) {
    contextFail(code, 'Controlled Context nested raw ref is invalid.');
  }
  const path = resolve(root, reference.path);
  if (!inside(resolve(root), path)) contextFail(code, 'Controlled Context nested ref escapes its root.');
  const bytes = await readSingleLinkFile(path, code);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) contextFail(code, 'Controlled Context nested ref bytes drifted.');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { contextFail(code, 'Controlled Context nested ref is not JSON.'); }
}

async function verifyRunnerOwnerBootstrap({ context, runnerSourceSet }) {
  const entry = runnerSourceSet.entries?.[0];
  const expectedPath = 'scripts/release-canvas06-e2e-run.mjs';
  const payload = withoutKey(runnerSourceSet, 'source_set_sha256');
  if (entry?.path !== expectedPath || runnerSourceSet.source_set_sha256 !== sha256(Buffer.from(canonicalizeJcs(payload), 'utf8'))) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Runner Source Set aggregate or first owner is invalid.');
  }
  const sourcePath = resolve(context.source_root_realpath, expectedPath);
  const mirrorPath = resolve(context.report_staging_root_realpath, 'inputs/runner', expectedPath);
  const [sourceBytes, mirrorBytes] = await Promise.all([
    readSingleLinkFile(sourcePath, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH'),
    readSingleLinkFile(mirrorPath, 'E2E_INVOCATION_CONTEXT_REF_MISMATCH')
  ]);
  if (!sourceBytes.equals(mirrorBytes) || sourceBytes.length !== entry.byte_length || sha256(sourceBytes) !== entry.sha256) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Runner owner source, mirror, and Source Set entry differ.');
  }
}

function exactAbsolute(value, field) {
  if (!isAbsolute(value) || value !== resolve(value) || value === resolve('/')) {
    contextFail('E2E_INVOCATION_CONTEXT_INVALID', `${field} must be an absolute normalized path.`);
  }
  return value;
}

function assertIsolatedRoot(root, others) {
  if (others.some(other => root === other || inside(root, other) || inside(other, root))) {
    contextFail('E2E_INVOCATION_CONTEXT_REF_MISMATCH', 'Process control root is not isolated from controlled inputs and outputs.');
  }
}

function contextFail(code, message, exitCode = code === 'E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED' ? 4 : code === 'E2E_INVOCATION_CONTEXT_REF_MISMATCH' ? 3 : 2) {
  throw new E2eRunInputError(code, message, exitCode);
}

async function assertControlledManifestTrust({ manifestInput, controlledBundle }) {
  const references = [
    ['intake_report_ref', controlledBundle.references.intake_report_ref],
    ['handoff_ref', controlledBundle.references.handoff_ref],
    ['input_materialization.bundle_ref', controlledBundle.references.evidence_bundle_ref]
  ];
  for (const [field, external] of references) {
    const localRef = field === 'input_materialization.bundle_ref'
      ? manifestInput.manifest.input_materialization?.bundle_ref
      : manifestInput.manifest[field];
    const local = await verifyFileRef({ root: manifestInput.manifestRoot, reference: localRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
    const externalBytes = await readRegularBytes(external.absolute_path, 'E2E_ORCHESTRATION_REF_MISMATCH');
    if (!local.bytes.equals(externalBytes)) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Controlled bundle trust input differs from the Manifest final root.');
  }
}

async function verifyAttemptSources({ manifestInput, inputs }) {
  const root = manifestInput.manifestRoot;
  const runtimeJar = await verifyFileRef({ root, reference: inputs.runtimeJarRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  const webDist = await treeRef(root, inputs.webDistRef.path, 'E2E_ORCHESTRATION_REF_MISMATCH');
  if (!sameRef(webDist, inputs.webDistRef)) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest web-dist tree differs from its raw reference.');
  const drivers = [];
  for (const driver of inputs.drivers) {
    drivers.push({ driver, source: await verifyFileRef({ root, reference: driver.source_ref, code: 'E2E_ORCHESTRATION_REF_MISMATCH' }) });
  }
  const profileAssets = [];
  for (const reference of inputs.profileAssetRefs) {
    const relativePath = profileAssetPath(reference.path);
    const sourcePath = resolve(manifestInput.profileRoot, relativePath);
    const bytes = await readRegularBytes(sourcePath, 'E2E_ORCHESTRATION_REF_MISMATCH');
    if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
      fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Profile asset bytes differ from the active Manifest reference.');
    }
    profileAssets.push({ reference, relativePath, sourcePath });
  }
  const [fixture, input, familyIdentityCatalog] = await Promise.all([
    verifyFileRef({ root, reference: inputs.fixtureRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' }),
    verifyFileRef({ root, reference: inputs.inputRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' }),
    inputs.familyIdentityCatalogRef
      ? verifyFileRef({ root, reference: inputs.familyIdentityCatalogRef, code: 'E2E_ORCHESTRATION_REF_MISMATCH' })
      : null
  ]);
  return Object.freeze({
    runtimeJar,
    webDist,
    drivers: Object.freeze(drivers),
    profileAssets: Object.freeze(profileAssets),
    fixture,
    input,
    familyIdentityCatalog
  });
}

async function createFreshAttemptRoot({ reportRoot, caseId, attemptOrdinal }) {
  const root = resolve(reportRoot);
  const relativeAttemptRoot = attemptRelativeRoot(caseId, attemptOrdinal);
  const parent = resolve(root, relativeAttemptRoot, '..');
  if (!inside(root, parent) || parent === root) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt parent escapes the Report staging root.');
  await ensureDirectoryPath(root, relativeAttemptRoot.split('/').slice(0, -1));
  const attemptRoot = resolve(root, relativeAttemptRoot);
  try {
    await mkdir(attemptRoot, { recursive: false, mode: 0o700 });
  } catch (error) {
    fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt root must not already exist.');
  }
  const details = await lstat(attemptRoot);
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt root is not a safe directory.');
  return attemptRoot;
}

async function copyVerifiedAttemptSources({ attemptRoot, manifestInput, inputs, source }) {
  const runtime = await copyRegularFile({
    source: source.runtimeJar.path,
    destinationRoot: attemptRoot,
    destination: 'inputs/build/local-runtime.jar',
    kind: inputs.runtimeJarRef.kind,
    code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
  });
  await verifyCopiedFile({ root: attemptRoot, reference: runtime, expected: inputs.runtimeJarRef });

  const web = await copyTree({
    sourceRoot: resolveInside(manifestInput.manifestRoot, inputs.webDistRef.path, 'E2E_ORCHESTRATION_REF_MISMATCH'),
    destinationRoot: attemptRoot,
    destination: 'inputs/build/web-dist',
    code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
  });
  if (!sameRef(web, { ...inputs.webDistRef, path: web.path })) fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Copied web-dist differs from the Manifest tree reference.');

  for (const asset of source.profileAssets) {
    const copied = await copyRegularFile({
      source: asset.sourcePath,
      destinationRoot: attemptRoot,
      destination: `profile/assets/${asset.relativePath}`,
      kind: asset.reference.kind,
      code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
    });
    await verifyCopiedFile({ root: attemptRoot, reference: copied, expected: asset.reference });
  }
  for (const entry of source.drivers) {
    const filename = entry.driver.source_ref.path.slice('inputs/drivers/'.length);
    const copied = await copyRegularFile({
      source: entry.source.path,
      destinationRoot: attemptRoot,
      destination: `inputs/drivers/${filename}`,
      kind: entry.driver.source_ref.kind,
      code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
    });
    await verifyCopiedFile({ root: attemptRoot, reference: copied, expected: entry.driver.source_ref });
  }

  const materializerManifestRoot = resolve(attemptRoot, 'inputs/materializer/manifest');
  const manifestCopies = [
    [manifestInput.manifestPath, inputs.manifestRef, inputs.manifestRef.path],
    [source.fixture.path, inputs.fixtureRef, inputs.fixtureRef.path],
    [source.input.path, inputs.inputRef, inputs.inputRef.path]
  ];
  if (source.familyIdentityCatalog) {
    manifestCopies.push([source.familyIdentityCatalog.path, inputs.familyIdentityCatalogRef, inputs.familyIdentityCatalogRef.path]);
  }
  for (const [sourcePath, expected, destination] of manifestCopies) {
    const copied = await copyRegularFile({
      source: sourcePath,
      destinationRoot: materializerManifestRoot,
      destination,
      kind: expected.kind ?? 'MANIFEST_INPUT',
      code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
    });
    await verifyCopiedFile({ root: materializerManifestRoot, reference: copied, expected });
  }
  const inputCopy = await copyRegularFile({
    source: source.input.path,
    destinationRoot: attemptRoot,
    destination: 'inputs/materializer/input.raw',
    kind: inputs.inputRef.kind ?? 'MATERIALIZER_INPUT',
    code: 'E2E_ORCHESTRATION_PROCESS_FAILED'
  });
  await verifyCopiedFile({ root: attemptRoot, reference: inputCopy, expected: inputs.inputRef });
  const bindingBytes = Buffer.from(`${canonicalizeJcs(inputs.activeBinding)}\n`, 'utf8');
  await writeSupportFile({ root: attemptRoot, path: 'inputs/materializer/active-binding.json', bytes: bindingBytes });
}

async function writeSupportFile({ root, path, bytes }) {
  if (!safeRelativePath(path)) fail('E2E_ORCHESTRATION_PROCESS_FAILED', 'Attempt support path is invalid.');
  const destination = resolve(root, path);
  if (!inside(root, destination)) fail('E2E_ORCHESTRATION_PROCESS_FAILED', 'Attempt support path escapes its root.');
  await mkdir(dirname(destination), { recursive: true });
  const handle = await open(destination, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const reread = await readRegularBytes(destination, 'E2E_ORCHESTRATION_PROCESS_FAILED');
  if (!reread.equals(bytes)) fail('E2E_ORCHESTRATION_PROCESS_FAILED', 'Attempt support bytes drifted after write.');
}

async function verifyCopiedFile({ root, reference, expected }) {
  const copied = await verifyFileRef({ root, reference, code: 'E2E_ORCHESTRATION_REF_MISMATCH' });
  if (copied.bytes.length !== expected.byte_length || sha256(copied.bytes) !== expected.sha256) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Copied attempt input differs from the Manifest raw reference.');
  }
}

function freezePreparedAttempt({ attemptRoot, caseEntry, attemptOrdinal, inputs }) {
  const driverFilenames = {
    'DRIVER-PROCEDURAL': 'procedural-driver.mjs',
    'DRIVER-CONTROL': 'control-driver.mjs',
    'DRIVER-STRUCTURAL': 'structural-driver.mjs',
    'DRIVER-COMMON': 'common-driver.mjs'
  };
  return Object.freeze({
    case_entry: Object.freeze({ ...caseEntry }),
    attempt_ordinal: attemptOrdinal,
    attempt_root: attemptRoot,
    runtime_jar: resolve(attemptRoot, 'inputs/build/local-runtime.jar'),
    web_dist: resolve(attemptRoot, 'inputs/build/web-dist'),
    profile_assets: resolve(attemptRoot, 'profile/assets'),
    manifest_root: resolve(attemptRoot, 'inputs/materializer/manifest'),
    manifest_path: inputs.manifestRef.path,
    fixture: resolve(attemptRoot, 'inputs/materializer/manifest', caseEntry.fixture_ref.path),
    input: resolve(attemptRoot, 'inputs/materializer/input.raw'),
    family_identity_catalog: caseEntry.driver_id === 'DRIVER-COMMON'
      ? null
      : resolve(attemptRoot, 'inputs/materializer/manifest', inputs.familyIdentityCatalogRef.path),
    binding: resolve(attemptRoot, 'inputs/materializer/active-binding.json'),
    driver_root: resolve(attemptRoot, 'inputs/drivers'),
    driver_source: resolve(attemptRoot, 'inputs/drivers', driverFilenames[caseEntry.driver_id]),
    storage: resolve(attemptRoot, 'storage'),
    initial_runtime: resolve(attemptRoot, 'process/initial'),
    reopen_runtime: resolve(attemptRoot, 'process/reopen')
  });
}

function assertControlledAttemptArguments({ manifest_path, case_entry, attempt_ordinal, java_executable, browser_executable, runtime_port, web_port }) {
  if (!safeRelativePath(manifest_path) || !case_entry || typeof case_entry.case_id !== 'string'
      || !ATTEMPT_ORDINALS.includes(attempt_ordinal) || !isAbsolute(java_executable) || !isAbsolute(browser_executable)
      || !validPort(runtime_port) || !validPort(web_port) || runtime_port === web_port) {
    fail('E2E_ORCHESTRATION_INPUT_INVALID', 'Controlled attempt arguments are invalid.');
  }
}

async function ensureDirectoryPath(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH', 'Attempt parent contains an unsafe entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false, mode: 0o700 });
    }
  }
}

async function readRegularBytes(path, code) {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a regular attempt input.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(code, 'Attempt input must be a single-link regular file.');
  return readFile(path);
}

function profileAssetPath(path) {
  const prefix = 'inputs/upstream/profile-assets/';
  if (typeof path !== 'string' || !path.startsWith(prefix) || !safeRelativePath(path.slice(prefix.length))) {
    fail('E2E_ORCHESTRATION_REF_MISMATCH', 'Manifest Profile asset path is invalid.');
  }
  return path.slice(prefix.length);
}

function sameRef(left, right) {
  return left?.kind === right?.kind && left?.path === right?.path
    && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}
function sameRawIdentity(left, right) {
  return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

function absolutePath(value) {
  return typeof value === 'string' && isAbsolute(value);
}

function asOrchestrationError(error, code) {
  if (error instanceof E2eRunInputError && error.code.startsWith('E2E_ORCHESTRATION_')) return error;
  return new E2eRunInputError(code, error?.message ?? 'Controlled attempt input validation failed.', error?.exitCode === 3 ? 3 : 2);
}

// 只有该 plan builder 从冻结调度矩阵取得 ordinal。
export async function prepareCaseFaultPlans({ reportRoot, manifest, caseId, nonces = {}, write = writeFaultPlan }) {
  const schedule = uniqueManifestCase(manifest, caseId);
  if (!nonces || typeof nonces !== 'object' || Array.isArray(nonces)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Fault Plan nonces must be an ordinal-keyed object.');
  }

  const refs = [];
  for (const attemptOrdinal of ATTEMPT_ORDINALS) {
    const reference = await write({ reportRoot, caseId: schedule.case_id, attemptOrdinal, nonce: nonces[attemptOrdinal] });
    refs.push(await readBackFaultPlan({ reportRoot, caseId: schedule.case_id, attemptOrdinal, reference }));
  }
  return Object.freeze({ case_id: schedule.case_id, fault_plan_refs: Object.freeze(refs) });
}

// 为三个受控 INITIAL case 同时生成 Plan、challenge 与握手参数。
export async function prepareCaseFaultLaunches({ reportRoot, manifest, caseId, processControlParent, write = writeFaultPlan, random = randomBytes }) {
  if (!FAULT_CASE_IDS.has(caseId)) fail('E2E_RUN_CASE_SET_INVALID', 'Only the three frozen Common fault cases may arm a Fault Launcher.');
  const report = resolve(reportRoot);
  const parent = await assertControlParent(processControlParent, report);
  const processControlRoot = await mkdtemp(resolve(parent, 'canvas06-e2e-fault-'));
  await chmod(processControlRoot, 0o700);
  try {
    const nonceBytes = new Map();
    const challengeBytes = new Map();
    for (const attemptOrdinal of ATTEMPT_ORDINALS) {
      const nonce = exactRandomBytes(random, 'parent nonce');
      const challenge = exactRandomBytes(random, 'challenge');
      if (nonce.equals(challenge)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault parent nonce and challenge must differ.');
      nonceBytes.set(attemptOrdinal, nonce);
      challengeBytes.set(attemptOrdinal, challenge);
    }
    const plans = await prepareCaseFaultPlans({
      reportRoot: report,
      manifest,
      caseId,
      nonces: Object.fromEntries(ATTEMPT_ORDINALS.map(ordinal => [ordinal, nonceBytes.get(ordinal).toString('hex')])),
      write
    });
    const launches = [];
    for (const [index, attemptOrdinal] of ATTEMPT_ORDINALS.entries()) {
      const faultPlanRef = plans.fault_plan_refs[index];
      const controlAttemptRoot = resolve(processControlRoot, encodeCaseId(caseId), String(attemptOrdinal));
      await mkdir(controlAttemptRoot, { recursive: true, mode: 0o700 });
      await chmod(controlAttemptRoot, 0o700);
      const challengePath = resolve(controlAttemptRoot, 'fault-launcher.challenge');
      await writeFile(challengePath, challengeBytes.get(attemptOrdinal), { flag: 'wx', mode: 0o600 });
      await chmod(challengePath, 0o600);
      await assertChallengeFile(challengePath, challengeBytes.get(attemptOrdinal));
      const response = createHmac('sha256', nonceBytes.get(attemptOrdinal))
        .update(FAULT_DOMAIN)
        .update(challengeBytes.get(attemptOrdinal))
        .update(Buffer.from(faultPlanRef.sha256, 'hex'))
        .digest('hex');
      launches.push(Object.freeze({
        case_id: caseId,
        attempt_ordinal: attemptOrdinal,
        fault_plan_ref: faultPlanRef,
        plan_raw_sha256: faultPlanRef.sha256,
        parent_nonce: nonceBytes.get(attemptOrdinal).toString('hex'),
        challenge_path: challengePath,
        challenge_response: response
      }));
    }
    return Object.freeze({ case_id: caseId, process_control_root: processControlRoot, launches: Object.freeze(launches) });
  } catch (error) {
    await rm(processControlRoot, { recursive: true, force: true });
    throw error;
  }
}

// 生命周期只能在当前 fresh attempt 已建立后写入其唯一的 Fault Plan。
async function prepareLifecycleFaultLaunch({ reportRoot, manifest, caseId, attemptOrdinal, processControlParent, write = writeFaultPlan, random = randomBytes }) {
  if (!FAULT_CASE_IDS.has(caseId) || !ATTEMPT_ORDINALS.includes(attemptOrdinal)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Lifecycle Fault Launch identity is invalid.');
  }
  const schedule = uniqueManifestCase(manifest, caseId);
  const report = resolve(reportRoot);
  const parent = await assertControlParent(processControlParent, report);
  const processControlRoot = await mkdtemp(resolve(parent, 'canvas06-e2e-fault-'));
  await chmod(processControlRoot, 0o700);
  try {
    const parentNonce = exactRandomBytes(random, 'parent nonce');
    const challenge = exactRandomBytes(random, 'challenge');
    if (parentNonce.equals(challenge)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault parent nonce and challenge must differ.');
    const written = await write({ reportRoot: report, caseId: schedule.case_id, attemptOrdinal, nonce: parentNonce.toString('hex') });
    const faultPlanRef = await readBackFaultPlan({ reportRoot: report, caseId: schedule.case_id, attemptOrdinal, reference: written });
    const controlAttemptRoot = resolve(processControlRoot, encodeCaseId(caseId), String(attemptOrdinal));
    await mkdir(controlAttemptRoot, { recursive: true, mode: 0o700 });
    await chmod(controlAttemptRoot, 0o700);
    const challengePath = resolve(controlAttemptRoot, 'fault-launcher.challenge');
    await writeFile(challengePath, challenge, { flag: 'wx', mode: 0o600 });
    await chmod(challengePath, 0o600);
    await assertChallengeFile(challengePath, challenge);
    const challengeResponse = createHmac('sha256', parentNonce)
      .update(FAULT_DOMAIN)
      .update(challenge)
      .update(Buffer.from(faultPlanRef.sha256, 'hex'))
      .digest('hex');
    return Object.freeze({
      case_id: caseId,
      attempt_ordinal: attemptOrdinal,
      fault_plan_ref: faultPlanRef,
      plan_raw_sha256: faultPlanRef.sha256,
      parent_nonce: parentNonce.toString('hex'),
      challenge_path: challengePath,
      challenge_response: challengeResponse,
      process_control_root: processControlRoot
    });
  } catch (error) {
    await rm(processControlRoot, { recursive: true, force: true });
    throw error;
  }
}

// 命令只能由 cycle 与冻结 fault case 集合决定，避免 REOPEN 被重新武装。
export function buildRuntimeLaunchCommand({ javaPath, attemptRoot, runtimePort, caseId, attemptOrdinal, cycle, faultLaunch = null }) {
  if (!['INITIAL', 'REOPEN'].includes(cycle) || !ATTEMPT_ORDINALS.includes(attemptOrdinal) || typeof caseId !== 'string') {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime cycle identity is invalid.');
  }
  if (!Number.isInteger(runtimePort) || runtimePort < 1024 || runtimePort > 65535) fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime port is invalid.');
  if (!isAbsolute(javaPath) || !isAbsolute(attemptRoot)) fail('E2E_RUN_ARGUMENT_INVALID', 'Runtime command paths must be absolute.');
  const root = resolve(attemptRoot);
  const command = [resolve(javaPath), '-jar', resolve(root, 'inputs/build/local-runtime.jar')];
  const faultEnabled = cycle === 'INITIAL' && FAULT_CASE_IDS.has(caseId);
  if (faultEnabled) {
    if (!faultLaunch || faultLaunch.case_id !== caseId || faultLaunch.attempt_ordinal !== attemptOrdinal
        || !isDigest(faultLaunch.plan_raw_sha256) || !isDigest(faultLaunch.parent_nonce)
        || !isDigest(faultLaunch.challenge_response) || !isAbsolute(faultLaunch.challenge_path)) {
      fail('E2E_RUN_ARGUMENT_INVALID', 'Fault INITIAL requires the exact attempt launch control.');
    }
    command.push('--spring.profiles.active=release-e2e-fault');
  } else if (faultLaunch !== null) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'NONE INITIAL and every REOPEN must not receive fault launch control.');
  }
  command.push(`--server.address=127.0.0.1`, `--server.port=${runtimePort}`, `--opm.storage.root=${resolve(root, 'storage')}`);
  if (faultEnabled) {
    command.push(
      '--opm.release.e2e.enabled=true',
      '--opm.release.e2e.guard=RELEASE_E2E_FAULT_ONLY',
      `--opm.release.e2e.plan=${resolve(root, 'fault-plan.json')}`,
      `--opm.release.e2e.plan-raw-sha256=${faultLaunch.plan_raw_sha256}`,
      `--opm.release.e2e.case-id=${caseId}`,
      `--opm.release.e2e.attempt-ordinal=${attemptOrdinal}`,
      `--opm.release.e2e.parent-nonce=${faultLaunch.parent_nonce}`,
      `--opm.release.e2e.challenge=${faultLaunch.challenge_path}`,
      `--opm.release.e2e.challenge-response=${faultLaunch.challenge_response}`
    );
  }
  return Object.freeze({ mode: faultEnabled ? 'FAULT_INITIAL' : 'NORMAL', command: Object.freeze(command) });
}

export function faultLauncherReadyLine({ caseId, attemptOrdinal, planRawSha256 }) {
  if (typeof caseId !== 'string' || !ATTEMPT_ORDINALS.includes(attemptOrdinal) || !isDigest(planRawSha256)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault READY identity is invalid.');
  }
  return `E2E_FAULT_LAUNCHER_READY\t${caseId}\t${attemptOrdinal}\t${planRawSha256}`;
}

// Browser 动作的前置门槛：只接受 exact READY 行，协议错误或提前退出一律拒绝。
export function waitForFaultLauncherReady({ child, faultLaunch, timeoutMs = 120000 }) {
  if (!child?.stdout || typeof child.stdout.on !== 'function' || typeof child.once !== 'function'
      || !faultLaunch || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault child READY wait arguments are invalid.');
  }
  const expected = faultLauncherReadyLine({
    caseId: faultLaunch.case_id,
    attemptOrdinal: faultLaunch.attempt_ordinal,
    planRawSha256: faultLaunch.plan_raw_sha256
  });
  return new Promise((resolveReady, rejectReady) => {
    let pending = '';
    let stderr = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr?.off?.('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) rejectReady(error);
      else resolveReady(expected);
    };
    const onStderr = chunk => { stderr += Buffer.from(chunk).toString('utf8'); };
    const protocolFailure = line => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault child emitted an unexpected protocol line: ${line}`, 3));
    const onData = chunk => {
      pending += Buffer.from(chunk).toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines.map(value => value.endsWith('\r') ? value.slice(0, -1) : value)) {
        if (line === expected) return finish();
        if (line.startsWith('E2E_FAULT_LAUNCHER_READY\t') || line.startsWith('E2E_FAULT_')) return protocolFailure(line);
      }
    };
    const onExit = (code, signal) => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault child exited before exact READY: ${code ?? '-'} / ${signal ?? '-'}; ${stderr.slice(0, 512)}`, 3));
    const onError = error => finish(new E2eRunInputError('E2E_RUN_RUNTIME_PROTOCOL_INVALID', error.message, 3));
    const timer = setTimeout(() => finish(new E2eRunInputError('E2E_RUN_RUNTIME_START_TIMEOUT', 'Fault child did not emit exact READY before timeout.', 3)), timeoutMs);
    child.stdout.on('data', onData);
    child.stderr?.on?.('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

export async function removeFaultChallenge({ challengePath, processControlRoot }) {
  if (!isAbsolute(challengePath) || !isAbsolute(processControlRoot) || !inside(resolve(processControlRoot), resolve(challengePath))) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault challenge path escapes process control root.');
  }
  const details = await lstat(challengePath).catch(() => null);
  if (!details || details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge file identity changed before removal.');
  }
  await rm(challengePath, { force: false });
}

function uniqueManifestCase(manifest, caseId) {
  if (!manifest || !Array.isArray(manifest.cases) || typeof caseId !== 'string') {
    fail('E2E_RUN_CASE_SET_INVALID', 'A verified Manifest case is required to prepare Fault Plans.');
  }
  const matches = manifest.cases.filter(entry => entry?.case_id === caseId);
  if (matches.length !== 1 || matches[0].suite_id !== caseId.slice(0, 'E2E-CANVAS-000'.length)) {
    fail('E2E_RUN_CASE_SET_INVALID', 'Fault Plan case does not uniquely match the Manifest schedule.');
  }
  return matches[0];
}

async function assertControlParent(value, reportRoot) {
  if (!isAbsolute(value)) fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must be absolute.');
  const parent = resolve(value);
  let details;
  try { details = await lstat(parent); } catch { fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must already exist.'); }
  if (details.isSymbolicLink() || !details.isDirectory() || inside(reportRoot, parent) || inside(parent, reportRoot) || parent === reportRoot) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'Fault process-control parent must be isolated from Report evidence.');
  }
  return parent;
}

function exactRandomBytes(random, label) {
  const bytes = random(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', `Fault ${label} CSPRNG output must be exactly 32 bytes.`);
  return bytes;
}

async function assertChallengeFile(path, expected) {
  const details = await lstat(path);
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1 || (details.mode & 0o777) !== 0o600) {
    fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge file identity or mode is invalid.');
  }
  const bytes = await readFile(path);
  if (!bytes.equals(expected)) fail('E2E_RUN_RUNTIME_PROTOCOL_INVALID', 'Fault challenge bytes differ after publication.');
}

async function readBackFaultPlan({ reportRoot, caseId, attemptOrdinal, reference }) {
  const root = resolve(reportRoot);
  if (!reference || reference.kind !== 'FAULT_PLAN' || reference.path !== faultPlanPath(caseId, attemptOrdinal)
      || !safeRelativePath(reference.path)) {
    fail('E2E_INPUT_INVALID', 'Fault Plan writer returned an unexpected reference.');
  }
  const path = resolve(root, reference.path);
  if (!inside(root, path)) fail('E2E_INPUT_INVALID', 'Fault Plan reference escapes its Report staging root.');
  let details;
  try { details = await lstat(path); } catch { fail('E2E_INPUT_INVALID', 'Fault Plan was not published.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) {
    fail('E2E_INPUT_INVALID', 'Fault Plan must be a single-link regular file.');
  }

  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) {
    fail('E2E_INPUT_INVALID', 'Fault Plan raw bytes differ from its writer reference.');
  }
  let faultPlan;
  try { faultPlan = JSON.parse(bytes.toString('utf8')); } catch { fail('E2E_INPUT_INVALID', 'Fault Plan must be valid JSON.'); }
  if (!bytes.equals(Buffer.from(`${canonicalizeJcs(faultPlan)}\n`, 'utf8'))) {
    fail('E2E_INPUT_INVALID', 'Fault Plan bytes are not the canonical atomic publication.');
  }
  verifyFaultPlan({ caseId, attemptOrdinal, faultPlan });
  return Object.freeze(reference);
}

function faultPlanPath(caseId, attemptOrdinal) {
  return `${attemptRelativeRoot(caseId, attemptOrdinal)}/fault-plan.json`;
}

function encodeCaseId(value) {
  return Buffer.from(value, 'utf8').toString('hex').match(/../g).map(hex => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._-]$/.test(character) ? character : `%${hex.toUpperCase()}`;
  }).join('');
}

function inside(root, child) {
  const relation = relative(root, child);
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function fail(code, message) {
  throw new E2eRunInputError(code, message, 2);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().then(result => {
    process.stdout.write(`${result.reportPath}\t${result.sha256}\n`);
  }).catch(error => {
    const code = error?.code ?? 'E2E_RUN_INTERNAL_ERROR';
    const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 4;
    process.stderr.write(`${code}\tCLI\t-\t-\n`);
    process.exitCode = exitCode;
  });
}
