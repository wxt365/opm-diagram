import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile('docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-lineage-input.schema.json', 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

test('Lineage Input接受唯一INITIAL与可闭合SUPERSEDE', () => {
  assert.equal(validate(lineage('INITIAL')), true, JSON.stringify(validate.errors));
  assert.equal(validate(lineage('SUPERSEDE')), true, JSON.stringify(validate.errors));
});

test('Lineage Input拒绝非1.0.0 INITIAL和不完整SUPERSEDE', () => {
  const initial = lineage('INITIAL');
  initial.golden_set_version = '1.0.1';
  assert.equal(validate(initial), false);
  const supercede = lineage('SUPERSEDE');
  supercede.old_golden_set_sha256 = null;
  assert.equal(validate(supercede), false);
});

function lineage(mode) {
  const supercede = mode === 'SUPERSEDE';
  return { schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-LINEAGE-INPUT-001', schema_version: '0.1', lineage_version: '0.1.0', lineage_id: 'dev-canvas-06.golden-authoring-lineage.GOLDEN-CANVAS06-20260901-001', mode, golden_set_version: supercede ? '1.0.1' : '1.0.0', old_golden_set_version: supercede ? '1.0.0' : null, old_golden_set_sha256: supercede ? 'a'.repeat(64) : null };
}
