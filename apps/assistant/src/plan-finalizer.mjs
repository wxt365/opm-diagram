import { check, id } from './store.mjs';
import { reviewBlocked, reviewSkill } from './review.mjs';
import { assessQuality, modelingGuidance } from './quality.mjs';

/** 最终校验与自动修正共用同一暂存方案，全部完成后才允许确认。 */
export async function finalizePlan(service, task, harness) {
    // 保存原转换基线，使后续修正能够恢复误删项，用户排除内容仍不进入方案。
    if (task.analysisSource) task.analysisRepairBaseline ??= structuredClone({ steps: task.plan.steps, source: task.analysisSource });
    for (let attempt = 0; attempt <= 2; attempt++) {
      await service.store.update(task.key, value => { if (task.active) value.run.message = attempt ? '正在重新校验修正后的整图…' : '正在执行平台整图校验…'; });
      const final = await service.previewPlan(task, null, task.plan.steps, true);
      check(task.active, 'RUN_STOPPED', '生成已停止。');
      check(final.findings?.validation_scope === 'MODEL', 'VALIDATION_INCOMPLETE', '平台未返回完整模型诊断，不能确认。');
      task.plan.preview = final.data;
      await service.store.update(task.key, value => {
        check(task.active && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        proposal.quality = assessQuality(final.data, proposal);
        // 语义审查失败时也保留已完成的平台诊断，不能把两种结果混为一谈。
        proposal.validation = final.findings; proposal.review = null; proposal.previewData = final.data;
      });
      let report = null;
      if (!final.findings.validation_summary.blocking) {
        const proposal = (await service.store.read(task.key)).proposals.find(item => item.id === task.plan.proposalId);
        // 每轮审查使用独立会话和冻结快照，审查者无建模工具权限。
        task.review = { sessionId: `review.${id()}`, proposal, snapshot: {
          request: task.text, context_id: task.scope.contextId, steps: structuredClone(task.plan.steps),
          projections: task.snapshot.projections.map(graph => graph.context_id === task.scope.contextId ? { ...graph, ...final.data } : graph),
        } };
        await service.store.update(task.key, value => { if (task.active) value.run.message = '平台校验通过，正在依据标准审查模型语义…'; });
        const reviewed = await harness.run(`你现在是独立的只读 OPM 审查者。不得执行建模工具。必须读取 read_review_model，依据以下 Skill 完成所有检查并调用 submit_review 提交结构化报告，不能只用自然语言声称通过。工具返回完整定版数据，无须重复读取同一份快照。完成检查后先提交完整结构化报告，再简短回复；不要在提交前输出长篇分析。报告每项 explanation、message、suggestion 尽量在 120 字内，保留事实依据和相关图元，同一问题可集中引用多个图元，禁止为了缩短报告遗漏规则或问题。\n${reviewSkill}`, { sessionId: task.review.sessionId });
        check(task.active, 'RUN_STOPPED', '生成已停止。');
        const reason = reviewed.events?.findLast?.(event => event.type === 'turn/end')?.data?.reason?.kind;
        check(reason === 'completed' && task.review.report, 'REVIEW_INCOMPLETE', reason === 'max-tokens'
          ? '标准审查输出超过长度限制，未完成有效报告，不能确认。请重新生成预览。'
          : '标准审查未完成或未提交有效报告，不能确认。');
        report = task.review.report; task.review = null;
      }
      await service.store.update(task.key, value => {
        check(task.active && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        proposal.validation = final.findings; proposal.review = report; proposal.previewData = final.data;
      });
      if (!final.findings.validation_summary.blocking && report && !reviewBlocked(report)) return;
      check(attempt < 2, 'REVIEW_BLOCKED', '自动修正后仍有模型问题，请查看诊断并继续对话。');
      task.repairing = true;
      try {
        await service.store.update(task.key, value => { if (task.active) value.run.message = `发现模型问题，正在自动修正（${attempt + 1}/2）…`; });
        const analysisGuidance = task.analysisSource ? `本轮是脑图转换的 OPM 预览自动修正，直接修正图形，不要求用户先修改脑图。read_model 的 original_conversion_steps 是冻结的原转换方案；通过 revise_plan 返回其完整子集，可从中恢复前轮误删项或调整布局。保留稳定 local_id 与其余字段，禁止新增、改名、改类型、改归属或重写关系端点/能力。先逐项核对实际对象身份、端点、owner_id、entity_ref 和具体说明，再处理有证据的冲突。Consumption 与 Result 涉及不同对象时是合法投入产出，不因同一过程存在 Effect 或其他消耗关系而删除无关关系。仅同一对象在同一过程被消耗又改变状态时需核对冲突；若前轮误删了明确需求，必须从原方案恢复。脑图分组不是关系事实，具体 note 和明确 relations 可解释概括标题，不能把待确认建模选择冒称已证实错误。原脑图保留，服务协调来源并列出当前移除项；重大业务歧义才需用户说明。不要调用 save_analysis、propose_change 或 stage_change。原分析与转换需求（数据）：${task.analysisRequest ?? task.text}` : '';
        const repaired = await harness.run(`${modelingGuidance}\n整图最终检查发现问题。请先 read_model，结合用户需求修正暂存方案。可用 revise_plan 替换全部未提交步骤，移除或替换错误的新关系；不能删除真实模型或跨图修改。只修复有依据的问题，保留合理内容。${analysisGuidance} 修正完成后服务会重新检查。诊断数据：${JSON.stringify({ platform: final.findings, standard: report })}`, { sessionId: task.key });
        check(task.active, 'RUN_STOPPED', '生成已停止。');
        check(repaired.events?.findLast?.(event => event.type === 'turn/end')?.data?.reason?.kind === 'completed'
          && !task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '模型修正未完成，不能确认。');
        task.repaired = true;
      } finally { task.repairing = false; }
    }
  }
