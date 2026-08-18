import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { sha256Jcs } from './canvas06-rfc8785.mjs';

const root = resolve('.');
const schemaFiles = {
  'manifest-v01': 'opm-dev-canvas-06-recovery-manifest.schema.json',
  manifest: 'opm-dev-canvas-06-recovery-manifest-v02.schema.json',
  'reopen-catalog': 'opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json',
  'api-request-artifact': 'opm-dev-canvas-06-recovery-api-request-artifact.schema.json',
  'gate-fixture': 'opm-dev-canvas-06-recovery-gate-fixture.schema.json',
  report: 'opm-dev-canvas-06-recovery-report.schema.json',
  'tree-descriptor': 'opm-dev-canvas-06-recovery-tree-descriptor.schema.json',
  'attempt-materialization': 'opm-dev-canvas-06-recovery-attempt-materialization.schema.json',
  'launch-request': 'opm-dev-canvas-06-recovery-launch-request.schema.json',
  'launch-proof': 'opm-dev-canvas-06-recovery-launch-proof.schema.json'
};
const schemas = Object.fromEntries(await Promise.all(Object.entries(schemaFiles).map(async ([kind, file]) => [kind, JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas', file), 'utf8'))])));
const reopenCatalog = JSON.parse(await readFile(resolve(root, 'tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
Object.values(schemas).forEach(schema => ajv.addSchema(schema));
const validators = Object.fromEntries(Object.entries(schemas).map(([kind, schema]) => [kind, ajv.getSchema(schema.$id)]));

test('Recovery Manifest 0.1 remains a readable historical contract', () => assert.equal(validators['manifest-v01'](manifestV01()), true, JSON.stringify(validators['manifest-v01'].errors)));
test('Recovery Reopen Catalog freezes three profiles and 28 exact mappings', () => {
  assert.equal(validators['reopen-catalog'](reopenCatalog), true, JSON.stringify(validators['reopen-catalog'].errors));
  assertReopenCatalog(reopenCatalog);
});
test('Recovery Manifest 0.2 accepts only the catalog-joined reopen contract', () => {
  const value = manifest();
  assert.equal(validators.manifest(value), true, JSON.stringify(validators.manifest.errors));
  assertManifestReopenJoin(value, reopenCatalog);
});
test('Recovery Manifest 0.2 rejects open reopen fields and semantic digest drift', () => {
  const open = manifest(); open.case_catalog[0].expected_reopen.arbitrary = true;
  assert.equal(validators.manifest(open), false);
  const openUpstream = manifest(); openUpstream.upstream_source_build.unexpected = true;
  assert.equal(validators.manifest(openUpstream), false);
  const openFixtureDigest = manifest(); openFixtureDigest.fixture_catalog[0].expected_result_digests.unexpected = digest('unexpected');
  assert.equal(validators.manifest(openFixtureDigest), false);
  const duplicateFixture = manifest(); duplicateFixture.fixture_catalog[1] = structuredClone(duplicateFixture.fixture_catalog[0]);
  assert.equal(validators.manifest(duplicateFixture), false);
  const digestDrift = manifest(); digestDrift.case_catalog[0].expected_reopen_sha256 = digest('wrong-reopen');
  assert.equal(validators.manifest(digestDrift), true, JSON.stringify(validators.manifest.errors));
  assert.throws(() => assertManifestReopenJoin(digestDrift, reopenCatalog));
  const payloadDrift = structuredClone(reopenCatalog); payloadDrift.catalog_payload_sha256 = digest('wrong-catalog');
  assert.throws(() => assertReopenCatalog(payloadDrift));
});
test('Recovery API request artifact Schema closes ingress, parsed and observation shapes', () => {
  const validate = validators['api-request-artifact'];
  for (const value of [requestIngress(), requestParsed(), requestObservation()]) assert.equal(validate(value), true, JSON.stringify(validate.errors));
  const extra = requestIngress(); extra.unexpected = true;
  assert.equal(validate(extra), false);
  const rejected = requestObservation('REJECTED'); rejected.controller_invocation_count = 1;
  assert.equal(validate(rejected), false);
});
test('Recovery Gate Fixture Schema accepts only test-only production-loader rejection', () => {
  assert.equal(validators['gate-fixture'](gateFixture()), true, JSON.stringify(validators['gate-fixture'].errors));
  const invalid = gateFixture(); invalid.production_loader_expected_status = 'ACCEPTED';
  assert.equal(validators['gate-fixture'](invalid), false);
});
test('Recovery Report Schema accepts 28 cases and 56 isolated attempts', () => assert.equal(validators.report(report()), true, JSON.stringify(validators.report.errors)));
test('Recovery Report Schema rejects incomplete READY evidence and invalid failure codes', () => {
  const incomplete = report(); incomplete.summary.observed_attempt_count = 55;
  assert.equal(validators.report(incomplete), false);
  const invalid = report(); invalid.report_status = 'BLOCKED'; invalid.failures = [{ code: 'RECOVERY_UNKNOWN', evidence_refs: [ref('EVIDENCE')], message_key: 'RECOVERY_UNKNOWN' }];
  assert.equal(validators.report(invalid), false);
});
test('Recovery Tree Descriptor Schema accepts only the closed descriptor shape', () => {
  assert.equal(validators['tree-descriptor'](treeDescriptor()), true, JSON.stringify(validators['tree-descriptor'].errors));
  const invalid = treeDescriptor(); invalid.entries[0].unexpected = true;
  assert.equal(validators['tree-descriptor'](invalid), false);
  const wrongRoot = treeDescriptor(); wrongRoot.root_path = 'fixture';
  assert.equal(validators['tree-descriptor'](wrongRoot), false);
  const wrongMedia = treeDescriptor(); wrongMedia.entries[0].media_type = 'application/vnd.sqlite3';
  assert.equal(validators['tree-descriptor'](wrongMedia), false);
  const dotPath = treeDescriptor(); dotPath.entries[0].path = 'packages/./profile.json';
  assert.equal(validators['tree-descriptor'](dotPath), false);
  const duplicateKind = treeDescriptor(); duplicateKind.entries[1].kind = 'PROFILE_PACKAGE';
  assert.equal(validators['tree-descriptor'](duplicateKind), false);
});
test('Recovery Tree Descriptor Schema accepts the closed ten-entry input tree', () => {
  assert.equal(validators['tree-descriptor'](inputTreeDescriptor()), true, JSON.stringify(validators['tree-descriptor'].errors));
  const incomplete = inputTreeDescriptor(); incomplete.entries.pop();
  assert.equal(validators['tree-descriptor'](incomplete), false);
  const wrongDatabaseMedia = inputTreeDescriptor(); wrongDatabaseMedia.entries.at(-1).media_type = 'application/json';
  assert.equal(validators['tree-descriptor'](wrongDatabaseMedia), false);
});
test('Recovery Attempt Materialization Schema accepts a closed model attempt', () => {
  assert.equal(validators['attempt-materialization'](materialization()), true, JSON.stringify(validators['attempt-materialization'].errors));
  const invalid = materialization(); invalid.profile_assets.unexpected = true;
  assert.equal(validators['attempt-materialization'](invalid), false);
  const unknownCase = materialization(); unknownCase.case_id = 'RCV-CANVAS-029.UNKNOWN';
  assert.equal(validators['attempt-materialization'](unknownCase), false);
  const wrongCategory = materialization(); wrongCategory.category = 'SQLITE';
  assert.equal(validators['attempt-materialization'](wrongCategory), false);
  const wrongScenario = materialization(); wrongScenario.base_scenario_id = 'RECOVERY-COMMAND-STATE-001';
  assert.equal(validators['attempt-materialization'](wrongScenario), false);
  const wrongHelperPath = materialization(); wrongHelperPath.source_refs.factory_helper_jar_ref.path = 'recovery/other.jar';
  assert.equal(validators['attempt-materialization'](wrongHelperPath), false);
  const incompleteTableSet = materialization(); delete incompleteTableSet.storage.table_counts.schema_metadata;
  assert.equal(validators['attempt-materialization'](incompleteTableSet), false);
});
test('Recovery Attempt Materialization Schema enforces rollback-only Gate refs', () => {
  const rollback = materialization('ROLLBACK');
  assert.equal(validators['attempt-materialization'](rollback), true, JSON.stringify(validators['attempt-materialization'].errors));
  const missing = materialization('ROLLBACK'); delete missing.storage.gate_work_copy_ref;
  assert.equal(validators['attempt-materialization'](missing), false);
  const forbidden = materialization(); forbidden.source_refs.gate_fixture_ref = ref('RECOVERY_GATE_FIXTURE');
  assert.equal(validators['attempt-materialization'](forbidden), false);
});
test('Recovery Launch Request Schema accepts the unique normal and forced shapes', () => {
  const validate = validators['launch-request'];
  for (const value of [launchRequest(), launchRequest(true)]) {
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assertLaunchRequestDigest(value);
  }
});
test('Recovery Launch Request Schema rejects challenge and termination-policy drift', () => {
  const validate = validators['launch-request'];
  const wrongLength = launchRequest(); wrongLength.parent_challenge_ref.byte_length = 31;
  assert.equal(validate(wrongLength), false);
  const wrongKind = launchRequest(); wrongKind.parent_challenge_ref.kind = 'RECOVERY_SECRET';
  assert.equal(validate(wrongKind), false);
  const wrongPath = launchRequest(); wrongPath.parent_challenge_ref.path = 'control/challenge.bin';
  assert.equal(validate(wrongPath), false);
  const forcedAsNormal = launchRequest(true); forcedAsNormal.termination_policy = 'NORMAL';
  assert.equal(validate(forcedAsNormal), false);
  const normalAtReachpoint = launchRequest(); normalAtReachpoint.reachpoint = 'AFTER_HEAD_UPDATE_BEFORE_OPERATION';
  assert.equal(validate(normalAtReachpoint), false);
});
test('Recovery Launch Proof Schema accepts all four ordered proof roots', () => {
  const validate = validators['launch-proof'];
  for (const proof of launchProofs()) {
    assert.equal(validate(proof), true, `${proof.schema_id}: ${JSON.stringify(validate.errors)}`);
    assertPayloadDigest(proof);
  }
});
test('Recovery Launch Proof Schema closes reachpoint and POSIX/Windows termination conditions', () => {
  const validate = validators['launch-proof'];
  const wrongWindow = reachpointProof(); wrongWindow.connection_commit_returned = true;
  assert.equal(validate(wrongWindow), false);
  const windows = terminationProof('TERMINATE_PROCESS');
  assert.equal(validate(windows), true, JSON.stringify(validate.errors));
  assertPayloadDigest(windows);
  const mixed = terminationProof('TERMINATE_PROCESS'); mixed.observed_signal = 'SIGKILL';
  assert.equal(validate(mixed), false);
  const posixWithExitCode = terminationProof(); posixWithExitCode.observed_exit_code = 137;
  assert.equal(validate(posixWithExitCode), false);
});
test('Recovery Launch contracts reject extra fields and detect payload tampering', () => {
  const validateRequest = validators['launch-request'];
  const extra = launchRequest(); extra.unexpected = true;
  assert.equal(validateRequest(extra), false);
  const requestTamper = launchRequest(); requestTamper.requested_loopback_port = 19091;
  assert.equal(validateRequest(requestTamper), true, JSON.stringify(validateRequest.errors));
  assert.throws(() => assertLaunchRequestDigest(requestTamper));

  const validateProof = validators['launch-proof'];
  const proofExtra = childReady(); proofExtra.unexpected = true;
  assert.equal(validateProof(proofExtra), false);
  const proofTamper = parentObserved(); proofTamper.observed_at_monotonic_ns += 1;
  assert.equal(validateProof(proofTamper), true, JSON.stringify(validateProof.errors));
  assert.throws(() => assertPayloadDigest(proofTamper));
});

function manifestV01() { return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001', schema_version: '0.1', manifest_id: 'dev-canvas-06.recovery.aaaaaaaaaaaa.bbbbbbbbbbbb', manifest_version: '0.1.0', generated_at: stamp(), generator_identity: identity(), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(), environment_policy: { java_major: 21, node_major: 22, loopback_only: true, production_gate_read_only: true }, fixture_catalog: ['RECOVERY-FIXTURE-MODEL', 'RECOVERY-FIXTURE-GATE'].map(fixture_id => ({ fixture_id, source_ref: ref('RECOVERY_FIXTURE'), fixture_digest: digest(fixture_id), expected_result_digests: { expected: digest('expected') } })), fault_policy: { required_attempt_count: 2, runner_retry_count: 0, forced_termination: 'OS_CHILD_PROCESS', evidence_capture_before_cleanup: true }, case_catalog: Array.from({ length: 28 }, (_, index) => ({ case_id: `RCV-CANVAS-${String(index + 1).padStart(3, '0')}.CASE_${index + 1}`, category: category(index), fixture_ref: ref('RECOVERY_FIXTURE'), fault: { stage: category(index), variant: `CASE_${index + 1}`, requires_forced_termination: index >= 15 && index <= 18 }, expected_process_outcome: 'BLOCKED_ZERO_DELTA', expected_transaction: transaction(), expected_reopen: { stable: true }, expected_gate: { status: index >= 22 ? 'PARTIAL' : 'UNCHANGED_DISABLED' }, required_attempt_count: 2 })), summary: baseCounts() }; }
function manifest() {
  const profiles = new Map(reopenCatalog.profiles.map(profile => [profile.profile_id, profile]));
  return {
    ...manifestV01(), schema_version: '0.2', manifest_version: '0.2.0',
    upstream_source_build: upstreamBuild(),
    fixture_catalog: [
      { fixture_id: 'RECOVERY-FIXTURE-MODEL', source_ref: ref('RECOVERY_FIXTURE'), fixture_digest: digest('RECOVERY-FIXTURE-MODEL'), expected_result_digests: modelResultDigests() },
      { fixture_id: 'RECOVERY-FIXTURE-GATE', source_ref: ref('RECOVERY_FIXTURE'), fixture_digest: digest('RECOVERY-FIXTURE-GATE'), expected_result_digests: gateResultDigests() }
    ],
    reopen_expectation_catalog_ref: ref('RECOVERY_REOPEN_EXPECTATION_CATALOG', 'dev-canvas-06/recovery/fixtures/catalogs/0.1.0/recovery-reopen-expectation-catalog.json', 9308, '9c5d95c454aa680b12a8d3b3bfb958c4f4ec8b8f971bc21e7bb464f6ef32622e'),
    reopen_expectation_catalog_payload_sha256: reopenCatalog.catalog_payload_sha256,
    case_catalog: reopenCatalog.cases.map((mapping, index) => {
      const profile = profiles.get(mapping.expected_reopen_profile_id);
      return { case_id: mapping.case_id, category: category(index), fixture_ref: ref('RECOVERY_FIXTURE'), fault: { stage: category(index), variant: mapping.case_id.split('.')[1], requires_forced_termination: index >= 15 && index <= 18 }, expected_process_outcome: 'BLOCKED_ZERO_DELTA', expected_transaction: transaction(), expected_reopen: structuredClone(profile.expected_reopen), expected_reopen_sha256: mapping.expected_reopen_sha256, expected_gate: { status: index >= 22 ? 'PARTIAL' : 'UNCHANGED_DISABLED' }, required_attempt_count: 2 };
    })
  };
}
function gateFixture() { return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-GATE-FIXTURE-001', schema_version: '0.1', fixture_id: 'RECOVERY-FIXTURE-GATE', generated_at: stamp(), test_only: true, production_loader_expected_status: 'REJECTED', handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), source_build: sourceBuild(), source_manifest_state: 'ACTIVE_COMPLETE', enabled_capability_ids: capabilityIds(), dependency_graph: { edges: [{ source_capability_id: 'CAP-ISO-PROC-001', dependent_capability_id: 'CAP-ISO-CTRL-001', evidence_ref: ref('DEPENDENCY') }], sha256: digest('graph') }, fixture_digest: digest('gate') }; }
function report() { return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-REPORT-001', schema_version: '0.1', report_id: 'dev-canvas-06.recovery-report.aaaaaaaaaaaa.bbbbbbbbbbbb', generated_at: stamp(), runner_identity: identity(), manifest_ref: ref('RECOVERY_MANIFEST'), gate_fixture_ref: ref('RECOVERY_GATE_FIXTURE'), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), upstream_source_build: { upstream: 'build' }, source_build: sourceBuild(), environment: { valid: true, java_version: '21.0.7', node_version: '22.0.0', os: 'darwin', filesystem: 'apfs', loopback_only: true, production_gate_disabled: true }, environment_fingerprint: digest('environment'), report_status: 'READY_FOR_ENABLEMENT_EVALUATION', summary: { ...baseCounts(), observed_attempt_count: 56, pass_matched_count: 28, failed_count: 0, zero_model_delta_case_count: 26, committed_recovered_case_count: 2, partial_rollback_matched_count: 3, full_rollback_matched_count: 1, rejected_rollback_matched_count: 2, skipped_count: 0, retry_count: 0, production_gate_mutation_count: 0 }, gate_fixture_result: { expected_loader_status: 'REJECTED', observed_loader_status: 'REJECTED', evaluator_adapter_status: 'MATCHED', production_gate_before: { state: 'DISABLED' }, production_gate_after: { state: 'DISABLED' }, status: 'MATCHED', evidence_refs: [ref('EVIDENCE')] }, fixture_results: Array.from({ length: 2 }, (_, index) => ({ fixture_id: `fixture.${index}`, source_ref: ref('RECOVERY_FIXTURE'), before_digest: digest(`before${index}`), after_digest: digest(`after${index}`), integrity_status: 'MATCHED', evidence_refs: [ref('EVIDENCE')] })), case_results: Array.from({ length: 28 }, (_, index) => caseResult(index)), failures: [], limitations: [] }; }
function caseResult(index) { return { case_id: `RCV-CANVAS-${String(index + 1).padStart(3, '0')}.CASE_${index + 1}`, category: category(index), status: 'PASS_MATCHED', attempts: [attempt(1), attempt(2)], failure_codes: [], evidence_refs: [ref('EVIDENCE')] }; }
function attempt(attempt_ordinal) { const value = snapshot(); return { attempt_ordinal, isolated_root_ref: ref('ISOLATED_ROOT'), asset_copy_ref: ref('ASSET_COPY'), project_db_ref: ref('PROJECT_DB'), before_snapshot: value, injected_fault: { stage: 'test' }, fault_reached: true, api_observation: { status: 'observed' }, process_observation: { status: 'observed' }, after_snapshot: value, reopen_snapshot: value, artifact_refs: [ref('EVIDENCE')], normalized_outcome_digest: digest('outcome'), status: 'PASS_MATCHED' }; }
function snapshot() { return { revision_document_count: 1, revision_parent_count: 1, text_artifact_count: 1, text_trace_count: 1, finding_count: 1, operation_count: 1, receipt_count: 1, draft_head_revision_id: 'revision.001', head_sequence: 1, revision_digest: digest('revision'), projection_digest: digest('projection'), opl_digest: digest('opl'), trace_digest: digest('trace'), sqlite_quick_check: 'ok', foreign_key_check_count: 0, recovery_marker_refs: [], temporary_artifact_refs: [] }; }
function treeDescriptor() { return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-TREE-DESCRIPTOR-001', schema_version: '0.1', descriptor_id: 'dev-canvas-06.recovery-tree.RCV-CANVAS-001.RULE_IDENTITY.1.assets', descriptor_version: '0.1.0', scope: 'ASSET_TREE', root_path: 'fixture/assets', entries: [{ kind: 'PROFILE_PACKAGE', path: 'packages/profiles/profile/0.1/profile.json', media_type: 'application/json', byte_length: 1, sha256: digest('profile') }, { kind: 'RULE_SET', path: 'packages/profiles/profile/0.1/rules.json', media_type: 'application/json', byte_length: 1, sha256: digest('rules') }, { kind: 'SYMBOL_ASSET', path: 'packages/profiles/profile/0.1/symbols.json', media_type: 'application/json', byte_length: 1, sha256: digest('symbols') }, { kind: 'GRAMMAR_ASSET', path: 'packages/profiles/profile/0.1/grammar.json', media_type: 'application/json', byte_length: 1, sha256: digest('grammar') }, { kind: 'NORMALIZATION_DATA', path: 'packages/profiles/profile/0.1/normalization.json', media_type: 'application/json', byte_length: 1, sha256: digest('normalization') }], tree_sha256: digest('tree'), descriptor_payload_sha256: digest('descriptor') }; }
function inputTreeDescriptor() { return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-TREE-DESCRIPTOR-001', schema_version: '0.1', descriptor_id: 'dev-canvas-06.recovery-tree.RCV-CANVAS-001.RULE_IDENTITY.1.input', descriptor_version: '0.1.0', scope: 'INPUT_TREE', root_path: 'fixture', entries: [{ kind: 'SOURCE_TEMPLATE', path: 'model-template.json', media_type: 'application/json', byte_length: 1, sha256: digest('model-template') }, { kind: 'SOURCE_TEMPLATE', path: 'gate-template.json', media_type: 'application/json', byte_length: 1, sha256: digest('gate-template') }, { kind: 'BASE_REVISION', path: 'base-revision.json', media_type: 'application/json', byte_length: 1, sha256: digest('base') }, ...treeDescriptor().entries.map(entry => ({ ...entry, path: `assets/${entry.path}` })), { kind: 'TREE_DESCRIPTOR', path: 'descriptors/asset-tree.json', media_type: 'application/json', byte_length: 1, sha256: digest('asset-tree') }, { kind: 'PROJECT_DB', path: 'storage/projects/project.recovery.procedural.001/project.db', media_type: 'application/vnd.sqlite3', byte_length: 1, sha256: digest('project-db') }], tree_sha256: digest('input-tree'), descriptor_payload_sha256: digest('input-descriptor') }; }
function materialization(category = 'PRE_COMMIT') {
  const profileRefs = { profile_ref: ref('PROFILE_PACKAGE'), rule_set_ref: ref('RULE_SET'), symbol_catalog_ref: ref('SYMBOL_ASSET'), text_grammar_ref: ref('GRAMMAR_ASSET'), normalization_adapter_ref: ref('NORMALIZATION_DATA') };
  const rollback = category === 'ROLLBACK';
  const caseId = rollback ? 'RCV-CANVAS-023.ROLLBACK_STRUCTURAL' : 'RCV-CANVAS-001.RULE_IDENTITY';
  const scenarioId = rollback ? 'RECOVERY-COMMAND-STRUCTURAL-FAN-001' : 'RECOVERY-COMMAND-PROCEDURAL-001';
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-ATTEMPT-MATERIALIZATION-001', schema_version: '0.1', contract_version: '0.1.0',
    materialization_id: `dev-canvas-06.recovery-materialization.${caseId}.1.aaaaaaaaaaaa`, case_id: caseId, category,
    base_scenario_id: scenarioId, attempt_ordinal: 1, source_date_epoch: 1785758631, case_definition_sha256: digest('case'),
    source_build: sourceBuild(), source_refs: { manifest_ref: ref('RECOVERY_MANIFEST'), handoff_ref: ref('HANDOFF'), intake_report_ref: ref('INTAKE_REPORT'), runtime_jar_ref: ref('LOCAL_RUNTIME_JAR'), factory_helper_jar_ref: ref('RECOVERY_TEST_TOOLS_JAR', 'dev-canvas-06/recovery/build/recovery-test-tools.jar'), model_template_ref: ref('RECOVERY_TEMPLATE'), gate_template_ref: ref('RECOVERY_TEMPLATE'), base_revision_ref: ref('MS_REV_001_V02'), profile_source_refs: profileRefs },
    active_binding: binding(), base_revision_identity: { schema_id: 'MS-REV-001', schema_version: '0.2', project_id: 'project.recovery.procedural.001', model_id: 'model.golden.proc', revision_id: 'revision.base.golden.proc.001', revision_sequence: 1, parent_revision_id: null, context_id: 'context.sd.root', history_mode: 'SINGLE_REVISION_SNAPSHOT' },
    profile_assets: { asset_root: 'fixture/assets/packages/profiles', copied_refs: profileRefs, package_digest: digest('package') },
    storage: { storage_root: 'fixture/storage', project_db_ref: ref('RECOVERY_PROJECT_DB'), storage_schema_version: '1.0', transaction_status: 'COMMITTED', table_counts: tableCounts(), sqlite_quick_check: 'ok', foreign_key_check_count: 0, sidecar_absent: true },
    descriptors: { asset_tree_ref: ref('RECOVERY_ASSET_TREE_DESCRIPTOR'), input_tree_ref: ref('RECOVERY_INPUT_TREE_DESCRIPTOR'), input_tree_sha256: digest('input-tree') },
    base_snapshot: snapshot(), materialization_payload_sha256: digest('materialization')
  };
  if (category === 'ROLLBACK') { value.source_refs.gate_fixture_ref = ref('RECOVERY_GATE_FIXTURE'); value.storage.gate_work_copy_ref = ref('RECOVERY_GATE_WORK_COPY'); }
  return value;
}
function launchRequest(forced = false) {
  const value = {
    schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-LAUNCH-REQUEST-001', schema_version: '0.1', protocol_version: '0.1',
    case_id: forced ? 'RCV-CANVAS-016.KILL_AFTER_REVISION_INSERT' : 'RCV-CANVAS-001.RULE_IDENTITY',
    category: forced ? 'FORCED_RESTART' : 'PRE_COMMIT', attempt_ordinal: 1, source_date_epoch: 1785758631,
    runtime_jar_ref: ref('LOCAL_RUNTIME_JAR', 'inputs/build/local-runtime.jar'),
    launcher_jar_ref: ref('RECOVERY_TEST_LAUNCHER_JAR', 'inputs/build/recovery-test-launcher.jar'),
    attempt_materialization_ref: ref('RECOVERY_ATTEMPT_MATERIALIZATION', 'fixture/materialization.json'),
    attempt_root: '.', requested_loopback_port: 19090,
    parent_challenge_ref: ref('RECOVERY_PARENT_CHALLENGE', 'control/parent-challenge.bin', 32, digest('challenge')),
    parent_challenge_sha256: digest('challenge'), boot_nonce: 'a'.repeat(32),
    fault: { stage: forced ? 'FORCED_RESTART' : 'PRE_COMMIT', variant: forced ? 'KILL_AFTER_REVISION_INSERT' : 'RULE_IDENTITY', requires_forced_termination: forced },
    reachpoint: forced ? 'AFTER_REVISION_INSERT_BEFORE_PARENT' : 'NONE', termination_policy: forced ? 'FORCED' : 'NORMAL',
    command_input: forced ? { command_scenario_id: 'RECOVERY-COMMAND-PROCEDURAL-001', expected_request_digest: digest('request'), request_body_ref: ref('RECOVERY_API_REQUEST_BODY', 'observations/api-request-body.json') } : null
  };
  value.launch_request_payload_sha256 = sha256Jcs(value);
  return value;
}
function launchProofs() { return [childReady(), reachpointProof(), parentObserved(), terminationProof()]; }
function proofBase(schemaId, sequence) {
  return {
    schema_id: schemaId, schema_version: '0.1', protocol_version: '0.1', case_id: 'RCV-CANVAS-016.KILL_AFTER_REVISION_INSERT', attempt_ordinal: 1,
    sequence, pid: 12345, boot_nonce: 'a'.repeat(32), parent_challenge_sha256: digest('challenge'), runtime_jar_sha256: digest('runtime'), launcher_jar_sha256: digest('launcher'),
    launch_request_ref: ref('RECOVERY_LAUNCH_REQUEST', 'control/launch-request.json')
  };
}
function withPayloadDigest(value) { value.payload_sha256 = sha256Jcs(value); return value; }
function childReady() {
  return withPayloadDigest({
    ...proofBase('OPM-DEV-CANVAS-06-RECOVERY-CHILD-READY-001', 0), actual_loopback_port: 19090,
    storage_root_identity_sha256: digest('storage'), active_binding_digest: digest('binding'), challenge_loaded: true
  });
}
function reachpointProof() {
  return withPayloadDigest({
    ...proofBase('OPM-DEV-CANVAS-06-RECOVERY-REACHPOINT-001', 1),
    child_ready_ref: ref('RECOVERY_CHILD_READY', 'control/child-ready.json'), reachpoint: 'AFTER_REVISION_INSERT_BEFORE_PARENT', transaction_phase: 'IN_TRANSACTION',
    revision_inserted: true, head_updated: false, operation_inserted: false, receipt_inserted: false, connection_commit_returned: false, http_response_bytes_written: 0,
    sqlite_file_set_ref: ref('RECOVERY_SQLITE_FILE_SET', 'observations/at-fault/sqlite-file-set.json')
  });
}
function parentObserved() {
  return withPayloadDigest({
    ...proofBase('OPM-DEV-CANVAS-06-RECOVERY-PARENT-OBSERVED-001', 2),
    child_ready_ref: ref('RECOVERY_CHILD_READY', 'control/child-ready.json'), reachpoint_ref: ref('RECOVERY_REACHPOINT', 'control/reachpoint.json'),
    pid_alive: true, identity_matched: true, challenge_matched: true, proof_payloads_matched: true, observed_at_monotonic_ns: 1000
  });
}
function terminationProof(primitive = 'SIGKILL') {
  const posix = primitive === 'SIGKILL';
  return withPayloadDigest({
    ...proofBase('OPM-DEV-CANVAS-06-RECOVERY-TERMINATION-001', 3),
    parent_observed_ref: ref('RECOVERY_PARENT_OBSERVED', 'control/parent-observed.json'), requested_primitive: primitive,
    observed_exit_kind: posix ? 'SIGNAL' : 'TERMINATED_PROCESS', observed_signal: posix ? 'SIGKILL' : null, observed_exit_code: posix ? null : 137,
    started_at_monotonic_ns: 1100, ended_at_monotonic_ns: 1200, child_alive_after: false, owned_residual_process_count: 0
  });
}
function assertLaunchRequestDigest(value) {
  const preimage = structuredClone(value); delete preimage.launch_request_payload_sha256;
  assert.equal(value.launch_request_payload_sha256, sha256Jcs(preimage));
}
function assertPayloadDigest(value) {
  const preimage = structuredClone(value); delete preimage.payload_sha256;
  assert.equal(value.payload_sha256, sha256Jcs(preimage));
}
function assertReopenCatalog(catalog) {
  assert.equal(catalog.profiles.length, 3);
  assert.equal(catalog.cases.length, 28);
  const withoutPayload = structuredClone(catalog); delete withoutPayload.catalog_payload_sha256;
  assert.equal(catalog.catalog_payload_sha256, sha256Jcs(withoutPayload));
  const profiles = new Map(catalog.profiles.map(profile => [profile.profile_id, profile]));
  for (const profile of catalog.profiles) assert.equal(profile.expected_reopen_sha256, sha256Jcs(profile.expected_reopen));
  for (const mapping of catalog.cases) assert.equal(mapping.expected_reopen_sha256, profiles.get(mapping.expected_reopen_profile_id)?.expected_reopen_sha256);
}
function assertManifestReopenJoin(value, catalog) {
  assertReopenCatalog(catalog);
  assert.equal(value.reopen_expectation_catalog_payload_sha256, catalog.catalog_payload_sha256);
  assert.deepEqual(value.case_catalog.map(item => item.case_id), catalog.cases.map(item => item.case_id));
  const profiles = new Map(catalog.profiles.map(profile => [profile.profile_id, profile]));
  value.case_catalog.forEach((item, index) => {
    const mapping = catalog.cases[index];
    const profile = profiles.get(mapping.expected_reopen_profile_id);
    assert.deepEqual(item.expected_reopen, profile.expected_reopen);
    assert.equal(item.expected_reopen_sha256, mapping.expected_reopen_sha256);
    assert.equal(item.expected_reopen_sha256, sha256Jcs(item.expected_reopen));
  });
}
function requestIngress() {
  return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-INGRESS-001', schema_version: '0.1', case_id: 'RCV-CANVAS-018.KILL_AFTER_COMMIT', attempt_ordinal: 1, command_scenario_id: 'RECOVERY-COMMAND-PROCEDURAL-001', request_id: 'request.recovery.procedural.001', command_id: 'command.recovery.procedural.001', expected_request_digest: digest('request'), request_body_ref: ref('RECOVERY_API_REQUEST_BODY'), method: 'POST', route_template: '/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands', content_type: 'application/json', raw_byte_length: 1024, raw_body_sha256: digest('request'), canonical_body_sha256: digest('request'), validation_status: 'MATCHED', strict_utf8: true, bom_absent: true, duplicate_keys_absent: true, single_json_object: true, raw_equals_canonical: true, digest_matches_template: true, dispatch_authorized: true, ingress_payload_sha256: digest('ingress') };
}
function requestParsed() {
  return { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-PARSED-001', schema_version: '0.1', case_id: 'RCV-CANVAS-018.KILL_AFTER_COMMIT', attempt_ordinal: 1, command_scenario_id: 'RECOVERY-COMMAND-PROCEDURAL-001', request_id: 'request.recovery.procedural.001', command_id: 'command.recovery.procedural.001', ingress_ref: ref('RECOVERY_API_REQUEST_INGRESS'), expected_request_digest: digest('request'), parsed_body_sha256: digest('request'), validation_status: 'MATCHED', parsed_equals_raw: true, controller_authorized: true, parsed_payload_sha256: digest('parsed') };
}
function requestObservation(status = 'MATCHED') {
  const value = { schema_id: 'OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-OBSERVATION-001', schema_version: '0.1', case_id: 'RCV-CANVAS-018.KILL_AFTER_COMMIT', attempt_ordinal: 1, request_body_ref: ref('RECOVERY_API_REQUEST_BODY'), ingress_ref: ref('RECOVERY_API_REQUEST_INGRESS'), validation_status: status, http_status: status === 'MATCHED' ? 200 : 422, controller_invocation_count: status === 'MATCHED' ? 1 : 0, service_invocation_count: status === 'MATCHED' ? 1 : 0, repository_commit_call_count: status === 'MATCHED' ? 1 : 0, observation_payload_sha256: digest('observation') };
  if (status === 'MATCHED') value.parsed_ref = ref('RECOVERY_API_REQUEST_PARSED');
  return value;
}
function binding() { return { profile: asset('profile'), rule_set: asset('rules'), text_grammar: asset('grammar'), symbol_catalog: asset('symbols'), normalization_adapter: asset('normalization'), binding_digest: digest('binding') }; }
function asset(id) { return { id, version: '0.1.0', sha256: digest(id) }; }
function tableCounts() { return { schema_metadata: 1, flyway_schema_history: 1, project_metadata: 1, profile_package: 1, rule_set_package: 1, grammar_package: 1, model_catalog: 1, revision_document: 1, model_head: 1, revision_parent: 0, named_snapshot: 0, baseline: 0, operation_record: 0, idempotency_record: 0, background_task: 0, asset_manifest: 0, element_index: 0, fact_endpoint_index: 0, occurrence_index: 0, finding_index: 0, text_trace_index: 0 }; }
function baseCounts() { return { fixture_count: 2, case_count: 28, pre_commit_case_count: 8, sqlite_case_count: 7, forced_restart_case_count: 4, service_recovery_case_count: 3, rollback_case_count: 6, required_attempt_count: 56 }; }
function transaction() { return { revision_delta: 0, revision_parent_delta: 0, text_artifact_delta: 0, text_trace_delta: 0, finding_delta: 0, operation_delta: 0, receipt_delta: 0, draft_head_changed: false }; }
function category(index) { return index < 8 ? 'PRE_COMMIT' : index < 15 ? 'SQLITE' : index < 19 ? 'FORCED_RESTART' : index < 22 ? 'SERVICE_RECOVERY' : 'ROLLBACK'; }
function capabilityIds() { return [...Array.from({ length: 16 }, (_, index) => `CAP-ISO-PROC-${String(index + 1).padStart(3, '0')}`), ...Array.from({ length: 8 }, (_, index) => `CAP-ISO-CTRL-${String(index + 1).padStart(3, '0')}`), ...Array.from({ length: 10 }, (_, index) => `CAP-ISO-STRUCT-${String(index + 1).padStart(3, '0')}`)]; }
function upstreamBuild() { return { source_commit: 'a'.repeat(40), dirty_before_build: false, evidence_output_root: 'reports', java_version: '21.0.7', node_version: 'v22.0.0', os: 'darwin-arm64', build_command: 'npm run release:build', lockfile_sha256: digest('upstream-lock'), pom_sha256: digest('upstream-pom') }; }
function sourceBuild() { return { source_commit: 'a'.repeat(40), dirty_before_build: false, build_command: 'npm run build', node_version: '22.0.0', lockfile_sha256: digest('lock'), web_dist: ref('WEB_DIST'), local_runtime_jar: ref('LOCAL_RUNTIME_JAR') }; }
function modelResultDigests() { return { semantic_projection_sha256: digest('semantic-projection'), projection_sha256: digest('projection'), opl_sha256: digest('opl'), trace_sha256: digest('trace'), finding_sha256: digest('finding'), transaction_sha256: digest('transaction'), normalized_outcome_sha256: digest('normalized-outcome') }; }
function gateResultDigests() { return { capability_order_sha256: digest('capability-order'), eligible_capability_ids_sha256: digest('eligible-capability-ids'), reverse_control_dependencies_sha256: digest('reverse-control-dependencies'), rollback_structural_sha256: digest('rollback-structural'), rollback_control_sha256: digest('rollback-control'), rollback_procedural_cascade_sha256: digest('rollback-procedural-cascade'), rollback_all_sha256: digest('rollback-all') }; }
function identity() { return { runner_version: '0.1.0', source_commit: 'b'.repeat(40), node_version: '22.0.0', os: 'darwin', command: 'release:canvas06:recovery', runner_source_sha256: digest('runner') }; }
function ref(kind, path = `recovery/${kind.toLowerCase()}.json`, byteLength = 1, sha256 = digest(kind)) { return { kind, path, byte_length: byteLength, sha256 }; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function stamp() { return '2026-08-02T00:00:00.000Z'; }
