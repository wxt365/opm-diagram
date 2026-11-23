import type { OpdNode } from "@/shared/types/modeling";

export function nodeDimensions(node: OpdNode) {
  const feature = node.kind === "attribute" || node.kind === "operation";
  return {
    width: node.width ?? (node.kind === "process" ? 168 : node.kind === "state" ? 88 : feature ? 132 : 160),
    height: node.height ?? (node.kind === "process" ? 84 : node.kind === "state" ? 28 : feature ? 44 : 72),
  };
}

/** Same label metrics for layout and SVG wrapping; geometry is persisted, never changed by zoom. */
export function readableNodeDimensions(node: OpdNode) {
  const current = nodeDimensions(node);
  if (node.kind === "state") return current;
  const lines = node.label.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").split(/\r?\n/)
    .map(line => [...line].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 13 : 8), 0));
  const width = Math.max(current.width, Math.min(300, Math.max(0, ...lines) + 32));
  const rows = lines.reduce((sum, length) => sum + Math.max(1, Math.ceil(length / Math.max(1, width - 32))), 0);
  return { width, height: Math.max(current.height, rows * 18 + 34) };
}

/** Reserve a complete multiline title above contained states. */
export function stateContainerTitleHeight(node: OpdNode) {
  const width = Math.max(1, nodeDimensions(node).width - 32);
  const rows = node.label.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].reduce((length, char) => length + (char.charCodeAt(0) > 255 ? 13 : 8), 0) / width)), 0);
  return Math.max(28, rows * 18 + 10);
}

export function constrainStatePosition(node: OpdNode, nodes: readonly OpdNode[], position: { x: number; y: number }) {
  if (node.kind !== "state") return position;
  const owner = nodes.find((item) => item.id === node.ownerId);
  if (!owner) return { x: node.x, y: node.y };
  const box = nodeDimensions(owner), size = nodeDimensions(node);
  return {
    x: Math.max(owner.x + 8, Math.min(position.x, owner.x + box.width - size.width - 8)),
    y: Math.max(owner.y + stateContainerTitleHeight(owner), Math.min(position.y, owner.y + box.height - size.height - 8)),
  };
}
