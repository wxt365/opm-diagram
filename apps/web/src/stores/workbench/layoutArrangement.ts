import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { captureLayouts, type NodeLayout } from "./layoutSelection";

export const layoutActions = ["left", "center-x", "right", "top", "center-y", "bottom", "distribute-x", "distribute-y"] as const;
export type LayoutAction = typeof layoutActions[number];

/** owner 已参与选择时，状态只随父移动，不重复计入排列数量。 */
export function arrangementSelection(nodes: readonly OpdNode[], selectedIds: readonly string[]) {
  const selected = [...new Set(selectedIds)].map(id => nodes.find(node => node.id === id));
  if (selected.some(node => !node || node.occurrenceRole !== "owned")) return { targets: [], reason: "只能整理当前图中可编辑的元素。" };
  const ids = new Set(selectedIds);
  const targets = selected.filter((node): node is OpdNode => !!node && !(node.kind === "state" && node.ownerId && ids.has(node.ownerId)));
  const states = targets.filter(node => node.kind === "state");
  if (states.length && (states.length !== targets.length || new Set(states.map(node => node.ownerId)).size !== 1))
    return { targets, reason: "独立状态只能在同一所属节点内整理；请分别选择或连同所属节点一起选择。" };
  if (states.length && !nodes.some(node => node.id === states[0]!.ownerId && node.occurrenceRole === "owned"))
    return { targets, reason: "状态缺少当前图中可编辑的所属节点。" };
  return { targets, reason: "" };
}

export function arrangeLayouts(nodes: readonly OpdNode[], selectedIds: readonly string[], action: LayoutAction): { layouts: NodeLayout[]; reason: string } {
  const selection = arrangementSelection(nodes, selectedIds);
  if (selection.reason) return { layouts: [], reason: selection.reason };
  const distributed = action.startsWith("distribute-");
  if (selection.targets.length < (distributed ? 3 : 2)) return { layouts: [], reason: distributed ? "等距分布需要至少三个独立元素。" : "对齐需要至少两个独立元素。" };
  const targets = selection.targets.map(node => ({ ...node, ...nodeDimensions(node) }));
  const reference = targets.at(-1)!;
  const positions = new Map(targets.map(node => [node.id, { x: node.x, y: node.y }]));
  if (distributed) {
    const axis = action === "distribute-x" ? "x" : "y";
    const size = axis === "x" ? "width" : "height";
    const sorted = [...targets].sort((a, b) => a[axis] - b[axis] || a.occurrenceId.localeCompare(b.occurrenceId));
    const first = sorted[0]!, last = sorted.at(-1)!;
    const space = last[axis] + last[size] - first[axis] - sorted.reduce((sum, node) => sum + node[size], 0);
    if (space < -1e-7) return { layouts: [], reason: "两端之间的空间不足，请先拉开两端元素，再进行等距分布。" };
    const gap = Math.max(0, space) / (sorted.length - 1);
    let cursor = first[axis] + first[size] + gap;
    for (const node of sorted.slice(1, -1)) {
      positions.get(node.id)![axis] = cursor;
      cursor += node[size] + gap;
    }
  } else {
    for (const node of targets) {
      const position = positions.get(node.id)!;
      switch (action) {
        case "left": position.x = reference.x; break;
        case "center-x": position.x = reference.x + (reference.width - node.width) / 2; break;
        case "right": position.x = reference.x + reference.width - node.width; break;
        case "top": position.y = reference.y; break;
        case "center-y": position.y = reference.y + (reference.height - node.height) / 2; break;
        case "bottom": position.y = reference.y + reference.height - node.height; break;
      }
    }
  }
  const next = nodes.map(node => {
    let position = positions.get(node.id);
    if (!position && node.kind === "state" && node.ownerId && node.occurrenceRole === "owned") {
      const owner = nodes.find(item => item.id === node.ownerId), movedOwner = positions.get(node.ownerId);
      if (owner && movedOwner) position = { x: node.x + movedOwner.x - owner.x, y: node.y + movedOwner.y - owner.y };
    }
    return position ? { ...node, ...position } : node;
  });
  // 独立状态要保持精确对齐，越界时整批拒绝，不进行会破坏结果的夹取。
  for (const node of next) {
    if (node.kind !== "state" || !positions.has(node.id)) continue;
    const owner = next.find(item => item.id === node.ownerId)!;
    const box = nodeDimensions(owner), size = nodeDimensions(node), tolerance = 1e-7;
    if (node.x < owner.x + 8 - tolerance || node.y < owner.y + 28 - tolerance
      || node.x + size.width > owner.x + box.width - 8 + tolerance
      || node.y + size.height > owner.y + box.height - 8 + tolerance)
      return { layouts: [], reason: "整理后的状态会超出所属节点，请先调整状态位置或所属节点空间。" };
  }
  const before = new Map(captureLayouts(nodes).map(item => [item.occurrence_id, item.layout]));
  return { layouts: captureLayouts(next).filter(item => {
    const previous = before.get(item.occurrence_id)!;
    return Math.abs(item.layout.x - previous.x) > 1e-7 || Math.abs(item.layout.y - previous.y) > 1e-7;
  }), reason: "" };
}
