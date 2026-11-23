import { isDeepStrictEqual } from 'node:util';
import { check } from './store.mjs';

export const analysisScopeGuidance = '以工具返回的 edit_scope 识别用户所说的“这个节点”和“当前分支”。保留稳定 ID，按明确需求局部调整名称、备注、父子分组、同级顺序或分析关联。聚焦分支内的编辑一次保存，保留分支根的位置和其余内容。需要编辑其他分支时，提示先退出聚焦。';

export function analysisEditScope(document, selectedIds = [], focusedBranchId = null) {
  if (Array.isArray(selectedIds) && !selectedIds.length && focusedBranchId == null) {
    return { selected_node_ids: [], focused_branch_id: null };
  }
  const ids = new Set(document.nodes.map(node => node.id));
  check(Array.isArray(selectedIds) && selectedIds.length <= 100 && selectedIds.every(id => ids.has(id)),
    'ANALYSIS_SCOPE_INVALID', '选中的脑图节点已变化，请重新选择后发送。', 409);
  check(focusedBranchId == null || ids.has(focusedBranchId),
    'ANALYSIS_SCOPE_INVALID', '聚焦的脑图分支已变化，请重新聚焦后发送。', 409);
  return { selected_node_ids: [...new Set(selectedIds)], focused_branch_id: focusedBranchId === document.root_id ? null : focusedBranchId };
}

function branchNodes(nodes, root) {
  const children = new Map();
  for (const node of nodes) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node.id);
    children.set(node.parent_id, siblings);
  }
  const ids = new Set(), pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return ids;
}

export function checkAnalysisBranchEdit(before, after, root) {
  if (!root) return;
  check(after?.root_id === before.root_id && Array.isArray(after.nodes) && Array.isArray(after.relations ?? []),
    'ANALYSIS_SCOPE_INVALID', '请保留脑图根节点，并提交完整的节点及关联。');
  const current = before.nodes.find(node => node.id === root);
  const proposed = after.nodes.find(node => node?.id === root);
  check(proposed && proposed.parent_id === current.parent_id && proposed.order === current.order,
    'ANALYSIS_SCOPE_INVALID', '聚焦编辑须保留当前分支根及其位置。');
  check(after.nodes.every(node => node && typeof node === 'object') && (after.relations ?? []).every(relation => Array.isArray(relation?.endpoints)),
    'INPUT_INVALID', '脑图节点或关联格式无效。');
  const originalBranch = branchNodes(before.nodes, root);
  const nextBranch = branchNodes(after.nodes, root);
  const outsideNodes = (document, branch) => new Map(document.nodes.filter(node => !branch.has(node.id)).map(node => [node.id, node]));
  const outsideRelations = (document, branch) => new Map((document.relations ?? [])
    .filter(relation => !relation.endpoints.some(id => branch.has(id))).map(relation => [relation.id, relation]));
  check(isDeepStrictEqual(outsideNodes(before, originalBranch), outsideNodes(after, nextBranch))
    && isDeepStrictEqual(outsideRelations(before, originalBranch), outsideRelations(after, nextBranch)),
    'ANALYSIS_SCOPE_INVALID', '本轮聚焦编辑涉及其他分支。请保留分支之外的节点和关联，或退出聚焦后再编辑。', 409);
}
