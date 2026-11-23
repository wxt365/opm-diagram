import type { Edge, EdgeView, Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import type { Box, Point } from "./bezier-geometry";
import { nodeDimensions } from "./node-geometry";

export type GeometryChange = { id: string; boxes: Box[] };

/** An async EdgeView exists before X6 has mounted and computed its path. */
export function edgeViewPoints(view: EdgeView | null | undefined): Point[] | undefined {
  if (!view?.isEdgeView() || !view.sourcePoint || !view.targetPoint || !Array.isArray(view.routePoints)) return;
  const points = [view.sourcePoint, ...view.routePoints, view.targetPoint];
  return points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ? points : undefined;
}

/** Compare consecutive previews, including a return to the original position. */
export function changedNodeGeometry(previous: ReadonlyMap<string, OpdNode>, nodes: readonly OpdNode[]): GeometryChange[] {
  const changes: GeometryChange[] = [];
  for (const node of nodes) {
    const old = previous.get(node.id), size = nodeDimensions(node), before = old && nodeDimensions(old);
    if (old && old.x === node.x && old.y === node.y && before!.width === size.width && before!.height === size.height) continue;
    changes.push({ id: node.id, boxes: [...(old ? [{ x: old.x, y: old.y, ...before! }] : []), { x: node.x, y: node.y, ...size }] });
  }
  return changes;
}

/** Node moves already invalidate adjacent X6 edges. Refresh only other paths
 * whose corridor intersects the previous or next body of a changed obstacle. */
export function edgeIntersectsChanges(graph: Graph | undefined, id: string, changes: readonly GeometryChange[], excludedIds: readonly string[] = []) {
  if (!changes.length) return false;
  const cell = graph?.getCellById(id);
  if (!cell || cell.isNode()) return false;
  const edge = cell as Edge;
  const router = edge.getRouter?.();
  const args = typeof router === "object" ? router.args as { excludeNodes?: unknown[] } : undefined;
  const excluded = new Set<string>([...excludedIds, ...(args?.excludeNodes ?? []),
    edge.getSourceCellId?.(), edge.getTargetCellId?.()].filter((id): id is string => typeof id === "string"));
  const boxes = changes.filter(change => !excluded.has(change.id)).flatMap(change => change.boxes);
  if (!boxes.length) return false;
  const view = graph?.findViewByCell?.(edge);
  const points = edgeViewPoints(view?.isEdgeView() ? view : undefined);
  if (!points) return false; // First mount will route it against the current graph.
  return points.slice(1).some((b, i) => {
    const a = points[i]!;
    return boxes.some(box => Math.max(a.x, b.x) > box.x - 16 && Math.min(a.x, b.x) < box.x + box.width + 16
      && Math.max(a.y, b.y) > box.y - 16 && Math.min(a.y, b.y) < box.y + box.height + 16);
  });
}
