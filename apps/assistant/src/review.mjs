import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { check } from './store.mjs';
import { reviewReferenceCatalog } from './review-scope.mjs';

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
  check(validate(input), 'REVIEW_INVALID', `标准审查报告不符合结构约定：${validate.errors?.slice(0, 6).map(error =>
    `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params)}`).join('；')}。assumptions 无假设时也须传 []，不得增加 schema 外的字段。`);
  check(input.snapshot_digest === digest(snapshot), 'REVIEW_STALE', '标准审查快照已改变。');
  check(new Set(input.checks.map(item => item.rule_id)).size === ids.length, 'REVIEW_INCOMPLETE', '标准审查遗漏或重复检查项。');
  check(snapshot.opl != null || input.checks.find(item => item.rule_id === 'OPM-OPL')?.result === 'NEEDS_INPUT',
    'REVIEW_INVALID', '快照没有平台 OPL，OPM-OPL 必须为 NEEDS_INPUT，不能声称已核对图文一致性。');
  input = structuredClone(input);
  const catalog = reviewReferenceCatalog(snapshot);
  const aliases = new Map(catalog.map(entry => [entry.ref, entry]));
  const references = ruleId => { const rule = reviewRules.rules.find(item => item.rule_id === ruleId); return { clauses: rule.clauses, pdf_pages: rule.pdf_pages }; };
  for (const issue of input.issues) {
    issue.target_ids = issue.target_ids.map(target => {
      const entry = aliases.get(target);
      check(!entry || entry.context_id === issue.context_id, 'REVIEW_INVALID',
        `短引用 ${target} 属于 ${entry?.context_id}，不属于问题图 ${issue.context_id}。跨图问题应按所属图分别引用。`);
      return entry?.target_id ?? target;
    });
    check(new Set(issue.target_ids).size === issue.target_ids.length, 'REVIEW_INVALID', '问题图元身份重复，请勿同时引用同一图元的短引用和完整身份。');
    const graph = snapshot.projections.find(item => item.context_id === issue.context_id);
    const invalid = issue.target_ids.filter(target => target !== issue.context_id && !graph?.constructs.some(item => item.target_id === target || item.occurrence_id === target));
    check(graph && !invalid.length, 'REVIEW_INVALID', `审查问题引用无效：图 ${issue.context_id}，引用 ${invalid.join('、')}。` +
      (graph ? invalid.map(target => { const owners = catalog.filter(entry => entry.target_id === target || entry.occurrence_id === target); return owners.length ? `${target} 的所属图：${[...new Set(owners.map(entry => entry.context_id))].join('、')}。` : `${target} 在审查快照中不存在。`; }).join('')
        : `可用图：${snapshot.projections.map(item => item.context_id).join('、')}。`) +
      `请使用该图 reference_catalog 的精确短引用：${catalog.filter(entry => entry.context_id === issue.context_id).slice(0, 10).map(entry => `${entry.ref}=${entry.label ?? entry.target_id}`).join('；')}。不得截断身份或把其他图的图元填入本图。`);
    const checkIndex = input.checks.findIndex(item => item.rule_id === issue.rule_id), issueIndex = input.issues.indexOf(issue);
    check(input.checks[checkIndex]?.result === 'ISSUE', 'REVIEW_INVALID',
      `审查问题与检查结论不一致：规则 ${issue.rule_id}，/issues/${issueIndex}/rule_id 已列出问题，但 /checks/${checkIndex}/result 为 ${input.checks[checkIndex]?.result}。若问题成立，将该规则 result 改为 ISSUE；若不成立，移除对应问题并按证据填写结论。不得只为通过校验删除真实问题。`);
  }
  for (const [index, item] of input.checks.entries()) if (item.result === 'ISSUE') check(input.issues.some(issue => issue.rule_id === item.rule_id), 'REVIEW_INVALID',
    `审查缺少具体问题：规则 ${item.rule_id}，/checks/${index}/result 为 ISSUE，但 /issues 无对应 rule_id。请补齐有证据的问题，或依据证据修正检查结论。`);
  const scope = snapshot.review_scope;
  if (scope) {
    const changed = new Set(scope.changed_target_ids);
    const hasCurrentConflict = input.issues.some(issue => issue.rule_id === 'OPM-CONTEXT' && issue.context_id === scope.current_context_id
      && issue.target_ids.some(target => changed.has(target)));
    for (const issue of input.issues) if (!(scope.fully_reviewed_context_ids ?? [scope.current_context_id]).includes(issue.context_id)
      && !issue.target_ids.some(target => changed.has(target)) && !(issue.rule_id === 'OPM-CONTEXT' && hasCurrentConflict)) {
      issue.severity = 'WARNING'; issue.historical = true;
    }
  }
  return { skill_version: reviewRules.skill_version, standard_version: reviewRules.standard_version, coverage: reviewRules.coverage,
    source_digest: reviewRules.source.sha256, plan_digest: planDigest(proposal), snapshot_digest: input.snapshot_digest,
    checked_at: new Date().toISOString(), checks: input.checks.map(item => ({ ...item, ...references(item.rule_id) })),
    issues: input.issues.map(item => ({ ...item, ...(item.basis === 'USER_REQUIREMENT' ? { clauses: [], pdf_pages: [] } : references(item.rule_id)) })), assumptions: input.assumptions,
    ...(scope ? { review_scope: scope } : {}) };
}
export const reviewBlocked = report => report.issues.some(item => item.severity === 'ERROR');
