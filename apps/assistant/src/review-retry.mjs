import { check, id, sameToken } from './store.mjs';
import { brief, safeMessage } from './messages.mjs';
import { reviewDiagnostics } from './review-diagnostics.mjs';
import { autoApplyPlan } from './proposal-application.mjs';

/** 复用未提交方案重新校验，完成后沿用请求的提交方式。 */
export async function retryReview(service, key, scope, proposalId, session, token, autoApply = false) {
  const current = await service.scoped(key, scope);
  const proposal = current.proposals.find(item => item.id === proposalId);
  check(proposal && proposal.contextId === scope.contextId, 'NOT_FOUND', '当前图没有该方案。', 404);
  check(proposal.command.command_type === 'APPLY_MODEL_PLAN' && ['blocked', 'ready'].includes(proposal.status), 'PROPOSAL_STATE', '只有未提交的整图方案可重新审查。', 409);
  check(!service.tasks.has(scope.projectId), 'PROJECT_BUSY', '项目已有助手正在生成。', 409);
  const task = { key, scope, session, runId: id(), active: true, autoApply: autoApply || proposal.autoApply, selectedIds: [], capabilities: new Map(),
    previousDiagnostics: reviewDiagnostics(proposal, current.run),
    text: proposal.reviewRequest ?? proposal.summary, analysisSource: structuredClone(proposal.analysisSource),
    analysisRepairBaseline: structuredClone(proposal.analysisRepairBaseline),
    plan: { proposalId, commandId: proposal.commandId, requestId: proposal.requestId,
      steps: structuredClone(proposal.command.payload.steps), preview: proposal.previewData } };
  service.tasks.set(scope.projectId, task);
  let value;
  try {
    task.snapshot = await service.runtime(session).snapshot(scope);
    check(token && sameToken(token, task.snapshot.token) && sameToken(proposal.baseToken, task.snapshot.token), 'DRAFT_CONFLICT', '模型已改变，请重新生成方案。', 409);
    if (proposal.analysisSource) {
      const analysis = await service.runtime(session).query(scope, 'mindmap', { action: 'OPEN', draft_token: task.snapshot.token });
      check(analysis.document.id === proposal.analysisSource.mindmap_id && analysis.document.revision === proposal.analysisSource.revision
        && analysis.digest === proposal.analysisSource.digest, 'DRAFT_CONFLICT', '脑图已改变，请重新生成方案。', 409);
      task.analysisDocument = analysis.document; task.analysisRequest = task.text;
    }
    value = await service.store.update(key, next => {
      check(task.active, 'RUN_STOPPED', '重新审查已停止。');
      const item = next.proposals.find(p => p.id === proposalId);
      check(['blocked', 'ready'].includes(item.status), 'PROPOSAL_STATE', '方案状态已改变。', 409);
      item.status = 'staging'; item.reason = ''; delete item.failureCode;
      if (task.autoApply) item.autoApply = true;
      next.run = { id: task.runId, status: 'running', message: '正在重新审查保留的预览…' };
    });
  } catch (error) { if (service.tasks.get(scope.projectId) === task) service.tasks.delete(scope.projectId); throw error; }
  task.completion = (async () => {
    try {
      task.factoryPromise = service.harnesses.has(scope.projectId) ? Promise.resolve(service.harnesses.get(scope.projectId)) : service.factory(service.config, scope.projectId);
      const harness = await task.factoryPromise;
      if (!task.active) { await harness.close(); return; }
      service.harnesses.set(scope.projectId, harness);
      await service.finalizePlan(task, harness);
      if (task.autoApply) await autoApplyPlan(service, task);
      await service.store.update(key, next => {
        check(task.active && !task.stageError && next.run?.id === task.runId, 'RUN_STOPPED', '重新审查已停止。');
        if (!task.autoApply) next.proposals.find(p => p.id === proposalId).status = 'ready';
        next.run = { id: task.runId, status: 'completed', message: task.autoApply ? '重新审查通过，生成结果已保存。' : '重新审查已完成，请查看画布后确认。' };
      });
    } catch (error) {
      if (task.active) await service.store.update(key, next => {
        if (next.run?.id !== task.runId) return;
        next.run = { id: task.runId, status: 'failed', code: error.code, message: safeMessage(error) };
        const item = next.proposals.find(p => p.id === proposalId);
        if (['staging', 'ready'].includes(item.status)) { item.status = 'blocked'; item.reason = safeMessage(error); item.failureCode = error.code; }
      });
    } finally { if (!task.stopping && service.tasks.get(scope.projectId) === task) service.tasks.delete(scope.projectId); }
  })();
  return brief(value);
}
