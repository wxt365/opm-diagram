import type { OpdNode } from "@/shared/types/modeling";

export function nodeDimensions(node: OpdNode) {
  const feature = node.kind === "attribute" || node.kind === "operation";
  return {
    width: node.width ?? (node.kind === "process" ? 168 : node.kind === "state" ? 88 : feature ? 132 : 160),
    height: node.height ?? (node.kind === "process" ? 84 : node.kind === "state" ? 28 : feature ? 44 : 72),
  };
}

export function constrainStatePosition(node: OpdNode, nodes: readonly OpdNode[], position: { x: number; y: number }) {
  if (node.kind !== "state") return position;
  const owner = nodes.find((item) => item.id === node.ownerId);
  if (!owner) return { x: node.x, y: node.y };
  const box = nodeDimensions(owner), size = nodeDimensions(node);
  return {
    x: Math.max(owner.x + 8, Math.min(position.x, owner.x + box.width - size.width - 8)),
    y: Math.max(owner.y + 28, Math.min(position.y, owner.y + box.height - size.height - 8)),
  };
}
