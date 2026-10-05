import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileMindmapRepair } from '../src/mindmap-repair.mjs';

const object = { local_id: 'create.object', command_type: 'CREATE_ELEMENT', kind: 'OBJECT', name: '测试物料', layout: { x: 0, y: 0 } };
const process = { ...object, local_id: 'create.process', kind: 'PROCESS', name: '测试处理' };
const fact = { local_id: 'create.fact', command_type: 'CREATE_FACT', capability_id: 'CAP-ISO-PROC-001', endpoints: [object.local_id, process.local_id] };
const source = { mindmap_id: 'mindmap.test', revision: 1, digest: 'a'.repeat(64), excluded_ids: ['attribute'], bindings: [
  { source_id: 'object', target_ref: object.local_id }, { source_id: 'object.ref', target_ref: object.local_id },
  { source_id: 'process', target_ref: process.local_id }, { source_id: 'fact', target_ref: fact.local_id } ] };
const task = () => ({ analysisSource: structuredClone(source), analysisDocument: { nodes: [{ id: 'object', label: '测试物料' }, { id: 'object.ref', label: '物料复用' }, { id: 'process', label: '测试处理' }], relations: [{ id: 'fact', label: '测试消耗关系' }] }, plan: { steps: structuredClone([object, process, fact]) } });
test('误删后可从原方案恢复关系与来源，当前说明不保留已恢复项', () => {
  const input = task(); input.analysisRepairBaseline = { steps: structuredClone(input.plan.steps), source: structuredClone(input.analysisSource) };
  const first = reconcileMindmapRepair(input, [object, process]);
  input.plan.steps = [object, process]; input.analysisSource = first.source;
  const restored = reconcileMindmapRepair(input, [object, process, fact]);
  assert.deepEqual(restored.source, source); assert.deepEqual(restored.removedLabels, []);
  assert.throws(() => reconcileMindmapRepair(input, [object, process, { ...fact, capability_id: 'CAP-ISO-PROC-002' }]), { code: 'ANALYSIS_REPAIR_SCOPE' });
});
test('移除未创建的冲突项同步来源，保留用户排除、复用身份及原分析', () => {
  const input = task(), before = structuredClone(input), repaired = reconcileMindmapRepair(input, [object, process]);
  assert.deepEqual(repaired.source.excluded_ids, ['attribute', 'fact']);
  assert.deepEqual(repaired.source.bindings, source.bindings.slice(0, 3));
  assert.deepEqual(repaired.removedLabels, ['测试消耗关系']); assert.deepEqual(input, before);
  const removedObject = reconcileMindmapRepair(input, [process]);
  assert.deepEqual(removedObject.removedSourceIds, ['object', 'object.ref', 'fact']);
});
test('允许调整布局；禁止添加、改名、改类型、改归属、改关系定义或遗留别名依赖', () => {
  assert.equal(reconcileMindmapRepair(task(), [{ ...object, layout: { x: 100, y: 200 } }, process, fact]).source.bindings.length, 4);
  for (const steps of [[object, process, fact, { ...object, local_id: 'new' }], [{ ...object, name: '替换实体' }, process],
    [{ ...object, kind: 'PROCESS' }, process], [object, process, { ...fact, endpoints: [process.local_id, object.local_id] }],
    [process, fact]]) assert.throws(() => reconcileMindmapRepair(task(), steps));
  const input = task(); input.plan.steps.push({ local_id: 'state', command_type: 'CREATE_STATE', target: object.local_id, name: '待处理' });
  assert.throws(() => reconcileMindmapRepair(input, [object, process, { ...input.plan.steps.at(-1), target: process.local_id }]));
});
