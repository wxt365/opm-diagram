/** 两种分析文档共有的展示字段，不包含领域语义。 */
export interface MindmapTreeNode {
  id: string;
  parent_id: string | null;
  order: number;
  label: string;
  note: string;
  collapsed: boolean;
}
export interface MindmapTree<T extends MindmapTreeNode = MindmapTreeNode> { root_id: string; nodes: T[] }
export interface MindmapAssociation { id: string; label: string; endpoints: string[] }

export type MindmapLayout = 'right' | 'bilateral' | 'down';
export interface MindmapNodeSize { width: number; height: number }
export const defaultMindmapNodeSize: Readonly<MindmapNodeSize> = { width: 202, height: 64 };

export function layoutMindmap<T extends MindmapTreeNode>(document: MindmapTree<T>, expanded = new Set<string>(), mode: MindmapLayout = 'right', sizes?: ReadonlyMap<string, MindmapNodeSize>) {
  const positions: (MindmapNodeSize & { node: T; x: number; y: number; parent: string | null })[] = [];
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const children = new Map<string, T[]>();
  for (const node of document.nodes) if (node.parent_id) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node); children.set(node.parent_id, siblings);
  }
  function visibleChildren(node: T) {
    return node.collapsed && !expanded.has(node.id) ? [] : (children.get(node.id) ?? []).sort((a, b) => a.order - b.order);
  }
  let row = 0;
  const vertical = mode === 'down';
  const mainDimension = vertical ? 'height' : 'width';
  const crossDimension = vertical ? 'width' : 'height';
  const mainGap = vertical ? 48 : 44;
  const mainStart = vertical ? 40 : 32;
  const sizeOf = (node: T) => sizes?.get(node.id) ?? defaultMindmapNodeSize;
  const rowSize = Math.max(defaultMindmapNodeSize[crossDimension], ...document.nodes.map(node => sizeOf(node)[crossDimension]));
  const rowSpacing = rowSize + (vertical ? 34 : 16);
  const rowStart = (vertical ? 32 : 40) + rowSize / 2;
  const visited = new Set<string>();
  function visitChild(node: T, parentSize: MindmapNodeSize, parentAxis: number, direction: 1 | -1) {
    const spacingSize = direction === 1 ? parentSize : sizeOf(node);
    return visit(node, parentAxis + direction * (spacingSize[mainDimension] + mainGap), direction);
  }
  function visit(node: T, axis: number, direction: 1 | -1): number {
    if (visited.has(node.id)) return rowStart + row * rowSpacing;
    visited.add(node.id);
    const size = sizeOf(node);
    const children = visibleChildren(node).map(child => visitChild(child, size, axis, direction));
    const cross = children.length ? (children[0]! + children.at(-1)!) / 2 : rowStart + row++ * rowSpacing;
    const start = cross - size[crossDimension] / 2;
    const position = vertical ? { x: start, y: axis } : { x: axis, y: start };
    positions.push({ node, ...position, ...size, parent: node.parent_id });
    return cross;
  }
  const root = nodes.get(document.root_id);
  if (!root) return positions;
  const branches = visibleChildren(root);
  if (mode !== 'bilateral' || branches.length < 2) {
    visit(root, mainStart, 1);
    return positions;
  }

  // 每一侧的分支保持原同级顺序，再将两侧分别对齐根主题。
  visited.add(root.id);
  const rootSize = sizeOf(root);
  const split = Math.ceil(branches.length / 2);
  branches.slice(0, split).forEach(branch => visitChild(branch, rootSize, mainStart, 1));
  const rightRows = row, rightCount = positions.length;
  row = 0;
  branches.slice(split).forEach(branch => visitChild(branch, rootSize, mainStart, -1));
  const leftRows = row;
  const height = Math.max(rightRows, leftRows);
  const offsetX = mainStart - Math.min(...positions.map(item => item.x));
  positions.forEach((item, index) => {
    item.x += offsetX;
    item.y += (height - (index < rightCount ? rightRows : leftRows)) * rowSpacing / 2;
  });
  const rootY = rowStart + (height - 1) * rowSpacing / 2 - rootSize.height / 2;
  positions.push({ node: root, ...rootSize, x: mainStart + offsetX, y: rootY, parent: root.parent_id });
  return positions;
}

export type MindmapDrop = 'before' | 'after' | 'child';

export function orderedChildren<T extends MindmapTreeNode>(nodes: T[], parentId: string) {
  return nodes.filter(node => node.parent_id === parentId).sort((a, b) => a.order - b.order);
}

export function mindmapMove(document: MindmapTree, id: string, targetId: string, placement: MindmapDrop = 'child') {
  const node = document.nodes.find(item => item.id === id);
  const target = document.nodes.find(item => item.id === targetId);
  if (!node?.parent_id || !target || treeDescendants(document, id).has(targetId)) return;
  const parentId = placement === 'child' ? target.id : target.parent_id;
  if (!parentId) return;
  const siblings = orderedChildren(document.nodes, parentId);
  const destination = siblings.filter(item => item.id !== id);
  const index = placement === 'child' ? destination.length : destination.indexOf(target) + Number(placement === 'after');
  if (node.parent_id === parentId && siblings.indexOf(node) === index && (placement !== 'child' || !target.collapsed)) return;
  return { parentId, index };
}

export function applyMindmapMove(document: MindmapTree, id: string, targetId: string, placement: MindmapDrop = 'child') {
  const move = mindmapMove(document, id, targetId, placement);
  if (!move) return;
  const node = document.nodes.find(item => item.id === id)!;
  const previousParent = node.parent_id!;
  const destination = orderedChildren(document.nodes, move.parentId).filter(item => item.id !== id);
  destination.splice(move.index, 0, node);
  node.parent_id = move.parentId;
  destination.forEach((item, order) => { item.order = order; });
  if (previousParent !== move.parentId) orderedChildren(document.nodes, previousParent).forEach((item, order) => { item.order = order; });
  document.nodes.find(item => item.id === move.parentId)!.collapsed = false;
}

export function treeDescendants(document: MindmapTree, id: string) {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const node of document.nodes) if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) { ids.add(node.id); changed = true; }
  }
  return ids;
}
