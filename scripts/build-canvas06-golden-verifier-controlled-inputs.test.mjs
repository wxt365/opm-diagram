import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { createControlledInputs, main } from './build-canvas06-golden-verifier-controlled-inputs.mjs';
import { collectFamilyFixtures } from './release-canvas06-golden-materialize.mjs';

const root = resolve('.');
const run = promisify(execFile);
const planSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json'), 'utf8'));
const validatePlan = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(planSchema);

test('controlled verifier factory creates a schema-valid 1242-capture Plan and exact 130-fixture ZIP', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'gfmv-controlled-factory-'));
  const runtimeJar = resolve(work, 'runtime.jar');
  await writeFile(runtimeJar, 'controlled test runtime');
  const result = await createControlledInputs({ outputRoot: resolve(work, 'out'), runtimeJar });
  const plan = JSON.parse(await readFile(result.planPath, 'utf8'));

  assert.equal(validatePlan(plan), true, JSON.stringify(validatePlan.errors));
  assert.equal(plan.source_date_epoch, 1785542400);
  assert.equal(plan.captures.length, 1242);
  const fixtures = collectFamilyFixtures(plan);
  assert.equal(fixtures.length, 130);
  assert.deepEqual(Object.keys(result.aliases), Array.from({ length: 130 }, (_, index) => `K${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(Object.values(result.aliases), fixtures.map(fixture => fixture.key));
  assert.equal(result.aliases.K001, fixtures[0].key);

  const { stdout } = await run('unzip', ['-Z1', result.bundlePath]);
  assert.equal(stdout.trim().split('\n').length, 130);
  const firstEntry = 'fixtures/family-0.json';
  const firstFixture = await run('unzip', ['-p', result.bundlePath, firstEntry], { encoding: 'buffer' });
  assert.equal(Buffer.isBuffer(firstFixture.stdout), true);
  assert.equal(firstFixture.stdout.length, plan.captures[0].fixture_ref.byte_length);
});

test('controlled verifier factory rejects an existing output root', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'gfmv-controlled-root-'));
  const runtimeJar = resolve(work, 'runtime.jar');
  const outputRoot = resolve(work, 'out');
  await writeFile(runtimeJar, 'controlled test runtime');
  await createControlledInputs({ outputRoot, runtimeJar });
  await assert.rejects(() => createControlledInputs({ outputRoot, runtimeJar }), error => error.code === 'GFMV_FACTORY_OUTPUT_EXISTS' && error.exitCode === 3);
});

test('controlled factory invokes full required semantic verification after materialization', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'gfmv-controlled-flow-'));
  const runtimeJar = resolve(work, 'runtime.jar'); const outputRoot = resolve(work, 'out');
  await writeFile(runtimeJar, 'controlled test runtime');
  let materializerArgs; let verifierArgs;
  await main(['--output-root', outputRoot, '--runtime-jar', runtimeJar], {
    materializerMain: async args => { materializerArgs = args; },
    verifier: async args => { verifierArgs = args; }
  });
  assert.equal(materializerArgs.at(-1), '1');
  assert.equal(verifierArgs.at(-1), '--require-materialized');
  assert.equal(verifierArgs[0], '--plan');
  assert.equal(verifierArgs[2], '--materialization-root');
});
