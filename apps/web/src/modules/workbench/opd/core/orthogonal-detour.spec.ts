import { describe, expect, it } from "vitest";
import type { EdgeView } from "@antv/x6";
import type { Side } from "./bezier-geometry";
import { findOrthogonalDetour, orthogonalFallback } from "./orthogonal-detour";
import { clearOrthogonalPath } from "./relation-routing";

describe("Manhattan fallback body avoidance", () => {
  it.each<Side>(["top", "bottom", "left", "right"])("leaves an inset ellipse anchor along its %s port before avoiding bodies", side => {
    const source = { x: 0, y: 0, width: 120, height: 40 };
    const target = { x: 0, y: 400, width: 170, height: 90 };
    const sourceAnchor = { x: 100, y: 40 };
    const targetAnchor = { top: { x: 120, y: 404 }, bottom: { x: 120, y: 486 },
      left: { x: 4, y: 425 }, right: { x: 166, y: 425 } }[side];
    const obstacle = { x: 60, y: 130, width: 160, height: 140 };
    const view = { sourceAnchor, targetAnchor, cell: { getSourceCellId: () => "source", getTargetCellId: () => "target" },
      graph: { getNodes: () => [source, target, obstacle].map((box, i) => ({ id: ["source", "target", "obstacle"][i], isVisible: () => true, getBBox: () => box })) } } as unknown as EdgeView;
    const path = [sourceAnchor, ...orthogonalFallback([], { excludeNodes: [], startDirections: ["bottom"], endDirections: [side] }, view), targetAnchor];
    expect(clearOrthogonalPath(path, [obstacle], 16)).toBe(true);
    expect(clearOrthogonalPath(path, [], 0)).toBe(true);
    const before = path.at(-2)!;
    if (side === "top" || side === "bottom") {
      expect(before.x).toBe(targetAnchor.x);
      expect(side === "top" ? before.y < target.y : before.y > target.y + target.height).toBe(true);
    } else {
      expect(before.y).toBe(targetAnchor.y);
      expect(side === "left" ? before.x < target.x : before.x > target.x + target.width).toBe(true);
    }
    // The middle path also avoids the rectangular envelope of its own endpoints.
    expect(clearOrthogonalPath(path.slice(1, -1), [source, target], 0)).toBe(true);
  });
  it("keeps a very short owner-to-symbol connection direct", () => {
    const path = findOrthogonalDetour({ x: 240, y: 116 }, { x: 256, y: 116 }, [{ x: 81, y: 81, width: 158, height: 70 }]);
    expect(path).toEqual([{ x: 240, y: 116 }, { x: 256, y: 116 }]);
  });
  it("routes around alternating bodies when neither L-shaped path is free", () => {
    const obstacles = [{ x: 100, y: -50, width: 100, height: 200 }, { x: 300, y: 20, width: 100, height: 200 }];
    const path = findOrthogonalDetour({ x: 0, y: 0 }, { x: 500, y: 100 }, obstacles);
    expect(path[0]).toEqual({ x: 0, y: 0 }); expect(path.at(-1)).toEqual({ x: 500, y: 100 });
    expect(clearOrthogonalPath(path, obstacles, 0)).toBe(true);
  });
  it("重叠正文包住转折点时保留正交兜底，不穷举不可达网格", () => {
    let reads = 0;
    const obstacles = [{ get x() { reads++; return -10; }, y: -10, width: 30, height: 30 },
      ...Array.from({ length: 30 }, (_, i) => ({ x: 100 + i * 40, y: 50 + i * 30, width: 20, height: 20 }))];
    expect(findOrthogonalDetour({ x: 0, y: 0 }, { x: 1500, y: 1000 }, obstacles)).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 1500, y: 1000 },
    ]);
    expect(reads).toBeLessThan(100); // A covered start cannot reach any free grid point.
  });
});
