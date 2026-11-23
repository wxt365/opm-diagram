import type { LayoutAction } from '@/shared/workbench/layoutTypes';
export interface ArrangementBox { id: string; x: number; y: number; width: number; height: number; orderKey?: string }
/** 只计算矩形位置；归属、可编辑性和语义约束由调用方检查。 */
export function arrangeBoxes(targets: readonly ArrangementBox[], action: LayoutAction) {
  const distributed = action.startsWith('distribute-');
  const positions = new Map(targets.map(node => [node.id, { x: node.x, y: node.y }]));
  if (targets.length < (distributed ? 3 : 2)) return { positions, reason: distributed ? '等距分布需要至少三个独立元素。' : '对齐需要至少两个独立元素。' };
  const reference = targets.at(-1)!;
  if (distributed) {
    const axis = action === 'distribute-x' ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height';
    const sorted = [...targets].sort((a, b) => a[axis] - b[axis] || (a.orderKey ?? a.id).localeCompare(b.orderKey ?? b.id));
    const first = sorted[0]!, last = sorted.at(-1)!;
    const space = last[axis] + last[size] - first[axis] - sorted.reduce((sum, node) => sum + node[size], 0);
    if (space < -1e-7) return { positions, reason: '两端之间的空间不足，请先拉开两端元素，再进行等距分布。' };
    const gap = Math.max(0, space) / (sorted.length - 1);
    let cursor = first[axis] + first[size] + gap;
    for (const node of sorted.slice(1, -1)) { positions.get(node.id)![axis] = cursor; cursor += node[size] + gap; }
  } else for (const node of targets) {
    const position = positions.get(node.id)!;
    switch (action) {
      case 'left': position.x = reference.x; break;
      case 'center-x': position.x = reference.x + (reference.width - node.width) / 2; break;
      case 'right': position.x = reference.x + reference.width - node.width; break;
      case 'top': position.y = reference.y; break;
      case 'center-y': position.y = reference.y + (reference.height - node.height) / 2; break;
      case 'bottom': position.y = reference.y + reference.height - node.height; break;
    }
  }
  return { positions, reason: '' };
}
