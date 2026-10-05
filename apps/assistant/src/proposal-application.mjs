import { AssistantError, check, sameToken } from './store.mjs';
import { affectedContexts } from './runtime.mjs';
import { planDigest, reviewBlocked, reviewRules } from './review.mjs';
import { brief, safeMessage } from './messages.mjs';

/** 同一 command_id 的未知结果先查回执；提交队列由服务唯一持有。 */
export async function recoverProposal(service, value, proposal, session) {
    const receipt = await service.runtime(session).query(value, 'receipts', { operation: 'EDIT', idempotency_id: proposal.commandId });
    if (receipt.status === 'FOUND') return service.store.update(value.id, next => {
      const p = next.proposals.find(x => x.id === proposal.id); p.status = 'applied'; p.result = receipt.result;
    });
    return null;
  }

export async function applyProposal(service, key, scope, proposalId, session, expectedToken) {
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
    check(value.run?.status !== 'running', 'RUN_BUSY', '请等待本轮生成完成后应用。', 409);
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
    check(affectedContexts(snapshot, p.contextId, p.command).length === 1, 'CROSS_OPD_BLOCKED', '修改影响其他 OPD，不能应用。', 409);
    const capabilities = await runtime.query(executionScope, 'capabilities', { draft_token: p.baseToken, scope: p.scope });
    if (p.command.command_type === 'APPLY_MODEL_PLAN') {
      const option = capabilities.data.options.find(x => x.enabled); check(option, 'CAPABILITY_INVALID', '整体方案能力不可用。', 409);
      p.authorization = { capability_query_id: option.capability_query_id, selected_option_id: option.option_id };
    }
    check(capabilities.data.options.some(x => x.option_id === p.authorization.selected_option_id && x.enabled), 'CAPABILITY_INVALID', '修改能力已失效。', 409);
    await service.store.update(key, next => {
      const current = next.proposals.find(x => x.id === proposalId);
      check(['ready', 'pending'].includes(current.status) && next.run?.status !== 'running', 'PROPOSAL_STATE', '提案已取消或正在生成，请重新核对。', 409);
      current.status = 'pending';
      current.authorization = p.authorization;
    });
    try {
      const result = await runtime.query(executionScope, 'commands', { request_id: p.requestId, command_id: p.commandId, expected_draft_token: p.baseToken,
        scope: p.scope, authorization: p.authorization, command: p.command, ...(p.analysisSource ? { analysis_source: p.analysisSource } : {}) });
      value = await service.store.update(key, next => { const proposal = next.proposals.find(x => x.id === proposalId); proposal.status = 'applied'; proposal.result = result; });
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
