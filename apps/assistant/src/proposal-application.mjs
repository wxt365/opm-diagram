import { AssistantError, check, sameToken } from './store.mjs';
import { affectedContexts } from './runtime.mjs';
import { planDigest, reviewBlocked, reviewRules } from './review.mjs';
import { brief, safeMessage } from './messages.mjs';

function recordApplied(value, proposalId, result) {
  const proposal = value.proposals.find(item => item.id === proposalId);
  Object.assign(proposal, { status: 'applied', result });
  if (proposal.autoApply && proposal.runId === value.run?.id && ['failed', 'interrupted'].includes(value.run.status)) {
    value.run = { id: proposal.runId, status: 'completed', message: '生成结果已保存。' };
  }
}

/** 同一 command_id 的未知结果先查回执；提交队列由服务唯一持有。 */
export async function recoverProposal(service, value, proposal, session) {
    const receipt = await service.runtime(session).query(value, 'receipts', { operation: 'EDIT', idempotency_id: proposal.commandId });
    if (receipt.status === 'FOUND') return service.store.update(value.id, next => recordApplied(next, proposal.id, receipt.result));
    return null;
  }

export async function applyProposal(service, key, scope, proposalId, session, expectedToken, task) {
    let value = await service.scoped(key, scope), p = value.proposals.find(x => x.id === proposalId);
    check(p, 'NOT_FOUND', '提案不存在。', 404);
    if (p.status === 'applied') return brief(value);
    if (p.status === 'pending' && await service.recover(value, p, session)) return brief(await service.store.read(key));
    if (expectedToken && p.status === 'ready') check(sameToken(expectedToken, p.baseToken), 'DRAFT_CONFLICT', '提案与当前画布版本不一致。', 409);
    check(['ready', 'pending'].includes(p.status), 'PROPOSAL_STATE', p.reason || '提案不能应用。', 409);
    if (p.command.command_type === 'APPLY_MODEL_PLAN' && p.status === 'ready') check(p.review && !reviewBlocked(p.review)
      && p.review.plan_digest === planDigest(p) && p.review.skill_version === reviewRules.skill_version
      && p.review.source_digest === reviewRules.source.sha256 && p.validation?.validation_scope === 'MODEL'
      && p.validation?.validation_summary.blocking === 0,
      'REVIEW_REQUIRED', '方案尚未通过当前最终诊断和标准审查，请继续对话重新生成。', 409);
    const mayApply = run => task ? task.active && task.applying && run?.id === task.runId && run.status === 'running' : run?.status !== 'running';
    check(mayApply(value.run), 'RUN_BUSY', '请等待本轮生成完成后应用。', 409);
    const runtime = service.runtime(session), executionScope = { ...scope, contextId: p.contextId }, snapshot = await runtime.snapshot(executionScope);
    if (p.analysisSource) {
      const analysis = await runtime.query(executionScope, 'mindmap', { action: 'OPEN', draft_token: snapshot.token });
      check(analysis.document.id === p.analysisSource.mindmap_id && analysis.document.revision === p.analysisSource.revision && analysis.digest === p.analysisSource.digest,
        'DRAFT_CONFLICT', '脑图已变化，请重新生成 OPD。', 409);
    }
    if (!sameToken(snapshot.token, p.baseToken)) {
      await service.store.update(key, next => { const proposal = next.proposals.find(x => x.id === proposalId); proposal.status = 'stale'; proposal.reason = '模型已改变，请继续对话重新生成提案。'; });
      throw new AssistantError('DRAFT_CONFLICT', '模型已改变，请继续对话重新生成提案。', 409);
    }
    const reorganization = p.command.command_type === 'APPLY_MODEL_PLAN' && p.command.payload.steps.some(step => step.command_type === 'REORGANIZE_SUBGRAPH');
    check(reorganization || affectedContexts(snapshot, p.contextId, p.command).length === 1, 'CROSS_OPD_BLOCKED', '修改影响其他 OPD，不能应用。', 409);
    if (reorganization || p.previewViews?.length > 1) check(p.review?.review_scope?.mode === 'REORGANIZATION_ALL_AFFECTED'
      && p.previewViews?.length > 1 && p.previewViews.every(view => p.review.review_scope.fully_reviewed_context_ids?.includes(view.context_id)),
      'REVIEW_REQUIRED', '子图重组必须覆盖全部受影响图的审查。', 409);
    const capabilities = await runtime.query(executionScope, 'capabilities', { draft_token: p.baseToken, scope: p.scope });
    if (p.command.command_type === 'APPLY_MODEL_PLAN') {
      const option = capabilities.data.options.find(x => x.enabled); check(option, 'CAPABILITY_INVALID', '整体方案能力不可用。', 409);
      p.authorization = { capability_query_id: option.capability_query_id, selected_option_id: option.option_id };
    }
    check(capabilities.data.options.some(x => x.option_id === p.authorization.selected_option_id && x.enabled), 'CAPABILITY_INVALID', '修改能力已失效。', 409);
    await service.store.update(key, next => {
      const current = next.proposals.find(x => x.id === proposalId);
      check(['ready', 'pending'].includes(current.status) && mayApply(next.run), 'PROPOSAL_STATE', '提案已取消或正在生成，请重新核对。', 409);
      current.status = 'pending';
      current.authorization = p.authorization;
    });
    try {
      const result = await runtime.query(executionScope, 'commands', { request_id: p.requestId, command_id: p.commandId, expected_draft_token: p.baseToken,
        scope: p.scope, authorization: p.authorization, command: p.command, ...(p.analysisSource ? { analysis_source: p.analysisSource } : {}) });
      value = await service.store.update(key, next => recordApplied(next, proposalId, result));
      return brief(value);
    } catch (error) {
      if (await service.recover(value, p, session).catch(() => null)) return brief(await service.store.read(key));
      // 未知结果保留同一提交身份，下次应用先查回执。
      if (error instanceof AssistantError && error.status < 500) await service.store.update(key, next => {
        const proposal = next.proposals.find(x => x.id === proposalId); proposal.status = 'rejected'; proposal.reason = safeMessage(error);
      });
      throw error;
    }
  }

export async function autoApplyPlan(service, task) {
  check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
  task.applying = true;
  await service.store.update(task.key, value => {
    check(task.active && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
    const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
    check(proposal?.status === 'staging', 'PROPOSAL_STATE', '生成方案已改变。', 409);
    Object.assign(proposal, { status: 'ready', autoApply: true, runId: task.runId });
    Object.assign(value.run, { saving: true, message: '校验和审查已通过，正在保存到 OPD…' });
  });
  await service.apply(task.key, task.scope, task.plan.proposalId, task.session, task.snapshot.token, task);
}
