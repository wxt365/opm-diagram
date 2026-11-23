import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { stateSlot } from "@/modules/workbench/opd/core/state-layout";

interface Box { x: number; y: number; width: number; height: number }

function box(node: OpdNode): Box {
  return { x: node.x, y: node.y, ...nodeDimensions(node) };
}

function intersects(left: Box, right: Box, gap = 0) {
  return left.x < right.x + right.width + gap && right.x < left.x + left.width + gap
    && left.y < right.y + right.height + gap && right.y < left.y + left.height + gap;
}

/** 优先复用容器内空位；扩容不能覆盖邻近节点，避免以数量推算已被拖动的状态位置。 */
export function nextStatePosition(owner: OpdNode, nodes: readonly OpdNode[], refineeId?: string, allowGroupMove = false): { x: number; y: number } | null {
  const bounds = box(owner);
  const states = nodes.filter(node => node.kind === "state" && node.ownerId === owner.id).map(box);
  const obstacles = nodes.filter(node => node.id !== owner.id && node.id !== refineeId && node.kind !== "state"
    && !(node.ownerId === owner.id && node.occurrenceRole === "owned" && (node.kind === "attribute" || node.kind === "operation"))).map(box);
  const candidate = stateSlot(owner, states, { width: 88, height: 28 });
  const expanded = { ...bounds, width: Math.max(bounds.width, candidate.x + 96 - bounds.x),
    height: Math.max(bounds.height, candidate.y + 36 - bounds.y) };
  // owned 特征会随容器扩容向外让位；其他对象仍是固定障碍。
  if (!allowGroupMove && obstacles.some(obstacle => intersects(expanded, obstacle))) return null;
  return candidate;
}

/** 属性和操作共同占位；保留接点空间，再沿右侧向下寻找不相交的位置。 */
export function nextFeaturePosition(owner: OpdNode, nodes: readonly OpdNode[], refineeId?: string): { x: number; y: number } {
  const size = nodeDimensions(owner);
  const features = nodes.filter(node => node.ownerId === owner.id && (node.kind === "attribute" || node.kind === "operation"));
  // 接在实际最下方的特征后，兼容拖动、容器扩容及历史不等高特征。
  const last = features.reduce<OpdNode | undefined>((lowest, node) =>
    !lowest || node.y + nodeDimensions(node).height > lowest.y + nodeDimensions(lowest).height ? node : lowest, undefined);
  const x = Math.max(owner.x + size.width + 56, last?.x ?? -Infinity);
  let y = Math.max(owner.y + size.height + 24, last ? last.y + nodeDimensions(last).height + 24 : -Infinity);
  const obstacles = nodes.filter(node => node.kind !== "state" && node.id !== refineeId).map(box);
  // 每次越过至少一个障碍物底边，迭代次数受节点数量限制。
  for (let index = 0; index <= obstacles.length; index++) {
    const collisions = obstacles.filter(obstacle => intersects({ x, y, width: 160, height: 72 }, obstacle, 24));
    if (!collisions.length) return { x, y };
    y = Math.max(...collisions.map(obstacle => obstacle.y + obstacle.height + 24));
  }
  return { x, y };
}

/** Search adjacent slots around the visible center; the refinement envelope is a container. */
export function nextElementPosition(nodes: readonly OpdNode[], desired: { x: number; y: number }, refineeId?: string, size = { width: 170, height: 90 }) {
  const obstacles = nodes.filter(node => node.kind !== "state" && node.id !== refineeId).map(box);
  const xs = [...new Set([desired.x, ...obstacles.flatMap(item => [item.x - size.width - 32, item.x + item.width + 32])])];
  const ys = [...new Set([desired.y, ...obstacles.flatMap(item => [item.y - size.height - 32, item.y + item.height + 32])])];
  const candidates = [...xs.map(x => ({ x, y: desired.y })), ...ys.map(y => ({ x: desired.x, y }))]
    .sort((a, b) => Math.abs(a.x - desired.x) + Math.abs(a.y - desired.y) - Math.abs(b.x - desired.x) - Math.abs(b.y - desired.y) || a.y - b.y || a.x - b.x);
  return candidates.find(position => !obstacles.some(obstacle => intersects({ ...position, ...size }, obstacle, 24)))
    ?? { x: Math.max(desired.x, ...obstacles.map(item => item.x + item.width + 32)), y: desired.y };
}

/** A growing state container moves with its complete feature subtree, rather than covering neighbors. */
export function placeExpandedGroup(nodes: readonly OpdNode[], ownerId: string, refineeId?: string) {
  const members = new Set([ownerId]);
  for (let pass = 0; pass < nodes.length; pass++) {
    const before = members.size;
    nodes.forEach(node => { if (node.ownerId && members.has(node.ownerId) && node.occurrenceRole === "owned") members.add(node.id); });
    if (before === members.size) break;
  }
  const group = nodes.filter(node => members.has(node.id));
  if (!group.length) return [...nodes];
  const left = Math.min(...group.map(node => node.x)), top = Math.min(...group.map(node => node.y));
  const size = { width: Math.max(...group.map(node => node.x + nodeDimensions(node).width)) - left,
    height: Math.max(...group.map(node => node.y + nodeDimensions(node).height)) - top };
  const position = nextElementPosition(nodes.filter(node => !members.has(node.id)), { x: left, y: top }, refineeId, size);
  return nodes.map(node => members.has(node.id) ? { ...node, x: node.x + position.x - left, y: node.y + position.y - top } : node);
}
