import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const [operation, ...arguments_] = process.argv.slice(2);
const options = parseOptions(arguments_);
const schema = await json(resolve('docs/contracts/schemas/opm-dev-canvas-06-enablement-manifest.schema.json'));
const intakeSchema = await json(resolve('docs/contracts/schemas/opm-dev-canvas-06-intake-report.schema.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validateManifest = ajv.compile(schema);
const validateIntake = ajv.compile(intakeSchema);
let releaseCandidateReportValidator;

try {
  if (operation === 'build') await build();
  else if (operation === 'verify') await verify();
  else if (operation === 'activate') await activate();
  else if (operation === 'rollback') await rollback();
  else throw new InputError('Usage: release-canvas06-enablement.mjs <build|verify|activate|rollback> [options]');
} catch (error) {
  if (error?.name === 'BlockedResult') {
    console.error(error.message);
    process.exitCode = 3;
  } else if (error?.name === 'InputError') {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 4;
  }
}

async function build() {
  const evidenceRoot = resolveRequired(options, 'evidence-root');
  const intake = await loadRef(evidenceRoot, required(options, 'intake-report'), 'INTAKE_REPORT');
  if (!validateIntake(intake.value)) throw new InputError(`Intake schema validation failed: ${JSON.stringify(validateIntake.errors)}`);
  if (intake.value.intake_status !== 'READY_FOR_RELEASE_VALIDATION') throw new InputError('Enablement requires a READY intake report.');
  const reports = {
    visual: await loadReleaseReport(evidenceRoot, required(options, 'visual-report'), 'VISUAL_REPORT', 'OPM-DEV-CANVAS-06-VISUAL-REPORT-001', intake),
    e2e: await loadReleaseReport(evidenceRoot, required(options, 'e2e-report'), 'E2E_REPORT', 'OPM-DEV-CANVAS-06-E2E-REPORT-001', intake),
    performance: await loadReleaseReport(evidenceRoot, required(options, 'performance-report'), 'PERFORMANCE_REPORT', 'OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001', intake),
    recovery: await loadReleaseReport(evidenceRoot, required(options, 'recovery-report'), 'RECOVERY_REPORT', 'OPM-DEV-CANVAS-06-RECOVERY-REPORT-001', intake)
  };
  const targetBuild = reports.visual.value.source_build;
  if (!reportsMatchIntake(reports, intake, targetBuild)) throw new InputError('Release reports do not share the READY intake, handoff, or target source build.');

  const decisions = intake.value.capability_intake.map(item => decision(item, reports));
  applyControlDependencies(decisions);
  const passed = decisions.filter(item => item.release_validation_status === 'PASSED').map(item => item.capability_id);
  const sharedBlockers = reportsWithFailures(reports).map(report => blocker(report.code, report.ref));
  const isReady = sharedBlockers.length === 0 && passed.length > 0;
  const manifest = baseManifest('CANDIDATE', isReady ? 'READY_FOR_ACTIVATION' : 'BLOCKED', targetBuild, intake, reports, decisions, isReady ? passed : [], sharedBlockers);
  manifest.batches = batches(decisions, 'CANDIDATE');
  manifest.production_gate = { state: 'DISABLED', enabled_capability_ids: [] };
  await writeManifest(evidenceRoot, required(options, 'out'), manifest);
  if (!isReady) throw new BlockedResult(`Enablement Candidate BLOCKED: ${required(options, 'out')}`);
  console.log(`Enablement Candidate READY_FOR_ACTIVATION: ${required(options, 'out')}`);
}

async function verify() {
  const evidenceRoot = resolveRequired(options, 'evidence-root');
  const manifest = await loadRef(evidenceRoot, required(options, 'manifest'), 'ENABLEMENT_MANIFEST');
  await assertManifest(manifest.value, evidenceRoot, manifest.ref);
  console.log(`Enablement manifest is valid: ${manifest.value.manifest_kind}/${manifest.value.manifest_status}`);
}

async function activate() {
  const evidenceRoot = resolveRequired(options, 'evidence-root');
  const candidate = await loadRef(evidenceRoot, required(options, 'candidate'), 'CANDIDATE_MANIFEST');
  await assertManifest(candidate.value, evidenceRoot, candidate.ref);
  if (candidate.value.manifest_kind !== 'CANDIDATE' || candidate.value.manifest_status !== 'READY_FOR_ACTIVATION') {
    throw new BlockedResult('Activation requires a READY_FOR_ACTIVATION Candidate manifest.');
  }
  const release = await loadReleaseCandidateReport(evidenceRoot, required(options, 'release-report'), candidate);
  const enabled = candidate.value.proposed_enabled_capability_ids;
  const status = enabled.length === 34 ? 'ACTIVE_COMPLETE' : 'ACTIVE_PARTIAL';
  const decisions = candidate.value.capability_decisions.map(item => ({ ...item, activation_state: enabled.includes(item.capability_id) ? 'ENABLED' : 'DISABLED' }));
  const manifest = {
    ...baseManifest('ACTIVATION', status, candidate.value.source_build, { value: candidate.value, ref: candidate.value.intake_report_ref }, releaseEvidenceRefs(candidate.value), decisions, enabled, [], candidate.ref),
    supersedes_ref: candidate.ref,
    candidate_manifest_ref: candidate.ref,
    release_candidate_report_ref: release.ref,
    release_evidence: candidate.value.release_evidence,
    handoff_ref: candidate.value.handoff_ref,
    intake_report_ref: candidate.value.intake_report_ref,
    batches: batches(decisions, 'ACTIVATION'),
    production_gate: { state: 'ENABLED', enabled_capability_ids: enabled }
  };
  await writeManifest(evidenceRoot, required(options, 'out'), manifest);
  console.log(`Enablement Activation ${status}: ${required(options, 'out')}`);
}

async function rollback() {
  const evidenceRoot = resolveRequired(options, 'evidence-root');
  const effective = await loadRef(evidenceRoot, required(options, 'effective-manifest'), 'EFFECTIVE_MANIFEST');
  await assertManifest(effective.value, evidenceRoot, effective.ref);
  if (!['ACTIVE_PARTIAL', 'ACTIVE_COMPLETE', 'ROLLED_BACK_PARTIAL'].includes(effective.value.manifest_status)) {
    throw new BlockedResult('Rollback requires an ACTIVE or ROLLED_BACK_PARTIAL effective manifest.');
  }
  const mode = required(options, 'scope');
  if (!['ALL', 'CAPABILITY_SET'].includes(mode)) throw new InputError('--scope must be ALL or CAPABILITY_SET.');
  const enabled = effective.value.production_gate.enabled_capability_ids;
  const requested = mode === 'ALL' ? [] : options.getAll('capability');
  if (mode === 'CAPABILITY_SET' && (!requested.length || new Set(requested).size !== requested.length || requested.some(id => !enabled.includes(id)))) {
    throw new BlockedResult('Rollback capability set must be non-empty, unique, and entirely enabled.');
  }
  const direct = mode === 'ALL' ? enabled : requested;
  const cascade = controlCascade(effective.value.capability_decisions, direct, enabled);
  const disabled = ordered([...new Set([...direct, ...cascade.map(item => item.dependent_capability_id)])]);
  const remaining = enabled.filter(id => !disabled.includes(id));
  const status = remaining.length ? 'ROLLED_BACK_PARTIAL' : 'ROLLED_BACK';
  const decisions = rollbackDecisions(effective.value.capability_decisions, disabled, cascade, status);
  const manifest = {
    ...baseManifest('ROLLBACK', status, effective.value.source_build, { value: effective.value, ref: effective.value.intake_report_ref }, releaseEvidenceRefs(effective.value), decisions, remaining, [], effective.ref),
    supersedes_ref: effective.ref,
    rollback_of_ref: effective.ref,
    release_evidence: effective.value.release_evidence,
    handoff_ref: effective.value.handoff_ref,
    intake_report_ref: effective.value.intake_report_ref,
    rollback_trigger: { trigger_code: required(options, 'trigger-code'), evidence_refs: [effective.ref], message_key: required(options, 'trigger-code') },
    rollback_scope: { mode, requested_disabled_capability_ids: mode === 'ALL' ? [] : ordered(requested), effective_disabled_capability_ids: disabled, remaining_enabled_capability_ids: remaining, dependency_cascade: cascade },
    batches: batches(decisions, 'ROLLBACK'),
    production_gate: remaining.length ? { state: 'ENABLED', enabled_capability_ids: remaining } : { state: 'DISABLED', enabled_capability_ids: [] }
  };
  if (!['MANUAL_RELEASE_ROLLBACK', 'EVIDENCE_INVALIDATED', 'RUNTIME_HEALTH_FAILED', 'ASSET_INTEGRITY_FAILED'].includes(manifest.rollback_trigger.trigger_code)) throw new InputError('Invalid --trigger-code.');
  await writeManifest(evidenceRoot, required(options, 'out'), manifest);
  console.log(`Enablement Rollback ${status}: ${required(options, 'out')}`);
}

function baseManifest(kind, status, sourceBuild, intake, reports, decisions, proposed, blockers, identityRef) {
  const intakeRef = intake.ref ?? intake.value.intake_report_ref;
  const handoffRef = intake.value.handoff_ref;
  const criticalRef = identityRef ?? intakeRef;
  return {
    schema_id: 'OPM-DEV-CANVAS-06-ENABLEMENT-001', schema_version: '0.1',
    manifest_id: manifestId(kind, sourceBuild, criticalRef),
    manifest_kind: kind, manifest_status: status, generated_at: new Date().toISOString(),
    generator_identity: runnerIdentity(), source_build: sourceBuild,
    handoff_ref: handoffRef, intake_report_ref: intakeRef,
    release_evidence: reports.visual ? { visual_report_ref: reports.visual.ref, e2e_report_ref: reports.e2e.ref, performance_report_ref: reports.performance.ref, recovery_report_ref: reports.recovery.ref } : reports,
    batches: [], capability_decisions: decisions, proposed_enabled_capability_ids: proposed,
    production_gate: { state: 'DISABLED', enabled_capability_ids: [] },
    limitations: limitations(), blockers
  };
}

function decision(item, reports) {
  const codes = [];
  const visual = reports.visual.value.capability_results?.find(result => result.capability_id === item.capability_id);
  const e2e = reports.e2e.value.capability_results?.find(result => result.capability_id === item.capability_id);
  if (reports.visual.value.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') codes.push('CANVAS06_VISUAL_EVIDENCE_FAILED');
  else if (!visual || visual.status !== 'PASS_MATCHED') codes.push('CANVAS06_VISUAL_EVIDENCE_MISSING');
  if (reports.e2e.value.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') codes.push('CANVAS06_E2E_EVIDENCE_FAILED');
  else if (!e2e || e2e.status !== 'PASS_MATCHED' || !sameSet(e2e.covered_coverage_keys, item.coverage_keys)) codes.push('CANVAS06_E2E_EVIDENCE_MISSING');
  if (reports.performance.value.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') codes.push('CANVAS06_PERFORMANCE_EVIDENCE_FAILED');
  if (reports.recovery.value.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION') codes.push('CANVAS06_RECOVERY_EVIDENCE_FAILED');
  if (item.intake_status !== 'MATCHED' || item.upstream_eligibility !== 'ELIGIBLE_FOR_RELEASE_VALIDATION') codes.unshift('CANVAS06_UPSTREAM_CAPABILITY_BLOCKED');
  return {
    capability_id: item.capability_id, family: item.family, batch_id: batchId(item.family), upstream_evidence_fingerprint: item.upstream_evidence_fingerprint,
    dependency_closure: { coverage_keys: item.coverage_keys, template_refs: item.template_refs, rule_refs: item.rule_refs, symbol_refs: item.symbol_refs, grammar_refs: item.grammar_refs, binding_digest: item.binding_digest },
    release_evidence_coverage: { visual_case_ids: visualCases(item.capability_id), family_e2e_result_ref: `${familySuite(item.family)}/${item.capability_id}`, common_e2e_ids: ['E2E-CANVAS-001', 'E2E-CANVAS-005', 'E2E-CANVAS-006', 'E2E-CANVAS-007'], performance_scenario_ids: scenarioIds(), recovery_case_ids: recoveryIds(item.capability_id) },
    release_validation_status: codes.length ? 'BLOCKED' : 'PASSED', activation_state: 'DISABLED', blocker_codes: codes
  };
}

function applyControlDependencies(decisions) {
  const passed = new Set(decisions.filter(item => item.release_validation_status === 'PASSED').map(item => item.capability_id));
  for (const item of decisions.filter(item => item.family === 'CONTROL')) {
    const dependencies = item.dependency_closure.coverage_keys.map(key => key.split(':')[2]).filter(value => value?.startsWith('CAP-ISO-PROC-'));
    if (dependencies.some(id => !passed.has(id))) {
      item.release_validation_status = 'BLOCKED';
      item.blocker_codes = [...item.blocker_codes, 'CANVAS06_BATCH_DEPENDENCY_BLOCKED'];
    }
  }
}

async function loadReleaseReport(evidenceRoot, path, kind, schemaId, intake) {
  const loaded = await loadRef(evidenceRoot, path, kind);
  return validateReleaseReport(loaded, kind, schemaId, intake);
}

async function loadReleaseReportReference(evidenceRoot, reference, kind, schemaId, intake) {
  const loaded = { value: await verifyRef(evidenceRoot, reference), ref: reference };
  return validateReleaseReport(loaded, kind, schemaId, intake);
}

function validateReleaseReport(loaded, kind, schemaId, intake) {
  if (loaded.value.schema_id !== schemaId || loaded.value.schema_version !== '0.1') throw new InputError(`${kind} schema identity is invalid.`);
  if (!['BLOCKED', 'READY_FOR_ENABLEMENT_EVALUATION'].includes(loaded.value.report_status)) throw new InputError(`${kind} report status is invalid.`);
  if (!same(loaded.value.intake_report_ref, intake.ref) || !same(loaded.value.handoff_ref, intake.value.handoff_ref)) throw new InputError(`${kind} does not bind the supplied Intake and Handoff.`);
  return { ...loaded, code: `${kind === 'VISUAL_REPORT' ? 'CANVAS06_VISUAL' : kind === 'E2E_REPORT' ? 'CANVAS06_E2E' : kind === 'PERFORMANCE_REPORT' ? 'CANVAS06_PERFORMANCE' : 'CANVAS06_RECOVERY'}_EVIDENCE_FAILED` };
}

async function loadReleaseCandidateReport(evidenceRoot, path, candidate) {
  const validateRelease = await releaseCandidateValidator();
  return validateReleaseCandidateReport(await loadRef(evidenceRoot, path, 'RELEASE_CANDIDATE_REPORT'), candidate, validateRelease);
}

async function loadReleaseCandidateReportReference(evidenceRoot, reference, candidate) {
  const validateRelease = await releaseCandidateValidator();
  return validateReleaseCandidateReport({ value: await verifyRef(evidenceRoot, reference), ref: reference }, candidate, validateRelease);
}

async function releaseCandidateValidator() {
  if (releaseCandidateReportValidator) return releaseCandidateReportValidator;
  const schemaPath = resolve('docs/contracts/schemas/opm-dev-canvas-06-release-candidate-report.schema.json');
  const releaseSchema = await optionalJson(schemaPath);
  if (!releaseSchema) throw new BlockedResult('Activation waits for the executable GATE-06-06 Release Candidate Report Schema and exact READY Report.');
  releaseCandidateReportValidator = ajv.compile(releaseSchema);
  return releaseCandidateReportValidator;
}

function validateReleaseCandidateReport(loaded, candidate, validateRelease) {
  if (!validateRelease(loaded.value)) throw new InputError(`GATE-06-06 Release Candidate Report schema validation failed: ${JSON.stringify(validateRelease.errors)}`);
  if (loaded.value.report_status !== 'READY') throw new BlockedResult('Activation requires a READY GATE-06-06 Release Candidate report.');
  if (!same(loaded.value.candidate_manifest_ref, candidate.ref) || !same(loaded.value.handoff_ref, candidate.value.handoff_ref) || !same(loaded.value.source_build, candidate.value.source_build)) {
    throw new BlockedResult('GATE-06-06 Report does not bind to the supplied Candidate, Handoff, and target build.');
  }
  return loaded;
}

function reportsMatchIntake(reports, intake, sourceBuild) {
  return Object.values(reports).every(report => same(report.value.source_build, sourceBuild) && same(report.value.handoff_ref, intake.value.handoff_ref) && same(report.value.intake_report_ref, intake.ref));
}

function reportsWithFailures(reports) { return Object.values(reports).filter(report => report.value.report_status !== 'READY_FOR_ENABLEMENT_EVALUATION'); }
function releaseEvidenceRefs(manifest) { return manifest.release_evidence; }
function releaseEvidenceRefsFromReports(reports) { return { visual_report_ref: reports.visual.ref, e2e_report_ref: reports.e2e.ref, performance_report_ref: reports.performance.ref, recovery_report_ref: reports.recovery.ref }; }
function blocker(code, ref) { return { code, evidence_refs: [ref], message_key: code }; }
function batchId(family) { return family === 'PROCEDURAL' ? 'BATCH-PROCEDURAL' : family === 'CONTROL' ? 'BATCH-CONTROL' : 'BATCH-STRUCTURAL'; }
function familySuite(family) { return family === 'PROCEDURAL' ? 'E2E-CANVAS-002' : family === 'CONTROL' ? 'E2E-CANVAS-003' : 'E2E-CANVAS-004'; }
function visualCases(id) { return ['VP-1440X900', 'VP-1280X800', 'VP-390X844'].flatMap(viewport => ['Z-025', 'Z-100', 'Z-400'].map(zoom => `VIS-CANVAS.${id}.${viewport}.${zoom}`)); }
function scenarioIds() { return Array.from({ length: 7 }, (_, index) => `PERF-CANVAS-${String(index + 1).padStart(3, '0')}`); }
function recoveryIds(id) { return [`RCV-CANVAS.${id}.ROLLBACK`, 'RCV-CANVAS-023', 'RCV-CANVAS-024', 'RCV-CANVAS-025', 'RCV-CANVAS-026']; }
function limitations() { return ['性能只适用于报告环境。', '未证明 ISO 19450:2024 符合性。']; }
function manifestId(kind, sourceBuild, criticalRef) { return `dev-canvas-06.${kind.toLowerCase()}.${sourceBuild.source_commit.slice(0, 12)}.${criticalRef.sha256.slice(0, 12)}`; }

function batches(decisions, kind) {
  return [
    ['BATCH-PROCEDURAL', 1, []], ['BATCH-CONTROL', 2, ['BATCH-PROCEDURAL']], ['BATCH-STRUCTURAL', 3, []]
  ].map(([batch_id, ordinal, dependency_batch_ids]) => {
    const members = decisions.filter(item => item.batch_id === batch_id);
    const passed = members.every(item => item.release_validation_status === 'PASSED');
    const enabled = members.every(item => item.activation_state === 'ENABLED');
    return { batch_id, ordinal, capability_ids: members.map(item => item.capability_id), dependency_batch_ids, release_validation_status: passed ? 'PASSED' : 'BLOCKED', activation_state: enabled ? 'ENABLED' : 'DISABLED', blocker_codes: [...new Set(members.flatMap(item => item.blocker_codes))] };
  });
}

function controlCascade(decisions, requested, enabled) {
  const edges = [];
  for (const control of decisions.filter(item => item.family === 'CONTROL' && enabled.includes(item.capability_id))) {
    for (const procedural of control.dependency_closure.coverage_keys.map(key => key.split(':')[2]).filter(id => id?.startsWith('CAP-ISO-PROC-'))) {
      if (requested.includes(procedural)) edges.push({ source_capability_id: procedural, dependent_capability_id: control.capability_id });
    }
  }
  return edges;
}

function rollbackDecisions(decisions, disabled, cascade, status) {
  return decisions.map(item => {
    if (!disabled.includes(item.capability_id)) return { ...item };
    const code = status === 'ROLLED_BACK'
      ? 'CANVAS06_ROLLED_BACK'
      : cascade.some(edge => edge.dependent_capability_id === item.capability_id)
        ? 'CANVAS06_DEPENDENCY_ROLLED_BACK'
        : 'CANVAS06_CAPABILITY_ROLLED_BACK';
    return { ...item, activation_state: 'DISABLED', blocker_codes: [code] };
  });
}

function assertDerived(name, actual, expected) {
  if (!same(actual, expected)) throw new BlockedResult(`${name} does not match recomputed evidence.`);
}

async function assertManifest(manifest, evidenceRoot, manifestRef, ancestors = new Set()) {
  if (!validateManifest(manifest)) throw new InputError(`Enablement manifest schema validation failed: ${JSON.stringify(validateManifest.errors)}`);
  const expected = expectedIds();
  if (!same(manifest.capability_decisions.map(item => item.capability_id), expected)) throw new InputError('Capability decisions must contain the canonical 34 IDs once and in order.');
  if (!same(manifest.proposed_enabled_capability_ids, ordered(manifest.proposed_enabled_capability_ids)) || new Set(manifest.proposed_enabled_capability_ids).size !== manifest.proposed_enabled_capability_ids.length) throw new InputError('Proposed capability IDs must be unique and in Handoff order.');
  const enabled = manifest.production_gate.enabled_capability_ids;
  if (!same(enabled, ordered(enabled)) || new Set(enabled).size !== enabled.length) throw new InputError('Enabled capability IDs must be unique and in Handoff order.');
  if (manifest.manifest_kind === 'CANDIDATE' && (manifest.production_gate.state !== 'DISABLED' || enabled.length !== 0 || manifest.capability_decisions.some(item => item.activation_state !== 'DISABLED'))) throw new InputError('Candidate must keep production gate disabled.');
  if (manifest.manifest_status === 'READY_FOR_ACTIVATION' && manifest.proposed_enabled_capability_ids.length === 0) throw new InputError('READY Candidate requires at least one proposed capability.');
  if (manifest.manifest_status === 'ACTIVE_COMPLETE' && enabled.length !== 34) throw new InputError('ACTIVE_COMPLETE requires 34 enabled capabilities.');
  if (manifest.manifest_status === 'ACTIVE_PARTIAL' && (enabled.length < 1 || enabled.length > 33)) throw new InputError('ACTIVE_PARTIAL requires 1 through 33 enabled capabilities.');
  if (manifest.manifest_status === 'ROLLED_BACK' && (manifest.production_gate.state !== 'DISABLED' || enabled.length !== 0)) throw new InputError('ROLLED_BACK requires a disabled empty production gate.');
  if (!evidenceRoot) throw new InputError('Enablement verification requires an evidence root.');
  const key = manifestRef?.sha256;
  if (key && ancestors.has(key)) throw new InputError('Enablement manifest reference cycle detected.');
  const nextAncestors = new Set(ancestors);
  if (key) nextAncestors.add(key);
  if (manifest.manifest_kind === 'CANDIDATE') await assertCandidate(manifest, evidenceRoot);
  else if (manifest.manifest_kind === 'ACTIVATION') await assertActivation(manifest, evidenceRoot, nextAncestors);
  else await assertRollback(manifest, evidenceRoot, nextAncestors);
}

async function assertCandidate(manifest, evidenceRoot) {
  const intake = { value: await verifyRef(evidenceRoot, manifest.intake_report_ref), ref: manifest.intake_report_ref };
  if (!validateIntake(intake.value)) throw new InputError(`Manifest Intake reference fails schema validation: ${JSON.stringify(validateIntake.errors)}`);
  if (intake.value.intake_status !== 'READY_FOR_RELEASE_VALIDATION') throw new BlockedResult('Candidate requires a READY Intake report.');
  if (!same(intake.value.handoff_ref, manifest.handoff_ref)) throw new InputError('Manifest Handoff reference differs from its Intake report.');
  const reports = {
    visual: await loadReleaseReportReference(evidenceRoot, manifest.release_evidence.visual_report_ref, 'VISUAL_REPORT', 'OPM-DEV-CANVAS-06-VISUAL-REPORT-001', intake),
    e2e: await loadReleaseReportReference(evidenceRoot, manifest.release_evidence.e2e_report_ref, 'E2E_REPORT', 'OPM-DEV-CANVAS-06-E2E-REPORT-001', intake),
    performance: await loadReleaseReportReference(evidenceRoot, manifest.release_evidence.performance_report_ref, 'PERFORMANCE_REPORT', 'OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001', intake),
    recovery: await loadReleaseReportReference(evidenceRoot, manifest.release_evidence.recovery_report_ref, 'RECOVERY_REPORT', 'OPM-DEV-CANVAS-06-RECOVERY-REPORT-001', intake)
  };
  const sourceBuild = reports.visual.value.source_build;
  if (!reportsMatchIntake(reports, intake, sourceBuild)) throw new InputError('Candidate release reports do not share the READY Intake, Handoff, or target source build.');
  const decisions = intake.value.capability_intake.map(item => decision(item, reports));
  applyControlDependencies(decisions);
  const passed = decisions.filter(item => item.release_validation_status === 'PASSED').map(item => item.capability_id);
  const blockers = reportsWithFailures(reports).map(report => blocker(report.code, report.ref));
  const ready = blockers.length === 0 && passed.length > 0;
  const proposed = ready ? passed : [];
  assertDerived('Candidate status', manifest.manifest_status, ready ? 'READY_FOR_ACTIVATION' : 'BLOCKED');
  assertDerived('Candidate source build', manifest.source_build, sourceBuild);
  assertDerived('Candidate release evidence', manifest.release_evidence, releaseEvidenceRefsFromReports(reports));
  assertDerived('Candidate decisions', manifest.capability_decisions, decisions);
  assertDerived('Candidate batches', manifest.batches, batches(decisions, 'CANDIDATE'));
  assertDerived('Candidate proposed set', manifest.proposed_enabled_capability_ids, proposed);
  assertDerived('Candidate production gate', manifest.production_gate, { state: 'DISABLED', enabled_capability_ids: [] });
  assertDerived('Candidate blockers', manifest.blockers, blockers);
  assertDerived('Candidate limitations', manifest.limitations, limitations());
  assertDerived('Candidate identity', manifest.manifest_id, manifestId('CANDIDATE', sourceBuild, intake.ref));
}

async function assertActivation(manifest, evidenceRoot, ancestors) {
  const candidate = { value: await verifyRef(evidenceRoot, manifest.candidate_manifest_ref), ref: manifest.candidate_manifest_ref };
  await assertManifest(candidate.value, evidenceRoot, candidate.ref, ancestors);
  if (candidate.value.manifest_kind !== 'CANDIDATE' || candidate.value.manifest_status !== 'READY_FOR_ACTIVATION') throw new BlockedResult('Activation requires a READY_FOR_ACTIVATION Candidate manifest.');
  const release = await loadReleaseCandidateReportReference(evidenceRoot, manifest.release_candidate_report_ref, candidate);
  const enabled = candidate.value.proposed_enabled_capability_ids;
  const status = enabled.length === 34 ? 'ACTIVE_COMPLETE' : 'ACTIVE_PARTIAL';
  const decisions = candidate.value.capability_decisions.map(item => ({ ...item, activation_state: enabled.includes(item.capability_id) ? 'ENABLED' : 'DISABLED' }));
  assertDerived('Activation status', manifest.manifest_status, status);
  assertDerived('Activation source build', manifest.source_build, candidate.value.source_build);
  assertDerived('Activation supersedes ref', manifest.supersedes_ref, candidate.ref);
  assertDerived('Activation release report ref', manifest.release_candidate_report_ref, release.ref);
  assertDerived('Activation Handoff ref', manifest.handoff_ref, candidate.value.handoff_ref);
  assertDerived('Activation Intake ref', manifest.intake_report_ref, candidate.value.intake_report_ref);
  assertDerived('Activation release evidence', manifest.release_evidence, candidate.value.release_evidence);
  assertDerived('Activation decisions', manifest.capability_decisions, decisions);
  assertDerived('Activation batches', manifest.batches, batches(decisions, 'ACTIVATION'));
  assertDerived('Activation proposed set', manifest.proposed_enabled_capability_ids, enabled);
  assertDerived('Activation production gate', manifest.production_gate, { state: 'ENABLED', enabled_capability_ids: enabled });
  assertDerived('Activation blockers', manifest.blockers, []);
  assertDerived('Activation limitations', manifest.limitations, limitations());
  assertDerived('Activation identity', manifest.manifest_id, manifestId('ACTIVATION', candidate.value.source_build, candidate.ref));
}

async function assertRollback(manifest, evidenceRoot, ancestors) {
  const effective = { value: await verifyRef(evidenceRoot, manifest.rollback_of_ref), ref: manifest.rollback_of_ref };
  await assertManifest(effective.value, evidenceRoot, effective.ref, ancestors);
  if (!['ACTIVE_PARTIAL', 'ACTIVE_COMPLETE', 'ROLLED_BACK_PARTIAL'].includes(effective.value.manifest_status)) throw new BlockedResult('Rollback requires an ACTIVE or ROLLED_BACK_PARTIAL effective manifest.');
  const scope = manifest.rollback_scope;
  const enabled = effective.value.production_gate.enabled_capability_ids;
  const requested = scope.mode === 'ALL' ? [] : scope.requested_disabled_capability_ids;
  if (scope.mode === 'CAPABILITY_SET' && (!requested.length || new Set(requested).size !== requested.length || requested.some(id => !enabled.includes(id)))) {
    throw new BlockedResult('Rollback scope does not reduce the exact enabled capability set.');
  }
  const direct = scope.mode === 'ALL' ? enabled : requested;
  const cascade = controlCascade(effective.value.capability_decisions, direct, enabled);
  const disabled = ordered([...new Set([...direct, ...cascade.map(item => item.dependent_capability_id)])]);
  const remaining = enabled.filter(id => !disabled.includes(id));
  const status = remaining.length ? 'ROLLED_BACK_PARTIAL' : 'ROLLED_BACK';
  const decisions = rollbackDecisions(effective.value.capability_decisions, disabled, cascade, status);
  const expectedScope = { mode: scope.mode, requested_disabled_capability_ids: requested, effective_disabled_capability_ids: disabled, remaining_enabled_capability_ids: remaining, dependency_cascade: cascade };
  assertDerived('Rollback status', manifest.manifest_status, status);
  assertDerived('Rollback source build', manifest.source_build, effective.value.source_build);
  assertDerived('Rollback supersedes ref', manifest.supersedes_ref, effective.ref);
  assertDerived('Rollback Handoff ref', manifest.handoff_ref, effective.value.handoff_ref);
  assertDerived('Rollback Intake ref', manifest.intake_report_ref, effective.value.intake_report_ref);
  assertDerived('Rollback release evidence', manifest.release_evidence, effective.value.release_evidence);
  assertDerived('Rollback scope', manifest.rollback_scope, expectedScope);
  assertDerived('Rollback trigger evidence', manifest.rollback_trigger.evidence_refs, [effective.ref]);
  assertDerived('Rollback trigger message', manifest.rollback_trigger.message_key, manifest.rollback_trigger.trigger_code);
  assertDerived('Rollback decisions', manifest.capability_decisions, decisions);
  assertDerived('Rollback batches', manifest.batches, batches(decisions, 'ROLLBACK'));
  assertDerived('Rollback proposed set', manifest.proposed_enabled_capability_ids, remaining);
  assertDerived('Rollback production gate', manifest.production_gate, remaining.length ? { state: 'ENABLED', enabled_capability_ids: remaining } : { state: 'DISABLED', enabled_capability_ids: [] });
  assertDerived('Rollback blockers', manifest.blockers, []);
  assertDerived('Rollback limitations', manifest.limitations, limitations());
  assertDerived('Rollback identity', manifest.manifest_id, manifestId('ROLLBACK', effective.value.source_build, effective.ref));
}

async function loadRef(base, path, kind) {
  const resolved = resolveInside(base, path);
  const bytes = await readFile(resolved);
  const info = await stat(resolved);
  return { value: JSON.parse(bytes.toString('utf8')), ref: { kind, path: relative(base, resolved), byte_length: info.size, sha256: sha(bytes) } };
}
async function verifyRef(base, reference) {
  const resolved = resolveInside(base, reference.path);
  const bytes = await readFile(resolved);
  const info = await stat(resolved);
  if (info.size !== reference.byte_length || sha(bytes) !== reference.sha256) throw new InputError(`Manifest reference integrity mismatch: ${reference.path}`);
  return JSON.parse(bytes.toString('utf8'));
}
async function writeManifest(base, path, manifest) {
  if (!validateManifest(manifest)) throw new InputError(`Generated manifest schema validation failed: ${JSON.stringify(validateManifest.errors)}`);
  await assertManifest(manifest, base);
  const output = resolveInside(base, path);
  await mkdir(dirname(output), { recursive: true });
  try {
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new InputError(`Enablement manifest already exists and is immutable: ${path}`);
    throw error;
  }
}
function runnerIdentity() { return { runner_version: '0.1.0', source_commit: command(['rev-parse', 'HEAD']).trim(), node_version: process.version, os: `${process.platform}-${process.arch}`, command: 'npm run release:canvas06:enablement:<operation> -- --evidence-root <path> ...', runner_source_sha256: shaFileSync(resolve('scripts/release-canvas06-enablement.mjs')) }; }
function shaFileSync(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function command(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
function expectedIds() { return [...Array.from({ length: 16 }, (_, i) => `CAP-ISO-PROC-${String(i + 1).padStart(3, '0')}`), ...Array.from({ length: 8 }, (_, i) => `CAP-ISO-CTRL-${String(i + 1).padStart(3, '0')}`), ...Array.from({ length: 10 }, (_, i) => `CAP-ISO-STRUCT-${String(i + 1).padStart(3, '0')}`)]; }
function ordered(ids) { const order = new Map(expectedIds().map((id, index) => [id, index])); return [...ids].sort((a, b) => order.get(a) - order.get(b)); }
function sameSet(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function optionalJson(path) {
  try {
    return await json(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
function resolveInside(parent, path) { if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new InputError(`Path must remain inside evidence root: ${path}`); const resolved = resolve(parent, path); if (!resolved.startsWith(`${parent}/`)) throw new InputError(`Path escapes evidence root: ${path}`); return resolved; }
function required(values, key) { const value = values.get(key); if (!value) throw new InputError(`Missing --${key}.`); return value; }
function resolveRequired(values, key) { return resolve(required(values, key)); }
function parseOptions(values) {
  const stored = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new InputError('Options must be --name <value>.');
    stored.set(flag.slice(2), [...(stored.get(flag.slice(2)) ?? []), value]);
  }
  return { get: key => stored.get(key)?.at(-1), getAll: key => stored.get(key) ?? [] };
}
function InputError(message) { this.name = 'InputError'; this.message = message; }
function BlockedResult(message) { this.name = 'BlockedResult'; this.message = message; }
