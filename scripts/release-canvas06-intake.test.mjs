import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve('.');
const handoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const handoff = 'dev-canvas-05-handoff.json';
const runner = resolve('scripts/release-canvas06-intake.mjs');
const bytes = await readFile(resolve(handoffRoot, handoff));
const digest = createHash('sha256').update(bytes).digest('hex');

test('READY handoff produces a complete READY intake report', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-intake-'));
  try {
    const output = resolve(directory, 'intake.json');
    const result = run(output, digest);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.intake_status, 'READY_FOR_RELEASE_VALIDATION');
    assert.equal(report.checks.length, 8);
    assert.equal(report.capability_intake.length, 34);
    assert.equal(report.blockers.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('incorrect handoff digest produces a schema-valid BLOCKED report', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opm-canvas06-intake-'));
  try {
    const output = resolve(directory, 'intake.json');
    const result = run(output, '0'.repeat(64));
    assert.equal(result.status, 3, result.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.intake_status, 'BLOCKED');
    assert.ok(report.blockers.some(item => item.code === 'CANVAS06_HANDOFF_DIGEST_MISMATCH'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function run(output, handoffDigest) {
  return spawnSync(process.execPath, [runner, '--handoff-root', handoffRoot, '--handoff', handoff, '--handoff-sha256', handoffDigest, '--out', output], { cwd: root, encoding: 'utf8' });
}
