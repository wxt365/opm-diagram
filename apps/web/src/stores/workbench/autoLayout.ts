import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { nodeDimensions, readableNodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { captureLayouts, type NodeLayout } from "./layoutSelection";
import { fitStateContainers } from "./stateLayout";
import { fitRefinementEnvelope } from "@/modules/workbench/opd/core/refinement-envelope";
import { captureRelationLayouts } from "./relationLayout";

export type AutoLayoutDirection = "right" | "down";
type Block = { id: string; width: number; height: number; members: Array<{ node: OpdNode; x: number; y: number }> };
const gap = 96, layerGap = 144, featureGap = 80, siblingGap = 32;

/** 当前 OPD 的稳定分层布局；状态在容器内保持相对位置，特征作为所属组的右侧卫星。 */
export function autoLayout(inputNodes: readonly OpdNode[], relations: readonly ConsumptionRelation[], direction: AutoLayoutDirection, refineeId?: string): { layouts: NodeLayout[]; reason: string } {
  let nodes = inputNodes.filter(node => node.id !== refineeId);
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
  }
  nodes = fitStateContainers(nodes.map(node => node.occurrenceRole === "owned" ? { ...node, ...readableNodeDimensions(node) } : node));
  const fittedById = new Map(nodes.map(node => [node.id, node]));
  const childrenByOwner = new Map<string, OpdNode[]>();
  for (const node of nodes.filter(node => node.occurrenceRole === "owned")) if (node.ownerId) { const children = childrenByOwner.get(node.ownerId) ?? []; children.push(node); childrenByOwner.set(node.ownerId, children); }
  const groupByNode = new Map<string, string>();
  const blocks: Block[] = roots.map(original => {
    const root = fittedById.get(original.id)!, order = [root];
    const descendants = new Map<string, OpdNode[]>();
    // Iterative postorder reserves each complete subtree, including nested features.
    for (let i = 0; i < order.length; i++) {
      const node = order[i]!;
      if (groupByNode.has(node.id)) continue;
      groupByNode.set(node.id, root.id);
      const children = (childrenByOwner.get(node.id) ?? []).filter(feature).sort((a, b) => a.id.localeCompare(b.id));
      descendants.set(node.id, children); order.push(...children.filter(child => !groupByNode.has(child.id)));
    }
    const dimensions = new Map<string, { width: number; height: number }>();
    const offsets = new Map<string, { x: number; y: number }>();
    for (const node of [...order].reverse()) {
      const size = nodeDimensions(node), children = descendants.get(node.id) ?? [];
      const childrenHeight = children.reduce((sum, child) => sum + (dimensions.get(child.id)?.height ?? 0), 0) + Math.max(0, children.length - 1) * siblingGap;
      const height = Math.max(size.height, childrenHeight), nodeY = (height - size.height) / 2;
      let width = size.width, cursor = (height - childrenHeight) / 2;
      for (const child of children) {
        const childSize = dimensions.get(child.id);
        if (!childSize) continue;
        offsets.set(child.id, { x: size.width + featureGap, y: cursor - nodeY + (childSize.height - nodeDimensions(child).height) / 2 });
        width = Math.max(width, size.width + featureGap + childSize.width);
        cursor += childSize.height + siblingGap;
      }
      dimensions.set(node.id, { width, height });
    }
    const block: Block = { id: root.id, ...dimensions.get(root.id)!, members: [] };
    const positions = new Map<string, { x: number; y: number }>([[root.id, { x: 0, y: (block.height - nodeDimensions(root).height) / 2 }]]);
    for (const node of order) {
      const position = positions.get(node.id)!;
      block.members.push({ node, ...position });
      for (const state of (childrenByOwner.get(node.id) ?? []).filter(item => item.kind === "state")) {
        groupByNode.set(state.id, root.id);
        block.members.push({ node: state, x: position.x + state.x - node.x, y: position.y + state.y - node.y });
      }
      for (const child of descendants.get(node.id) ?? []) {
        const offset = offsets.get(child.id);
        if (offset) positions.set(child.id, { x: position.x + offset.x, y: position.y + offset.y });
      }
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
  // Auxiliary object/state feedback must not collapse an otherwise ordered process chain.
  const processes = new Set(roots.filter(node => node.kind === "process").map(node => node.id));
  const processGraph = new Map([...processes].map(id => [id, new Set<string>()]));
  graph.forEach((targets, source) => targets.forEach(target => {
    if (processes.has(source) && processes.has(target)) processGraph.get(source)!.add(target);
  }));
  // A result reused as another process's input also expresses ordering. Match
  // the actual object endpoints, not their state owners or structural links.
  const producers = new Map<string, Set<string>>(), consumers = new Map<string, Set<string>>();
  for (const relation of relations) {
    const ends = relation.endpoints?.length ? [...relation.endpoints].sort((a, b) => a.ordinal - b.ordinal).map(end => end.targetId)
      : [relation.sourceId, relation.targetId];
    if (ends.length !== 2) continue;
    const [from, to] = ends as [string, string];
    const record = (map: Map<string, Set<string>>, object: string, process: string) => {
      const group = groupByNode.get(process);
      if (!group || !processes.has(group) || !["object", "attribute"].includes(byId.get(object)?.kind ?? "")) return;
      const ids = map.get(object) ?? new Set<string>(); ids.add(group); map.set(object, ids);
    };
    if (relation.capabilityId === "CAP-ISO-PROC-002") record(producers, to, from);
    else if (["CAP-ISO-PROC-001", "CAP-ISO-PROC-004", "CAP-ISO-PROC-005"].includes(relation.capabilityId ?? "")) record(consumers, from, to);
  }
  producers.forEach((sources, object) => sources.forEach(source => consumers.get(object)?.forEach(target => {
    if (source !== target) processGraph.get(source)!.add(target);
  })));
  const ranks = layeredRanks(graph);
  if ([...processGraph.values()].some(targets => targets.size)) {
    const flowRanks = layeredRanks(processGraph);
    for (const id of processes) ranks.set(id, flowRanks.get(id)! * 2 + 1);
    for (const block of blocks.filter(block => !processes.has(block.id))) {
      const successors = [...graph.get(block.id)!].filter(id => processes.has(id));
      const predecessors = [...graph].filter(([id, targets]) => processes.has(id) && targets.has(block.id)).map(([id]) => id);
      if (successors.length) ranks.set(block.id, Math.max(0, Math.min(...successors.map(id => ranks.get(id)!)) - 1));
      else if (predecessors.length) ranks.set(block.id, Math.max(...predecessors.map(id => ranks.get(id)!)) + 1);
    }
  }
  const levels = new Map<number, Block[]>();
  for (const block of blocks) {
    const rank = ranks.get(block.id)!;
    const level = levels.get(rank) ?? []; level.push(block); levels.set(rank, level);
  }
  // Barycentric sweeps keep adjacent layers' neighbors near one another and reduce crossings.
  const neighbors = new Map(blocks.map(block => [block.id, new Set<string>()]));
  graph.forEach((targets, source) => targets.forEach(target => { neighbors.get(source)!.add(target); neighbors.get(target)!.add(source); }));
  for (let sweep = 0; sweep < 4; sweep++) {
    const order = new Map([...levels.values()].flatMap(level => level.map((block, index) => [block.id, index] as const)));
    const sorted = [...levels].sort(([a], [b]) => sweep % 2 ? b - a : a - b);
    for (const [rank, level] of sorted) {
      const center = (block: Block) => {
        const adjacent = [...neighbors.get(block.id)!].filter(id => sweep % 2 ? ranks.get(id)! > rank : ranks.get(id)! < rank);
        return adjacent.length ? adjacent.reduce((sum, id) => sum + order.get(id)!, 0) / adjacent.length : order.get(block.id)!;
      };
      level.sort((a, b) => center(a) - center(b) || a.id.localeCompare(b.id));
      level.forEach((block, index) => order.set(block.id, index));
    }
  }
  // reference 是固定障碍；整组放在固定区域右侧或下方，避免移动只读元素。
  const fixed = nodes.filter(node => node.occurrenceRole !== "owned");
  let main = Math.max(80, ...fixed.map(node => direction === "right" ? node.x + nodeDimensions(node).width + layerGap : node.y + nodeDimensions(node).height + layerGap));
  const positions = new Map<string, { x: number; y: number }>();
  const packed = new Map([...levels].map(([rank, level]) => [rank, packLevel(level, direction)]));
  const widest = Math.max(...[...packed.values()].map(level => level.crossSpan));
  for (const [rank, level] of [...levels].sort(([a], [b]) => a - b)) {
    // Center branch/merge layers in the same corridor instead of pinning everything to the top/left.
    const region = packed.get(rank)!, cross = 80 + (widest - region.crossSpan) / 2;
    for (const { block, flow, across } of region.items) {
      const x = direction === "right" ? main + flow : cross + across, y = direction === "right" ? cross + across : main + flow;
      for (const member of block.members) positions.set(member.node.id, { x: x + member.x, y: y + member.y });
    }
    const fan = Math.max(...level.map(block => neighbors.get(block.id)!.size));
    main += region.flowSpan + layerGap + Math.min(120, Math.max(0, fan - 2) * 16);
  }
  if ([...positions.values()].some(position => !Number.isFinite(position.x) || !Number.isFinite(position.y)))
    return { layouts: [], reason: "布局尺寸超出可计算范围，请先调整元素几何。" };
  const before = new Map([...captureLayouts(inputNodes), ...captureRelationLayouts(relations)].map(item => [item.occurrence_id, item.layout]));
  const parent = inputNodes.find(node => node.id === refineeId);
  const resetRoutes = new Set(inputNodes.filter(node => node.edgeRoutes?.some(route => route.mode === "MANUAL")).map(node => node.occurrenceId));
  const next = captureLayouts(fitRefinementEnvelope([...nodes.map(node => ({ ...node, ...positions.get(node.id) })), ...(parent ? [parent] : [])], refineeId))
    .map(item => resetRoutes.has(item.occurrence_id) ? { ...item, layout: { ...item.layout, edge_routes: [] } } : item);
  next.push(...captureRelationLayouts(relations).filter((_, index) => relations[index]!.edgeRoutes?.some(route => route.mode === "MANUAL"))
    .map(item => ({ ...item, layout: { ...item.layout, edge_routes: [] } })));
  return { layouts: next.filter(item => {
    const previous = before.get(item.occurrence_id)!;
    return Math.abs(item.layout.x - previous.x) > 1e-7 || Math.abs(item.layout.y - previous.y) > 1e-7
      || item.layout.width !== previous.width || item.layout.height !== previous.height
      || JSON.stringify(item.layout.edge_routes ?? []) !== JSON.stringify(previous.edge_routes ?? []);
  }).sort((a, b) => a.occurrence_id.localeCompare(b.occurrence_id)), reason: "" };
}

/** 同层循环和孤立节点均衡成块，避免一列过长迫使整图缩小。 */
function packLevel(blocks: Block[], direction: AutoLayoutDirection) {
  const flowSize = (block: Block) => direction === "right" ? block.width : block.height;
  const crossSize = (block: Block) => direction === "right" ? block.height : block.width;
  const options = Array.from({ length: blocks.length < 4 ? 1 : Math.min(blocks.length, Math.ceil(Math.sqrt(blocks.length)) + 1) }, (_, count) => {
    const lanes = Array.from({ length: count + 1 }, () => ({ items: [] as Array<{ block: Block; across: number }>, span: 0, flow: 0 }));
    for (const block of blocks) {
      const lane = lanes.reduce((best, next) => next.span < best.span ? next : best);
      lane.items.push({ block, across: lane.span });
      lane.span += crossSize(block) + gap; lane.flow = Math.max(lane.flow, flowSize(block));
    }
    let flowSpan = 0;
    const items = lanes.flatMap(lane => {
      const next = lane.items.map(item => ({ ...item, flow: flowSpan })); flowSpan += lane.flow + gap; return next;
    });
    flowSpan -= gap;
    const crossSpan = Math.max(...lanes.map(lane => lane.span - gap));
    return { items, flowSpan, crossSpan, score: flowSpan / (direction === "right" ? 1.25 : 0.8) + crossSpan };
  });
  return options.sort((a, b) => a.score - b.score || a.flowSpan - b.flowSpan)[0]!;
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
