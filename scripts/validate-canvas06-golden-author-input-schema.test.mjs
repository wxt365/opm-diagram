import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(await readFile('docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-font-input.schema.json', 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const digest = 'a'.repeat(64);

test('Font Input只接受固定三角色、绝对输入路径和raw ref', () => {
  assert.equal(validate(fontInput()), true, JSON.stringify(validate.errors));
});

test('Font Input拒绝乱序角色和额外字体，并保留path/ref等值给Author preflight复核', () => {
  const wrongOrder = fontInput();
  [wrongOrder.fonts[0], wrongOrder.fonts[1]] = [wrongOrder.fonts[1], wrongOrder.fonts[0]];
  assert.equal(validate(wrongOrder), false);

  const mismatched = fontInput();
  mismatched.fonts[0].source_ref.path = '/controlled/other.font';
  assert.equal(validate(mismatched), true, '路径等值由Author preflight复核，Schema只冻结形状。');

  const extra = fontInput();
  extra.fonts.push(extra.fonts[0]);
  assert.equal(validate(extra), false);
});

function fontInput() {
  return {
    schema_id: 'OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-FONT-INPUT-001',
    schema_version: '0.1',
    manifest_version: '0.1.0',
    font_input_id: 'dev-canvas-06.golden-authoring-font-input.controlled',
    fonts: [
      font('UI_SANS', 'UiSans', '/controlled/fonts/ui.font'),
      font('CJK_FALLBACK', 'CjkFallback', '/controlled/fonts/cjk.font'),
      font('MONOSPACE', 'Mono', '/controlled/fonts/mono.font')
    ]
  };
}

function font(logical_role, postscript_name, source_path) {
  return { logical_role, postscript_name, font_version: '1.0', source_path, source_ref: { kind: 'FONT_FILE', path: source_path, byte_length: 1, sha256: digest } };
}
