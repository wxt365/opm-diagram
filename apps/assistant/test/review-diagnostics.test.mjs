import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewTimeoutMs, reviewWorkload, repairTimeoutMs } from '../src/stage-runner.mjs';
import { reviewDiagnostics } from '../src/review-diagnostics.mjs';

test('大方案审查有界延长，小方案与显式配置保持兼容', () => {
  const task = count => ({ plan: { steps: Array(count).fill({}) } });
  assert.equal(reviewTimeoutMs({}, task(0)), 120000);
  assert.equal(reviewTimeoutMs({}, task(30)), 120000);
  assert.equal(reviewTimeoutMs({}, task(92)), 244000);
  assert.equal(reviewTimeoutMs({}, task(1000)), 300000);
  assert.equal(reviewTimeoutMs({ reviewTimeoutMs: 15 }, task(92)), 15);
});

test('审查超时和平台通过分别返回，诊断快照不修改原报告', () => {
  const p = { id: 'p', status: 'blocked', failureCode: 'REVIEW_TIMEOUT', reason: '审查超时',
    validation: { validation_summary: { blocking: 0 } }, review: null,
    reviewDiagnostics: { state: 'failed', last_report_error: { code: 'REVIEW_INVALID', message: '报告字段冲突' } } };
  const result = reviewDiagnostics(p, { status: 'failed' });
  assert.equal(result.failure_code, 'REVIEW_TIMEOUT'); assert.equal(result.platform.validation_summary.blocking, 0);
  assert.equal(result.standard_review, null); assert.match(result.guidance, /不等于模型不合格/);
  result.review_attempt.state = 'changed'; assert.equal(p.reviewDiagnostics.state, 'failed');
});

test('三步拆图按四张实际受审图计时，关系与共享出现均计入', () => {
  const task = { plan: { steps: Array(3).fill({}) }, review: { snapshot: { projections:
    Array.from({ length: 4 }, (_, index) => ({ context_id: `context.${index}`, constructs: Array(30).fill({ target_id: 'shared', target_kind: 'FACT' }) })) } } };
  assert.deepEqual(reviewWorkload(task), { source: 'review_snapshot', step_count: 3, graph_count: 4, construct_count: 120 });
  assert.equal(reviewTimeoutMs({}, task), 435000);
  assert.equal(reviewTimeoutMs({ reviewTimeoutMs: 15 }, task), 15);
});

test('单图修改规模按快照计时，多图有上限且不读取无关完整模型', () => {
  const task = { plan: { steps: [{}] }, snapshot: { projections: Array(100).fill({}) },
    review: { snapshot: { projections: [{ constructs: Array(100).fill({}) }] } } };
  assert.equal(reviewTimeoutMs({}, task), 225000);
  task.review.snapshot.projections = [{ constructs: [] }]; assert.equal(reviewTimeoutMs({}, task), 120000);
  task.review.snapshot.projections = Array(20).fill({ constructs: Array(300).fill({}) });
  assert.equal(reviewTimeoutMs({}, task), 600000);
});

test('多图修正沿用冻结审查规模且独立配置优先', () => {
  const task = { plan: { steps: [{}, {}, {}] }, repairSnapshot: { projections: Array(4).fill({ constructs: Array(30).fill({}) }) } };
  assert.equal(repairTimeoutMs({}, task), 435000); assert.equal(repairTimeoutMs({ repairTimeoutMs: 15 }, task), 15);
  assert.equal(repairTimeoutMs({}, { plan: { steps: [] } }), 180000);
});
