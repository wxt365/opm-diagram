import { describe, expect, it } from "vitest";
import { avoidBezierObstacles, bezierSegments, cubicPoint, curveObstacles, spreadAttachments, type Attachment, type Box, type Point } from "./bezier-geometry";

const right = { x: 1, y: 0 }, left = { x: -1, y: 0 };
const attachment = (point: Point, normal: Point): Attachment => ({ point, normal, offset: { x: 0, y: 0 } });

describe("Bezier geometry", () => {
  it("leaves/enters rectangular and elliptical borders with outward normals; distributes dense endpoints", () => {
    const box = { x: 20, y: 40, width: 200, height: 100 };
    const peers = Array.from({ length: 9 }, (_, i) => ({ key: `${i}`, toward: { x: 600, y: i * 80 } }));
    for (const ellipse of [false, true]) {
      const ports = [...spreadAttachments(box, "right", peers, ellipse).values()];
      expect(new Set(ports.map(p => p.point.y)).size).toBe(9);
      for (const port of ports) {
        if (ellipse) {
          expect((port.offset.x / 100) ** 2 + (port.offset.y / 50) ** 2).toBeCloseTo(1);
          expect(port.normal.y / port.normal.x).toBeCloseTo((port.offset.y / 2500) / (port.offset.x / 10000));
        } else { expect(port.point.x).toBe(220); expect(port.normal).toEqual(right); }
      }
    }
  });
  it.each([30, 180, 600, 2400])("distance %s has restrained curvature, exact endpoint tangent and C1 waypoint continuity", length => {
    const curves = bezierSegments({ x: 0, y: 0 }, { x: length, y: 0 }, right, left);
    expect(curves[0]!.c1.y).toBe(0); expect(curves.at(-1)!.c2.y).toBe(0);
    expect(curves[0]!.c1.x).toBeGreaterThan(0); expect(curves.at(-1)!.c2.x).toBeLessThan(length);
    expect(curves[0]!.c1.x).toBeLessThanOrEqual(180);
    const samples = curves.flatMap(c => Array.from({ length: 33 }, (_, i) => cubicPoint(c, i / 32)));
    expect(Math.max(...samples.map(p => Math.abs(p.y)))).toBeLessThanOrEqual(24);
    expect(Math.max(...samples.map(p => Math.abs(p.y)))).toBeGreaterThan(0);
    for (let i = 1; i < curves.length; i++) {
      const a = curves[i - 1]!, b = curves[i]!;
      expect(a.end).toEqual(b.start);
      expect({ x: a.end.x - a.c2.x, y: a.end.y - a.c2.y }).toEqual({ x: b.c1.x - b.start.x, y: b.c1.y - b.start.y });
    }
  });
  it("diagonal links produce S curves; reversed links keep target arrow tangent pointing into its boundary", () => {
    const a = { x: 500, y: 300 }, b = { x: 80, y: 50 };
    const [curve] = bezierSegments(a, b, left, right);
    expect(curve!.c1).toEqual({ x: 320, y: 300 });
    expect(curve!.c2).toEqual({ x: 260, y: 50 });
    expect(curve!.end.x - curve!.c2.x).toBeLessThan(0);
    expect(curve!.end.y - curve!.c2.y).toBe(0);
  });
  it("routes around intervening bodies without crossing endpoint text and leaves unobstructed paths unchanged", () => {
    const source = attachment({ x: 160, y: 36 }, right), target = attachment({ x: 600, y: 36 }, left);
    const boxes: Box[] = [{ x: 250, y: -10, width: 200, height: 110 }, { x: 1, y: 1, width: 158, height: 70 }, { x: 601, y: 1, width: 158, height: 70 }];
    const points = avoidBezierObstacles(source, target, [], boxes);
    expect(points.length).toBeGreaterThan(0);
    expect(curveObstacles(bezierSegments(source.point, target.point, right, left, points), boxes)).toEqual([]);
    expect(avoidBezierObstacles(source, target, [], [])).toEqual([]);
  });
  it("a thin node between samples still counts as an obstacle", () => {
    const curve = { start: { x: 0, y: 0 }, c1: { x: 1000, y: 0 }, c2: { x: 2000, y: 0 }, end: { x: 3000, y: 0 } };
    const box = { x: 777, y: -2, width: 1, height: 4 };
    expect(curveObstacles([curve], [box])).toEqual([box]);
  });
  it("ellipse boundary routing stays outside the process body while retaining its true normal", () => {
    const box = { x: 0, y: 0, width: 180, height: 100, ellipse: true };
    const port = spreadAttachments(box, "right", [{ key: "s", toward: { x: 500, y: 120 } }], true).get("s")!;
    const target = attachment({ x: 500, y: 120 }, left);
    const obstacles = [{ x: 230, y: 20, width: 180, height: 180 }, { ...box, x: 1, y: 1, width: 178, height: 98 }];
    const vertices = avoidBezierObstacles(port, target, [], obstacles);
    const curves = bezierSegments(port.point, target.point, port.normal, target.normal, vertices);
    expect(curveObstacles(curves, obstacles)).toEqual([]);
    const first = curves[0]!;
    expect((first.c1.x - first.start.x) / port.normal.x).toBeCloseTo((first.c1.y - first.start.y) / port.normal.y);
  });
});
