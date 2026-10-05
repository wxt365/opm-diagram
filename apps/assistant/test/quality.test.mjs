import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessQuality, modelingGuidance, modelingGuide, qualityPolicy } from '../src/quality.mjs';
import { planDigest } from '../src/review.mjs';
const node = (id, role = 'OBJECT_NODE', name = id, x = 0, y = 0) => ({ target_kind: 'ELEMENT', target_id: `element.${id}`, occurrence_id: `occurrence.${id}`, construct_role: role, label: name, layout: { x, y, width: 160, height: 72 } });
const fact = (id, capability, ids) => ({ target_kind: 'FACT', target_id: `fact.${id}`, occurrence_id: `occurrence.${id}`, capability_id: capability, endpoints: ids.map(target_id => ({ target_id })) });
const proposal = { baseToken: { edit_seq: 0 }, scope: { context_id: 'context.root' }, command: { steps: [] } };
const assess = (constructs, policy = qualityPolicy) => assessQuality({ context_id: 'context.root', constructs }, proposal, policy);
const rules = report => report.items.map(item => item.rule_id);
test('指导加载完整、与策略版本绑定，报告是非标准非阻断建议', () => {
  assert.match(modelingGuide, /name: opm-modeling-guide/); assert.match(modelingGuidance, /同名不代表同一对象/);
  const report = assess([node('设备', 'OBJECT_NODE', '设备')]);
  assert.equal(report.plan_digest, planDigest(proposal)); assert.equal(report.coverage, 'CURRENT_OPD_HEURISTICS');
  assert.equal(report.policy_version, qualityPolicy.policy_version); assert.match(report.guide_digest, /^[a-f0-9]{64}$/);
  assert.equal(report.items.length, 0);
});
test('合法同名不同身份只建议核对，同一身份或不同节点类型不要求合并', () => {
  const sameName = [node('a', 'OBJECT_NODE', '设备', 0), node('b', 'OBJECT_NODE', '设备', 260)];
  const report = assess(sameName); assert.deepEqual(rules(report), ['QUALITY-IDENTITY']);
  assert.equal(report.items[0].severity, 'WARNING'); assert.match(report.items[0].suggestion, /不自动合并/);
  assert(!rules(assess([sameName[0], { ...sameName[1], target_id: sameName[0].target_id }])).includes('QUALITY-IDENTITY'));
  assert(!rules(assess([sameName[0], { ...sameName[1], construct_role: 'PROCESS_NODE' }])).includes('QUALITY-IDENTITY'));
});
test('孤立与只有使能关系的过程有建议，多种合法变换和三端点关系不会被误判', () => {
  const beans = node('beans'), process = node('grind', 'PROCESS_NODE', '磨豆', 300);
  assert(rules(assess([process])).includes('QUALITY-PROCESS'));
  assert(rules(assess([beans, process, fact('instrument', 'CAP-ISO-PROC-005', [beans.target_id, process.target_id])])).includes('QUALITY-PROCESS'));
  for (const capability of ['001', '002', '003', '008', '009', '010']) {
    const report = assess([beans, process, fact('transform', `CAP-ISO-PROC-${capability}`, [beans.target_id, process.target_id, 'state.output'])]);
    assert(!rules(report).includes('QUALITY-PROCESS'));
  }
  const combined = assess([beans, process, fact('in', 'CAP-ISO-PROC-001', [beans.target_id, process.target_id]), fact('out', 'CAP-ISO-PROC-002', [process.target_id, beans.target_id])]);
  assert(!rules(combined).includes('QUALITY-IDENTITY')); assert(!rules(combined).includes('QUALITY-PROCESS'));
});
test('节点重叠与间距提示不包括对象内属性状态；边界相距阈值时通过', () => {
  const a = node('a'), b = node('b', 'OBJECT_NODE', 'b', 100);
  assert(rules(assess([a, b])).includes('QUALITY-SPACING'));
  assert(!rules(assess([a, { ...b, layout: { ...b.layout, x: 184 } }])).includes('QUALITY-SPACING'));
  const state = { ...node('state'), target_kind: 'STATE', construct_role: 'STATE_NODE', owner_id: a.target_id };
  const feature = { ...node('feature'), target_kind: 'FEATURE', construct_role: 'FEATURE_NODE', owner_id: a.target_id };
  assert(!rules(assess([a, state, feature])).includes('QUALITY-SPACING'));
});
test('占位命名、节点密度、端点跨度和报告上限可配置，诊断不修改投影', () => {
  const nodes = Array.from({ length: 13 }, (_, i) => node(`${i}`, 'OBJECT_NODE', `设备${i}`, i * 260));
  nodes[0].label = '对象1'; const constructs = [...nodes, fact('long', 'CAP-ISO-STRUCT-001', [nodes[0].target_id, nodes[12].target_id])];
  const before = structuredClone(constructs), report = assess(constructs);
  assert(rules(report).includes('QUALITY-DENSITY')); assert(rules(report).includes('QUALITY-NAME')); assert(rules(report).includes('QUALITY-LINK-SPAN'));
  assert.deepEqual(constructs, before); assert.equal(report.node_count, 13); assert.equal(report.fact_count, 1);
  const custom = assess(constructs, { ...qualityPolicy, max_nodes_per_view: 20, max_endpoint_span: 10000 });
  assert(!rules(custom).includes('QUALITY-DENSITY')); assert(!rules(custom).includes('QUALITY-LINK-SPAN'));
  const capped = assess([node('a', 'OBJECT_NODE', '对象1'), node('b', 'OBJECT_NODE', '对象2')], { ...qualityPolicy, max_report_items: 1 });
  assert.equal(capped.items.length, 1); assert.equal(capped.omitted, 2);
});
