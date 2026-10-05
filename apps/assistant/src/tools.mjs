import { AssistantError, check, id, sameToken } from './store.mjs';
import { affectedContexts } from './runtime.mjs';
import { bindReview, digest, reviewRules, reviewSchema } from './review.mjs';
import { qualityPolicy } from './quality.mjs';
import { allowed, factFamily, payloadSchema, validateBoundCommand, validateCommand, validateRequest, ajv } from './commands.mjs';
import { safeMessage } from './messages.mjs';
import { analysisTool } from './mindmap-service.mjs';

/** 工具入口共用生成任务和 Runtime 授权，独立审查保持只读。 */
export async function dispatchTool(service, sessionId, name, args) {
    const task = [...service.tasks.values()].find(x => (x.key === sessionId || (x.analysisOnly && `analysis.${x.key}` === sessionId) || x.review?.sessionId === sessionId) && x.active);
    check(task, 'RUN_STOPPED', '本次生成已结束或停止。', 409);
    task.toolCount = (task.toolCount ?? 0) + 1;
    check(task.toolCount <= 160, 'TOOL_LIMIT', '本轮工具调用已达上限，请缩小需求后继续。');
    const runtime = service.runtime(task.session), scope = task.scope;
    check(sameToken((await runtime.open(scope)).draft_token, task.snapshot.token), 'DRAFT_CONFLICT', '生成期间模型已改变，请重新提出需求。', 409);
    check(task.active, 'RUN_STOPPED', '本次生成已停止。');
    if (task.review?.sessionId === sessionId) {
      check(['read_review_model', 'submit_review'].includes(name), 'COMMAND_NOT_ALLOWED', '标准审查只允许读取和提交报告。');
      if (name === 'read_review_model') return { snapshot: task.review.snapshot, snapshot_digest: digest(task.review.snapshot), rules: reviewRules, report_schema: reviewSchema };
      check(typeof args.report_json === 'string' && args.report_json.length <= 128000, 'REVIEW_INVALID', '标准审查参数无效。');
      let report; try { report = JSON.parse(args.report_json); } catch { throw new AssistantError('REVIEW_INVALID', '标准审查报告须为合法 JSON。'); }
      task.review.report = bindReview(report, task.review.snapshot, task.review.proposal);
      return { submitted: true, errors: task.review.report.issues.filter(item => item.severity === 'ERROR').length };
    }
    check(!task.review, 'COMMAND_NOT_ALLOWED', '独立审查期间不能修改方案。');
    if (task.analysisOnly) return analysisTool(service, task, name, args);
    check(!['read_analysis', 'save_analysis'].includes(name), 'COMMAND_NOT_ALLOWED', '建模会话不能修改分析资料。');
    await service.store.update(task.key, value => {
      if (task.active && value.run?.id === task.runId) value.run.message = name === 'propose_change' ? '正在准备修改提案…' : '正在查询模型和可用能力…';
    });
    if (name === 'revise_plan') {
      check(task.repairing, 'COMMAND_NOT_ALLOWED', '替换暂存方案仅用于最终校验修正。');
      const result = await service.stageChange(task, { step_json: args.steps_json }, true); task.failedPlanSteps?.clear(); return result;
    }
    if (name === 'stage_change') {
      let stepId = 'invalid.step'; try { stepId = JSON.parse(args.step_json).local_id || stepId; } catch { /* 参数错误由正式校验处理。 */ }
      try {
        const result = await service.stageChange(task, args); task.failedPlanSteps?.delete(stepId); task.failedPlanSteps?.delete('invalid.step'); return result;
      } catch (error) { task.failedPlanSteps ??= new Map(); task.failedPlanSteps.set(stepId, safeMessage(error)); throw error; }
    }
    if (name === 'read_model') return { ...task.snapshot, quality_policy: qualityPolicy, current_context_id: scope.contextId, selected_ids: task.selectedIds,
      staged_steps: task.plan?.steps ?? [], plan_step_schema: payloadSchema('PLAN_STEP'),
      ...(task.analysisRepairBaseline ? { original_conversion_steps: structuredClone(task.analysisRepairBaseline.steps) } : {}),
      staged_projection: task.plan?.steps.length ? (await service.previewPlan(task)).data : null,
      workflow: '默认通过 stage_change 连续完成整张图或整组修改，画布实时展示；各步骤 local_id 是本轮别名，后续 target/endpoints 可直接引用。不要逐元素让用户确认或回复继续。生成结束时统一校验，用户只确认一次。重大业务歧义才澄清，合理假设写在最终说明中。',
      relation_rules: '不同对象之间的投入产出（如咖啡豆→磨豆→咖啡粉→冲泡→咖啡饮品）应分别使用 Consumption CAP-ISO-PROC-001 [投入对象,过程] 和 Result CAP-ISO-PROC-002 [过程,产出对象]；不能把不同对象虚构为同一对象的两个状态，也不要为普通投入产出强加状态。只有同一对象的输入状态经过程变为输出状态，才用 Input-output-specified Effect CAP-ISO-PROC-008 [输入状态,过程,输出状态] 三端点查询候选。状态必须由同一对象持有。CREATE_FACT 按候选端点顺序及 capability_id 生成。Runtime 最终判断关系是否合法。',
      layout_rules: '创建状态时 Runtime 自动扩容所属对象以容纳状态，无须额外调整对象大小。状态左边距至少8、顶部至少28、底部和右侧至少8；默认状态88×28。新状态可放在已有状态下方并留8间距，避开其他节点。布局预览会展示对象扩容。' };
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
    check(task.active, 'RUN_STOPPED', '生成已停止。');
    await service.store.update(task.key, value => {
      check(task.active && value.run?.id === task.runId, 'RUN_STOPPED', '生成已停止。');
      check(value.proposals.filter(x => x.status === 'ready').length < 10, 'TOO_MANY_PROPOSALS', '请先处理已有提案。');
      value.proposals.push(proposal);
    });
    return { proposal_id: proposal.id, status: proposal.status, reason: proposal.reason, summary: proposal.summary,
      note: '未修改模型；用户需在工作台独立应用。依赖此步骤的后续命令必须等应用后重新读取模型。' };
  }
