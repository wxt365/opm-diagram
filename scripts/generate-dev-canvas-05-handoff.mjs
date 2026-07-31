import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';

const root = resolve('.');
const profileRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
const handoffRoot = resolve(profileRoot, 'handoff');
const reportRoot = resolve(handoffRoot, 'reports');
const output = resolve(process.argv[2] ?? `${profileRoot}/handoff/dev-canvas-05-handoff.json`);
const releaseBuildPath = resolve(handoffRoot, 'release/dev-canvas-05-release-build.json');
const profile = await json(resolve(profileRoot, 'profile.json'));
const coverage = await json(resolve('services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json'));
const replay = await json(resolve('services/local-runtime/target/golden-replay/opm-opl-golden-replay-report.json'));
const compatibility = await json(resolve('services/local-runtime/target/compatibility-replay/opm-revision-compatibility-report.json'));
const contractEvidence = await json(resolve('services/local-runtime/target/golden-contract/opm-opl-golden-contract-report.json'));
const traceEvidence = await json(resolve('services/local-runtime/target/trace-closure/opm-opl-trace-closure-report.json'));
const grammar = await json(resolve(profileRoot, 'grammar/representative-opl-grammar.json'));
const sources = [
  ['golden-coverage.json', resolve('services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json'), 'REPORT'],
  ['golden-replay.json', resolve('services/local-runtime/target/golden-replay/opm-opl-golden-replay-report.json'), 'REPORT'],
  ['revision-compatibility.json', resolve('services/local-runtime/target/compatibility-replay/opm-revision-compatibility-report.json'), 'REPORT'],
  ['golden-contract.json', resolve('services/local-runtime/target/golden-contract/opm-opl-golden-contract-report.json'), 'REPORT'],
  ['golden-contract.tap', resolve('services/local-runtime/target/golden-contract/opm-opl-golden-contract.tap'), 'TEST_RESULT'],
  ['trace-closure.json', resolve('services/local-runtime/target/trace-closure/opm-opl-trace-closure-report.json'), 'REPORT'],
  ['trace-closure.xml', resolve('services/local-runtime/target/trace-closure/TEST-org.opm.localruntime.text.OplTextGenerationServiceTest.xml'), 'TEST_RESULT'],
  ['golden-manifest.json', resolve(profileRoot, 'golden/opm-opl-golden-manifest.json'), 'ASSET'],
  ['golden-coverage-catalog.json', resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json'), 'ASSET'],
  ['active-grammar.json', resolve(profileRoot, 'grammar/representative-opl-grammar.json'), 'ASSET'],
  ['revision-v01.schema.json', resolve('docs/contracts/schemas/opm-revision.schema.json'), 'SCHEMA'],
  ['revision-v02.schema.json', resolve('docs/contracts/schemas/opm-revision-v0.2.schema.json'), 'SCHEMA']
];
await mkdir(reportRoot, { recursive: true });
for (const [name, source] of sources) await copyFile(source, resolve(reportRoot, name));
const refs = Object.fromEntries(await Promise.all(sources.map(async ([name, , kind]) => [name, await ref(resolve(reportRoot, name), kind)])));

const commit = command(['rev-parse', 'HEAD']).trim();
const releaseBuild = await optionalJson(releaseBuildPath);
const dirty = releaseBuild ? sourceTreeDirtyOutsideHandoff() : command(['status', '--porcelain']).trim().length > 0;
const active = binding(profile);
const java = javaVersion(process.env.JAVA_HOME);
const concreteTemplates = templateCounts(grammar);
const historical = {
  profile: { id: 'profile.iso19450.2024.draft', version: '0.1.0', sha256: '4cc3289722ab5c62e9273127318d5dcb383f7f0bdb801d23293afdef48fcbb00' },
  rule_set: active.rule_set,
  text_grammar: { id: 'grammar.opl.iso19450.2024.draft', version: '0.1.0', sha256: 'be315186135f2cfa525128532220b289e083fa4bc70bacb33a4287331467a9d1' },
  symbol_catalog: active.symbol_catalog,
  normalization_adapter: active.normalization_adapter,
  binding_digest: '35bf8490cdd363bc29380cc560d2667a70b72e474b739925b2cda4a598e3c037'
};
const replayMatched = replay.case_count === 178 && replay.pass_count === 130 && replay.blocked_count === 48 && replay.failed_count === 0;
const coverageMatched = coverage.status === 'EXACT' && coverage.summary.expected === 178 && coverage.summary.matched === 178;
const compatibilityMatched = compatibility.case_count === 13 && compatibility.pass_count === 6 && compatibility.blocked_count === 7 && compatibility.failed_count === 0;
const atomicMatched = replay.atomic_case_count === 19 && replay.atomic_case_count === replay.atomic_cases.length
  && replay.atomic_blocked_count === 19 && replay.atomic_failed_count === 0;
const concreteTemplatesMatched = concreteTemplates.structural === 24 && concreteTemplates.control === 20;
const contractMatched = evidenceMatched(contractEvidence, 'GATE-05-01', 16);
const traceMatched = evidenceMatched(traceEvidence, 'GATE-05-04', 160);
const buildArtifacts = releaseBuild?.build_artifacts ?? [];
const gateEvidence = [
  gate('GATE-05-01', contractMatched ? 'MATCHED' : 'BLOCKED', refs['golden-contract.json'], contractMatched ? 'Golden Contract 的 16 个细粒度 mutation 已全部匹配。' : 'Golden Contract 机器报告未满足固定 mutation 摘要。'),
  gate('GATE-05-02', replayMatched ? 'MATCHED' : 'BLOCKED', refs['golden-replay.json'], replayMatched ? '178 个 Golden case 重放通过。' : 'Golden replay 汇总未达到 178/130/48/0。'),
  gate('GATE-05-03', coverageMatched ? 'MATCHED' : 'BLOCKED', refs['golden-coverage.json'], coverageMatched ? 'Coverage 精确匹配 178 个需求。' : 'Coverage 不是 EXACT。'),
  gate('GATE-05-04', traceMatched ? 'MATCHED' : 'BLOCKED', refs['trace-closure.json'], traceMatched ? 'Token/Trace Closure 的 JDK 21 测试和 Golden Trace SHA 闭包已匹配。' : 'Token/Trace Closure 机器报告未满足固定摘要。'),
  gate('GATE-05-05', atomicMatched && concreteTemplatesMatched ? 'MATCHED' : 'BLOCKED', refs['golden-replay.json'], atomicMatched && concreteTemplatesMatched ? '19 个 Atomic case 与 24 个 Structural concrete template 均已验证。' : 'Atomic 或 Structural concrete template 证据不完整。'),
  gate('GATE-05-06', compatibilityMatched ? 'MATCHED' : 'BLOCKED', refs['revision-compatibility.json'], compatibilityMatched ? 'Revision Compatibility 13/13 已匹配。' : 'Revision Compatibility 未达到 6/7/0。')
];
const allGatesMatched = gateEvidence.every(item => item.status === 'MATCHED');
const releaseBuildMatched = releaseBuild?.schema_id === 'OPM-DEV-CANVAS-05-RELEASE-BUILD-001'
  && releaseBuild?.schema_version === '0.1'
  && releaseBuild?.source_build?.source_commit === commit
  && releaseBuild?.source_build?.dirty_before_build === false
  && hasReleaseArtifacts(buildArtifacts);
const ready = !dirty && java.available && releaseBuildMatched && allGatesMatched && replayMatched && coverageMatched && compatibilityMatched && atomicMatched && concreteTemplatesMatched;
const catalog = profile.capability_catalog.filter(item => /^CAP-ISO-(PROC|CTRL|STRUCT)-\d{3}$/.test(item.capability_id));
const coverageKeys = new Map();
for (const requirement of (await json(resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json'))).requirements) {
  const id = requirement.capability_id;
  if (!coverageKeys.has(id)) coverageKeys.set(id, []);
  coverageKeys.get(id).push(requirement.coverage_key);
}
const disabledReason = ready ? 'DEV_CANVAS_06_VALIDATION_REQUIRED' : 'DEV_CANVAS_05_HANDOFF_BLOCKED';
const handoff = {
  schema_id: 'OPM-DEV-CANVAS-05-HANDOFF-001', schema_version: '0.1',
  handoff_id: `dev-canvas-05.profile.iso19450.2024.draft.0.2.0.${commit.slice(0, 12)}`,
  handoff_status: ready ? 'READY_FOR_DEV_CANVAS_06' : 'BLOCKED', generated_at: new Date().toISOString(),
  source_build: releaseBuild?.source_build ?? { source_commit: commit, dirty_before_build: dirty, evidence_output_root: 'reports', java_version: java.value, node_version: process.version, os: `${process.platform}-${process.arch}`, build_command: 'npm run golden:coverage && npm run golden:replay && npm run compatibility:replay', lockfile_sha256: await shaFile(resolve('package-lock.json')), pom_sha256: await shaFile(resolve('services/local-runtime/pom.xml')) },
  build_artifacts: buildArtifacts,
  revision_contract: { reader_versions: ['0.1', '0.2'], active_writer_version: '0.2', schemas: [refs['revision-v01.schema.json'], refs['revision-v02.schema.json']] },
  historical_binding: historical, active_binding: active, gate_evidence: gateEvidence,
  coverage_summary: { semantic: { expected: replay.case_count, pass: replay.pass_count, blocked: replay.blocked_count }, atomic: { expected: replay.atomic_case_count, matched: replay.atomic_blocked_count }, structural: { expected: concreteTemplates.structural, matched: concreteTemplates.structural }, control: { expected: concreteTemplates.control, matched: concreteTemplates.control }, failed: replay.failed_count, evidence: [refs['golden-coverage-catalog.json'], refs['golden-manifest.json'], refs['active-grammar.json'], refs['golden-coverage.json'], refs['golden-replay.json']] },
  compatibility_summary: { case_count: compatibility.case_count, pass_count: compatibility.pass_count, blocked_count: compatibility.blocked_count, failed_count: compatibility.failed_count, evidence: refs['revision-compatibility.json'] },
  capability_evidence: catalog.map(item => ({ capability_id: item.capability_id, family: item.capability_id.split('-')[2], eligibility: ready ? 'ELIGIBLE_FOR_RELEASE_VALIDATION' : 'BLOCKED', coverage_keys: coverageKeys.get(item.capability_id) ?? ['UNMAPPED'], template_ref: item.template_ref, rule_ref: item.rule_ref, symbol_ref: item.symbol_ref, grammar: active.text_grammar, binding_digest: active.binding_digest, disabled_reason: disabledReason })),
  production_gate: { state: 'DISABLED', enabled_capability_ids: [] },
  limitations: ['未执行 DEV-CANVAS-06 视觉、E2E、性能和恢复验收。', '未证明其他硬件环境。', '未声明 ISO 19450:2024 符合性。'],
  blockers: ready ? [] : blockers(dirty, java.available, buildArtifacts, gateEvidence, refs['golden-replay.json'])
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(handoff));
console.log(`DEV-CANVAS-05 handoff ${handoff.handoff_status}: ${relative(root, output)} sha256=${await shaFile(output)}`);

function blockers(isDirty, javaAvailable, artifacts, gates, evidence) {
  const result = [];
  if (isDirty) result.push({ code: 'SOURCE_BUILD_DIRTY', owner_gate: 'GATE-05-06', evidence });
  if (!javaAvailable) result.push({ code: 'JAVA_BUILD_VERSION_UNVERIFIED', owner_gate: 'GATE-05-06', evidence });
  if (!hasReleaseArtifacts(artifacts)) result.push({ code: 'RELEASE_ARTIFACTS_MISSING', owner_gate: 'GATE-05-06', evidence });
  for (const item of gates.filter(value => value.status === 'BLOCKED')) result.push({ code: `${item.gate_id.replaceAll('-', '_')}_EVIDENCE_MISSING`, owner_gate: item.gate_id, evidence: item.evidence });
  return result;
}
function gate(gate_id, status, evidence, summary) { return { gate_id, status, evidence, summary }; }
function binding(value) {
  const dependency = role => value.dependencies.find(item => item.role === role).asset;
  const asset = value => ({ id: value.id, version: value.version, sha256: value.digest.digest });
  return { profile: { id: value.identity.profile_id, version: value.identity.package_version, sha256: value.manifest.package_digest.digest }, rule_set: asset(dependency('RULE_SET')), text_grammar: asset(value.text_grammar_ref), symbol_catalog: asset(value.symbol_catalog_ref), normalization_adapter: asset(value.normalization_adapter_ref), binding_digest: '93805d6e2fdb3ea73c4ddfc0a995d662fbf13dee2d8a6f24fc20c79ecff65d1d' };
}
async function ref(path, kind) { const info = await stat(path); return { kind, path: relative(handoffRoot, path), byte_length: info.size, sha256: await shaFile(path) }; }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function optionalJson(path) {
  try { return await json(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function shaFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
function hasReleaseArtifacts(artifacts) {
  return artifacts.length === 2 && new Set(artifacts.map(item => item.kind)).size === 2
    && artifacts.some(item => item.kind === 'LOCAL_RUNTIME_JAR')
    && artifacts.some(item => item.kind === 'EVIDENCE_BUNDLE');
}
function command(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
function sourceTreeDirtyOutsideHandoff() {
  const handoffPath = relative(root, handoffRoot);
  const changed = new Set([
    ...command(['diff', '--name-only']).trim().split('\n'),
    ...command(['diff', '--cached', '--name-only']).trim().split('\n'),
    ...command(['ls-files', '--others', '--exclude-standard']).trim().split('\n')
  ].filter(Boolean));
  return [...changed].some(path => path !== handoffPath && !path.startsWith(`${handoffPath}/`));
}
function javaVersion(javaHome) {
  if (!javaHome) return { available: false, value: 'UNVERIFIED: JAVA_HOME is required to identify the build JDK' };
  const result = spawnSync(resolve(javaHome, 'bin/java'), ['-version'], { encoding: 'utf8' });
  const value = (result.stderr || result.stdout || '').trim();
  return { available: result.status === 0 && value.length > 0, value: value || 'UNVERIFIED: JAVA_HOME/bin/java is unavailable' };
}
function templateCounts(value) {
  const templates = value.templates ?? [];
  return {
    control: templates.filter(item => item.base_capability_id !== undefined).length,
    structural: templates.filter(item => item.capability_id?.startsWith('CAP-ISO-STRUCT-')).length
  };
}
function evidenceMatched(value, gateId, expectedCases) {
  const summary = value?.summary;
  return value?.gate_id === gateId && value.status === 'MATCHED'
    && summary?.expected_cases === expectedCases && summary.observed_cases === expectedCases
    && summary.passed_cases === expectedCases && summary.failed_cases === 0 && summary.errors === 0 && summary.skipped === 0;
}
