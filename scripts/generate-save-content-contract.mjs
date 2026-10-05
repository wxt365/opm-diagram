import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceBytes = readFileSync(path.join(root, 'docs/contracts/schemas/opm-revision-v0.2.schema.json'));
if (createHash('sha256').update(sourceBytes).digest('hex') !== '36cede0a2d7fbcf67e80415d3a7e9713e25cb6734032feb72cbf88d0f95f4fdc') {
  throw new Error('Revision Schema 已变化；必须评审新的保存摘要版本，禁止重解释 SaveContentDigest/1');
}
const source = JSON.parse(sourceBytes);
const keys = ['model_id', 'profile_binding', 'model_header', 'elements', 'features', 'states', 'facts', 'contexts', 'occurrences', 'layouts', 'state_presentations'];
const defs = structuredClone(source.$defs);
defs.modelHeader.required = defs.modelHeader.required.filter(key => key !== 'name');
const document = structuredClone(source);
for (const key of ['$schema', '$id', '$defs', 'title']) delete document[key];
document.required = document.required.filter(key => !['schema_set_ref', 'text_artifact', 'validation_summary', 'revision_digest'].includes(key));
const content = { type: 'object', additionalProperties: false,
  required: document.required.filter(key => keys.includes(key)),
  properties: Object.fromEntries(keys.map(key => [key, source.properties[key]])) };
defs.Document = document;
defs.Content = content;
defs.binary64 = { type: 'object', additionalProperties: false, required: ['$binary64'],
  properties: { $binary64: { type: 'string', pattern: '^[0-9a-f]{16}$' } } };
defs.normalizedLayout = structuredClone(defs.layout);
for (const key of ['x', 'y', 'width', 'height']) defs.normalizedLayout.properties[key] = { $ref: '#/$defs/binary64' };
for (const key of ['x', 'y']) defs.normalizedLayout.properties.route_points.items.properties[key] = { $ref: '#/$defs/binary64' };
defs.NormalizedContent = structuredClone(content);
defs.NormalizedContent.properties.layouts.items = { $ref: '#/$defs/normalizedLayout' };
defs.Preimage = { type: 'object', additionalProperties: false,
  required: ['schema_id', 'schema_version', 'float_encoding', 'content'], properties: {
    schema_id: { const: 'OPM-SAVE-CONTENT-DIGEST' }, schema_version: { const: '1' },
    float_encoding: { const: 'IEEE754_BINARY64_BE_HEX' }, content: { $ref: '#/$defs/NormalizedContent' },
  } };
const schema = { $schema: source.$schema, $id: 'https://opm.local/schemas/save-content/1',
  title: 'SaveContentDigest/1 — 生成物，请勿手改', $ref: '#/$defs/Document', $defs: defs };
// 此列表与 Java 专用校验器一一对应；新关键词必须先实现，不能忽略。
const keywords = new Set(['$schema', '$id', 'title', '$ref', '$defs', 'type', 'additionalProperties', 'required',
  'properties', 'items', 'const', 'enum', 'minLength', 'maxLength', 'pattern', 'minItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum']);
function check(node) {
  for (const key of Object.keys(node)) if (!keywords.has(key)) throw new Error(`未支持的 Schema 关键词：${key}`);
  if (node.type && !['object', 'array', 'string', 'integer', 'number'].includes(node.type)) throw new Error(`未支持的 Schema 类型：${node.type}`);
  if (node.type === 'object' && node.additionalProperties !== false) throw new Error('保存对象必须封闭');
  if (node.$ref && (!node.$ref.startsWith('#/$defs/') || !defs[node.$ref.substring('#/$defs/'.length)])) throw new Error('只支持已定义的本地引用');
  if (node.const !== undefined && typeof node.const !== 'string') throw new Error('当前 const 只允许字符串');
  if (node.enum?.some(value => typeof value !== 'string')) throw new Error('当前 enum 只允许字符串');
  if (node.uniqueItems && node.items?.type !== 'string' && !node.items?.enum?.every(value => typeof value === 'string')) throw new Error('当前去重数组只允许字符串');
  for (const children of [node.properties, node.$defs]) for (const value of Object.values(children ?? {})) check(value);
  if (node.items) check(node.items);
}
check(schema);
const bytes = JSON.stringify(schema, null, 2) + '\n';
for (const relative of ['docs/contracts/schemas/opm-save-content-v1.schema.json',
  'services/local-runtime/src/main/resources/draftsave/save-content-v1.schema.json']) {
  const file = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== bytes) throw new Error(`生成物过期：${relative}`);
  } else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); }
}
console.log('保存内容 Schema 生成检查通过');
