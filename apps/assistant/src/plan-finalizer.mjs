import { check, id, sameToken } from './store.mjs';
import { reviewBlocked, reviewSkill } from './review.mjs';
import { assessQuality, modelingGuidance } from './quality.mjs';
import { scopedReviewSnapshot } from './review-scope.mjs';
import { runStage, reviewTimeoutMs, reviewWorkload } from './stage-runner.mjs';

/** 最终校验与自动修正共用同一暂存方案，全部完成后才允许确认。 */
export async function finalizePlan(service, task, harness) {
    // 保存原转换基线，使后续修正能够恢复误删项，用户排除内容仍不进入方案。
    if (task.analysisSource) task.analysisRepairBaseline ??= structuredClone({ steps: task.plan.steps, source: task.analysisSource });
    await service.store.update(task.key, value => {
      check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '本阶段已停止。');
      const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
      proposal.reviewRequest = task.reviewRequest ?? task.text;
      if (task.analysisRepairBaseline) proposal.analysisRepairBaseline = structuredClone(task.analysisRepairBaseline);
    });
    for (let attempt = 0; attempt <= 2; attempt++) {
      await service.store.update(task.key, value => { if (task.active) value.run.message = attempt ? '正在重新校验修正后的整图…' : '正在执行平台整图校验…'; });
      const final = await service.previewPlan(task, null, task.plan.steps, true);
      check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
      check(final.meta?.context_id === task.scope.contextId && final.data?.context_id === task.scope.contextId
        && sameToken(final.meta?.draft_token, task.snapshot.token),
        'DRAFT_CONFLICT', '最终预览与审查模型版本或 OPD 不一致，请重新生成。', 409);
      check(final.findings?.validation_scope === 'MODEL', 'VALIDATION_INCOMPLETE', '平台未返回完整模型诊断，不能确认。');
      task.plan.preview = final.data; task.plan.affectedViews = final.affected_views;
      await service.store.update(task.key, value => {
        check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        proposal.quality = assessQuality(final.data, proposal);
        // 语义审查失败时也保留已完成的平台诊断，不能把两种结果混为一谈。
        proposal.validation = final.findings; proposal.review = null; proposal.previewData = final.data;
      });
      let report = null;
      if (!final.findings.validation_summary.blocking) {
        const proposal = (await service.store.read(task.key)).proposals.find(item => item.id === task.plan.proposalId);
        // 每轮审查使用独立会话和冻结快照，审查者无建模工具权限。
        task.review = { sessionId: `review.${id()}`, proposal, snapshot: scopedReviewSnapshot(task, final.data, final.text, final.affected_views) };
        const reportSubmitted = new Promise(resolve => { task.review.complete = () => resolve({ events: [] }); });
        await service.store.update(task.key, value => {
          if (task.active) {
            value.run.message = `平台当前规则无阻断，正在审查本图及 ${task.review.snapshot.review_scope.related_context_ids.length} 张关联图的一致性…`;
            value.proposals.find(item => item.id === task.plan.proposalId).reviewDiagnostics = {
              state: 'running', timeout_ms: reviewTimeoutMs(service.config, task), workload: reviewWorkload(task), started_at: new Date().toISOString(), invalid_submissions: 0, last_report_error: null };
          }
        });
        const reviewed = await runStage(service, task, harness, 'review', () => Promise.race([
          harness.run(`本轮执行独立只读审查。\n${reviewSkill}`, { sessionId: task.review.sessionId }), reportSubmitted,
        ]));
        check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
        const reason = reviewed.events?.findLast?.(event => event.type === 'turn/end')?.data?.reason?.kind;
        check(task.review.report, 'REVIEW_INCOMPLETE', reason === 'max-tokens'
          ? '标准审查输出超过长度限制，未完成有效报告，不能确认。可保留预览重新审查。'
          : '标准审查未完成或未提交有效报告，不能确认。');
        report = task.review.report; task.repairSnapshot = task.review.snapshot; task.review = null;
      }
      await service.store.update(task.key, value => {
        check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        proposal.validation = final.findings; proposal.review = report; proposal.previewData = final.data;
        if (final.affected_views) proposal.previewViews = final.affected_views;
        if (report && proposal.reviewDiagnostics) proposal.reviewDiagnostics.state = 'completed';
      });
      if (!final.findings.validation_summary.blocking && report && !reviewBlocked(report)) return;
      check(attempt < 2, 'REVIEW_BLOCKED', '自动修正后仍有模型问题，请查看诊断并继续对话。');
      task.repairing = true;
      task.repairSessionId = `repair.${id()}`;
      task.repairClosed = false; task.repairChanged = false;
      const repairSubmitted = new Promise(resolve => { task.completeRepair = () => resolve({ events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] }); });
      try {
        await service.store.update(task.key, value => { if (task.active) {
          value.run.message = `发现模型问题，正在自动修正（${attempt + 1}/2）…`;
          value.proposals.find(item => item.id === task.plan.proposalId).repairDiagnostics = { state: 'running', attempt: attempt + 1,
            started_at: new Date().toISOString(), previous_validation: final.findings, previous_review: report,
            accepted_changes: 0, last_tool: null, last_activity_at: null };
        } });
        const analysisGuidance = task.analysisSource ? `本轮是脑图转换的 OPM 预览自动修正，直接修正图形，不要求用户先修改脑图。read_model 的 original_conversion_steps 是冻结的原转换方案；通过 revise_plan 返回其完整子集，可从中恢复前轮误删项或调整布局。保留稳定 local_id 与其余字段，禁止新增、改名、改类型、改归属或重写关系端点/能力。先逐项核对实际对象身份、端点、owner_id、entity_ref 和具体说明，再处理有证据的冲突。Consumption 与 Result 涉及不同对象时是合法投入产出，不因同一过程存在 Effect 或其他消耗关系而删除无关关系。仅同一对象在同一过程被消耗又改变状态时需核对冲突；若前轮误删了明确需求，必须从原方案恢复。脑图分组不是关系事实，具体 note 和明确 relations 可解释概括标题，不能把待确认建模选择冒称已证实错误。原脑图保留，服务协调来源并列出当前移除项；重大业务歧义才需用户说明。不要调用 save_analysis、propose_change 或 stage_change。原分析与转换需求（数据）：${task.analysisRequest ?? task.text}` : '';
        const repaired = await runStage(service, task, harness, 'repair', () => Promise.race([
          harness.run(`${modelingGuidance}\n本轮根据最终诊断修正暂存方案，使用 revise_plan。${analysisGuidance} 完整修正版暂存成功且无失败步骤后必须调用 finish_repair，服务立即重新诊断审查；预览更新或文字回复不等于提交修正完成。不能执行的语义范围问题明确说明，不循环同一无效操作。诊断数据：${JSON.stringify({ platform: final.findings, standard: report })}`, { sessionId: task.repairSessionId }), repairSubmitted,
        ]));
        check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
        check(repaired.events?.findLast?.(event => event.type === 'turn/end')?.data?.reason?.kind === 'completed'
          && !task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '模型修正未完成，不能确认。');
        task.repaired = true;
        await service.store.update(task.key, value => {
          if (task.active && value.run?.id === task.runId) value.proposals.find(item => item.id === task.plan.proposalId).repairDiagnostics.state = 'completed';
        });
      } finally { task.repairing = false; task.repairClosed = true; task.completeRepair = null; }
    }
  }
