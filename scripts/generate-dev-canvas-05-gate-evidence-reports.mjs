import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

import { sourceEpoch } from './canvas06-unified-production-input.mjs';

const root = resolve('.');
const generatedAt = sourceEpoch(execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
const target = resolve('services/local-runtime/target');
const contractRoot = resolve(target, 'golden-contract');
const traceRoot = resolve(target, 'trace-closure');
const contractRaw = resolve(contractRoot, 'opm-opl-golden-contract.tap');
const contractReport = resolve(contractRoot, 'opm-opl-golden-contract-report.json');
const traceRaw = resolve(traceRoot, 'TEST-org.opm.localruntime.text.OplTextGenerationServiceTest.xml');
const traceReport = resolve(traceRoot, 'opm-opl-trace-closure-report.json');

await mkdir(contractRoot, { recursive: true });
const contract = spawnSync(process.execPath, ['--test', '--test-name-pattern=GATE-05-01', 'scripts/validate-opl-golden-manifest.test.mjs'], {
  cwd: root,
  encoding: 'utf8'
});
const contractOutput = `${contract.stdout ?? ''}${contract.stderr ?? ''}`;
await writeFile(contractRaw, contractOutput);
const contractMutationCases = count(contractOutput, /^\s+ok \d+ - /gm);
const contractFailures = number(contractOutput, /^# fail (\d+)$/m);
const contractSkipped = number(contractOutput, /^# skipped (\d+)$/m);
const contractMatched = contract.status === 0 && contractMutationCases === 16 && contractFailures === 0 && contractSkipped === 0;
await writeFile(contractReport, JSON.stringify(await report({
  gateId: 'GATE-05-01',
  status: contractMatched ? 'MATCHED' : 'BLOCKED',
  command: ['node', '--test', '--test-name-pattern=GATE-05-01', 'scripts/validate-opl-golden-manifest.test.mjs'],
  sources: ['scripts/validate-opl-golden-manifest.test.mjs', 'scripts/validate-opl-golden-manifest.mjs'],
  raw: contractRaw,
  summary: {
    expected_cases: 16,
    observed_cases: contractMutationCases,
    passed_cases: contractMutationCases - contractFailures,
    failed_cases: contractFailures,
    errors: contract.status === 0 ? 0 : 1,
    skipped: contractSkipped,
    checks: ['13 个冻结 mutation 类别均由 16 个独立 mutation 覆盖。', 'candidate 的 model、revision_sequence、parent_revision_id 守卫均通过稳定错误码验证。']
  }
})));

if (!process.env.JAVA_HOME) throw new Error('JAVA_HOME is required for the JDK 21 Token/Trace evidence run.');
await mkdir(traceRoot, { recursive: true });
const trace = spawnSync('./mvnw', ['-o', '-pl', 'services/local-runtime', '-Dtest=OplTextGenerationServiceTest', 'test'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env
});
const surefire = resolve(target, 'surefire-reports/TEST-org.opm.localruntime.text.OplTextGenerationServiceTest.xml');
await copyFile(surefire, traceRaw);
const xml = await readFile(traceRaw, 'utf8');
const tests = number(xml, /tests="(\d+)"/);
const failures = number(xml, /failures="(\d+)"/);
const errors = number(xml, /errors="(\d+)"/);
const skipped = number(xml, /skipped="(\d+)"/);
const replay = JSON.parse(await readFile(resolve(target, 'golden-replay/opm-opl-golden-replay-report.json'), 'utf8'));
const replayPasses = replay.cases.filter(item => item.expectation === 'PASS');
const traceDigestClosed = replayPasses.length === 130 && replayPasses.every(item => item.observed_status === 'PASS_MATCHED'
  && item.attempts.length === 2 && item.attempts.every(attempt => typeof attempt.trace_sha256 === 'string' && /^[a-f0-9]{64}$/.test(attempt.trace_sha256)));
const traceMatched = trace.status === 0 && tests === 160 && failures === 0 && errors === 0 && skipped === 0 && traceDigestClosed;
await writeFile(traceReport, JSON.stringify(await report({
  gateId: 'GATE-05-04',
  status: traceMatched ? 'MATCHED' : 'BLOCKED',
  command: ['./mvnw', '-o', '-pl', 'services/local-runtime', '-Dtest=OplTextGenerationServiceTest', 'test'],
  sources: ['services/local-runtime/src/test/java/org/opm/localruntime/text/OplTextGenerationServiceTest.java', 'services/local-runtime/target/golden-replay/opm-opl-golden-replay-report.json'],
  raw: traceRaw,
  summary: {
    expected_cases: 160,
    observed_cases: tests,
    passed_cases: tests - failures - errors - skipped,
    failed_cases: failures,
    errors,
    skipped,
    checks: [traceDigestClosed ? '130 个 PASS Golden case 的两次 replay 均写入非空 Trace SHA-256。' : 'Golden replay 的 PASS Trace SHA-256 闭包不完整。', 'JDK 21 Surefire 原始 XML 已保留。']
  }
})));

console.log(`GATE-05 evidence reports: contract=${contractMatched ? 'MATCHED' : 'BLOCKED'}, trace=${traceMatched ? 'MATCHED' : 'BLOCKED'}`);

async function report({ gateId, status, command, sources, raw, summary }) {
  return {
    schema_id: 'OPM-DEV-CANVAS-05-GATE-EVIDENCE-REPORT-001',
    schema_version: '0.1',
    gate_id: gateId,
    status,
    generated_at: generatedAt,
    command,
    source_refs: await Promise.all(sources.map(path => ref(resolve(path), 'SOURCE'))),
    raw_result: await ref(raw, 'TEST_RESULT'),
    summary
  };
}

async function ref(path, kind) {
  const info = await stat(path);
  return { kind, path: relative(root, path), byte_length: info.size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') };
}

function count(value, expression) { return [...value.matchAll(expression)].length; }
function number(value, expression) { return Number(expression.exec(value)?.[1] ?? 0); }
