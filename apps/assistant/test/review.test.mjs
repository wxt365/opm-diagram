import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindReview, digest, planDigest, reviewBlocked, reviewRules } from '../src/review.mjs';
const snapshot = { projections: [{ context_id: 'context.root', constructs: [{ target_id: 'element.beans', occurrence_id: 'occurrence.beans' }] }] };
const proposal = { baseToken: { edit_seq: 0 }, scope: { context_id: 'context.root' }, command: { steps: [] } };
const valid = () => ({ snapshot_digest: digest(snapshot), checks: reviewRules.rules.map(rule => ({ rule_id: rule.rule_id, result: 'PASS', explanation: '依据该场景审查' })), issues: [], assumptions: [] });
test('报告绑定定版快照与方案，来源和条款由服务端赋值', () => {
  const report = bindReview(valid(), snapshot, proposal); assert.equal(report.plan_digest, planDigest(proposal));
  assert.deepEqual(report.checks[0].clauses, ['6.2.3']); assert.equal(report.coverage, 'PARTIAL_SEMANTIC_REVIEW'); assert.equal(reviewBlocked(report), false);
});
test('伪造条款、越界图元、缺项、重复项、过期快照和结论矛盾均拒绝', () => {
  for (const mutate of [r => r.snapshot_digest = '0'.repeat(64), r => r.checks.pop(), r => r.checks[1] = r.checks[0],
    r => r.checks[0].clauses = ['假的条款'], r => r.checks[0].result = 'ISSUE',
    r => { r.checks[0].result = 'ISSUE'; r.issues.push({ rule_id: 'OPM-THING', basis: 'STANDARD', severity: 'ERROR', context_id: 'context.root', target_ids: ['element.other'], message: '类型错误', suggestion: '修改类型' }); }]) {
    const r = valid(); mutate(r); assert.throws(() => bindReview(r, snapshot, proposal));
  }
});
test('错误阻断；业务警告保留依据，不能被通过检查掩盖', () => {
  const r = valid(); r.checks[0].result = 'ISSUE';
  r.issues.push({ rule_id: 'OPM-THING', basis: 'STANDARD', severity: 'ERROR', context_id: 'context.root', target_ids: ['element.beans'], message: '将业务活动作为对象', suggestion: '替换暂存对象为过程' });
  assert.equal(reviewBlocked(bindReview(r, snapshot, proposal)), true);
  r.issues[0].severity = 'WARNING'; r.issues[0].basis = 'USER_REQUIREMENT';
  const warning = bindReview(r, snapshot, proposal); assert.equal(reviewBlocked(warning), false);
  assert.deepEqual(warning.issues[0].clauses, []); assert.deepEqual(warning.issues[0].pdf_pages, []);
  r.checks[0].result = 'PASS'; assert.throws(() => bindReview(r, snapshot, proposal));
});
