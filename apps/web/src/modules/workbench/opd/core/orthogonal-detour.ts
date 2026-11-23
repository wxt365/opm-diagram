import { simplifyOrthogonalPoints } from "@/shared/canvas/orthogonal";
export { simplifyOrthogonalPoints } from "@/shared/canvas/orthogonal";
import type { EdgeView } from "@antv/x6";
import { facingSide, type Box, type Point, type Side } from "./bezier-geometry";

/** X6's default fallback is non-avoiding `orth`. Use a visibility grid of body
 * margins instead, only when Manhattan cannot route a constrained/short leg. */
export function findOrthogonalDetour(start: Point, end: Point, obstacles: readonly Box[]): Point[] {
  const blocked = (a: Point, b: Point) => obstacles.some(box => Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width
    && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height);
  if ((start.x === end.x || start.y === end.y) && !blocked(start, end)) return [start, end];
  for (const bend of [{ x: start.x, y: end.y }, { x: end.x, y: start.y }]) {
    if (!blocked(start, bend) && !blocked(bend, end)) return [start, bend, end];
  }
  // Overlapping bodies/padded margins can completely cover an endpoint or a
  // saved waypoint. No visibility-grid search can leave such a point; retain
  // the same orthogonal fallback without exhausting 30,000 unreachable states.
  if ([start, end].some(point => obstacles.some(box => point.x > box.x && point.x < box.x + box.width
    && point.y > box.y && point.y < box.y + box.height))) return [start, { x: start.x, y: end.y }, end];
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(box => [box.x - 1, box.x + box.width + 1])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(box => [box.y - 1, box.y + box.height + 1])])].sort((a, b) => a - b);
  type Entry = { x: number; y: number; axis: number; cost: number; score: number; key: string; parent?: Entry };
  const heap: Entry[] = [], costs = new Map<string, number>();
  function push(entry: Entry) {
    let i = heap.length; heap.push(entry);
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p]!.score <= entry.score) break; heap[i] = heap[p]!; i = p; }
    heap[i] = entry;
  }
  function pop() {
    const first = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child++;
        if (last.score <= heap[child]!.score) break;
        heap[i] = heap[child]!; i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  const first = { x: xs.indexOf(start.x), y: ys.indexOf(start.y), axis: -1, cost: 0, score: 0, key: "start" };
  push(first); costs.set(first.key, 0);
  let visits = 0;
  while (heap.length && visits++ < 30000) {
    const current = pop(); if (current.cost !== costs.get(current.key)) continue;
    const a = { x: xs[current.x]!, y: ys[current.y]! };
    if (a.x === end.x && a.y === end.y) {
      const points: Point[] = []; let entry: Entry | undefined = current;
      while (entry) { points.unshift({ x: xs[entry.x]!, y: ys[entry.y]! }); entry = entry.parent; }
      return simplifyOrthogonalPoints(points);
    }
    for (const [dx, dy, axis] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const x = current.x + dx!, y = current.y + dy!;
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
      const b = { x: xs[x]!, y: ys[y]! }; if (blocked(a, b)) continue;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (current.axis >= 0 && current.axis !== axis ? 12 : 0);
      const key = `${x}:${y}:${axis}`;
      if ((costs.get(key) ?? Infinity) <= cost) continue;
      costs.set(key, cost); push({ x, y, axis: axis!, key, cost, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y), parent: current });
    }
  }
  // Overlapping endpoint bodies can leave no free route at all; remain orthogonal.
  return [start, { x: start.x, y: end.y }, end];
}


export function orthogonalFallback(vertices: Point[], options: { excludeNodes: string[]; startDirections?: Side[]; endDirections?: Side[] }, view: EdgeView) {
  const sourceId = view.cell.getSourceCellId(), targetId = view.cell.getTargetCellId();
  const ends = new Set([sourceId, targetId]);
  const excluded = new Set(options.excludeNodes);
  const nodes = view.graph.getNodes().filter(node => node.isVisible());
  const obstacles = nodes.filter(node => !excluded.has(node.id) || ends.has(node.id)).map(node => {
    const box = node.getBBox(), padding = ends.has(node.id) ? -1 : 16;
    return { x: box.x - padding, y: box.y - padding, width: box.width + 2 * padding, height: box.height + 2 * padding };
  });
  const departure = (id: string, anchor: Point, toward: Point, directions?: Side[]) => {
    const box = nodes.find(node => node.id === id)?.getBBox();
    if (!box) return anchor;
    const side = directions?.length === 1 ? directions[0]! : facingSide(box, toward);
    // A distributed ellipse port is inside its rectangular envelope. First
    // leave that envelope along the port direction, then search free space.
    return side === "left" ? { x: Math.min(anchor.x, box.x - 1), y: anchor.y }
      : side === "right" ? { x: Math.max(anchor.x, box.x + box.width + 1), y: anchor.y }
      : side === "top" ? { x: anchor.x, y: Math.min(anchor.y, box.y - 1) }
      : { x: anchor.x, y: Math.max(anchor.y, box.y + box.height + 1) };
  };
  const source = departure(sourceId, view.sourceAnchor, vertices[0] ?? view.targetAnchor, options.startDirections);
  const target = departure(targetId, view.targetAnchor, vertices.at(-1) ?? view.sourceAnchor, options.endDirections);
  const points = [source, ...vertices, target];
  const detour = points.slice(1).flatMap((end, i) => findOrthogonalDetour(points[i]!, end, obstacles));
  return simplifyOrthogonalPoints([view.sourceAnchor, ...detour, view.targetAnchor]).slice(1, -1);
}
