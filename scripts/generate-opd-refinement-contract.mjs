import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const revisionPath = path.join(root, 'docs/contracts/schemas/opm-revision-v0.2.schema.json');
const revisionBytes = readFileSync(revisionPath);
if (createHash('sha256').update(revisionBytes).digest('hex') !== '36cede0a2d7fbcf67e80415d3a7e9713e25cb6734032feb72cbf88d0f95f4fdc') {
  throw new Error('Revision 0.2 Schema 已变化，不能派生细化契约');
}
const revision = JSON.parse(revisionBytes);
const save = JSON.parse(readFileSync(path.join(root, 'docs/contracts/schemas/opm-save-content-v1.schema.json')));
const edge = {
  type: 'object', additionalProperties: false,
  required: ['refinement_id', 'parent_context_id', 'child_context_id', 'refinee_element_id', 'refinement_kind'],
  properties: {
    refinement_id: { $ref: '#/$defs/stableId' },
    parent_context_id: { $ref: '#/$defs/stableId' },
    child_context_id: { $ref: '#/$defs/stableId' },
    refinee_element_id: { $ref: '#/$defs/stableId' },
    refinement_kind: { enum: ['PROCESS', 'OBJECT'] },
  },
};
function addEdges(object) {
  object.required.push('refinement_edges');
  object.properties.refinement_edges = { type: 'array', items: { $ref: '#/$defs/refinementEdge' } };
}
const nextRevision = structuredClone(revision);
nextRevision.$id = 'https://opm.local/schemas/revision/0.3';
nextRevision.title = 'OPM Revision 0.3 - RefinementEdge';
nextRevision.properties.schema_version = { const: '0.3' };
nextRevision.$defs.refinementEdge = edge;
addEdges(nextRevision);

const nextSave = structuredClone(save);
nextSave.$id = 'https://opm.local/schemas/save-content/2';
nextSave.title = 'SaveContentDigest/2 - 生成物，请勿手改';
nextSave.$defs.refinementEdge = edge;
nextSave.$defs.Document.properties.schema_version = { const: '0.3' };
for (const name of ['Document', 'Content', 'NormalizedContent']) addEdges(nextSave.$defs[name]);
nextSave.$defs.Preimage.properties.schema_version = { const: '2' };

// 方法分类属于 OPD 元数据；保留已冻结的 0.2/0.3 及摘要字节。
const methodRevision = structuredClone(nextRevision);
methodRevision.$id = 'https://opm.local/schemas/revision/0.4';
methodRevision.title = 'OPM Revision 0.4 - OPD architecture classification';
methodRevision.properties.schema_version = { const: '0.4' };
methodRevision.$defs.context.properties.architecture_level = { enum: ['MISSION', 'FUNCTION', 'PRODUCT'] };
const methodSave = structuredClone(nextSave);
methodSave.$id = 'https://opm.local/schemas/save-content/2-method';
methodSave.title = 'SaveContentDigest/2 for semantic 0.4 - 生成物，请勿手改';
methodSave.$defs.Document.properties.schema_version = { const: '0.4' };
methodSave.$defs.context.properties.architecture_level = { enum: ['MISSION', 'FUNCTION', 'PRODUCT'] };

// 关联采用源 OPD 所属的可选方法元数据，旧文件字节保持不变。
const traceLink = { type: 'object', additionalProperties: false,
  required: ['link_id', 'target_context_id', 'kind'], properties: {
    link_id: { $ref: '#/$defs/stableId' }, target_context_id: { $ref: '#/$defs/stableId' },
    kind: { enum: ['INPUT', 'GENERATES', 'TRACE'] },
  } };
const traceRevision = structuredClone(methodRevision);
traceRevision.$id = 'https://opm.local/schemas/revision/0.5';
traceRevision.title = 'OPM Revision 0.5 - OPD architecture links';
traceRevision.properties.schema_version = { const: '0.5' };
const traceSave = structuredClone(methodSave);
traceSave.$id = 'https://opm.local/schemas/save-content/2-trace';
traceSave.title = 'SaveContentDigest/2 for semantic 0.5 - 生成物，请勿手改';
traceSave.$defs.Document.properties.schema_version = { const: '0.5' };
for (const schema of [traceRevision, traceSave]) {
  schema.$defs.architectureLink = traceLink;
  schema.$defs.context.properties.architecture_links = { type: 'array', items: { $ref: '#/$defs/architectureLink' } };
}

for (const [relative, value] of [
  ['docs/contracts/schemas/opm-revision-v0.5.schema.json', traceRevision],
  ['docs/contracts/schemas/opm-save-content-v2-trace.schema.json', traceSave],
  ['services/local-runtime/src/main/resources/draftsave/save-content-v2-trace.schema.json', traceSave],
  ['docs/contracts/schemas/opm-revision-v0.4.schema.json', methodRevision],
  ['docs/contracts/schemas/opm-save-content-v2-method.schema.json', methodSave],
  ['services/local-runtime/src/main/resources/draftsave/save-content-v2-method.schema.json', methodSave],
  ['docs/contracts/schemas/opm-revision-v0.3.schema.json', nextRevision],
  ['docs/contracts/schemas/opm-save-content-v2.schema.json', nextSave],
  ['services/local-runtime/src/main/resources/draftsave/save-content-v2.schema.json', nextSave],
]) {
  const file = path.join(root, relative);
  const content = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== content) throw new Error(`生成文件过期：${relative}`);
  } else writeFileSync(file, content);
}
