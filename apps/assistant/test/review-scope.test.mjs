import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopedReviewSnapshot } from '../src/review-scope.mjs';
const thing = (target_id, label = target_id) => ({ target_id, occurrence_id: `occ.${target_id}`, label });
const graph = (context_id, constructs, extra = {}) => ({ context_id, constructs, suppressed_states: [], ...extra });

test('子图重组所有父子图完整审查，各图OPL来自同一预览', () => {
  const parent = graph('parent', [thing('coordinator')]); const child = graph('child', [thing('detail')]);
  const text = { modality: 'OPL', artifact_id: 'artifact.preview', sentences: [], traces: [] };
  const task = { scope: { contextId: 'parent' }, snapshot: { projections: [parent], token: { edit_seq: 0 } },
    plan: { commandId: 'command.split', steps: [{ command_type: 'REORGANIZE_SUBGRAPH' }] }, text: '拆图' };
  const snapshot = scopedReviewSnapshot(task, parent, text, [
    { context_id: 'parent', label: '主图', data: parent, text },
    { context_id: 'child', label: '细节', parent_context_id: 'parent', refinee_element_id: 'coordinator', data: child, text }]);
  assert.equal(snapshot.review_scope.mode, 'REORGANIZATION_ALL_AFFECTED');
  assert.deepEqual(snapshot.review_scope.fully_reviewed_context_ids, ['parent', 'child']);
  assert(snapshot.projections.every(view => view.review_role === 'CURRENT'));
  assert.deepEqual(snapshot.opl_by_context.map(view => view.context_id), ['parent', 'child']);
  assert.deepEqual(snapshot.before_projections, [parent]);
});
test('子图完整审查，祖先及共享身份仅保留相关事实；同名不同身份和无关兄弟图排除', () => {
  const parent = graph('parent', [thing('roast'), thing('beans'), thing('unrelated')]);
  const child = graph('child', [thing('beans')], { parent_context_id: 'parent', refinee_element_id: 'roast' });
  const shared = graph('shared', [thing('beans'), thing('tool'), { target_id: 'fact', endpoints: [{ target_id: 'beans' }, { target_id: 'tool' }] }, thing('irrelevant')]);
  const task = { scope: { contextId: 'child' }, snapshot: { projections: [parent, child, shared,
    graph('sibling', [thing('other', 'beans')], { parent_context_id: 'parent' }), graph('grandchild', [thing('roast')], { parent_context_id: 'child' })] }, plan: { steps: [] } };
  const snapshot = scopedReviewSnapshot(task, graph('child', [thing('beans'), thing('new')]));
  assert.deepEqual(snapshot.projections.map(x => x.context_id), ['child', 'parent', 'shared', 'grandchild']);
  assert.equal(snapshot.projections[0].review_role, 'CURRENT');
  assert.deepEqual(snapshot.projections[1].constructs.map(x => x.target_id), ['roast', 'beans']);
  assert.deepEqual(snapshot.projections[2].constructs.map(x => x.target_id), ['beans', 'tool', 'fact']);
  assert.equal(snapshot.review_scope.omitted_context_count, 1);
  assert.deepEqual(snapshot.review_scope.changed_target_ids, ['new']);
  assert.equal(snapshot.before_projections[0].constructs.length, 1);
});
test('删除和状态归属、限定状态均计入变更；纯布局不算语义修改', () => {
  const state = { ...thing('state'), owner_id: 'beans', layout: { x: 1, y: 2 } };
  const before = graph('child', [state, thing('removed')]);
  const snapshot = scopedReviewSnapshot({ scope: { contextId: 'child' }, snapshot: { projections: [before] }, plan: { steps: [] } },
    graph('child', [{ ...state, layout: { x: 40, y: 2 } }, { ...thing('fact'), endpoints: [{ target_id: 'beans', state_qualification: 'state' }] }]));
  assert.deepEqual(new Set(snapshot.review_scope.changed_target_ids), new Set(['fact', 'beans', 'state', 'removed']));
});

const oplFixture = () => {
  const child = graph('child', [thing('beans'), thing('roast'), { ...thing('effect'), target_kind: 'FACT',
    endpoints: [{ target_id: 'beans', state_qualification: 'raw' }, { target_id: 'roast' }, { target_id: 'beans', state_qualification: 'done' }] }],
    { parent_context_id: 'parent' });
  return { task: { scope: { contextId: 'child' }, snapshot: { token: { draft_id: 'draft.test', edit_seq: 2, binding_digest: 'a'.repeat(64) },
    projections: [child, graph('parent', [thing('beans'), thing('private')])] }, plan: { commandId: 'plan.test', steps: [] } }, child,
    text: { artifact_id: 'artifact.child', modality: 'OPL', sentences: [{ sentence_id: 'sentence.effect', ordinal: 0, text: '烘焙 changes 咖啡豆 from 待烘焙 to 已烘焙.' }],
      traces: [{ sentence_id: 'sentence.effect', fact_ids: ['effect'], occurrence_ids: ['occ.beans', 'occ.roast', 'occ.effect'] }] } };
};
test('本图 OPL 绑定候选版本及语义映射，父图裁剪且快照不受后续输入变动影响', () => {
  const f = oplFixture();
  const snapshot = scopedReviewSnapshot(f.task, f.child, f.text);
  assert.equal(snapshot.opl.context_id, 'child'); assert.equal(snapshot.opl.plan_id, 'plan.test');
  assert.deepEqual(snapshot.opl.draft_token, f.task.snapshot.token);
  assert.deepEqual(new Set(snapshot.opl.sentences[0].target_ids), new Set(['effect', 'beans', 'roast', 'raw', 'done']));
  assert.deepEqual(snapshot.projections[1].constructs.map(item => item.target_id), ['beans']);
  assert.equal(snapshot.projections[1].opl, undefined);
  f.text.sentences[0].text = '后来修改的文本'; f.child.constructs[0].label = '后来改名'; f.task.snapshot.token.edit_seq++;
  assert.match(snapshot.opl.sentences[0].text, /烘焙 changes/);
  assert.equal(snapshot.projections[0].constructs[0].label, 'beans'); assert.equal(snapshot.opl.draft_token.edit_seq, 2);
});
test('OPL 缺失保持待核对，缺追踪、重复句子和跨图身份不能进入审查', () => {
  const f = oplFixture(); assert.equal(scopedReviewSnapshot(f.task, f.child).opl, null);
  for (const mutate of [text => text.traces = [], text => text.sentences.push(text.sentences[0]),
    text => text.traces.push(text.traces[0]), text => text.traces[0].sentence_id = 'sentence.other',
    text => text.traces[0].fact_ids = ['beans'], text => text.traces[0].occurrence_ids = ['occ.private'],
    text => text.modality = 'OPT']) {
    const invalid = structuredClone(f.text); mutate(invalid);
    assert.throws(() => scopedReviewSnapshot(f.task, f.child, invalid), { code: 'OPL_INCOMPLETE' });
  }
  const empty = { artifact_id: 'artifact.empty', modality: 'OPL', sentences: [], traces: [] };
  assert.deepEqual(scopedReviewSnapshot(f.task, graph('child', []), empty).opl.sentences, []);
});
