import type { OpdNode } from "@/shared/types/modeling";
import type { LayoutGeometry } from "@/shared/api/generated/draftWorkspaceContract";
import { constrainStatePosition, nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";

export type NodeLayout = { occurrence_id: string; layout: LayoutGeometry };
export function captureLayouts(nodes: readonly OpdNode[]): NodeLayout[] {
  return nodes.filter(node => node.occurrenceRole === "owned").map(node => ({
    occurrence_id: node.occurrenceId, layout: { x: node.x, y: node.y, ...nodeDimensions(node) },
  }));
}

/** 拖动开始时建立索引，后续每帧只计算选择及其所属状态。 */
export function prepareSelectionMove(nodes: readonly OpdNode[], selectedIds: readonly string[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids = new Set(selectedIds.filter(id => byId.get(id)?.occurrenceRole === "owned"));
  const states = new Map<string, OpdNode[]>();
  for (const node of nodes) if (node.kind === "state" && node.ownerId && node.occurrenceRole === "owned") {
    const children = states.get(node.ownerId) ?? []; children.push(node); states.set(node.ownerId, children);
  }
  const moving = new Set(ids);
  for (const id of ids) for (const child of states.get(id) ?? []) moving.add(child.id);
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  return (dx: number, dy: number): NodeLayout[] => {
    const changed = new Map<string, OpdNode>();
    const owners = new Set<string>();
    for (const id of moving) {
      const node = byId.get(id)!;
      const followsOwner = node.kind === "state" && node.ownerId && ids.has(node.ownerId);
      const position = followsOwner ? { x: node.x + dx, y: node.y + dy }
        : constrainStatePosition(node, node.ownerId && byId.has(node.ownerId) ? [byId.get(node.ownerId)!] : [], { x: node.x + dx, y: node.y + dy });
      changed.set(id, { ...node, ...nodeDimensions(node), ...position });
      if (node.kind === "state" && node.ownerId && !followsOwner) owners.add(node.ownerId);
    }
    for (const id of owners) {
      const owner = changed.get(id) ?? byId.get(id);
      if (!owner || owner.occurrenceRole !== "owned") continue;
      const children = (states.get(id) ?? []).map(node => changed.get(node.id) ?? node);
      changed.set(id, { ...owner, width: Math.max(160, ...children.map(child => child.x + nodeDimensions(child).width + 8 - owner.x)),
        height: Math.max(72, ...children.map(child => child.y + nodeDimensions(child).height + 8 - owner.y)) });
    }
    // 与原实现一样按模型顺序返回，owner+state 只移动一次。
    return [...changed.values()].filter(node => {
      const previous = byId.get(node.id)!; const size = nodeDimensions(node), before = nodeDimensions(previous);
      return node.x !== previous.x || node.y !== previous.y || size.width !== before.width || size.height !== before.height;
    }).sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(node => ({ occurrence_id: node.occurrenceId,
      layout: { x: node.x, y: node.y, ...nodeDimensions(node) } }));
  };
  // 此索引只建立一次，避免在每帧排序中扫描 nodes。
}

/** 单次布局计算与画布拖动共用同一状态容器规则。 */
export function moveSelection(nodes: readonly OpdNode[], selectedIds: readonly string[], dx: number, dy: number): NodeLayout[] {
  return prepareSelectionMove(nodes, selectedIds)(dx, dy);
}
