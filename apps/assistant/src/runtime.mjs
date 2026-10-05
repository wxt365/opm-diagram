import { check, id, sameToken, AssistantError } from './store.mjs';

export class RuntimeClient {
  constructor(origin, session, request = fetch) { this.origin = origin; this.session = session; this.request = request; }
  async query(scope, operation, body = {}) {
    const path = `/api/v2/projects/${encodeURIComponent(scope.projectId)}/models/${encodeURIComponent(scope.modelId)}/draft/${operation}`;
    const response = await this.request(this.origin + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: this.origin, 'X-OPM-Session': this.session,
    }, body: JSON.stringify({ request_id: `request.assistant.${id()}`, ...body }), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new AssistantError(data.error?.code ?? data.code ?? 'RUNTIME_FAILED', data.error?.message ?? data.message ?? '模型操作被运行时拒绝。', response.status);
    return data;
  }
  open(scope) { return this.query(scope, 'open', { context_id: scope.contextId }); }
  read(scope, operation, token, extra = {}) { return this.query(scope, operation, { draft_token: token, context_id: scope.contextId, ...extra }); }
  async snapshot(scope) {
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
    return { token, contexts, projections };
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
