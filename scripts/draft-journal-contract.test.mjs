import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(readFileSync(new URL('../docs/contracts/schemas/opm-draft-journal-v1.schema.json', import.meta.url)));
const validate = new Ajv2020({ strict: true, allowUnionTypes: true }).compile(schema);
const delta = { schema_id: 'OPM-DRAFT-JSON-DELTA', schema_version: '1', before_digest: 'a'.repeat(64), after_digest: 'b'.repeat(64),
  operations: [{ path: ['layouts', '0', 'x'], before: { present: true, value: -0 }, after: { present: true, value: 1.25 } }] };

test('增量容器封闭；通用 JSON 子树只允许进入明确存在的槽', () => {
  assert.equal(validate(delta), true);
  for (const slot of [{ present: false }, { present: true, value: null }, { present: true, value: { arbitrary: [false, null, '订单😀', 2.5] } }]) {
    assert.equal(validate({ ...delta, operations: [{ ...delta.operations[0], after: slot }] }), true);
  }
  for (const patch of [{ extra: true }, { schema_version: 1 }, { before_digest: 'wrong' }]) assert.equal(validate({ ...delta, ...patch }), false);
  for (const after of [{}, { present: true }, { present: false, value: null }, { present: 'true', value: 1 }, { present: true, value: Infinity }]) {
    assert.equal(validate({ ...delta, operations: [{ ...delta.operations[0], after }] }), false);
  }
  assert.equal(validate({ ...delta, operations: [{ ...delta.operations[0], path: [] }] }), false);
});

test('无变化增量允许空操作；业务载荷不能作为增量外壳', () => {
  assert.equal(validate({ ...delta, after_digest: delta.before_digest, operations: [] }), true);
  assert.equal(validate({ model_json: {}, artifact_json: {} }), false);
  assert.equal(validate({ ...delta, operations: [{ ...delta.operations[0], payload: {} }] }), false);
});
