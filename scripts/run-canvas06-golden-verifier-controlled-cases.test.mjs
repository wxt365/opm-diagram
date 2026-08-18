import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { controlledCases, main } from './run-canvas06-golden-verifier-controlled-cases.mjs';

test('controlled verifier catalog v1.1 contains the frozen 63 cases including six pending-quarantine cases', () => {
  const cases = controlledCases({ K001: '0'.repeat(64), K002: '1'.repeat(64) });
  assert.equal(cases.length, 63);
  assert.deepEqual(cases.slice(-6).map(item => item.case_id), ['GFMV-PQP-001', 'GFMV-PQN-001', 'GFMV-PQN-002', 'GFMV-PQN-003', 'GFMV-PQN-004', 'GFMV-PQN-005']);
  assert.equal(cases.slice(-6).every(item => item.pending === true), true);
});

test('controlled case runner creates isolated expected metadata and preserves every root', async () => {
  const work = await mkdtemp(resolve(tmpdir(), 'gfmv-controlled-runner-'));
  const inputs = resolve(work, 'inputs'); const base = resolve(work, 'base'); const output = resolve(work, 'out');
  await mkdir(inputs); await mkdir(base); await writeFile(resolve(base, 'evidence.txt'), 'immutable');
  await writeFile(resolve(inputs, 'capture-plan.json'), '{}');
  await writeFile(resolve(work, 'controlled-inputs.json'), JSON.stringify({ aliases: { K001: '0'.repeat(64) } }));
  const calls = [];
  const results = await main(['--plan', resolve(inputs, 'capture-plan.json'), '--base-root', base, '--output-root', output], {
    verifier: async argv => { calls.push(argv); },
    cases: [{ case_id: 'GFMV-BASE-001', mode: 'full required', selected: false, expected_exit_code: 0, expected_top_code: null, argv: ({ planPath, materializationRoot }) => ['--plan', planPath, '--materialization-root', materializationRoot, '--require-materialized'] }]
  });
  assert.equal(calls.length, 3);
  assert.equal(results.length, 1);
  for (const result of results) {
    assert.equal(result.root_digest_before, result.root_digest_after);
    const expected = JSON.parse(await readFile(resolve(output, result.case_id, 'expected.json'), 'utf8'));
    assert.deepEqual(expected, result);
  }
  assert.equal(await readFile(resolve(base, 'evidence.txt'), 'utf8'), 'immutable');
});
