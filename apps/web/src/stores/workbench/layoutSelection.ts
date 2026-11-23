import type { OpdNode } from "@/shared/types/modeling";
import type { LayoutGeometry } from "@/shared/api/generated/draftWorkspaceContract";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { fitStateContainers } from "./stateLayout";
import { normalizeNodeAppearance } from "@/shared/nodeAppearance";

export type NodeLayout = { occurrence_id: string; layout: LayoutGeometry };
export function captureLayouts(nodes: readonly OpdNode[]): NodeLayout[] {
  return nodes.filter(node => node.occurrenceRole === "owned").map(node => ({
    occurrence_id: node.occurrenceId, layout: { x: node.x, y: node.y, ...nodeDimensions(node),
      ...(node.edgeRoutes?.length ? { edge_routes: node.edgeRoutes } : {}),
      ...(normalizeNodeAppearance(node.appearance) ? { appearance: normalizeNodeAppearance(node.appearance) } : {}) },
  }));
}

/** 仅跟随同图可编辑的特征和状态，不移动引用节点。 */
export function ownedChildrenByOwner(nodes: readonly OpdNode[]) {
  const children = new Map<string, OpdNode[]>();
  for (const node of nodes) if (node.ownerId && node.occurrenceRole === "owned"
    && (node.kind === "state" || node.kind === "attribute" || node.kind === "operation")) {
    const siblings = children.get(node.ownerId) ?? [];
    siblings.push(node); children.set(node.ownerId, siblings);
  }
  return children;
}

/** 拖动开始时建立所属索引，后续每帧只计算选择及其所属特征、状态。 */
export function prepareSelectionMove(nodes: readonly OpdNode[], selectedIds: readonly string[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids = new Set(selectedIds.filter(id => byId.get(id)?.occurrenceRole === "owned"));
  const children = ownedChildrenByOwner(nodes);
  const moving = new Set(ids), queue = [...ids];
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]!) ?? []) {
    if (moving.has(child.id)) continue;
    moving.add(child.id); queue.push(child.id);
  }
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  return (dx: number, dy: number): NodeLayout[] => {
    const changed = new Map<string, OpdNode>();
    const owners = new Set<string>();
    for (const id of moving) {
      const node = byId.get(id)!;
      const followsOwner = node.ownerId && moving.has(node.ownerId);
      if (node.kind === "state" && !followsOwner && (byId.get(node.ownerId ?? "")?.occurrenceRole !== "owned"
        || nodes.some(sibling => sibling.kind === "state" && sibling.ownerId === node.ownerId && sibling.occurrenceRole !== "owned"))) continue;
      const position = { x: node.x + dx, y: node.y + dy };
      changed.set(id, { ...node, ...nodeDimensions(node), ...position });
      if (node.kind === "state" && node.ownerId && !followsOwner) owners.add(node.ownerId);
    }
    if (owners.size) for (const node of fitStateContainers(nodes.map(node => changed.get(node.id) ?? node), owners, moving, nodes))
      if (node !== byId.get(node.id)) changed.set(node.id, node);
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
