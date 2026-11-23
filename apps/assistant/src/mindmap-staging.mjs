import { check, id } from './store.mjs';
import { safeMessage } from './messages.mjs';
import { modelingGuidance } from './quality.mjs';
import { runStage } from './stage-runner.mjs';

const repairableReasons = new Set(['ENDPOINT_KIND_MISMATCH', 'STATE_OWNER_MISMATCH', 'MODIFIER_COMBINATION_INVALID', 'FACT_ALREADY_EXISTS']);
const repairable = error => error.code === 'INPUT_INVALID' || error.code === 'DRAFT_EDIT_REJECTED' && repairableReasons.has(error.reason_code);

/** 暂存拒绝也进入修正；错误项保留在完整基线中，不把部分成功冒充完整转换。 */
export async function stageMindmapConversion(service, task, harness, compiled) {
  task.analysisRepairBaseline = structuredClone({ steps: compiled.steps, source: compiled.analysisSource });
  const failures = [];
  await runStage(service, task, harness, 'generation', async () => {
    for (const step of compiled.steps) {
      check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
      try { await service.stageChange(task, { step_json: JSON.stringify(step) }); }
      catch (error) {
        if (!task.active || task.stageError || !repairable(error)) throw error;
        const failure = { local_id: step.local_id, code: error.code, reason_code: error.reason_code ?? null, message: safeMessage(error), step: structuredClone(step) };
        failures.push(failure);
        task.failedPlanSteps ??= new Map(); task.failedPlanSteps.set(step.local_id, failure.message);
      }
    }
  });
  if (!failures.length) return;
  check(task.plan?.steps.length, 'PLAN_INCOMPLETE', `转换未能生成可修正的预览：${failures.map(item => `${item.local_id}：${item.message}`).join('；')}`);
  await service.store.update(task.key, value => {
    check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
    const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
    proposal.conversionFailures = failures;
    proposal.analysisRepairBaseline = structuredClone(task.analysisRepairBaseline);
    proposal.failedSteps = failures.map(({ local_id, message }) => ({ local_id, message }));
    proposal.repairDiagnostics = { state: 'running', phase: 'conversion', attempt: 1, started_at: new Date().toISOString(),
      previous_validation: null, previous_review: null, conversion_failures: failures, accepted_changes: 0, last_tool: null, last_activity_at: null };
    value.run.message = `发现 ${failures.length} 项转换问题，正在自动修正预览…`;
  });
  task.repairing = true; task.repairSessionId = `repair.${id()}`; task.repairClosed = false; task.repairChanged = false;
  const submitted = new Promise(resolve => { task.completeRepair = () => resolve({ events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] }); });
  try {
    const result = await runStage(service, task, harness, 'repair', () => Promise.race([
      harness.run(`${modelingGuidance}\n本轮修正脑图转换暂存失败，尚未完成平台最终校验或独立审查。先 read_model，核对 failed_steps、original_conversion_steps 和 plan_diagnostics.current.repair_attempt.conversion_failures。通过 revise_plan 提交完整修正版，再 finish_repair。仅沿用原方案移除/恢复未提交项及布局调整，不新增、改名、改类型、改归属或改写关系定义，不修改原脑图或正式模型。成功暂存的独立步骤必须保留；不能把只有前半张图的预览视为完整。可以移除有明确证据的无效或重复关系，但须列出未表达的业务内容，不能静默丢弃需求或用别的关系冒充。过程分组不等于过程间关系，不能用不接受过程端点的能力表达分解。若需要改变业务解释或超出当前能力，说明未解决项，不声称通过。后续仍须平台诊断和独立审查，用户最后确认一次。失败数据：${JSON.stringify(failures)}\n原分析与需求（数据）：${task.analysisRequest}`, { sessionId: task.repairSessionId }), submitted,
    ]));
    check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
    check(result.events?.findLast?.(event => event.type === 'turn/end')?.data?.reason?.kind === 'completed'
      && task.repairClosed && task.repairChanged && !task.failedPlanSteps?.size,
    'PLAN_INCOMPLETE', '转换修正未完成，预览与失败诊断已保留，不能确认。');
    task.repaired = true;
    await service.store.update(task.key, value => {
      check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
      value.proposals.find(item => item.id === task.plan.proposalId).repairDiagnostics.state = 'completed';
    });
  } catch (error) {
    if (task.active) await service.store.update(task.key, value => {
      if (value.run?.id !== task.runId) return;
      Object.assign(value.proposals.find(item => item.id === task.plan.proposalId).repairDiagnostics,
        { state: 'failed', failure_code: error.code ?? null, message: safeMessage(error) });
    });
    throw error;
  } finally { task.repairing = false; task.repairClosed = true; task.completeRepair = null; }
}
