import { check } from './store.mjs';

/** 本图完整审查，关联图只保留共享身份和细化边界所需事实。 */
const references = item => [item.target_id, item.owner_id, ...(item.endpoints ?? []).flatMap(end => [end.target_id, end.state_qualification])].filter(Boolean);
const semantic = item => {
  const { layout, layout_ref, ...value } = item;
  return JSON.stringify(value);
};

/** 同一预览返回的 OPL 按本图追踪定位，不从父图或已保存草稿补造文本。 */
function reviewOpl(task, current, text) {
  if (text == null) return null;
  check(text.modality === 'OPL' && typeof text.artifact_id === 'string'
    && Array.isArray(text.sentences) && Array.isArray(text.traces), 'OPL_INCOMPLETE', '预览未返回有效的 OPL 文本与追踪。');
  const targets = new Map(current.constructs.map(item => [item.target_id, item]));
  const occurrences = new Map(current.constructs.map(item => [item.occurrence_id, item]));
  const traces = new Map(text.traces.map(item => [item.sentence_id, item]));
  check(traces.size === text.traces.length && traces.size === text.sentences.length
    && new Set(text.sentences.map(item => item.sentence_id)).size === text.sentences.length,
    'OPL_INCOMPLETE', 'OPL 句子与追踪必须唯一且逐条对应。');
  const sentences = text.sentences.map(sentence => {
    const trace = traces.get(sentence.sentence_id);
    check(typeof sentence.text === 'string' && Number.isInteger(sentence.ordinal) && trace
      && Array.isArray(trace.fact_ids) && trace.fact_ids.length > 0 && Array.isArray(trace.occurrence_ids)
      && trace.fact_ids.every(id => targets.get(id)?.target_kind === 'FACT')
      && trace.occurrence_ids.every(id => occurrences.has(id)), 'OPL_INCOMPLETE', 'OPL 追踪不能引用本图之外或不存在的事实和图元。');
    return { ...sentence, fact_ids: trace.fact_ids, occurrence_ids: trace.occurrence_ids,
      target_ids: [...new Set([...trace.fact_ids, ...trace.occurrence_ids.map(id => occurrences.get(id).target_id),
        ...trace.fact_ids.flatMap(id => references(targets.get(id)))])] };
  });
  return { context_id: current.context_id, draft_token: task.snapshot.token, plan_id: task.plan.commandId,
    artifact_id: text.artifact_id, modality: 'OPL', sentences };
}

export function scopedReviewSnapshot(task, preview, text = null, affectedViews = null) {
  if (affectedViews?.length) {
    const projections = affectedViews.map(view => ({ ...view.data, label: view.label, parent_context_id: view.parent_context_id,
      refinee_element_id: view.refinee_element_id, review_role: 'CURRENT' }));
    return structuredClone({ request: task.reviewRequest ?? task.text, context_id: task.scope.contextId, steps: task.plan.steps,
      opl: reviewOpl(task, projections.find(view => view.context_id === task.scope.contextId), text),
      opl_by_context: affectedViews.map((view, index) => reviewOpl(task, projections[index], view.text)),
      review_scope: { mode: 'REORGANIZATION_ALL_AFFECTED', current_context_id: task.scope.contextId,
        fully_reviewed_context_ids: projections.map(view => view.context_id), related_context_ids: projections.filter(view => view.context_id !== task.scope.contextId).map(view => view.context_id),
        omitted_context_count: task.snapshot.projections.filter(view => !projections.some(next => next.context_id === view.context_id)).length,
        changed_target_ids: [...new Set(projections.flatMap(view => view.constructs.flatMap(references)))] },
      projections, before_projections: task.snapshot.projections.filter(view => projections.some(next => next.context_id === view.context_id)) });
  }
  const currentId = task.scope.contextId;
  const graphs = task.snapshot.projections;
  const current = { ...graphs.find(graph => graph.context_id === currentId), ...preview };
  const before = graphs.find(graph => graph.context_id === currentId);
  const seeds = new Set([...current.constructs, ...(before?.constructs ?? [])].flatMap(references));
  if (current.refinee_element_id) seeds.add(current.refinee_element_id);
  const ancestors = new Set();
  let parent = current.parent_context_id;
  while (parent && !ancestors.has(parent)) {
    ancestors.add(parent);
    const graph = graphs.find(item => item.context_id === parent);
    if (graph?.refinee_element_id) seeds.add(graph.refinee_element_id);
    parent = graph?.parent_context_id;
  }
  const related = [];
  for (const graph of graphs) {
    if (graph.context_id === currentId) continue;
    const boundary = graph.parent_context_id === currentId || ancestors.has(graph.context_id);
    const matches = graph.constructs.filter(item => references(item).some(id => seeds.has(id)));
    if (!boundary && !matches.length && !seeds.has(graph.refinee_element_id)) continue;
    const required = new Set(matches.flatMap(references));
    const constructs = graph.constructs.filter(item => matches.includes(item) || required.has(item.target_id));
    related.push({ ...graph, constructs, suppressed_states: (graph.suppressed_states ?? []).filter(item => required.has(item.state_id)), review_role: 'CONSISTENCY' });
  }
  const old = new Map((before?.constructs ?? []).map(item => [item.occurrence_id ?? item.target_id, semantic(item)]));
  const changed = current.constructs.filter(item => old.get(item.occurrence_id ?? item.target_id) !== semantic(item));
  const remaining = new Set(current.constructs.map(item => item.occurrence_id ?? item.target_id));
  changed.push(...(before?.constructs ?? []).filter(item => !remaining.has(item.occurrence_id ?? item.target_id)));
  return structuredClone({
    request: task.reviewRequest ?? task.text, context_id: currentId, steps: task.plan.steps,
    opl: reviewOpl(task, current, text),
    review_scope: { mode: 'CURRENT_OPD_AND_RELATED_CONSISTENCY', current_context_id: currentId,
      related_context_ids: related.map(graph => graph.context_id), omitted_context_count: graphs.length - related.length - 1,
      changed_target_ids: [...new Set(changed.flatMap(references))] },
    projections: [{ ...current, review_role: 'CURRENT' }, ...related],
    before_projections: [before, ...related.map(graph => ({ ...graph }))].filter(Boolean),
  });
}

/** 短引用由服务端确定生成，只有精确匹配才可替代完整身份。 */
export function reviewReferenceCatalog(snapshot) {
  const entries = [];
  for (const graph of snapshot.projections) {
    entries.push({ context_id: graph.context_id, target_id: graph.context_id, label: graph.label ?? graph.name ?? graph.context_id });
    for (const item of graph.constructs) entries.push({ context_id: graph.context_id, target_id: item.target_id,
      occurrence_id: item.occurrence_id, label: item.label, kind: item.target_kind });
  }
  return entries.map((entry, index) => ({ ref: `ref.${index + 1}`, ...entry }));
}
