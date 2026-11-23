import { Graph } from "@antv/x6";
import { bezierSegments, type Point } from "./bezier-geometry";

export const BEZIER_CONNECTOR = "opm-bezier";
let registered = false;

export function registerBezierConnector() {
  if (registered) return;
  Graph.registerConnector(BEZIER_CONNECTOR, (source, target, vertices, options) => {
    const args = options as { sourceNormal?: Point; targetNormal?: Point };
    const dx = target.x - source.x, dy = target.y - source.y;
    const normal = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
    const segments = bezierSegments(source, target, args.sourceNormal ?? normal,
      args.targetNormal ?? { x: -normal.x, y: -normal.y }, vertices);
    return `M ${source.x} ${source.y}` + segments.map(c => ` C ${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.end.x} ${c.end.y}`).join("");
  }, true);
  registered = true;
}
