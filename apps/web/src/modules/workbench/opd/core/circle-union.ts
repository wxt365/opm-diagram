type Point = { x: number; y: number };
type Arc = { start: Point; end: Point; angle: number };
const turn = Math.PI * 2;

/** Exterior arcs of equal-radius disks, joined into closed union boundaries. */
export function circleUnionPath(points: readonly Point[], radius: number) {
  const centers = [...new Map(points.map(point => [`${point.x},${point.y}`, point])).values()];
  const arcs: Arc[] = [], paths: string[] = [];
  const at = (center: Point, angle: number) => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  const xy = (point: Point) => `${point.x},${point.y}`;
  for (const center of centers) {
    const covered: [number, number][] = [];
    for (const other of centers) {
      if (center === other) continue;
      const distance = Math.hypot(other.x - center.x, other.y - center.y);
      if (distance >= radius * 2) continue;
      const angle = (Math.atan2(other.y - center.y, other.x - center.x) + turn) % turn;
      const half = Math.acos(distance / (radius * 2));
      const start = angle - half, end = angle + half;
      if (start < 0) covered.push([start + turn, turn], [0, end]);
      else if (end > turn) covered.push([start, turn], [0, end - turn]);
      else covered.push([start, end]);
    }
    if (!covered.length) {
      paths.push(`M${center.x - radius},${center.y}a${radius},${radius} 0 1,0 ${radius * 2},0a${radius},${radius} 0 1,0 ${-radius * 2},0Z`);
      continue;
    }
    let cursor = 0;
    for (const [start, end] of covered.sort((a, b) => a[0] - b[0])) {
      if (start > cursor) arcs.push({ start: at(center, cursor), end: at(center, start), angle: start - cursor });
      cursor = Math.max(cursor, end);
    }
    if (cursor < turn) arcs.push({ start: at(center, cursor), end: at(center, turn), angle: turn - cursor });
  }
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 0.00001;
  while (arcs.length) {
    const first = arcs.pop()!;
    let arc = first, path = `M${xy(first.start)}`;
    for (;;) {
      path += `A${radius},${radius} 0 ${arc.angle > Math.PI ? 1 : 0},1 ${xy(arc.end)}`;
      if (near(arc.end, first.start)) break;
      const next = arcs.findIndex(candidate => near(candidate.start, arc.end));
      if (next < 0) break;
      arc = arcs.splice(next, 1)[0]!;
    }
    paths.push(`${path}Z`);
  }
  return paths.join("");
}
