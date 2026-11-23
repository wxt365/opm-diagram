import { AssistantError, check, id, sameToken } from './store.mjs';
import { affectedContexts } from './runtime.mjs';
import { bindReview, digest, reviewRules, reviewSchema } from './review.mjs';
import { reviewReferenceCatalog } from './review-scope.mjs';
import { qualityPolicy } from './quality.mjs';
import { allowed, factFamily, payloadSchema, validateBoundCommand, validateCommand, validateRequest, ajv } from './commands.mjs';
import { safeMessage } from './messages.mjs';
import { analysisTool } from './mindmap-service.mjs';
import { reviewDiagnostics } from './review-diagnostics.mjs';
import { modelingContext } from './modeling-context.mjs';

async function verifyToolDraft(runtime, task) {
  check(sameToken((await runtime.open(task.scope)).draft_token, task.snapshot.token),
    'DRAFT_CONFLICT', '生成期间模型已改变，请重新提出需求。', 409);
  check(task.active && !task.stageError, 'RUN_STOPPED', '本次生成已停止。');
}

/** 工具入口共用生成任务和 Runtime 授权，独立审查保持只读。 */
export async function dispatchTool(service, sessionId, name, args) {
    const task = [...service.tasks.values()].find(x => (x.key === sessionId || x.repairSessionId === sessionId || (x.analysisOnly && `analysis.${x.key}` === sessionId) || x.review?.sessionId === sessionId) && x.active);
    check(task, 'RUN_STOPPED', '本次生成已结束或停止。', 409);
    check(!task.stageError && !task.review?.closed, 'RUN_STOPPED', '本阶段已经结束，迟到工具不能修改结果。', 409);
    check(!(task.generationClosed && sessionId === task.key), 'RUN_STOPPED', '生成阶段已提交完成，迟到工具不能修改方案。', 409);
    check(!(task.repairClosed && (sessionId === task.repairSessionId || (sessionId === task.key && !task.review))), 'RUN_STOPPED', '本次修正已结束，迟到工具不能修改方案。', 409);
    task.toolCount = (task.toolCount ?? 0) + 1;
    check(task.toolCount <= 160, 'TOOL_LIMIT', '本轮工具调用已达上限，请缩小需求后继续。');
    const runtime = service.runtime(task.session), scope = task.scope;
    if (task.analysisOnly) {
      const run = task.toolLane.then(async () => {
        check(task.active, 'RUN_STOPPED', '分析已停止。');
        try {
          await verifyToolDraft(runtime, task);
        } catch (error) {
          if (name === 'save_analysis' || name === 'apply_analysis_edits') task.analysisSaveError = error;
          throw error;
        }
        return analysisTool(service, task, name, args);
      });
      task.toolLane = run.catch(() => {});
      return run;
    }
    await verifyToolDraft(runtime, task);
    if (task.review?.sessionId === sessionId) {
      check(['read_review_model', 'submit_review'].includes(name), 'COMMAND_NOT_ALLOWED', '标准审查只允许读取和提交报告。');
      if (name === 'read_review_model') return { snapshot: task.review.snapshot, snapshot_digest: digest(task.review.snapshot), rules: reviewRules, report_schema: reviewSchema,
        reference_catalog: reviewReferenceCatalog(task.review.snapshot), submission_limit: 3,
        invalid_submissions: task.review.invalidSubmissions ?? 0, last_report_error: task.review.lastReportError ?? null,
        instructions: '本图逐项审查，CONSISTENCY 图仅核对相关跨图一致性，不能把未显示内容视为缺失。使用 reference_catalog 的 ref 短引用填 target_ids，context_id 必须使用同一目录项所属图。assumptions 必须存在，无假设传 []。issues 中每条规则必须在 checks 中为 ISSUE，每项 ISSUE 必须有对应具体问题；提交前自行核对。每个会话最多允许 3 次无效提交；last_report_error 提供上次失败字段与定向修正要求。' };
      try {
        check(typeof args.report_json === 'string' && args.report_json.length <= 128000, 'REVIEW_INVALID', '标准审查参数无效。');
        let report; try { report = JSON.parse(args.report_json); } catch { throw new AssistantError('REVIEW_INVALID', '标准审查报告须为合法 JSON。'); }
        const bound = bindReview(report, task.review.snapshot, task.review.proposal);
        check(task.active && !task.review.closed && !task.stageError, 'RUN_STOPPED', '本次审查已结束。');
        await service.store.update(task.key, value => {
          check(task.active && !task.stageError && !task.review.closed && value.run?.id === task.runId, 'RUN_STOPPED', '本次审查已结束。');
          const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
          check(proposal, 'PROPOSAL_STATE', '审查方案已失效。');
          proposal.review = bound;
          if (proposal.reviewDiagnostics) proposal.reviewDiagnostics.state = 'submitted';
        });
        check(task.active && !task.stageError && !task.review.closed, 'RUN_STOPPED', '本次审查已结束。');
        task.review.report = bound;
        task.review.closed = true;
        task.review.complete?.();
      } catch (error) {
        task.review.invalidSubmissions = (task.review.invalidSubmissions ?? 0) + 1;
        const message = `审查报告第 ${task.review.invalidSubmissions}/3 次无效：${safeMessage(error)}`;
        task.review.lastReportError = { code: error.code ?? 'REVIEW_INVALID', message: safeMessage(error) };
        await service.store.update(task.key, value => {
          if (!task.active || value.run?.id !== task.runId) return;
          value.run.message = message;
          const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
          if (proposal) {
            proposal.reviewDiagnostics ??= {};
            Object.assign(proposal.reviewDiagnostics, { state: 'invalid-report', invalid_submissions: task.review.invalidSubmissions,
              last_report_error: task.review.lastReportError });
          }
        });
        if (task.review.invalidSubmissions >= 3) {
          const failure = new AssistantError('REVIEW_RETRIES_EXHAUSTED', `审查报告连续 3 次无效，已停止本次审查并保留预览。最后错误：${safeMessage(error)}`);
          task.review.closed = true; task.abortStage?.(failure); throw failure;
        }
        throw error;
      }
      return { submitted: true, errors: task.review.report.issues.filter(item => item.severity === 'ERROR').length };
    }
    check(!task.review, 'COMMAND_NOT_ALLOWED', '独立审查期间不能修改方案。');
    check(!['read_analysis', 'save_analysis', 'apply_analysis_edits'].includes(name), 'COMMAND_NOT_ALLOWED', '建模会话不能修改分析资料。');
    await service.store.update(task.key, value => {
      if (task.active && value.run?.id === task.runId) value.run.message = name === 'propose_change' ? '正在准备修改提案…' : '正在查询模型和可用能力…';
      const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
      if (task.repairing && proposal?.repairDiagnostics) Object.assign(proposal.repairDiagnostics, { last_tool: name, last_activity_at: new Date().toISOString() });
    });
    if (name === 'finish_generation') {
      check(task.phase === 'generation' && !task.repairing && typeof task.completeGeneration === 'function', 'COMMAND_NOT_ALLOWED', 'finish_generation仅用于初始生成阶段。');
      check(task.plan?.steps.length && task.plan.preview && !task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '须完整暂存方案并修复失败步骤后才能完成生成。');
      await service.store.update(task.key, value => {
        check(task.active && !task.stageError && !task.generationClosed && value.run?.id === task.runId, 'RUN_STOPPED', '生成阶段已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        check(proposal?.status === 'staging', 'PROPOSAL_STATE', '方案已改变。');
        proposal.generationDiagnostics = { state: 'submitted', completed_at: new Date().toISOString() };
      });
      check(task.active && !task.stageError, 'RUN_STOPPED', '生成阶段已停止。');
      task.generationClosed = true; task.completeGeneration();
      return { submitted: true, note: '开始统一诊断审查，不等于模型已应用或审查通过。' };
    }
    if (name === 'finish_repair') {
      check(task.repairing && typeof task.completeRepair === 'function', 'COMMAND_NOT_ALLOWED', 'finish_repair 仅用于自动修正阶段。');
      check(task.repairChanged && !task.failedPlanSteps?.size, 'PLAN_INCOMPLETE', '须成功暂存完整修正版并修复所有失败步骤后才能结束修正。');
      await service.store.update(task.key, value => {
        check(task.active && !task.stageError && !task.repairClosed && value.run?.id === task.runId, 'RUN_STOPPED', '修正阶段已停止。');
        const proposal = value.proposals.find(item => item.id === task.plan.proposalId);
        check(proposal?.status === 'staging', 'PROPOSAL_STATE', '方案状态已改变。');
        proposal.repairDiagnostics.state = 'submitted'; proposal.repairDiagnostics.completed_at = new Date().toISOString();
      });
      check(task.active && !task.stageError, 'RUN_STOPPED', '修正阶段已停止。');
      task.repairClosed = true; task.completeRepair();
      return { submitted: true, note: '修正版进入重新诊断和审查，保存结果以服务回执为准。' };
    }
    if (name === 'revise_plan') {
      check(task.repairing || task.resuming, 'COMMAND_NOT_ALLOWED', '替换暂存方案仅用于最终校验或受阻方案修正。');
      const result = await service.stageChange(task, { step_json: args.steps_json }, true); task.failedPlanSteps?.clear(); await persistFailedSteps(); return result;
    }
    if (name === 'stage_change') {
      let stepId = 'invalid.step'; try { stepId = JSON.parse(args.step_json).local_id || stepId; } catch { /* 参数错误由正式校验处理。 */ }
      try {
        const result = await service.stageChange(task, args); task.failedPlanSteps?.delete(stepId); task.failedPlanSteps?.delete('invalid.step'); await persistFailedSteps(); return result;
      } catch (error) { task.failedPlanSteps ??= new Map(); task.failedPlanSteps.set(stepId, safeMessage(error)); await persistFailedSteps(); throw error; }
    }
    if (name === 'stage_subdiagram') {
      check(!task.analysisSource, 'COMMAND_NOT_ALLOWED', '脑图转换方案不能混入子图重组。');
      const supported = await service.previewPlan(task);
      check(Array.isArray(supported.affected_views), 'COMMAND_NOT_ALLOWED', '当前运行时不支持子图重组，仅能提出建议。');
      let members; try { members = JSON.parse(args.members_json); } catch { throw new AssistantError('INPUT_INVALID', 'members_json 必须为图元身份数组。'); }
      return service.stageChange(task, { step_json: JSON.stringify({ local_id: args.local_id, command_type: 'REORGANIZE_SUBGRAPH', target: args.target, name: args.name, members,
        ...(args.abstract_boundary == null ? {} : { abstract_boundary: args.abstract_boundary }) }) });
    }
    async function persistFailedSteps() {
      await service.store.update(task.key, value => {
        if (!task.active || value.run?.id !== task.runId) return;
        const proposal = value.proposals.find(item => item.id === task.plan?.proposalId);
        if (proposal) proposal.failedSteps = [...(task.failedPlanSteps ?? [])].map(([local_id, message]) => ({ local_id, message }));
      });
    }
    if (name === 'read_model') {
      const current = await service.store.read(task.key);
      const proposal = current.proposals.find(item => item.id === task.plan?.proposalId) ?? current.proposals.at(-1);
      const preview = await service.previewPlan(task);
      const projection = task.plan?.steps.length ? preview.data : null;
      return { ...task.snapshot, quality_policy: qualityPolicy, current_context_id: scope.contextId, selected_ids: task.selectedIds,
      modeling_context: modelingContext(projection ?? task.snapshot.projections.find(item => item.context_id === scope.contextId), Array.isArray(preview.affected_views)),
      affected_views: preview.affected_views ?? [],
      review_request: task.reviewRequest ?? task.text,
      plan_diagnostics: { current: reviewDiagnostics(proposal, current.run), previous: task.previousDiagnostics ?? null },
      staged_steps: task.plan?.steps ?? [], plan_step_schema: payloadSchema('PLAN_STEP'),
      failed_steps: [...(task.failedPlanSteps ?? [])].map(([local_id, message]) => ({ local_id, message })),
      ...(task.analysisRepairBaseline ? { original_conversion_steps: structuredClone(task.analysisRepairBaseline.steps) } : {}),
      staged_projection: projection,
      workflow: '按本轮生成 Skill 连续暂存；步骤格式见 plan_step_schema，已有方案见 staged_steps/staged_projection，质量阈值见 quality_policy。',
      relation_rules: 'Consumption CAP-ISO-PROC-001 [投入对象,过程]；Result CAP-ISO-PROC-002 [过程,产出对象]；Input-output-specified Effect CAP-ISO-PROC-008 [输入状态,过程,输出状态]，两状态必须属于同一对象。CREATE_FACT 使用 get_capabilities 返回的候选及端点顺序，Runtime 最终判断合法性。',
      layout_rules: 'CREATE_STATE 可省略 layout，由 Runtime 安排状态并扩容所属容器；具体位置和尺寸以 staged_projection 或当前图投影为准。手工调整时给完整标题和全部状态留出空间，不能把固定顶部偏移当作长标题高度。容器扩容及对象外侧属性子树也占用布局空间，应避开其他独立节点；quality_policy 是非阻断阅读建议，不是自动布局参数。' };
    }
    if (name === 'get_capabilities') {
      check(allowed.includes(args.command_type), 'COMMAND_NOT_ALLOWED', '第一版只支持本图对象、状态、关系、名称和布局修改。');
      if (task.plan || args.selection_id?.startsWith('local.') || (args.endpoints ?? []).some(x => x.startsWith('local.'))) {
        const queryScope = { context_id: scope.contextId, selection_id: args.selection_id ?? null, intent: args.command_type, endpoints: args.endpoints ?? [] };
        const preview = await service.previewPlan(task, queryScope);
        return { ...preview.capabilities, note: '这些候选基于当前暂存方案。stage_change 的 CREATE_FACT 用候选 capability_id，endpoints 使用本轮 local_id 别名或真实 occurrence_id；对象和状态也使用高层步骤，无需抄写底层 payload。' };
      }
      const graph = task.snapshot.projections.find(x => x.context_id === scope.contextId);
      const occurrence = value => {
        if (!value) return null;
        const exact = graph.constructs.find(x => x.occurrence_id === value); if (exact) return exact.occurrence_id;
        const matches = graph.constructs.filter(x => x.target_id === value);
        check(matches.length === 1, 'SCOPE_MISMATCH', '目标不在当前图或身份不唯一，请使用 occurrence_id。'); return matches[0].occurrence_id;
      };
      const queryScope = { context_id: scope.contextId,
        selection_id: ['CREATE_ELEMENT', 'CREATE_FACT'].includes(args.command_type) ? null : occurrence(args.selection_id),
        intent: args.command_type, endpoints: args.command_type === 'CREATE_FACT' ? (args.endpoints ?? []).map(occurrence) : [] };
      const result = await runtime.query(scope, 'capabilities', { draft_token: task.snapshot.token, scope: queryScope });
      for (const option of result.data.options) task.capabilities.set(option.option_id, { option, scope: queryScope });
      return { ...result.data, payload_schema: payloadSchema(args.command_type),
        fixed_parameters: result.data.options.map(option => ({ option_id: option.option_id,
          ...(args.command_type === 'CREATE_FACT' ? { fact_family: factFamily(option.capability_ref.capability_id), occurrence: { ownership: 'OWNED', construct_role: factFamily(option.capability_ref.capability_id) === 'STRUCTURAL' ? 'STRUCTURAL_LINK' : 'PROCEDURAL_LINK' } } : {}) })),
        note: '提出一个独立步骤。CREATE_ELEMENT 可在 layout 指定坐标，必须含 context_id。状态和关系照抄候选 capability_ref、normalized_endpoints，owner_ref 使用所有者 target_ref。occurrence.ownership 固定 OWNED；对象状态 construct_role=STATE_NODE，特征状态=FEATURE_STATE_NODE，过程关系=PROCEDURAL_LINK，结构关系=STRUCTURAL_LINK。不得把 context_id 当 selection_id 或端点。' };
    }
    check(name === 'propose_change', 'TOOL_NOT_ALLOWED', '工具不可用。');
    check(!task.autoApply, 'COMMAND_NOT_ALLOWED', '本轮使用整图流程。请用 stage_change 暂存修改，再调用 finish_generation。');
    const capability = task.capabilities.get(args.option_id);
    check(capability && capability.option.enabled, 'CAPABILITY_INVALID', '请先查询并选择启用的 Runtime 候选。');
    check(typeof args.summary === 'string' && args.summary.trim() && args.summary.length <= 500, 'INPUT_INVALID', '修改摘要无效。');
    check(typeof args.payload_json === 'string' && args.payload_json.length <= 32000, 'INPUT_INVALID', '命令参数过大。');
    let payload; try { payload = JSON.parse(args.payload_json); } catch { throw new AssistantError('INPUT_INVALID', 'payload_json 必须为合法 JSON。'); }
    const command = { command_type: capability.scope.intent, payload };
    if (command.command_type === 'CREATE_ELEMENT') payload.context_id ??= scope.contextId;
    check(validateCommand(command), 'INPUT_INVALID', `参数不符合 Runtime 契约：${ajv.errorsText(validateCommand.errors)}`);
    validateBoundCommand(task.snapshot, scope.contextId, command, capability.option, capability.scope);
    const affected = affectedContexts(task.snapshot, scope.contextId, command, capability.option);
    const proposal = { id: id(), summary: args.summary.trim(), command, baseToken: task.snapshot.token, scope: capability.scope,
      authorization: { capability_query_id: capability.option.capability_query_id, selected_option_id: capability.option.option_id },
      contextId: scope.contextId, symbolRef: capability.option.symbol_descriptor.id, affectedContexts: affected.map(context_id => task.snapshot.contexts.find(x => x.context_id === context_id)),
      status: affected.length > 1 ? 'blocked' : 'ready', reason: affected.length > 1 ? '涉及其他 OPD 的共享语义，第一版禁止跨图写入。' : '',
      commandId: `command.assistant.${id()}`, requestId: `request.assistant.${id()}`, createdAt: new Date().toISOString() };
    check(validateRequest({ request_id: proposal.requestId, command_id: proposal.commandId, expected_draft_token: proposal.baseToken,
      scope: proposal.scope, authorization: proposal.authorization, command }), 'INPUT_INVALID', '修改提案不符合草稿编辑契约。');
    check(task.active && !task.stageError, 'RUN_STOPPED', '生成已停止。');
    await service.store.update(task.key, value => {
      check(task.active && !task.stageError && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
      check(value.proposals.filter(x => x.status === 'ready').length < 10, 'TOO_MANY_PROPOSALS', '请先处理已有提案。');
      value.proposals.push(proposal);
    });
    return { proposal_id: proposal.id, status: proposal.status, reason: proposal.reason, summary: proposal.summary,
      note: '未修改模型；用户需在工作台独立应用。依赖此步骤的后续命令必须等应用后重新读取模型。' };
  }
