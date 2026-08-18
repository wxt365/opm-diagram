import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { RecoveryTemplateError, loadRecoveryTemplate } from './recovery-template-verifier.mjs';

const sourceRoot = resolve('tests/recovery/release/dev-canvas-06/templates/0.1.0');

test('loads both frozen Recovery templates from exact evidence-copy paths without mutating bytes', async t => {
  const root = await evidenceRoot(t);
  const model = await reference(root, 'RECOVERY-FIXTURE-MODEL');
  const gate = await reference(root, 'RECOVERY-FIXTURE-GATE');
  const modelBytes = await readFile(resolve(root, model.path));
  const gateBytes = await readFile(resolve(root, gate.path));

  const loadedModel = await loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: model, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' });
  const loadedGate = await loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: gate, expectedFixtureId: 'RECOVERY-FIXTURE-GATE' });

  assert.equal(loadedModel.fixture_digest, 'bff0fb2a1c602bf4a0c0ff118bb80c47eda83e48ed9e2e98912281283d21fbbd');
  assert.equal(loadedGate.fixture_digest, '454438e640b43dbb00c8376de9c648341b2423c21e7621e43ae432b74eea54fd');
  assert.equal(Object.isFrozen(loadedModel.template), true);
  assert.equal(Object.isFrozen(loadedGate.template.command_scenarios), true);
  assert.deepEqual(await readFile(resolve(root, model.path)), modelBytes);
  assert.deepEqual(await readFile(resolve(root, gate.path)), gateBytes);
});

test('rejects raw reference, payload, request digest, and fixed result digest mutations', async t => {
  const root = await evidenceRoot(t);
  const model = await reference(root, 'RECOVERY-FIXTURE-MODEL');
  const path = resolve(root, model.path);

  await rejects(() => loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: { ...model, sha256: '0'.repeat(64) }, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' }));

  const payloadMutation = JSON.parse(await readFile(path, 'utf8'));
  payloadMutation.project_identity.scope = 'MUTATED';
  await writeTemplate(path, payloadMutation);
  const payloadReference = await referenceForPath(root, model.path);
  await rejects(() => loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: payloadReference, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' }));

  await cp(sourceRoot, resolve(root, 'dev-canvas-06/recovery/fixtures/templates/0.1.0'), { recursive: true, force: true });
  const requestMutation = JSON.parse(await readFile(path, 'utf8'));
  requestMutation.command_scenarios[0].request_digest = '1'.repeat(64);
  requestMutation.template_payload_sha256 = digest(jcs(without(requestMutation, 'template_payload_sha256')));
  await writeTemplate(path, requestMutation);
  const requestReference = await referenceForPath(root, model.path);
  await rejects(() => loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: requestReference, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' }));
});

test('rejects symlinked template input before reading target bytes', async t => {
  const root = await evidenceRoot(t);
  const model = await reference(root, 'RECOVERY-FIXTURE-MODEL');
  const path = resolve(root, model.path);
  const target = resolve(root, 'template-target.json');
  await cp(path, target);
  await rm(path);
  await symlink(target, path);
  await rejects(() => loadRecoveryTemplate({ evidenceRoot: root, templateSourceRef: model, expectedFixtureId: 'RECOVERY-FIXTURE-MODEL' }));
});

async function evidenceRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'opm-recovery-template-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = resolve(root, 'dev-canvas-06/recovery/fixtures/templates/0.1.0');
  await mkdir(destination, { recursive: true });
  await cp(sourceRoot, destination, { recursive: true });
  return root;
}

async function reference(root, fixtureId) {
  const file = fixtureId === 'RECOVERY-FIXTURE-MODEL' ? 'recovery-model-template.json' : 'recovery-gate-template.json';
  return referenceForPath(root, `dev-canvas-06/recovery/fixtures/templates/0.1.0/${file}`);
}

async function referenceForPath(root, path) {
  const bytes = await readFile(resolve(root, path));
  return { kind: 'RECOVERY_TEMPLATE', path, byte_length: bytes.length, sha256: digest(bytes) };
}

async function writeTemplate(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function rejects(action) {
  await assert.rejects(action, error => error instanceof RecoveryTemplateError && error.code === 'RECOVERY_FIXTURE_MISMATCH' && error.exitCode === 2);
}

function without(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
}
