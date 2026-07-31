import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve('.');
const options = parseOptions(process.argv.slice(2));
const handoffRoot = resolveRequired(options, 'handoff-root');
const handoffPath = resolveInside(handoffRoot, required(options, 'handoff'));
const suppliedDigest = required(options, 'handoff-sha256');
const output = resolveRequired(options, 'out');
const handoffBytes = await readFile(handoffPath);
const handoffDigest = sha(handoffBytes);
const handoffRef = await ref(handoffPath, handoffRoot, 'HANDOFF');
const handoff = JSON.parse(handoffBytes.toString('utf8'));
const handoffSchema = await json(resolve('docs/contracts/schemas/opm-dev-canvas-05-handoff.schema.json'));
const reportSchema = await json(resolve('docs/contracts/schemas/opm-dev-canvas-06-intake-report.schema.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } });
const validateHandoff = ajv.compile(handoffSchema);
const checks = [];
const blockers = [];

const handoffSchemaMatched = validateHandoff(handoff) && handoff.handoff_status === 'READY_FOR_DEV_CANVAS_06' && handoff.blockers.length === 0;
addCheck('INTAKE-06-001.HANDOFF_BYTES', suppliedDigest === handoffDigest, [handoffRef], 'CANVAS06_HANDOFF_DIGEST_MISMATCH', `sha256=${handoffDigest}`);
addCheck('INTAKE-06-002.HANDOFF_SCHEMA_STATUS', handoffSchemaMatched, [handoffRef], 'CANVAS06_HANDOFF_NOT_READY', `schema=${validateHandoff.errors ? 'invalid' : 'valid'}, status=${handoff.handoff_status}`);

const buildArtifactRefs = Array.isArray(handoff.build_artifacts) ? handoff.build_artifacts : [];
const buildArtifactsMatched = handoff.source_build?.dirty_before_build === false && hasArtifactPair(buildArtifactRefs) && await refsMatch(buildArtifactRefs, handoffRoot);
addCheck('INTAKE-06-003.SOURCE_BUILD_ARTIFACTS', buildArtifactsMatched, buildArtifactRefs.length ? buildArtifactRefs : [handoffRef], 'CANVAS06_BUILD_EVIDENCE_MISMATCH', `artifacts=${buildArtifactRefs.length}, dirty_before_build=${handoff.source_build?.dirty_before_build}`);

const bindingRefs = [...(handoff.revision_contract?.schemas ?? [])];
const bindingsMatched = revisionBindingsMatch(handoff) && await refsMatch(bindingRefs, handoffRoot);
addCheck('INTAKE-06-004.REVISION_BINDINGS', bindingsMatched, bindingRefs.length ? bindingRefs : [handoffRef], 'CANVAS06_BINDING_MISMATCH', `reader_versions=${JSON.stringify(handoff.revision_contract?.reader_versions ?? [])}`);

const gateRefs = Array.isArray(handoff.gate_evidence) ? handoff.gate_evidence.map(item => item.evidence).filter(Boolean) : [];
const gatesMatched = await gateEvidenceMatches(handoff, handoffRoot, ajv);
addCheck('INTAKE-06-005.GATE_EVIDENCE', gatesMatched, gateRefs.length ? gateRefs : [handoffRef], 'CANVAS06_UPSTREAM_GATE_BLOCKED', `gate_count=${handoff.gate_evidence?.length ?? 0}`);

const coverageRefs = [...(handoff.coverage_summary?.evidence ?? []), handoff.compatibility_summary?.evidence].filter(Boolean);
const coverageMatched = coverageCompatibilityMatches(handoff) && await refsMatch(coverageRefs, handoffRoot);
addCheck('INTAKE-06-006.COVERAGE_COMPATIBILITY', coverageMatched, coverageRefs.length ? coverageRefs : [handoffRef], 'CANVAS06_UPSTREAM_COVERAGE_MISMATCH', `semantic=${JSON.stringify(handoff.coverage_summary?.semantic ?? {})}`);

const capabilityEvidence = Array.isArray(handoff.capability_evidence) ? handoff.capability_evidence : [];
const capabilities = capabilityEvidence.map(projectCapability);
const capabilitiesMatched = capabilitySetMatches(handoff, capabilities);
addCheck('INTAKE-06-007.CAPABILITY_ELIGIBILITY', capabilitiesMatched, [handoffRef], 'CANVAS06_CAPABILITY_INTAKE_BLOCKED', `capability_count=${capabilities.length}`);

const productionGateMatched = handoff.production_gate?.state === 'DISABLED' && Array.isArray(handoff.production_gate.enabled_capability_ids) && handoff.production_gate.enabled_capability_ids.length === 0;
addCheck('INTAKE-06-008.PRODUCTION_GATE_DISABLED', productionGateMatched, [handoffRef], 'CANVAS06_UPSTREAM_GATE_ALREADY_ENABLED', `state=${handoff.production_gate?.state}`);

const intakeStatus = checks.every(item => item.status === 'MATCHED') && capabilities.length === 34 && capabilities.every(item => item.intake_status === 'MATCHED') && blockers.length === 0
  ? 'READY_FOR_RELEASE_VALIDATION' : 'BLOCKED';
const report = {
  schema_id: 'OPM-DEV-CANVAS-06-INTAKE-REPORT-001',
  schema_version: '0.1',
  report_id: `dev-canvas-06.intake.${handoff.handoff_id ?? 'invalid'}.${handoffDigest.slice(0, 12)}`,
  generated_at: new Date().toISOString(),
  runner_identity: {
    runner_version: '0.1.0',
    source_commit: command(['rev-parse', 'HEAD']).trim(),
    node_version: process.version,
    os: `${process.platform}-${process.arch}`,
    command: 'npm run release:canvas06:intake -- --handoff-root <handoff-bundle-root> --handoff <relative-handoff-path> --handoff-sha256 <sha256> --out <report-path>',
    runner_source_sha256: await shaFile(resolve('scripts/release-canvas06-intake.mjs'))
  },
  handoff_ref: handoffRef,
  intake_status: intakeStatus,
  checks,
  capability_intake: capabilities,
  blockers
};
const validateReport = ajv.compile(reportSchema);
if (!validateReport(report)) throw new Error(`DEV-CANVAS-06 intake report schema validation failed: ${JSON.stringify(validateReport.errors)}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`DEV-CANVAS-06 intake ${intakeStatus}: ${relative(root, output)} sha256=${await shaFile(output)}`);
process.exitCode = intakeStatus === 'READY_FOR_RELEASE_VALIDATION' ? 0 : 3;

function addCheck(checkId, matched, evidenceRefs, code, observedSummary) {
  const blockerCodes = matched ? [] : [code];
  checks.push({ check_id: checkId, status: matched ? 'MATCHED' : 'BLOCKED', evidence_refs: evidenceRefs, observed_summary: observedSummary, blocker_codes: blockerCodes });
  if (!matched) blockers.push({ code, check_id: checkId, evidence_refs: evidenceRefs, message_key: code });
}
function projectCapability(item) {
  const family = { PROC: 'PROCEDURAL', CTRL: 'CONTROL', STRUCT: 'STRUCTURAL' }[item.family];
  const valid = family !== undefined && item.eligibility === 'ELIGIBLE_FOR_RELEASE_VALIDATION'
    && Array.isArray(item.coverage_keys) && item.coverage_keys.length > 0 && item.template_ref && item.rule_ref && item.symbol_ref
    && item.grammar && item.binding_digest;
  return {
    capability_id: item.capability_id,
    family: family ?? 'PROCEDURAL',
    upstream_eligibility: item.eligibility,
    coverage_keys: item.coverage_keys ?? [],
    template_refs: item.template_ref ? [item.template_ref] : [],
    rule_refs: item.rule_ref ? [item.rule_ref] : [],
    symbol_refs: item.symbol_ref ? [item.symbol_ref] : [],
    grammar_refs: item.grammar ? [item.grammar] : [],
    binding_digest: item.binding_digest ?? '0'.repeat(64),
    upstream_evidence_fingerprint: sha(Buffer.from(jcs(item), 'utf8')),
    intake_status: valid ? 'MATCHED' : 'BLOCKED',
    blocker_codes: valid ? [] : ['CANVAS06_UPSTREAM_CAPABILITY_BLOCKED']
  };
}
function capabilitySetMatches(handoff, capabilities) {
  const expected = [
    ...Array.from({ length: 16 }, (_, index) => `CAP-ISO-PROC-${String(index + 1).padStart(3, '0')}`),
    ...Array.from({ length: 8 }, (_, index) => `CAP-ISO-CTRL-${String(index + 1).padStart(3, '0')}`),
    ...Array.from({ length: 10 }, (_, index) => `CAP-ISO-STRUCT-${String(index + 1).padStart(3, '0')}`)
  ];
  return capabilities.length === expected.length && capabilities.every((item, index) => item.capability_id === expected[index] && item.intake_status === 'MATCHED' && item.binding_digest === handoff.active_binding?.binding_digest);
}
function revisionBindingsMatch(handoff) {
  const revision = handoff.revision_contract;
  const active = handoff.active_binding;
  const historical = handoff.historical_binding;
  return Array.isArray(revision?.reader_versions) && revision.reader_versions.join(',') === '0.1,0.2'
    && revision.active_writer_version === '0.2' && revision.schemas?.length === 2
    && active?.profile?.version === '0.2.0' && historical?.profile?.version === '0.1.0'
    && ['profile', 'rule_set', 'text_grammar', 'symbol_catalog', 'normalization_adapter'].every(key => active?.[key]?.id && active?.[key]?.version && active?.[key]?.sha256 && historical?.[key]?.id && historical?.[key]?.version && historical?.[key]?.sha256)
    && /^[a-f0-9]{64}$/.test(active?.binding_digest ?? '') && /^[a-f0-9]{64}$/.test(historical?.binding_digest ?? '');
}
function coverageCompatibilityMatches(handoff) {
  const coverage = handoff.coverage_summary;
  const compatibility = handoff.compatibility_summary;
  return coverage?.semantic?.expected === 178 && coverage.semantic.pass === 130 && coverage.semantic.blocked === 48
    && coverage.atomic?.expected === 19 && coverage.atomic.matched === 19
    && coverage.structural?.expected === 24 && coverage.structural.matched === 24
    && coverage.control?.expected === 20 && coverage.control.matched === 20 && coverage.failed === 0
    && compatibility?.case_count === 13 && compatibility.pass_count === 6 && compatibility.blocked_count === 7 && compatibility.failed_count === 0;
}
async function gateEvidenceMatches(handoff, rootPath, validator) {
  const expected = new Map([
    ['GATE-05-01', 'docs/contracts/schemas/opm-dev-canvas-05-gate-evidence-report.schema.json'],
    ['GATE-05-02', 'docs/contracts/schemas/opm-opl-golden-replay-report.schema.json'],
    ['GATE-05-03', 'docs/contracts/schemas/opm-opl-golden-coverage-report.schema.json'],
    ['GATE-05-04', 'docs/contracts/schemas/opm-dev-canvas-05-gate-evidence-report.schema.json'],
    ['GATE-05-05', 'docs/contracts/schemas/opm-opl-golden-replay-report.schema.json'],
    ['GATE-05-06', 'docs/contracts/schemas/opm-revision-compatibility-report.schema.json']
  ]);
  if (!Array.isArray(handoff.gate_evidence) || handoff.gate_evidence.length !== expected.size) return false;
  const validators = new Map();
  for (const [gateId, schemaPath] of expected) {
    const gate = handoff.gate_evidence.find(item => item.gate_id === gateId);
    if (!gate || gate.status !== 'MATCHED' || !await refMatches(gate.evidence, rootPath)) return false;
    const value = await json(resolveInside(rootPath, gate.evidence.path));
    if (!validators.has(schemaPath)) validators.set(schemaPath, validator.compile(await json(resolve(schemaPath))));
    const validate = validators.get(schemaPath);
    if (!validate(value)) return false;
  }
  return true;
}
async function refsMatch(refs, rootPath) {
  return (await Promise.all(refs.map(item => refMatches(item, rootPath)))).every(Boolean);
}
async function refMatches(item, rootPath) {
  try {
    const path = resolveInside(rootPath, item.path);
    const info = await stat(path);
    return info.size === item.byte_length && await shaFile(path) === item.sha256;
  } catch { return false; }
}
function hasArtifactPair(items) {
  return items.length === 2 && new Set(items.map(item => item.kind)).size === 2
    && items.some(item => item.kind === 'LOCAL_RUNTIME_JAR') && items.some(item => item.kind === 'EVIDENCE_BUNDLE');
}
function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS does not permit non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  throw new Error('JCS does not permit undefined values.');
}
function parseOptions(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined || result.has(flag.slice(2))) throw new Error('Usage: release:canvas06:intake --handoff-root <root> --handoff <relative-path> --handoff-sha256 <sha256> --out <report-path>');
    result.set(flag.slice(2), value);
  }
  return result;
}
function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}
function resolveRequired(values, key) { return resolve(required(values, key)); }
function resolveInside(parent, path) {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error(`Path must remain inside its root: ${path}`);
  const resolved = resolve(parent, path);
  if (!resolved.startsWith(`${parent}/`)) throw new Error(`Path escapes its root: ${path}`);
  return resolved;
}
function command(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function ref(path, base, kind) { const info = await stat(path); return { kind, path: relative(base, path), byte_length: info.size, sha256: await shaFile(path) }; }
async function shaFile(path) { return sha(await readFile(path)); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
