import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { captureLayouts, type NodeLayout } from "./layoutSelection";

export type AutoLayoutDirection = "right" | "down";
type Block = { id: string; width: number; height: number; members: Array<{ node: OpdNode; x: number; y: number }> };
const gap = 64, layerGap = 96, featureGap = 48;

/** 当前 OPD 的稳定分层布局；状态在容器内保持相对位置，特征作为所属组的右侧卫星。 */
export function autoLayout(nodes: readonly OpdNode[], relations: readonly ConsumptionRelation[], direction: AutoLayoutDirection): { layouts: NodeLayout[]; reason: string } {
  const owned = nodes.filter(node => node.occurrenceRole === "owned");
  if (!owned.length) return { layouts: [], reason: "当前图没有可自动整理的元素。" };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const feature = (node: OpdNode) => node.kind === "attribute" || node.kind === "operation";
  const roots = owned.filter(node => node.kind !== "state" && !(feature(node) && node.ownerId && byId.get(node.ownerId)?.occurrenceRole === "owned"))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const node of nodes) {
    const size = nodeDimensions(node);
    if (![node.x, node.y, size.width, size.height].every(Number.isFinite) || size.width <= 0 || size.height <= 0)
      return { layouts: [], reason: "元素几何无效，无法自动布局。" };
    if (node.kind !== "state") continue;
    const owner = byId.get(node.ownerId ?? "");
    if (node.occurrenceRole === "owned" && (!owner || owner.occurrenceRole !== "owned" || owner.kind === "state"))
      return { layouts: [], reason: "状态缺少当前图中可编辑的所属节点，请先修复所属关系。" };
    if (owner?.occurrenceRole !== "owned") continue;
    if (node.occurrenceRole !== "owned") return { layouts: [], reason: "包含只读状态的所属节点无法自动整理。" };
    const box = nodeDimensions(owner);
    if (node.x < owner.x + 8 - 1e-7 || node.y < owner.y + 28 - 1e-7
      || node.x + size.width > owner.x + box.width - 8 + 1e-7 || node.y + size.height > owner.y + box.height - 8 + 1e-7)
      return { layouts: [], reason: "状态已超出所属节点，请先调整状态位置或容器。" };
  }
  const childrenByOwner = new Map<string, OpdNode[]>();
  for (const node of owned) if (node.ownerId) { const children = childrenByOwner.get(node.ownerId) ?? []; children.push(node); childrenByOwner.set(node.ownerId, children); }
  const groupByNode = new Map<string, string>();
  const blocks: Block[] = roots.map(root => {
    const size = nodeDimensions(root), block: Block = { id: root.id, ...size, members: [] };
    const add = (node: OpdNode, x: number, y: number) => {
      groupByNode.set(node.id, root.id); block.members.push({ node, x, y });
      for (const state of (childrenByOwner.get(node.id) ?? []).filter(item => item.kind === "state")) {
        groupByNode.set(state.id, root.id); block.members.push({ node: state, x: x + state.x - node.x, y: y + state.y - node.y });
      }
    };
    add(root, 0, 0);
    // 特征放在主节点右下方，给主流程水平连线保留通道。
    let cursor = size.height + gap;
    for (const child of (childrenByOwner.get(root.id) ?? []).filter(feature).sort((a, b) => a.id.localeCompare(b.id))) {
      const childSize = nodeDimensions(child);
      add(child, size.width + featureGap, cursor);
      block.width = Math.max(block.width, size.width + featureGap + childSize.width);
      block.height = Math.max(block.height, cursor + childSize.height);
      cursor += childSize.height + gap;
    }
    return block;
  });
  if (owned.some(node => !groupByNode.has(node.id))) return { layouts: [], reason: "元素所属关系无法组成有效布局，请先修复所属关系。" };
  const graph = new Map(blocks.map(block => [block.id, new Set<string>()]));
  const connect = (from: string, to: string) => {
    const source = groupByNode.get(from), target = groupByNode.get(to);
    if (source && target && source !== target) graph.get(source)!.add(target);
  };
  for (const relation of relations) {
    const endpoints = relation.endpoints?.length ? [...relation.endpoints].sort((a, b) => a.ordinal - b.ordinal).map(endpoint => endpoint.targetId)
      : [relation.sourceId, relation.targetId];
    const pairs = endpoints.slice(1).map((target, index) => [
      relation.capabilityId?.startsWith("CAP-ISO-PROC-") ? endpoints[index]! : endpoints[0]!, target,
    ] as const);
    for (const [source, target] of pairs) {
      connect(source, target);
      if (relation.direction === "UNDIRECTED" || relation.direction === "BIDIRECTIONAL") connect(target, source);
    }
  }
  const ranks = layeredRanks(graph);
  const levels = new Map<number, Block[]>();
  for (const block of blocks) {
    const rank = ranks.get(block.id)!;
    const level = levels.get(rank) ?? []; level.push(block); levels.set(rank, level);
  }
  // reference 是固定障碍；整组放在固定区域右侧或下方，避免移动只读元素。
  const fixed = nodes.filter(node => node.occurrenceRole !== "owned");
  let main = Math.max(80, ...fixed.map(node => direction === "right" ? node.x + nodeDimensions(node).width + layerGap : node.y + nodeDimensions(node).height + layerGap));
  const positions = new Map<string, { x: number; y: number }>();
  for (const [, level] of [...levels].sort(([a], [b]) => a - b)) {
    let cross = 80;
    for (const block of level) {
      const x = direction === "right" ? main : cross, y = direction === "right" ? cross : main;
      for (const member of block.members) positions.set(member.node.id, { x: x + member.x, y: y + member.y });
      cross += (direction === "right" ? block.height : block.width) + gap;
    }
    main += Math.max(...level.map(block => direction === "right" ? block.width : block.height)) + layerGap;
  }
  if ([...positions.values()].some(position => !Number.isFinite(position.x) || !Number.isFinite(position.y)))
    return { layouts: [], reason: "布局尺寸超出可计算范围，请先调整元素几何。" };
  const before = new Map(captureLayouts(nodes).map(item => [item.occurrence_id, item.layout]));
  const next = captureLayouts(nodes.map(node => ({ ...node, ...positions.get(node.id) })));
  return { layouts: next.filter(item => {
    const previous = before.get(item.occurrence_id)!;
    return Math.abs(item.layout.x - previous.x) > 1e-7 || Math.abs(item.layout.y - previous.y) > 1e-7;
  }).sort((a, b) => a.occurrence_id.localeCompare(b.occurrence_id)), reason: "" };
}

/** 两次迭代 DFS 折叠循环，再对无环图取最长前驱层；避免递归随图大小溢出。 */
function layeredRanks(graph: Map<string, Set<string>>) {
  const ids = [...graph.keys()].sort(), seen = new Set<string>(), finish: string[] = [];
  const reverse = new Map(ids.map(id => [id, new Set<string>()]));
  graph.forEach((targets, source) => targets.forEach(target => reverse.get(target)!.add(source)));
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const stack = [{ id, targets: [...graph.get(id)!].sort(), index: 0 }];
    while (stack.length) {
      const top = stack.at(-1)!;
      const next = top.targets[top.index++];
      if (next !== undefined) {
        if (!seen.has(next)) { seen.add(next); stack.push({ id: next, targets: [...graph.get(next)!].sort(), index: 0 }); }
      } else { finish.push(top.id); stack.pop(); }
    }
  }
  const groups = new Map<string, number>(); let count = 0;
  for (const id of finish.reverse()) {
    if (groups.has(id)) continue;
    const stack = [id]; groups.set(id, count);
    while (stack.length) for (const previous of reverse.get(stack.pop()!)!) {
      if (!groups.has(previous)) { groups.set(previous, count); stack.push(previous); }
    }
    count++;
  }
  const next = Array.from({ length: count }, () => new Set<number>()), incoming = new Array<number>(count).fill(0), rank = new Array<number>(count).fill(0);
  graph.forEach((targets, source) => targets.forEach(target => {
    const from = groups.get(source)!, to = groups.get(target)!;
    if (from !== to && !next[from]!.has(to)) { next[from]!.add(to); incoming[to] = incoming[to]! + 1; }
  }));
  const queue = incoming.flatMap((value, index) => value === 0 ? [index] : []);
  for (let index = 0; index < queue.length; index++) {
    const from = queue[index]!;
    for (const to of next[from]!) { rank[to] = Math.max(rank[to]!, rank[from]! + 1); if (--incoming[to]! === 0) queue.push(to); }
  }
  return new Map(ids.map(id => [id, rank[groups.get(id)!]!]));
}
