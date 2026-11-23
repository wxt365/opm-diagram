/** Pure geometry shared by routing, the X6 connector and geometry regression tests. */
export interface Point { readonly x: number; readonly y: number }
export interface Box extends Point { readonly width: number; readonly height: number; readonly ellipse?: boolean }
export type Side = "left" | "right" | "top" | "bottom";
export interface Attachment { readonly point: Point; readonly normal: Point; readonly offset: Point }
export interface Cubic { readonly start: Point; readonly c1: Point; readonly c2: Point; readonly end: Point }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (x: number, y: number): Point => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; };
export const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

export function facingSide(box: Box, toward: Point): Side {
  const c = center(box), dx = toward.x - c.x, dy = toward.y - c.y;
  return Math.abs(dx) / (box.width / 2 + 48) >= Math.abs(dy) / (box.height / 2 + 48)
    ? dx >= 0 ? "right" : "left" : dy >= 0 ? "bottom" : "top";
}

/** All links on a side share one stable ordering, including incoming and outgoing links. */
export function spreadAttachments(box: Box, side: Side, peers: readonly { key: string; toward: Point }[], ellipse = false) {
  const vertical = side === "left" || side === "right", c = center(box);
  const size = vertical ? box.height : box.width, origin = vertical ? c.y : c.x;
  const sorted = [...peers].sort((a, b) => (vertical ? a.toward.y - b.toward.y : a.toward.x - b.toward.x) || a.key.localeCompare(b.key));
  const span = Math.max(0, Math.min(size * 0.62, size - 20));
  const step = sorted.length > 1 ? Math.min(16, span / (sorted.length - 1)) : 0;
  const preferred = sorted.reduce((sum, peer) => sum + clamp((vertical ? peer.toward.y : peer.toward.x) - origin, -span / 2, span / 2), 0) / Math.max(1, sorted.length);
  const half = step * (sorted.length - 1) / 2, base = clamp(preferred, -span / 2 + half, span / 2 - half);
  return new Map(sorted.map((peer, index) => {
    const offset = base + index * step - half, rx = box.width / 2, ry = box.height / 2;
    let dx = vertical ? (side === "left" ? -rx : rx) : offset;
    let dy = vertical ? offset : (side === "top" ? -ry : ry);
    if (ellipse) {
      if (vertical) dx *= Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2));
      else dy *= Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
    }
    const normal = ellipse ? unit(dx / (rx * rx), dy / (ry * ry)) : vertical ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    return [peer.key, { point: { x: c.x + dx, y: c.y + dy }, normal, offset: { x: dx, y: dy } }] as const;
  }));
}

/** Cubic Hermite segments: continuous tangent at waypoints, exact endpoint normals. */
export function bezierSegments(source: Point, target: Point, sourceNormal: Point, targetNormal: Point, vertices: readonly Point[] = []): Cubic[] {
  const length = distance(source, target), waypoints = [...vertices];
  if (!waypoints.length && length > 1) {
    const dx = target.x - source.x, dy = target.y - source.y;
    // An otherwise collinear pair gets a small C-shaped bow with flat endpoint tangents.
    if (Math.min(Math.abs(dx), Math.abs(dy)) < Math.min(16, length * 0.06)
      && (sourceNormal.x * dx + sourceNormal.y * dy) / length > 0.8
      && (targetNormal.x * dx + targetNormal.y * dy) / length < -0.8) {
      const bow = clamp(length * 0.035, 3, 24);
      waypoints.push({ x: (source.x + target.x) / 2 + (Math.abs(dy) > Math.abs(dx) ? bow : 0),
        y: (source.y + target.y) / 2 + (Math.abs(dx) >= Math.abs(dy) ? bow : 0) });
    }
  }
  let points = [source, ...waypoints, target].filter((point, index, all) => !index || distance(point, all[index - 1]!) > 0.01);
  let tangents: Point[];
  if (waypoints.length > 1) {
    // Round detour corners inside their free corridor. A through-points spline can overshoot
    // a vertical segment sideways into a node even when every waypoint is outside it.
    const rounded = [source], directions = [sourceNormal];
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i]!, before = points[i - 1]!, after = points[i + 1]!;
      const incoming = unit(point.x - before.x, point.y - before.y), outgoing = unit(after.x - point.x, after.y - point.y);
      const radius = Math.min(36, distance(before, point) * 0.25, distance(point, after) * 0.25);
      rounded.push({ x: point.x - incoming.x * radius, y: point.y - incoming.y * radius },
        { x: point.x + outgoing.x * radius, y: point.y + outgoing.y * radius });
      directions.push(incoming, outgoing);
    }
    rounded.push(target); directions.push({ x: -targetNormal.x, y: -targetNormal.y });
    points = rounded; tangents = directions;
  } else tangents = points.map((_, index) => !index ? sourceNormal : index === points.length - 1
    ? { x: -targetNormal.x, y: -targetNormal.y }
    : unit(points[index + 1]!.x - points[index - 1]!.x, points[index + 1]!.y - points[index - 1]!.y));
  return points.slice(1).map((end, index) => {
    const start = points[index]!, span = distance(start, end);
    const a = Math.min(180, span * 0.42, index ? distance(points[index - 1]!, start) * 0.42 : Infinity);
    const b = Math.min(180, span * 0.42, index + 2 < points.length ? distance(end, points[index + 2]!) * 0.42 : Infinity);
    return { start, c1: { x: start.x + tangents[index]!.x * a, y: start.y + tangents[index]!.y * a },
      c2: { x: end.x - tangents[index + 1]!.x * b, y: end.y - tangents[index + 1]!.y * b }, end };
  });
}

export function cubicPoint(curve: Cubic, t: number): Point {
  const u = 1 - t, a = u ** 3, b = 3 * u * u * t, c = 3 * u * t * t, d = t ** 3;
  return { x: a * curve.start.x + b * curve.c1.x + c * curve.c2.x + d * curve.end.x,
    y: a * curve.start.y + b * curve.c1.y + c * curve.c2.y + d * curve.end.y };
}

export function curveObstacles(curves: readonly Cubic[], obstacles: readonly Box[]): Box[] {
  const hits = new Set<Box>();
  for (const curve of curves) {
    const controls = [curve.start, curve.c1, curve.c2, curve.end];
    const left = Math.min(...controls.map(p => p.x)), right = Math.max(...controls.map(p => p.x));
    const top = Math.min(...controls.map(p => p.y)), bottom = Math.max(...controls.map(p => p.y));
    const candidates = obstacles.filter(box => box.x < right && box.x + box.width > left && box.y < bottom && box.y + box.height > top);
    if (!candidates.length) continue;
    const steps = Math.max(24, Math.min(128, Math.ceil((distance(curve.start, curve.c1) + distance(curve.c1, curve.c2) + distance(curve.c2, curve.end)) / 6)));
    let previous = curve.start;
    for (let i = 1; i <= steps; i++) {
      const point = cubicPoint(curve, i / steps);
      for (const box of candidates) if (!hits.has(box) && segmentIntersectsBox(previous, point, box)) hits.add(box);
      previous = point;
    }
  }
  return [...hits];
}

function segmentIntersectsBox(a: Point, b: Point, box: Box) {
  if (box.ellipse) {
    const rx = box.width / 2, ry = box.height / 2;
    const x = (a.x - box.x - rx) / rx, y = (a.y - box.y - ry) / ry;
    const dx = (b.x - a.x) / rx, dy = (b.y - a.y) / ry;
    const t = clamp(-(x * dx + y * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return (x + dx * t) ** 2 + (y + dy * t) ** 2 < 1;
  }
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, box.x, box.x + box.width], [a.y, b.y - a.y, box.y, box.y + box.height]]) {
    if (Math.abs(delta!) < 1e-9) { if (start! <= min! || start! >= max!) return false; continue; }
    const first = (min! - start!) / delta!, last = (max! - start!) / delta!;
    low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
    if (low >= high) return false;
  }
  return true;
}

/** Route around the actual curved path's obstacles, keeping every junction tangent-continuous. */
export function avoidBezierObstacles(source: Attachment, target: Attachment, initial: readonly Point[], obstacles: readonly Box[], laneOffset = 0): readonly Point[] {
  const curves = (points: readonly Point[]) => bezierSegments(source.point, target.point, source.normal, target.normal, points);
  let points = initial, hits = curveObstacles(curves(points), obstacles);
  if (!hits.length) return points;
  const blocked = new Set(hits);
  const lead = clamp(distance(source.point, target.point) * 0.12, 24, 64);
  const departure = (attachment: Attachment) => {
    // Shorten the straight departure when an adjacent body leaves only a narrow gap.
    let clearance = lead;
    for (const box of obstacles) {
      let near = 0, far = Infinity;
      for (const [position, normal, min, max] of [[attachment.point.x, attachment.normal.x, box.x, box.x + box.width], [attachment.point.y, attachment.normal.y, box.y, box.y + box.height]]) {
        if (Math.abs(normal!) < 1e-9) { if (position! <= min! || position! >= max!) { far = -1; break; } continue; }
        const a = (min! - position!) / normal!, b = (max! - position!) / normal!;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
      if (far > near && near >= 0) clearance = Math.min(clearance, Math.max(1, near * 0.3));
    }
    return { x: attachment.point.x + attachment.normal.x * clearance, y: attachment.point.y + attachment.normal.y * clearance };
  };
  const s = departure(source), t = departure(target);
  for (let iteration = 0; iteration < 3; iteration++) {
    const boxes = [...blocked], margin = 40 + laneOffset + iteration * 16;
    const left = Math.min(...boxes.map(b => b.x)) - margin, right = Math.max(...boxes.map(b => b.x + b.width)) + margin;
    const top = Math.min(...boxes.map(b => b.y)) - margin, bottom = Math.max(...boxes.map(b => b.y + b.height)) + margin;
    const candidates = [
      [s, { x: s.x, y: top }, { x: t.x, y: top }, t], [s, { x: s.x, y: bottom }, { x: t.x, y: bottom }, t],
      [s, { x: left, y: s.y }, { x: left, y: t.y }, t], [s, { x: right, y: s.y }, { x: right, y: t.y }, t],
    ].map(route => {
      const unique = route.filter((p, index) => !index || distance(p, route[index - 1]!) > 1);
      const collisions = curveObstacles(curves(unique), obstacles);
      const all = [source.point, ...unique, target.point];
      return { points: unique, hits: collisions, length: all.slice(1).reduce((sum, p, i) => sum + distance(p, all[i]!), 0) };
    }).sort((a, b) => a.hits.length - b.hits.length || a.length - b.length);
    const best = candidates[0]!;
    if (!best.hits.length) return best.points;
    points = best.points; hits = best.hits;
    hits.forEach(box => blocked.add(box));
  }
  return points;
}
