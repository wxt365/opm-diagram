import { arrangeBoxes } from "@/shared/canvas/arrangement";
import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { statesOverlap } from "@/modules/workbench/opd/core/state-layout";
import { captureLayouts, ownedChildrenByOwner, type NodeLayout } from "./layoutSelection";

export { layoutActions } from "@/shared/workbench/layoutTypes";
import type { LayoutAction } from "@/shared/workbench/layoutTypes";
export type { LayoutAction } from "@/shared/workbench/layoutTypes";

/** owner 已参与选择时，所属特征、状态随父移动，不重复计入排列数量。 */
export function arrangementSelection(nodes: readonly OpdNode[], selectedIds: readonly string[]) {
  const selected = [...new Set(selectedIds)].map(id => nodes.find(node => node.id === id));
  if (selected.some(node => !node || node.occurrenceRole !== "owned")) return { targets: [], reason: "只能整理当前图中可编辑的元素。" };
  const children = ownedChildrenByOwner(nodes), following = new Set<string>();
  const queue = [...new Set(selectedIds)];
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]!) ?? []) {
    if (following.has(child.id)) continue;
    following.add(child.id); queue.push(child.id);
  }
  const targets = selected.filter((node): node is OpdNode => !!node && !following.has(node.id));
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
  const targets = selection.targets.map(node => ({ ...node, ...nodeDimensions(node), orderKey: node.occurrenceId }));
  const { positions, reason } = arrangeBoxes(targets, action);
  if (reason) return { layouts: [], reason };
  const children = ownedChildrenByOwner(nodes), queue: OpdNode[] = [...targets];
  for (let index = 0; index < queue.length; index++) {
    const owner = queue[index]!, movedOwner = positions.get(owner.id)!;
    for (const child of children.get(owner.id) ?? []) {
      if (positions.has(child.id)) continue;
      positions.set(child.id, { x: child.x + movedOwner.x - owner.x, y: child.y + movedOwner.y - owner.y });
      queue.push(child);
    }
  }
  const next = nodes.map(node => positions.has(node.id) ? { ...node, ...positions.get(node.id)! } : node);
  // 独立状态要保持精确对齐，越界时整批拒绝，不进行会破坏结果的夹取。
  for (const node of next) {
    if (node.kind !== "state" || !targets.some(target => target.id === node.id)) continue;
    const owner = next.find(item => item.id === node.ownerId)!;
    const box = nodeDimensions(owner), size = nodeDimensions(node), tolerance = 1e-7;
    if (node.x < owner.x + 8 - tolerance || node.y < owner.y + 28 - tolerance
      || node.x + size.width > owner.x + box.width - 8 + tolerance
      || node.y + size.height > owner.y + box.height - 8 + tolerance)
      return { layouts: [], reason: "整理后的状态会超出所属节点，请先调整状态位置或所属节点空间。" };
    if (next.some(other => other.id !== node.id && other.kind === "state" && other.ownerId === node.ownerId
      && statesOverlap({ ...node, ...size }, { ...other, ...nodeDimensions(other) }, 8)))
      return { layouts: [], reason: "整理后的状态会相互重叠，请拉开状态间距或使用自动布局。" };
  }
  const before = new Map(captureLayouts(nodes).map(item => [item.occurrence_id, item.layout]));
  return { layouts: captureLayouts(next).filter(item => {
    const previous = before.get(item.occurrence_id)!;
    return Math.abs(item.layout.x - previous.x) > 1e-7 || Math.abs(item.layout.y - previous.y) > 1e-7;
  }), reason: "" };
}
