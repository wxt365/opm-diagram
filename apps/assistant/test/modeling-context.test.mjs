import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelingContext, continuedReviewRequest } from '../src/modeling-context.mjs';
import { allowed } from '../src/commands.mjs';

test('当前图优化事实不扩大权限，区分主图元素、状态与关系', () => {
  const context = modelingContext({ constructs: [{ target_kind: 'ELEMENT' }, { target_kind: 'ELEMENT' }, { target_kind: 'STATE' }, { target_kind: 'FACT' }] });
  assert.deepEqual(context.visible_counts, { main_elements: 2, nodes: 3, relations: 1 });
  assert.deepEqual(context.allowed_commands, allowed);
  assert.equal(context.allowed_commands.includes('CREATE_CONTEXT'), false);
  assert.equal(context.capabilities.create_subdiagram, false); assert.equal(context.capabilities.reorganize_across_opds, false);
  assert.match(context.optimization_guidance, /非阻断/); assert.match(context.optimization_guidance, /须标为建议/);
  assert.match(context.optimization_guidance, /不能.*移出画布/);
});

test('无图空态计数和续聊原需求保留', () => {
  assert.deepEqual(modelingContext(null).visible_counts, { main_elements: 0, nodes: 0, relations: 0 });
  assert.equal(continuedReviewRequest(null, '创建船舶模型'), '创建船舶模型');
  const request = continuedReviewRequest('船舶模型保留AIS和公司关系', '优化布局');
  assert.match(request, /AIS和公司关系/); assert.match(request, /优化布局/); assert.match(request, /不静默删减/);
});

test('运行时明确支持时开放受限子图能力，仍禁止语义删除', () => {
  const context = modelingContext(null, true);
  assert.equal(context.capabilities.create_subdiagram, true);
  assert.equal(context.capabilities.delete_existing_semantics, false);
  assert.match(context.subdiagram_workflow, /stage_subdiagram/);
});
