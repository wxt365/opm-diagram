import type { Box, Point, Side } from "./bezier-geometry";
import { simplifyOrthogonalPoints } from "./orthogonal-detour";

export interface OrthogonalLane {
  id: string; source: Box; target: Box; start: Point; end: Point; startSide: Side; endSide: Side; obstacles: readonly Box[];
}

type Segment = { a: Point; b: Point; horizontal: boolean };
function segments(points: readonly Point[]): Segment[] {
  return points.slice(1).flatMap((b, i) => {
    const a = points[i]!;
    return a.x === b.x || a.y === b.y ? [{ a, b, horizontal: a.y === b.y }] : [];
  });
}
function blocked(points: readonly Point[], obstacles: readonly Box[], padding: number) {
  return segments(points).some(({ a, b }) => obstacles.some(box => Math.max(a.x, b.x) > box.x - padding
    && Math.min(a.x, b.x) < box.x + box.width + padding && Math.max(a.y, b.y) > box.y - padding
    && Math.min(a.y, b.y) < box.y + box.height + padding));
}
function departure(point: Point, box: Box, side: Side): Point {
  return side === "left" ? { x: box.x - 24, y: point.y } : side === "right" ? { x: box.x + box.width + 24, y: point.y }
    : side === "top" ? { x: point.x, y: box.y - 24 } : { x: point.x, y: box.y + box.height + 24 };
}
function outward(a: Point, b: Point, side: Side) {
  return side === "left" ? a.y === b.y && b.x < a.x : side === "right" ? a.y === b.y && b.x > a.x
    : side === "top" ? a.x === b.x && b.y < a.y : a.x === b.x && b.y > a.y;
}
function congestion(path: readonly Segment[], occupied: readonly Segment[]) {
  let score = 0;
  for (const current of path) for (const previous of occupied) {
    if (current.horizontal === previous.horizontal) {
      const distance = Math.abs(current.horizontal ? current.a.y - previous.a.y : current.a.x - previous.a.x);
      if (distance >= 14) continue;
      const axis = current.horizontal ? "x" : "y";
      const overlap = Math.min(Math.max(current.a[axis], current.b[axis]), Math.max(previous.a[axis], previous.b[axis]))
        - Math.max(Math.min(current.a[axis], current.b[axis]), Math.min(previous.a[axis], previous.b[axis]));
      score += Math.max(0, overlap) * (distance < 1 ? 10 : 3);
    } else {
      const h = current.horizontal ? current : previous, v = current.horizontal ? previous : current;
      if (v.a.x > Math.min(h.a.x, h.b.x) && v.a.x < Math.max(h.a.x, h.b.x)
        && h.a.y > Math.min(v.a.y, v.b.y) && h.a.y < Math.max(v.a.y, v.b.y)) score += 100;
    }
  }
  return score;
}

/** Reserve clear tracks in stable identity order; complex fans and manual paths remain owned by their existing routers. */
export function orthogonalLanes(inputs: readonly OrthogonalLane[], reservedPaths: readonly (readonly Point[])[] = []) {
  const result = new Map<string, Point[]>(), occupied: Segment[] = reservedPaths.flatMap(segments);
  for (const input of [...inputs].sort((a, b) => a.id.localeCompare(b.id))) {
    const { source, target, start, end, obstacles } = input;
    const first = departure(start, source, input.startSide), last = departure(end, target, input.endSide);
    // A clear straight segment has the minimum length and no bend/congestion
    // penalty. Avoid enumerating and scoring detours across the entire graph.
    const direct = simplifyOrthogonalPoints([start, first, last, end]);
    if ((start.x === end.x || start.y === end.y) && direct.length === 2
      && outward(start, end, input.startSide) && outward(end, start, input.endSide)
      && !blocked(direct, obstacles, 16) && !congestion(segments(direct), occupied)) {
      occupied.push(...segments(direct)); result.set(input.id, []); continue;
    }
    const middle = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    const nearby = [...obstacles].sort((a, b) => Math.abs(a.x + a.width / 2 - middle.x) + Math.abs(a.y + a.height / 2 - middle.y)
      - Math.abs(b.x + b.width / 2 - middle.x) - Math.abs(b.y + b.height / 2 - middle.y)).slice(0, 12);
    const xs = [...new Set([first.x, last.x, ...[0, 20, -20, 40, -40, 60, -60].map(delta => middle.x + delta),
      Math.min(source.x, target.x) - 40, Math.max(source.x + source.width, target.x + target.width) + 40,
      ...nearby.flatMap(box => [box.x - 24, box.x + box.width + 24])])];
    const ys = [...new Set([first.y, last.y, ...[0, 20, -20, 40, -40, 60, -60].map(delta => middle.y + delta),
      Math.min(source.y, target.y) - 40, Math.max(source.y + source.height, target.y + target.height) + 40,
      ...nearby.flatMap(box => [box.y - 24, box.y + box.height + 24])])];
    const candidates = [
      ...xs.map(x => [start, first, { x, y: first.y }, { x, y: last.y }, last, end]),
      ...ys.map(y => [start, first, { x: first.x, y }, { x: last.x, y }, last, end]),
    ];
    let best: { points: Point[]; score: number } | undefined;
    for (const candidate of candidates) {
      const points = simplifyOrthogonalPoints(candidate);
      if (points.length < 2 || !outward(start, points[1]!, input.startSide) || !outward(end, points.at(-2)!, input.endSide)
        || blocked(points, obstacles, 16) || blocked(points.slice(1, -1), [source, target], 0)) continue;
      const parts = segments(points);
      const length = parts.reduce((sum, { a, b }) => sum + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0);
      const score = length + (parts.length - 1) * 24 + congestion(parts, occupied);
      if (!best || score < best.score) best = { points, score };
    }
    if (!best) continue; // Manhattan and the existing obstacle fallback handle constrained routes.
    occupied.push(...segments(best.points)); result.set(input.id, best.points.slice(1, -1));
  }
  return result;
}
