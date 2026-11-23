import type { Graph } from "@antv/x6";
import type { Box, Point } from "./bezier-geometry";
import { edgeViewPoints } from "./routing-invalidation";

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Prefer an open, long segment near the semantic label's original position. */
export function placeOrthogonalLabel(points: readonly Point[], width: number, height: number, desired: number, obstacles: readonly Box[], otherPaths: readonly (readonly Point[])[] = []) {
  const lengths = points.slice(1).map((b, i) => Math.hypot(b.x - points[i]!.x, b.y - points[i]!.y));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const preferred = desired >= 0 && desired <= 1 ? desired * total : desired < 0 ? total + desired : desired;
  const candidates: { distance: number; offset: Point; box: Box; score: number }[] = [];
  const lines = otherPaths.flatMap(path => path.slice(1).map((b, i) => ({
    x: Math.min(path[i]!.x, b.x) - 3, y: Math.min(path[i]!.y, b.y) - 3,
    width: Math.abs(b.x - path[i]!.x) + 6, height: Math.abs(b.y - path[i]!.y) + 6,
  })));
  let traveled = 0;
  lengths.forEach((length, i) => {
    const a = points[i]!, b = points[i + 1]!, horizontal = Math.abs(a.y - b.y) < 0.5;
    for (const ratio of [0.5, 0.25, 0.75, 0.125, 0.875]) for (const clearance of [5, 13, 23]) for (const sign of [-1, 1]) {
      const center = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
      const offset = horizontal ? { x: 0, y: sign * (height / 2 + clearance) } : { x: sign * (width / 2 + clearance), y: 0 };
      const box = { x: center.x + offset.x - width / 2, y: center.y + offset.y - height / 2, width, height };
      const distance = traveled + length * ratio;
      const collisions = obstacles.filter(other => intersects(box, other)).length;
      candidates.push({ distance: distance / total, offset, box,
        score: collisions * 1e6 + lines.filter(line => intersects(box, line)).length * 8e5
          + Math.max(0, (horizontal ? width : height) + 16 - length) * 100 + Math.abs(distance - preferred)
          + clearance * 2 + (horizontal ? 0 : 24) });
    }
    traveled += length;
  });
  return candidates.sort((a, b) => a.score - b.score)[0];
}

/** Runs after X6 has routed edges; no network calls or semantic model writes. */
export function layoutRelationLabels(graph: Graph | undefined) {
  if (!graph?.getEdges || !graph.getNodes) return;
  const obstacles: Box[] = graph.getNodes().map(node => node.getBBox());
  const edges = [...graph.getEdges()].sort((a, b) => a.id.localeCompare(b.id));
  const paths = new Map(edges.map(edge => {
    const view = graph.findViewByCell(edge);
    return [edge.id, edgeViewPoints(view?.isEdgeView() ? view : undefined)] as const;
  }));
  for (const edge of edges) {
    const labels = edge.getLabels();
    if (!labels.length) continue;
    const points = paths.get(edge.id);
    if (!points) continue;
    const desired: number[] = JSON.parse(edge.getData()?.routeLabelDistances ?? "[]");
    const next = labels.map((label, index) => {
      const text = String(label.attrs?.label?.text ?? ""), font = Number(label.attrs?.label?.fontSize ?? 11);
      const width = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? font : font * 0.62), 8);
      const otherPaths = [...paths].flatMap(([id, path]) => id !== edge.id && path ? [path] : []);
      const placed = placeOrthogonalLabel(points, width, font + 6, desired[index] ?? 0.5, obstacles, otherPaths);
      if (!placed) return label;
      obstacles.push(placed.box);
      return { ...label, position: { distance: placed.distance, offset: placed.offset, options: { absoluteOffset: true, keepGradient: false } } };
    });
    if (JSON.stringify(labels) !== JSON.stringify(next)) edge.setLabels(next);
  }
}
