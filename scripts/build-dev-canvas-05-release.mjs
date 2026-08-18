import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = resolve('.');
const profileRoot = resolve('packages/profiles/profile.iso19450.2024.draft');
const handoffRoot = resolve(profileRoot, '0.2.0/handoff');
const releaseRoot = resolve(process.argv[2] ?? `${handoffRoot}/release`);
const javaHome = process.env.JAVA_HOME;

if (!javaHome) throw new Error('JAVA_HOME is required for the JDK 21 release build.');
if (command(['status', '--porcelain']).trim()) {
  throw new Error('SOURCE_BUILD_DIRTY: run the release build from a clean committed checkout.');
}
if (!within(handoffRoot, releaseRoot)) {
  throw new Error('Release output must remain under the DEV-CANVAS-05 handoff root.');
}

const sourceCommit = command(['rev-parse', 'HEAD']).trim();
const commandText = 'npm run golden:coverage && npm run golden:replay && npm run compatibility:replay && npm run handoff:evidence && ./mvnw -o -pl services/local-runtime package -DskipTests';
run('npm', ['run', 'golden:coverage']);
run('npm', ['run', 'golden:replay']);
run('npm', ['run', 'compatibility:replay']);
run('npm', ['run', 'handoff:evidence']);
run('./mvnw', ['-o', '-pl', 'services/local-runtime', 'package', '-DskipTests']);

const jar = resolve('services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar');
await stat(jar);
try {
  await stat(releaseRoot);
  throw new Error(`Release output already exists: ${relative(root, releaseRoot)}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(releaseRoot, { recursive: true });
const runtimeJar = resolve(releaseRoot, 'local-runtime-0.1.0-SNAPSHOT.jar');
await cp(jar, runtimeJar);

const staging = resolve('services/local-runtime/target/dev-canvas-05-evidence-bundle');
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
for (const source of [
  'scripts/generate-dev-canvas-05-gate-evidence-reports.mjs',
  'scripts/generate-dev-canvas-05-handoff.mjs',
  'scripts/validate-dev-canvas-05-gate-evidence-report.mjs',
  'scripts/validate-dev-canvas-05-handoff.mjs',
  'scripts/validate-opl-golden-committed-revisions.mjs',
  'scripts/validate-opl-golden-manifest.mjs',
  'scripts/validate-opl-golden-replay-report.mjs',
  'scripts/validate-revision-compatibility-manifest.mjs',
  'scripts/validate-revision-compatibility-report.mjs',
  'docs/contracts/schemas',
  'packages/profiles/profile.iso19450.2024.draft/0.1.0',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/rules',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json',
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/reports',
  'services/local-runtime/src/main/java/org/opm/localruntime/golden',
  'services/local-runtime/src/main/java/org/opm/localruntime/compatibility'
]) {
  const from = resolve(source);
  const to = resolve(staging, source);
  await mkdir(resolve(to, '..'), { recursive: true });
  await cp(from, to, { recursive: true });
}
const evidenceBundle = resolve(releaseRoot, 'dev-canvas-05-evidence-bundle.jar');
run(resolve(javaHome, 'bin/jar'), ['--create', '--file', evidenceBundle, '-C', staging, '.']);

const sourceBuild = {
  source_commit: sourceCommit,
  dirty_before_build: false,
  evidence_output_root: 'reports',
  java_version: javaVersion(javaHome),
  node_version: process.version,
  os: `${process.platform}-${process.arch}`,
  build_command: commandText,
  lockfile_sha256: await shaFile(resolve('package-lock.json')),
  pom_sha256: await shaFile(resolve('services/local-runtime/pom.xml'))
};
const descriptor = {
  schema_id: 'OPM-DEV-CANVAS-05-RELEASE-BUILD-001',
  schema_version: '0.1',
  source_build: sourceBuild,
  build_artifacts: [
    await ref(runtimeJar, 'LOCAL_RUNTIME_JAR'),
    await ref(evidenceBundle, 'EVIDENCE_BUNDLE')
  ]
};
await writeFile(resolve(releaseRoot, 'dev-canvas-05-release-build.json'), JSON.stringify(descriptor));
console.log(`DEV-CANVAS-05 clean release build: ${relative(root, releaseRoot)}`);

function command(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); }
function run(file, args) {
  const result = spawnSync(file, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${file} failed with exit code ${result.status ?? 'unknown'}.`);
}
function javaVersion(home) {
  const result = spawnSync(resolve(home, 'bin/java'), ['-version'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('JAVA_HOME/bin/java is unavailable.');
  return (result.stderr || result.stdout).trim();
}
function within(parent, child) { return child === parent || child.startsWith(`${parent}/`); }
async function shaFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function ref(path, kind) {
  const info = await stat(path);
  return { kind, path: relative(handoffRoot, path), byte_length: info.size, sha256: await shaFile(path) };
}
