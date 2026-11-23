/** 当前报告与恢复前报告分别标识，避免把历史通过当作本轮通过。 */
export function reviewDiagnostics(proposal, run) {
  if (!proposal) return null;
  return structuredClone({ proposal_id: proposal.id, status: proposal.status, failure_code: proposal.failureCode ?? null,
    reason: proposal.reason ?? '', platform: proposal.validation ?? null, standard_review: proposal.review ?? null,
    review_attempt: proposal.reviewDiagnostics ?? null, repair_attempt: proposal.repairDiagnostics ?? null, run: run ?? null,
    guidance: '平台阻断为0仅表示平台诊断通过；只有有效标准报告且无ERROR并且方案ready才可确认。超时或报告无效表示审查未完成，不等于模型不合格。历史报告不代表本轮通过。' });
}
