import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "./node-geometry";

/** Fit an ellipse around the content rectangle, not merely around its bounding box. */
export function fitRefinementEnvelope(nodes: readonly OpdNode[], refineeId?: string): OpdNode[] {
  const parent = nodes.find(node => node.id === refineeId);
  const children = nodes.filter(node => node.id !== refineeId);
  if (!parent || !children.length) return [...nodes];
  const boxes = children.map(node => ({ x: node.x - 40, y: node.y - 72,
    width: nodeDimensions(node).width + 80, height: nodeDimensions(node).height + 112 }));
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  let width = right - left, height = bottom - top;
  if (parent.kind === "process") {
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    let best = { width: width * Math.SQRT2, height: height * Math.SQRT2 };
    // Fit actual occupied corners instead of a mostly empty bounding rectangle.
    for (let step = 1; step <= 32; step++) {
      const a = width / 2 * (1 + step / 32);
      let b = height / 2;
      for (const box of boxes) for (const px of [box.x, box.x + box.width]) for (const py of [box.y, box.y + box.height])
        b = Math.max(b, Math.abs(py - cy) / Math.sqrt(Math.max(1e-9, 1 - ((px - cx) / a) ** 2)));
      if (a * b * 4 < best.width * best.height) best = { width: a * 2, height: b * 2 };
    }
    ({ width, height } = best);
  }
  const x = (left + right - width) / 2, y = (top + bottom - height) / 2;
  return nodes.map(node => node.id === refineeId ? { ...node, x, y, width, height } : node);
}
