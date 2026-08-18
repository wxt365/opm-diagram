import { sha256Jcs } from './canvas06-rfc8785.mjs';
import { deriveRecoveryCaseCatalog, RecoveryManifestInputError } from './canvas06-recovery-manifest-input.mjs';

export class RecoveryManifestComposeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryManifestComposeError';
    this.code = 'RECOVERY_INPUT_INVALID';
    this.exitCode = 2;
  }
}

/** 从已验证的镜像输入构造活动 Recovery Manifest 和 test-only Gate Fixture。 */
export function composeRecoveryManifestAndGateFixture(input) {
  requireObject(input, 'Recovery Manifest composition input');
  const {
    sourceDateEpoch, generatorIdentity, handoffRef, intakeReportRef, upstreamSourceBuild, sourceBuild,
    modelTemplate, gateTemplate, modelTemplateRef, gateTemplateRef, reopenCatalog, reopenCatalogRef
  } = input;
  requireEpoch(sourceDateEpoch);
  requireIdentity(generatorIdentity);
  requireFileRef(handoffRef, 'Handoff ref');
  requireFileRef(intakeReportRef, 'Intake ref');
  requireFileRef(modelTemplateRef, 'Model Template ref');
  requireFileRef(gateTemplateRef, 'Gate Template ref');
  requireFileRef(reopenCatalogRef, 'Reopen Catalog ref');
  requireObject(upstreamSourceBuild, 'Upstream source build');
  requireObject(sourceBuild, 'Source build');
  requireObject(modelTemplate, 'Model Template');
  requireObject(gateTemplate, 'Gate Template');
  requireObject(reopenCatalog, 'Reopen Catalog');

  validateTemplateBindings({ sourceDateEpoch, handoffRef, intakeReportRef, sourceBuild, modelTemplate, gateTemplate });
  const fixtureCatalog = [
    fixtureEntry('RECOVERY-FIXTURE-MODEL', modelTemplateRef, modelTemplate),
    fixtureEntry('RECOVERY-FIXTURE-GATE', gateTemplateRef, gateTemplate)
  ];
  let caseCatalog;
  try {
    caseCatalog = deriveRecoveryCaseCatalog({ modelTemplate, reopenCatalog, modelFixtureRef: fixtureCatalog[0].source_ref });
  } catch (error) {
    if (error instanceof RecoveryManifestInputError) fail(error.message);
    throw error;
  }
  if (reopenCatalog.catalog_payload_sha256 !== sha256Jcs(without(reopenCatalog, 'catalog_payload_sha256'))) {
    fail('Recovery Reopen Catalog payload digest is invalid.');
  }

  const manifest = {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001',
    schema_version: '0.2',
    manifest_id: `dev-canvas-06.recovery.${sourceBuild.source_commit.slice(0, 12)}.${intakeReportRef.sha256.slice(0, 12)}`,
    manifest_version: '0.2.0',
    generated_at: new Date(sourceDateEpoch * 1000).toISOString(),
    generator_identity: clone(generatorIdentity),
    handoff_ref: clone(handoffRef),
    intake_report_ref: clone(intakeReportRef),
    reopen_expectation_catalog_ref: clone(reopenCatalogRef),
    reopen_expectation_catalog_payload_sha256: reopenCatalog.catalog_payload_sha256,
    upstream_source_build: clone(upstreamSourceBuild),
    source_build: clone(sourceBuild),
    environment_policy: {
      java_major: 21,
      node_major: 22,
      loopback_only: true,
      production_gate_read_only: true
    },
    fixture_catalog: fixtureCatalog,
    fault_policy: {
      required_attempt_count: 2,
      runner_retry_count: 0,
      forced_termination: 'OS_CHILD_PROCESS',
      evidence_capture_before_cleanup: true
    },
    case_catalog: caseCatalog,
    summary: {
      fixture_count: 2,
      case_count: 28,
      pre_commit_case_count: 8,
      sqlite_case_count: 7,
      forced_restart_case_count: 4,
      service_recovery_case_count: 3,
      rollback_case_count: 6,
      required_attempt_count: 56
    }
  };
  const gateFixture = composeGateFixture({ sourceDateEpoch, handoffRef, intakeReportRef, sourceBuild, gateTemplate });
  return deepFreeze({ manifest, gateFixture });
}

function fixtureEntry(fixtureId, sourceRef, template) {
  if (template.fixture_id !== fixtureId || sourceRef.kind !== 'RECOVERY_TEMPLATE'
      || typeof template.template_payload_sha256 !== 'string' || !isDigest(template.template_payload_sha256)
      || !template.expected_result_digests || typeof template.expected_result_digests !== 'object') {
    fail(`${fixtureId} frozen Template identity is invalid.`);
  }
  return {
    fixture_id: fixtureId,
    source_ref: clone(sourceRef),
    fixture_digest: sha256Jcs({
      fixture_id: fixtureId,
      source_ref: sourceRef,
      template_payload_sha256: template.template_payload_sha256,
      expected_result_digests: template.expected_result_digests
    }),
    expected_result_digests: clone(template.expected_result_digests)
  };
}

function composeGateFixture({ sourceDateEpoch, handoffRef, intakeReportRef, sourceBuild, gateTemplate }) {
  if (!Array.isArray(gateTemplate.capability_order) || gateTemplate.capability_order.length !== 34
      || new Set(gateTemplate.capability_order).size !== 34
      || !sameJson(gateTemplate.capability_order, gateTemplate.eligible_capability_ids)
      || gateTemplate.simulated_effective_state?.manifest_state !== 'ACTIVE_COMPLETE'
      || gateTemplate.production_gate_guard?.before?.state !== 'DISABLED'
      || gateTemplate.production_gate_guard?.after?.state !== 'DISABLED') {
    fail('Recovery Gate Template capability or production-gate guard is invalid.');
  }
  const edges = [];
  for (const sourceCapabilityId of Object.keys(gateTemplate.reverse_control_dependencies ?? {}).sort()) {
    const dependents = gateTemplate.reverse_control_dependencies[sourceCapabilityId];
    if (!Array.isArray(dependents)) fail('Recovery Gate Template dependency graph is invalid.');
    for (const dependentCapabilityId of dependents) {
      edges.push({ source_capability_id: sourceCapabilityId, dependent_capability_id: dependentCapabilityId, evidence_ref: clone(handoffRef) });
    }
  }
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-GATE-FIXTURE-001',
    schema_version: '0.1',
    fixture_id: 'RECOVERY-FIXTURE-GATE',
    generated_at: new Date(sourceDateEpoch * 1000).toISOString(),
    test_only: true,
    production_loader_expected_status: 'REJECTED',
    handoff_ref: clone(handoffRef),
    intake_report_ref: clone(intakeReportRef),
    source_build: clone(sourceBuild),
    source_manifest_state: 'ACTIVE_COMPLETE',
    enabled_capability_ids: clone(gateTemplate.eligible_capability_ids),
    dependency_graph: { edges, sha256: sha256Jcs(edges) }
  };
  value.fixture_digest = sha256Jcs(value);
  return value;
}

function validateTemplateBindings({ sourceDateEpoch, handoffRef, intakeReportRef, sourceBuild, modelTemplate, gateTemplate }) {
  if (modelTemplate.source_date_epoch !== sourceDateEpoch || gateTemplate.source_date_epoch !== sourceDateEpoch
      || modelTemplate.source_build_binding?.source_commit !== sourceBuild.source_commit
      || !sameJson(modelTemplate.source_build_binding?.handoff_ref, handoffRef)
      || !sameJson(modelTemplate.source_build_binding?.intake_report_ref, intakeReportRef)
      || !sameJson(modelTemplate.source_build_binding?.runtime_jar_ref, sourceBuild.local_runtime_jar)
      || !sameJson(gateTemplate.handoff_identity?.handoff_ref, handoffRef)
      || !sameJson(gateTemplate.intake_identity?.intake_report_ref, intakeReportRef)) {
    fail('Recovery Template binding does not close the mirrored source build.');
  }
}

function requireIdentity(value) {
  requireObject(value, 'Recovery generator identity');
  if (value.runner_version !== '0.1.0' || !isDigest(value.runner_source_sha256)
      || !/^[a-f0-9]{40}$/.test(value.source_commit ?? '')) {
    fail('Recovery generator identity is invalid.');
  }
}

function requireEpoch(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('Recovery source date epoch is invalid.');
}

function requireFileRef(value, label) {
  requireObject(value, label);
  if (typeof value.kind !== 'string' || typeof value.path !== 'string' || !Number.isSafeInteger(value.byte_length)
      || value.byte_length < 0 || !isDigest(value.sha256)) fail(`${label} is invalid.`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`);
}

function sameJson(left, right) {
  return left !== undefined && right !== undefined && sha256Jcs(left) === sha256Jcs(right);
}

function without(value, key) {
  const result = clone(value);
  delete result[key];
  return result;
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(message) {
  throw new RecoveryManifestComposeError(message);
}
