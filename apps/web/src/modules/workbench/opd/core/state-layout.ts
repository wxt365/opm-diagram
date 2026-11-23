import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions, stateContainerTitleHeight } from "./node-geometry";

const padding = 8, gap = 8;
type Box = { x: number; y: number; width: number; height: number };

export function statesOverlap(a: Box, b: Box, spacing = 0) {
  return a.x < b.x + b.width + spacing - 1e-7 && b.x < a.x + a.width + spacing - 1e-7
    && a.y < b.y + b.height + spacing - 1e-7 && b.y < a.y + a.height + spacing - 1e-7;
}

/** 与 11px 状态字体匹配的保守文本宽度；限制行宽，长名称通过换行增加高度。 */
export function stateDimensions(node: OpdNode, owner: OpdNode) {
  const current = nodeDimensions(node), available = Math.max(88, nodeDimensions(owner).width - padding * 2);
  const lines = node.label.split(/\r?\n/).map(line => [...line].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 || /[WMwm@%]/.test(char) ? 11 : 8), 0));
  const width = Math.max(current.width, Math.min(available, Math.max(88, ...lines.map(line => line + 24))));
  const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line / (width - 24))), 0);
  return { width, height: Math.max(current.height, rows * 16 + 12) };
}

/** 保留可用手工位置；冲突时从标题下逐排找空位，横向不足则向下换行。 */
export function stateSlot(owner: OpdNode, placed: readonly Box[], size: { width: number; height: number }, desired?: { x: number; y: number }) {
  const left = owner.x + padding, top = owner.y + stateContainerTitleHeight(owner);
  const right = owner.x + Math.max(nodeDimensions(owner).width, size.width + padding * 2) - padding;
  const clampX = (x: number) => Math.max(left, Math.min(x, right - size.width));
  const wanted = desired && { x: clampX(desired.x), y: Math.max(top, desired.y), ...size };
  if (wanted && !placed.some(other => statesOverlap(wanted, other, gap))) return { x: wanted.x, y: wanted.y };
  const ys = [...new Set([top, ...placed.map(other => other.y + other.height + gap)])].sort((a, b) => a - b);
  const xs = [...new Set([left, ...placed.map(other => other.x + other.width + gap)])].sort((a, b) => a - b);
  for (const y of ys) for (const x of xs) {
    if (x + size.width > right + 1e-7) continue;
    if (!placed.some(other => statesOverlap({ x, y, ...size }, other, gap))) return { x, y };
  }
  return { x: left, y: Math.max(top, ...placed.map(other => other.y + other.height + gap)) };
}

export function stateInsideOwner(owner: OpdNode, state: OpdNode) {
  const bounds = nodeDimensions(owner), size = stateDimensions(state, owner);
  return state.x >= owner.x + padding && state.y >= owner.y + stateContainerTitleHeight(owner)
    && state.x + size.width + padding <= owner.x + bounds.width + 1e-7
    && state.y + size.height + padding <= owner.y + bounds.height + 1e-7;
}

export function fitStateGroup(owner: OpdNode, states: readonly OpdNode[], repairOutside = false) {
  const placed: OpdNode[] = [];
  for (const state of states) {
    const size = stateDimensions(state, owner);
    const desired = !repairOutside || stateInsideOwner(owner, state) ? state : undefined;
    const position = stateSlot(owner, placed.map(node => ({ ...node, ...nodeDimensions(node) })), size, desired);
    placed.push({ ...state, ...size, ...position });
  }
  const bounds = nodeDimensions(owner);
  return { owner: { ...owner,
    width: Math.max(bounds.width, ...placed.map(state => state.x + state.width! + padding - owner.x)),
    height: Math.max(bounds.height, ...placed.map(state => state.y + state.height! + padding - owner.y)),
  }, states: placed };
}
