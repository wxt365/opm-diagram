import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { treeRef } from './canvas06-unified-production-input.mjs';

const root = resolve('.');
const sourceHandoffRoot = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff');
const sourceReleaseRoot = resolve(sourceHandoffRoot, 'releases/clean-37c5412a9c12');
const validator = resolve('scripts/validate-dev-canvas-05-handoff.mjs');

test('READY handoff rejects a missing release artifact pair', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'opm-canvas05-handoff-'));
  try {
    const handoffRoot = resolve(temporaryRoot, 'handoff');
    await cp(sourceReleaseRoot, resolve(handoffRoot, 'releases/clean-37c5412a9c12'), { recursive: true });
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

test('READY Handoff 0.2 accepts the ordered Web tree artifact', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'opm-canvas05-handoff-v02-'));
  try {
    const handoffRoot = resolve(temporaryRoot, 'handoff');
    await cp(sourceHandoffRoot, handoffRoot, { recursive: true });
    const handoff = JSON.parse(await readFile(resolve(handoffRoot, 'dev-canvas-05-handoff.json'), 'utf8'));
    const source12 = handoff.source_build.source_commit.slice(0, 12);
    const webRoot = resolve(handoffRoot, `releases/clean-${source12}/web-dist`);
    await mkdir(resolve(webRoot, 'assets'), { recursive: true });
    await writeFile(resolve(webRoot, 'index.html'), '<!doctype html>');
    await writeFile(resolve(webRoot, 'assets/app.js'), 'console.log(1)');
    handoff.schema_version = '0.2';
    handoff.build_artifacts.push({ ...(await treeRef(resolve(handoffRoot, `releases/clean-${source12}`), 'web-dist')), path: `releases/clean-${source12}/web-dist` });
    await writeFile(resolve(handoffRoot, 'dev-canvas-05-handoff.json'), JSON.stringify(handoff));
    const result = spawnSync(process.execPath, [validator, resolve(handoffRoot, 'dev-canvas-05-handoff.json')], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
