import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";

interface Box { x: number; y: number; width: number; height: number }

function box(node: OpdNode): Box {
  return { x: node.x, y: node.y, ...nodeDimensions(node) };
}

function intersects(left: Box, right: Box, gap = 0) {
  return left.x < right.x + right.width + gap && right.x < left.x + left.width + gap
    && left.y < right.y + right.height + gap && right.y < left.y + left.height + gap;
}

/** 优先复用容器内空位；扩容不能覆盖邻近节点，避免以数量推算已被拖动的状态位置。 */
export function nextStatePosition(owner: OpdNode, nodes: readonly OpdNode[]): { x: number; y: number } | null {
  const bounds = box(owner);
  const states = nodes.filter(node => node.kind === "state" && node.ownerId === owner.id).map(box);
  const obstacles = nodes.filter(node => node.id !== owner.id && node.kind !== "state").map(box);
  const xs = [...new Set([owner.x + 36, owner.x + 8, ...states.map(state => state.x + state.width + 8)])];
  const ys = [...new Set([owner.y + 32, owner.y + 28, ...states.map(state => state.y + state.height + 8)])].sort((a, b) => a - b);
  const candidates = ys.flatMap(y => xs.map(x => ({ x, y, width: 88, height: 28 })))
    .filter(candidate => candidate.x + candidate.width + 8 <= bounds.x + bounds.width)
    .sort((a, b) => Math.max(0, a.y + a.height + 8 - bounds.y - bounds.height)
      - Math.max(0, b.y + b.height + 8 - bounds.y - bounds.height));
  for (const candidate of candidates) {
    if (states.some(state => intersects(candidate, state, 8))) continue;
    const expanded = { ...bounds, height: Math.max(bounds.height, candidate.y + candidate.height + 8 - bounds.y) };
    if (obstacles.some(obstacle => intersects(expanded, obstacle))) continue;
    return { x: candidate.x, y: candidate.y };
  }
  return null;
}

/** 属性和操作共同占位；保留接点空间，再沿右侧向下寻找不相交的位置。 */
export function nextFeaturePosition(owner: OpdNode, nodes: readonly OpdNode[]): { x: number; y: number } {
  const size = nodeDimensions(owner);
  const count = nodes.filter(node => node.ownerId === owner.id && (node.kind === "attribute" || node.kind === "operation")).length;
  const x = owner.x + size.width + Math.max(56, size.width / 2 - 80 + 32);
  let y = owner.y + (count + 1) * 96;
  const obstacles = nodes.filter(node => node.kind !== "state").map(box);
  // 每次越过至少一个障碍物底边，迭代次数受节点数量限制。
  for (let index = 0; index <= obstacles.length; index++) {
    const collisions = obstacles.filter(obstacle => intersects({ x, y, width: 160, height: 72 }, obstacle, 24));
    if (!collisions.length) return { x, y };
    y = Math.max(...collisions.map(obstacle => obstacle.y + obstacle.height + 24));
  }
  return { x, y };
}
