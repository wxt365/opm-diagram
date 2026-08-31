import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { main } from './release-canvas06-e2e-manifest-v02.mjs';
import { main as verify } from './verify-canvas06-e2e-manifest-v02.mjs';
import { jcs, listTree, sha256 } from './canvas06-e2e-manifest-v01-support.mjs';

const repository = resolve('.');
const profileRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');
const handoffRoot = resolve(profileRoot, 'handoff');
const releaseRoot = resolve(handoffRoot, 'releases/clean-b940ac9bb734');
const intakePath = 'releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json';
const javaHome = execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' }).trim();
const runtime = { jarPath: resolve(javaHome, 'bin/jar'), javaVersion: 'java 21 controlled test' };

test('controlled v0.2 builder creates deterministic 194-case root and verifier is read-only', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-v02-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await cleanSource(work);
  const bundle = await controlledBundle(work);
  const common = await commonRoot(work);
  const commit = git(source, ['rev-parse', 'HEAD']);
  const manifestId = `dev-canvas-06.e2e.${commit.slice(0, 12)}.${bundle.intake.sha256.slice(0, 12)}`;
  const out = `dev-canvas-06/e2e/manifests/${manifestId}/dev-canvas-06-e2e-manifest.json`;
  const output = resolve(work, 'output');
  await mkdir(output);
  const args = producerArgs({ source, bundle: bundle.root, common, output, out, staging: resolve(work, 'profile-staging') });
  const result = await main(args, { runtime });
  const manifest = JSON.parse(await readFile(result.path, 'utf8'));
  assert.equal(manifest.cases.length, 194);
  assert.deepEqual(manifest.summary, { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: 0, blocked_matched_count: 0, failed_count: 0, skipped_count: 0, retry_count: 0 });
  assert.equal(manifest.driver_catalog.at(-1).driver_id, 'DRIVER-COMMON');
  const root = dirname(result.path);
  const before = await digest(root);
  await verify(verifierArgs({ source, bundle: bundle.root, root }), { runtime });
  assert.equal(await digest(root), before);
  const output2 = resolve(work, 'output-two');
  await mkdir(output2);
  const second = await main(producerArgs({ source, bundle: bundle.root, common, output: output2, out, staging: resolve(work, 'profile-staging-two') }), { runtime });
  assert.equal(await digest(root), await digest(dirname(second.path)));
});

test('producer rejects an existing Profile staging target before final root creation', async t => {
  const work = await mkdtemp(resolve(tmpdir(), 'canvas06-e2e-v02-staging-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = await cleanSource(work);
  const bundle = await controlledBundle(work);
  const common = await commonRoot(work);
  const commit = git(source, ['rev-parse', 'HEAD']);
  const out = `dev-canvas-06/e2e/manifests/dev-canvas-06.e2e.${commit.slice(0, 12)}.${bundle.intake.sha256.slice(0, 12)}/dev-canvas-06-e2e-manifest.json`;
  const output = resolve(work, 'output');
  const staging = resolve(work, 'profile-staging');
  await Promise.all([mkdir(output), mkdir(staging)]);
  await assert.rejects(() => main(producerArgs({ source, bundle: bundle.root, common, output, out, staging }), { runtime }), error => error.code === 'E2E_MANIFEST_TRANSACTION_INVALID');
  await assert.rejects(() => readFile(resolve(output, out)), /ENOENT/);
});

function producerArgs({ source, bundle, common, output, out, staging }) { return ['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', bundle, '--source-root', source, '--source-date-epoch', '1782864000', '--common-fixture-root', common, '--profile-asset-root', staging, '--output-root', output, '--out', out]; }
function verifierArgs({ source, bundle, root }) { return ['--input-mode', 'CONTROLLED_TEST', '--controlled-bundle-root', bundle, '--source-root', source, '--manifest-root', root, '--manifest', 'dev-canvas-06-e2e-manifest.json', '--profile-asset-root', resolve(root, 'inputs/upstream/profile-assets')]; }

async function cleanSource(work) {
  const root = resolve(work, 'source');
  for (const path of ['apps/web/dist', 'services/local-runtime/target', 'tests/e2e/release/dev-canvas-06/drivers', 'packages/profiles/profile.iso19450.2024.draft/0.2.0', 'scripts', 'node_modules/@playwright/test', 'node_modules/playwright-core']) await mkdir(resolve(root, path), { recursive: true });
  await cp(resolve(repository, 'apps/web/dist'), resolve(root, 'apps/web/dist'), { recursive: true });
  await cp(resolve(repository, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar'), resolve(root, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar'));
  await cp(resolve(repository, 'tests/e2e/release/dev-canvas-06/drivers'), resolve(root, 'tests/e2e/release/dev-canvas-06/drivers'), { recursive: true });
  for (const path of ['profile.json', 'rules/representative-rule-set.json', 'grammar/representative-opl-grammar.json', 'symbols/representative-symbol-catalog.json', 'normalization/representative-normalization.json']) { const target = resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0', path); await mkdir(dirname(target), { recursive: true }); await cp(resolve(profileRoot, path), target); }
  await cp(resolve(repository, 'scripts/release-canvas06-e2e-manifest-v02.mjs'), resolve(root, 'scripts/release-canvas06-e2e-manifest-v02.mjs'));
  await writeFile(resolve(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
  await writeFile(resolve(root, 'node_modules/@playwright/test/package.json'), JSON.stringify({ version: '1.57.0' }));
  await writeFile(resolve(root, 'node_modules/playwright-core/browsers.json'), JSON.stringify({ browsers: [{ name: 'chromium', revision: '1200' }] }));
  git(root, ['init']); git(root, ['config', 'user.email', 'test@example.invalid']); git(root, ['config', 'user.name', 'Canvas06']); git(root, ['add', '.']); git(root, ['commit', '-m', 'clean source']);
  return root;
}

async function commonRoot(work) { const root = resolve(work, 'common'); execFileSync(process.execPath, [resolve(repository, 'scripts/build-canvas06-common-visual-fixtures.mjs'), '--handoff', resolve(handoffRoot, 'dev-canvas-05-handoff.json'), '--fixture-root', root, '--source-date-epoch', '1782864000'], { cwd: repository }); return root; }

async function controlledBundle(work) {
  const source = resolve(work, 'bundle-source');
  await mkdir(source);
  const archivePath = 'releases/clean-b940ac9bb734/dev-canvas-05-evidence-bundle.jar';
  await mkdir(dirname(resolve(source, archivePath)), { recursive: true });
  await cp(resolve(releaseRoot, 'dev-canvas-05-evidence-bundle.jar'), resolve(source, archivePath));
  const staging = resolve(work, 'archive-content');
  const catalogPath = 'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-e2e-family-fixture-identity-catalog.json';
  await mkdir(dirname(resolve(staging, catalogPath)), { recursive: true });
  await cp(resolve(profileRoot, 'golden/opm-e2e-family-fixture-identity-catalog.json'), resolve(staging, catalogPath));
  execFileSync(resolve(javaHome, 'bin/jar'), ['uf', resolve(source, archivePath), '-C', staging, catalogPath]);
  const handoff = JSON.parse(await readFile(resolve(handoffRoot, 'dev-canvas-05-handoff.json'), 'utf8'));
  const bytes = await readFile(resolve(source, archivePath));
  handoff.build_artifacts = handoff.build_artifacts.map(item => item.kind === 'EVIDENCE_BUNDLE' ? { ...item, byte_length: bytes.length, sha256: sha256(bytes) } : item);
  await writeFile(resolve(source, 'dev-canvas-05-handoff.json'), JSON.stringify(handoff));
  const handoffRef = await ref(source, 'dev-canvas-05-handoff.json', 'HANDOFF');
  const intake = JSON.parse(await readFile(resolve(handoffRoot, intakePath), 'utf8'));
  intake.handoff_ref = handoffRef;
  await mkdir(dirname(resolve(source, intakePath)), { recursive: true });
  await writeFile(resolve(source, intakePath), JSON.stringify(intake));
  const intakeRef = await ref(source, intakePath, 'INTAKE_REPORT');
  const archiveRef = await ref(source, archivePath, 'EVIDENCE_BUNDLE');
  const identity = sha256(Buffer.from(jcs({ bundle_class: 'CONTROLLED_TEST', handoff_ref: handoffRef, intake_report_ref: intakeRef, evidence_bundle_ref: archiveRef, approved_version_ref: null }), 'utf8'));
  const root = resolve(work, `canvas06-controlled-${identity}`);
  await cp(source, root, { recursive: true });
  await writeFile(resolve(root, 'controlled-bundle.json'), JSON.stringify({ schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: '0.1', bundle_class: 'CONTROLLED_TEST', bundle_id: `canvas06-controlled-${identity}`, bundle_identity_sha256: identity, handoff_ref: handoffRef, intake_report_ref: intakeRef, evidence_bundle_ref: archiveRef, approved_version_ref: null }));
  return { root, intake: intakeRef };
}
async function ref(root, path, kind) { const bytes = await readFile(resolve(root, path)); return { kind, path, byte_length: bytes.length, sha256: sha256(bytes) }; }
function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
async function digest(root) { return sha256(Buffer.from(jcs(await listTree(root)), 'utf8')); }
