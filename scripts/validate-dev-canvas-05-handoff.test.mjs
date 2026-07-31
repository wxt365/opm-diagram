import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve('.');
const sourceHandoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const validator = resolve('scripts/validate-dev-canvas-05-handoff.mjs');

test('READY handoff rejects a missing release artifact pair', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'opm-canvas05-handoff-'));
  try {
    const handoffRoot = resolve(temporaryRoot, 'handoff');
    await cp(resolve(sourceHandoffRoot, 'reports'), resolve(handoffRoot, 'reports'), { recursive: true });
    const handoff = JSON.parse(await readFile(resolve(sourceHandoffRoot, 'dev-canvas-05-handoff.json'), 'utf8'));
    handoff.handoff_status = 'READY_FOR_DEV_CANVAS_06';
    handoff.source_build.dirty_before_build = false;
    handoff.blockers = [];
    handoff.build_artifacts = [];
    for (const capability of handoff.capability_evidence) capability.eligibility = 'ELIGIBLE_FOR_RELEASE_VALIDATION';
    const path = resolve(handoffRoot, 'dev-canvas-05-handoff.json');
    await writeFile(path, JSON.stringify(handoff));

    const result = spawnSync(process.execPath, [validator, path], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /requires exactly LOCAL_RUNTIME_JAR and EVIDENCE_BUNDLE artifacts/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
