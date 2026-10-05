import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { check } from './store.mjs';

export const reviewSkill = await readFile(new URL('../skills/opm-standard-review/SKILL.md', import.meta.url), 'utf8');
export const reviewRules = JSON.parse(await readFile(new URL('../skills/opm-standard-review/references/rules.json', import.meta.url), 'utf8'));
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const planDigest = proposal => digest({ baseToken: proposal.baseToken, scope: proposal.scope, command: proposal.command });
const text = { type: 'string', minLength: 1, maxLength: 1600 };
const ids = reviewRules.rules.map(rule => rule.rule_id);
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const reviewSchema = object({
  snapshot_digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  checks: { type: 'array', minItems: ids.length, maxItems: ids.length, items: object({ rule_id: { enum: ids }, result: { enum: ['PASS', 'ISSUE', 'NOT_APPLICABLE', 'NEEDS_INPUT'] }, explanation: text }) },
  issues: { type: 'array', maxItems: 100, items: object({ rule_id: { enum: ids }, basis: { enum: ['STANDARD', 'USER_REQUIREMENT'] }, severity: { enum: ['ERROR', 'WARNING'] }, context_id: text,
    target_ids: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: text }, message: text, suggestion: text }) },
  assumptions: { type: 'array', maxItems: 20, items: text },
});
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(reviewSchema);

/** 依据固定审查快照校验报告，条款出处由服务端规则目录赋值。 */
export function bindReview(input, snapshot, proposal) {
  check(validate(input), 'REVIEW_INVALID', '标准审查报告不符合结构约定。');
  check(input.snapshot_digest === digest(snapshot), 'REVIEW_STALE', '标准审查快照已改变。');
  check(new Set(input.checks.map(item => item.rule_id)).size === ids.length, 'REVIEW_INCOMPLETE', '标准审查遗漏或重复检查项。');
  const references = ruleId => { const rule = reviewRules.rules.find(item => item.rule_id === ruleId); return { clauses: rule.clauses, pdf_pages: rule.pdf_pages }; };
  for (const issue of input.issues) {
    const graph = snapshot.projections.find(item => item.context_id === issue.context_id);
    check(graph && issue.target_ids.every(target => target === issue.context_id || graph.constructs.some(item => item.target_id === target || item.occurrence_id === target)), 'REVIEW_INVALID', '审查问题引用了快照外的图元。');
    check(input.checks.find(item => item.rule_id === issue.rule_id)?.result === 'ISSUE', 'REVIEW_INVALID', '审查问题与检查结论不一致。');
  }
  for (const item of input.checks) if (item.result === 'ISSUE') check(input.issues.some(issue => issue.rule_id === item.rule_id), 'REVIEW_INVALID', '审查缺少具体问题。');
  return { skill_version: reviewRules.skill_version, standard_version: reviewRules.standard_version, coverage: reviewRules.coverage,
    source_digest: reviewRules.source.sha256, plan_digest: planDigest(proposal), snapshot_digest: input.snapshot_digest,
    checked_at: new Date().toISOString(), checks: input.checks.map(item => ({ ...item, ...references(item.rule_id) })),
    issues: input.issues.map(item => ({ ...item, ...(item.basis === 'USER_REQUIREMENT' ? { clauses: [], pdf_pages: [] } : references(item.rule_id)) })), assumptions: input.assumptions };
}
export const reviewBlocked = report => report.issues.some(item => item.severity === 'ERROR');
