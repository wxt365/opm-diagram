import { check, id, sameToken, AssistantError } from './store.mjs';

export class RuntimeClient {
  constructor(origin, session, request = fetch, requestOrigin) {
    this.origin = origin; this.session = session; this.request = request; this.requestOrigin = requestOrigin;
  }
  async query(scope, operation, body = {}) {
    const path = `/api/v2/projects/${encodeURIComponent(scope.projectId)}/models/${encodeURIComponent(scope.modelId)}/draft/${operation}`;
    const response = await this.request(this.origin + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: this.requestOrigin ?? new URL(this.origin).origin, 'X-OPM-Session': this.session,
    }, body: JSON.stringify({ request_id: `request.assistant.${id()}`, ...body }), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.error ?? data, reason = detail.reason_code;
      const message = detail.message ?? '模型操作被运行时拒绝。';
      const error = new AssistantError(detail.code ?? 'RUNTIME_FAILED', reason ? `${message}（原因：${reason}）` : message, response.status);
      error.reason_code = reason ?? null; throw error;
    }
    return data;
  }
  open(scope) { return this.query(scope, 'open', { context_id: scope.contextId }); }
  read(scope, operation, token, extra = {}) { return this.query(scope, operation, { draft_token: token, context_id: scope.contextId, ...extra }); }
  async modelBackground(scope) {
    const path = `/api/v1/projects/${encodeURIComponent(scope.projectId)}/models/${encodeURIComponent(scope.modelId)}/workspace-session?request_id=request.assistant.${id()}`;
    const response = await this.request(this.origin + path, { headers: {
      Origin: this.requestOrigin ?? new URL(this.origin).origin, 'X-OPM-Session': this.session,
    }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) {
      const detail = result.error ?? result;
      throw new AssistantError(detail.code ?? 'RUNTIME_FAILED', detail.message ?? '模型目标读取失败。', response.status);
    }
    const model = result.data?.model;
    check(model?.model_id === scope.modelId && model?.project_id === scope.projectId, 'SCOPE_MISMATCH', '模型目标响应不属于当前模型。');
    check(typeof model.name === 'string' && typeof model.description === 'string' && model.description.length <= 4000,
      'MODEL_BACKGROUND_UNAVAILABLE', '运行时未提供有效的模型目标，请更新并重启后端服务。');
    return { model_name: model.name, business_goal: model.description };
  }
  async snapshot(scope) {
    const background = await this.modelBackground(scope);
    const opened = await this.open(scope), token = opened.draft_token;
    const nav = await this.read(scope, 'navigation', token);
    const contexts = [...new Map([...nav.data.process_tree, ...nav.data.object_forest, ...nav.data.views].map(x => [x.context_id, x])).values()];
    check(contexts.length && contexts.length <= 100, 'MODEL_TOO_LARGE', '模型图数量超出当前助手读取范围，不能安全修改。');
    const projections = [];
    for (const context of contexts) {
      const value = await this.read({ ...scope, contextId: context.context_id }, 'projection', token);
      check(sameToken(value.meta.draft_token, token), 'DRAFT_CONFLICT', '读取期间模型已改变，请重试。', 409);
      projections.push({ ...context, ...value.data });
    }
    check(Buffer.byteLength(JSON.stringify(projections)) < 1000000, 'MODEL_TOO_LARGE', '模型超出助手上下文读取范围，不能安全修改。');
    return { token, contexts, projections, ...background };
  }
}

/** 从整个模型投影查共享身份及引用，读取不完整时由 snapshot 提前拒绝。 */
export function affectedContexts(snapshot, contextId, command, option) {
  const p = command.payload;
  if (['CREATE_ELEMENT', 'CREATE_FACT', 'UPDATE_LAYOUT', 'UPDATE_LAYOUT_BATCH'].includes(command.command_type)) return [contextId];
  const targets = new Set([
    p.target_ref?.target_id, p.state_id, p.owner_ref?.target_id, p.owner_element_id, p.fact_id,
    ...((p.normalized_endpoints ?? []).map(x => x.target_ref.target_id)),
    ...((option?.impact_summary?.items ?? []).map(x => x.id)),
  ].filter(Boolean));
  const result = new Set([contextId]);
  for (const graph of snapshot.projections) {
    if (targets.has(graph.refinee_element_id) || graph.constructs.some(x => targets.has(x.target_id) || targets.has(x.owner_id)
      || (x.endpoints ?? []).some(e => targets.has(e.target_id) || targets.has(e.state_qualification)))) result.add(graph.context_id);
    if ((graph.suppressed_states ?? []).some(x => targets.has(x.state_id) || targets.has(x.owner_ref?.target_id))) result.add(graph.context_id);
  }
  return [...result];
}
