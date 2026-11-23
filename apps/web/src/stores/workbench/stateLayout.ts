import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { fitStateGroup, stateInsideOwner } from "@/modules/workbench/opd/core/state-layout";

/** 旧导入数据可能仍是相对坐标；加载时只整理所属状态，不用越界位置扩大容器。 */
export function repairStateContainers(nodes: readonly OpdNode[]) {
  return fitStateContainers(nodes, undefined, new Set(), nodes, true);
}

/** 仅整理指定的可编辑容器；外部特征跟随扩容，包含折叠特征的状态。 */
export function fitStateContainers(nodes: readonly OpdNode[], ownerIds?: ReadonlySet<string>, movingStates: ReadonlySet<string> = new Set(), previousNodes: readonly OpdNode[] = nodes, repairOutside = false) {
  const changed = new Map(nodes.map(node => [node.id, node]));
  const previous = new Map(previousNodes.map(node => [node.id, node]));
  const owners = nodes.filter(node => node.kind !== "state" && node.occurrenceRole === "owned" && (!ownerIds || ownerIds.has(node.id)));
  // 主对象先扩容并平移特征，再计算特征自身的状态。
  owners.sort((a, b) => Number(!!a.ownerId) - Number(!!b.ownerId));
  function translateChildren(ownerId: string, dx: number, dy: number, seen = new Set<string>()) {
    if (seen.has(ownerId)) return;
    seen.add(ownerId);
    for (const original of nodes) {
      const child = changed.get(original.id)!;
      if (child.ownerId !== ownerId || child.occurrenceRole !== "owned") continue;
      changed.set(child.id, { ...child, x: child.x + dx, y: child.y + dy });
      translateChildren(child.id, dx, dy, seen);
    }
  }
  for (const original of owners) {
    const owner = changed.get(original.id)!;
    const states = nodes.filter(node => node.kind === "state" && node.ownerId === owner.id).map(node => changed.get(node.id)!);
    if (!states.length || states.some(node => node.occurrenceRole !== "owned")) continue;
    // 未拖动的状态优先占位，避免为了让位而推动其他状态。
    states.sort((a, b) => repairOutside
      ? Number(stateInsideOwner(owner, b)) - Number(stateInsideOwner(owner, a)) || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)
      : Number(movingStates.has(a.id)) - Number(movingStates.has(b.id)) || a.id.localeCompare(b.id));
    const fitted = fitStateGroup(owner, states, repairOutside);
    changed.set(owner.id, fitted.owner);
    fitted.states.forEach(state => changed.set(state.id, state));
    const before = nodeDimensions(previous.get(owner.id) ?? owner), after = nodeDimensions(fitted.owner);
    for (const originalFeature of nodes) {
      const feature = changed.get(originalFeature.id)!;
      if (feature.ownerId !== owner.id || feature.occurrenceRole !== "owned" || (feature.kind !== "attribute" && feature.kind !== "operation")) continue;
      const dx = feature.x >= owner.x + before.width ? after.width - before.width : 0;
      const dy = feature.y >= owner.y + before.height ? after.height - before.height : 0;
      if (!dx && !dy) continue;
      changed.set(feature.id, { ...feature, x: feature.x + dx, y: feature.y + dy });
      translateChildren(feature.id, dx, dy);
    }
  }
  return nodes.map(node => changed.get(node.id)!);
}
