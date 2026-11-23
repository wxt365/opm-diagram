import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindReview, digest, planDigest, reviewBlocked, reviewRules } from '../src/review.mjs';
import { reviewReferenceCatalog } from '../src/review-scope.mjs';
const snapshot = { projections: [{ context_id: 'context.root', constructs: [{ target_id: 'element.beans', occurrence_id: 'occurrence.beans' }] }] };
const proposal = { baseToken: { edit_seq: 0 }, scope: { context_id: 'context.root' }, command: { steps: [] } };
const valid = () => ({ snapshot_digest: digest(snapshot), checks: reviewRules.rules.map(rule => ({ rule_id: rule.rule_id,
  result: rule.rule_id === 'OPM-OPL' ? 'NEEDS_INPUT' : 'PASS', explanation: '依据该场景审查，缺少 OPL 时未核对' })), issues: [], assumptions: [] });
const issue = (context_id, target_ids, rule_id = 'OPM-THING') => ({ rule_id, basis: 'STANDARD', severity: 'ERROR', context_id, target_ids, message: '有证据的错误', suggestion: '修正相关事实' });
test('缺失 assumptions 返回字段名；错误引用提供可复制合法短引用', () => {
  const r = valid(); delete r.assumptions;
  assert.throws(() => bindReview(r, snapshot, proposal), /assumptions/);
  const wrong = valid(); wrong.checks[0].result = 'ISSUE'; wrong.issues = [issue('context.root', ['element.wrong'])];
  assert.throws(() => bindReview(wrong, snapshot, proposal), /context.root.*element.wrong.*ref.2/s);
});
test('短引用精确绑定并拒绝错图、未知短引用及重复语义身份', () => {
  const r = valid(); r.checks[0].result = 'ISSUE'; r.issues = [issue('context.root', ['ref.2'])];
  assert.deepEqual(bindReview(r, snapshot, proposal).issues[0].target_ids, ['element.beans']);
  for (const [context, ids] of [['context.other', ['ref.2']], ['context.root', ['ref.999']], ['context.root', ['ref.2', 'element.beans']]]) {
    r.issues = [issue(context, ids)]; assert.throws(() => bindReview(r, snapshot, proposal), { code: 'REVIEW_INVALID' });
  }
});
test('关联图历史错误只提示，真实共享变更与跨父子边界冲突仍阻断', () => {
  const scoped = { ...snapshot, projections: [...snapshot.projections, { context_id: 'parent', constructs: [{ target_id: 'old' }, { target_id: 'changed' }] }],
    review_scope: { current_context_id: 'context.root', changed_target_ids: ['element.beans', 'changed'] } };
  const r = valid(); r.snapshot_digest = digest(scoped); r.checks[0].result = 'ISSUE'; r.issues = [issue('parent', ['old'])];
  const historical = bindReview(r, scoped, proposal); assert.equal(reviewBlocked(historical), false); assert.equal(historical.issues[0].historical, true);
  r.issues = [issue('parent', ['changed'])]; assert.equal(reviewBlocked(bindReview(r, scoped, proposal)), true);
  r.checks[0].result = 'PASS'; r.checks.find(c => c.rule_id === 'OPM-CONTEXT').result = 'ISSUE';
  r.issues = [issue('context.root', ['element.beans'], 'OPM-CONTEXT'), issue('parent', ['old'], 'OPM-CONTEXT')];
  assert.equal(bindReview(r, scoped, proposal).issues[1].severity, 'ERROR');
  assert.equal(reviewReferenceCatalog(scoped).length, 5);
});
test('报告绑定定版快照与方案，来源和条款由服务端赋值', () => {
  const report = bindReview(valid(), snapshot, proposal); assert.equal(report.plan_digest, planDigest(proposal));
  assert.deepEqual(report.checks[0].clauses, ['6.2.3']); assert.equal(report.coverage, 'PARTIAL_SEMANTIC_REVIEW'); assert.equal(reviewBlocked(report), false);
});
test('没有平台 OPL 时不能伪造核对结论，文本改变使旧快照报告失效', () => {
  for (const result of ['PASS', 'NOT_APPLICABLE', 'ISSUE']) {
    const r = valid(); r.checks.find(item => item.rule_id === 'OPM-OPL').result = result;
    assert.throws(() => bindReview(r, snapshot, proposal), /OPM-OPL.*NEEDS_INPUT/);
  }
  const withOpl = { ...snapshot, opl: { context_id: 'context.root', sentences: [{ text: '平台候选文本' }] } };
  const r = valid(); r.snapshot_digest = digest(withOpl); r.checks.find(item => item.rule_id === 'OPM-OPL').result = 'PASS';
  assert.equal(reviewBlocked(bindReview(r, withOpl, proposal)), false);
  const changed = structuredClone(withOpl); changed.opl.sentences[0].text = '另外的文本';
  assert.throws(() => bindReview(r, changed, proposal), { code: 'REVIEW_STALE' });
});
test('细化规则逐项接入报告，普通图不适用和证据不足不阻断', () => {
  const r = valid();
  r.checks.find(item => item.rule_id === 'OPM-STATE-VIEW').result = 'NEEDS_INPUT';
  r.checks.find(item => item.rule_id === 'OPM-REFINEMENT').result = 'NOT_APPLICABLE';
  r.checks.find(item => item.rule_id === 'OPM-ZOOM-ORDER').result = 'NOT_APPLICABLE';
  const report = bindReview(r, snapshot, proposal);
  assert.equal(reviewBlocked(report), false);
  assert.deepEqual(report.checks.find(item => item.rule_id === 'OPM-STATE-VIEW').clauses, ['14.2.1.1']);
  assert.deepEqual(report.checks.find(item => item.rule_id === 'OPM-REFINEMENT').pdf_pages, [88, 89]);
  assert.deepEqual(report.checks.find(item => item.rule_id === 'OPM-ZOOM-ORDER').clauses, ['14.2.1.3', '14.2.2.1', '14.2.2.2']);
  for (const ruleId of ['OPM-STATE-VIEW', 'OPM-REFINEMENT', 'OPM-ZOOM-ORDER']) {
    const incomplete = structuredClone(r); incomplete.checks = incomplete.checks.filter(item => item.rule_id !== ruleId);
    assert.throws(() => bindReview(incomplete, snapshot, proposal), { code: 'REVIEW_INVALID' });
  }
});
test('内缩放问题绑定条款与图元，明确错误阻断，待确认警告不阻断', () => {
  const r = valid(); r.checks.find(item => item.rule_id === 'OPM-ZOOM-ORDER').result = 'ISSUE';
  r.issues = [{ ...issue('context.root', ['element.beans'], 'OPM-ZOOM-ORDER'), message: '已确认的顺序与内缩放布局冲突', suggestion: '保留过程顺序并调整本图位置' }];
  const error = bindReview(r, snapshot, proposal);
  assert.equal(reviewBlocked(error), true);
  assert.deepEqual(error.issues[0].clauses, ['14.2.1.3', '14.2.2.1', '14.2.2.2']);
  r.issues[0].severity = 'WARNING'; r.issues[0].message = '缺少内缩放归属证据，需核对';
  assert.equal(reviewBlocked(bindReview(r, snapshot, proposal)), false);
});
test('业务原则必须逐项审查，缺少 OPL 等证据可待确认且条款由服务端绑定', () => {
  const expected = {
    'OPM-SYSTEM': ['6.1.1', '6.1.3', '6.1.4', '6.1.5', '14.1'],
    'OPM-PREPOST': ['8.2.2'],
    'OPM-CONTROL': ['8.2.1', '8.2.3', '9.5.1'],
    'OPM-LOGIC': ['12.1', '12.2'],
    'OPM-STRUCTURE': ['10.1', '10.3.1'],
    'OPM-OPL': ['6.2.1'],
  };
  const r = valid();
  for (const ruleId of Object.keys(expected)) {
    const check = r.checks.find(item => item.rule_id === ruleId);
    check.result = ruleId === 'OPM-SYSTEM' ? 'NOT_APPLICABLE' : 'NEEDS_INPUT';
    check.explanation = ruleId === 'OPM-OPL' ? '快照没有平台 OPL，尚未核对' : '局部任务不适用或缺少业务证据';
    const incomplete = structuredClone(r);
    incomplete.checks = incomplete.checks.filter(item => item.rule_id !== ruleId);
    assert.throws(() => bindReview(incomplete, snapshot, proposal), { code: 'REVIEW_INVALID' });
  }
  const report = bindReview(r, snapshot, proposal);
  assert.equal(report.checks.length, 15);
  assert.equal(reviewBlocked(report), false);
  for (const [ruleId, clauses] of Object.entries(expected)) {
    assert.deepEqual(report.checks.find(item => item.rule_id === ruleId).clauses, clauses);
  }
  assert.deepEqual(report.checks.find(item => item.rule_id === 'OPM-STATE').pdf_pages, [26, 27]);
  assert.ok(report.checks.find(item => item.rule_id === 'OPM-TRANSFORM').clauses.includes('8.1.2'));
});
test('新增前后条件规则的明确需求遗漏阻断，但不伪装标准出处', () => {
  const r = valid(); r.checks.find(item => item.rule_id === 'OPM-PREPOST').result = 'ISSUE';
  r.issues = [{ ...issue('context.root', ['element.beans'], 'OPM-PREPOST'), basis: 'USER_REQUIREMENT',
    message: '未表达用户明确要求的咖啡豆投入', suggestion: '恢复需求中的投入关系' }];
  const report = bindReview(r, snapshot, proposal);
  assert.equal(reviewBlocked(report), true);
  assert.deepEqual(report.issues[0].clauses, []);
  assert.deepEqual(report.issues[0].pdf_pages, []);
  assert.deepEqual(report.checks.find(item => item.rule_id === 'OPM-PREPOST').clauses, ['8.2.2']);
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

test('报告结论矛盾返回规则身份、字段路径及修正要求', () => {
  const r = valid(); r.issues = [issue('context.root', ['element.beans'])];
  assert.throws(() => bindReview(r, snapshot, proposal), error => {
    assert.equal(error.code, 'REVIEW_INVALID'); assert.match(error.message, /OPM-THING/);
    assert.match(error.message, /\/issues\/0\/rule_id/); assert.match(error.message, /\/checks\/0\/result.*PASS/);
    assert.match(error.message, /不得.*删除真实问题/); return true;
  });
  r.issues = []; r.checks[0].result = 'ISSUE';
  assert.throws(() => bindReview(r, snapshot, proposal), /OPM-THING.*\/checks\/0\/result.*\/issues/);
});
