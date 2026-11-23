import { AssistantError } from './store.mjs';
import { safeMessage } from './messages.mjs';

export function reviewWorkload(task) {
  const projections = (task.review?.snapshot ?? task.repairSnapshot)?.projections;
  if (!projections?.length) return { source: 'plan_steps', step_count: task.plan?.steps.length ?? 0, graph_count: 0, construct_count: 0 };
  // 跨图同一语义身份在不同上下文需要分别核对，因此按出现次数计数。
  return { source: 'review_snapshot', step_count: task.plan?.steps.length ?? 0, graph_count: projections.length,
    construct_count: projections.reduce((sum, graph) => sum + (graph.constructs?.length ?? 0), 0) };
}

export function reviewTimeoutMs(config, task) {
  if (config.reviewTimeoutMs != null) return config.reviewTimeoutMs;
  const workload = reviewWorkload(task);
  return workload.source === 'review_snapshot'
    ? Math.min(600000, 120000 + Math.max(0, workload.graph_count - 1) * 60000 + Math.max(0, workload.construct_count - 30) * 1500)
    : Math.min(300000, 120000 + Math.max(0, workload.step_count - 30) * 2000);
}

/** 阶段单独计时；自动失败保留预览，人工停止由 stop 处理取消。 */
export function repairTimeoutMs(config, task) {
  return config.repairTimeoutMs ?? Math.max(180000, reviewTimeoutMs({}, task));
}

export async function runStage(service, task, harness, phase, operation) {
  const review = phase === 'review';
  const timeout = review ? reviewTimeoutMs(service.config, task) : phase === 'repair' ? repairTimeoutMs(service.config, task) : (service.config.generationTimeoutMs ?? 600000);
  const label = review ? '语义审查' : phase === 'repair' ? '方案修正' : '图形生成';
  task.phase = phase;
  let rejectStage;
  const aborted = new Promise((_, reject) => { rejectStage = reject; });
  task.abortStage = rejectStage;
  let idleTimer;
  const idleMs = service.config.generationIdleTimeoutMs ?? 180000;
  let lastSteps = JSON.stringify(task.plan?.steps ?? []);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => rejectStage(new AssistantError('GENERATION_TIMEOUT', `图形生成连续 ${Math.ceil(idleMs / 1000)} 秒无有效暂存进展。未提交预览已保留，可继续生成。`, 504)), idleMs);
  };
  if (phase === 'generation') {
    resetIdle();
    task.recordGenerationProgress = () => {
      const steps = JSON.stringify(task.plan?.steps ?? []);
      if (!task.active || task.stageError || task.generationClosed || steps === lastSteps) return;
      lastSteps = steps; resetIdle();
    };
  }
  const timer = setTimeout(() => rejectStage(new AssistantError(review ? 'REVIEW_TIMEOUT' : phase === 'repair' ? 'REPAIR_TIMEOUT' : 'GENERATION_TIMEOUT',
    `${label}超时（${Math.ceil(timeout / 1000)} 秒）。未提交预览已保留，可重新审查或继续修改。`, 504)), timeout);
  try {
    return await Promise.race([Promise.resolve().then(operation), aborted]);
  } catch (error) {
    task.stageError = error;
    if (phase === 'repair' && task.active) await service.store.update(task.key, value => {
      if (value.run?.id !== task.runId) return;
      const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
      if (proposal?.repairDiagnostics) Object.assign(proposal.repairDiagnostics, { state: 'failed', failure_code: error.code ?? null, message: safeMessage(error) });
    });
    if (review && task.active) await service.store.update(task.key, value => {
      if (value.run?.id !== task.runId) return;
      const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
      if (proposal?.reviewDiagnostics) Object.assign(proposal.reviewDiagnostics, { state: 'failed', failure_code: error.code ?? null, message: safeMessage(error) });
    });
    if (task.active) {
      if (service.harnesses.get(task.scope.projectId) === harness) service.harnesses.delete(task.scope.projectId);
      // 关闭失败不能覆盖本次审查的原始失败原因。
      await Promise.resolve().then(() => harness?.close()).catch(() => {});
    }
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(idleTimer);
    if (phase === 'generation') task.recordGenerationProgress = null;
    if (task.abortStage === rejectStage) task.abortStage = null;
  }
}
