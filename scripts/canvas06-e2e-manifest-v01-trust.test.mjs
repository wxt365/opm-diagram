import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';
import { loadReadyTrustChain } from './canvas06-e2e-manifest-v01-trust.mjs';

const root = resolve('.');
const handoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const handoff = 'dev-canvas-05-handoff.json';

test('accepts the exact READY Intake to Handoff raw-ref chain', async t => {
  const work = await readyChain(t);
  const chain = await loadReadyTrustChain({ root: work, intakePath: 'intake.json', handoffPath: handoff });
  assert.equal(chain.intake.value.intake_status, 'READY_FOR_RELEASE_VALIDATION');
  assert.equal(chain.handoff.value.handoff_status, 'READY_FOR_DEV_CANVAS_06');
});

test('rejects an Intake handoff ref that differs from supplied raw bytes', async t => {
  const work = await readyChain(t);
  const intakePath = resolve(work, 'intake.json');
  const intake = JSON.parse(await readFile(intakePath, 'utf8'));
  intake.handoff_ref.sha256 = '0'.repeat(64);
  await writeFile(intakePath, JSON.stringify(intake));
  await assert.rejects(() => loadReadyTrustChain({ root: work, intakePath: 'intake.json', handoffPath: handoff }), error => error instanceof E2eManifestInputError && error.code === 'E2E_MANIFEST_HANDOFF_MISMATCH');
});

async function readyChain(t) {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-e2e-trust-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const targetHandoff = resolve(work, handoff);
  await copyFile(resolve(handoffRoot, handoff), targetHandoff);
  const digest = (await import('node:crypto')).createHash('sha256').update(await readFile(targetHandoff)).digest('hex');
  const output = resolve(work, 'intake.json');
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/release-canvas06-intake.mjs'), '--handoff-root', handoffRoot, '--handoff', handoff, '--handoff-sha256', digest, '--out', output], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return work;
}
