import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "./node-geometry";

export function featureJunctionSegment(owner: OpdNode) {
  return `feature.${owner.kind === "object" ? "characterization" : "composition"}.junction`;
}

export function featureJunctionCellId(owner: OpdNode) {
  return `feature.owner-group.${owner.id}.${owner.kind === "object" ? "characterization" : "composition"}.junction`;
}

export function featureJunctionPoint(owner: OpdNode) {
  const saved = owner.edgeRoutes?.find(route => route.segment === featureJunctionSegment(owner));
  if (saved?.mode === "MANUAL" && saved.points.length === 1) return saved.points[0]!;
  const size = nodeDimensions(owner);
  return { x: owner.x + size.width + 28, y: owner.y + size.height / 2 };
}
